const fs = require('node:fs');
const path = require('node:path');
const metrics = require('../utils/metrics');

const DEFAULT_MAX_MODEL_CALLS_PER_QUESTION = 2;
const DEFAULT_MAX_MODEL_CALLS_PER_MONTH = 240;

function boundedInteger(value, fallback, { min = 0, max = 100000 } = {}) {
    const number = Number.parseInt(value, 10);
    if (!Number.isInteger(number) || number < min || number > max) return fallback;
    return number;
}

function monthKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit'
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${byType.year}-${byType.month}`;
}

function getCostEnvelope(env = process.env) {
    return {
        maxModelCallsPerQuestion: boundedInteger(
            env.FINANCIAL_AGENT_MAX_MODEL_CALLS_PER_QUESTION,
            DEFAULT_MAX_MODEL_CALLS_PER_QUESTION,
            { min: 0, max: 10 }
        ),
        maxModelCallsPerMonth: boundedInteger(
            env.FINANCIAL_AGENT_MAX_MODEL_CALLS_PER_MONTH,
            DEFAULT_MAX_MODEL_CALLS_PER_MONTH,
            { min: 0, max: 100000 }
        )
    };
}

function readUsage(statePath) {
    if (!fs.existsSync(statePath)) return { version: 1, month: '', reservedCalls: 0 };
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return {
        version: 1,
        month: /^\d{4}-\d{2}$/.test(String(parsed?.month || '')) ? parsed.month : '',
        reservedCalls: boundedInteger(parsed?.reservedCalls, 0)
    };
}

function writeUsage(statePath, usage) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(usage, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, statePath);
}

function createFinancialAgentCostGuard({
    env = process.env,
    now = () => new Date(),
    statePath = env.FINANCIAL_AGENT_COST_STATE_PATH || path.resolve(process.cwd(), 'data', 'financial-agent-cost-usage.json')
} = {}) {
    const envelope = getCostEnvelope(env);
    let reservedForQuestion = 0;

    function deny(reason, stage) {
        metrics.increment('financial_agent.cost_budget.blocked');
        metrics.increment(`financial_agent.cost_budget.blocked.${reason}`);
        return { allowed: false, reason, stage };
    }

    function reserveModelCall(stage = 'unspecified') {
        if (reservedForQuestion >= envelope.maxModelCallsPerQuestion) {
            return deny('per_question_limit', stage);
        }

        const currentMonth = monthKey(now());
        let usage;
        try {
            usage = readUsage(statePath);
        } catch (error) {
            return deny('usage_state_unavailable', stage);
        }
        const reservedThisMonth = usage.month === currentMonth ? usage.reservedCalls : 0;
        if (reservedThisMonth >= envelope.maxModelCallsPerMonth) {
            return deny('monthly_limit', stage);
        }

        try {
            writeUsage(statePath, {
                version: 1,
                month: currentMonth,
                reservedCalls: reservedThisMonth + 1
            });
        } catch (error) {
            return deny('usage_state_unavailable', stage);
        }

        reservedForQuestion += 1;
        metrics.increment('financial_agent.cost_budget.reserved');
        metrics.increment(`financial_agent.cost_budget.reserved.${stage}`);
        return { allowed: true, stage };
    }

    return {
        reserveModelCall,
        getEnvelope: () => ({ ...envelope }),
        getQuestionUsage: () => reservedForQuestion
    };
}

module.exports = {
    DEFAULT_MAX_MODEL_CALLS_PER_QUESTION,
    DEFAULT_MAX_MODEL_CALLS_PER_MONTH,
    getCostEnvelope,
    createFinancialAgentCostGuard,
    __test__: {
        monthKey,
        readUsage
    }
};
