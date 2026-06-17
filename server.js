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

function resolveDates(days, from, to) {
  return {
    from: from || daysAgo(days),
    to:   to   || daysAgo(0),
  };
}

function isConfigured(...keys) {
  return keys.every(k => process.env[k] && process.env[k].trim() !== '');
}

// ═══════════════════════════════════════════════════════════════
// ── BUYGOODS ───────────────────────────────────────────────────
// Usa ClickCRM (mesmo do Maxweb) + endpoint próprio de comissões
// Auth: account_id=BUYGOODS_AFFILIATE_ID & token=BUYGOODS_API_KEY
// ═══════════════════════════════════════════════════════════════
async function fetchBuygoods(days = 30, from = null, to = null) {
  if (!isConfigured('BUYGOODS_API_KEY', 'BUYGOODS_AFFILIATE_ID')) {
    return { source: 'buygoods', status: 'no_credentials', data: null };
  }

  const dates = resolveDates(days, from, to);
  const token = process.env.BUYGOODS_API_KEY;
  const accountId = process.env.BUYGOODS_AFFILIATE_ID;

  try {
    // Busca vendas por dia (ClickCRM) + produtos (Buygoods API) em paralelo
    const [bydayRes, productsRes] = await Promise.allSettled([
      axios.get('https://api.clickcrm.com/affiliates/v1/byday', {
        params: { a: accountId, token, date_from: dates.from, date_to: dates.to, response_type: 'json' },
        timeout: 10000,
      }),
      axios.get('https://api.buygoods.com/affiliates/api/v1/commissions.php', {
        params: { account_id: accountId, token, date_from: dates.from, date_to: dates.to },
        timeout: 10000,
      }),
    ]);

    // Agrega totais do /byday
    const rows = bydayRes.status === 'fulfilled' ? (bydayRes.value.data?.data || []) : [];
    const totalCommission = rows.reduce((s, r) => s + parseFloat(r.net_commissions ?? r.gross_commissions ?? 0), 0);
    const totalConversions = rows.reduce((s, r) => s + parseInt(r.conversions_count ?? 0), 0);

    // Produtos do endpoint de comissões da Buygoods
    const prodData = productsRes.status === 'fulfilled' ? (productsRes.value.data?.data || []) : [];
    const products = prodData
      .filter(p => p.product_name && p.product_name !== '(No Product)')
      .map(p => ({
        name: p.product_name,
        network: 'Buygoods',
        conversions: parseInt(p.items ?? 0),
        commission: parseFloat(p.net_commissions ?? p.item_commissions_amount ?? 0),
      }))
      .sort((a, b) => b.commission - a.commission)
      .slice(0, 10);

    return {
      source: 'buygoods',
      status: 'ok',
      data: { totalCommission, conversions: totalConversions, products },
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
async function fetchMaxweb(days = 30, from = null, to = null) {
  if (!isConfigured('MAXWEB_TOKEN', 'MAXWEB_AFFILIATE_ID')) {
    return { source: 'maxweb', status: 'no_credentials', data: null };
  }

  const dates = resolveDates(days, from, to);
  const params = {
    a:             process.env.MAXWEB_AFFILIATE_ID,
    token:         process.env.MAXWEB_TOKEN,
    date_from:     dates.from,
    date_to:       dates.to,
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
// ROUTES
// ═══════════════════════════════════════════════════════════════

// GET /api/status — verifica quais redes estão configuradas
app.get('/api/status', (req, res) => {
  res.json({
    networks: {
      buygoods: isConfigured('BUYGOODS_API_KEY', 'BUYGOODS_AFFILIATE_ID'),
      maxweb:   isConfigured('MAXWEB_TOKEN', 'MAXWEB_AFFILIATE_ID'),
    },
  });
});

// GET /api/all?days=30&from=2026-01-01&to=2026-01-31 — agrega dados de todas as redes
app.get('/api/all', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const from = req.query.from || null;
  const to   = req.query.to   || null;

  const [bg, mw] = await Promise.all([
    fetchBuygoods(days, from, to),
    fetchMaxweb(days, from, to),
  ]);

  const results = [bg, mw];

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

app.get('/api/buygoods', async (req, res) => res.json(await fetchBuygoods(parseInt(req.query.days) || 30)));
app.get('/api/maxweb',   async (req, res) => res.json(await fetchMaxweb(parseInt(req.query.days) || 30)));

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

app.get('/api/market/buygoods', async (req, res) => {
  try { res.json(await publicData.getBuygoodsMarketplace(parseInt(req.query.limit) || 30)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/market/audit — agrega Clickbank + Buygoods para auditoria de oportunidades
app.get('/api/market/audit', async (req, res) => {
  try {
    const category = req.query.category || 'health';
    const network  = req.query.network  || 'all';

    const [cbRes, bgRes] = await Promise.allSettled([
      publicData.getClickbankTopProducts(category, 50),
      publicData.getBuygoodsMarketplace(30),
    ]);

    const parseComm = s => parseFloat(String(s || '0').replace(/[^0-9.]/g, '')) || 0;

    let products = [];

    if (cbRes.status === 'fulfilled' && (network === 'all' || network === 'clickbank')) {
      (cbRes.value.products || []).forEach(p => products.push({
        name:       p.name,
        network:    'Clickbank',
        category:   p.category || category,
        commission: parseComm(p.initComm) || parseComm(p.avgComm),
        avgComm:    p.avgComm || '',
        gravity:    p.gravity || 0,
        vendor:     p.vendor || '',
        geos:       'US,CA,GB,AU',
        status:     p.gravity > 200 ? 'hot' : p.gravity > 80 ? 'scaling' : 'stable',
      }));
    }

    if (bgRes.status === 'fulfilled' && (network === 'all' || network === 'buygoods')) {
      (bgRes.value.products || bgRes.value.offers || []).forEach(p => {
        const name = p.name || p.title || p.product_name;
        if (!name) return;
        products.push({
          name,
          network:    'Buygoods',
          category:   p.category || 'Health',
          commission: parseComm(p.payout || p.commission || p.price),
          avgComm:    '',
          gravity:    0,
          vendor:     '',
          geos:       'US,CA,GB,AU',
          status:     (p.badge || '').toLowerCase().includes('best') ? 'hot' : 'stable',
        });
      });
    }

    products = products
      .filter(p => p.name && p.name.length > 1)
      .sort((a, b) => (b.commission - a.commission) || (b.gravity - a.gravity));

    const bestComm    = products.length ? Math.max(...products.map(p => p.commission)) : 0;
    const bestGravity = products.filter(p => p.gravity > 0).reduce((m, p) => Math.max(m, p.gravity), 0);
    const topCategory = [...new Set(products.map(p => p.category).filter(Boolean))][0] || category;

    res.json({
      summary: { total: products.length, bestCommission: bestComm, bestGravity, topCategory },
      products,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/market/network/:name — ofertas públicas de uma rede específica via OfferVault
app.get('/api/market/network/:name', async (req, res) => {
  try { res.json(await publicData.getOffersByNetwork(req.params.name, req.query.keyword || 'health')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/market/mediascalers — ofertas MediaScalers (aprovadas + marketplace)
app.get('/api/market/mediascalers', (req, res) => {
  res.json(publicData.getMediaScalersOffers());
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
