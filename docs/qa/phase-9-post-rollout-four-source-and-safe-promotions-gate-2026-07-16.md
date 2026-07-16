# Pos-Fase 9: quatro fontes e promocoes seguras - gate de producao

Data: 2026-07-16

## Veredito

`GO` para manter alertas Open Finance read-only nas quatro fontes familiares e
para manter ativas as promocoes independentes aprovadas por teste.

`NO-GO` para escrita automatica Open Finance, para afirmar que o alerta ja
reconcilia com lancamentos internos e para promover ou remover qualquer outra
superficie sem o gate proprio.

## Smoke real das quatro fontes

- aliases ativos: `daniel_nubank`, `thais_nubank`, `cristina_nubank` e
  `thais_itau`;
- cutoff por alias: `2026-07-16T19:24:49.904Z`;
- uma compra nova de Cristina Nubank foi entregue uma unica vez a Thais;
- referencia publica: `08aa505fb3`;
- a mensagem identificou fonte, compra, data e declarou que nada foi salvo;
- o transporte resolveu sem ID do provedor, portanto o item foi para
  `accepted_unconfirmed` e nao sofreu retry automatico;
- depois da confirmacao humana, o CLI fail-closed moveu exatamente esse item
  para `delivered_confirmed`, com zero transporte e zero escrita financeira.

Outbox final: total 4, bloqueado 1, `legacy_sent` 2,
`delivered_confirmed` 1, pendente 0, in-flight 0 e
`accepted_unconfirmed` 0.

## Promocoes aplicadas

- `FINANCIAL_AGENT_MODE=answer`;
- `FINANCIAL_FILE_IO_MODE=on`;
- `FINANCIAL_RECEIPTS_MODE=on`;
- `FINANCIAL_DOCUMENT_OCR_MODE=on`;
- `BATCH_MAINTENANCE_MODE=canary`, com Daniel e Thais no escopo.

Importacao/exportacao continua exigindo comando e preview. Comprovantes se
vinculam apenas a evento existente. OCR apenas prepara staging/preview e nao
grava sozinho. Manutencao em lote permaneceu canario porque altera linhas.

## Superficies deliberadamente preservadas

- Interpretation Reliability: `shadow`, com divergencias ainda bloqueadoras;
- Canonical Ledger e projected plans: `shadow/canary`;
- Financial Command Planner: `canary`;
- cartoes unificados e consumidores antigos: `canary` com fallbacks;
- Financial Undo: `off`, sem fluxo de produto WhatsApp comprovado;
- Dashboard v1 e API v1;
- fallbacks analiticos e de fonte;
- todos os candidatos da Fase 8 ainda em observacao.

Nenhum codigo legado, aba, fallback, schema ou dado foi removido.

## Evidencia

- suite completa local: `985/985`;
- Open Finance local e remoto: `92/92`;
- Financial Agent remoto: `87/87`;
- importacao/exportacao 6B: `41/41`;
- comprovantes 6C: `8/8`;
- OCR 6D: `5/5`;
- PM2 `online`, restart 374;
- WhatsApp autenticado e pronto;
- health: `ok=true`, `sqlite=true`;
- ciclo Open Finance pos-restart: zero entrega, retry e escrita;
- runtime funcional: `5f9e707e14da4af1dd913dc09221d923e17ee45b`;
- rollback: `.env.pre-safe-promotions-5f9e707-20260716T1955Z`.

## Lacuna funcional encontrada

O runtime atual executa Pluggy -> baseline proprio -> lifecycle -> outbox ->
WhatsApp. Ele nao consulta read-model, ledger ou Sheets antes de alertar. Sua
deduplicacao prova apenas que o evento e novo para o Pluggy. O reconciliador 9D
continua offline/shadow, e nao existe handler `salvar <referencia>`.

Fluxo alvo correto:

1. `matched`: registrar telemetria e silenciar;
2. `possible_duplicate`: pedir revisao, sem proposta de escrita;
3. `new`: enviar proposta preenchida e exigir preview + confirmacao;
4. `uncertain` ou fonte interna indisponivel/stale: falhar fechado;
5. revalidar imediatamente antes de escrever e usar operation key estavel;
6. parear compra/estorno antes de propor qualquer compensacao.

Essa lacuna nao invalida o GO read-only. Ela impede afirmar que Open Finance ja
automatiza reconciliacao ou salvamento.

## Proximo gate

1. Conectar o reconciliador ao runtime em modo somente leitura, antes do
   outbox, sem alterar a mensagem ou permitir escrita.
2. Provar `matched/new/possible_duplicate/unavailable`, escopo por usuario,
   fonte, conta e cartao, alem de replay e `PENDING -> POSTED`.
3. Somente depois criar, atras de flag canario, a proposta
   `salvar <referencia>` para compra simples nao parcelada.
4. Manter `OPEN_FINANCE_WRITE_MODE=off`; qualquer gravacao deve nascer da acao
   explicita e confirmada no WhatsApp, nunca do polling Open Finance.
