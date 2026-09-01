const DECISIONS = Object.freeze({
    'AST-01': Object.freeze({ decision: 'ADAPT' }),
    'AST-02': Object.freeze({ decision: 'ADAPT' }),
    'AST-03': Object.freeze({ decision: 'EXTRACT_BEHAVIOR' }),
    'AST-04': Object.freeze({ decision: 'DEFER', targetGate: 'NEXT-02' }),
    'AST-11': Object.freeze({ decision: 'PORT_AS_IS', kind: 'audited_fixture' }),
    'AST-12': Object.freeze({ decision: 'PORT_AS_IS', kind: 'policy' }),
    'AST-13': Object.freeze({ decision: 'PORT_AS_IS', kind: 'policy' }),
    'AST-15': Object.freeze({ decision: 'EXTRACT_BEHAVIOR' })
});

function getReuseDecision(assetId) {
    const decision = DECISIONS[String(assetId || '')];
    if (!decision) return { decision: 'DO_NOT_PORT', reason: 'asset_not_approved' };
    return { ...decision };
}

module.exports = {
    getReuseDecision,
    listReuseDecisions: () => Object.entries(DECISIONS).map(([assetId, value]) => ({ assetId, ...value }))
};
