# FinançasBot — ROAD-01.2 identidade estável de cartão — implementação Codex

Data: 2026-08-27
Task ID: `FIN-ROAD01-CARD-ID-IMPL-20260827`
Branch de produto alvo: `chat/financial-roadmap-road01-20260827`
HEAD alvo observado antes do envio: `2de48309ba7eb1fb4f434f6360fcbbf1f9172044`
Base de inventário ROAD-01.1: `c8aeeee6f83d34920bb985dac6a0a5c5e9e7c024`

## Nota operacional do canal

O executor do canal permanente roda no clone/branch operacional `chat/chat-codex-orchestration-20260824` e não deve fazer checkout, fetch, commit ou push. Nesta tarefa ele deve produzir um **candidato de implementação** apenas nos caminhos explicitamente autorizados. O Chat fará a reconciliação/transplante para a branch de produto depois do retorno e só então haverá auditoria independente.

Antes do envio, os blobs causais abaixo foram comparados entre a branch operacional e a branch ROAD-01 e são idênticos:

- `src/handlers/messageHandler.js` -> `f4a7b340b9a05d3473328d051110fcbc8ff3d609`
- `src/services/google.js` -> `ec3a9d3cffd8e259b0768493c0f8e6f2810d5a60`
- `src/services/userSpreadsheetService.js` -> `cc09382b826641ad95720af9f7a46af2c68c0b15`
- `tests/userSpreadsheetService.test.js` -> `f0d4fa8d736998655e5b9aeb8eaebed643ad7f49`

Se qualquer um desses blobs locais divergir no momento da execução, falhe fechado no relatório e não implemente.

## Objetivo único

Eliminar a dependência contábil de labels de cartão no caminho de gravação/resumo, preservando `card_id` como identidade e mantendo compatibilidade com rotas legacy. Não alterar fechamento, competência ou parcelamento além da identidade usada no agrupamento.

## Requisitos causais

1. `cardInfo.cardId` da aba `Cartões` deve vencer qualquer ID derivado de label.
2. `cardInfo.label/displayName` deve ser persistido como apresentação na coluna `Cartão`; `sheetName=Cartão <label>` pode continuar apenas como rota de compatibilidade e não como display persistido.
3. `google.mapRowForUserSpreadsheet` deve aceitar display canônico separado do legacy sheet name e manter fallback compatível para callers antigos.
4. `saveCreditCardExpense` e import de cartão devem fornecer card_id/display canônicos ao adapter sem mudar autorização/titularidade.
5. `Faturas` deve agregar por stable identity (`card_id`) + competência e resolver label apenas para apresentação. Linhas antigas sem card_id devem receber chave de compatibilidade por label sem serem misturadas com cartões distintos.
6. Se `Parcelamentos` for tocado, limitar a mudança a stable card identity; não redesenhar schedule/total previsto em ROAD-01.2.
7. Não alterar `purchaseDate > closingDay`, billing provenance, future installments ou refund semantics nesta fatia.

## Casos de teste obrigatórios

- dois rows com `card_id=nubank-daniel` e labels `Nubank - Daniel` / `Cartão Nubank - Daniel` produzem uma identidade/fatura;
- writer personal-sheet grava G=`nubank-daniel` e H=`Nubank - Daniel` mesmo quando a rota interna é `Cartão Nubank - Daniel`;
- legacy caller sem `cardDisplayName` mantém fallback legível e não perde `user_id`/relation note;
- card_id explícito nunca é substituído por slug derivado do nome;
- row antiga sem card_id permanece contabilizável por chave legacy, mas não é fundida com row de outro label;
- rotas de personal sheet e central/legacy continuam separadas;
- nenhum teste introduz regra de titular exclusivo.

## Validação

1. Faça revisão adversarial local antes de editar.
2. Implemente o menor patch causal.
3. Execute syntax/diff check.
4. Execute testes focais dos módulos alterados e bateria causal de cartões/user spreadsheet/Google adapter.
5. Somente no candidato estável, execute uma suíte ampla proporcional conforme `AGENTS.md`.
6. Registre no result file: arquivos alterados, testes/comandos, contagens, achados, riscos residuais e se o candidato está pronto para auditoria independente.

## Proibições

- sem deploy/restart/flag;
- sem Google Sheets real, Pluggy real, WhatsApp real, OCI/SSH ou serviços autenticados;
- sem backfill/migração de dados;
- sem subcategoria/schema v2;
- sem alteração de ROAD-02/03/AUDIO;
- sem remover legacy adapters/canários;
- sem mudança de titularidade/autorização dos cartões compartilhados da família;
- sem checkout/fetch/commit/push pelo executor.
