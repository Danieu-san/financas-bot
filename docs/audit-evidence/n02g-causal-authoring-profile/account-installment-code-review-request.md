# Revisão independente de código — contas/parcelas N02-G

Objeto: somente o delta deste commit em relação ao pai
`42a16c8516373d1c5fc49a3836f0eba54e61d4c5`. O parecer documental de
`041da0dfefe8602b85d0168582da722cf74f9a53` autoriza a composição normativa;
não aprova este código. Conferir as fontes imutáveis, não presumir este relato.

## Fontes e comandos

- Plano: `docs/plans/workstreams/financasbot-n02g-metric-observation-alignment-decision-v1.md`.
- Corpus/proposta: `docs/contracts/next/provenance-v2/graphs-v2.json` e
  `docs/audit-evidence/n02g-causal-authoring-profile/account-installment-observation-proposal.json`.
- Código: `src/next/provenance/metricInstallments.js`, `graphCompiler.js`,
  `proofOperators.js`; confrontar `metricDirectReads.js`, `metricReferences.js`,
  `instrumentedAccess.js`, `nodeSetAccess.js`, `proofAcceptance.js` e contratos.
- Testes: `tests/next/provenance/metricInstallments.cases.js`, `authoringIndex.cases.js`.
- Harness: `tests/helpers/exhaustiveNetworkTripwire.js` e
  `tests/exhaustiveLocalTestCoverageRunner.test.js`.
- Evidência: `account-installment-application-validation.json`, helper
  `prepare-account-installment-validation.cjs`, aplicação
  `prepare-account-installment-application.cjs`, runner `run-account-installment-wide.cjs`
  e recibo `account-installment-independent-review.md`, nesta mesma pasta.

Pacote parcial Git autenticado por OIDs disponível via
`scripts/agent/prepareN02gAccountInstallmentCodeAuditPacket.cjs <SHA>`.
Não contém sessões, remotes, autenticação, dados reais ou node_modules.
Após extrair, verificar `node verify-packet.cjs`, aplicação `--check`, evidência
`--check` e `node --test tests/next/provenance/metricInstallments.cases.js`.
O pacote de evidência complementar inclui a closure documental dos seis testes
`ACCOUNT-INSTALLMENT` em `authoringIndex.cases.js`, os seis schemas, o builder de
validadores e `package-lock.json`. Para executá-los, disponibilizar localmente
apenas `ajv@8.17.1`, `ajv-formats@3.0.1` e `acorn@8.15.0` e usar
`node --test --test-name-pattern=ACCOUNT-INSTALLMENT tests/next/provenance/authoringIndex.cases.js`.
Não executar `npm ci` do produto inteiro para esse recorte. Conferir o SHA do ZIP
e os resultados locais em `account-installment-integrated-closure-evidence.json`;
o auditor deve distinguir esse relato da execução própria.
O kernel standalone é sintético, não mutação admitida de grafo. Node local
pinado: 22.17.0. Informar runtime efetivo e limites se o auditor usar outro.
O pacote não suporta a suíte completa; não presumir sua execução independente.

## Perguntas causais

1. A igualdade integral do corpus prova alteração somente das onze derivações,
   com 65 grafos/76 proofs/seleções/fontes protegidas preservados? Verificar
   também por reconstrução própria, não somente repetir o helper do autor.
2. O evaluator parte do roster completo e identidade versionada, rejeita
   membro faltante/duplicado/plan trocado, preserva R e não lê dimensões não causais?
3. O controlador TCB observa handles e select reais, sem aceitar expected,
   resultado/oracle/trace declarados pelo caller? Sua revogação e falha são reais?
   Ele não é host medido nem aprovação de grafo/seleção; predicado verdadeiro
   sozinho não aprova um view fabricado. Confrontar o comparator separado.
4. As duas primitivas de derivation (período admitido e membership nominal em
   input-set) preservam semântica e identidade sem fabricar observação a partir
   de expected? Proof conserva sua enumeração/identidade estritas? A adaptação
   não pode copiar o proof inteiro nem esconder dependência efetivamente usada.
5. Expected é fixado antes da execução e negativos removem leitura de ID e
   exclusão? Pins históricos continuam estritos? Variantes kernel/modelo não
   podem ser apresentadas como grafos mutantes admitidos.
6. A leitura Git raw blob no harness é restrita à raiz/executável auditados,
   objeto imutável e argumento fechado, sem filtros, opções, rede ou escrita?

## Limitação bloqueante para alegação de verde global

Ampla inicial local: 2398 PASS/17 FAIL/10 SKIP. Quatorze bloqueios de Git foram
reproduzidos e corrigidos no helper/harness; afetados do runner: 16 PASS.
Ampla final: **2413 PASS/3 FAIL/10 SKIP — RED**, com dez hashes causais e HEAD
intactos. As três falhas de `freeBudgetCardEligibility.test.js` também falham
na base limpa 42a16c8 (3 FAIL): ciclo mensal LEGADO depois do dia 28.
Não houve alteração de código/teste legado, data forçada, SKIP novo ou dispensa.
O helper `--check` verifica registros/hashes/corpus; NÃO reexecuta testes.

Não pedir nem conceder dispensa dessas falhas. Julgar se o delta focal é apto,
mantendo explícitos o RED global e a necessidade de decisão separada para o
legado. Confirmar hash/pai, fontes efetivamente lidas, achados por severidade,
execuções próprias e limites. Se faltar fonte, concluir incompleto, não APTO.
Nenhum veredito aqui concede GO N02-G/NEXT-02/NEXT-03, aceitação de grafo/host,
deploy, produção ou uso de dados reais.
