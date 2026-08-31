import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const frozenContractHashes = {
  'docs/contracts/next/tool-budget-failure-policy-v0.md': 'a93e57f808871f6e1c8fce17cf58c8cf568a8943567133b509bb9ce7b6681dae',
  'docs/contracts/next/quality-stability-retention-contract-v0.md': 'c34fd664997340d4297c2a033f0cb55c1dbec28c4dce592c28dd426388f4c02e',
  'tests/fixtures/financasbot-next/golden-fact-contracts-v1.json': '377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2',
};

export function validateFrozenContractHashes(root) {
  const failures = [];
  for (const [relative, expected] of Object.entries(frozenContractHashes)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
    if (actual !== expected) failures.push(`${relative}: frozen SHA-256 mismatch; expected ${expected}, found ${actual}`);
  }
  return failures;
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  const failures = validateFrozenContractHashes(process.cwd());
  if (failures.length) {
    console.error(`NEXT00 FROZEN CONTRACT HASHES: FAIL (${failures.length})`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  const count = Object.keys(frozenContractHashes).length;
  console.log(`NEXT00 FROZEN CONTRACT HASHES: PASS (${count}/${count})`);
}
