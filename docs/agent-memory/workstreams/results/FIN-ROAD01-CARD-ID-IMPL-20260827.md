# FIN-ROAD01-CARD-ID-IMPL-20260827 — resultado do candidato

## Escopo executado

- `cardInfo.cardId` explícito agora é encaminhado ao adaptador de planilha e
  prevalece sobre qualquer slug derivado da rota legada.
- `cardDisplayName` é persistido separadamente como apresentação; a rota
  `sheetName` continua sendo somente o destino físico do lançamento.
- Chamadores legados sem `cardId` continuam deixando o adaptador derivar a
  identidade a partir da planilha, sem trocar o identificador histórico por uma
  chave de configuração.
- A agregação de `Faturas` passou a agrupar por `card_id` (coluna G) e período
  de competência (coluna F), evitando que rótulos diferentes do mesmo cartão
  fragmentem o total.

## Evidência de base e validação

Os quatro blobs exigidos pelo manifesto foram conferidos antes da edição:

- `src/handlers/messageHandler.js`: `f4a7b340b9a05d3473328d051110fcbc8ff3d609`
- `src/services/google.js`: `ec3a9d3cffd8e259b0768493c0f8e6f2810d5a60`
- `src/services/userSpreadsheetService.js`: `cc09382b826641ad95720af9f7a46af2c68c0b15`
- `tests/userSpreadsheetService.test.js`: `f0d4fa8d736998655e5b9aeb8eaebed643ad7f49`

Validações executadas:

1. `node --test --test-force-exit --test-name-pattern 'card writes preserve|google user spreadsheet mapping' tests/unit.test.js` — 2/2 aprovados.
2. `node --test --test-force-exit tests/userSpreadsheetService.test.js tests/unit.test.js` — 226/226 aprovados.
3. `node --check` nos três módulos alterados e `git diff --check` — aprovados.

O teste focal demonstra que o `card_id` explícito vence uma chave legada, que
o destino `Cartão Nubank - Daniel` não substitui a identidade `nubank-daniel`,
que o nome canônico é preservado para apresentação e que a rota sem ID ainda
usa a derivação legada. A suíte de planilha verifica também a fórmula de
`Faturas` por G/F. Não houve alteração de escopo, titularidade, relação familiar
ou exclusividade.

## Observação externa

`validateAgentWorkflow.js` falhou exclusivamente porque o arquivo não alterado
`scripts/agent/watchChatCodexOrchestration.js` mede 28.816 bytes na cópia de
trabalho com CRLF, acima do teto de 28.672; o blob em `HEAD` mede 27.348 bytes.
Esse arquivo não está em `allowed_paths`, não foi modificado e não bloqueia a
evidência causal deste candidato. A divergência deve ser tratada em tarefa
própria de workflow, se ainda reproduzir no ambiente de publicação.

## Risco residual e estado

Risco residual: a apresentação de `Faturas` deve continuar resolvendo o rótulo
canônico a partir de `Cartões`; a chave de agregação agora é deliberadamente
somente `card_id` + competência. Nenhum serviço real, segredo, planilha ou
produção foi acessado.

READY_FOR_CHAT_AUDIT
