// src/handlers/creationHandler.js

const userStateManager = require('../state/userStateManager');
const { appendRowToSheet } = require('../services/sheets');
const { userMap } = require('../config/constants');
const { parseValue, isDate } = require('../utils/helpers');

async function startDebtCreation(msg, initialData = {}) {
    // ... (código da função startDebtCreation sem alterações)
}
async function handleDebtCreation(msg, isFirstRun = false) {
    // ... (código da função handleDebtCreation sem alterações)
}
async function finalizeDebtCreation(msg) {
    // ... (código da função finalizeDebtCreation sem alterações)
}
async function startGoalCreation(msg, initialData = {}) {
    // ... (código da função startGoalCreation sem alterações)
}
async function handleGoalCreation(msg, isFirstRun = false) {
    // ... (código da função handleGoalCreation sem alterações)
}
async function finalizeGoalCreation(msg) {
    // ... (código da função finalizeGoalCreation sem alterações)
}

module.exports = {
    startDebtCreation,
    handleDebtCreation,
    finalizeDebtCreation,
    startGoalCreation,
    handleGoalCreation,
    finalizeGoalCreation,
};