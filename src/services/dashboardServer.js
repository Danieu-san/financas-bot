const http = require('http');
const { URL } = require('url');
const { syncReadModelIfNeeded, getDashboardSnapshot, getDashboardSqlData, isSqliteReady, ALL_USERS_ID } = require('./readModelService');
const { getUserSheetDashboardData } = require('./userSheetAnalyticsService');
const { verifyDashboardToken } = require('../utils/dashboardAuth');
const { getAllUsers, getUserProfileByUserId } = require('./userService');
const { buildGoogleAuthorizationUrl, completeGoogleOAuthCallback } = require('./googleOAuthService');
const { sendWhatsAppMessage } = require('./whatsapp');
const { prepareOnboardingState } = require('../handlers/onboardingHandler');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');

let server = null;

const SECURITY_HEADERS = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const HTML_SECURITY_HEADERS = {
    ...SECURITY_HEADERS,
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
};

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function sendHtml(res, html) {
    res.writeHead(200, { ...HTML_SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
}

function sendHtmlStatus(res, statusCode, html) {
    res.writeHead(statusCode, { ...HTML_SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
}

function safeOAuthPage(title, message) {
    const esc = (value) => String(value || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f2ea; color: #1f2933; font-family: Georgia, 'Times New Roman', serif; }
    main { max-width: 520px; margin: 24px; padding: 28px; border-radius: 20px; background: #fffaf2; border: 1px solid #e4d8c7; box-shadow: 0 18px 60px rgba(31,41,51,.12); }
    h1 { margin: 0 0 12px; font-size: 1.6rem; }
    p { margin: 0; line-height: 1.5; }
  </style>
</head>
<body><main><h1>${esc(title)}</h1><p>${esc(message)}</p></main></body>
</html>`;
}

function buildGoogleConnectionWhatsAppMessage(result = {}) {
    const manualUrl = String(process.env.USER_MANUAL_URL || process.env.FINANCASBOT_USER_MANUAL_URL || '').trim();
    const onboardingQuestion = String(result.onboardingQuestion || '').trim();
    return [
        'Google conectado com sucesso.',
        'Sua planilha foi criada no seu Drive e seu acesso ao FinançasBot está ativo.',
        result.spreadsheetUrl ? `Planilha: ${result.spreadsheetUrl}` : '',
        manualUrl ? `Manual completo somente leitura: ${manualUrl}` : '',
        result.spreadsheetUrl ? 'Comece pela aba "Manual" da planilha para entender as abas. Use também o manual completo acima como referência.' : '',
        'Importante: sua planilha é individual. Seus lançamentos financeiros passam a ser registrados nela quando sua conta Google está conectada.',
        onboardingQuestion ? 'Próximo passo: responda à pergunta abaixo para concluir seu onboarding inicial.' : 'Você já pode usar o bot pelo WhatsApp.',
        onboardingQuestion,
        onboardingQuestion ? 'Depois do onboarding, estes comandos úteis ficam disponíveis:' : 'Comandos úteis:',
        '1) gastei 25 no mercado no pix',
        '2) recebi 2000 de salário',
        '3) dashboard'
    ].filter(Boolean).join('\n');
}

async function buildPostConnectionNotificationPayload(result = {}) {
    let onboardingQuestion = '';
    if (result.userId && result.whatsappId) {
        try {
            const profile = await getUserProfileByUserId(result.userId);
            if (!profile?.onboarding_completed_at) {
                onboardingQuestion = prepareOnboardingState(result.whatsappId);
            }
        } catch (error) {
            logger.warn(`oauth: não foi possível preparar onboarding para user_id=${result.userId}: ${error.message}`);
        }
    }
    return { ...result, onboardingQuestion };
}

async function notifyUserAfterGoogleConnection(result = {}) {
    const whatsappId = String(result.whatsappId || '').trim();
    if (!whatsappId) {
        logger.warn(`oauth: conexão Google sem whatsapp_id para user_id=${result.userId || ''}`);
        return;
    }

    try {
        const payload = await buildPostConnectionNotificationPayload(result);
        await sendWhatsAppMessage(whatsappId, buildGoogleConnectionWhatsAppMessage(payload));
        logger.info(`oauth: confirmação WhatsApp enviada para user_id=${result.userId} whatsapp_id=${whatsappId}`);
    } catch (error) {
        logger.warn(`oauth: falha ao enviar confirmação WhatsApp user_id=${result.userId || ''} whatsapp_id=${whatsappId} error=${error.message}`);
    }
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
    .hero {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 18px;
    }
    h1 { margin: 0; font-size: 1.6rem; letter-spacing: .2px; }
    .subtitle { margin: 6px 0 0; color: var(--muted); font-size: .95rem; }
    .pill {
      border: 1px solid #b7d8d3;
      background: #eefaf8;
      color: #0f5f58;
      border-radius: 999px;
      padding: 7px 10px;
      white-space: nowrap;
      font-size: .85rem;
      font-weight: 700;
    }
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
    .section-grid { display: grid; grid-template-columns: 1.2fr .8fr; gap: 10px; margin-top: 14px; }
    .section h2 { margin: 0 0 8px; font-size: 1.05rem; }
    .chart-card {
      position: relative;
      overflow: hidden;
      background:
        linear-gradient(135deg, rgba(15,118,110,.10), rgba(255,250,242,.94)),
        var(--card);
    }
    .chart-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 8px; }
    .chart-note { color: var(--muted); font-size: .85rem; }
    .finance-chart { width: 100%; min-height: 260px; display: block; }
    .chart-label { font-size: 12px; fill: #5e5b57; }
    .chart-value { font-size: 12px; fill: #1d1b1a; font-weight: 700; }
    .chart-axis { stroke: #d8d2c9; stroke-width: 1; }
    .chart-bar.income { fill: #0f766e; }
    .chart-bar.expense { fill: #b45309; }
    .chart-bar.card { fill: #334155; }
    .chart-bar.balance { fill: #166534; }
    .chart-bar.balance.negative { fill: #b42318; }
    .bars { display: grid; gap: 8px; }
    .bar-row { display: grid; grid-template-columns: 120px 1fr auto; gap: 8px; align-items: center; }
    .bar-track { background: #e8e4de; border-radius: 999px; height: 10px; overflow: hidden; }
    .bar-fill { background: linear-gradient(90deg, #0f766e, #0ea5a0); height: 100%; }
    .list { display: grid; gap: 7px; }
    .line { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dashed #e5ddd3; padding-bottom: 5px; font-size: .92rem; }
    .muted { color: var(--muted); }
    .empty { border: 1px dashed #d8d2c9; border-radius: 10px; padding: 10px; color: var(--muted); background: #fffaf2; }
    .alert { border-left: 4px solid var(--accent); padding: 8px 9px; background: #f5fbfa; border-radius: 8px; }
    .alert.high { border-left-color: var(--danger); background: #fff3f2; }
    .spark-row { display: grid; grid-template-columns: 86px 1fr auto; gap: 8px; align-items: center; font-size: .88rem; }
    .spark-track { height: 8px; border-radius: 999px; overflow: hidden; background: #e8e4de; }
    .spark-fill { height: 100%; background: #0f766e; }
    .spark-fill.bad { background: #b42318; }
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
      .hero { display: block; }
      .pill { display: inline-flex; margin-top: 10px; }
      .section-grid { grid-template-columns: 1fr; }
      .bar-row { grid-template-columns: 90px 1fr auto; }
      .spark-row { grid-template-columns: 76px 1fr auto; }
      .wrap { padding: 14px 10px 30px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div>
        <h1>Painel Financeiro</h1>
        <div class="subtitle">Visão rápida do mês, com contexto para decidir o próximo passo.</div>
      </div>
      <div id="periodBadge" class="pill">Carregando período...</div>
    </header>
    <div class="toolbar">
      <select id="user" class="field" style="display:none"></select>
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

    <div class="section card chart-card">
      <div class="chart-head">
        <h2>Visão Gráfica</h2>
        <div class="chart-note">Entradas, saídas, cartão e saldo do período</div>
      </div>
      <div id="financeChart" class="finance-chart" role="img" aria-label="Gráfico financeiro do período"></div>
    </div>

    <div class="section card">
      <h2>Top Categorias</h2>
      <div id="categories" class="bars"></div>
    </div>

    <div class="section-grid">
      <div class="card">
        <h2>Alertas</h2>
        <div id="alerts" class="list"></div>
      </div>
      <div class="card">
        <h2>Fluxo Diário</h2>
        <div id="cashflow" class="list"></div>
      </div>
    </div>

    <div class="section card">
      <h2>Lançamentos Recentes</h2>
      <div id="recent" class="list"></div>
    </div>

    <div class="section card">
      <h2>Dívidas</h2>
      <div id="debts" class="list"></div>
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
    const userEl = document.getElementById('user');
    const monthEl = document.getElementById('month');
    const yearEl = document.getElementById('year');
    const errorEl = document.getElementById('error');
    const now = new Date();

    function brl(v){ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0)); }
    function esc(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function compactMoney(v){
      return new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(Number(v||0));
    }

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

    async function setupUsers() {
      if (!token) return;
      try {
        const res = await fetch('/dashboard/api/users?token=' + encodeURIComponent(token));
        const data = await res.json();
        if (!res.ok) return;
        const users = data.users || [];
        if (!users.length) return;
        userEl.innerHTML = users.map(u => '<option value="' + esc(u.value) + '">' + esc(u.label) + '</option>').join('');
        userEl.value = data.defaultUser || users[0].value;
        if (data.isAdmin) userEl.style.display = '';
      } catch (e) {
        // O dashboard continua funcionando como painel pessoal se o seletor falhar.
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
      const userParam = userEl.value ? '&user=' + encodeURIComponent(userEl.value) : '';
      const base = '/dashboard/api';
      try {
        const summaryRes = await fetch(base + '/summary?token=' + encodeURIComponent(token) + userParam + '&month=' + encodeURIComponent(month) + '&year=' + encodeURIComponent(year));
        const summaryData = await summaryRes.json();
        if (!summaryRes.ok) throw new Error(summaryData.error || 'Erro ao carregar dashboard');

        render(summaryData);
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
      const period = data.period || {};
      const selectedUserLabel = userEl.options[userEl.selectedIndex]?.textContent || '';
      const userSuffix = selectedUserLabel && userEl.style.display !== 'none' ? ' · ' + selectedUserLabel : '';
      document.getElementById('periodBadge').textContent = monthNames[Number(period.month ?? monthEl.value)] + ' de ' + (period.year || yearEl.value) + userSuffix;
      renderFinanceChart(k);

      const cats = data.topCategories || [];
      const maxCat = Math.max(1, ...cats.map(c => Number(c.value || 0)));
      document.getElementById('categories').innerHTML = cats.length ? cats.map(c => {
        const pct = Math.max(3, Math.round((Number(c.value||0) / maxCat) * 100));
        return '<div class="bar-row"><div class="muted">' + esc(c.category) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><div>' + brl(c.value) + '</div></div>';
      }).join('') : '<div class="empty">Sem categorias neste período. Registre alguns gastos pelo WhatsApp para ver o mapa de consumo.</div>';

      const alerts = data.alerts || [];
      document.getElementById('alerts').innerHTML = alerts.length ? alerts.map(a => {
        return '<div class="alert ' + esc(a.level) + '"><strong>' + esc(a.code || 'ALERTA') + '</strong><br><span>' + esc(a.message) + '</span></div>';
      }).join('') : '<div class="empty">Nenhum alerta crítico para este período.</div>';

      const flow = data.dailyFlow || [];
      const maxFlow = Math.max(1, ...flow.map(day => Math.abs(Number(day.saldo || 0))));
      document.getElementById('cashflow').innerHTML = flow.length ? flow.slice(-8).map(day => {
        const saldo = Number(day.saldo || 0);
        const pct = Math.max(4, Math.round((Math.abs(saldo) / maxFlow) * 100));
        return '<div class="spark-row"><span class="muted">' + esc(day.date) + '</span><div class="spark-track"><div class="spark-fill ' + (saldo < 0 ? 'bad' : '') + '" style="width:' + pct + '%"></div></div><strong>' + brl(saldo) + '</strong></div>';
      }).join('') : '<div class="empty">Sem fluxo diário no período selecionado.</div>';

      const recent = data.recentTransactions || [];
      document.getElementById('recent').innerHTML = recent.length ? recent.map(r => {
        return '<div class="line"><span>' + esc(r.date) + ' · ' + esc(r.description) + '</span><strong>' + brl(r.value) + '</strong></div>';
      }).join('') : '<div class="empty">Sem lançamentos recentes neste período.</div>';

      const debts = data.debts || [];
      document.getElementById('debts').innerHTML = debts.length ? debts.map(d => {
        const rate = d.jurosPct !== undefined ? ' · ' + Number(d.jurosPct || 0).toFixed(2) + '% a.m.' : '';
        return '<div class="line"><span>' + esc(d.name) + '<span class="muted">' + rate + '</span></span><strong>' + brl(d.saldoAtual || d.balance || 0) + '</strong></div>';
      }).join('') : '<div class="empty">Sem dívidas ativas cadastradas.</div>';

      const goals = data.goals || [];
      document.getElementById('goals').innerHTML = goals.length ? goals.map(g => {
        return '<div class="line"><span>' + esc(g.name) + ' (' + Number(g.progressPct||0).toFixed(1) + '%)</span><strong>' + brl(g.current) + ' / ' + brl(g.target) + '</strong></div>';
      }).join('') : '<div class="empty">Sem metas cadastradas. Uma boa primeira meta é reserva de emergência.</div>';
    }

    function renderFinanceChart(k) {
      const items = [
        { label: 'Entradas', value: Number(k.entradas || 0), cls: 'income' },
        { label: 'Saídas', value: Number(k.saidas || 0), cls: 'expense' },
        { label: 'Cartões', value: Number(k.cartoes || 0), cls: 'card' },
        { label: 'Saldo', value: Number(k.saldo || 0), cls: 'balance' }
      ];
      const max = Math.max(1, ...items.map(item => Math.abs(item.value)));
      const width = 720;
      const height = 260;
      const top = 24;
      const baseline = 188;
      const barW = 88;
      const gap = 70;
      const left = 54;
      const maxBarH = 138;
      const bars = items.map((item, index) => {
        const h = Math.max(4, Math.round((Math.abs(item.value) / max) * maxBarH));
        const x = left + index * (barW + gap);
        const y = item.value >= 0 ? baseline - h : baseline;
        const cls = item.cls + (item.cls === 'balance' && item.value < 0 ? ' negative' : '');
        return [
          '<rect class="chart-bar ' + cls + '" x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="12"></rect>',
          '<text class="chart-value" x="' + (x + barW / 2) + '" y="' + (item.value >= 0 ? y - 8 : y + h + 18) + '" text-anchor="middle">' + esc(compactMoney(item.value)) + '</text>',
          '<text class="chart-label" x="' + (x + barW / 2) + '" y="226" text-anchor="middle">' + esc(item.label) + '</text>'
        ].join('');
      }).join('');
      document.getElementById('financeChart').innerHTML =
        '<svg viewBox="0 0 ' + width + ' ' + height + '" role="presentation" focusable="false">' +
        '<line class="chart-axis" x1="34" y1="' + baseline + '" x2="680" y2="' + baseline + '"></line>' +
        '<text class="chart-label" x="34" y="' + top + '">Maior valor: ' + esc(compactMoney(max)) + '</text>' +
        bars +
        '</svg>';
    }

    setupFilters();
    document.getElementById('refresh').addEventListener('click', loadData);
    monthEl.addEventListener('change', loadData);
    yearEl.addEventListener('change', loadData);
    userEl.addEventListener('change', loadData);
    setupUsers().finally(loadData);
  </script>
</body>
</html>`;
}

function getDashboardDataUserId(payload, reqUrl) {
    if (!payload?.adm) return payload.uid;
    const requested = String(reqUrl.searchParams.get('user') || '').trim();
    if (!requested) return payload.uid;
    if (requested === 'all') return ALL_USERS_ID;
    return requested;
}

function formatDashboardUserOption(user) {
    const status = user.status ? ` · ${user.status}` : '';
    const phone = user.phone_e164 || user.whatsapp_id || user.user_id;
    const name = user.display_name || 'Sem nome';
    return {
        value: user.user_id,
        label: `${name} · ${phone}${status}`
    };
}

function isDashboardSelectableUser(user) {
    return String(user?.status || '').trim() === 'ACTIVE' && !String(user?.deleted_at || '').trim();
}

async function handleApiSummary(reqUrl, res) {
    try {
        const token = reqUrl.searchParams.get('token') || '';
        const payload = verifyDashboardToken(token);
        if (!payload) {
            metrics.increment('dashboard.api.auth_failed');
            sendJson(res, 401, { error: 'Token inválido ou expirado.' });
            return;
        }

        const month = reqUrl.searchParams.get('month');
        const year = reqUrl.searchParams.get('year');

        const dataUserId = getDashboardDataUserId(payload, reqUrl);
        const personal = dataUserId === payload.uid
            ? await getUserSheetDashboardData(dataUserId, { month, year })
            : null;
        if (personal) {
            metrics.increment('dashboard.api.summary.success');
            sendJson(res, 200, personal);
            return;
        }
        await syncReadModelIfNeeded();
        const snapshot = getDashboardSqlData(dataUserId, { month, year }) || getDashboardSnapshot(dataUserId, { month, year });
        metrics.increment('dashboard.api.summary.success');
        sendJson(res, 200, snapshot);
    } catch (error) {
        metrics.increment('dashboard.api.error');
        logger.error(`dashboard api error: ${error.message}`);
        sendJson(res, 500, { error: 'Falha ao carregar dados do dashboard.' });
    }
}

async function withAuth(reqUrl, res, cb) {
    try {
        const token = reqUrl.searchParams.get('token') || '';
        const payload = verifyDashboardToken(token);
        if (!payload) {
            metrics.increment('dashboard.api.auth_failed');
            sendJson(res, 401, { error: 'Token inválido ou expirado.' });
            return;
        }

        const dataUserId = getDashboardDataUserId(payload, reqUrl);
        const personal = dataUserId === payload.uid
            ? await getUserSheetDashboardData(dataUserId, {
                month: reqUrl.searchParams.get('month'),
                year: reqUrl.searchParams.get('year')
            })
            : null;
        if (personal) {
            await cb(payload, dataUserId, personal);
            return;
        }
        await syncReadModelIfNeeded();
        await cb(payload, dataUserId, null);
    } catch (error) {
        metrics.increment('dashboard.api.error');
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
            metrics.increment('dashboard.page.view');
            sendHtml(res, dashboardHtml());
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/oauth/google/start') {
            try {
                const state = reqUrl.searchParams.get('state') || '';
                const location = buildGoogleAuthorizationUrl(state);
                res.writeHead(302, { ...SECURITY_HEADERS, Location: location });
                res.end();
            } catch (error) {
                logger.warn(`oauth google start rejeitado: ${error.message}`);
                sendHtmlStatus(res, 400, safeOAuthPage(
                    'Link de conexão inválido ou expirado',
                    'Peça um novo link pelo WhatsApp para conectar sua conta Google.'
                ));
            }
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/oauth/google/callback') {
            try {
                const code = reqUrl.searchParams.get('code') || '';
                const state = reqUrl.searchParams.get('state') || '';
                if (!code || !state) {
                    throw new Error('Callback OAuth sem code/state.');
                }
                const result = await completeGoogleOAuthCallback({ code, state });
                metrics.increment('oauth.google.callback.success');
                logger.info(`oauth: Google conectado para user_id=${result.userId}`);
                await notifyUserAfterGoogleConnection(result);
                sendHtmlStatus(res, 200, safeOAuthPage(
                    'Google conectado com sucesso',
                    'Pode voltar para o WhatsApp. O FinançasBot vai continuar a configuração por lá.'
                ));
            } catch (error) {
                metrics.increment('oauth.google.callback.error');
                logger.warn(`oauth google callback rejeitado: ${error.message}`);
                sendHtmlStatus(res, 400, safeOAuthPage(
                    'Não foi possível concluir a conexão',
                    'Peça um novo link pelo WhatsApp e tente novamente.'
                ));
            }
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/dashboard/api/summary') {
            await handleApiSummary(reqUrl, res);
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/dashboard/api/users') {
            await withAuth(reqUrl, res, async (payload) => {
                if (!payload.adm) {
                    sendJson(res, 200, {
                        isAdmin: false,
                        defaultUser: payload.uid,
                        users: [{ value: payload.uid, label: 'Meu usuário' }]
                    });
                    return;
                }
                const users = await getAllUsers();
                const activeUsers = users.filter(isDashboardSelectableUser);
                sendJson(res, 200, {
                    isAdmin: true,
                    defaultUser: payload.uid,
                    users: [
                        { value: 'all', label: 'Todos os usuários' },
                        ...activeUsers.map(formatDashboardUserOption)
                    ]
                });
            });
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/dashboard/api/kpis') {
            await withAuth(reqUrl, res, async (payload, dataUserId, personal) => {
                const month = reqUrl.searchParams.get('month');
                const year = reqUrl.searchParams.get('year');
                if (personal) {
                    sendJson(res, 200, {
                        period: personal.period,
                        kpis: personal.kpis,
                        topCategories: personal.topCategories,
                        source: personal.source
                    });
                    return;
                }
                const sql = getDashboardSqlData(dataUserId, { month, year });
                if (sql) {
                    sendJson(res, 200, {
                        period: sql.period,
                        kpis: sql.kpis,
                        topCategories: sql.topCategories,
                        source: 'sqlite'
                    });
                    return;
                }
                const legacy = getDashboardSnapshot(dataUserId, { month, year });
                sendJson(res, 200, {
                    period: legacy.period,
                    kpis: legacy.kpis,
                    topCategories: legacy.topCategories,
                    source: 'memory'
                });
            });
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/dashboard/api/cashflow') {
            await withAuth(reqUrl, res, async (payload, dataUserId, personal) => {
                const month = reqUrl.searchParams.get('month');
                const year = reqUrl.searchParams.get('year');
                if (personal) {
                    sendJson(res, 200, { period: personal.period, dailyFlow: personal.dailyFlow, source: personal.source });
                    return;
                }
                const sql = getDashboardSqlData(dataUserId, { month, year });
                if (sql) {
                    sendJson(res, 200, { period: sql.period, dailyFlow: sql.dailyFlow, source: 'sqlite' });
                    return;
                }
                const legacy = getDashboardSnapshot(dataUserId, { month, year });
                sendJson(res, 200, { period: legacy.period, dailyFlow: legacy.dailyFlow, source: 'memory' });
            });
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/dashboard/api/debts') {
            await withAuth(reqUrl, res, async (payload, dataUserId, personal) => {
                if (personal) {
                    sendJson(res, 200, { debts: personal.debts, source: personal.source });
                    return;
                }
                const sql = getDashboardSqlData(dataUserId, {});
                if (sql) {
                    sendJson(res, 200, { debts: sql.debts, source: 'sqlite' });
                    return;
                }
                const legacy = getDashboardSnapshot(dataUserId, {});
                sendJson(res, 200, { debts: legacy.debts, source: 'memory' });
            });
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/dashboard/api/goals') {
            await withAuth(reqUrl, res, async (payload, dataUserId, personal) => {
                if (personal) {
                    sendJson(res, 200, { goals: personal.goals, source: personal.source });
                    return;
                }
                const sql = getDashboardSqlData(dataUserId, {});
                if (sql) {
                    sendJson(res, 200, { goals: sql.goals, source: 'sqlite' });
                    return;
                }
                const legacy = getDashboardSnapshot(dataUserId, {});
                sendJson(res, 200, { goals: legacy.goals, source: 'memory' });
            });
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/dashboard/api/alerts') {
            await withAuth(reqUrl, res, async (payload, dataUserId, personal) => {
                const month = reqUrl.searchParams.get('month');
                const year = reqUrl.searchParams.get('year');
                if (personal) {
                    sendJson(res, 200, { alerts: personal.alerts, source: personal.source });
                    return;
                }
                const sql = getDashboardSqlData(dataUserId, { month, year });
                if (sql) {
                    sendJson(res, 200, { alerts: sql.alerts, source: 'sqlite' });
                    return;
                }
                const legacy = getDashboardSnapshot(dataUserId, { month, year });
                const alerts = [];
                if ((legacy?.kpis?.saldo || 0) < 0) {
                    alerts.push({ level: 'high', code: 'NEGATIVE_CASHFLOW', message: 'Saldo negativo no período.' });
                }
                sendJson(res, 200, { alerts, source: 'memory' });
            });
            return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/dashboard/health') {
            sendJson(res, 200, { ok: true, sqlite: isSqliteReady() });
            return;
        }
        sendJson(res, 404, { error: 'Rota não encontrada.' });
    });

    server.listen(port, host, () => {
        const address = server.address();
        const activePort = address && typeof address === 'object' ? address.port : port;
        logger.info(`dashboard: servidor web ativo em http://${host}:${activePort}`);
    });

    return server;
}

module.exports = { startDashboardServer };
