# 🚀 Affiliate Hub — Como Configurar e Rodar

## 1. Instalar dependências

Abra o terminal na pasta `affiliate-backend` e rode:

```bash
npm install
```

## 2. Configurar credenciais

```bash
# Copie o arquivo de exemplo
copy .env.example .env
```

Abra o `.env` e preencha as chaves de cada rede:

| Rede | Onde pegar a API Key |
|------|----------------------|
| **Clickbank** | accounts.clickbank.com → Settings → API Keys |
| **Buygoods** | Dashboard Buygoods → Settings → API |
| **Maxweb** | maxweb.com → Account → API Settings |
| **Gurumedia** | gurumedia.com → Settings → API Keys |
| **Fellas Ads** | Painel de afiliado → Integrations → API |
| **Media Scalers** | Dashboard → Account → Developer |
| **Smart ADV** | Painel → Settings → API Token |
| **Smashloud** | Dashboard → API / Integrations |

> Você **não precisa** configurar todas de uma vez — o servidor funciona mesmo sem algumas chaves,
> retornando `"status": "no_credentials"` para as redes não configuradas.

## 3. Rodar o servidor

```bash
node server.js
```

Ou em modo de desenvolvimento (reinicia automaticamente ao salvar):

```bash
npx nodemon server.js
```

## 4. Verificar conexões

Acesse no navegador:

- **Status**: http://localhost:3001/api/status
- **Todos os dados**: http://localhost:3001/api/all?days=30
- **Só Clickbank**: http://localhost:3001/api/clickbank
- **Só Buygoods**: http://localhost:3001/api/buygoods

## 5. Abrir o dashboard

Abra o arquivo `affiliate-dashboard.html` no navegador.
O dashboard vai buscar dados do servidor local automaticamente.

## 6. Postbacks S2S (Buygoods, Maxweb, etc.)

Algumas redes enviam conversões via postback em vez de API.
Configure no painel delas a URL de postback:

```
http://SEU_IP_LOCAL:3001/api/postback
```

ou, se tiver domínio/servidor:

```
https://seudominio.com/api/postback
```

## Estrutura dos arquivos

```
affiliate-backend/
├── server.js          ← Backend principal
├── package.json
├── .env.example       ← Template de credenciais
├── .env               ← Suas credenciais reais (não commitar!)
└── COMO_USAR.md       ← Este arquivo
```
