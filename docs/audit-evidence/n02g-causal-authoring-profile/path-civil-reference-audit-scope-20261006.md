# Escopo de auditoria focal — referência civil independente

Parent esperado c3365152ee307c1ff1adb68616bb9ad0dbf95eaa, diagnóstico APTO focal;
nenhuma reauditoria/generalização do perfil mensal. Um commit/exatamente seis paths:

- src/next/provenance/pathSemanticReference.js
- tests/next/provenance/pathSemanticV2.cases.js
- docs/plans/workstreams/financasbot-n02g-path-civil-reference-20261006.md
- docs/audit-evidence/n02g-causal-authoring-profile/path-civil-reference-audit-scope-20261006.md
- docs/audit-evidence/n02g-causal-authoring-profile/path-civil-reference-final-evidence-20261006.json
- docs/audit-evidence/n02g-causal-authoring-profile/verify-path-civil-final-evidence-20261006.cjs

## Causa e fronteira

Antes o selo aceitava sempre dois argumentos. Relações calendáricas do registry
v2 têm3/4/5. Agora aridade acompanha cada relação declarada. Os oito operadores
binários existentes mantêm sua avaliação; o novo domínio civil contém quatro
relações sem timezone. Datas0001..9999/calendário proleptic_gregorian/safe integer,
sem coerção/clamp/Date. Tabela própria400anos e comparação de ordinal/diferença
de meses, sem importar implementação guest ou seu resultado para expected.

Leitura primária de claim/snapshots frozen continua a única fonte; selo antes
de D/P, capacidade privada/patch único/authority_refs preservados. Operação ou
operando não coberto, aridade errada, calendario/valor inválido ficam unavailable,
não false arbitrário nem PASS. Pure helper não emite capability ou crédito.
Timezone,period_ref,period_bound,parent_claim/derivados não foram acrescentados;
referências correspondentes e ausência de alternativas permanecem pendentes.
Nenhum runtime/checker/schema/registry/autoria/claim/oracle/trace/ID/norma mudou.

## Evidência e questões adversariais

RED2FAIL→2PASS; propriedades ampliadas ao ciclo400anos e fronteiras fora do ciclo,
todos meses/dias, offsets reversíveis day/month sem clamp, limites0001/9999,
datas inválidas, -0/coerção/overflow e proxy/accessor sem execução de efeitos.
Integração candidate authored de três argumentos sela available sem crédito D/P.
syntax2/afetadosr234PASS; uma ampla final2635tests/2625PASS/zeroFAILcancel/
10SKIP exatos/exit0/fontes765iguais/716JSONs nativos válidos.
Census15IDs/5rows discriminantes/10não resolvidos ou sem alternativa/DP0/matched0.
O verifier somente reconcilia evidência local, não executa referência/compiler/D/P.
Logs brutos/.codex-temp não publicados; números são relato local vinculado a hashes,
não execução independente do auditor. Nada retifica RED/UNSAT histórico.

Confrontar diff/parent e dependências inalteradas necessárias:
pathMutationInventory.js/packageContract.js/canonicalValue.js;
scripts/agent/executeNextPredicateStrategyMatrix.mjs;
operator-registry-v2.json/temporal-relations-decision-v1.md/graphs-v2.json e
snapshots/claims apontados pelo pacote; civilCalendar.js/scalarProofCore.js
somente para confronto contratual, nunca como autoridade da referência;
runExhaustiveLocalTestCoverage.js/exhaustiveNetworkTripwire.js.
Julgar aridade/semântica independente, inputs inertes, disponibilidade fail-closed,
isolamento de expected e suficiência dos testes. Não conceder GO de witness D/P,
completude do inventário, G11/N02-G/NEXT-02/NEXT-03/deploy/produção/dados reais.
