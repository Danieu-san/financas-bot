'use strict';

const { checkClaimRequirements, validateClaimRequirements, claimRequirementFailure } = require('./claimRequirementCore');
const { assertClaimMonthPathTransport } = require('./claimMonthPathProfile');

function validateQualificationClaimRequirements({ graphs, claims, transport, variant = 'M' }) {
    const authorization = assertClaimMonthPathTransport({ graphs, claims, transport, variant });
    checkClaimRequirements({ graphs, claims }, authorization);
    return Object.freeze({ stage: 'claim_requirements_qualification_checked_only', graphs: graphs.length,
        transported_subobligations: Object.freeze(variant === 'M' ? [authorization.subobligation] : []) });
}

module.exports = { validateClaimRequirements, validateQualificationClaimRequirements, claimRequirementFailure };
