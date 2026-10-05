'use strict';
const { copyData } = require('./observationContract');
const { canonicalValue } = require('../kernel/canonicalValue');
const { createScalarProofPrimitives } = require('./scalarProofCore');
// Native transport admission remains mandatory for the TCB entry point.
const { evaluateScalarProof, compareTypedScalars } = createScalarProofPrimitives(copyData, canonicalValue);
module.exports = { evaluateScalarProof, compareTypedScalars };
