# NEXT-00 — Validação local do candidato após segunda reauditoria

Data: 2026-08-31
Estado: `CORREÇÃO LOCAL FOCAL VERDE; VALIDAÇÃO AMPLA FINAL E NOVO SHA PENDENTES`
Roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`
Candidato reavaliado: `6aa658d9eef5b17217e30ac946139473022fd276`

## Alcance

Somente documentação, fixtures sintéticas e validadores do NEXT-00 foram
alterados. Não houve acesso ou mudança em runtime, legado, provider, banco,
WhatsApp, Google, Pluggy, OCI, credencial, writer ou produção.

## Correções causais

1. 76/76 fatos materializados passam por 39 avaliadores determinísticos.
2. Os contratos Tool Budget e Quality/Stability/Retention são protegidos por
   SHA-256 integral, além das assertions explícitas existentes.
3. M-05 separa pagamento destinado ao cartão de correspondência não provada
   com uma fatura/competência.
4. M-15 materializa o resultado do Calendar.
5. Budget, bill e merchant rule sintéticos sustentam `confirmed`; nenhum deles
   finge receipt de writer.
6. A bateria adversarial cobre 18 mutações e inclui os falsos verdes apontados
   na segunda reauditoria.

## Validação focal reproduzível

```powershell
node scripts/agent/validateFinancasBotNextContractHashes.mjs
node scripts/agent/validateFinancasBotNextGoldenSet.mjs
node scripts/agent/testValidateFinancasBotNextGoldenSet.mjs
node scripts/agent/validateFinancasBotNext00.mjs
```

Resultados vigentes:

```text
NEXT00 FROZEN CONTRACT HASHES: PASS (2/2)
NEXT00-04 GOLDEN SET: PASS
cases=48,turns=56,facts=76,metric_evaluators=39
contract_traceability=67/67,source=primary_contracts,policy=causal-trace-v2
NEXT00 VALIDATOR MUTATIONS: PASS (18/18 RED)
NEXT-00 DOCUMENTAL: PASS
required_files=29
contract_tests=67/67,source=primary_contracts
frozen_numeric_contract_hashes=2/2
runtime_paths=0
```

## Validação ampla

A mudança causal invalida a suíte ampla do candidato anterior. Uma única
execução de `node scripts/agent/validateAgentWorkflow.js` será feita depois que
todos estes artefatos estiverem staged e estáveis, imediatamente antes do
commit imutável. O resultado executado acompanha o hash publicado; este arquivo
não antecipa um PASS ainda não observado.

## Limites

Esta evidência não prova comportamento futuro de lease, fencing, concorrência,
CAS, retry, reconcile, provider, adapter, RPO/RTO, retenção, dashboard ou
WhatsApp. O executor não concede GO ao próprio trabalho.

## Estado

`CANDIDATO LOCAL AGUARDANDO VALIDAÇÃO AMPLA ÚNICA, NOVO SHA E REAUDITORIA`.

Mesmo uma futura aprovação documental não abre NEXT-01 sem decisão explícita
posterior de Daniel.
