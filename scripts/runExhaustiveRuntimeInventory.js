const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'src');
const SCRIPT_ROOT = path.join(ROOT, 'scripts');
const TEST_ROOT = path.join(ROOT, 'tests');
const CODE_EXTENSIONS = new Set(['.js', '.mjs']);
const EXHAUSTIVE_LOCAL_TEST_RUNNER = 'scripts/runExhaustiveLocalTestCoverage.js';

function normalizeFile(file) {
    return path.relative(ROOT, file).replace(/\\/g, '/');
}

function listCodeFiles(root, output = []) {
    if (!fs.existsSync(root)) return output;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const absolute = path.join(root, entry.name);
        if (entry.isDirectory()) listCodeFiles(absolute, output);
        else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) output.push(absolute);
    }
    return output;
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
    return [...new Set(imports)];
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
    const unresolved = [];
    const dynamicImportFiles = [];
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        const dependencies = [];
        for (const specifier of extractImports(source)) {
            const resolved = resolveImport(file, specifier);
            if (resolved) dependencies.push(resolved);
            else if (specifier.startsWith('.')) unresolved.push({ from: normalizeFile(file), specifier });
        }
        if (/require\(\s*[^'"\s]/.test(source) || /import\(\s*[^'"\s]/.test(source)) {
            dynamicImportFiles.push(normalizeFile(file));
        }
        graph.set(file, [...new Set(dependencies)]);
    }
    return { graph, unresolved, dynamicImportFiles: dynamicImportFiles.sort() };
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

function packageFileReferences(packageJson) {
    const references = [];
    for (const [scriptName, command] of Object.entries(packageJson.scripts || {})) {
        const matches = String(command).match(/[A-Za-z0-9_./\\-]+\.(?:js|mjs|json)/g) || [];
        for (const token of matches) {
            const normalized = token.replace(/\\/g, '/').replace(/^\.\//, '');
            if (!normalized.includes('/') && normalized !== 'index.js' && !normalized.startsWith('ecosystem.')) continue;
            references.push({ script: scriptName, file: normalized });
        }
    }
    return references;
}

function expandPackageScripts(packageJson, initialNames) {
    const seen = new Set();
    const queue = initialNames.filter(name => packageJson.scripts?.[name]);
    while (queue.length) {
        const name = queue.shift();
        if (seen.has(name)) continue;
        seen.add(name);
        const command = String(packageJson.scripts[name] || '');
        for (const match of command.matchAll(/npm\s+run\s+([A-Za-z0-9:_-]+)/g)) {
            if (packageJson.scripts[match[1]] && !seen.has(match[1])) queue.push(match[1]);
        }
    }
    return [...seen].sort();
}

function coveringTestRoots(graph, testRoots, target) {
    const covering = [];
    for (const root of testRoots) {
        if (reachable(graph, [root]).has(target)) covering.push(normalizeFile(root));
    }
    return covering.sort();
}

function runInventory() {
    const sourceFiles = listCodeFiles(SOURCE_ROOT).sort();
    const scriptFiles = listCodeFiles(SCRIPT_ROOT).sort();
    const testFiles = listCodeFiles(TEST_ROOT).sort();
    const runtimeRoot = path.join(ROOT, 'index.js');
    const allFiles = [...new Set([runtimeRoot, ...sourceFiles, ...scriptFiles, ...testFiles])];
    const { graph, unresolved, dynamicImportFiles } = buildGraph(allFiles);
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const packageReferences = packageFileReferences(packageJson);
    const defaultTestScripts = expandPackageScripts(packageJson, ['pretest', 'test', 'posttest']);
    const registeredTestFiles = [...new Set(packageReferences
        .filter(reference => reference.file.startsWith('tests/') && fs.existsSync(path.join(ROOT, reference.file)))
        .map(reference => reference.file))].sort();
    const staticallyReferencedDefaultTestFiles = packageReferences
        .filter(reference => defaultTestScripts.includes(reference.script))
        .filter(reference => reference.file.startsWith('tests/') && fs.existsSync(path.join(ROOT, reference.file)))
        .map(reference => reference.file);
    const exhaustiveRunnerIsDefault = packageReferences.some(reference => (
        defaultTestScripts.includes(reference.script)
        && reference.file === EXHAUSTIVE_LOCAL_TEST_RUNNER
    ));
    const discoveredDefaultTestFiles = exhaustiveRunnerIsDefault
        ? require('./runExhaustiveLocalTestCoverage').listAllLocalTestFiles().map(normalizeFile)
        : [];
    const defaultTestFiles = [...new Set([
        ...staticallyReferencedDefaultTestFiles,
        ...discoveredDefaultTestFiles
    ])].sort();
    const testEntryFiles = testFiles.map(normalizeFile).filter(file => file.endsWith('.test.js'));
    const unregisteredTestFiles = testEntryFiles.filter(file => !registeredTestFiles.includes(file));
    const outsideDefaultTestFiles = testEntryFiles.filter(file => !defaultTestFiles.includes(file));
    const operationalRoots = [...new Set(packageReferences
        .map(reference => path.join(ROOT, reference.file))
        .filter(file => (
            CODE_EXTENSIONS.has(path.extname(file))
            && fs.existsSync(file)
            && !normalizeFile(file).startsWith('tests/')
        )))];
    const missingPackageReferences = packageReferences
        .filter(reference => !fs.existsSync(path.join(ROOT, reference.file)))
        .sort((a, b) => `${a.script}:${a.file}`.localeCompare(`${b.script}:${b.file}`));

    const runtimeReachable = reachable(graph, [runtimeRoot]);
    const operationalReachable = reachable(graph, operationalRoots);
    const testReachable = reachable(graph, testFiles);
    const modules = sourceFiles.map(file => {
        const inRuntime = runtimeReachable.has(file);
        const inOperational = operationalReachable.has(file);
        const inTests = testReachable.has(file);
        const classification = inRuntime
            ? 'runtime'
            : inOperational
                ? 'operational_only'
                : inTests
                    ? 'test_only'
                    : 'unreferenced';
        const coveringTests = inTests ? coveringTestRoots(graph, testFiles, file) : [];
        return {
            file: normalizeFile(file),
            classification,
            runtime_reachable: inRuntime,
            operational_reachable: inOperational,
            test_reachable: inTests,
            covering_test_count: coveringTests.length,
            covering_tests: coveringTests
        };
    });
    const classificationCounts = modules.reduce((accumulator, module) => {
        accumulator[module.classification] = (accumulator[module.classification] || 0) + 1;
        return accumulator;
    }, {});
    const runtimeDynamicImports = dynamicImportFiles.filter(file => {
        const absolute = path.join(ROOT, file);
        return runtimeReachable.has(absolute);
    });
    const unresolvedProductImports = unresolved.filter(item => (
        item.from === 'index.js'
        || item.from.startsWith('src/')
        || item.from.startsWith('scripts/')
    ));

    return {
        schema_version: 1,
        generated_at: new Date().toISOString(),
        scope: {
            runtime_root: 'index.js',
            source_files: sourceFiles.length,
            package_script_roots: operationalRoots.length,
            test_roots: testFiles.length,
            test_entry_files: testEntryFiles.length,
            default_test_files: defaultTestFiles.length,
            registered_test_files: registeredTestFiles.length
        },
        classification_counts: classificationCounts,
        missing_package_references: missingPackageReferences,
        default_test_scripts: defaultTestScripts,
        exhaustive_local_runner_is_default: exhaustiveRunnerIsDefault,
        unregistered_test_files: unregisteredTestFiles,
        outside_default_test_files: outsideDefaultTestFiles,
        unresolved_relative_imports: unresolved,
        unresolved_product_imports: unresolvedProductImports,
        dynamic_import_files: dynamicImportFiles,
        runtime_dynamic_import_files: runtimeDynamicImports,
        modules
    };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(runInventory(), null, 2)}\n`);

module.exports = {
    extractImports,
    resolveImport,
    packageFileReferences,
    expandPackageScripts,
    runInventory
};
