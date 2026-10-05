'use strict';

// Captured DEVELOPMENT tools, not the product API or financial authority.
// All require edges are fulfilled by the closed byte table, never ambient
// project/node_modules resolution. The launcher exposes only the private
// initializer; diagnostic methods below are not the guest/product API.
const { admitPackage } = require('./packageContract');
const { compileSnapshotAccess, compileAuthoringIR, prepareClaimMonthQualification, compileClaimMonthQualificationIR,
    compileClaimMonthQualificationAccess, prepareClaimMonthIsolatedPlan, assertClaimMonthIsolatedProgram,
    sealClaimMonthIsolatedLowering, admitClaimMonthIsolatedProof, admitClaimMonthFrozenBaseline } = require('./graphCompiler');
const { admitArtifact } = require('./artifactLoader');
const { admitPhaseCompositionProfile, phaseCompositionCommitment } = require('./phaseCompositionProfile');
const { runAdmittedGraph, runClaimMonthQualifiedGraph } = require('./executionHost');
const { comparePhaseCoverage } = require('./proofAcceptance');
const { sealClaimMonthTargetTrace, compareClaimMonthTargetTrace, sealClaimMonthCoreTrace, compareClaimMonthCoreTrace } = require('./claimMonthTraceContract');
const { admitExecutionRegistry, admitExecutionContract } = require('./executionRegistry');
const { admitExecutionFreeze, admitFrozenArtifact } = require('./freezeContract');
const { verifyNativeRuntime } = require('./nativeRuntime');
const { createPrivateFinancialHost } = require('./financialHost');
const { EXECUTION_PROFILE } = require('./executionProfile');
const validators = require('../vendor/schemaValidators');

function capturedValidationTools() {
    return Object.freeze({ stage: 'captured_validation_tools_only', graph_accepted: false,
        financial_acceptance: false, admitPackage, admitArtifact, admitPhaseCompositionProfile, phaseCompositionCommitment,
        admitExecutionRegistry, admitExecutionContract, admitExecutionFreeze, admitFrozenArtifact, verifyNativeRuntime,
        runAdmittedGraph, runClaimMonthQualifiedGraph, comparePhaseCoverage, sealClaimMonthTargetTrace, compareClaimMonthTargetTrace,
        sealClaimMonthCoreTrace, compareClaimMonthCoreTrace,
        prepareClaimMonthQualification: (receipt, target) => prepareClaimMonthQualification(receipt, validators, target),
        compileClaimMonthQualificationIR: (receipt, preparation, variant) => compileClaimMonthQualificationIR(receipt, validators, preparation, variant),
        compileClaimMonthQualificationAccess, prepareClaimMonthIsolatedPlan, assertClaimMonthIsolatedProgram,
        sealClaimMonthIsolatedLowering, admitClaimMonthIsolatedProof, admitClaimMonthFrozenBaseline,
        initializeFinancialHost: (data, bootstrap) => createPrivateFinancialHost(data, bootstrap, validators),
        compileSnapshotAccess: receipt => compileSnapshotAccess(receipt, validators),
        compileAuthoringIR: receipt => compileAuthoringIR(receipt, validators),
        nativeProfile: EXECUTION_PROFILE });
}
module.exports = { capturedValidationTools };
