import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Compatibility diagnostic, not graph acceptance. Input must be a schema-
// admitted graph package. Matches the current observed traversal primitive:
// source reference + target id + edge observation. Never fabricates a trace.
export function inspectTraversalCoverage(graphs) {
    const gaps = [];
    for (const graph of graphs) for (const phase of ['derivation', 'proof']) {
        const contract = graph.trace_contract[phase];
        const nodes = new Set(contract.required_nodes);
        const reads = new Set(contract.required_reads.map(r => JSON.stringify([r.node, r.segments])));
        const edges = new Map(graph.edges.map(e => [e.id, e]));
        for (const edgeId of contract.required_edges) {
            const edge = edges.get(edgeId);
            if (!edge) throw new Error('trace_compatibility_unknown_edge');
            if (edge.relation !== 'material_ref') continue;
            const missingNodes = [edge.source, edge.target].filter(n => !nodes.has(n));
            const missingReads = [[edge.source, [edge.field]], [edge.target, ['id']]]
                .filter(tuple => !reads.has(JSON.stringify(tuple)));
            if (missingNodes.length || missingReads.length) gaps.push({ fact_key: graph.fact_key, phase,
                edge_id: edgeId, source: edge.source, field: edge.field, target: edge.target, missing_nodes: missingNodes, missing_reads: missingReads });
        }
    }
    return { stage: 'traversal_compatibility_diagnostic_only', compatible: gaps.length === 0,
        graphs_checked: graphs.length, phases_checked: graphs.length * 2,
        affected_graphs: new Set(gaps.map(g => g.fact_key)).size, gap_count: gaps.length, gaps };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const graphs = JSON.parse(fs.readFileSync(path.join(root, 'docs/contracts/next/provenance-v2/graphs-v2.json'), 'utf8')).graphs;
    const { gaps, ...summary } = inspectTraversalCoverage(graphs);
    console.log(JSON.stringify({ ...summary, examples: gaps.slice(0, 3) }, null, 2));
    process.exitCode = summary.compatible ? 0 : 1;
}
