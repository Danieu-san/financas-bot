const http = require('http');
const { dashboardV2Html } = require('../src/services/dashboardV2Page');

const port = Number.parseInt(process.env.DASHBOARD_V2_PREVIEW_PORT || '8791', 10);
const fixture = {
    version: 'dashboard-summary-v2',
    period: { month: 6, year: 2026, label: 'Julho de 2026' },
    scope: { mode: 'family', label: 'Família', members: [] },
    blocks: {
        cash: { status: 'available', currentBalance: 6840.25, periodInflows: 9200, periodDirectOutflows: 4380, periodCardCommitments: 1210, periodEconomicBalance: 3610, criteria: 'Caixa atual usa o saldo das contas; o período separa saídas diretas e cartão.' },
        competence: { status: 'available', realizedExpenses: 5590, categories: [{ category: 'Moradia', total: 2600 }, { category: 'Alimentação', total: 1120 }, { category: 'Transporte', total: 680 }], criteria: 'Gastos por competência, incluindo cartão no mês de cobrança.' },
        reserve: { status: 'available', applied: 900, redeemed: 150, net: 750, availableBalance: 6090.25, criteria: 'Disponível desconta o movimento líquido de reserva.' },
        budget: { status: 'available', globalBudget: 7200, allocatedBudget: 6200, unallocatedBudget: 1000, overallocatedBudget: 0, actualBudget: 5590, remainingBudget: 1610, dailyPace: 107.33, categories: [{ category: 'Alimentação', plannedAmount: 1500, actualAmount: 1120 }, { category: 'Transporte', plannedAmount: 900, actualAmount: 680 }, { category: 'Lazer', plannedAmount: 600, actualAmount: 410 }], criteria: 'Orçamento pelo ciclo familiar configurado.' },
        accounts: { status: 'available', totalBalance: 6840.25, count: 3, items: [{ name: 'Conta principal', accountType: 'Conta corrente', responsible: 'Daniel', status: 'Ativa', balance: 3180.25 }, { name: 'Conta da casa', accountType: 'Conta conjunta', responsible: 'Família', status: 'Ativa', balance: 2460 }, { name: 'Reserva imediata', accountType: 'Caixinha', responsible: 'Família', status: 'Ativa', balance: 1200 }], criteria: 'Saldos atuais da fonte canônica de contas.' },
        invoices: { status: 'available', total: 1210, count: 2, items: [{ description: 'Fatura Nubank', value: 760, isoDate: '2026-07-20' }, { description: 'Fatura Atacadão', value: 450, isoDate: '2026-07-24' }], criteria: 'Faturas previstas por data de vencimento.' },
        forecast: { status: 'available', payable: 1890, receivable: 600, netExpectedCash: -1290, currentCashImpact: 0, count: 4, items: [{ domain: 'invoice', description: 'Fatura Nubank', value: 760, isoDate: '2026-07-20' }, { domain: 'bill', description: 'Energia', value: 280, isoDate: '2026-07-18' }, { domain: 'bill', description: 'Escola', value: 850, isoDate: '2026-07-22' }, { domain: 'income', description: 'Reembolso', value: 600, isoDate: '2026-07-25' }], criteria: 'Previsões por vencimento não alteram o caixa atual.' },
        goals: { status: 'available', count: 2, items: [{ name: 'Reserva de emergência', target: 24000, current: 9400, progressPct: 39.2, status: 'Ativa', scope: 'family' }, { name: 'Viagem em família', target: 8000, current: 3200, progressPct: 40, status: 'Ativa', scope: 'family' }], criteria: 'Metas atuais do snapshot read-only.' },
        debts: { status: 'available', count: 1, items: [{ name: 'Financiamento', creditor: 'Banco', saldoAtual: 18400, jurosPct: 1.1, status: 'Ativa' }], criteria: 'Dívidas atuais do snapshot read-only.' },
        quality: { status: 'partial', classifiedCount: 86, pendingCount: 4, unreconciledCount: 2, coveragePct: 95.6, criteria: 'Cobertura fornecida pelo read-model confiável.' },
        recentTransactions: { status: 'available', count: 3, items: [{ date: '13/07/2026', description: 'Supermercado', value: 286.4, typeLabel: 'Saída' }, { date: '12/07/2026', description: 'Salário', value: 5200, typeLabel: 'Entrada' }, { date: '11/07/2026', description: 'Farmácia', value: 74.9, typeLabel: 'Cartão' }], criteria: 'Lançamentos recentes por tipo.' }
    }
};

http.createServer((req, res) => {
    if (req.url.startsWith('/dashboard/api/v2/summary')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(fixture));
        return;
    }
    if (req.url.startsWith('/dashboard/v2')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(dashboardV2Html());
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
}).listen(port, '127.0.0.1', () => {
    process.stdout.write(`Dashboard v2 preview: http://127.0.0.1:${port}/dashboard/v2#token=fixture\n`);
});
