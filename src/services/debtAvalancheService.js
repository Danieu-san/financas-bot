function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function cloneDebts(debts) {
    return debts.map(d => ({
        name: d.name,
        balance: Number(d.balance || 0),
        minPayment: Number(d.minPayment || 0),
        rate: Number(d.monthlyRatePct || 0) / 100
    }));
}

function hasActiveDebt(debts) {
    return debts.some(d => d.balance > 0.01);
}

function simulateBaseline(debtsInput, maxMonths = 600) {
    const debts = cloneDebts(debtsInput);
    let months = 0;
    let totalInterest = 0;

    while (hasActiveDebt(debts) && months < maxMonths) {
        months += 1;
        for (const debt of debts) {
            if (debt.balance <= 0) continue;
            const interest = debt.balance * debt.rate;
            totalInterest += interest;
            debt.balance += interest;
            const payment = Math.min(debt.minPayment, debt.balance);
            debt.balance = round2(debt.balance - payment);
        }
    }

    return {
        months,
        totalInterest: round2(totalInterest),
        finished: !hasActiveDebt(debts)
    };
}

function simulateAvalanche(debtsInput, extraBudget = 0, maxMonths = 600) {
    const debts = cloneDebts(debtsInput);
    const baseMinBudget = debts.reduce((s, d) => s + d.minPayment, 0);
    const monthlyBudget = Math.max(0, baseMinBudget + Number(extraBudget || 0));

    let months = 0;
    let totalInterest = 0;
    const order = [];

    while (hasActiveDebt(debts) && months < maxMonths) {
        months += 1;
        let remainingBudget = monthlyBudget;

        // Aplica juros
        for (const debt of debts) {
            if (debt.balance <= 0) continue;
            const interest = debt.balance * debt.rate;
            totalInterest += interest;
            debt.balance += interest;
        }

        // Paga mínimos
        for (const debt of debts) {
            if (debt.balance <= 0) continue;
            const minPayment = Math.min(debt.minPayment, debt.balance);
            const payment = Math.min(minPayment, remainingBudget);
            debt.balance = round2(debt.balance - payment);
            remainingBudget -= payment;
        }

        // Direciona saldo ao maior juros
        while (remainingBudget > 0.01 && hasActiveDebt(debts)) {
            const target = debts
                .filter(d => d.balance > 0.01)
                .sort((a, b) => {
                    if (b.rate !== a.rate) return b.rate - a.rate;
                    return b.balance - a.balance;
                })[0];
            if (!target) break;

            if (!order.includes(target.name)) {
                order.push(target.name);
            }

            const payment = Math.min(target.balance, remainingBudget);
            target.balance = round2(target.balance - payment);
            remainingBudget -= payment;
        }
    }

    return {
        months,
        totalInterest: round2(totalInterest),
        finished: !hasActiveDebt(debts),
        order
    };
}

function buildDebtAvalanchePlan({ debts, extraBudget }) {
    if (!debts || debts.length === 0) {
        return null;
    }

    const baseline = simulateBaseline(debts);
    const avalanche = simulateAvalanche(debts, extraBudget);
    const interestSaved = round2(Math.max(0, baseline.totalInterest - avalanche.totalInterest));
    const monthsSaved = Math.max(0, baseline.months - avalanche.months);

    return {
        baseline,
        avalanche,
        interestSaved,
        monthsSaved,
        recommendedExtraBudget: round2(Math.max(0, Number(extraBudget || 0)))
    };
}

module.exports = {
    buildDebtAvalanchePlan
};

