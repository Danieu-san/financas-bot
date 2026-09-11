'use strict';

// Independent documentary audit helper. This is not a provenance runtime,
// compiler, evaluator, validator gate, or production component.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PARENT = 'ef04368c95af33a12c0e8b5b286c0e0b01ae27f8';
const HEAD = 'a09482485ef5d51f2391d4d773d4738f74246f71';
const GRAPH_PATH = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const CLAIM_PATH = 'docs/contracts/next/provenance-v2/claims-v2.json';
const SAFE_KEYS = new Set(['M-13#1#3', 'M-13#1#6']);
const DERIVED_KEYS = new Set(['M-01#1#3', 'M-01#1#4', 'M-14#1#3']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function git(repo, args) {
  return execFileSync('git', ['-c', `safe.directory=${repo}`, '-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function readObject(repo, revision, objectPath) {
  const raw = git(repo, ['show', `${revision}:${objectPath}`]);
  return {
    raw,
    blob_sha: git(repo, ['rev-parse', `${revision}:${objectPath}`]).trim(),
    content_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function sameSet(actual, expected, label) {
  assert.deepEqual(sortedUnique(actual), sortedUnique(expected), label);
  assert.equal(actual.length, new Set(actual).size, `${label}: duplicate member`);
}

function analyzeSelection(graphsDocument, claimsDocument) {
  assert.equal(graphsDocument.graphs.length, 76, 'graph count');
  assert.equal(claimsDocument.claims.length, 76, 'claim count');
  const claimByKey = new Map(claimsDocument.claims.map((claim) => [claim.fact_key, claim]));
  const rows = [];
  let phaseCount = 0;
  let selectionCount = 0;

  for (const graph of graphsDocument.graphs) {
    const claim = claimByKey.get(graph.fact_key);
    assert(claim, `${graph.fact_key}: missing claim`);
    const predicateIds = new Set(graph.predicates.map((predicate) => predicate.id));
    assert.equal(predicateIds.size, graph.predicates.length, `${graph.fact_key}: duplicate predicate id`);

    for (const selection of graph.selections) {
      selectionCount += 1;
      const candidates = graph.sets[selection.candidate_set];
      const selected = graph.sets[selection.selected_set];
      assert(Array.isArray(candidates), `${graph.fact_key}: missing candidate set`);
      assert(Array.isArray(selected), `${graph.fact_key}: missing selected set`);
      const excluded = selection.excluded.map((entry) => entry.node);
      sameSet([...selected, ...excluded], candidates, `${graph.fact_key}: candidate partition`);
      assert(!selected.some((node) => excluded.includes(node)), `${graph.fact_key}: selected/excluded overlap`);
      for (const id of selection.selected_predicates) {
        assert(predicateIds.has(id), `${graph.fact_key}: missing selected predicate ${id}`);
      }
      for (const exclusion of selection.excluded) {
        for (const id of exclusion.predicates) {
          assert(predicateIds.has(id), `${graph.fact_key}: missing exclusion predicate ${id}`);
        }
      }
      if (selection.input_evidence_state !== undefined) {
        assert(SAFE_KEYS.has(graph.fact_key), `${graph.fact_key}: unexpected input_evidence_state`);
        assert.equal(selection.input_evidence_state, 'confirmed', `${graph.fact_key}: input state`);
        for (const exclusion of selection.excluded.filter((entry) => entry.reason === 'state')) {
          for (const id of exclusion.predicates) {
            const predicate = graph.predicates.find((entry) => entry.id === id);
            assert.equal(predicate.op, 'not_eq', `${graph.fact_key}:${id}: state operator`);
            assert.equal(predicate.args[1]?.literal?.value, 'confirmed', `${graph.fact_key}:${id}: state guard`);
          }
        }
      }
    }

    const selectedUnion = sortedUnique(graph.selections.flatMap((selection) => graph.sets[selection.selected_set]));
    const candidateUnion = sortedUnique(graph.selections.flatMap((selection) => graph.sets[selection.candidate_set]));
    const requiredSelections = graph.selections.map(({ candidate_set, selected_set }) => ({ candidate_set, selected_set }));
    for (const phase of ['derivation', 'proof']) {
      phaseCount += 1;
      const contract = graph.trace_contract[phase];
      sameSet(contract.selected_nodes, selectedUnion, `${graph.fact_key}:${phase}: selected_nodes`);
      assert.deepEqual(contract.required_selections, requiredSelections, `${graph.fact_key}:${phase}: required_selections`);
      for (const node of selectedUnion) {
        assert(contract.required_nodes.includes(node), `${graph.fact_key}:${phase}: selected node absent from required_nodes: ${node}`);
      }
      if (phase === 'proof') {
        for (const node of candidateUnion) {
          assert(contract.required_nodes.includes(node), `${graph.fact_key}:${phase}: candidate absent from required_nodes: ${node}`);
          assert(contract.required_reads.some((read) => read.node === node), `${graph.fact_key}:${phase}: candidate absent from required_reads: ${node}`);
        }
      }
    }

    if (SAFE_KEYS.has(graph.fact_key)) {
      assert.equal(claim.evidence_state, 'estimated', `${graph.fact_key}: output state must remain estimated`);
      const stateIds = graph.selections.flatMap((selection) => selection.excluded)
        .filter((entry) => entry.reason === 'state').flatMap((entry) => entry.predicates).sort();
      assert.deepEqual(stateIds, ['r0013_exclude_state', 'r0014_exclude_state', 'r0015_exclude_state']);
    }

    if (graph.fact_key === 'S-12#1#1') {
      assert.equal(graph.trace_contract.proof.required_nodes.length, 40, 'S-12 proof examined count');
      assert.equal(graph.trace_contract.proof.selected_nodes.length, 0, 'S-12 proof selected count');
    }

    if (DERIVED_KEYS.has(graph.fact_key)) {
      assert.equal(graph.selections.length, 0, `${graph.fact_key}: derived graph selection count`);
      for (const phase of ['derivation', 'proof']) {
        assert.equal(graph.trace_contract[phase].selected_nodes.length, 0, `${graph.fact_key}:${phase}: selected nodes`);
      }
      const parentAliases = Object.entries(graph.nodes)
        .filter(([, node]) => node.kind === 'derived_claim').map(([alias]) => alias);
      assert(parentAliases.length > 0, `${graph.fact_key}: no derived parent aliases`);
      for (const alias of parentAliases) {
        for (const phase of ['derivation', 'proof']) {
          assert(graph.trace_contract[phase].required_nodes.includes(alias), `${graph.fact_key}:${phase}: parent absent from required_nodes`);
          assert(graph.trace_contract[phase].required_reads.some((read) => read.node === alias), `${graph.fact_key}:${phase}: parent absent from required_reads`);
        }
      }
    }

    rows.push({
      fact_key: graph.fact_key,
      selections: graph.selections.length,
      candidates: candidateUnion.length,
      selected: selectedUnion.length,
      derivation_required_nodes: graph.trace_contract.derivation.required_nodes.length,
      proof_required_nodes: graph.trace_contract.proof.required_nodes.length,
    });
  }
  assert.equal(phaseCount, 152, 'phase count');
  return { rows, phaseCount, selectionCount };
}

function compareStructure(parentDocument, headDocument) {
  const parentByKey = new Map(parentDocument.graphs.map((graph) => [graph.fact_key, graph]));
  const changes = [];
  for (const graph of headDocument.graphs) {
    const previous = parentByKey.get(graph.fact_key);
    assert(previous, `${graph.fact_key}: absent from parent`);
    for (const field of ['claim_id', 'nodes', 'sets', 'edges']) {
      assert.deepEqual(graph[field], previous[field], `${graph.fact_key}: unexpected ${field} change`);
    }
    const row = { fact_key: graph.fact_key, changed: [] };
    for (const field of ['predicates', 'selections', 'windows']) {
      if (JSON.stringify(graph[field]) !== JSON.stringify(previous[field])) row.changed.push(field);
    }
    for (const phase of ['derivation', 'proof']) {
      assert.deepEqual(
        graph.trace_contract[phase].required_nodes,
        previous.trace_contract[phase].required_nodes,
        `${graph.fact_key}:${phase}: unexpected required_nodes change`,
      );
      for (const field of ['required_reads', 'selected_nodes', 'required_selections']) {
        if (JSON.stringify(graph.trace_contract[phase][field]) !== JSON.stringify(previous.trace_contract[phase][field])) {
          row.changed.push(`${phase}.${field}`);
        }
      }
    }
    changes.push(row);
  }
  assert.equal(parentDocument.graphs.length, headDocument.graphs.length, 'parent/head graph count');
  return changes;
}

function expectFailure(label, parent, head, claims, mutate) {
  const changedParent = structuredClone(parent);
  const changedHead = structuredClone(head);
  const changedClaims = structuredClone(claims);
  mutate(changedParent, changedHead, changedClaims);
  assert.throws(() => {
    analyzeSelection(changedHead, changedClaims);
    compareStructure(changedParent, changedHead);
  }, undefined, `${label}: verifier accepted adversarial mutation`);
  return { label, rejected: true };
}

function run(repo) {
  const parentGraphs = readObject(repo, PARENT, GRAPH_PATH);
  const headGraphs = readObject(repo, HEAD, GRAPH_PATH);
  const headClaims = readObject(repo, HEAD, CLAIM_PATH);
  const selection = analyzeSelection(headGraphs.value, headClaims.value);
  const structuralChanges = compareStructure(parentGraphs.value, headGraphs.value);
  const graph = (document, key) => document.graphs.find((entry) => entry.fact_key === key);
  const selfTests = [
    expectFailure('extra selected node', parentGraphs.value, headGraphs.value, headClaims.value, (_p, h) => {
      graph(h, 'S-01#1#1').trace_contract.proof.selected_nodes.push('evt_salary_a');
    }),
    expectFailure('missing required selection', parentGraphs.value, headGraphs.value, headClaims.value, (_p, h) => {
      graph(h, 'S-01#1#1').trace_contract.derivation.required_selections = [];
    }),
    expectFailure('estimated state guard', parentGraphs.value, headGraphs.value, headClaims.value, (_p, h) => {
      graph(h, 'M-13#1#3').predicates.find((entry) => entry.id === 'r0013_exclude_state').args[1].literal.value = 'estimated';
    }),
    expectFailure('S-12 false selected node', parentGraphs.value, headGraphs.value, headClaims.value, (_p, h) => {
      graph(h, 'S-12#1#1').trace_contract.proof.selected_nodes.push('evt_market_a');
    }),
    expectFailure('candidate missing required read', parentGraphs.value, headGraphs.value, headClaims.value, (_p, h) => {
      const target = graph(h, 'S-01#1#1');
      const candidate = target.sets[target.selections[0].candidate_set][0];
      target.trace_contract.proof.required_reads = target.trace_contract.proof.required_reads.filter((read) => read.node !== candidate);
    }),
    expectFailure('unreviewed nodes change', parentGraphs.value, headGraphs.value, headClaims.value, (_p, h) => {
      graph(h, 'S-01#1#1').nodes.account_a.roles.push('unexpected_role');
    }),
  ];
  const report = {
    schema: 'financasbot-n02f-selection-audit-evidence-v1',
    candidate: HEAD,
    parent: PARENT,
    sources: {
      parent_graphs: { blob_sha: parentGraphs.blob_sha, content_sha256: parentGraphs.content_sha256 },
      head_graphs: { blob_sha: headGraphs.blob_sha, content_sha256: headGraphs.content_sha256 },
      head_claims: { blob_sha: headClaims.blob_sha, content_sha256: headClaims.content_sha256 },
    },
    totals: {
      graphs: selection.rows.length,
      phases: selection.phaseCount,
      selections: selection.selectionCount,
      safe_daily_pace_graphs: SAFE_KEYS.size,
      derived_without_selection_graphs: DERIVED_KEYS.size,
    },
    self_tests: selfTests,
    graphs: selection.rows,
    structural_changes: structuralChanges,
  };
  return report;
}

if (require.main === module) {
  const repo = path.resolve(process.argv[2] || process.cwd());
  const output = process.argv[3] ? path.resolve(process.argv[3]) : null;
  const report = run(repo);
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (output) fs.writeFileSync(output, text, 'utf8');
  process.stdout.write(JSON.stringify({
    valid: true,
    report_sha256: sha256(text),
    graphs: report.totals.graphs,
    phases: report.totals.phases,
    self_tests: report.self_tests.length,
  }) + '\n');
}

module.exports = { analyzeSelection, compareStructure, run };
