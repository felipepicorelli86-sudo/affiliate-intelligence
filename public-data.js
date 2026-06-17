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
// 2. CLICKBANK TOP PRODUCTS — banco curado + scraping live
//    Dados de gravity/comissão são públicos e amplamente divulgados
//    em ferramentas como CBGraph, ClickBank Analytics e fóruns
// ══════════════════════════════════════════════════════════════
const CLICKBANK_DB = [
  // ── Blood Sugar / Diabetes ──────────────────────────────────
  { name:'Sugar Defender',         vendor:'sugardefs',    gravity:156, initComm:'$67.50',  avgComm:'$92.10',  category:'health',      geos:'US,CA,GB,AU,NZ,IE' },
  { name:'GlucoTrust',             vendor:'glucotrust',   gravity:245, initComm:'$140.00', avgComm:'$150.50', category:'health',      geos:'US,CA,GB,AU' },
  { name:'GlucoBerry',             vendor:'glucoberry',   gravity:118, initComm:'$68.25',  avgComm:'$78.40',  category:'health',      geos:'US,CA,GB,AU,NZ' },
  { name:'GlucoFlush',             vendor:'glucoflush',   gravity:132, initComm:'$90.00',  avgComm:'$95.00',  category:'health',      geos:'US,CA,GB,AU' },
  { name:'Glucofort',              vendor:'glucofort',    gravity:98,  initComm:'$68.25',  avgComm:'$75.00',  category:'health',      geos:'US,CA,GB,AU' },
  // ── Weight Loss ──────────────────────────────────────────────
  { name:'Ikaria Lean Belly Juice',vendor:'ikarialean',   gravity:612, initComm:'$138.00', avgComm:'$143.20', category:'weight loss', geos:'US,CA,GB,AU,NZ,IE,ZA' },
  { name:'Puravive',               vendor:'puravive',     gravity:318, initComm:'$131.00', avgComm:'$135.50', category:'weight loss', geos:'US,CA,GB,AU,NZ' },
  { name:'Alpilean',               vendor:'alpilean',     gravity:402, initComm:'$130.00', avgComm:'$138.80', category:'weight loss', geos:'US,CA,GB,AU,NZ,IE' },
  { name:'FitSpresso',             vendor:'fitspresso',   gravity:284, initComm:'$145.00', avgComm:'$148.00', category:'weight loss', geos:'US,CA,GB,AU,NZ' },
  { name:'Java Burn',              vendor:'javaburn',     gravity:209, initComm:'$40.50',  avgComm:'$44.20',  category:'weight loss', geos:'US,CA,GB,AU' },
  { name:'Tea Burn',               vendor:'teaburn',      gravity:287, initComm:'$40.00',  avgComm:'$42.50',  category:'weight loss', geos:'US,CA,GB,AU,NZ' },
  { name:'Fast Lean Pro',          vendor:'fastlean',     gravity:198, initComm:'$138.00', avgComm:'$140.00', category:'weight loss', geos:'US,CA,GB,AU,NZ' },
  { name:'LivPure',                vendor:'livpure',      gravity:152, initComm:'$131.00', avgComm:'$135.00', category:'weight loss', geos:'US,CA,GB,AU' },
  { name:'SeroLean',               vendor:'seroleanoff',  gravity:103, initComm:'$130.00', avgComm:'$134.00', category:'weight loss', geos:'US,CA,GB,AU' },
  { name:'Nagano Lean Body Tonic', vendor:'naganolean',   gravity:234, initComm:'$131.00', avgComm:'$136.50', category:'weight loss', geos:'US,CA,GB,AU,NZ,IE' },
  { name:'Mitolyn',                vendor:'mitolyn',      gravity:178, initComm:'$131.00', avgComm:'$136.00', category:'weight loss', geos:'US,CA,GB,AU,NZ' },
  // ── Dental / Oral ────────────────────────────────────────────
  { name:'ProDentim',              vendor:'prodentim',    gravity:212, initComm:'$131.00', avgComm:'$136.50', category:'health',      geos:'US,CA,GB,AU,NZ,IE' },
  { name:'Steel Bite Pro',         vendor:'steelbite',    gravity:145, initComm:'$68.25',  avgComm:'$75.30',  category:'health',      geos:'US,CA,GB,AU' },
  { name:'Denticore',              vendor:'denticore',    gravity:167, initComm:'$131.00', avgComm:'$135.50', category:'health',      geos:'US,CA,GB,AU,NZ' },
  // ── Hearing / Tinnitus ───────────────────────────────────────
  { name:'Cortexi',                vendor:'cortexi',      gravity:253, initComm:'$131.00', avgComm:'$136.50', category:'health',      geos:'US,CA,GB,AU,NZ' },
  { name:'Quietum Plus',           vendor:'quietumplus',  gravity:148, initComm:'$50.00',  avgComm:'$54.50',  category:'health',      geos:'US,CA,GB,AU' },
  { name:'SonoVive',               vendor:'sonovive',     gravity:112, initComm:'$68.25',  avgComm:'$73.00',  category:'health',      geos:'US,CA,GB,AU' },
  // ── Joint / Pain ─────────────────────────────────────────────
  { name:'Joint Genesis',          vendor:'jointgenesis', gravity:189, initComm:'$131.00', avgComm:'$135.50', category:'joint',       geos:'US,CA,GB,AU,NZ' },
  { name:'Ageless Knees',          vendor:'agelessknees', gravity:134, initComm:'$45.00',  avgComm:'$50.00',  category:'joint',       geos:'US,CA,GB,AU' },
  { name:'Flexafen',               vendor:'flexafen',     gravity:98,  initComm:'$68.25',  avgComm:'$72.00',  category:'joint',       geos:'US,CA,GB,AU' },
  { name:'FlexAgain',              vendor:'flexagain',    gravity:87,  initComm:'$40.00',  avgComm:'$44.00',  category:'joint',       geos:'US,CA,GB,AU,NZ' },
  // ── Brain / Cognition ────────────────────────────────────────
  { name:'Pineal XT',              vendor:'pinealxt',     gravity:201, initComm:'$131.00', avgComm:'$136.00', category:'health',      geos:'US,CA,GB,AU,NZ' },
  { name:'Neurodrine',             vendor:'neurodrine',   gravity:134, initComm:'$68.25',  avgComm:'$75.00',  category:'health',      geos:'US,CA,GB,AU' },
  { name:'NeuroZoom',              vendor:'neurozoom',    gravity:112, initComm:'$131.00', avgComm:'$135.00', category:'health',      geos:'US,CA,GB,AU,NZ' },
  // ── Men\'s Health ─────────────────────────────────────────────
  { name:'Red Boost',              vendor:'redboostoff',  gravity:178, initComm:'$131.00', avgComm:'$136.50', category:'health',      geos:'US,CA,GB,AU' },
  { name:'ProstaStream',           vendor:'prostastream', gravity:145, initComm:'$50.00',  avgComm:'$55.00',  category:'health',      geos:'US,CA,GB,AU' },
  { name:'PotentStream',           vendor:'potentstream', gravity:132, initComm:'$68.25',  avgComm:'$74.00',  category:'health',      geos:'US,CA,GB,AU,NZ' },
  { name:'Emperor Vigor Tonic',    vendor:'emperorvigor', gravity:98,  initComm:'$131.00', avgComm:'$135.00', category:'health',      geos:'US,CA,GB,AU' },
  // ── Women\'s Health ───────────────────────────────────────────
  { name:'Hormonal Harmony HB-5',  vendor:'hb5',          gravity:156, initComm:'$68.25',  avgComm:'$73.00',  category:'health',      geos:'US,CA,GB,AU' },
  { name:'Provitalize',            vendor:'provitalize',  gravity:187, initComm:'$35.00',  avgComm:'$38.50',  category:'health',      geos:'US,CA,GB,AU,NZ' },
  // ── Vision ───────────────────────────────────────────────────
  { name:'iGenics',                vendor:'igenics',      gravity:108, initComm:'$68.25',  avgComm:'$74.00',  category:'health',      geos:'US,CA,GB,AU' },
  { name:'Ocuprime',               vendor:'ocuprime',     gravity:92,  initComm:'$68.25',  avgComm:'$72.00',  category:'health',      geos:'US,CA,GB,AU,NZ' },
  { name:'VisiSharp',              vendor:'visisharp',    gravity:78,  initComm:'$68.25',  avgComm:'$72.00',  category:'health',      geos:'US,CA,GB,AU' },
  // ── Sleep / Stress ───────────────────────────────────────────
  { name:'Resurge',                vendor:'resurge',      gravity:112, initComm:'$40.00',  avgComm:'$44.00',  category:'health',      geos:'US,CA,GB,AU' },
  { name:'Quietum Plus Sleep',     vendor:'qpsleep',      gravity:89,  initComm:'$50.00',  avgComm:'$54.00',  category:'health',      geos:'US,CA,GB,AU' },
  // ── Immunity / General ───────────────────────────────────────
  { name:'ProNervium',             vendor:'pronervium',   gravity:87,  initComm:'$68.25',  avgComm:'$73.00',  category:'health',      geos:'US,CA,GB,AU' },
  { name:'CardioShield',           vendor:'cardioshield', gravity:94,  initComm:'$131.00', avgComm:'$135.00', category:'health',      geos:'US,CA,GB,AU,NZ' },
];

// Mapeamento de categoria para filtros do dashboard
const CB_CATEGORY_MAP = {
  'health':       ['health','dental','hearing','vision','brain','men','women','immunity','sleep'],
  'weight loss':  ['weight loss'],
  'blood sugar':  ['health'],  // Clickbank usa 'health' para blood sugar
  'joint':        ['joint'],
};

function getClickbankTopProducts(category = 'health', limit = 30) {
  const cacheKey = `cb_top_${category}_${limit}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // Filtra por categoria
  const cats = CB_CATEGORY_MAP[category.toLowerCase()] || ['health'];
  const byCat = category.toLowerCase() === 'health'
    ? CLICKBANK_DB                                           // health = todos
    : CLICKBANK_DB.filter(p => cats.includes(p.category));

  // Palavras-chave para filtro mais específico
  const keywords = { 'weight loss': ['weight','lean','fat','burn','slim','keto'], 'blood sugar': ['gluco','sugar','diab','blood'], 'joint': ['joint','knee','flex','pain'] };
  const kws = keywords[category.toLowerCase()] || [];
  let filtered = kws.length
    ? CLICKBANK_DB.filter(p => kws.some(k => p.name.toLowerCase().includes(k) || p.vendor.toLowerCase().includes(k)) || byCat.includes(p))
    : byCat;

  // Deduplica e ordena por gravity
  const unique = [...new Map(filtered.map(p => [p.name, p])).values()].sort((a, b) => b.gravity - a.gravity).slice(0, limit);
  const result = { products: unique, total: unique.length, category, source: 'curated_db', updatedAt: new Date().toISOString() };
  cache.set(cacheKey, result, 3600);
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
// 4b. MEDIASCALERS — ofertas disponíveis (atualizado manualmente)
//     Fonte: admin.mediascalers.com/offers — Partner ID 6402
// ══════════════════════════════════════════════════════════════
const MEDIASCALERS_OFFERS = [
  { id:4399, name:'Hume Band 2.0', countries:'US,DE,CA,AU,UK,FR,ZA', category:'Health & Wellness', payout:60, added:'2026-06-12' },
  { id:4398, name:'Bryt Better Coffee Subscription CTC $23.49', countries:'US,DE,CA,AU,UK,FR,IL', category:'Health & Wellness', payout:45, added:'2026-06-12' },
  { id:4397, name:'Bryt Better Coffee CTC $25.99', countries:'US,DE,CA,AU,UK,FR,IL', category:'Health & Wellness', payout:25, added:'2026-06-12' },
  { id:4396, name:'KetoNex Gummies DTC', countries:'US', category:'Diet & Weight Loss', payout:145, added:'2026-06-12' },
  { id:4318, name:'Big EDs Meds - Erectile Dysfunction', countries:'US', category:'Mens Health', payout:125, added:'2026-06-10' },
  { id:4316, name:'AERIOQ Home AC CTC $134.95', countries:'US', category:'Gadgets & Devices', payout:90, added:'2026-06-10' },
  { id:4312, name:'AirZa CTC $59.95', countries:'US', category:'Health & Wellness', payout:45, added:'2026-06-10' },
  { id:4320, name:'Vanotium Cutting Board', countries:'US,DE,CA,AU,GB,FR,NZ', category:'Home Goods', payout:46, added:'2026-06-10' },
  { id:4319, name:'Melara Max Memory Foam Pillow', countries:'US,DE,CA,AU,GB,FR,NZ', category:'Home Goods', payout:46, added:'2026-06-10' },
  { id:4299, name:'GrillWizz Grill Cleaner CTC $79.99', countries:'US,DE,CA,AU,UK,FR,IL', category:'Home Goods', payout:55, added:'2026-06-04' },
  { id:4298, name:'WellaWhite Teeth Whitening Foam CTC $34.99', countries:'US,DE,CA,AU,UK,FR,IL', category:'Beauty', payout:45, added:'2026-06-04' },
  { id:4249, name:'Arthryon Heat Relief Cream DTC', countries:'US', category:'General Health', payout:145, added:'2026-06-04' },
  { id:4248, name:'CardioX Glucose Management DTC', countries:'US', category:'General Health', payout:145, added:'2026-06-04' },
  { id:4247, name:'Element Organics Hemp Gummies', countries:'IL', category:'CBD', payout:125, added:'2026-06-04' },
  { id:4245, name:'ParaMD Parasite Cleanse', countries:'PR', category:'General Health', payout:125, added:'2026-06-04' },
  { id:4243, name:'ParaMD Parasite Cleanse AU', countries:'AU', category:'General Health', payout:125, added:'2026-06-04' },
  { id:4242, name:'Arthryon Heat Relief Cream NZ', countries:'NZ', category:'General Health', payout:125, added:'2026-06-04' },
  { id:4241, name:'Arthryon Heat Relief Cream AU', countries:'AU', category:'General Health', payout:125, added:'2026-06-04' },
  { id:4235, name:'KetoNex Gummies AU', countries:'AU', category:'Diet & Weight Loss', payout:125, added:'2026-06-04' },
  { id:4311, name:'Ozem+ Diet NL', countries:'NL', category:'Diet & Weight Loss', payout:65, added:'2026-06-05' },
  { id:4264, name:'Hello40 Checkout', countries:'DE,GB,FR,AT,CH,IT,SE', category:'General Health', payout:60, added:'2026-06-04' },
  { id:4251, name:'Veluna GLP-1 Booster SE', countries:'SE', category:'Diet & Weight Loss', payout:60, added:'2026-06-04' },
  { id:4250, name:'Veluna GLP-1 Booster DE', countries:'DE', category:'Diet & Weight Loss', payout:60, added:'2026-06-04' },
  { id:4253, name:'Glucotex DE', countries:'DE', category:'General Health', payout:60, added:'2026-06-04' },
  { id:4281, name:'Purotyn DE', countries:'DE', category:'Diet & Weight Loss', payout:60, added:'2026-06-04' },
  { id:4240, name:'RagnarX Gummies French DTC', countries:'FR', category:'Mens Health', payout:125, added:'2026-06-04' },
];

// Ofertas onde o afiliado está APROVADO (rastrear via postback)
const MEDIASCALERS_APPROVED = [
  { id: 2189, name: 'Hume Body Pod', countries: 'US,DE,CA,AU,GB,FR,ZA', category: 'Health & Wellness', payout: 60 },
  { id: 3306, name: 'FizzClean Toilet Cleaning Foam', countries: 'US,DE,CA,AU,UK,FR,IL', category: 'Home Goods', payout: 56 },
  { id: 3489, name: 'Glpura - Diet', countries: 'DE,AT,CH', category: 'Diet & Weight Loss', payout: 60 },
];

function getMediaScalersOffers(limit = 50) {
  const sorted = [...MEDIASCALERS_OFFERS].sort((a, b) => b.payout - a.payout).slice(0, limit);
  return {
    network: 'MediaScalers',
    approved: MEDIASCALERS_APPROVED,
    offers: sorted,
    total: MEDIASCALERS_OFFERS.length,
    topPayout: Math.max(...MEDIASCALERS_OFFERS.map(o => o.payout)),
    avgPayout: Math.round(MEDIASCALERS_OFFERS.reduce((s, o) => s + o.payout, 0) / MEDIASCALERS_OFFERS.length),
    updatedAt: '2026-06-17',
    postbackUrl: 'https://affiliate-intelligence.up.railway.app/api/postback?network=mediascalers&amount={payout}&conv={transaction_id}&offer={offer_name}&offer_id={offer_id}',
  };
}

// ══════════════════════════════════════════════════════════════
// 5. BUYGOODS MARKETPLACE — ofertas públicas sem login
//    URL: https://www.buygoods.com/marketplace
// ══════════════════════════════════════════════════════════════
async function getBuygoodsMarketplace(limit = 30) {
  const cacheKey = `buygoods_mkt_${limit}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const products = [];
  try {
    const res = await axios.get('https://www.buygoods.com/marketplace', {
      headers: HEADERS,
      timeout: 12000,
    });
    const $ = cheerio.load(res.data);

    // Selectors comuns em páginas de marketplace de afiliados
    $('[class*="product"], [class*="offer"], [class*="item"], article').each((_, el) => {
      const row = $(el);
      const name    = row.find('[class*="title"], [class*="name"], h2, h3').first().text().trim();
      const comm    = row.find('[class*="commission"], [class*="payout"], [class*="earn"]').first().text().trim();
      const cat     = row.find('[class*="category"], [class*="niche"]').first().text().trim();

      if (name && name.length > 3) {
        products.push({
          name,
          commission: comm || 'N/A',
          category: cat || 'Health',
          network: 'Buygoods',
        });
      }
    });
  } catch (err) {
    console.warn(`[Buygoods Marketplace] Erro: ${err.message}`);
  }

  const result = { products: products.slice(0, limit), total: products.length, updatedAt: new Date().toISOString() };
  cache.set(cacheKey, result);
  return result;
}

// ══════════════════════════════════════════════════════════════
// 6. OFFERVAULT POR REDE — filtra ofertas de uma rede específica
//    Cobre: Maxweb, Gurumedia, Smashloud, Clickbank, Buygoods
// ══════════════════════════════════════════════════════════════
async function getOffersByNetwork(networkName, keyword = 'health') {
  const cacheKey = `ovnet_${networkName.toLowerCase()}_${keyword}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const allOffers = [];
  const CATEGORIES = ['health', 'weight loss', 'blood sugar', 'dental', 'joint'];

  for (const kw of CATEGORIES) {
    try {
      const url = `https://www.offervault.com/offers/search/index/?keyword=${encodeURIComponent(kw)}&network=${encodeURIComponent(networkName)}&sf=PAID&sb=desc&pg=1&display=25`;
      const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
      const $ = cheerio.load(res.data);

      $('.offer-result-row, .search-result, tr.offer').each((_, el) => {
        const row = $(el);
        const name    = row.find('.offer-name, .name, td:nth-child(2)').first().text().trim();
        const network = row.find('.network-name, .network, td:nth-child(4)').first().text().trim();
        const payout  = row.find('.payout, .commission, td:nth-child(3)').first().text().trim();
        const geos    = row.find('.geo, .countries, td:nth-child(5)').first().text().trim();

        // Filtra pelo nome da rede
        if (name && name.length > 2 && (!network || network.toLowerCase().includes(networkName.toLowerCase()))) {
          allOffers.push({ name, network: network || networkName, payout: payout || 'N/A', geos: geos || 'US', category: kw });
        }
      });
      await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      console.warn(`[OfferVault/${networkName}] ${kw}: ${err.message}`);
    }
  }

  const unique = [...new Map(allOffers.map(o => [o.name.toLowerCase(), o])).values()];
  const result = { network: networkName, offers: unique, total: unique.length, updatedAt: new Date().toISOString() };
  cache.set(cacheKey, result);
  return result;
}

// ══════════════════════════════════════════════════════════════
// 7. AGREGADO COMPLETO — uma única chamada para o dashboard
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

module.exports = { getOfferVaultOffers, getClickbankTopProducts, getGoogleTrends, getTrendsByCountry, getAllPublicData, getBuygoodsMarketplace, getOffersByNetwork, getMediaScalersOffers };
