# ROAD-01.2 — tarefa de implementação: identidade estável de cartão

Data: 2026-08-27
Status: `READY_FOR_CODEX_IMPLEMENTATION`
Branch alvo: `chat/financial-roadmap-road01-20260827`
Base mínima esperada: `c8aeeee6f83d34920bb985dac6a0a5c5e9e7c024` ou descendente que altere apenas documentação ROAD-01

## Objetivo único

Eliminar a dependência contábil de labels de cartão no caminho de gravação/resumo, preservando `card_id` como identidade e mantendo compatibilidade com rotas legacy. Não alterar fechamento, competência ou parcelamento além da identidade usada no agrupamento.

## Arquivos prováveis

- `src/handlers/messageHandler.js`
- `src/services/google.js`
- `src/services/userSpreadsheetService.js`
- testes focais correspondentes em `tests/`

Evitar tocar analytics/Open Finance/export nesta fatia se não for necessário para preservar contrato existente; esses consumers entram nas próximas fatias de schema.

## Requisitos causais

1. `cardInfo.cardId` da aba `Cartões` deve vencer qualquer ID derivado de label.
2. `cardInfo.label/displayName` deve ser persistido como apresentação na coluna `Cartão`; `sheetName=Cartão <label>` pode continuar apenas como rota de compatibilidade e não como display persistido.
3. `google.mapRowForUserSpreadsheet` deve aceitar display canônico separado do legacy sheet name e manter fallback compatível para callers antigos.
4. `saveCreditCardExpense` e import de cartão devem fornecer card_id/display canônicos ao adapter sem mudar autorização/titularidade.
5. `Faturas` deve agregar por stable identity (`card_id`) + competência e resolver label apenas para apresentação. Linhas antigas sem card_id devem receber chave de compatibilidade por label sem serem misturadas com cartões distintos.
6. Se `Parcelamentos` for tocado, limitar a mudança a stable card identity; não redesenhar schedule/total previsto em ROAD-01.2.
7. Não alterar `purchaseDate > closingDay`, billing provenance, future installments ou refund semantics nesta fatia.

## Casos de teste obrigatórios

- dois rows com `card_id=nubank-daniel` e labels `Nubank - Daniel` / `Cartão Nubank - Daniel` produzem **uma** identidade/fatura;
- writer personal-sheet grava G=`nubank-daniel` e H=`Nubank - Daniel` mesmo quando a rota interna é `Cartão Nubank - Daniel`;
- legacy caller sem `cardDisplayName` mantém fallback legível e não perde user_id/relation note;
- card_id explícito nunca é substituído por slug derivado do nome;
- row antiga sem card_id permanece contabilizável por chave legacy, mas não é fundida com row de outro label;
- rotas de personal sheet e central/legacy continuam separadas;
- nenhum teste introduz regra de titular exclusivo.

## Validação mínima

1. syntax/diff check;
2. testes focais dos módulos alterados;
3. bateria causal de cartões/user spreadsheet/Google adapter;
4. somente no candidato estável, uma suíte ampla proporcional conforme `AGENTS.md`;
5. registrar contagens e arquivos no checkpoint ROAD-01;
6. publicar commit imutável sanitizado;
7. auditoria independente em conversa limpa do Chat, não Codex, antes de `GO` da fatia.

## Proibições

- sem deploy/restart/flag;
- sem Google Sheets real, Pluggy real ou WhatsApp real;
- sem backfill/migração de dados;
- sem subcategoria/schema v2 nesta fatia;
- sem alteração de ROAD-02/03/AUDIO;
- sem remover legacy adapters/canários.