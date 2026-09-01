function createEmptyLedgerStore() {
    const observations = Object.freeze([]);
    const events = Object.freeze([]);
    return Object.freeze({
        listObservations: () => [...observations],
        listEvents: () => [...events],
        snapshot: () => ({ observations: [], events: [] })
    });
}

module.exports = {
    createEmptyLedgerStore
};
