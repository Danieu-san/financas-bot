# Problemas conhecidos e armadilhas

Atualizado em: 2026-05-26

## Privacidade/admin

- O dashboard admin com acesso a todos os usuarios foi mitigado por padrao no codigo.
- `DASHBOARD_ADMIN_ALL_USERS_ENABLED` deve ficar ausente ou `false` em beta/producao.
- Se `DASHBOARD_ADMIN_ALL_USERS_ENABLED=true` for usado, tratar como modo suporte/teste controlado, temporario e aprovado explicitamente.
- Antes de beta amplo, manter removido o acesso admin amplo a dados financeiros individuais.
- Sempre consultar `docs/decisions/ADR-002-admin-financial-data-access.md` em mudancas de admin, dashboard, familia ou launch.

## `Contas` como memoria de categorizacao

Status:

- Implementado e coberto por testes; confirmar deploy/PM2 antes de assumir que esta ativo em producao.

Comportamento novo:

- A aba `Contas` continua compativel nas colunas A:D.
- Novas colunas E:I guardam nome amigavel, categoria, subcategoria, valor esperado e regra ativa.
- Ao aceitar cadastrar uma conta recorrente, o bot pergunta como deve chamar/classificar.
- Futuras importacoes de conta corrente aplicam regras ativas de `Contas` antes da classificacao generica.

Armadilha:

- Planilhas antigas podem nao exibir as colunas E:I ate o template/ensure ser reaplicado.
- Se o usuario responder `só lembrar`, o bot cadastra o vencimento sem criar regra de classificacao.

## Caixinha/reserva afeta percepcao de saldo

Sintoma:

- Usuario acha que o saldo do dashboard esta alto demais.

Causa:

- Parte do dinheiro foi enviado para caixinha/reserva e depois resgatado conforme necessidade.
- O saldo economico nao e igual ao dinheiro disponivel fora da reserva.

Mitigacao atual:

- Dashboard exibe `Saldo` e `Disponivel estimado`.
- Importador classifica aplicacoes/resgates de reserva como `Transferências`.

## Horarios do Google Calendar

Ja houve divergencia entre horario exibido no WhatsApp e Google Calendar. Ao mexer em scheduler/calendar:

- Testar com eventos reais de hoje/amanha.
- Conferir timezone America/Sao_Paulo.
- Verificar tanto resumo matinal quanto noturno.
- Em 2026-05-26 foi feita validacao real com evento e conta `TESTE_APAGAR Cron`; agenda e vencimento apareceram na mensagem simulada e a limpeza terminou com `remainingRows=0`, `remainingEvents=0`.

## Quota do Google Sheets

- Leituras repetidas de planilha agora usam cache curto em memoria via `readDataFromSheet`.
- Padrao: `GOOGLE_SHEETS_READ_CACHE_TTL_MS=20000`; usar `0` em scripts/testes que precisam enxergar alteracoes imediatamente.
- Escritas invalidam o cache por seguranca.
- Ainda vale monitorar quota se usuarios fizerem muitas perguntas analiticas em paralelo; o cache reduz burst, mas nao substitui read-model por usuario em todos os fluxos.
- Baterias reais muito rapidas pelo WhatsApp ainda podem acumular leituras e gerar `Quota exceeded`; preferir testes espaçados ou scripts que validem intents sem martelar Sheets.

## Prompt injection em perguntas financeiras

- Prompt injection basico pedindo acesso a outra planilha foi rejeitado como `desconhecido` em teste real.
- Ainda existe risco de uma mensagem maliciosa que contenha uma pergunta financeira legitima, como `qual o saldo de agosto`, ser roteada para calculo do proprio usuario em vez de ser bloqueada como tentativa de extrair informacao interna.
- Proximo endurecimento recomendado: filtro local para termos como `sheet id`, `user id`, `tenant id`, `identificador interno`, `planilha de outro cliente` e pedidos de bypass/admin antes da classificacao financeira.

## WhatsApp Web pode travar ao iniciar

Sintoma:

- Logs param em `WhatsApp carregando: 100%` ou `Autenticado com sucesso! Carregando chats...`.

Mitigacoes usadas:

- Aguardar mais tempo antes de concluir falha.
- Reiniciar PM2 com cuidado.
- Evitar apagar `.wwebjs_auth` sem necessidade, pois forca novo QR.
- Limpar cache `.wwebjs_cache` pode ajudar, mas nao deve ser primeira acao destrutiva.

## `.env` de producao e sensivel

- Nunca editar `.env` sem backup.
- Nunca expor valores sensiveis em resposta final.
- Se precisar validar variaveis, conferir presenca/forma, nao repetir segredo completo.

## Arquivos sujos locais

Arquivos nao rastreados antigos podem existir. Nao remover sem pedido explicito:

- `.claude/`
- `.env.bak-manual-url`
- `debug.log`
- `site-analysis/`
- `update_spreadsheet.js`
- `update_spreadsheet_v2.js`

## Duplicidade de extratos

- O bot ja identifica duplicados exatos em importacoes.
- Possiveis duplicados entre lancamento manual e extrato devem ser tratados com cuidado para nao apagar gastos reais.
- Sempre validar no preview e em testes antes de alterar heuristica.

## Cartoes e parcelamentos

- Ha abas especificas para `Lançamentos Cartão`, `Faturas` e `Parcelamentos`.
- Mudancas em colunas podem quebrar formulas e perguntas analiticas.
- Verificar `tests/userSpreadsheetService.test.js` e perguntas do read model antes de alterar estrutura.
