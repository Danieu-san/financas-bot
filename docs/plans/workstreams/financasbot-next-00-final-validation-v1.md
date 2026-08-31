# NEXT-00 — Validação local do candidato após terceira reauditoria

Data: 2026-08-31
Estado: `REDESENHO DECLARATIVO LOCAL VERDE; NOVO SHA E REAUDITORIA PENDENTES`
Roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`
Candidato reavaliado: `831d0c35c1d12ad60f96989e19133c5b4630ec44`

## Alcance

Somente documentação, fixtures sintéticas e validadores do NEXT-00 foram
alterados. Não houve acesso ou mudança em runtime, legado, provider, banco,
WhatsApp, Google, Pluggy, OCI, credencial, writer ou produção.

## Correções causais

1. 76/76 fatos usam um contrato declarativo independente para oito dimensões;
   não existe mais `switch` de validação por métrica.
2. Os contratos Tool Budget e Quality/Stability/Retention são protegidos por
   SHA-256 integral, além das assertions explícitas existentes.
3. M-05 separa pagamento destinado ao cartão de correspondência não provada
   com uma fatura/competência.
4. M-15 materializa o resultado do Calendar.
5. Budget, bill e merchant rule sintéticos sustentam `confirmed`; nenhum deles
   finge receipt de writer.
6. A bateria de propriedades gera 608 mutações de dimensão, 76 de valor e uma
   de relação; 11 mutações estruturais permanecem separadas.

## Validação focal reproduzível

```powershell
node scripts/agent/validateFinancasBotNextContractHashes.mjs
node scripts/agent/validateFinancasBotNextGoldenSet.mjs
node scripts/agent/testFinancasBotNextFactContracts.mjs
node scripts/agent/testValidateFinancasBotNextGoldenSet.mjs
node scripts/agent/validateFinancasBotNext00.mjs
```

Resultados vigentes:

```text
NEXT00 FROZEN CONTRACT HASHES: PASS (3/3)
NEXT00-04 GOLDEN SET: PASS
cases=48,turns=56,facts=76,metric_evaluators=39
contract_traceability=67/67,source=primary_contracts,policy=causal-trace-v2
NEXT00 FACT CONTRACT PROPERTIES: PASS
dimension_mutations=608/608,value_mutations=76/76,relation_mutations=1/1
NEXT00 STRUCTURAL MUTATIONS: PASS (11/11 RED)
NEXT-00 DOCUMENTAL: PASS
required_files=33
contract_tests=67/67,source=primary_contracts
frozen_contract_hashes=3/3
runtime_paths=0
```

## Validação ampla

A mudança causal invalidou a suíte ampla do candidato anterior. Sobre os 15
arquivos staged e estáveis, foi executada uma única vez:

```text
node scripts/agent/validateAgentWorkflow.js
agent-workflow: OK
git: codex/financasbot-next-00 831d0c35c1d12ad60f96989e19133c5b4630ec44
status_entries=15
```

Nenhum PASS amplo anterior foi reutilizado. Alterações posteriores apenas
registram esta evidência e o próximo estado.

## Limites

Esta evidência não prova comportamento futuro de lease, fencing, concorrência,
CAS, retry, reconcile, provider, adapter, RPO/RTO, retenção, dashboard ou
WhatsApp. O executor não concede GO ao próprio trabalho.

## Estado

`CANDIDATO LOCAL AGUARDANDO NOVO SHA E REAUDITORIA`.

Mesmo uma futura aprovação documental não abre NEXT-01 sem decisão explícita
posterior de Daniel.
