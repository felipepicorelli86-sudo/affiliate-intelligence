/**
 * PUBLIC DATA MODULE — Affiliate Hub
 * ════════════════════════════════════
 * Coleta dados públicos de:
 *   1. OfferVault   — agrega 200+ redes (Maxweb, Gurumedia, etc.)
 *   2. Clickbank    — top products por Gravity Score
 *   3. Google Trends — tendências por nicho e país
 *
 * Sem login. Sem API key. Dados reais e atualizados.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

// Cache de 2 horas — dados públicos não mudam tão rápido
const cache = new NodeCache({ stdTTL: 7200 });

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ══════════════════════════════════════════════════════════════
// 1. OFFERVAULT — Agrega ofertas de 200+ redes afiliadas
//    Mostra: nome, rede, payout, GEOs, categoria, tipo
// ══════════════════════════════════════════════════════════════
async function getOfferVaultOffers(keyword = 'health', pages = 3) {
  const cacheKey = `offervault_${keyword}_${pages}`;
  if (cache.has(cacheKey)) {
    console.log(`[OfferVault] Cache hit: ${keyword}`);
    return cache.get(cacheKey);
  }

  const allOffers = [];
  const CATEGORIES = ['health', 'weight loss', 'dental', 'blood sugar', 'hearing', 'joint', 'skin', 'diabetes'];
  const keywords = keyword === 'all' ? CATEGORIES : [keyword];

  for (const kw of keywords) {
    for (let pg = 1; pg <= pages; pg++) {
      try {
        const url = `https://www.offervault.com/offers/search/index/?keyword=${encodeURIComponent(kw)}&sf=PAID&sb=desc&pg=${pg}&display=25`;
        const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(res.data);

        $('.offer-result-row, .search-result, tr.offer').each((_, el) => {
          const row = $(el);
          const name    = row.find('.offer-name, .name, td:nth-child(2)').first().text().trim();
          const network = row.find('.network-name, .network, td:nth-child(4)').first().text().trim();
          const payout  = row.find('.payout, .commission, td:nth-child(3)').first().text().trim();
          const geos    = row.find('.geo, .countries, td:nth-child(5)').first().text().trim();
          const type    = row.find('.payout-type, .type, td:nth-child(6)').first().text().trim();
          const link    = row.find('a').first().attr('href') || '';

          if (name && name.length > 2) {
            allOffers.push({
              name,
              network: network || 'N/A',
              payout: payout || 'N/A',
              geos: geos || 'US,CA,GB,AU',
              type: type || 'CPS',
              category: kw,
              link: link ? `https://www.offervault.com${link}` : '',
            });
          }
        });

        // Delay entre requests para não sobrecarregar
        await new Promise(r => setTimeout(r, 600));
      } catch (err) {
        console.warn(`[OfferVault] Erro na página ${pg} para "${kw}": ${err.message}`);
      }
    }
  }

  // Deduplica por nome
  const unique = [...new Map(allOffers.map(o => [o.name.toLowerCase(), o])).values()];
  const result = { offers: unique, total: unique.length, updatedAt: new Date().toISOString() };
  cache.set(cacheKey, result);
  return result;
}

// ══════════════════════════════════════════════════════════════
// 2. CLICKBANK TOP PRODUCTS — via CBEngine (agregador público)
//    Mostra: produto, vendedor, gravity, comissão, categoria
// ══════════════════════════════════════════════════════════════
async function getClickbankTopProducts(category = 'health', limit = 30) {
  const cacheKey = `cb_top_${category}_${limit}`;
  if (cache.has(cacheKey)) {
    console.log(`[Clickbank] Cache hit: ${category}`);
    return cache.get(cacheKey);
  }

  const products = [];

  try {
    // CBEngine — agrega dados públicos do Clickbank marketplace com gravity
    const url = `https://www.cbengine.com/tracker/cbengine-category.php?cat=${encodeURIComponent(category)}&orderby=gravity&orderdir=DESC`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 12000 });
    const $ = cheerio.load(res.data);

    $('table.result-table tr, .product-row, tr').each((_, el) => {
      const row = $(el);
      const name     = row.find('.product-title, .title, td:nth-child(1) a').first().text().trim();
      const vendor   = row.find('.vendor, td:nth-child(2)').first().text().trim();
      const gravity  = parseFloat(row.find('.gravity, td:nth-child(3)').first().text().replace(/[^\d.]/g, '')) || 0;
      const initComm = row.find('.init-commission, td:nth-child(4)').first().text().trim();
      const avgComm  = row.find('.avg-commission, td:nth-child(5)').first().text().trim();

      if (name && gravity > 0) {
        products.push({ name, vendor: vendor || 'N/A', gravity, initComm, avgComm, category });
      }
    });
  } catch (err) {
    console.warn(`[Clickbank/CBEngine] Erro: ${err.message}`);
  }

  // Fallback: tenta diretamente o Clickbank marketplace via RSS
  if (products.length === 0) {
    try {
      const rssUrl = `https://www.clickbank.com/rss/marketplace.xml`;
      const res = await axios.get(rssUrl, { headers: HEADERS, timeout: 10000 });
      const $ = cheerio.load(res.data, { xmlMode: true });

      $('item').each((_, el) => {
        const item = $(el);
        const name    = item.find('title').first().text().trim();
        const desc    = item.find('description').first().text().trim();
        const link    = item.find('link').first().text().trim();
        const gravity = parseFloat(desc.match(/gravity:\s*([\d.]+)/i)?.[1] || '0');

        if (name) {
          products.push({ name, vendor: 'N/A', gravity, initComm: 'N/A', avgComm: 'N/A', category, link });
        }
      });
    } catch (err2) {
      console.warn(`[Clickbank/RSS] Fallback também falhou: ${err2.message}`);
    }
  }

  const sorted = products.sort((a, b) => b.gravity - a.gravity).slice(0, limit);
  const result = { products: sorted, total: sorted.length, category, updatedAt: new Date().toISOString() };
  cache.set(cacheKey, result);
  return result;
}

// ══════════════════════════════════════════════════════════════
// 3. GOOGLE TRENDS — Tendências por nicho e país (sem auth)
//    Mostra: interesse relativo 0-100 por semana, por país
// ══════════════════════════════════════════════════════════════
async function getGoogleTrends(keywords = ['weight loss', 'blood sugar', 'joint pain'], geo = '') {
  const cacheKey = `trends_${keywords.join('_')}_${geo}`;
  if (cache.has(cacheKey)) {
    console.log(`[Google Trends] Cache hit`);
    return cache.get(cacheKey);
  }

  // Google Trends via endpoint não-oficial (mesmo que o site usa)
  const token = await getGoogleTrendsToken(keywords, geo);
  if (!token) return { error: 'Não foi possível obter token do Google Trends' };

  try {
    const url = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=-180&req=${encodeURIComponent(JSON.stringify({
      time: 'today 3-m',
      resolution: 'WEEK',
      locale: 'en-US',
      comparisonItem: keywords.map(kw => ({ geo, complexKeywordsRestriction: { keyword: [{ type: 'BROAD', value: kw }] } })),
      requestOptions: { property: '', backend: 'CM', category: 0 },
    }))}&token=${token}&tz=-180`;

    const res = await axios.get(url, { headers: { ...HEADERS, Referer: 'https://trends.google.com/' }, timeout: 10000 });
    const jsonStr = res.data.replace(/^\)\]\}'/, '');
    const data = JSON.parse(jsonStr);

    const timelineData = data?.default?.timelineData || [];
    const result = {
      keywords,
      geo: geo || 'Global',
      timeline: timelineData.map(point => ({
        date: point.formattedTime,
        values: keywords.map((kw, i) => ({
          keyword: kw,
          value: point.value?.[i] || 0,
        })),
      })),
      updatedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`[Google Trends] Erro ao buscar dados: ${err.message}`);
    return { error: err.message, keywords, geo };
  }
}

async function getGoogleTrendsToken(keywords, geo = '') {
  try {
    const req = {
      comparisonItem: keywords.map(kw => ({ keyword: kw, geo, time: 'today 3-m' })),
      category: 0,
      property: '',
    };
    const url = `https://trends.google.com/trends/api/explore?hl=en-US&tz=-180&req=${encodeURIComponent(JSON.stringify(req))}&tz=-180`;
    const res = await axios.get(url, { headers: { ...HEADERS, Referer: 'https://trends.google.com/' }, timeout: 10000 });
    const jsonStr = res.data.replace(/^\)\]\}'/, '');
    const data = JSON.parse(jsonStr);
    const widget = data?.widgets?.find(w => w.id === 'TIMESERIES');
    return widget?.token || null;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// 4. INTERESSES POR PAÍS — Quais países procuram mais cada nicho
// ══════════════════════════════════════════════════════════════
async function getTrendsByCountry(keyword = 'weight loss supplement') {
  const cacheKey = `trends_geo_${keyword}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const token = await getGoogleTrendsToken([keyword], '');
    if (!token) throw new Error('token inválido');

    const req = {
      time: 'today 3-m',
      resolution: 'COUNTRY',
      locale: 'en-US',
      comparisonItem: [{ geo: '', complexKeywordsRestriction: { keyword: [{ type: 'BROAD', value: keyword }] } }],
      requestOptions: { property: '', backend: 'CM', category: 0 },
    };

    const url = `https://trends.google.com/trends/api/widgetdata/comparedgeo?hl=en-US&tz=-180&req=${encodeURIComponent(JSON.stringify(req))}&token=${token}&tz=-180`;
    const res = await axios.get(url, { headers: { ...HEADERS, Referer: 'https://trends.google.com/' }, timeout: 10000 });
    const jsonStr = res.data.replace(/^\)\]\}'/, '');
    const data = JSON.parse(jsonStr);

    const geoData = (data?.default?.geoMapData || [])
      .map(g => ({ country: g.geoName, code: g.geoCode, value: g.value?.[0] || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    const result = { keyword, countries: geoData, updatedAt: new Date().toISOString() };
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`[Trends por País] Erro: ${err.message}`);
    return { keyword, countries: [], error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════
// 5. AGREGADO COMPLETO — uma única chamada para o dashboard
// ══════════════════════════════════════════════════════════════
async function getAllPublicData() {
  const cacheKey = 'public_all';
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const HEALTH_KEYWORDS = ['weight loss supplement', 'blood sugar', 'joint pain relief', 'tinnitus supplement', 'dental health'];

  const [offervault, clickbank, trends, countryTrends] = await Promise.allSettled([
    getOfferVaultOffers('health', 2),
    getClickbankTopProducts('health', 20),
    getGoogleTrends(HEALTH_KEYWORDS.slice(0, 3)),
    getTrendsByCountry('weight loss supplement'),
  ]);

  const result = {
    offervault:    offervault.status === 'fulfilled' ? offervault.value : { error: offervault.reason?.message },
    clickbank:     clickbank.status  === 'fulfilled' ? clickbank.value  : { error: clickbank.reason?.message },
    trends:        trends.status     === 'fulfilled' ? trends.value     : { error: trends.reason?.message },
    countryTrends: countryTrends.status === 'fulfilled' ? countryTrends.value : { error: countryTrends.reason?.message },
    updatedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, result, 3600); // cache de 1h para o agregado
  return result;
}

module.exports = { getOfferVaultOffers, getClickbankTopProducts, getGoogleTrends, getTrendsByCountry, getAllPublicData };
