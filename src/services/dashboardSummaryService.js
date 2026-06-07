const { parseValue } = require('../utils/helpers');

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function formatCurrencyBR(value) {
    const numeric = typeof value === 'number' ? value : parseValue(value);
    const abs = Math.abs(Number(numeric || 0));
    const formatted = 'R$ ' + abs.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return Number(numeric || 0) < 0 ? `-${formatted}` : formatted;
}

function buildDashboardCriteria() {
    return {
        balance: 'Critério: entradas usam data de recebimento/lançamento; saídas usam data da compra/lançamento; cartões do dashboard mensal entram pela data da compra. Transferências internas não entram como renda nem gasto.',
        available: 'Critério: disponível estimado = saldo econômico - reserva/caixinha líquida aplicada ou resgatada no período.',
        categories: 'Critério: categorias somam Saídas e Cartão do período; cartões do dashboard mensal entram pela data da compra.',
        budget: 'Critério: orçamento usa o ciclo configurado; cartões entram pelo vencimento/competência da parcela, como no dashboard.',
        recentTransactions: 'Critério: recentes distinguem Entrada, Saída, Cartão e Transferência; compras parceladas aparecem agrupadas quando a fonte permite.'
    };
}

function decorateDashboardSummary(summary = {}) {
    if (!summary || typeof summary !== 'object') return summary;
    return {
        ...summary,
        criteria: {
            ...buildDashboardCriteria(),
            ...(summary.criteria || {})
        }
    };
}

function periodLabel(period = {}) {
    if (period.label) return period.label;
    const month = Number(period.month);
    const year = Number(period.year);
    if (Number.isInteger(month) && month >= 0 && month < 12 && Number.isInteger(year)) {
        return `${MONTH_NAMES[month]} de ${year}`;
    }
    return 'periodo selecionado';
}

function buildDashboardWhatsAppSummary(summary = {}) {
    const decorated = decorateDashboardSummary(summary);
    const kpis = decorated.kpis || {};
    const topCategories = Array.isArray(decorated.topCategories) ? decorated.topCategories.slice(0, 5) : [];
    const recentTransactions = Array.isArray(decorated.recentTransactions) ? decorated.recentTransactions.slice(0, 5) : [];
    const criteria = decorated.criteria || {};
    const totalOut = Number(kpis.saidas || 0) + Number(kpis.cartoes || 0);
    const sourceLabel = decorated.source === 'personal_sheet'
        ? 'planilha pessoal/read-model'
        : 'read-model/dashboard';

    const lines = [
        `Resumo do dashboard - ${periodLabel(decorated.period)}`,
        `Entradas: ${formatCurrencyBR(kpis.entradas || 0)}`,
        `Saídas + cartões: ${formatCurrencyBR(totalOut)}`,
        `Saldo: ${formatCurrencyBR(kpis.saldo || 0)}`,
        `Disponível estimado: ${formatCurrencyBR(kpis.saldoDisponivelEstimado ?? kpis.saldo ?? 0)}`,
        `Reserva/caixinha líquida: ${formatCurrencyBR(kpis.reservaLiquida || 0)}`
    ];

    if (topCategories.length > 0) {
        lines.push('', 'Top categorias:');
        topCategories.forEach((item, index) => {
            lines.push(`${index + 1}. ${item.category || 'Outros'}: ${formatCurrencyBR(item.value || 0)}`);
        });
    }

    if (recentTransactions.length > 0) {
        lines.push('', 'Lançamentos recentes:');
        recentTransactions.forEach((item) => {
            const label = item.typeLabel || (item.type === 'entrada' ? 'Entrada' : item.type === 'cartao' ? 'Cartão' : item.type === 'transferencia' ? 'Transferência' : 'Saída');
            lines.push(`- ${label}: ${item.date || '-'} - ${item.description || 'Sem descrição'} (${formatCurrencyBR(item.value || 0)})`);
        });
    }

    lines.push(
        '',
        criteria.balance,
        criteria.available,
        criteria.categories,
        criteria.budget,
        criteria.recentTransactions,
        `Fonte: ${sourceLabel}.`
    );

    return lines.filter(Boolean).join('\n');
}

module.exports = {
    buildDashboardCriteria,
    decorateDashboardSummary,
    buildDashboardWhatsAppSummary,
    formatCurrencyBR
};
