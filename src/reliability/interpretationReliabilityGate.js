const {
    getReliabilityMode,
    operationIsAllowed
} = require('./reliabilityTelemetry');
const {
    buildInterpretationCandidate,
    canonicalizeInterpretation,
    decideInterpretationRisk
} = require('./interpretationReliability');
const { extractDeterministicInterpretation } = require('./deterministicExtractor');

const ENFORCE_ACTIONS = new Set(['execute', 'confirm', 'clarify', 'block']);
const CRITICAL_WRITE_FIELDS = new Set([
    'amount',
    'card',
    'installments',
    'movementType',
    'payment',
    'receipt',
    'scope',
    'target',
    'transferType'
]);

function evaluateInterpretationReliabilityGate(input = {}, options = {}) {
    const env = options.env || process.env;
    const mode = getReliabilityMode(env);
    const operation = String(input.operation || input.candidate?.operation || '');

    if (mode === 'off') {
        return bypass(mode, 'disabled');
    }

    if (!operationIsAllowed(operation, env, { requireExplicitAllowlist: mode === 'enforce' })) {
        return bypass(mode, 'operation_not_allowlisted');
    }

    if (mode === 'shadow') {
        return {
            mode,
            applied: true,
            proceed: true,
            action: 'observe',
            reason: 'shadow_observation_only'
        };
    }

    const action = String(input.decision?.action || '');
    if (!ENFORCE_ACTIONS.has(action)) {
        return {
            mode,
            applied: true,
            proceed: false,
            action: 'block',
            reason: 'invalid_or_missing_decision'
        };
    }

    if (action === 'confirm' && input.userConfirmed === true) {
        return {
            mode,
            applied: true,
            proceed: true,
            action: 'execute_after_confirmation',
            reason: 'user_confirmation_satisfied'
        };
    }

    return {
        mode,
        applied: true,
        proceed: action === 'execute',
        action,
        reason: input.decision?.reasons?.[0] || ''
    };
}

function buildWriteInterpretationEvaluation(input = {}, options = {}) {
    const operation = String(input.operation || '');
    const extracted = extractDeterministicInterpretation(input.message || '', options.extractorOptions || {});
    const extractedFields = extracted.operation === operation ? extracted.fields : {};
    const inputFields = input.fields || {};
    const conflicts = [
        ...(Array.isArray(input.conflicts) ? input.conflicts : []),
        ...findCriticalFieldConflicts(operation, inputFields, extractedFields)
    ];
    const fields = {
        ...inputFields,
        ...extractedFields
    };

    for (const [fieldName, field] of Object.entries(inputFields)) {
        if (field?.source === 'user_state' && field?.assurance === 'verified') {
            fields[fieldName] = field;
        }
    }

    const candidate = canonicalizeInterpretation(buildInterpretationCandidate({
        operation,
        fields,
        conflicts,
        missingFields: input.missingFields,
        itemCount: input.itemCount
    }));
    const decision = decideInterpretationRisk(candidate);
    const gate = evaluateInterpretationReliabilityGate({
        operation,
        candidate,
        decision
    }, options);

    return { candidate, decision, gate };
}

function findCriticalFieldConflicts(operation, inputFields = {}, extractedFields = {}) {
    const inputCandidate = canonicalizeInterpretation(buildInterpretationCandidate({ operation, fields: inputFields }));
    const extractedCandidate = canonicalizeInterpretation(buildInterpretationCandidate({ operation, fields: extractedFields }));
    const conflicts = [];

    for (const fieldName of CRITICAL_WRITE_FIELDS) {
        const inputField = inputCandidate.fields[fieldName];
        const extractedField = extractedCandidate.fields[fieldName];
        if (!hasFieldValue(inputField) || !hasFieldValue(extractedField)) continue;
        if (fieldValuesMatch(fieldName, inputField.value, extractedField.value)) continue;
        conflicts.push({ field: fieldName, reason: 'deterministic_input_mismatch' });
    }
    return conflicts;
}

function hasFieldValue(field) {
    return field && field.value !== undefined && field.value !== null && field.value !== '';
}

function fieldValuesMatch(fieldName, left, right) {
    if (['amount', 'installments'].includes(fieldName)) {
        return Number(left) === Number(right);
    }
    return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function bypass(mode, reason) {
    return {
        mode,
        applied: false,
        proceed: true,
        action: 'bypass',
        reason
    };
}

module.exports = {
    buildWriteInterpretationEvaluation,
    evaluateInterpretationReliabilityGate
};
