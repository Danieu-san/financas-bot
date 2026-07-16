const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', '.deploy-patches']);
const CANDIDATES = Object.freeze([
    { id: 'debt_update_handler', file: 'src/handlers/debtUpdateHandler.js', risk_score: 93, decision: 'investigate_mutating' },
    { id: 'debt_avalanche_service', file: 'src/services/debtAvalancheService.js', risk_score: 18, decision: 'retain_test_support' },
    { id: 'financial_health_service', file: 'src/services/financialHealthService.js', risk_score: 18, decision: 'retain_test_support' },
    { id: 'legacy_auth_utility', file: 'src/utils/auth.js', risk_score: 18, decision: 'observe_unreferenced' },
    { id: 'date_time_normalizer', file: 'src/utils/dateTimeNormalizer.js', risk_score: 18, decision: 'retain_test_support' },
    { id: 'financial_query_spec', file: 'src/query/financialQuerySpec.js', risk_score: 18, decision: 'retain_test_support' },
    { id: 'financial_undo_service', file: 'src/undo/financialUndoService.js', risk_score: 18, decision: 'retain_test_only' }
]);

function listCodeFiles(directory, output = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) listCodeFiles(absolute, output);
        else if (/\.(?:js|mjs)$/.test(entry.name)) output.push(absolute);
    }
    return output;
}

function normalizeFile(file) {
    return path.relative(ROOT, file).replace(/\\/g, '/');
}

function extractImports(source) {
    const imports = [];
    for (const regex of [
        /require\(\s*['"]([^'"]+)['"]\s*\)/g,
        /import\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
        /import\(\s*['"]([^'"]+)['"]\s*\)/g
    ]) {
        for (const match of source.matchAll(regex)) imports.push(match[1]);
    }
    return imports;
}

function resolveImport(fromFile, specifier) {
    if (!specifier.startsWith('.')) return null;
    const base = path.resolve(path.dirname(fromFile), specifier);
    for (const candidate of [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
}

function buildGraph(files) {
    const graph = new Map();
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        graph.set(file, extractImports(source).map(specifier => resolveImport(file, specifier)).filter(Boolean));
    }
    return graph;
}

function reachable(graph, roots) {
    const seen = new Set();
    const queue = roots.filter(Boolean);
    while (queue.length) {
        const current = queue.shift();
        if (seen.has(current)) continue;
        seen.add(current);
        for (const dependency of graph.get(current) || []) queue.push(dependency);
    }
    return seen;
}

function packageScriptRoots(packageJson) {
    const roots = [];
    for (const [name, command] of Object.entries(packageJson.scripts || {})) {
        for (const match of String(command).matchAll(/(?:^|\s)node\s+(?!--test)([^\s]+\.(?:js|mjs))/g)) {
            const absolute = path.resolve(ROOT, match[1].replace(/^['"]|['"]$/g, ''));
            if (fs.existsSync(absolute)) roots.push({ name, absolute });
        }
    }
    return roots;
}

function runAudit() {
    const files = listCodeFiles(ROOT);
    const graph = buildGraph(files);
    const runtime = reachable(graph, [path.join(ROOT, 'index.js')]);
    const tests = reachable(graph, files.filter(file => {
        const relative = normalizeFile(file);
        return relative.startsWith('tests/') || relative.startsWith('test/');
    }));
    const packageRoots = packageScriptRoots(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')));
    const scripts = reachable(graph, packageRoots.map(item => item.absolute));
    const reverse = new Map();
    for (const [from, dependencies] of graph.entries()) {
        for (const dependency of dependencies) {
            if (!reverse.has(dependency)) reverse.set(dependency, []);
            reverse.get(dependency).push(from);
        }
    }
    const candidates = CANDIDATES.map(candidate => {
        const absolute = path.join(ROOT, candidate.file);
        const source = fs.readFileSync(absolute, 'utf8');
        return {
            ...candidate,
            runtime_reachable: runtime.has(absolute),
            test_reachable: tests.has(absolute),
            package_script_reachable: scripts.has(absolute),
            direct_callers: (reverse.get(absolute) || []).map(normalizeFile).sort(),
            tripwire_present: source.includes(`'${candidate.id}'`) || source.includes(`"${candidate.id}"`)
        };
    });
    const dynamicImports = [];
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        if (/import\(\s*[^'"]/.test(source) || /require\(\s*[^'"]/.test(source)) dynamicImports.push(normalizeFile(file));
    }
    return {
        schema_version: 1,
        generated_at: new Date().toISOString(),
        runtime_entrypoint: 'index.js',
        package_script_roots: packageRoots.length,
        dynamic_import_files: dynamicImports.sort(),
        entrypoints_covered: candidates.every(candidate => candidate.tripwire_present),
        candidates
    };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(runAudit(), null, 2)}\n`);

module.exports = { CANDIDATES, extractImports, resolveImport, runAudit };
