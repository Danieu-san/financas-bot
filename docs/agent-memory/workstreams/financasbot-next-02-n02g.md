# N02-G — checkpoint

Data: 2026-09-11. Estado: CHARTER PROPOSTO; REVISÃO DE ESCOPO PENDENTE.
Base: `aea4ac31e358ed8d8907e78f6002c8bb80233bc8`.
Branch: `codex/financasbot-n02g-provenance-engine-20260911`.
Worktree: `.codex-worktrees/financasbot-n02g-provenance-engine`.
Plano: `../../plans/workstreams/financasbot-next-02-n02g-v1.md`.

Daniel autorizou continuidade e selecionou Astra/Alto. N02-F está encerrado
documentalmente em A+B+C; seus recibos estão no commit de canal
aa3a2caad6051ae8702dcffa2ef87d8674e8cf0f. Não reauditar esse mesmo candidate.

Objetivo: execução integral de provenance, G07/G08/G11/G14, para os 76 grafos,
preservando CP-02 e CP-03..CP-07. Escopo inicial deste commit: somente plano,
este checkpoint e linha N02-G no índice. Nenhuma implementação iniciada.

Confronto local: canonicalValue pode ser reaproveitado para seus preimages;
hashes documentais exigem bytes exatos. O validador v1 mistura funções de
cálculo/oracle e não pode ser importado como evaluator. Gateway/verifier atuais
ainda usam claim reduzido; a migração de G14 exige binding ao host e projeção
pública antes de resposta/CAS. Pins CP-01 e tripwire não substituem o novo TCB.

O charter fixa entrega integral, módulos propostos, reuso, REDs e gate final.
Dois detalhes técnicos são pré-condições explícitas da implementação: demonstrar
isolamento do runner sob o contrato vigente; mapear campos/lentes do read model
para kinds de provenance sem alias ou escolha de fato pelo resultado.

Candidate documental publicado e confirmado no remoto:
`8c1f1302803d625ddfc48f47d60d8c8416d5dee7`, parent igual à base acima.
Validação local: agent-workflow OK, diff --check OK, três documentos;
nenhuma suíte funcional reexecutada, pois não houve alteração funcional.

Canal reservado em `2e672e78335491fc0463e85aec5216863847249a`, CHAT_WORKING,
state hash `e20b4d799ee8f6faf71e71044c56d57dbca653fdafb71aeb26cd833bf31ec3b3`.
Retorno solicitado: `FIN-NEXT02-N02G-CHARTER-RETURN-20260911`.
Uma tentativa pelo bot foi executada; exit 1, entrega NÃO CONFIRMADA por
ausência de id persistido do turno. Isso não prova ausência de envio. Janela
preservada; não repetir automaticamente. Prompt local ignorado pelo Git em
`logs/n02g-charter-audit-prompt.txt`. Não houve bloqueio de segurança relatado.

Próxima ação exata: confirmar o recebimento/parecer desta tentativa e obter a
revisão focal de escopo/ordem/interfaces contra CP-02/NEXT-00, sem reabrir A/B/C.
Após confronto favorável, registrar paths concretos do primeiro RED e iniciar
compiler/IR e a prova de admissibilidade de execução. Nenhum PASS intermediário
libera rollout ou substitui o gate integral. Ampla somente no candidato estável;
ao iniciá-la, pausar sem polling, conforme preferência de Daniel.

Telemetria de calibração: não consultada nesta abertura; métricas de uso
NAO_DISPONIVEL. Não amplia coleta nem bloqueia o produto.

Codex → Astra → Alto → implementar a fronteira integral após revisão do charter.
