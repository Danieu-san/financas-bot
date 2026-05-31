# Estado atual do FinancasBot

Atualizado em: 2026-05-31

## Produto

- Bot de WhatsApp para controle financeiro pessoal e familiar.
- Stack: Node.js, whatsapp-web.js/Puppeteer, Gemini 2.5 Flash, Google Sheets, Google Calendar, SQLite read model e dashboard web.
- Producao atual em EC2 com dominio `https://financasbot.duckdns.org`.
- Multiusuario existe, mas ainda exige cuidado juridico/privacidade antes de beta amplo.

## Estado de producao conhecido

- Ultimo deploy validado: commit `376c2c8` (`fix: infer credit card from explicit card name`).
- Health check em producao respondeu `{"ok":true,"sqlite":true}` e PM2 confirmou `Bot pronto para receber mensagens`.
- Dashboard passou a mostrar `Saldo` economico e `Disponivel estimado` apos caixinha/reserva.
- O bot estava online no PM2 e WhatsApp chegou em `Bot pronto para receber mensagens` apos o deploy.
- Health check esperado: `/dashboard/health` retornando `ok`.

Sempre revalidar EC2/PM2/logs antes de afirmar que producao esta saudavel.

## Usuarios e privacidade

- Em beta atual, `ADMIN_IDS` deve conter apenas Daniel.
- Thais deve ser tratada como usuario comum/teste, mesmo que existam cartoes/abas com nome dela.
- Dashboard admin nao deve expor `Todos os usuarios` por padrao. Acesso cruzado a dados financeiros so pode existir com `DASHBOARD_ADMIN_ALL_USERS_ENABLED=true`, em modo suporte/teste controlado e com aprovacao explicita.
- Consultar `docs/decisions/ADR-002-admin-financial-data-access.md` antes de qualquer mudanca em admin, dashboard, familia, permissoes ou launch.

## Funcionalidades importantes ja implementadas

- Onboarding com consentimento, aprovacao admin e OAuth Google.
- Planilha criada no Drive do usuario.
- Manual/link de orientacao enviado no onboarding.
- Importacao de CSV/OFX com previa completa, confirmacao e deteccao de duplicados.
- Importacao de CSV/OFX tem limites antes do parse: `IMPORT_MAX_FILE_BYTES` padrao 1 MiB e `IMPORT_MAX_ROWS` padrao 1000 linhas nao vazias.
- Importacao diferencia conta corrente, cartao, transferencias internas, caixinha/reserva e rendimentos.
- Familia/planilha compartilhada: lancamentos podem ir para a planilha dona do grupo com `user_id` do responsavel.
- Dashboard com filtros de usuario/mes e API de resumo consolidada para reduzir quota de Google Sheets.
- Links do dashboard enviados pelo WhatsApp usam `#token=`; a pagina guarda o token em `sessionStorage` e remove o token da barra de endereco para reduzir exposicao em logs/historico/referrer.
- Tokens de dashboard agora sao curtos por padrao: `DASHBOARD_TOKEN_TTL_SECONDS` padrao 900s e `DASHBOARD_TOKEN_MAX_TTL_SECONDS` padrao 1800s.
- Acesso ao dashboard grava auditoria local sanitizada em `data/dashboard-access.jsonl` por padrao, controlada por `DASHBOARD_ACCESS_LOG_ENABLED` e `DASHBOARD_ACCESS_LOG_PATH`. O log guarda hashes de token/usuarios, evento, escopo e caminho sem querystring; nao guarda token, URL completa, telefone ou dados financeiros.
- Comandos admin sensiveis agora exigem segunda mensagem `confirmar admin` antes de executar. A confirmacao fica so em memoria, expira em 5 minutos e nao grava o comando pendente em `state_store.json`.
- AdminActionLog local foi adicionado para acoes admin sensiveis: grava JSONL sanitizado em `data/admin-actions.jsonl` por padrao, com actor/target em hash e sem corpo de mensagem manual. Validar deploy antes de assumir ativo em producao.
- Leituras diretas do Google Sheets passam por cache curto em memoria (`GOOGLE_SHEETS_READ_CACHE_TTL_MS`, padrao 20s) com invalidacao apos escrita, para reduzir bursts de quota sem misturar dados entre planilhas.
- Perguntas financeiras via read model/SQLite e fallback.
- Cron jobs de resumo, agenda e vencimentos.
- Validacao real de cron em 2026-05-26 confirmou agenda do Google Calendar e vencimentos de `Contas`; marcadores `TESTE_APAGAR Cron` foram removidos ao final (`remainingRows=0`, `remainingEvents=0`).
- Auditoria de cobertura criada em `docs/audits/bot-capability-coverage.md` para rastrear caminhos basicos prometidos pelo bot e evitar lacunas de teste como a de metas.
- Checklist completo de cobertura criado em `docs/audits/bot-complete-coverage-checklist.md`, mapeando cada caminho conhecido do bot para teste ativo ou E2E opcional documentado.
- `npm test` agora roda apenas testes ativos. O antigo `tests/integration.test.js` foi removido por ser legado/pulado e o `tests/functional.test.js` ficou apenas como E2E opcional via `npm run test:functional`.
- Fluxos de audio e lotes financeiros foram promovidos para cobertura ativa em `tests/financialStateMachine.test.js`: audio transcrito entra no mesmo roteamento textual, lote misto grava entradas/saidas, lote sem pagamento pergunta uma vez, e lote no credito grava parcelas por item.
- Dependencias moderadamente vulneraveis foram atualizadas em 2026-05-26: `googleapis`, `node-cron` e `qs`. Validar sempre com `npm audit --audit-level=moderate` antes de release.
- Orcamento mensal livre substitui a meta diaria fixa: comando `definir orçamento mensal <valor> dia <1-31>`, comando `desativar orçamento mensal`, alertas por WhatsApp em 50%, 80% e 100% do ritmo diario recomendado e graficos diario/ciclo no dashboard. O onboarding sugere `definir orçamento mensal 3000 dia 5`.
- Orcamento mensal livre tem escopo `personal` ou `family`. Com familia ativa, `definir orçamento mensal <valor>` pergunta se o orçamento e pessoal ou familiar. A resposta curta `orçamento mensal família`/`orçamento mensal pessoal` altera o escopo de um orçamento ja ativo.
- Orcamento mensal livre usa ciclo configuravel por dia de inicio: `monthly_budget_cycle_start_day`. Dia pode ser 1 a 31; em meses curtos, dia 31/30 cai no ultimo dia valido. O ciclo do dashboard pode cruzar meses, por exemplo 17/05 a 16/06.
- Correcao local em 2026-05-30: `UserSettings` deve ser lido/escrito em `A:S`; usar ranges antigos `A:M`/`A:R` quebra o salvamento do orçamento mensal porque os campos `monthly_budget_*` ficam nas colunas N:S.
- Ao ativar vinculo familiar por `admin compartilhar planilha`, se o dono ja tiver orçamento mensal ativo, o bot envia ao dono uma pergunta para decidir se ele continua pessoal ou vira familiar.
- Roteamento de gastos ficou mais inteligente em 2026-05-29: se a mensagem ja trouxer `credito`, nome do cartao e `a vista`/parcelas, o bot pula perguntas redundantes e grava direto. Ha fallback para contar cartoes em `Lançamentos Cartão` e em abas legadas `Cartão ...` no orçamento mensal.
- Planilha do usuario teve correcoes em 2026-05-31: `Faturas` e `Parcelamentos` agora sao tratadas como abas da planilha pessoal, lancamentos de cartao passam a gravar valor numerico (nao texto) e as formulas `QUERY` dos resumos usam `headers=0` para nao ignorar a primeira compra real.
- Planilha real do Daniel foi copiada antes da limpeza (`Backup FinancasBot Daniel antes limpeza 2026-05-31 0249`) e depois teve linhas financeiras anteriores a 29/05/2026 removidas de `Entradas`, `Saídas`, `Transferências` e `Lançamentos Cartão`. Configuracoes, contas, metas, dividas, manual, dashboard e formulas foram preservados.
- Correcao em 2026-05-31: quando o usuario cita um cartao cadastrado pelo nome (ex.: `cartao nubank thais`) sem dizer `debito`, o bot trata como cartao de credito mesmo se a IA classificar equivocadamente como `Débito`; `à vista` vira parcela `1/1`. Se o usuario disser explicitamente `debito`, o fluxo de debito e preservado.
- Dado real corrigido em 2026-05-31: `restaurante malz` de R$125,25 foi movido de `Saídas/Débito` para `Lançamentos Cartão/Cartão Nubank - Thais`, apos backup `Backup FinancasBot Daniel antes mover restaurante malz 2026-05-31 1249`.
- Correcao local em 2026-05-31: lancamentos manuais como `guardei ... na caixinha` agora entram em `Transferências` como reserva/investimento, nao em `Entradas`; transferencias manuais para membro do escopo familiar entram em `Transferências`, nao em `Saídas`; valores manuais usam `parseValue` para preservar centavos com virgula. Cobertura adicionada em `tests/financialStateMachine.test.js`; `npm test` passou com 214 testes.

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

Status: implementado e coberto por testes; confirmar deploy/PM2 antes de assumir que esta ativo em producao.

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

## Perguntas financeiras adversariais

Status: perguntas deterministicas implantadas em producao no commit `1efb5d3`; gate de seguranca contra extracao interna/prompt injection implantado em producao no commit `6dfca42`, coberto por testes unitarios.

Deploy confirmado em producao no commit `1efb5d3`.

Depois de uma bateria real no WhatsApp, perguntas abertas que antes caiam em fallback generico ou categoria errada agora sao roteadas para calculo deterministico:

- `quais contas vencem nos proximos 7 dias?`
- `tenho algum pagamento vencendo amanha?`
- `qual categoria consumiu mais dinheiro este mes?`
- `quantos lancamentos de saida eu tive este mes?`
- `qual cartao tem mais parcelas em aberto?`
- `considerando minha reserva ou caixinha, quanto esta realmente disponivel?`
- `me diga onde eu deveria cortar gastos com base nos meus lancamentos`
- `compare meus gastos com o mes anterior`

Tambem foi endurecido o calculo de vencimento recorrente para meses curtos: vencimento dia 31 usa o ultimo dia valido quando o mes nao tem dia 31.

Nova correcao local pendente/recente: perguntas de metas agora tambem tem rota deterministica:

- `liste minhas metas`
- `minhas metas`
- `quanto falta para eu bater minhas metas?`

Isso evita o erro observado em beta no qual metas caiam como `listagem_gastos_categoria` ou `pergunta_geral`.

O gate de seguranca bloqueia antes de IA/calculo financeiro mensagens que pedem:

- IDs internos (`sheet id`, `user id`, identificadores de planilha/tenant).
- Prompt, regras internas, schema interno ou instrucoes do sistema.
- Tokens, secrets, credenciais OAuth ou chaves.
- Dados/planilhas de outros usuarios/clientes ou `todos os usuarios`.
- Bypass de regras, modo admin/suporte/desenvolvedor ou tentativas de ignorar seguranca.
- Probing de instrucoes recebidas antes da conversa e frases de completacao do tipo `Nao posso responder...`.

Tambem sanitiza logs de mensagens para esconder tokens, parametros OAuth e IDs de documentos Google.

## Higiene do workspace

Em 2026-05-26, `git status --short` ainda mostrava arquivos nao rastreados antigos:

- `.claude/`
- `.env.bak-manual-url`
- `debug.log`
- `site-analysis/`
- `update_spreadsheet.js`
- `update_spreadsheet_v2.js`

Decisao recomendada registrada em `docs/audits/bot-complete-coverage-checklist.md`:

- `.env.bak-manual-url`: mover para cofre fora do repo ou apagar com cuidado, pois e backup sensivel.
- `debug.log`: apagar se nao houver investigacao ativa.
- `site-analysis/`: apagar ou mover para pasta de artefatos fora do repo.
- `update_spreadsheet.js` e `update_spreadsheet_v2.js`: apagar ou migrar para `scripts/` com travas antes de qualquer uso, pois podem alterar planilha real.
- `.claude/settings.local.json`: manter fora do Git se ainda for usado pela ferramenta, ou apagar se estiver obsoleto.

Nao ler nem imprimir conteudo de backups `.env*` em respostas/logs.
