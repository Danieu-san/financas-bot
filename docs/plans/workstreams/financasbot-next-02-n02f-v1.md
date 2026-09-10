# N02-F — preparação documental integral de provenance

Data: 2026-09-10. Estado: CANDIDATO DOCUMENTAL CORRIGIDO; REAUDITORIA PENDENTE.
Base: `ee5a0161f0c24a1c9a6a3c95a04e9da1eec4e91d`.
Branch: `codex/financasbot-n02f-provenance-20260909`.
Worktree: `.codex-worktrees/financasbot-n02f-provenance`.

## Objetivo e autoridade

Materializar os contratos documentais e autorar/revisar os 76 grafos exigidos
pela seção 13 do desenho NEXT-00 ratificado. CP-02 foi aprovado em
`b624b3d8a85bc8cebc0401d3f0e4fe6cf7d760ae`; o recibo está na base deste trabalho.
N02-F é uma fatia de NEXT-02, não uma nova fase nem seu GO global.

Autoridades, sem alteração nesta fatia:

- `financasbot-cp02-closure-inventory-v1.md`, G07/G08/G11/G14 e próxima fatia;
- `financasbot-next-00-provenance-graph-design-v1.md`, §§3–14, e ratificação v1;
- `financasbot-next-roadmap-draft-v2.md`, §6;
- `docs/contracts/next/model-data-boundary-contract-v0.md`, §§3–5.

## Escopo fechado

Preparar schema v2, registries de campos/operadores/evaluators e contrato de
claim; depois autorar os grafos de 76/76 fact_keys e sua rastreabilidade.
O conjunto inclui fatos de domínios futuros e representações históricas, sem
implementar suas tools ou forçar equivalência numérica com o novo kernel.

Paths de trabalho desta preparação:

- este plano;
- `docs/agent-memory/workstreams/financasbot-next-02-n02f.md`;
- somente a linha N02-F em `docs/agent-memory/workstreams/index.md`;
- `docs/contracts/next/provenance-v2/authoring-contract-v1.md`;
- futuros artefatos declarativos sob `docs/contracts/next/provenance-v2/`,
  cujos nomes serão enumerados no checkpoint antes da criação.

Não alterar `src/`, scripts de compiler/evaluator/validator, dependências,
fixtures/contratos/oracle v1, pins CP-01, runtime v1, canal/bot, produção ou
dados reais. Ferramentas existentes de leitura/validação mecânica podem ser
executadas; não são autorização para construir o motor antecipadamente.

## Ordem e critérios de saída

1. Inventariar semântica e campos dos contratos/conversas/fixtures existentes.
2. Especificar tipos, identidades e relações, reutilizando conceitos aprovados.
3. Publicar schema/registries documentais com pendências explícitas, sem
   tratar declaração de executável futuro como artefato medido.
4. Autorar os 76 grafos; cada um deve ligar pergunta/claim às evidências e
   obrigações. Valores do oracle não geram nós, predicados ou relações.
5. Revisar o conjunto integral e confrontar igualdade dos fact_keys, refs,
   tipos, arestas e obrigações. Contagem 76/76 isoladamente não prova semântica.
6. Publicar candidato imutável sanitizado e obter auditoria independente dos
   contratos, registries e todos os grafos. Só então selecionar a fatia
   executável, respeitando a migração integral.

Nenhum compiler/evaluator é iniciado enquanto faltar grafo ou revisão. Dividir
autoria em lotes não divide a aprovação nem libera execução parcial. G05/G06/
G09/G10/G13 e os gates globais continuam preservados.

## Reuso e independência

O contrato de fatos v1 oferece semântica revisada, não prova de conteúdo atrás
das refs. A fixture oferece fatos sintéticos, não a conclusão da prova. O oracle
continua autoridade independente do resultado. O kernel, canonicalValue, agenda
e read model aprovados são candidatos a reuso; seus pins não substituem o
closure instrumentado futuro. Não criar uma segunda DSL de fórmulas.

## Riscos e condições de parada

- falta de evidência material no mundo sintético: registrar lacuna; não
  fabricar vínculo nem editar a fixture congelada silenciosamente;
- semântica histórica diferente: representar explicitamente, não renomear
  event_date como billing_period ou substituir expectativa;
- identidade pública confundida com interna: bloquear e revisar o binding;
- necessidade de mudar arquitetura/ordem ratificada: parar para decisão;
- root de executável ainda inexistente: registrar ausência, nunca preencher
  digest fictício ou promover rascunho como registry executável congelado.

## Validação proporcional

Usar parsing dos artefatos declarativos, inventário exato de paths/fact_keys,
referências, revisão causal e `git diff --check`; executar
`node scripts/agent/validateAgentWorkflow.js` no checkpoint. Nenhuma suíte
funcional ampla repetida enquanto não houver mudança funcional autorizada.
Não relatar compiler, proof trace ou mutation suite como executados nesta fase.

## Próxima ação exata

Auditoria integral de ef04368 confirmou H-01/H-02/M-01. Correção documental
mantém 76 grafos, separa estado da entrada/resultado e seleção/exame, e propõe
operator registry v2 com cinco relações civis. A via de extensão já existe no
NEXT-00 §8: versão, decisão curta, propriedades e auditoria. Não modificar a
ratificação anterior nem implementar operadores antes dessa revisão.
Referências: temporal-relations-decision-v1.md,
temporal-and-selection-witnesses-v1.json e n02f-correction-review-v1.md
sob docs/contracts/next/provenance-v2/.

Publicar novo SHA e auditar o delta em dois lotes com escopos distintos:
A, estado/seleção e coerência estrutural dos 76 grafos; B, cinco relações
civis e sete grafos temporais. Consolidar cobertura/cruzamentos antes de um
único veredito N02-F; nenhum lote isolado autoriza compiler/evaluator.
Não repetir a auditoria semântica integral de campos comprovadamente inalterados.
Se a ferramenta do auditor não conseguir confirmar o delta, registrar leitura
pendente em vez de presumir aprovação por resumo.

O pacote de autoria está materializado: schemas, 23 kinds, 115 snapshots,
39 contratos de evaluators/witnesses, registries/templates e 76 claims/grafos.
Publicar o candidato sanitizado e obter revisão independente integral,
incluindo suficiência das seleções/exclusões, janelas, pais e observações.
O checkpoint e graph-authoring-review-v1.md distinguem checks mecânicos de
autoria das propriedades do motor ainda não executadas. Nenhum GO antecipado.
