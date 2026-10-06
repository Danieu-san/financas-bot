# Correção de fixture de protocolo — escopo de auditoria

Estado deste registro: evidência local pré-publicação; publicação e parecer
serão registrados separadamente no checkpoint. Os campos published/audit=false
do JSON são o estado no momento da extração, não uma revisão retroativa.
Pai confirmado remotamente: `c27cf81dee9dd8a273a407aae3f17c591544d90f`.
O commit desse pai não está materializado no Git local; o index histórico
representa sua árvore `8d37249f5985423568232c0cc6707e25cf091dce`.
Não inventar um commit filho nem tratar uma árvore como commit publicado.

## Delta fechado

Uma única fonte medida mudou: `tests/next/provenance/executionHost.cases.js`.
As mensagens explicitamente inválidas mantêm o IPC aberto até a recusa do
host; os asserts exigem o código exato por cenário, não qualquer `host_*`.
Saída incompleta continua desconectando; nonzero e timeout preservam seus
cenários. Permanecem os mesmos limites e os mesmos cenários negativos.

Não houve mudança no host, runtime, compiler, checker, schema, oracle, inventário
ou norma. Nenhum filho foi excluído de coverage e nenhum JSON inválido foi
ignorado. A fixture impede que saída voluntária concorra desnecessariamente
com a recusa que o teste pretende observar; não flexibiliza a aceitação.

Paths previstos para o delta auditável:

- `tests/next/provenance/executionHost.cases.js`
- `docs/audit-evidence/n02g-causal-authoring-profile/graph-process-fixture-final-evidence-20261006.json`
- `docs/audit-evidence/n02g-causal-authoring-profile/verify-graph-process-final-evidence-20261006.cjs`
- `docs/audit-evidence/n02g-causal-authoring-profile/graph-process-fixture-audit-scope-20261006.md`

Demais dependências são as fontes inalteradas do pai; não exportar WIP alheio.
Checkpoint e logs brutos são operacionais, não uma nova implementação.

## Evidência local e significado

Syntax do arquivo, focal GRAPH-PROCESS-002 (1 PASS) e bateria afetada (12 PASS)
concluíram com exit0, coverage e fontes estáveis. Hash do relatório afetado:
`1565a58a177d8a6ea8846491691a0298d7469bdb099d5033c598fa5c5549781a`.

Uma ampla posterior em ambiente normal conferido concluiu em
2026-10-06T02:42:09.037Z: 2630 testes, 2620 PASS, zero FAIL/cancelamentos,
10 SKIP previstos, exit0. Coverage: 92.50% linhas, 80.63% branches,
92.83% funções. Fontes765 estáveis, hash
`3c50cd1065357caf91e693bb49a0f5dfb84b9cb96499efa3414c44b0d7958914`.
O resumo JSON registra hashes da captura e a checagem dos JSONs nativos
retidos. O verificador reconcilia arquivos locais: não executa testes nem
produz aprovação independente. Os brutos não são publicados.

A ampla anterior nesta correção foi RED (2501 PASS/116 FAIL/13 SKIP).
Recuperações 13+38+65, com títulos exatamente particionados, passaram antes
da ampla verde. A mudança observada foi de configuração/capacidades locais
de execução versus recusas do ambiente sandbox anterior, não outro patch.
Isso não demonstra retrospectivamente a causa de todos116 erros.

Também permanece RED a ampla anterior ao patch (2609 PASS/11 cancelados/
10 SKIP). O replay619 identificou um JSON nativo vazio e seu produtor em
GRAPH-PROCESS-002, mas não estabeleceu a causa dos11 cancelamentos históricos.
Nem a recuperação nem a ampla verde reescrevem esses resultados.

## Perguntas exatas ao auditor

1. O delta mantém cada cenário negativo e exige sua recusa específica,
   sem trocar erro de protocolo por timeout, sucesso ou exclusão de coverage?
2. A manutenção do IPC pertence só à fixture inválida, com término pelo host,
   sem alterar os casos de saída incompleta/nonzero/timeout?
3. A reconciliação separa execução verde atual, captura e evidência histórica
   RED, sem alegação causal maior que a demonstrada?
4. Há finding bloqueante neste delta ou nas invariantes que ele pode afetar?

Exigir confirmação do hash novo publicado e dos paths efetivamente lidos.
O parecer anterior APTO sobre c27 foi focal M-01/binding_1 e manteve HOLD;
não constitui auditoria deste delta.

## Limites obrigatórios

Nenhum GO global G11/N02-G/NEXT-02; 2418 IDs semânticos fora do focal mensal
permanecem pendentes. Nenhum receipt, validated_parent, NEXT-03, deploy,
produção ou dado real é autorizado. Aprovação deste delta só permite fechar
esta correção após confronto com a evidência local, não o gate inteiro.
