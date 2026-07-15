const DASHBOARD_V2_ROUTE = '/dashboard/v2';

function dashboardV2Html() {
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>Casa em foco · FinançasBot</title>
  <style>
    :root {
      --canvas: #f3f0e8;
      --surface: #fffdf8;
      --surface-strong: #ffffff;
      --ink: #17202a;
      --muted: #5d6873;
      --line: #d8d4ca;
      --navy: #17324d;
      --navy-soft: #e7eef4;
      --green: #176b5b;
      --green-soft: #e5f2ee;
      --amber: #8a5a09;
      --amber-soft: #fff3d6;
      --red: #9f2d24;
      --red-soft: #fbe9e6;
      --focus: #005fcc;
      --shadow: 0 12px 34px rgba(23, 32, 42, .08);
      --radius: 18px;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-width: 280px;
      background: var(--canvas);
      color: var(--ink);
      font-family: "Segoe UI", "Trebuchet MS", Arial, sans-serif;
      line-height: 1.45;
    }
    button, select { font: inherit; }
    button:focus-visible, select:focus-visible, summary:focus-visible, a:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 3px;
    }
    .skip-link {
      position: fixed;
      left: 12px;
      top: -80px;
      z-index: 20;
      padding: 10px 14px;
      border-radius: 10px;
      background: #fff;
      color: var(--navy);
      font-weight: 800;
    }
    .skip-link:focus { top: 12px; }
    .shell { width: min(1180px, 100%); margin: 0 auto; padding: 14px 12px 48px; }
    .hero {
      overflow: hidden;
      border-radius: 24px;
      background: var(--navy);
      color: #fff;
      box-shadow: var(--shadow);
    }
    .hero-main { padding: 24px 20px 20px; }
    .eyebrow {
      margin: 0 0 8px;
      color: #bdd8e7;
      font-size: .76rem;
      font-weight: 900;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    h1 { margin: 0; max-width: 720px; font-size: clamp(2rem, 9vw, 4.6rem); line-height: .94; letter-spacing: -.055em; }
    .hero-copy { max-width: 650px; margin: 16px 0 0; color: #d9e6ee; font-size: 1rem; }
    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 20px;
    }
    .hero-chip {
      padding: 7px 10px;
      border: 1px solid rgba(255,255,255,.26);
      border-radius: 999px;
      color: #fff;
      font-size: .82rem;
      font-weight: 750;
    }
    .hero-tools {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      padding: 14px;
      background: #0f263c;
    }
    .field { display: grid; gap: 5px; min-width: 0; }
    .field label { color: #c8d8e4; font-size: .72rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
    .field select {
      width: 100%;
      min-height: 44px;
      padding: 8px 10px;
      border: 1px solid #6d8294;
      border-radius: 11px;
      background: #fff;
      color: var(--ink);
    }
    .refresh {
      grid-column: 1 / -1;
      min-height: 46px;
      border: 0;
      border-radius: 11px;
      background: #f4c95d;
      color: #25313a;
      cursor: pointer;
      font-weight: 900;
    }
    .refresh[disabled] { cursor: wait; opacity: .72; }
    .notice {
      display: none;
      margin: 14px 0 0;
      padding: 13px 14px;
      border: 1px solid #e6b7b1;
      border-radius: 13px;
      background: var(--red-soft);
      color: #7e221b;
      font-weight: 700;
    }
    .loading {
      margin-top: 14px;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--muted);
    }
    main[aria-busy="true"] > :not(.loading) { opacity: .62; }
    .section { margin-top: 18px; }
    .section-heading { display: flex; justify-content: space-between; gap: 14px; align-items: end; margin: 0 2px 10px; }
    .section-heading h2 { margin: 0; color: var(--navy); font-size: clamp(1.3rem, 5vw, 1.85rem); letter-spacing: -.025em; }
    .section-heading p { display: none; margin: 0; max-width: 520px; color: var(--muted); text-align: right; font-size: .88rem; }
    .summary-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
    .metric-card, .panel {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface-strong);
      box-shadow: var(--shadow);
    }
    .metric-card { min-height: 158px; padding: 18px; }
    .metric-top { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
    .metric-label { color: var(--muted); font-size: .82rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .metric-value { margin: 18px 0 8px; font-size: clamp(1.65rem, 8vw, 2.4rem); line-height: 1; font-weight: 850; letter-spacing: -.045em; overflow-wrap: anywhere; }
    .metric-note { margin: 0; color: var(--muted); font-size: .84rem; }
    .status {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 8px;
      border-radius: 999px;
      background: var(--green-soft);
      color: #0c584a;
      font-size: .72rem;
      font-weight: 850;
      white-space: nowrap;
    }
    .status.partial, .status.fallback { background: var(--amber-soft); color: #714504; }
    .status.unavailable { background: #eceae5; color: #545b61; }
    .panel { padding: 17px; min-width: 0; }
    .panel-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 14px; }
    .panel-head h3 { margin: 0; color: var(--navy); font-size: 1.08rem; }
    .panel-kicker { margin: 4px 0 0; color: var(--muted); font-size: .82rem; }
    .two-column { display: grid; grid-template-columns: 1fr; gap: 10px; }
    .mini-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .mini-stat { padding: 12px; border: 1px solid #e4e0d7; border-radius: 13px; background: var(--surface); }
    .mini-stat span { display: block; color: var(--muted); font-size: .76rem; }
    .mini-stat strong { display: block; margin-top: 4px; font-size: 1.02rem; overflow-wrap: anywhere; }
    .list { display: grid; gap: 8px; }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      padding: 11px 0;
      border-bottom: 1px solid #e8e4dc;
    }
    .row:last-child { border-bottom: 0; padding-bottom: 0; }
    .row:first-child { padding-top: 0; }
    .row-title { font-weight: 800; overflow-wrap: anywhere; }
    .row-meta { margin-top: 3px; color: var(--muted); font-size: .8rem; overflow-wrap: anywhere; }
    .row-value { font-weight: 850; text-align: right; white-space: nowrap; }
    .empty { padding: 14px; border: 1px dashed #bbb6aa; border-radius: 13px; background: var(--surface); color: var(--muted); }
    .unavailable { border-color: #cbc6bb; background: #f7f5ef; }
    .table-wrap { overflow-x: auto; margin: 0 -4px; padding: 0 4px; }
    table { width: 100%; min-width: 480px; border-collapse: collapse; font-size: .86rem; }
    th, td { padding: 10px 8px; border-bottom: 1px solid #e4e0d7; text-align: left; }
    th { color: var(--muted); font-size: .72rem; letter-spacing: .04em; text-transform: uppercase; }
    td:last-child, th:last-child { text-align: right; }
    details.explain { margin-top: 14px; border-top: 1px solid #e2ded5; padding-top: 11px; }
    details.explain summary { cursor: pointer; color: var(--navy); font-weight: 800; }
    .criteria { margin: 9px 0 0; color: var(--muted); font-size: .84rem; }
    .quality-card { border-left: 5px solid var(--green); }
    .quality-card.partial, .quality-card.fallback { border-left-color: var(--amber); }
    .quality-card.unavailable { border-left-color: #8b9297; }
    .footer { margin: 24px 2px 0; color: var(--muted); font-size: .8rem; }
    .footer strong { color: var(--ink); }
    @media (min-width: 640px) {
      .shell { padding: 20px 18px 60px; }
      .hero-main { padding: 32px 30px 26px; }
      .hero-tools { grid-template-columns: 1fr 1fr auto; align-items: end; padding: 16px 20px; }
      .refresh { grid-column: auto; min-width: 128px; }
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .section-heading p { display: block; }
      .panel { padding: 20px; }
    }
    @media (max-width: 639px) {
      table { min-width: 0; font-size: .78rem; }
      th, td { padding: 9px 4px; }
      th { font-size: .64rem; }
    }
    @media (min-width: 920px) {
      .shell { padding-top: 28px; }
      .hero { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(300px, .7fr); }
      .hero-tools { grid-template-columns: 1fr 1fr; align-content: center; padding: 24px; }
      .refresh { grid-column: 1 / -1; }
      .summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .two-column { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  </style>
</head>
<body>
  <a class="skip-link" href="#conteudo">Pular para os números</a>
  <div class="shell">
    <header class="hero">
      <div class="hero-main">
        <p class="eyebrow">FinançasBot · painel experimental</p>
        <h1>Casa em foco.</h1>
        <p class="hero-copy">O que está disponível hoje, como o ciclo está andando e quais compromissos merecem atenção.</p>
        <div class="hero-meta">
          <span id="todayChip" class="hero-chip">Hoje</span>
          <span id="periodChip" class="hero-chip">Carregando ciclo…</span>
          <span id="scopeChip" class="hero-chip">Escopo protegido</span>
        </div>
      </div>
      <div class="hero-tools" aria-label="Filtros do período">
        <div class="field"><label for="month">Mês</label><select id="month"></select></div>
        <div class="field"><label for="year">Ano</label><select id="year"></select></div>
        <button id="refresh" class="refresh" type="button">Atualizar visão</button>
      </div>
    </header>

    <div id="notice" class="notice" role="alert"></div>
    <main id="conteudo" aria-busy="true">
      <div id="loading" class="loading" role="status" aria-live="polite">Organizando os dados do seu ciclo…</div>

      <section class="section" aria-labelledby="todayTitle">
        <div class="section-heading"><div><p class="eyebrow" style="color:var(--green)">Decisão de hoje</p><h2 id="todayTitle">O essencial primeiro</h2></div><p>Caixa, disponível e resultado econômico aparecem separados para não misturar conceitos.</p></div>
        <div id="todayMetrics" class="summary-grid"></div>
      </section>

      <section class="section" aria-labelledby="cycleTitle">
        <div class="section-heading"><div><p class="eyebrow" style="color:var(--green)">Ciclo atual</p><h2 id="cycleTitle">Planejado e realizado</h2></div><p>O orçamento usa o mesmo contrato que responde às perguntas pelo WhatsApp.</p></div>
        <div id="cycleGrid" class="two-column"></div>
      </section>

      <section class="section" aria-labelledby="structureTitle">
        <div class="section-heading"><div><p class="eyebrow" style="color:var(--green)">Estrutura</p><h2 id="structureTitle">Onde está e o que vence</h2></div><p>Contas, faturas e próximos compromissos sem alterar o caixa antes da hora.</p></div>
        <div id="structureGrid" class="two-column"></div>
      </section>

      <section class="section" aria-labelledby="plansTitle">
        <div class="section-heading"><div><p class="eyebrow" style="color:var(--green)">Planos e histórico</p><h2 id="plansTitle">Compromissos de longo prazo</h2></div><p>Metas, dívidas e atividade recente para conferir o que compõe os totais.</p></div>
        <div id="plansGrid" class="two-column"></div>
      </section>

      <section class="section" aria-labelledby="qualityTitle">
        <div class="section-heading"><div><p class="eyebrow" style="color:var(--green)">Confiança</p><h2 id="qualityTitle">Qualidade dos dados</h2></div><p>Fonte indisponível não é tratada como valor zero.</p></div>
        <div id="qualityPanel"></div>
      </section>
    </main>
    <p class="footer"><strong>Versão de avaliação.</strong> O painel atual continua sendo o padrão. Este painel é somente leitura e não permite trocar o usuário pelo navegador.</p>
  </div>

  <script>
    var monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    var token = readDashboardToken();
    var dashboardSessionId = readDashboardSessionId('v2');
    var monthEl = document.getElementById('month');
    var yearEl = document.getElementById('year');
    var refreshEl = document.getElementById('refresh');
    var noticeEl = document.getElementById('notice');
    var mainEl = document.getElementById('conteudo');

    function esc(value) {
      return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (char) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];
      });
    }
    function numberOrNull(value) {
      if (value === null || value === undefined || value === '') return null;
      var numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }
    function money(value) {
      var numeric = numberOrNull(value);
      if (numeric === null) return 'Indisponível';
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numeric);
    }
    function plainNumber(value, suffix) {
      var numeric = numberOrNull(value);
      if (numeric === null) return 'Indisponível';
      return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(numeric) + (suffix || '');
    }
    function statusName(status) {
      return ({available:'Disponível', fallback:'Fonte alternativa', partial:'Parcial', unavailable:'Indisponível'})[status] || 'Disponível';
    }
    function statusBadge(status) {
      var safe = ['available','fallback','partial','unavailable'].includes(status) ? status : 'available';
      return '<span class="status ' + safe + '">' + statusName(safe) + '</span>';
    }
    function details(block) {
      var criteria = block && block.criteria ? block.criteria : 'Critério não informado pela fonte.';
      return '<details class="explain"><summary>De onde vêm estes números?</summary><p class="criteria">' + esc(criteria) + '</p></details>';
    }
    function empty(text, unavailable) {
      return '<div class="empty' + (unavailable ? ' unavailable' : '') + '">' + esc(text) + '</div>';
    }
    function blockUnavailable(block) {
      return block && block.status === 'unavailable';
    }
    function row(title, meta, value) {
      return '<div class="row"><div><div class="row-title">' + esc(title) + '</div>' + (meta ? '<div class="row-meta">' + esc(meta) + '</div>' : '') + '</div><div class="row-value">' + esc(value) + '</div></div>';
    }
    function miniStat(label, value) {
      return '<div class="mini-stat"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
    }
    function panel(title, kicker, status, content, detailHtml, extraClass) {
      return '<article class="panel ' + esc(extraClass || '') + '"><div class="panel-head"><div><h3>' + esc(title) + '</h3><p class="panel-kicker">' + esc(kicker || '') + '</p></div>' + statusBadge(status) + '</div>' + content + (detailHtml || '') + '</article>';
    }
    function readDashboardToken() {
      var query = new URLSearchParams(window.location.search);
      var hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
      var fromUrl = hash.get('token') || query.get('token') || '';
      if (fromUrl) {
        try {
          sessionStorage.setItem('financasbot_dashboard_token', fromUrl);
          history.replaceState(null, '', window.location.pathname);
        } catch (_error) {}
        return fromUrl;
      }
      try { return sessionStorage.getItem('financasbot_dashboard_token') || ''; } catch (_error) { return ''; }
    }
    function readDashboardSessionId(version) {
      var key = 'financasbot_dashboard_session_' + version;
      try {
        var current = sessionStorage.getItem(key) || '';
        if (/^[A-Za-z0-9-]{8,64}$/.test(current)) return current;
        var created = window.crypto && typeof window.crypto.randomUUID === 'function'
          ? window.crypto.randomUUID()
          : 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
        sessionStorage.setItem(key, created);
        return created;
      } catch (_error) {
        return '';
      }
    }
    function dashboardRequestOptions(trigger) {
      return {
        headers: {
          'Accept': 'application/json',
          'X-FinancasBot-Dashboard-Session': dashboardSessionId,
          'X-FinancasBot-Dashboard-Trigger': trigger
        }
      };
    }
    function setupFilters() {
      var now = new Date();
      monthNames.forEach(function (name, index) {
        var option = document.createElement('option');
        option.value = String(index);
        option.textContent = name;
        option.selected = index === now.getMonth();
        monthEl.appendChild(option);
      });
      for (var year = now.getFullYear() - 3; year <= now.getFullYear() + 1; year += 1) {
        var yearOption = document.createElement('option');
        yearOption.value = String(year);
        yearOption.textContent = String(year);
        yearOption.selected = year === now.getFullYear();
        yearEl.appendChild(yearOption);
      }
      document.getElementById('todayChip').textContent = 'Hoje · ' + new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(now);
    }
    function metricCard(label, value, note, status) {
      return '<article class="metric-card"><div class="metric-top"><span class="metric-label">' + esc(label) + '</span>' + statusBadge(status) + '</div><div class="metric-value">' + esc(value) + '</div><p class="metric-note">' + esc(note) + '</p></article>';
    }
    function renderToday(blocks) {
      var cash = blocks.cash || {};
      var reserve = blocks.reserve || {};
      var competence = blocks.competence || {};
      var forecast = blocks.forecast || {};
      document.getElementById('todayMetrics').innerHTML = [
        metricCard('Saldo nas contas', money(cash.currentBalance), 'Caixa atual, não resultado do mês.', cash.status),
        metricCard('Disponível estimado', money(reserve.availableBalance), 'Saldo após o movimento líquido de reserva.', reserve.status),
        metricCard('Saldo econômico', money(cash.periodEconomicBalance), 'Entradas menos saídas e cartão no período.', cash.status),
        metricCard('Gasto por competência', money(competence.realizedExpenses), 'Inclui cartão pela competência de cobrança.', competence.status)
      ].join('');
    }
    function renderBudget(block) {
      var unavailable = blockUnavailable(block);
      var summary = unavailable ? empty('O orçamento por categoria não está disponível para este período. Isso não significa orçamento zero.', true) :
        '<div class="mini-grid">' +
          miniStat('Orçamento total', money(block.globalBudget)) +
          miniStat('Realizado', money(block.actualBudget)) +
          miniStat('Restante', money(block.remainingBudget)) +
          miniStat('Ritmo diário', money(block.dailyPace)) +
        '</div>';
      var categories = Array.isArray(block.categories) ? block.categories : [];
      var table = categories.length ? '<div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Planejado</th><th>Realizado</th></tr></thead><tbody>' + categories.map(function (item) {
        return '<tr><td>' + esc(item.category || 'Sem categoria') + '</td><td>' + esc(money(item.plannedAmount)) + '</td><td>' + esc(money(item.actualAmount)) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : empty(unavailable ? 'Categorias indisponíveis.' : 'Nenhuma categoria alocada neste ciclo.', unavailable);
      return panel('Orçamento do ciclo', 'Planejado versus realizado', block.status, summary + '<div style="height:12px"></div>' + table, details(block));
    }
    function renderCompetence(block) {
      var categories = Array.isArray(block.categories) ? block.categories : [];
      var content = blockUnavailable(block) ? empty('A competência não pôde ser consultada. O valor desconhecido não foi convertido em zero.', true) :
        '<div class="mini-grid">' + miniStat('Realizado', money(block.realizedExpenses)) + miniStat('Categorias', plainNumber(categories.length)) + '</div>' +
        '<div class="list" style="margin-top:14px">' + (categories.length ? categories.map(function (item) {
          return row(item.category || 'Sem categoria', 'Competência da fatura quando aplicável', money(item.total !== undefined ? item.total : item.value));
        }).join('') : empty('Sem gastos categorizados nesta competência.', false)) + '</div>';
      return panel('Categorias por competência', 'Consumo reconhecido no período', block.status, content, details(block));
    }
    function renderAccounts(block) {
      var items = Array.isArray(block.items) ? block.items : [];
      var content = blockUnavailable(block) ? empty('Os saldos das contas estão indisponíveis. Nenhum zero foi presumido.', true) :
        '<div class="mini-grid">' + miniStat('Saldo total', money(block.totalBalance)) + miniStat('Contas', plainNumber(block.count)) + '</div><div class="list" style="margin-top:14px">' +
        (items.length ? items.map(function (item) {
          return row(item.name || 'Conta', [item.accountType, item.responsible, item.status].filter(Boolean).join(' · '), money(item.balance));
        }).join('') : empty('Nenhuma conta disponível nesta leitura.', false)) + '</div>';
      return panel('Contas', 'Posição atual', block.status, content, details(block));
    }
    function datedItem(item) {
      var value = item.isoDate || item.dueDate || item.date || '';
      var iso = String(value).match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
      return iso ? iso[3] + '/' + iso[2] + '/' + iso[1] : (value || 'Data não informada');
    }
    function domainLabel(domain) {
      return ({invoice:'Fatura', bill:'Conta', income:'Receita', installment:'Parcela', debt:'Dívida'})[String(domain || '').toLowerCase()] || '';
    }
    function renderInvoices(block) {
      var items = Array.isArray(block.items) ? block.items : [];
      var content = blockUnavailable(block) ? empty('As faturas previstas estão indisponíveis. Isso não significa que não existam faturas.', true) :
        '<div class="mini-grid">' + miniStat('Total previsto', money(block.total)) + miniStat('Faturas', plainNumber(block.count)) + '</div><div class="list" style="margin-top:14px">' +
        (items.length ? items.map(function (item) { return row(item.description || item.name || 'Fatura', datedItem(item), money(item.value !== undefined ? item.value : item.amount)); }).join('') : empty('Nenhuma fatura prevista neste período.', false)) + '</div>';
      return panel('Faturas', 'Compromissos por vencimento', block.status, content, details(block));
    }
    function renderForecast(block) {
      var items = Array.isArray(block.items) ? block.items : [];
      var content = blockUnavailable(block) ? empty('Os próximos vencimentos estão indisponíveis. Eles não foram tratados como zero.', true) :
        '<div class="mini-grid">' + miniStat('A pagar', money(block.payable)) + miniStat('A receber', money(block.receivable)) + miniStat('Saldo previsto', money(block.netExpectedCash)) + miniStat('Impacto no caixa hoje', money(block.currentCashImpact)) + '</div><div class="list" style="margin-top:14px">' +
        (items.length ? items.map(function (item) { return row(item.description || item.name || 'Compromisso', [datedItem(item), domainLabel(item.domain)].filter(Boolean).join(' · '), money(item.value !== undefined ? item.value : item.amount)); }).join('') : empty('Nenhum vencimento previsto neste período.', false)) + '</div>';
      return panel('Próximos vencimentos', 'Previsão sem antecipar efeito no caixa', block.status, content, details(block));
    }
    function renderCollection(title, kicker, block, kind) {
      var items = Array.isArray(block.items) ? block.items : [];
      var content = blockUnavailable(block) ? empty('Esta coleção está indisponível na fonte atual.', true) : '<div class="list">' + (items.length ? items.map(function (item) {
        if (kind === 'goal') return row(item.name || 'Meta', [plainNumber(item.progressPct, '%'), item.status, item.scope === 'family' ? 'Familiar' : 'Pessoal'].filter(Boolean).join(' · '), money(item.current) + ' / ' + money(item.target));
        if (kind === 'debt') return row(item.name || 'Dívida', [item.creditor, item.status, item.jurosPct !== undefined ? plainNumber(item.jurosPct, '% a.m.') : ''].filter(Boolean).join(' · '), money(item.saldoAtual !== undefined ? item.saldoAtual : item.balance));
        var type = item.typeLabel || item.type || 'Lançamento';
        return row(item.description || 'Lançamento', [item.date, type].filter(Boolean).join(' · '), money(item.value));
      }).join('') : empty(kind === 'goal' ? 'Nenhuma meta cadastrada.' : kind === 'debt' ? 'Nenhuma dívida cadastrada.' : 'Nenhum lançamento recente neste período.', false)) + '</div>';
      return panel(title, kicker, block.status, content, details(block));
    }
    function qualityIssueLabel(issue) {
      return ({
        missing_category: 'Sem categoria',
        uncertain: 'Incerto',
        pending: 'Pendente',
        unreconciled: 'Não conciliado',
        missing_financial_account: 'Sem conta financeira',
        missing_required_receipt: 'Sem comprovante obrigatório'
      })[String(issue || '')] || String(issue || 'Pendência');
    }
    function renderQuality(block) {
      var unavailable = blockUnavailable(block);
      var sources = Array.isArray(block.bySource) ? block.bySource : [];
      var items = Array.isArray(block.items) ? block.items : [];
      var receiptValue = block.receiptIndicatorStatus === 'not_applicable'
        ? 'Não aplicável'
        : plainNumber(block.missingRequiredReceiptCount);
      var content = unavailable ? empty('A fonte ainda não fornece indicadores confiáveis de qualidade. A ausência não foi transformada em cobertura zero.', true) :
        '<div class="mini-grid">' +
          miniStat('Sem categoria', plainNumber(block.missingCategoryCount)) +
          miniStat('Incertos', plainNumber(block.uncertainCount)) +
          miniStat('Status pendente', plainNumber(block.pendingStatusCount)) +
          miniStat('Não conciliados', plainNumber(block.unreconciledCount)) +
          miniStat('Sem conta financeira', plainNumber(block.missingFinancialAccountCount)) +
          miniStat('Comprovante obrigatório', receiptValue) +
          miniStat('Itens para revisar', plainNumber(block.pendingCount)) +
          miniStat('Cobertura de categoria', plainNumber(block.coveragePct, '%')) +
        '</div>' +
        '<div style="height:16px"></div><h3 style="margin:0 0 8px">Cobertura por origem</h3><div class="list">' +
          (sources.length ? sources.map(function (source) {
            return row(source.source || 'Origem não informada', 'Itens para revisar: ' + plainNumber(source.pendingCount), plainNumber(source.coveragePct, '%'));
          }).join('') : empty('Nenhuma origem observada neste período.', false)) +
        '</div><div style="height:16px"></div><h3 style="margin:0 0 8px">Pendências encontradas</h3><div class="list">' +
          (items.length ? items.map(function (item) {
            var issues = Array.isArray(item.issues) ? item.issues.map(qualityIssueLabel).join(' · ') : 'Revisão necessária';
            return row(item.description || 'Item sem descrição', [item.date, item.source, item.category].filter(Boolean).join(' · '), issues);
          }).join('') : empty('Nenhuma pendência observada neste período.', false)) +
        '</div>';
      document.getElementById('qualityPanel').innerHTML = panel('Confiança desta leitura', unavailable ? 'Indicadores aguardando fonte confiável' : 'Cobertura e pendências', block.status, content, details(block), 'quality-card ' + (block.status || 'available'));
    }
    function render(data) {
      var blocks = data.blocks || {};
      var period = data.period || {};
      var scope = data.scope || {};
      document.getElementById('periodChip').textContent = period.label || (monthNames[Number(period.month)] + ' de ' + String(period.year || ''));
      document.getElementById('scopeChip').textContent = 'Escopo · ' + (scope.label || (scope.mode === 'family' ? 'Família' : 'Pessoal'));
      renderToday(blocks);
      document.getElementById('cycleGrid').innerHTML = renderBudget(blocks.budget || {}) + renderCompetence(blocks.competence || {});
      document.getElementById('structureGrid').innerHTML = renderAccounts(blocks.accounts || {}) + renderInvoices(blocks.invoices || {}) + renderForecast(blocks.forecast || {});
      document.getElementById('plansGrid').innerHTML = renderCollection('Metas', 'Progresso acumulado', blocks.goals || {}, 'goal') + renderCollection('Dívidas', 'Saldos atuais', blocks.debts || {}, 'debt') + renderCollection('Atividade recente', 'Itens que ajudam a conferir os totais', blocks.recentTransactions || {}, 'recent');
      renderQuality(blocks.quality || {});
    }
    async function loadData(trigger) {
      noticeEl.style.display = 'none';
      noticeEl.textContent = '';
      if (!token) {
        noticeEl.textContent = 'Link sem autorização. Abra o painel pelo link enviado no WhatsApp.';
        noticeEl.style.display = 'block';
        mainEl.setAttribute('aria-busy', 'false');
        document.getElementById('loading').style.display = 'none';
        return;
      }
      refreshEl.disabled = true;
      mainEl.setAttribute('aria-busy', 'true');
      document.getElementById('loading').style.display = '';
      try {
        var url = '/dashboard/api/v2/summary?token=' + encodeURIComponent(token) + '&month=' + encodeURIComponent(monthEl.value) + '&year=' + encodeURIComponent(yearEl.value);
        var response = await fetch(url, dashboardRequestOptions(trigger || 'initial'));
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o painel.');
        render(data);
      } catch (error) {
        noticeEl.textContent = error && error.message ? error.message : 'Falha ao carregar o painel.';
        noticeEl.style.display = 'block';
      } finally {
        refreshEl.disabled = false;
        mainEl.setAttribute('aria-busy', 'false');
        document.getElementById('loading').style.display = 'none';
      }
    }
    setupFilters();
    refreshEl.addEventListener('click', function () { loadData('refresh'); });
    monthEl.addEventListener('change', function () { loadData('filter'); });
    yearEl.addEventListener('change', function () { loadData('filter'); });
    loadData('initial');
  </script>
</body>
</html>`;
}

module.exports = { DASHBOARD_V2_ROUTE, dashboardV2Html };
