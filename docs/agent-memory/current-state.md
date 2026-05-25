# Estado atual do FinancasBot

Atualizado em: 2026-05-25

## Produto

- Bot de WhatsApp para controle financeiro pessoal e familiar.
- Stack: Node.js, whatsapp-web.js/Puppeteer, Gemini 2.5 Flash, Google Sheets, Google Calendar, SQLite read model e dashboard web.
- Producao atual em EC2 com dominio `https://financasbot.duckdns.org`.
- Multiusuario existe, mas ainda exige cuidado juridico/privacidade antes de beta amplo.

## Estado de producao conhecido

- Ultimo deploy validado nesta memoria: commit `3d44fd3` (`fix: show reserve-adjusted dashboard cash`).
- Dashboard passou a mostrar `Saldo` economico e `Disponivel estimado` apos caixinha/reserva.
- O bot estava online no PM2 e WhatsApp chegou em `Bot pronto para receber mensagens` apos o deploy.
- Health check esperado: `/dashboard/health` retornando `ok`.

Sempre revalidar EC2/PM2/logs antes de afirmar que producao esta saudavel.

## Usuarios e privacidade

- Em beta atual, `ADMIN_IDS` deve conter apenas Daniel.
- Thais deve ser tratada como usuario comum/teste, mesmo que existam cartoes/abas com nome dela.
- Dashboard admin com `Todos os usuarios` e excecao temporaria de beta; nao liberar para multiusuario real sem remover acesso amplo a dados financeiros individuais.
- Consultar `docs/decisions/ADR-002-admin-financial-data-access.md` antes de qualquer mudanca em admin, dashboard, familia, permissoes ou launch.

## Funcionalidades importantes ja implementadas

- Onboarding com consentimento, aprovacao admin e OAuth Google.
- Planilha criada no Drive do usuario.
- Manual/link de orientacao enviado no onboarding.
- Importacao de CSV/OFX com previa completa, confirmacao e deteccao de duplicados.
- Importacao diferencia conta corrente, cartao, transferencias internas, caixinha/reserva e rendimentos.
- Familia/planilha compartilhada: lancamentos podem ir para a planilha dona do grupo com `user_id` do responsavel.
- Dashboard com filtros de usuario/mes e API de resumo consolidada para reduzir quota de Google Sheets.
- Perguntas financeiras via read model/SQLite e fallback.
- Cron jobs de resumo, agenda e vencimentos.

## Mudanca recente sobre caixinha/reserva

O dashboard agora separa:

- `Saldo`: resultado economico do periodo.
- `Disponivel estimado`: saldo economico menos reserva liquida enviada para caixinha/aplicacao.

Exemplo real validado em maio/2026:

- Saldo economico: R$ 3.470,24.
- Aplicado em reserva: R$ 2.738,86.
- Resgatado da reserva: R$ 1.330,00.
- Reserva liquida: R$ 1.408,86.
- Disponivel estimado: R$ 2.061,38.

## Contas e classificacao recorrente

Status: implementado localmente em 2026-05-25, pendente de deploy se ainda nao houver commit/deploy posterior.

Comportamento:

- O bot detecta saidas recorrentes e pergunta se deve cadastrar em `Contas`.
- Ao responder `sim`, ele agora pergunta como chamar/classificar a conta.
- A aba `Contas` mantem as quatro primeiras colunas compativeis: `Nome da Conta`, `Dia do Vencimento`, `Observações`, `user_id`.
- Novas colunas opcionais depois de `user_id`: `Nome Amigável`, `Categoria`, `Subcategoria`, `Valor Esperado`, `Regra Ativa`.
- Se `Categoria`, `Subcategoria` e `Regra Ativa=SIM` existirem, futuras importacoes de conta corrente usam essa regra antes da classificacao generica.
- Exemplo: `GRPLQ` pode virar `Moradia / ALUGUEL`.

Atencao:

- Planilhas existentes precisam ter os novos cabecalhos aplicados por template/ensure ou manualmente antes de a regra ficar visivel para o usuario.
- O scheduler continua lendo `Contas!A:D`, entao lembretes nao dependem das novas colunas.

## Higiene do workspace

Em 2026-05-25, `git status --short` mostrava arquivos nao rastreados antigos:

- `.claude/`
- `.env.bak-manual-url`
- `debug.log`
- `site-analysis/`
- `update_spreadsheet.js`
- `update_spreadsheet_v2.js`

Nao apagar nem mexer sem confirmar necessidade.
