const path = require('path');

const { ProjectedPlansStore } = require('./projectedPlansStore');
const { buildProjectedPlanWritePolicy } = require('./projectedPlanWriteService');

let cachedStore = null;
let cachedDbPath = '';

function resolveProjectedPlansDbPath(env = process.env) {
    return path.resolve(String(env.PROJECTED_PLANS_DB_PATH || path.join('data', 'projected-plans-identity.sqlite')));
}

function getProjectedPlanWriteContext(userId, env = process.env) {
    const policy = buildProjectedPlanWritePolicy(env, userId);
    if (!policy.shadowWritesAllowed) return { policy, store: null };

    const dbPath = resolveProjectedPlansDbPath(env);
    if (!cachedStore || cachedDbPath !== dbPath) {
        cachedStore?.close();
        cachedStore = new ProjectedPlansStore({ dbPath, writeEnabled: true });
        cachedDbPath = dbPath;
    }
    return { policy, store: cachedStore };
}

function closeProjectedPlanWriteRuntime() {
    cachedStore?.close();
    cachedStore = null;
    cachedDbPath = '';
}

module.exports = {
    getProjectedPlanWriteContext,
    resolveProjectedPlansDbPath,
    closeProjectedPlanWriteRuntime,
    __test__: { resetProjectedPlanWriteRuntimeForTests: closeProjectedPlanWriteRuntime }
};
