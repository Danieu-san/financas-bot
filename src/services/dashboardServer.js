const http = require('http');
const { URL } = require('url');
const { syncReadModelIfNeeded, getDashboardSnapshot } = require('./readModelService');
const { verifyDashboardToken } = require('../utils/dashboardAuth');
const logger = require('../utils/logger');

let server = null;

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function sendHtml(res, html) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
}

function dashboardHtml() {
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Painel Financeiro</title>
  <style>
    :root {
      --bg-1: #f5f2ea;
      --bg-2: #e9f2f4;
      --card: #ffffff;
      --ink: #1d1b1a;
      --muted: #5e5b57;
      --accent: #0f766e;
      --danger: #b42318;
      --ok: #166534;
      --border: #d8d2c9;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Trebuchet MS", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 10% 10%, #fff7e6 0%, transparent 35%),
        radial-gradient(circle at 90% 0%, #e1f5f2 0%, transparent 40%),
        linear-gradient(180deg, var(--bg-1), var(--bg-2));
      min-height: 100vh;
    }
    .wrap { max-width: 1024px; margin: 0 auto; padding: 20px 14px 40px; }
    h1 { margin: 0; font-size: 1.6rem; letter-spacing: .2px; }
    .subtitle { margin: 6px 0 18px; color: var(--muted); font-size: .95rem; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
    .field {
      border: 1px solid var(--border);
      background: #fff;
      border-radius: 10px;
      padding: 8px 10px;
      font-size: .95rem;
    }
    .btn {
      border: 0;
      background: var(--accent);
      color: #fff;
      border-radius: 10px;
      padding: 8px 14px;
      cursor: pointer;
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 12px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
    }
    .label { color: var(--muted); font-size: .85rem; margin-bottom: 4px; }
    .value { font-size: 1.2rem; font-weight: 700; }
    .value.ok { color: var(--ok); }
    .value.bad { color: var(--danger); }
    .section { margin-top: 14px; }
    .section h2 { margin: 0 0 8px; font-size: 1.05rem; }
    .bars { display: grid; gap: 8px; }
    .bar-row { display: grid; grid-template-columns: 120px 1fr auto; gap: 8px; align-items: center; }
    .bar-track { background: #e8e4de; border-radius: 999px; height: 10px; overflow: hidden; }
    .bar-fill { background: linear-gradient(90deg, #0f766e, #0ea5a0); height: 100%; }
    .list { display: grid; gap: 7px; }
    .line { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dashed #e5ddd3; padding-bottom: 5px; font-size: .92rem; }
    .muted { color: var(--muted); }
    .error {
      background: #fff3f2;
      color: #8f1d18;
      border: 1px solid #f3c8c5;
      border-radius: 10px;
      padding: 10px;
      display: none;
      margin-top: 10px;
    }
    @media (max-width: 700px) {
      .grid { grid-template-columns: 1fr; }
      .bar-row { grid-template-columns: 90px 1fr auto; }
      .wrap { padding: 14px 10px 30px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Painel Financeiro</h1>
    <div class="subtitle">Visão rápida do seu mês com alertas práticos.</div>
    <div class="toolbar">
      <select id="month" class="field"></select>
      <select id="year" class="field"></select>
      <button id="refresh" class="btn">Atualizar</button>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Entradas</div><div id="kpiEntradas" class="value">-</div></div>
      <div class="card"><div class="label">Saídas + Cartões</div><div id="kpiSaidas" class="value">-</div></div>
      <div class="card"><div class="label">Saldo</div><div id="kpiSaldo" class="value">-</div></div>
      <div class="card"><div class="label">Dívidas Ativas</div><div id="kpiDebts" class="value">-</div></div>
    </div>

    <div class="section card">
      <h2>Top Categorias</h2>
      <div id="categories" class="bars"></div>
    </div>

    <div class="section card">
      <h2>Lançamentos Recentes</h2>
      <div id="recent" class="list"></div>
    </div>

    <div class="section card">
      <h2>Metas</h2>
      <div id="goals" class="list"></div>
    </div>

    <div id="error" class="error"></div>
  </div>

  <script>
    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const qs = new URLSearchParams(window.location.search);
    const token = qs.get('token') || '';
    const monthEl = document.getElementById('month');
    const yearEl = document.getElementById('year');
    const errorEl = document.getElementById('error');
    const now = new Date();

    function brl(v){ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0)); }
    function esc(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

    function setupFilters() {
      for (let i = 0; i < 12; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = monthNames[i];
        if (i === now.getMonth()) opt.selected = true;
        monthEl.appendChild(opt);
      }
      for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = String(y);
        if (y === now.getFullYear()) opt.selected = true;
        yearEl.appendChild(opt);
      }
    }

    async function loadData() {
      errorEl.style.display = 'none';
      if (!token) {
        errorEl.textContent = 'Token ausente. Abra pelo link enviado no WhatsApp.';
        errorEl.style.display = 'block';
        return;
      }
      const month = monthEl.value;
      const year = yearEl.value;
      const url = '/dashboard/api/summary?token=' + encodeURIComponent(token) + '&month=' + encodeURIComponent(month) + '&year=' + encodeURIComponent(year);
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar painel');
        render(data);
      } catch (e) {
        errorEl.textContent = e.message || 'Falha no carregamento';
        errorEl.style.display = 'block';
      }
    }

    function render(data) {
      const k = data.kpis || {};
      document.getElementById('kpiEntradas').textContent = brl(k.entradas);
      document.getElementById('kpiSaidas').textContent = brl((k.saidas || 0) + (k.cartoes || 0));
      const saldoEl = document.getElementById('kpiSaldo');
      saldoEl.textContent = brl(k.saldo);
      saldoEl.className = 'value ' + ((k.saldo || 0) >= 0 ? 'ok' : 'bad');
      document.getElementById('kpiDebts').textContent = (k.debtActiveCount || 0) + ' | ' + brl(k.debtTotal || 0);

      const cats = data.topCategories || [];
      const maxCat = Math.max(1, ...cats.map(c => Number(c.value || 0)));
      document.getElementById('categories').innerHTML = cats.length ? cats.map(c => {
        const pct = Math.max(3, Math.round((Number(c.value||0) / maxCat) * 100));
        return '<div class="bar-row"><div class="muted">' + esc(c.category) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><div>' + brl(c.value) + '</div></div>';
      }).join('') : '<div class="muted">Sem dados no período.</div>';

      const recent = data.recentTransactions || [];
      document.getElementById('recent').innerHTML = recent.length ? recent.map(r => {
        return '<div class="line"><span>' + esc(r.date) + ' · ' + esc(r.description) + '</span><strong>' + brl(r.value) + '</strong></div>';
      }).join('') : '<div class="muted">Sem lançamentos recentes.</div>';

      const goals = data.goals || [];
      document.getElementById('goals').innerHTML = goals.length ? goals.map(g => {
        return '<div class="line"><span>' + esc(g.name) + ' (' + Number(g.progressPct||0).toFixed(1) + '%)</span><strong>' + brl(g.current) + ' / ' + brl(g.target) + '</strong></div>';
      }).join('') : '<div class="muted">Sem metas cadastradas.</div>';
    }

    setupFilters();
    document.getElementById('refresh').addEventListener('click', loadData);
    loadData();
  </script>
</body>
</html>`;
}

async function handleApiSummary(reqUrl, res) {
    const token = reqUrl.searchParams.get('token') || '';
    const payload = verifyDashboardToken(token);
    if (!payload) {
        sendJson(res, 401, { error: 'Token inválido ou expirado.' });
        return;
    }

    const month = reqUrl.searchParams.get('month');
    const year = reqUrl.searchParams.get('year');

    try {
        await syncReadModelIfNeeded();
        const snapshot = getDashboardSnapshot(payload.uid, { month, year });
        sendJson(res, 200, snapshot);
    } catch (error) {
        logger.error(`dashboard api error: ${error.message}`);
        sendJson(res, 500, { error: 'Falha ao carregar dados do dashboard.' });
    }
}

function startDashboardServer() {
    if (server) return server;
    const enabled = String(process.env.DASHBOARD_ENABLED || 'true').toLowerCase() !== 'false';
    if (!enabled) {
        logger.info('dashboard: desabilitado por DASHBOARD_ENABLED=false');
        return null;
    }

    const port = Number.parseInt(process.env.DASHBOARD_PORT || '8787', 10);
    const host = process.env.DASHBOARD_HOST || '0.0.0.0';

    server = http.createServer(async (req, res) => {
        const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        if (req.method === 'GET' && reqUrl.pathname === '/dashboard') {
            sendHtml(res, dashboardHtml());
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/dashboard/api/summary') {
            await handleApiSummary(reqUrl, res);
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/dashboard/health') {
            sendJson(res, 200, { ok: true });
            return;
        }
        sendJson(res, 404, { error: 'Rota não encontrada.' });
    });

    server.listen(port, host, () => {
        logger.info(`dashboard: servidor web ativo em http://${host}:${port}`);
    });

    return server;
}

module.exports = { startDashboardServer };

