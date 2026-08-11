const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
    __test__: { sourceRef }
} = require('../src/openFinance/openFinanceHistoricalImportPlanner');
const {
    merchantSignature
} = require('./buildOpenFinanceHistoricalImportConfig');

function flattenTransactions(snapshot) {
    const values = new Map();
    for (const item of snapshot?.items || []) {
        for (const transaction of item.transactions || []) {
            const value = { ...transaction, item_id: transaction.item_id || item.id };
            values.set(sourceRef(value), value);
        }
    }
    return values;
}

function groupRef(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

function buildReviewBatch({ pluggySnapshot, plan }) {
    const transactions = flattenTransactions(pluggySnapshot);
    const groups = new Map();
    for (const current of plan?.entries || []) {
        if (current.state !== 'needs_review' || current.reason !== 'category_required') {
            continue;
        }
        const transaction = transactions.get(current.source_ref);
        if (!transaction) throw new Error('historical_review_source_missing');
        const signature = merchantSignature(transaction.description) ||
            `single:${current.source_ref}`;
        if (!groups.has(signature)) groups.set(signature, []);
        groups.get(signature).push({ current, transaction });
    }
    const categoryGroups = [...groups.entries()].map(([signature, members]) => ({
        group_ref: groupRef(signature),
        signature,
        count: members.length,
        descriptions: [...new Set(members.map(member =>
            String(member.transaction.description || '').trim()))],
        source_refs: members.map(member => member.current.source_ref)
    })).sort((left, right) => right.count - left.count ||
        left.group_ref.localeCompare(right.group_ref));
    const reasonCounts = {};
    for (const current of plan?.entries || []) {
        if (current.state !== 'needs_review' && current.state !== 'possible_duplicate') {
            continue;
        }
        const key = `${current.state}:${current.reason}`;
        reasonCounts[key] = (reasonCounts[key] || 0) + 1;
    }
    return {
        schema_version: 1,
        source_plan_hash: plan.plan_hash,
        category_groups: categoryGroups,
        reason_counts: reasonCounts,
        summary: {
            category_items: categoryGroups.reduce((total, group) => total + group.count, 0),
            category_groups: categoryGroups.length,
            repeated_groups: categoryGroups.filter(group => group.count > 1).length,
            singleton_groups: categoryGroups.filter(group => group.count === 1).length
        },
        financial_writes: 0
    };
}

function argument(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : '';
}

function requiredAbsolutePath(name) {
    const value = argument(name);
    if (!value || !path.isAbsolute(value)) {
        throw new Error(`historical_review_absolute_path_required:${name}`);
    }
    return path.resolve(value);
}

function isInside(parent, candidate) {
    const contains = (root, target) => {
        const relative = path.relative(root, target);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    };
    const canonicalize = value => {
        let existing = path.resolve(value);
        const missing = [];
        while (!fs.existsSync(existing)) {
            const parentPath = path.dirname(existing);
            if (parentPath === existing) break;
            missing.unshift(path.basename(existing));
            existing = parentPath;
        }
        const real = fs.realpathSync.native
            ? fs.realpathSync.native(existing)
            : fs.realpathSync(existing);
        return path.join(real, ...missing);
    };
    const lexicalParent = path.resolve(parent);
    const lexicalCandidate = path.resolve(candidate);
    return contains(lexicalParent, lexicalCandidate) ||
        contains(canonicalize(lexicalParent), canonicalize(lexicalCandidate));
}

function main() {
    if (!process.argv.includes('--confirm-private-output')) {
        throw new Error('historical_review_confirmation_required');
    }
    const pluggyPath = requiredAbsolutePath('--pluggy-snapshot');
    const planPath = requiredAbsolutePath('--plan');
    const outputPath = requiredAbsolutePath('--output');
    if (isInside(path.resolve(__dirname, '..'), outputPath)) {
        throw new Error('historical_review_output_must_stay_outside_repository');
    }
    const batch = buildReviewBatch({
        pluggySnapshot: JSON.parse(fs.readFileSync(pluggyPath, 'utf8')),
        plan: JSON.parse(fs.readFileSync(planPath, 'utf8'))
    });
    fs.writeFileSync(outputPath, `${JSON.stringify(batch, null, 2)}\n`, {
        encoding: 'utf8', flag: 'wx', mode: 0o600
    });
    process.stdout.write(`${JSON.stringify({
        summary: batch.summary,
        financial_writes: batch.financial_writes
    })}\n`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { buildReviewBatch, isInside };
