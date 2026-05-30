# Checklist de Cobertura Funcional do FinancasBot

Atualizado em: 2026-05-26

Objetivo: responder objetivamente se toda funcionalidade conhecida do bot tem pelo menos um teste de funcionamento e um caminho de verificacao. Esta lista complementa `bot-capability-coverage.md` e deve ser atualizada quando uma funcionalidade nova entrar no produto.

## Criterio para "coberto"

Uma funcionalidade e considerada coberta quando existe pelo menos um dos itens abaixo:

- teste ativo no `npm test` atravessando o caminho principal;
- teste ativo de contrato/servico cobrindo a regra deterministica e o escopo de usuario;
- teste E2E configuravel documentado para dependencia externa que nao deve rodar sempre, como WhatsApp Web real ou planilha real.

Arquivos pulados por padrao nao contam como unica cobertura. Eles podem existir apenas como runbook manual/E2E opcional.

## Cobertura por area

| Area | Funcionalidade/caminho | Teste ativo ou comando | Status |
|---|---|---|---:|
| Conta | Consentimento, termos, reconsentimento, cooldown, bloqueio | `tests/userLifecycle.test.js`, `tests/onboardingState.test.js` | Coberto |
| Conta | Onboarding com nome completo, nome de uso, renda, gastos fixos, dividas e objetivo | `tests/onboardingState.test.js`, `tests/userLifecycle.test.js` | Coberto |
| Conta | Recuperacao do onboarding: voltar, reiniciar, ajuda e rejeicao de comandos como nome | `tests/onboardingState.test.js`, `tests/unit.test.js` | Coberto |
| Admin | Ajuda admin, aprovacao, negativa, status, convite, mensagem, status de usuario, reset e compartilhamento com confirmacao | `tests/unit.test.js`, `tests/userLifecycle.test.js` | Coberto |
| Admin | Auditoria sanitizada de acoes admin | `tests/unit.test.js` | Coberto |
| Google OAuth | Link OAuth, state assinado, callback, tokens criptografados, criacao/ativacao e notificacao no WhatsApp | `tests/googleOAuthService.test.js`, `tests/oauthRoutes.test.js` | Coberto |
| Planilha | Template de nova planilha, abas, formulas, exemplos, dashboard interno, cartoes/faturas/parcelamentos | `tests/userSpreadsheetService.test.js` | Coberto |
| Planilha | Mapeamento central/legado para planilha pessoal e validacao de `user_id` nas escritas | `tests/unit.test.js`, `tests/userSpreadsheetService.test.js` | Coberto |
| Registro | Gasto simples com pagamento informado | `tests/financialStateMachine.test.js` | Coberto |
| Registro | Entrada simples com recebimento informado | `tests/financialStateMachine.test.js` | Coberto |
| Registro | Pergunta de metodo quando falta pagamento/recebimento | `tests/financialStateMachine.test.js` | Coberto |
| Registro | Cartao de credito unitario com selecao, validacao de opcao e parcelas | `tests/financialStateMachine.test.js` | Coberto |
| Registro | Lote misto com pagamentos ja informados | `tests/financialStateMachine.test.js` | Coberto |
| Registro | Lote sem pagamento, pergunta unica e escrita de todos os itens | `tests/financialStateMachine.test.js` | Coberto |
| Registro | Lote no credito com selecao de cartao e parcelas por item | `tests/financialStateMachine.test.js` | Coberto |
| Audio | Audio transcrito entra no mesmo roteamento financeiro textual | `tests/financialStateMachine.test.js` | Coberto |
| Importacao | CSV/OFX, bancos com cabecalho deslocado, colunas debito/credito, Nubank cartao, preview completo | `tests/statementImportService.test.js` | Coberto |
| Importacao | Limites de tamanho/linhas, rejeicao de PDF/imagem/binario | `tests/statementImportService.test.js` | Coberto |
| Importacao | Data ausente, tipo de extrato, escolha de dono em familia, escolha de cartao | `tests/financialStateMachine.test.js` | Coberto |
| Importacao | Duplicados exatos, possiveis duplicados, duplicados entre familiares/cartoes | `tests/statementImportService.test.js` | Coberto |
| Importacao | Transferencia interna, renda recorrente/salario e sugestao de conta recorrente | `tests/statementImportService.test.js`, `tests/financialStateMachine.test.js` | Coberto |
| Categorias/regras | Regras de contas recorrentes aplicadas antes do preview | `tests/statementImportService.test.js` | Coberto |
| Metas | Criacao de meta com multi-etapas e `user_id` | `tests/financialStateMachine.test.js` | Coberto |
| Metas | Resumo e progresso de metas deterministico | `tests/unit.test.js`, `tests/readModelSqlite.test.js` | Coberto |
| Dividas | Criacao, pagamento, atualizacao de saldo e escopo | `tests/financialStateMachine.test.js`, `tests/unit.test.js` | Coberto |
| Exclusao | Cancelamento e exclusao selecionada sem afetar outro usuario | `tests/financialStateMachine.test.js`, `tests/unit.test.js` | Coberto |
| Lembretes | Criacao no Calendar com `user_id` e `whatsappId` | `tests/financialStateMachine.test.js`, `tests/unit.test.js` | Coberto |
| Agenda/jobs | Resumo matinal, noturno, proximos pagamentos, timezone Sao Paulo, check-in e relatorio mensal | `tests/schedulerJobs.test.js` | Coberto |
| Configuracoes | Ativar/desativar check-in semanal, definir/desativar reserva | `tests/financialStateMachine.test.js`, `tests/unit.test.js` | Coberto |
| Dashboard | API, HTML, headers, CSP/no-store/no-referrer, filtro mes/ano, usuarios ativos | `tests/dashboardApiContracts.test.js`, `tests/dashboardAuthSecurity.test.js` | Coberto |
| Dashboard | Token em fragmento, TTL curto, cap de TTL, auditoria sanitizada | `tests/dashboardAuthSecurity.test.js`, `tests/unit.test.js` | Coberto |
| Familia | Compartilhamento/revogacao por email, escopo financeiro, perguntas por pessoa e conjunto familiar | `tests/googleOAuthService.test.js`, `tests/unit.test.js`, `tests/userSpreadsheetService.test.js` | Coberto |
| Perguntas | Classificador local para saldos, totais, categorias, medias, rankings, comparacoes, cartoes, metas e contas | `tests/unit.test.js` | Coberto |
| Perguntas | Calculos determinsticos complexos com typo, contagem, duplicados, maior/menor e saldo | `tests/unit.test.js` | Coberto |
| Perguntas | Read-model SQLite com escopo por `user_id`, faturas, metas e dashboard | `tests/readModelSqlite.test.js` | Coberto |
| Segurança LLM | Bloqueio de prompt injection, IDs internos, tokens, dados de terceiros e bypass/admin | `tests/unit.test.js` | Coberto |
| Logs | Sanitizacao de tokens, OAuth params, URLs de planilhas, telefones e user refs | `tests/unit.test.js` | Coberto |
| Rate/quota | Rate limit por usuario, cache/in-flight de Sheets e retry de quota/transiente | `tests/rateLimiter.test.js`, `tests/unit.test.js` | Coberto |
| E2E config | Protecoes para WhatsApp real, numero admin como teste, timeout e sender mode | `tests/whatsapp-real-e2e-config.test.js`, `tests/whatsapp-web-driver.test.js` | Coberto |
| Reset/teste real | Reset de planilha bloqueado salvo ambiente/confirmacao dedicados | `tests/resetSpreadsheetSafety.test.js` | Coberto |

## Arquivos pulados e decisao

| Arquivo | Decisao | Motivo |
|---|---|---|
| `tests/integration.test.js` | Removido | Legado, pulado, mexia em Google Sheets real e foi substituido por `functional.test.js` + testes ativos. |
| `tests/functional.test.js` | Mantido fora de `npm test` | Serve como E2E opcional via `npm run test:functional`; reseta planilha e nao deve rodar sempre. |

## Arquivos soltos nao versionados

| Caminho | Decisao recomendada |
|---|---|
| `.env.bak-manual-url` | Apagar ou mover para cofre fora do repositorio; contem backup de ambiente sensivel. |
| `debug.log` | Apagar; contem apenas aviso local antigo de DNS/Chromium, sem valor para o produto. |
| `site-analysis/` | Apagar ou mover para artefatos fora do repositorio; contem screenshots/JSON de uma rodada visual antiga e ocupa cerca de 5,9 MiB. |
| `update_spreadsheet.js` e `update_spreadsheet_v2.js` | Apagar ou migrar para `scripts/` com travas; sao scripts legados com encoding quebrado, usam `.env`/`credentials.json` e podem alterar planilha real. |
| `.claude/settings.local.json` | Manter fora do Git se a ferramenta Claude ainda for usada localmente; apagar se nao for mais usado. |

## Comandos de verificacao de aceite

- `npm test`
- `npm audit --audit-level=moderate`
- `git diff --check`

Se todos passarem sem falhas, sem skips no `npm test` padrao e sem vulnerabilidades conhecidas no audit, a cobertura funcional conhecida do bot esta fechada.
