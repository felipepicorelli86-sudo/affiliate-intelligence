require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const publicData = require('./public-data');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function isConfigured(...keys) {
  return keys.every(k => process.env[k] && process.env[k].trim() !== '');
}

// ═══════════════════════════════════════════════════════════════
// ── CLICKBANK ──────────────────────────────────────────────────
// Docs: https://support.clickbank.com/en/articles/10535400-clickbank-apis
// Auth: Basic base64(CLICKBANK_API_KEY:CLICKBANK_API_SECRET)
// ═══════════════════════════════════════════════════════════════
async function fetchClickbank(days = 30) {
  if (!isConfigured('CLICKBANK_API_KEY', 'CLICKBANK_API_SECRET')) {
    return { source: 'clickbank', status: 'no_credentials', data: null };
  }

  const creds = Buffer.from(
    `${process.env.CLICKBANK_API_KEY}:${process.env.CLICKBANK_API_SECRET}`
  ).toString('base64');

  const headers = {
    Authorization: `Basic ${creds}`,
    Accept: 'application/json',
    'CB-VERSION': '1.3',
  };

  try {
    // Sales summary
    const [ordersRes, analyticsRes] = await Promise.allSettled([
      axios.get('https://api.clkbank.com/1.3/orders', {
        headers,
        params: {
          startDate: daysAgo(days),
          endDate: daysAgo(0),
          role: 'AFFILIATE',
        },
      }),
      axios.get('https://api.clkbank.com/1.3/analytics/affiliate/sales', {
        headers,
        params: { startDate: daysAgo(days), endDate: daysAgo(0) },
      }),
    ]);

    const orders = ordersRes.status === 'fulfilled' ? ordersRes.value.data : null;
    const analytics = analyticsRes.status === 'fulfilled' ? analyticsRes.value.data : null;

    // Normalize
    const totalComm = analytics?.totalCommission ?? orders?.totalCommissions ?? 0;
    const conversions = analytics?.totalSales ?? orders?.orders?.length ?? 0;

    // Top products from orders
    const products = {};
    (orders?.orders || []).forEach(o => {
      const name = o.productTitle || o.sku || 'Unknown';
      if (!products[name]) products[name] = { name, network: 'Clickbank', conversions: 0, commission: 0 };
      products[name].conversions += 1;
      products[name].commission += parseFloat(o.affiliateCommission || 0);
    });

    return {
      source: 'clickbank',
      status: 'ok',
      data: {
        totalCommission: totalComm,
        conversions,
        products: Object.values(products).sort((a, b) => b.commission - a.commission).slice(0, 10),
        rawAnalytics: analytics,
      },
    };
  } catch (err) {
    return { source: 'clickbank', status: 'error', error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ── BUYGOODS ───────────────────────────────────────────────────
// Auth: API Key no header X-API-Key
// Docs: disponível no dashboard → Settings → API
// ═══════════════════════════════════════════════════════════════
async function fetchBuygoods(days = 30) {
  if (!isConfigured('BUYGOODS_API_KEY')) {
    return { source: 'buygoods', status: 'no_credentials', data: null };
  }

  try {
    const res = await axios.get('https://api.buygoods.com/v1/affiliate/stats', {
      headers: {
        'X-API-Key': process.env.BUYGOODS_API_KEY,
        Accept: 'application/json',
      },
      params: {
        affiliate_id: process.env.BUYGOODS_AFFILIATE_ID,
        date_from: daysAgo(days),
        date_to: daysAgo(0),
      },
    });

    const d = res.data;
    return {
      source: 'buygoods',
      status: 'ok',
      data: {
        totalCommission: d.total_commission ?? d.earnings ?? 0,
        conversions: d.total_sales ?? d.conversions ?? 0,
        products: (d.products || []).map(p => ({
          name: p.name || p.product_name,
          network: 'Buygoods',
          conversions: p.sales || p.conversions || 0,
          commission: p.commission || p.earnings || 0,
        })),
      },
    };
  } catch (err) {
    return { source: 'buygoods', status: 'error', error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ── MAXWEB (powered by ClickCRM) ───────────────────────────────
// API real: https://api.clickcrm.com/affiliates/v2/
// Auth: ?a=AFFILIATE_ID&token=TOKEN  (visível em Maxweb → Links da API)
// Endpoints: /byday  /byhour  /bysubid
// ═══════════════════════════════════════════════════════════════
async function fetchMaxweb(days = 30) {
  if (!isConfigured('MAXWEB_TOKEN', 'MAXWEB_AFFILIATE_ID')) {
    return { source: 'maxweb', status: 'no_credentials', data: null };
  }

  const params = {
    a:             process.env.MAXWEB_AFFILIATE_ID,
    token:         process.env.MAXWEB_TOKEN,
    date_from:     daysAgo(days),
    date_to:       daysAgo(0),
    response_type: 'json',
  };

  try {
    // Vendas por dia — retorna até 50 registros por chamada
    const res = await axios.get('https://api.clickcrm.com/affiliates/v2/byday', { params });
    const rows = res.data?.data || res.data || [];

    // Agrega totais
    let totalCommission = 0;
    let totalConversions = 0;
    const offerMap = {};

    (Array.isArray(rows) ? rows : [rows]).forEach(r => {
      const comm = parseFloat(r.commission ?? r.net_commission ?? r.payout ?? 0);
      const conv = parseInt(r.conversions ?? r.sales ?? 0);
      totalCommission  += comm;
      totalConversions += conv;

      const offerName = r.offer_name || r.offer || r.campaign || 'Maxweb Offer';
      if (!offerMap[offerName]) offerMap[offerName] = { name: offerName, network: 'Maxweb', conversions: 0, commission: 0 };
      offerMap[offerName].conversions += conv;
      offerMap[offerName].commission  += comm;
    });

    return {
      source: 'maxweb',
      status: 'ok',
      data: {
        totalCommission,
        conversions: totalConversions,
        products: Object.values(offerMap)
          .sort((a, b) => b.commission - a.commission)
          .slice(0, 10),
        raw: rows,
      },
    };
  } catch (err) {
    return { source: 'maxweb', status: 'error', error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ── HELPER EVERFLOW — usado por Gurumedia e Smashloud ──────────
// Login Gurumedia:  stats.gurumedia.com  → Account → API Key
// Login Smashloud:  smashloud.everflowclient.io → Account → API Key
// Ambos usam a mesma estrutura de API Everflow
// ═══════════════════════════════════════════════════════════════
async function fetchEverflow(source, apiKey, apiBase, days = 30) {
  try {
    const res = await axios.post(
      `${apiBase}/v1/affiliate/reporting/performance`,
      {
        from: daysAgo(days),
        to: daysAgo(0),
        timezone_id: 80, // UTC
        currency_id: 'USD',
        columns: ['affiliate_id', 'offer_id', 'offer_name', 'conversions', 'payout'],
      },
      {
        headers: {
          'X-Eflow-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    const rows = res.data?.table?.rows || res.data?.rows || [];
    const totalComm = rows.reduce((s, r) => s + (parseFloat(r.payout) || 0), 0);
    const totalConv = rows.reduce((s, r) => s + (parseInt(r.conversions) || 0), 0);

    return {
      source,
      status: 'ok',
      data: {
        totalCommission: totalComm,
        conversions: totalConv,
        products: rows.map(r => ({
          name: r.offer_name || r.name || 'Offer #' + r.offer_id,
          network: source,
          conversions: parseInt(r.conversions) || 0,
          commission: parseFloat(r.payout) || 0,
        })).sort((a, b) => b.commission - a.commission).slice(0, 10),
      },
    };
  } catch (err) {
    return { source, status: 'error', error: err.message };
  }
}

// Gurumedia — Everflow em stats.gurumedia.com
// API Key: stats.gurumedia.com → login → Account Settings → API Key
async function fetchGurumedia(days = 30) {
  if (!isConfigured('GURUMEDIA_API_KEY')) return { source: 'gurumedia', status: 'no_credentials', data: null };
  return fetchEverflow('gurumedia', process.env.GURUMEDIA_API_KEY, 'https://api.gurumedia.com', days);
}

// Smashloud — Everflow em smashloud.everflowclient.io
// API Key: smashloud.everflowclient.io → login → Account Settings → API Key
async function fetchSmashloud(days = 30) {
  if (!isConfigured('SMASHLOUD_API_KEY')) return { source: 'smashloud', status: 'no_credentials', data: null };
  return fetchEverflow('smashloud', process.env.SMASHLOUD_API_KEY, 'https://api.eflow.team', days);
}

// ═══════════════════════════════════════════════════════════════
// ── REDES SEM API CONFIRMADA
// Fellas Ads: domínio inacessível (verificar URL real com o suporte)
// Smart ADV:  site institucional apenas, sem portal de afiliado
// Media Scalers: sem API — usar postback S2S
// ═══════════════════════════════════════════════════════════════
async function fetchGenericNetwork(name, envKey, baseUrl, days = 30) {
  if (!isConfigured(envKey)) {
    return { source: name.toLowerCase().replace(/ /g, '_'), status: 'no_credentials', data: null };
  }

  try {
    const res = await axios.get(`${baseUrl}/stats`, {
      headers: { Authorization: `Bearer ${process.env[envKey]}`, Accept: 'application/json' },
      params: { date_from: daysAgo(days), date_to: daysAgo(0) },
    });

    const d = res.data;
    return {
      source: name,
      status: 'ok',
      data: {
        totalCommission: d.commission ?? d.earnings ?? d.revenue ?? 0,
        conversions: d.conversions ?? d.sales ?? 0,
        products: (d.products || d.offers || []).map(p => ({
          name: p.name || p.offer_name,
          network: name,
          conversions: p.conversions || 0,
          commission: p.commission || p.payout || 0,
        })),
      },
    };
  } catch (err) {
    return { source: name, status: 'error', error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// GET /api/status — verifica quais redes estão configuradas
app.get('/api/status', (req, res) => {
  res.json({
    networks: {
      clickbank:     isConfigured('CLICKBANK_API_KEY', 'CLICKBANK_API_SECRET'),
      buygoods:      isConfigured('BUYGOODS_API_KEY'),
      maxweb:        isConfigured('MAXWEB_TOKEN', 'MAXWEB_AFFILIATE_ID'),
      gurumedia:     isConfigured('GURUMEDIA_API_KEY'),
      fellas_ads:    isConfigured('FELLAS_API_KEY'),
      media_scalers: isConfigured('MEDIA_SCALERS_API_KEY'),
      smart_adv:     isConfigured('SMART_ADV_API_KEY'),
      smashloud:     isConfigured('SMASHLOUD_API_KEY'),
    },
  });
});

// GET /api/all?days=30 — agrega dados de todas as redes
app.get('/api/all', async (req, res) => {
  const days = parseInt(req.query.days) || 30;

  const [cb, bg, mw, gm, sl] = await Promise.all([
    fetchClickbank(days),
    fetchBuygoods(days),
    fetchMaxweb(days),
    fetchGurumedia(days),
    fetchSmashloud(days),
  ]);

  // Media Scalers e Fellas Ads: sem API — dados via postback
  const ms = {
    source: 'media_scalers',
    status: 'no_api',
    message: 'Sem API de afiliado. Configure postback S2S: http://SEU_IP:3001/api/postback',
    data: null,
  };

  const results = [cb, bg, mw, gm, sl, ms];

  // Agrega tudo
  let totalCommission = 0;
  let totalConversions = 0;
  const allProducts = [];

  results.forEach(r => {
    if (r.status === 'ok' && r.data) {
      totalCommission  += parseFloat(r.data.totalCommission) || 0;
      totalConversions += parseInt(r.data.conversions) || 0;
      (r.data.products || []).forEach(p => allProducts.push(p));
    }
  });

  // Top produtos globais
  const topProducts = allProducts
    .sort((a, b) => b.commission - a.commission)
    .slice(0, 15);

  res.json({
    summary: {
      totalCommission: totalCommission.toFixed(2),
      totalConversions,
      networksOk: results.filter(r => r.status === 'ok').length,
      networksMissing: results.filter(r => r.status === 'no_credentials').length,
      networksError: results.filter(r => r.status === 'error').length,
    },
    networks: results,
    topProducts,
  });
});

// GET /api/clickbank?days=30
app.get('/api/clickbank',    async (req, res) => res.json(await fetchClickbank(parseInt(req.query.days) || 30)));
app.get('/api/buygoods',     async (req, res) => res.json(await fetchBuygoods(parseInt(req.query.days) || 30)));
app.get('/api/maxweb',       async (req, res) => res.json(await fetchMaxweb(parseInt(req.query.days) || 30)));
app.get('/api/gurumedia',    async (req, res) => res.json(await fetchGurumedia(parseInt(req.query.days) || 30)));
app.get('/api/smashloud',   async (req, res) => res.json(await fetchSmashloud(parseInt(req.query.days) || 30)));

// ═══════════════════════════════════════════════════════════════
// POSTBACKS S2S — recebe conversões de Media Scalers, Maxweb, etc.
// Configure no painel de cada rede: http://SEU_IP:3001/api/postback
// ═══════════════════════════════════════════════════════════════
app.post('/api/postback', (req, res) => {
  const data = { ...req.query, ...req.body, timestamp: new Date().toISOString() };
  console.log('[POSTBACK]', JSON.stringify(data));
  if (!app.locals.postbacks) app.locals.postbacks = [];
  app.locals.postbacks.unshift(data);
  if (app.locals.postbacks.length > 500) app.locals.postbacks.pop();
  res.json({ ok: true, received: data });
});

// GET /api/postbacks — lista postbacks recebidos
app.get('/api/postbacks', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json({
    total: (app.locals.postbacks || []).length,
    items: (app.locals.postbacks || []).slice(0, limit),
    instruction: 'Configure a URL de postback das redes para: http://localhost:3001/api/postback',
  });
});

// ═══════════════════════════════════════════════════════════════
// DADOS PÚBLICOS DO MERCADO — sem login, sem API key
// Mostra o que está ESCALANDO globalmente em todas as redes
// ═══════════════════════════════════════════════════════════════

app.get('/api/market', async (req, res) => {
  try { res.json(await publicData.getAllPublicData()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/market/offers', async (req, res) => {
  try { res.json(await publicData.getOfferVaultOffers(req.query.keyword || 'health', parseInt(req.query.pages) || 2)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/market/clickbank', async (req, res) => {
  try { res.json(await publicData.getClickbankTopProducts(req.query.category || 'health', parseInt(req.query.limit) || 30)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/market/trends', async (req, res) => {
  try { res.json(await publicData.getGoogleTrends((req.query.keywords || 'weight loss,blood sugar,joint pain').split(','), req.query.geo || '')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/market/countries', async (req, res) => {
  try { res.json(await publicData.getTrendsByCountry(req.query.keyword || 'weight loss supplement')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`[Affiliate Hub] Servidor rodando na porta ${PORT}`);
  console.log('[Affiliate Hub] Endpoints:');
  console.log('  GET  /api/all              — todas as redes configuradas');
  console.log('  GET  /api/market           — dados públicos agregados');
  console.log('  GET  /api/market/offers    — OfferVault scraping');
  console.log('  GET  /api/market/clickbank — Clickbank top products');
  console.log('  GET  /api/market/trends    — Google Trends');
  console.log('  GET  /api/market/countries — interesse por país');
  console.log('  POST /api/postback         — receber postbacks S2S');
  console.log('  GET  /api/postbacks        — listar postbacks recebidos');
});
