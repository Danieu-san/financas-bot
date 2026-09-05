'use strict';

const { canonicalValue, digest, freezeDeep } = require('./canonicalValue');
const { projectObservations } = require('./observationKernel');
const { createReadOnlyToolGateway } = require('../tools/readOnlyToolGateway');

function reject(reason, coverage = 'unavailable') {
    return { ok: false, reason, coverage };
}

function monthBounds(period) {
    if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return null;
    const year = Number(period.slice(0, 4)), month = Number(period.slice(5));
    if (year < 1000 || year > 9999) return null;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return [period + '-01', period + '-' + String(days)];
}

function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function completeCoverageEndsByAsOf(coverage) {
    return coverage.completeness !== 'complete' ||
        coverage.as_of >= coverage.end + 'T23:59:59.999Z';
}

function publicSelectorMaps(publicLabels, catalog) {
    if (!publicLabels || Array.isArray(publicLabels) || typeof publicLabels !== 'object' ||
        Object.keys(publicLabels).sort().join(',') !== 'accounts,cards,categories,family,people') {
        throw new Error('public_labels_invalid');
    }
    const allInternalIds = [catalog.family_id, ...catalog.people.map(v => v.id),
        ...catalog.accounts.map(v => v.id), ...catalog.cards.map(v => v.id),
        ...catalog.categories.map(v => v.id)];
    const validLabel = value => typeof value === 'string' && value === value.trim() &&
        value.length >= 1 && value.length <= 80 && !/[\u0000-\u001f\u007f]/.test(value) &&
        !allInternalIds.some(id => value.toLowerCase().includes(id.toLowerCase()));
    if (!validLabel(publicLabels.family)) throw new Error('public_labels_invalid');
    const result = { family: publicLabels.family };
    for (const [name, entries] of [['people', catalog.people], ['accounts', catalog.accounts],
        ['cards', catalog.cards], ['categories', catalog.categories]]) {
        const labels = publicLabels[name];
        if (!labels || Array.isArray(labels) || typeof labels !== 'object' ||
            Object.keys(labels).sort().join(',') !== entries.map(entry => entry.id).sort().join(',')) {
            throw new Error('public_labels_invalid');
        }
        const byLabel = new Map(), byId = new Map();
        for (const entry of entries) {
            const label = labels[entry.id];
            if (!validLabel(label) || byLabel.has(label)) throw new Error('public_labels_invalid');
            byLabel.set(label, entry.id);
            byId.set(entry.id, label);
        }
        result[name] = { byLabel, byId };
    }
    return result;
}

function createExpenseReadModel(input) {
    const { observations, catalog, sourceInstanceRef, coverage } = JSON.parse(canonicalValue(input));
    if (Object.keys(input).sort().join(',') !== 'catalog,coverage,observations,sourceInstanceRef') {
        throw new Error('read_model_input_invalid');
    }
    if (!coverage || Object.keys(coverage).sort().join(',') !== 'as_of,completeness,end,start' ||
        !['complete', 'partial', 'unknown', 'unavailable'].includes(coverage.completeness) ||
        typeof coverage.as_of !== 'string' || !Number.isFinite(Date.parse(coverage.as_of)) ||
        new Date(coverage.as_of).toISOString() !== coverage.as_of ||
        !(validDate(coverage.start) && validDate(coverage.end) && coverage.start <= coverage.end)) {
        throw new Error('read_coverage_invalid');
    }
    if (!completeCoverageEndsByAsOf(coverage)) throw new Error('read_coverage_as_of_invalid');
    const snapshot = projectObservations({ observations, catalog, sourceInstanceRef });
    if (snapshot.observations.some(o => o.observed_at > coverage.as_of ||
        o.coverage.as_of > coverage.as_of)) throw new Error('snapshot_as_of_mismatch');
    const coverageRef = 'cov_' + digest({ family: catalog.family_id, sourceInstanceRef, coverage });
    const people = new Set(catalog.people.map(p => p.id));
    const categories = new Set(catalog.categories.filter(c => c.kind === 'expense').map(c => c.id));
    const accounts = new Set(catalog.accounts.map(a => a.id));
    const cards = new Set(catalog.cards.map(c => c.id));
    const byId = new Map(snapshot.events.map(e => [e.event_id, e]));

    function readConsumption(rawQuery, trustedContext) {
        let query, context;
        try {
            query = JSON.parse(canonicalValue(rawQuery));
            context = JSON.parse(canonicalValue(trustedContext));
        } catch (_) { return reject('query_schema_invalid'); }
        if (!query || Array.isArray(query) ||
            Object.keys(query).some(k => !['period', 'scope', 'timeBasis', 'category', 'account', 'card'].includes(k)) ||
            !monthBounds(query.period) || !['family', 'personal'].includes(query.scope) ||
            query.timeBasis !== 'transaction_date') return reject('query_schema_invalid');
        if (!context || context.familyId !== catalog.family_id || !people.has(context.actorId)) {
            return reject('authorized_scope_mismatch');
        }
        for (const [field, allowed] of [['category', categories], ['account', accounts], ['card', cards]]) {
            if (Object.hasOwn(query, field) && !allowed.has(query[field])) return reject('query_filter_invalid');
        }
        if (query.account !== undefined && query.card !== undefined) return reject('query_filter_invalid');
        const [start, end] = monthBounds(query.period);
        if (coverage.completeness === 'unavailable') return reject('source_unavailable');
        if (coverage.completeness !== 'complete' || coverage.start > start || coverage.end < end) {
            return reject('coverage_insufficient', 'incomplete');
        }
        const scoped = snapshot.events.filter(e => e.status === 'active' &&
            e.transaction_date >= start && e.transaction_date <= end &&
            (query.scope === 'family' || e.person_id === context.actorId) &&
            (query.category === undefined || e.category_id === query.category) &&
            (query.account === undefined || e.account_id === query.account) &&
            (query.card === undefined || e.card_id === query.card));
        if (scoped.some(e => ['incomplete', 'unavailable'].includes(e.evidence_state) ||
            e.coverage.completeness !== 'complete')) return reject('coverage_insufficient', 'incomplete');
        const selected = scoped.filter(e => e.evidence_state === 'confirmed' &&
            ['purchase', 'refund'].includes(e.event_kind));
        let total = 0n;
        const refs = new Set([coverageRef]);
        for (const event of selected) {
            total += BigInt(event.amount_minor) * (event.event_kind === 'refund' ? -1n : 1n);
            refs.add(event.event_id + ':v' + event.event_version);
            for (const edge of event.links) {
                const target = byId.get(edge.to_event_id);
                refs.add(target.event_id + ':v' + target.event_version);
            }
        }
        if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) {
            return reject('amount_overflow');
        }
        return freezeDeep({
            ok: true, coverage: 'complete',
            resultKind: selected.length === 0 ? 'empty' : total === 0n ? 'zero' : 'value',
            claim: {
                metric: 'consumption_total', value: Number(total), unit: 'BRL_minor',
                entity: { kind: query.scope === 'family' ? 'family' : 'person',
                    ref: query.scope === 'family' ? catalog.family_id : context.actorId },
                period: { type: 'calendar_period', value: query.period }, timeBasis: query.timeBasis,
                filters: Object.fromEntries(['category', 'account', 'card']
                    .filter(k => Object.hasOwn(query, k)).map(k => [k, query[k]]))
            },
            evidence: { coverage: 'complete', state: 'confirmed', refs: [...refs].sort(), asOf: coverage.as_of }
        });
    }

    return Object.freeze({ readConsumption });
}

function createExpenseToolGateway(input) {
    const safe = JSON.parse(canonicalValue(input));
    if (!safe || Object.keys(safe).sort().join(',') !==
        'catalog,coverage,observations,publicLabels,sourceInstanceRef') {
        throw new Error('tool_model_input_invalid');
    }
    const { publicLabels, ...modelInput } = safe;
    const model = createExpenseReadModel(modelInput);
    const selectors = publicSelectorMaps(publicLabels, modelInput.catalog);
    let responseSequence = 0;
    const requestLocalEvidenceRefs = refs => {
        responseSequence += 1;
        return refs.map((_, index) => `eph_${responseSequence}_${index + 1}`);
    };
    return createReadOnlyToolGateway({
        catalog: [{
            name: 'expenses.sum', mode: 'read_only',
            args: { period: 'string', scope: 'string', timeBasis: 'string',
                category: 'string', account: 'string', card: 'string' },
            allowedResultFields: ['ok', 'coverage', 'reason', 'resultKind', 'claim', 'evidence']
        }],
        adapters: { 'expenses.sum': ({ args, authorizedContext }) => {
            const internal = { ...args };
            for (const [field, selector] of [['category', selectors.categories],
                ['account', selectors.accounts], ['card', selectors.cards]]) {
                if (!Object.hasOwn(args, field)) continue;
                const internalId = selector.byLabel.get(args[field]);
                if (!internalId) return reject('query_filter_invalid');
                internal[field] = internalId;
            }
            const result = model.readConsumption(internal, authorizedContext);
            if (!result.ok) return result;
            return {
                ...result,
                claim: {
                    ...result.claim,
                    entity: {
                        kind: result.claim.entity.kind,
                        label: result.claim.entity.kind === 'family'
                            ? selectors.family
                            : selectors.people.byId.get(authorizedContext.actorId)
                    },
                    filters: Object.fromEntries(['category', 'account', 'card']
                        .filter(field => Object.hasOwn(args, field)).map(field => [field, args[field]]))
                },
                evidence: { ...result.evidence, refs: requestLocalEvidenceRefs(result.evidence.refs) }
            };
        } }
    });
}

module.exports = { createExpenseReadModel, createExpenseToolGateway };
