# Affiliate Intelligence

Dashboard completo para monitoramento de redes de afiliados com dados públicos de mercado.

## Redes suportadas

| Rede | API | Status |
|------|-----|--------|
| Clickbank | Oficial | Configuravel |
| Buygoods | Oficial | Configuravel |
| Maxweb | ClickCRM | Configuravel |
| Gurumedia | Everflow | Configuravel |
| Smashloud | Everflow | Configuravel |
| Media Scalers | Postback S2S | Sem API |
| Fellas Ads | — | Em verificacao |
| Smart ADV | — | Em verificacao |

## Funcionalidades

- **Dashboard de performance** — KPIs, graficos, leaderboards por rede/produto/pais
- **Cruzamento Produto x Pais** — heatmap e rankings interativos
- **Mercado Publico** — dados sem login:
  - Clickbank top products por Gravity Score (via CBEngine)
  - OfferVault — 200+ redes agregadas
  - Google Trends por nicho de saude
  - Interesse por pais em tempo real
- **Alertas de ROI** — notifica produtos abaixo do threshold definido
- **Exportar Excel** — relatorio completo com produtos, redes e GEOs
- **Auto-refresh** — atualiza a cada 5 minutos

## Instalacao local

```bash
# 1. Clone o repositorio
git clone https://github.com/felipepicorelli86-sudo/affiliate-intelligence.git
cd affiliate-intelligence

# 2. Instale as dependencias do backend
cd backend
npm install

# 3. Configure as credenciais
cp .env.example .env
# Edite o .env com suas API keys

# 4. Inicie o servidor
node server.js
```

Abra `frontend.html` no navegador. O dashboard conecta automaticamente em `localhost:3001`.

## Deploy no Railway

1. Fork este repositorio
2. Acesse [railway.app](https://railway.app) e crie um projeto a partir do GitHub
3. Adicione as variaveis de ambiente do `.env.example` no painel do Railway
4. O servidor sobe automaticamente

Atualize `API_BASE` no `frontend.html` para a URL publica do Railway.

## Endpoints do backend

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/status` | Status de todas as redes |
| GET | `/api/all` | Dados agregados de todas as redes |
| GET | `/api/market` | Dados publicos agregados |
| GET | `/api/market/clickbank` | Top produtos Clickbank |
| GET | `/api/market/offers` | Ofertas OfferVault |
| GET | `/api/market/trends` | Google Trends por nicho |
| GET | `/api/market/countries` | Interesse por pais |
| POST | `/api/postback` | Receber postbacks S2S |
| GET | `/api/postbacks` | Listar postbacks recebidos |

## Estrutura

```
affiliate-intelligence/
├── frontend.html          # Dashboard (abrir no navegador)
├── backend/
│   ├── server.js          # API Express principal
│   ├── public-data.js     # Scrapers publicos (OfferVault, CBEngine, Trends)
│   ├── package.json
│   └── .env.example       # Template de credenciais
├── Procfile               # Deploy Heroku/Railway
└── railway.json           # Configuracao Railway
```
