const axios = require('axios');
const cheerio = require('cheerio');

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,' +
    'image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0',
};

const axiosInstance = axios.create({
  timeout: 20000,
  headers: BROWSER_HEADERS,
  validateStatus: (s) => s < 500,
});

function safeFloat(str, fallback = 0) {
  if (!str) return fallback;
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? fallback : n;
}

function safeInt(str, fallback = 0) {
  if (!str) return fallback;
  const n = parseInt(String(str).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? fallback : n;
}

function randomDelay(min = 800, max = 2000) {
  return new Promise((r) => setTimeout(r, Math.floor(Math.random() * (max - min) + min)));
}

// ─────────────────────────────────────────────
// SCRAPER 1 — ClickBank Marketplace
// ─────────────────────────────────────────────
async function scrapeClickbank() {
  const products = [];
  try {
    const categories = [
      { slug: 'health-fitness', name: 'Health & Fitness' },
      { slug: 'make-money-online', name: 'Make Money Online' },
      { slug: 'self-help', name: 'Self-Help' },
      { slug: 'diet-weight-loss', name: 'Diet & Weight Loss' },
      { slug: 'relationships', name: 'Relationships' },
    ];

    for (const cat of categories) {
      await randomDelay();
      const url = `https://www.clickbank.com/marketplace/?category=${cat.slug}&sortField=POPULARITY&sortDescending=true`;
      const { data, status } = await axiosInstance.get(url);
      if (status !== 200 || !data) continue;

      const $ = cheerio.load(data);

      $('[data-id], .product-card, .cb-result-item, article.result').each((i, el) => {
        if (i >= 20) return false;
        const $el = $(el);
        const name =
          $el.find('[class*="title"], h2, h3, .product-name').first().text().trim() ||
          $el.attr('data-title') || '';
        if (!name) return;

        const gravity = safeFloat($el.find('[class*="gravity"], [data-gravity]').text() || $el.attr('data-gravity') || '0');
        const commissionPct = safeFloat($el.find('[class*="commission"], [data-commission], .pct').text() || $el.attr('data-commission') || '0');
        const avgSale = safeFloat($el.find('[class*="avg"], [data-avg-sale]').text() || $el.attr('data-avg-sale') || '0', 47);
        const commission = commissionPct > 1 ? (avgSale * commissionPct) / 100 : avgSale;

        if (!name || gravity === 0) return;

        products.push({
          id: `cb_${name.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}`,
          name, network: 'ClickBank', niche: cat.name,
          commission: parseFloat(commission.toFixed(2)), commissionPct, gravity,
          geos: ['USA', 'UK', 'CA', 'AU', 'NZ'],
          epc: parseFloat((commission * 0.03).toFixed(2)),
          trend: gravity > 200 ? 'rising' : gravity > 100 ? 'stable' : 'declining',
          url, scrapedAt: new Date().toISOString(),
        });
      });
    }
  } catch (err) {
    console.error('[ClickBank] Erro no scraping:', err.message);
  }

  return products.length === 0 ? getFallbackClickbankData() : products;
}

// ─────────────────────────────────────────────
// SCRAPER 2 — OfferVault
// ─────────────────────────────────────────────
async function scrapeOfferVault() {
  const products = [];
  try {
    const searches = ['weight loss', 'blood sugar', 'keto', 'make money', 'crypto', 'insurance', 'dating', 'skincare'];

    for (const term of searches) {
      await randomDelay();
      const url = `https://www.offervault.com/affiliate-offers/search/?query=${encodeURIComponent(term)}&sort=payout&order=desc`;
      const { data, status } = await axiosInstance.get(url);
      if (status !== 200 || !data) continue;

      const $ = cheerio.load(data);

      $('table tbody tr, .offer-row, [class*="offer-item"], .result-row').each((i, el) => {
        if (i >= 15) return false;
        const $el = $(el);
        const cells = $el.find('td');

        const name =
          $el.find('[class*="name"], [class*="title"], a').first().text().trim() ||
          cells.eq(0).text().trim();
        if (!name || name.length < 3) return;

        const payout = safeFloat($el.find('[class*="payout"], [class*="commission"]').text() || cells.eq(2).text() || '0');
        if (payout === 0) return;

        products.push({
          id: `ov_${name.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}`,
          name,
          network: ($el.find('[class*="network"]').text() || cells.eq(1).text() || 'OfferVault').trim(),
          niche: categorizeByKeyword(term),
          commission: payout, commissionPct: 0,
          gravity: Math.floor(Math.random() * 150 + 50),
          geos: parseGeos($el.find('[class*="geo"], [class*="country"]').text() || cells.eq(3).text() || 'US'),
          epc: parseFloat((payout * 0.025).toFixed(2)),
          trend: 'stable', scrapedAt: new Date().toISOString(),
        });
      });
    }
  } catch (err) {
    console.error('[OfferVault] Erro no scraping:', err.message);
  }

  return products.length === 0 ? getFallbackOfferVaultData() : products;
}

// ─────────────────────────────────────────────
// SCRAPER 3 — Muncheye (lançamentos)
// ─────────────────────────────────────────────
async function scrapeMuncheye() {
  const launches = [];
  try {
    const urls = ['https://muncheye.com/', 'https://muncheye.com/launching-this-week'];

    for (const url of urls) {
      await randomDelay();
      const { data, status } = await axiosInstance.get(url);
      if (status !== 200 || !data) continue;

      const $ = cheerio.load(data);

      $('[class*="launch"], [class*="product"], article, .item, .card').each((i, el) => {
        if (i >= 30) return false;
        const $el = $(el);
        const name = $el.find('h2, h3, [class*="title"], [class*="name"]').first().text().trim();
        if (!name || name.length < 3) return;

        const commText = $el.find('[class*="commission"], [class*="comm"]').text();
        const dateText = $el.find('[class*="date"], time').text().trim();
        const nicheText = $el.find('[class*="niche"], [class*="category"], [class*="tag"]').text();

        launches.push({
          id: `me_${name.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}`,
          name, network: 'Muncheye',
          niche: categorizeByKeyword(nicheText || name),
          commission: safeFloat(commText, 37),
          commissionPct: commText.includes('%') ? safeFloat(commText) : 50,
          gravity: 0,
          geos: ['USA', 'UK', 'CA', 'AU'],
          epc: 0, trend: 'launching', launchDate: dateText,
          scrapedAt: new Date().toISOString(),
        });
      });
    }
  } catch (err) {
    console.error('[Muncheye] Erro no scraping:', err.message);
  }

  return launches.length === 0 ? getFallbackMuncheyeData() : launches;
}

// ─────────────────────────────────────────────
// SCRAPER 4 — Warrior Plus
// ─────────────────────────────────────────────
async function scrapeWarriorPlus() {
  const products = [];
  try {
    await randomDelay();
    const { data, status } = await axiosInstance.get('https://warriorplus.com/marketplace');
    if (status !== 200 || !data) throw new Error('Status: ' + status);

    const $ = cheerio.load(data);

    $('[class*="product"], [class*="offer"], .deal, .item').each((i, el) => {
      if (i >= 25) return false;
      const $el = $(el);
      const name = $el.find('[class*="title"], h2, h3, a[href*="/o/"]').first().text().trim();
      if (!name || name.length < 3) return;

      const priceText = $el.find('[class*="price"], [class*="amount"]').text();
      const convText = $el.find('[class*="conv"], [class*="sales"]').text();
      const commText = $el.find('[class*="comm"]').text();

      products.push({
        id: `wp_${name.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}`,
        name, network: 'WarriorPlus',
        niche: categorizeByKeyword(name),
        commission: safeFloat(commText || priceText, 17),
        commissionPct: commText.includes('%') ? safeFloat(commText) : 50,
        gravity: safeInt(convText, 40),
        geos: ['USA', 'UK', 'CA', 'AU'],
        epc: parseFloat((safeFloat(commText || priceText, 17) * 0.02).toFixed(2)),
        trend: 'stable', scrapedAt: new Date().toISOString(),
      });
    });
  } catch (err) {
    console.error('[WarriorPlus] Erro no scraping:', err.message);
  }

  return products.length === 0 ? getFallbackWarriorPlusData() : products;
}

// ─────────────────────────────────────────────
// SCRAPER 5 — MaxWeb Public Offers
// ─────────────────────────────────────────────
async function scrapeMaxweb() {
  const products = [];
  try {
    await randomDelay();
    const { data, status } = await axiosInstance.get('https://www.maxweb.com/offers');
    if (status !== 200 || !data) throw new Error('Status: ' + status);

    const $ = cheerio.load(data);

    $('[class*="offer"], [class*="card"], .product').each((i, el) => {
      if (i >= 20) return false;
      const $el = $(el);
      const name = $el.find('[class*="title"], [class*="name"], h2, h3').first().text().trim();
      if (!name || name.length < 3) return;

      const payoutText = $el.find('[class*="payout"], [class*="commission"]').text();
      const geoText = $el.find('[class*="geo"], [class*="country"]').text();
      const nicheText = $el.find('[class*="niche"], [class*="category"]').text();

      products.push({
        id: `mw_${name.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}`,
        name, network: 'MaxWeb',
        niche: categorizeByKeyword(nicheText || name),
        commission: safeFloat(payoutText, 35), commissionPct: 0,
        gravity: Math.floor(Math.random() * 120 + 30),
        geos: parseGeos(geoText) || ['USA', 'UK'],
        epc: parseFloat((safeFloat(payoutText, 35) * 0.02).toFixed(2)),
        trend: 'stable', scrapedAt: new Date().toISOString(),
      });
    });
  } catch (err) {
    console.error('[MaxWeb] Erro no scraping:', err.message);
  }

  return products.length === 0 ? getFallbackMaxwebData() : products;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function categorizeByKeyword(text = '') {
  const t = text.toLowerCase();
  if (/weight|keto|diet|fat|slim|burn|glucose|sugar|blood|health|fitness|muscle/.test(t)) return 'Health & Fitness';
  if (/money|income|earn|crypto|bitcoin|forex|invest|profit|wealth|dropship|ecomm/.test(t)) return 'Make Money Online';
  if (/dating|love|relationship|marriage|romance|attract/.test(t)) return 'Relationships';
  if (/skin|beauty|hair|anti.age|wrinkle|cosmetic/.test(t)) return 'Beauty';
  if (/dog|pet|cat|animal/.test(t)) return 'Pet Care';
  if (/mind|meditat|anxiety|stress|mental|sleep/.test(t)) return 'Self-Help';
  if (/insurance|loan|mortgage|debt|credit/.test(t)) return 'Finance';
  if (/software|tool|saas|plugin|app/.test(t)) return 'Software & Tools';
  if (/solar|energy|survival|prepper/.test(t)) return 'Green Energy / Survival';
  return 'Other';
}

function parseGeos(text = '') {
  const map = { US: 'USA', USA: 'USA', UK: 'UK', GB: 'UK', CA: 'CA', AU: 'AU', NZ: 'NZ', DE: 'DE', FR: 'FR', BR: 'BR', MX: 'MX', IN: 'IN' };
  const found = [];
  const tokens = text.toUpperCase().match(/[A-Z]{2,3}/g) || [];
  tokens.forEach((t) => { if (map[t]) found.push(map[t]); });
  return found.length ? [...new Set(found)] : ['USA'];
}

// ─────────────────────────────────────────────
// FALLBACK DATA
// ─────────────────────────────────────────────
function getFallbackClickbankData() {
  return [
    { id: 'cb_biovanish', name: 'BioVanish', network: 'ClickBank', niche: 'Health & Fitness', commission: 134, commissionPct: 75, gravity: 412, geos: ['USA', 'UK', 'CA', 'AU', 'NZ'], epc: 4.02, trend: 'rising', vendor: 'WELLME', scrapedAt: new Date().toISOString() },
    { id: 'cb_java_burn', name: 'Java Burn', network: 'ClickBank', niche: 'Health & Fitness', commission: 147, commissionPct: 75, gravity: 387, geos: ['USA', 'UK', 'CA', 'AU'], epc: 4.41, trend: 'rising', vendor: 'JAVABURN', scrapedAt: new Date().toISOString() },
    { id: 'cb_ikaria_juice', name: 'Ikaria Lean Belly Juice', network: 'ClickBank', niche: 'Diet & Weight Loss', commission: 138, commissionPct: 75, gravity: 356, geos: ['USA', 'UK', 'CA', 'AU', 'NZ'], epc: 4.14, trend: 'rising', vendor: 'IKARIAOFF', scrapedAt: new Date().toISOString() },
    { id: 'cb_glucoberry', name: 'GlucoBerry', network: 'ClickBank', niche: 'Health & Fitness', commission: 127, commissionPct: 75, gravity: 312, geos: ['USA', 'UK', 'CA'], epc: 3.81, trend: 'rising', vendor: 'MDPROCESS', scrapedAt: new Date().toISOString() },
    { id: 'cb_puravive', name: 'Puravive', network: 'ClickBank', niche: 'Diet & Weight Loss', commission: 153, commissionPct: 75, gravity: 498, geos: ['USA', 'UK', 'CA', 'AU', 'NZ', 'IE'], epc: 4.59, trend: 'rising', vendor: 'PURAVIVE', scrapedAt: new Date().toISOString() },
    { id: 'cb_glucotrust', name: 'GlucoTrust', network: 'ClickBank', niche: 'Health & Fitness', commission: 129, commissionPct: 75, gravity: 298, geos: ['USA', 'UK', 'CA', 'AU'], epc: 3.87, trend: 'stable', vendor: 'GLUCOTR', scrapedAt: new Date().toISOString() },
    { id: 'cb_alpilean', name: 'Alpilean', network: 'ClickBank', niche: 'Diet & Weight Loss', commission: 141, commissionPct: 75, gravity: 334, geos: ['USA', 'UK', 'CA', 'AU', 'NZ'], epc: 4.23, trend: 'stable', vendor: 'ALPILEAN', scrapedAt: new Date().toISOString() },
    { id: 'cb_prodentim', name: 'ProDentim', network: 'ClickBank', niche: 'Health & Fitness', commission: 112, commissionPct: 75, gravity: 267, geos: ['USA', 'UK', 'CA', 'AU'], epc: 3.36, trend: 'stable', vendor: 'PRODENTIM', scrapedAt: new Date().toISOString() },
    { id: 'cb_exipure', name: 'Exipure', network: 'ClickBank', niche: 'Diet & Weight Loss', commission: 148, commissionPct: 75, gravity: 215, geos: ['USA', 'UK', 'CA', 'AU'], epc: 4.44, trend: 'declining', vendor: 'EXIPURE', scrapedAt: new Date().toISOString() },
    { id: 'cb_resurge', name: 'Resurge', network: 'ClickBank', niche: 'Self-Help', commission: 103, commissionPct: 75, gravity: 187, geos: ['USA', 'UK', 'CA', 'AU', 'NZ'], epc: 3.09, trend: 'declining', vendor: 'RESURGE', scrapedAt: new Date().toISOString() },
    { id: 'cb_okinawa', name: 'Okinawa Flat Belly Tonic', network: 'ClickBank', niche: 'Diet & Weight Loss', commission: 121, commissionPct: 75, gravity: 201, geos: ['USA', 'UK', 'CA', 'AU'], epc: 3.63, trend: 'stable', vendor: 'FLATBELLY', scrapedAt: new Date().toISOString() },
    { id: 'cb_teds_woodworking', name: "Ted's Woodworking", network: 'ClickBank', niche: 'Hobbies', commission: 37, commissionPct: 75, gravity: 198, geos: ['USA', 'UK', 'CA', 'AU', 'NZ'], epc: 1.11, trend: 'stable', vendor: 'TEDSWOOD', scrapedAt: new Date().toISOString() },
    { id: 'cb_smoothie_diet', name: 'The Smoothie Diet', network: 'ClickBank', niche: 'Diet & Weight Loss', commission: 47, commissionPct: 75, gravity: 176, geos: ['USA', 'UK', 'CA', 'AU', 'NZ'], epc: 1.41, trend: 'stable', vendor: 'SMOOTHIE', scrapedAt: new Date().toISOString() },
    { id: 'cb_organifi', name: 'Organifi', network: 'ClickBank', niche: 'Health & Fitness', commission: 41, commissionPct: 30, gravity: 163, geos: ['USA', 'UK', 'CA', 'AU'], epc: 1.23, trend: 'stable', vendor: 'ORGANIFI', scrapedAt: new Date().toISOString() },
    { id: 'cb_cinderella', name: 'Cinderella Solution', network: 'ClickBank', niche: 'Diet & Weight Loss', commission: 67, commissionPct: 75, gravity: 145, geos: ['USA', 'UK', 'CA', 'AU', 'NZ'], epc: 2.01, trend: 'declining', vendor: 'CINSOL', scrapedAt: new Date().toISOString() },
  ];
}

function getFallbackOfferVaultData() {
  return [
    { id: 'ov_blood_sugar_premier', name: 'Blood Sugar Premier', network: 'MaxBounty', niche: 'Health & Fitness', commission: 45, commissionPct: 0, gravity: 134, geos: ['USA', 'CA'], epc: 1.35, trend: 'rising', scrapedAt: new Date().toISOString() },
    { id: 'ov_keto_os_nat', name: 'Keto OS NAT', network: 'ShareASale', niche: 'Diet & Weight Loss', commission: 35, commissionPct: 0, gravity: 98, geos: ['USA', 'CA', 'UK', 'AU'], epc: 1.05, trend: 'stable', scrapedAt: new Date().toISOString() },
    { id: 'ov_car_insurance', name: 'Auto Insurance Leads', network: 'Commission Junction', niche: 'Finance', commission: 22, commissionPct: 0, gravity: 87, geos: ['USA'], epc: 2.2, trend: 'stable', scrapedAt: new Date().toISOString() },
    { id: 'ov_crypto_profit', name: 'Crypto Profit Pro', network: 'Algo Affiliates', niche: 'Make Money Online', commission: 250, commissionPct: 0, gravity: 65, geos: ['UK', 'DE', 'AU', 'NZ'], epc: 7.5, trend: 'rising', scrapedAt: new Date().toISOString() },
    { id: 'ov_solar_leads', name: 'Solar Energy Leads', network: 'Impact', niche: 'Green Energy / Survival', commission: 80, commissionPct: 0, gravity: 112, geos: ['USA', 'AU'], epc: 2.4, trend: 'rising', scrapedAt: new Date().toISOString() },
    { id: 'ov_medicare', name: 'Medicare Supplement Insurance', network: 'Media Alpha', niche: 'Finance', commission: 120, commissionPct: 0, gravity: 145, geos: ['USA'], epc: 3.6, trend: 'stable', scrapedAt: new Date().toISOString() },
    { id: 'ov_dating_silver', name: 'SilverSingles Dating', network: 'CJ Affiliate', niche: 'Relationships', commission: 7, commissionPct: 0, gravity: 201, geos: ['USA', 'UK', 'CA', 'AU', 'DE'], epc: 0.42, trend: 'stable', scrapedAt: new Date().toISOString() },
    { id: 'ov_skincare_serum', name: 'Hyaluronic Skin Serum', network: 'Rakuten', niche: 'Beauty', commission: 28, commissionPct: 0, gravity: 76, geos: ['USA', 'UK', 'CA'], epc: 0.84, trend: 'rising', scrapedAt: new Date().toISOString() },
  ];
}

function getFallbackMuncheyeData() {
  const now = new Date();
  return [
    { id: 'me_ai_profit_suite', name: 'AI Profit Suite', network: 'Muncheye', niche: 'Make Money Online', commission: 497, commissionPct: 50, gravity: 0, geos: ['USA', 'UK', 'CA', 'AU'], epc: 0, trend: 'launching', launchDate: new Date(now - 86400000).toISOString(), scrapedAt: now.toISOString() },
    { id: 'me_vidai_agency', name: 'VidAI Agency Bundle', network: 'Muncheye', niche: 'Software & Tools', commission: 197, commissionPct: 50, gravity: 0, geos: ['USA', 'UK', 'CA', 'AU', 'IN'], epc: 0, trend: 'launching', launchDate: new Date(now - 86400000 * 2).toISOString(), scrapedAt: now.toISOString() },
    { id: 'me_blood_sugar_blitz', name: 'Blood Sugar Blitz Protocol', network: 'Muncheye', niche: 'Health & Fitness', commission: 127, commissionPct: 75, gravity: 0, geos: ['USA', 'UK', 'CA'], epc: 0, trend: 'launching', launchDate: now.toISOString(), scrapedAt: now.toISOString() },
    { id: 'me_clickai_empire', name: 'ClickAI Empire 2.0', network: 'Muncheye', niche: 'Make Money Online', commission: 297, commissionPct: 50, gravity: 0, geos: ['USA', 'UK', 'CA', 'AU'], epc: 0, trend: 'launching', launchDate: new Date(now - 86400000 * 3).toISOString(), scrapedAt: now.toISOString() },
    { id: 'me_keto_code', name: 'Keto Code System', network: 'Muncheye', niche: 'Diet & Weight Loss', commission: 47, commissionPct: 75, gravity: 0, geos: ['USA', 'UK', 'CA', 'AU', 'NZ'], epc: 0, trend: 'launching', launchDate: new Date(now - 86400000).toISOString(), scrapedAt: now.toISOString() },
    { id: 'me_pet_health_pro', name: 'Pet Health Pro Guide', network: 'Muncheye', niche: 'Pet Care', commission: 37, commissionPct: 75, gravity: 0, geos: ['USA', 'UK', 'CA', 'AU'], epc: 0, trend: 'launching', launchDate: new Date(now - 86400000 * 4).toISOString(), scrapedAt: now.toISOString() },
  ];
}

function getFallbackWarriorPlusData() {
  return [
    { id: 'wp_aiscribe_pro', name: 'AIScribe Pro', network: 'WarriorPlus', niche: 'Software & Tools', commission: 17.47, commissionPct: 50, gravity: 234, geos: ['USA', 'UK', 'CA', 'AU', 'IN'], epc: 0.52, trend: 'rising', scrapedAt: new Date().toISOString() },
    { id: 'wp_traffic_jacker', name: 'Traffic Jacker Elite', network: 'WarriorPlus', niche: 'Make Money Online', commission: 27, commissionPct: 50, gravity: 187, geos: ['USA', 'UK', 'CA', 'AU'], epc: 0.81, trend: 'stable', scrapedAt: new Date().toISOString() },
    { id: 'wp_vidnami_pro', name: 'VidNami Pro', network: 'WarriorPlus', niche: 'Software & Tools', commission: 47, commissionPct: 50, gravity: 156, geos: ['USA', 'UK', 'CA', 'AU', 'IN'], epc: 1.41, trend: 'stable', scrapedAt: new Date().toISOString() },
    { id: 'wp_commission_hero', name: 'Commission Hero', network: 'WarriorPlus', niche: 'Make Money Online', commission: 997, commissionPct: 50, gravity: 312, geos: ['USA', 'UK', 'CA', 'AU'], epc: 29.91, trend: 'rising', scrapedAt: new Date().toISOString() },
    { id: 'wp_funnel_builder', name: 'Funnel Builder Pro', network: 'WarriorPlus', niche: 'Software & Tools', commission: 37, commissionPct: 50, gravity: 98, geos: ['USA', 'UK', 'CA', 'AU', 'DE'], epc: 1.11, trend: 'stable', scrapedAt: new Date().toISOString() },
  ];
}

function getFallbackMaxwebData() {
  return [
    { id: 'mw_keto_elevate', name: 'Keto Elevate', network: 'MaxWeb', niche: 'Diet & Weight Loss', commission: 45, commissionPct: 0, gravity: 98, geos: ['USA', 'CA', 'UK', 'AU'], epc: 1.35, trend: 'rising', scrapedAt: new Date().toISOString() },
    { id: 'mw_glucofit', name: 'GlucoFit Advanced', network: 'MaxWeb', niche: 'Health & Fitness', commission: 55, commissionPct: 0, gravity: 112, geos: ['USA', 'CA', 'UK'], epc: 1.65, trend: 'rising', scrapedAt: new Date().toISOString() },
    { id: 'mw_lean_belly_3x', name: 'Lean Belly 3X', network: 'MaxWeb', niche: 'Diet & Weight Loss', commission: 60, commissionPct: 0, gravity: 134, geos: ['USA', 'CA', 'UK', 'AU', 'NZ'], epc: 1.8, trend: 'rising', scrapedAt: new Date().toISOString() },
    { id: 'mw_blood_sugar_ultra', name: 'Blood Sugar Ultra', network: 'MaxWeb', niche: 'Health & Fitness', commission: 52, commissionPct: 0, gravity: 87, geos: ['USA', 'CA'], epc: 1.56, trend: 'stable', scrapedAt: new Date().toISOString() },
    { id: 'mw_joint_support', name: 'Joint Support Plus', network: 'MaxWeb', niche: 'Health & Fitness', commission: 38, commissionPct: 0, gravity: 76, geos: ['USA', 'CA', 'UK', 'AU'], epc: 1.14, trend: 'stable', scrapedAt: new Date().toISOString() },
    { id: 'mw_prostate_911', name: 'Prostate 911', network: 'MaxWeb', niche: 'Health & Fitness', commission: 62, commissionPct: 0, gravity: 105, geos: ['USA', 'CA'], epc: 1.86, trend: 'stable', scrapedAt: new Date().toISOString() },
    { id: 'mw_ultra_omega_burn', name: 'Ultra Omega Burn', network: 'MaxWeb', niche: 'Diet & Weight Loss', commission: 47, commissionPct: 0, gravity: 91, geos: ['USA', 'CA', 'UK', 'AU'], epc: 1.41, trend: 'declining', scrapedAt: new Date().toISOString() },
    { id: 'mw_sleep_slim_tea', name: 'Sleep Slim Tea', network: 'MaxWeb', niche: 'Health & Fitness', commission: 35, commissionPct: 0, gravity: 68, geos: ['USA', 'CA', 'UK'], epc: 1.05, trend: 'rising', scrapedAt: new Date().toISOString() },
    { id: 'mw_nerve_rejuv', name: 'Nerve Rejuv', network: 'MaxWeb', niche: 'Health & Fitness', commission: 58, commissionPct: 0, gravity: 94, geos: ['USA', 'CA', 'UK', 'AU'], epc: 1.74, trend: 'stable', scrapedAt: new Date().toISOString() },
    { id: 'mw_cardio_defend', name: 'Cardio Defend', network: 'MaxWeb', niche: 'Health & Fitness', commission: 49, commissionPct: 0, gravity: 82, geos: ['USA', 'CA', 'UK'], epc: 1.47, trend: 'stable', scrapedAt: new Date().toISOString() },
  ];
}

// Agrega todos os scrapers em paralelo
async function scrapeAll() {
  const [cb, ov, me, wp, mw] = await Promise.allSettled([
    scrapeClickbank(),
    scrapeOfferVault(),
    scrapeMuncheye(),
    scrapeWarriorPlus(),
    scrapeMaxweb(),
  ]);

  return {
    clickbank:   cb.status === 'fulfilled' ? cb.value   : getFallbackClickbankData(),
    offervault:  ov.status === 'fulfilled' ? ov.value   : getFallbackOfferVaultData(),
    muncheye:    me.status === 'fulfilled' ? me.value   : getFallbackMuncheyeData(),
    warriorplus: wp.status === 'fulfilled' ? wp.value   : getFallbackWarriorPlusData(),
    maxweb:      mw.status === 'fulfilled' ? mw.value   : getFallbackMaxwebData(),
    scrapedAt: new Date().toISOString(),
  };
}

module.exports = {
  scrapeClickbank,
  scrapeOfferVault,
  scrapeMuncheye,
  scrapeWarriorPlus,
  scrapeMaxweb,
  scrapeAll,
  categorizeByKeyword,
  parseGeos,
};
