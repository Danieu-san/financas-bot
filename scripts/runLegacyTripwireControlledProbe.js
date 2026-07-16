const { observeLegacyEntrypoint } = require('../src/reliability/legacyEntrypointTripwire');

async function main({ argv = process.argv.slice(2), env = process.env } = {}) {
    if (!argv.includes('--confirm-controlled-probe')) throw new Error('controlled_probe_confirmation_required');
    if (String(env.LEGACY_RETIREMENT_TRIPWIRE_ENABLED || '').toLowerCase() !== 'true') {
        throw new Error('legacy_tripwire_not_enabled');
    }
    if (String(env.LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES || '').trim()) {
        throw new Error('controlled_probe_requires_empty_soft_disable');
    }
    const result = observeLegacyEntrypoint('legacy_auth_utility', {
        env,
        domain: 'none',
        evidenceType: 'synthetic'
    });
    const recorded = await result.record;
    if (!recorded?.recorded) throw new Error('controlled_probe_not_recorded');
    return {
        outcome: 'GO',
        candidate: 'legacy_auth_utility',
        evidence_type: 'synthetic',
        blocked: false,
        product_route_invoked: false,
        financial_values_exposed: 0,
        financial_writes: 0
    };
}

if (require.main === module) {
    main().then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
        .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

module.exports = { main };
