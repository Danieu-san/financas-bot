const logger = require('./logger');

const counters = new Map();
const timings = new Map();

function increment(metricName, value = 1) {
    const current = counters.get(metricName) || 0;
    counters.set(metricName, current + value);
}

function observeDuration(metricName, durationMs) {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    const current = timings.get(metricName) || { count: 0, sumMs: 0, maxMs: 0 };
    current.count += 1;
    current.sumMs += durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    timings.set(metricName, current);
}

function getSnapshot() {
    const countersObj = {};
    const timingsObj = {};

    for (const [key, value] of counters.entries()) {
        countersObj[key] = value;
    }

    for (const [key, value] of timings.entries()) {
        timingsObj[key] = {
            count: value.count,
            avgMs: value.count > 0 ? Number((value.sumMs / value.count).toFixed(2)) : 0,
            maxMs: value.maxMs
        };
    }

    return {
        generatedAt: new Date().toISOString(),
        counters: countersObj,
        timings: timingsObj
    };
}

function reset() {
    counters.clear();
    timings.clear();
}

function flushToLogs(prefix = '[metrics]') {
    const snapshot = getSnapshot();
    logger.info(`${prefix} ${JSON.stringify(snapshot)}`);
    reset();
    return snapshot;
}

module.exports = {
    increment,
    observeDuration,
    getSnapshot,
    reset,
    flushToLogs
};
