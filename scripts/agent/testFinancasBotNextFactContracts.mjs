import fs from 'node:fs';
import { validateMaterializedFacts } from './validateFinancasBotNextFacts.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fixture = read('tests/fixtures/financasbot-next/golden-financial-fixture-v1.json');
const oracle = read('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json');
const contracts = read('tests/fixtures/financasbot-next/golden-fact-contracts-v1.json');
const clone = value => structuredClone(value);

function mutatedScalar(value) {
  if (Array.isArray(value)) return [...value, '__mutated_ref__'];
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'string') return `__mutated__:${value}`;
  throw new Error(`unsupported mutation type ${typeof value}`);
}

function expectFailure(name, changedOracle, changedContracts, fragment) {
  const result = validateMaterializedFacts(fixture, changedOracle, changedContracts);
  if (!result.failures.some(failure => failure.includes(fragment))) {
    throw new Error(`${name}: expected failure containing ${fragment}; got\n${result.failures.join('\n')}`);
  }
}

let dimensionMutations = 0;
let valueMutations = 0;
for (const [turn, entry] of Object.entries(oracle.turns)) {
  if (entry.disposition !== 'materialized') continue;
  for (const [index, fact] of entry.facts.entries()) {
    const factKey = `${turn}#${index + 1}`;
    for (const dimension of contracts.dimensions) {
      const changed = clone(oracle);
      changed.turns[turn].facts[index][dimension] = mutatedScalar(fact[dimension]);
      expectFailure(`${factKey}/${dimension}`, changed, contracts, `${factKey}: ${dimension} diverges from reviewed fact contract`);
      dimensionMutations += 1;
    }
    const changed = clone(oracle);
    changed.turns[turn].facts[index].value = mutatedScalar(fact.value);
    expectFailure(`${factKey}/value`, changed, contracts, `${turn}/${fact.metric}: factual oracle diverges`);
    valueMutations += 1;
  }
}

let relationMutations = 0;
const wrongMembership = clone(contracts);
wrongMembership.turns['M-08#1'][1].relations[0].person_id = 'person-c';
expectFailure('M-08/member_of_budget_family', oracle, wrongMembership,
  'relation member_of_budget_family: person-c is outside budget-snack');
relationMutations += 1;

const expectedFacts = 76;
const expectedDimensions = expectedFacts * contracts.dimensions.length;
if (dimensionMutations !== expectedDimensions) {
  throw new Error(`expected ${expectedDimensions} dimension mutations, executed ${dimensionMutations}`);
}
if (valueMutations !== expectedFacts) {
  throw new Error(`expected ${expectedFacts} value mutations, executed ${valueMutations}`);
}
if (relationMutations !== 1) throw new Error(`expected 1 relation mutation, executed ${relationMutations}`);

console.log('NEXT00 FACT CONTRACT PROPERTIES: PASS');
console.log(`dimension_mutations=${dimensionMutations}/${expectedDimensions}`);
console.log(`value_mutations=${valueMutations}/${expectedFacts}`);
console.log(`relation_mutations=${relationMutations}/1`);
