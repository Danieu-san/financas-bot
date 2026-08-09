# Gate 35 — candidato de revisao local privada

Data: 2026-08-09

## Escopo

Este candidato substitui somente a futura interface WhatsApp de saneamento das
ambiguidades historicas por uma revisao local privada. Ele nao abre dados reais,
nao acessa producao e nao cria lancamentos. O reconciliador continua read-only e
todo resultado declara `financial_writes=0`.

Base do candidato: `40d9ae6098ac69b11d500fce05862bd133c34405`.

## Arquivos para auditoria independente

- `src/openFinance/openFinanceHistoricalAmbiguityReview.js`;
- `scripts/runOpenFinanceHistoricalLocalReview.js`;
- `tests/openFinanceHistoricalAmbiguityLocalReview.test.js`;
- `tests/openFinanceHistoricalLocalReviewCli.test.js`;
- `tests/openFinanceHistoricalAmbiguityReview.test.js`;
- `tests/openFinanceHistoricalAmbiguityReconciler.test.js`;
- `tests/openFinanceHistoricalAmbiguityWhatsappRuntime.test.js`;
- `tests/openFinanceHistoricalRxGate35.test.js`;
- `docs/plans/workstreams/open-finance-historical-rx-gate35-operation.md`.

## Contrato implementado

- `review_channel=local_private` exige exatamente um revisor local e nao aceita
  respostas do canal WhatsApp;
- o detalhe financeiro aparece somente em HTML temporario, autocontido, sem
  scripts ou rede, fora do repositorio e com permissao `0600`;
- a conversa e os logs operacionais usam apenas referencias opacas, contagens e
  estados sanitizados;
- uma decisao coletiva exige coincidencia exata do conjunto integral de itens;
  omissao, inclusao ou referencia duplicada falha fechado;
- investimento usa como equivalencia fonte, segmento, tipo de operacao do
  provedor e direcao. Descricao, data e valor nao participam;
- parcela usa a mesma serie. Somente `distinct_rows` e `discard_all` podem ser
  coletivos; `keep_only` permanece individual;
- cada decisao ocorre em transacao SQLite com revisao otimista, envelope
  AES-256-GCM e MAC do registro, sobrevivendo a reabertura sem expor detalhes em
  claro no banco;
- o plano de resolucao read-only existente recebe as decisoes concluidas sem
  ampliar a fronteira de escrita;
- o fluxo familiar WhatsApp anterior permanece como canal padrao para estados
  antigos, mas nao participa da nova operacao local.

## Evidencia executada localmente

- syntax check dos arquivos JavaScript alterados: verde;
- testes focais e de regressao: `18/18`, zero falhas;
- bateria causal Gate 35: `41/41`, zero falhas;
- suite hermetica ampla: `1565` testes, `1555` aprovados, zero falhas, `10`
  skips previstos, zero cancelados e zero TODO;
- cobertura ampla: linhas `90,89%`, branches `73,49%`, funcoes `90,56%`;
- executor amplo: `valid=true`, `exit_status=0`, rede bloqueada e
  `whatsapp-real-e2e.test.js` excluido por controlar sessao real;
- `git diff --check`: verde.

Uma primeira tentativa ampla sem `node_modules` no worktree isolado falhou por
ambiente. O executor hermetico remove `NODE_PATH`; uma juncao local temporaria
para as dependencias ja instaladas corrigiu a precondicao. A execucao valida
acima e a unica usada como evidencia do candidato.

## Limites e criterio de fechamento

O candidato nao autoriza abrir o snapshot privado, executar as fases B/C/D,
publicar em producao ou antecipar o Gate 38. O estado maximo antes da revisao por
hash imutavel e `CANDIDATO AGUARDANDO AUDITORIA`.

A auditoria deve verificar especialmente a exatidao causal dos grupos, a
portabilidade das decisoes coletivas, a ausencia de detalhes nos retornos
operacionais, a persistencia/replay apos reabertura, a compatibilidade do canal
WhatsApp legado e a integracao read-only com o plano de resolucao.
