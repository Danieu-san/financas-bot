# Playbook de testes do FinancasBot

Use este arquivo para escolher a bateria minima antes de afirmar que algo esta pronto.

## Regra geral

- Mudou codigo: rodar `node --check` nos arquivos alterados.
- Mudou logica financeira: rodar testes de unidade relacionados e pelo menos uma validacao funcional.
- Mudou dashboard: validar API/HTML e trocar mes/usuario.
- Mudou producao: checar PM2, logs recentes e health.

## Comandos locais

- Suite completa local, somente com testes ativos e sem E2E real destrutivo: `npm test`.
- Unidade/contratos: `npm run test:unit`.
- Funcional com reset controlado de planilha real/sandbox: `npm run test:functional`.
- E2E WhatsApp check: `npm run test:whatsapp:e2e:check`.
- Importacao WhatsApp: `npm run test:whatsapp:e2e:import`.

`tests/functional.test.js` fica fora do `npm test` por seguranca operacional: ele e um E2E opcional acionado por `scripts/runFunctionalTest.js`, que habilita `RUN_FUNCTIONAL_TESTS=true` e passa pelas travas de reset.

## Onboarding

Validar:

- Novo usuario recebe termos.
- `ACEITO` muda para `PENDING_APPROVAL`.
- Admin aprova.
- Usuario recebe OAuth.
- Apos OAuth, planilha e criada no Drive do usuario.
- Mensagem final tem link da planilha e link do manual.

Evitar repetir se o usuario informou que ja testou fluxo recentemente, a menos que a mudanca toque onboarding/OAuth.

## Importacao de extratos

Validar:

- CSV/OFX e aceito.
- PDF/imagem permanecem fora do MVP.
- Preview nao abrevia lancamentos importantes.
- Conta corrente, cartao, transferencias internas, reserva/caixinha e rendimentos sao classificados corretamente.
- Duplicados sao detectados e nao salvos.
- Em familia, o bot pergunta de quem e o extrato e grava na planilha correta com `user_id` correto.
- Regras ativas da aba `Contas` classificam descricoes obscuras antes da classificacao generica.
- Ao detectar saida recorrente, aceitar cadastro deve perguntar como chamar/classificar a conta.
- Apos confirmar, conferir planilha e pergunta analitica sobre os dados importados.

Arquivos locais de extratos usados em testes podem estar em `C:\Users\horus\Downloads\extratos`.

## Perguntas financeiras

Testar perguntas que exigem dados e calculos:

- saldo do mes;
- total por categoria;
- detalhamento de gastos do mes;
- detalhamento de cartao/fatura;
- ranking de estabelecimentos/lojas;
- contagem de ocorrencias com grafia imperfeita;
- soma de multiplas categorias;
- percentual de categoria no gasto total;
- comparacao entre categorias;
- maior/menor gasto por categoria;
- cartoes, faturas e parcelamentos;
- perguntas por responsavel em familia.

Nao basta ensinar respostas fixas; validar se a rota de calculo usa dados reais/read model.

Para a migracao Query Engine, validar tambem que novas perguntas sejam cobertas por combinacao de:

- dominio: gastos, entradas, cartoes, transferencias, orcamento, metas, dividas, contas, importacoes, dashboard;
- operacao: somar, contar, listar, detalhar, agrupar, ranquear, comparar, explicar, detectar, projetar;
- filtros: periodo, pessoa/familia, categoria, estabelecimento, forma de pagamento, cartao, status e origem;
- base temporal: data da compra, mes da fatura, vencimento ou ciclo de orcamento.

Regra de seguranca: quando houver planner LLM, o plano deve passar por `FinancialQueryPlan`; campos como `sheetId`, `user_id`, `token`, `rawRows`, `allUsers` ou `admin` devem ser rejeitados.

Perguntas livres que devem continuar cobertas:

- `detalhe os gastos pra mim`;
- `me explica de onde veio esse total de gastos`;
- `foram gastos como no cartão?`;
- `foram em quais estabelecimentos?`;
- `os 328 e 81 foram gastos em quais estabelecimentos?`.
- follow-ups apos uma pergunta financeira, herdando periodo/escopo seguro: `e no cartão?`, `foram em quais estabelecimentos?`, `e por categoria?`, `detalha esse total`.
- o contexto de follow-up nao pode guardar ou devolver `spreadsheetId`, `user_id`, `sheet id`, token, prompt interno nem linhas cruas da planilha.

## Metas

Validar:

- Criacao de meta pessoal e, quando houver vinculo familiar, pergunta de escopo pessoal/familiar.
- Aportes: `guardei 500 na meta reserva`.
- Retiradas/subtracoes: `retirei 200 da meta reserva`.
- Ajuste seguro: `ajustar meta reserva para 1500`.
- Status: `pausar meta reserva`, `retomar meta reserva`, `cancelar meta reserva`, `concluir meta reserva`.
- Aba `Movimentações Metas` registra historico com valor antes/depois, responsavel e dono da meta.
- Membro da familia pode movimentar meta familiar gravada na planilha dona, preservando `user_id` do responsavel.
- Perguntas `liste minhas metas` e `quanto falta para bater minhas metas?` ignoram metas pausadas/canceladas no progresso ativo.

## Dashboard

Validar:

- `/dashboard/health`.
- `/dashboard/api/summary?month=<m>&year=<y>` muda entre meses.
- Filtro de usuario nao mostra inativos.
- Admin nao deve depender de `Todos os usuarios` para uso normal.
- KPIs de `Saldo` e `Disponivel estimado` aparecem quando houver reserva/caixinha.
- Graficos renderizam.
- Orcamento mensal livre mostra grafico diario e do ciclo, respeita o dia de inicio configurado (1 a 31), muda corretamente entre escopo pessoal/familiar e nao conta recorrentes, transferencias, dividas ou reserva como gasto livre.

## Admin e manutencao

Validar:

- `admin status bot` ou `admin health` responde resumo operacional sem credenciais, IDs internos, variaveis de ambiente ou dados financeiros individuais.
- `admin reiniciar bot` exige `confirmar admin` e so agenda reinicio do processo; nao deve aceitar comando livre de terminal.
- Apos deploy de manutencao, conferir PM2, `/dashboard/health` e logs ate `Bot pronto para receber mensagens`.

## Scheduler e Calendar

Validar:

- Resumo matinal mostra agenda de hoje e financeiro proximos 7 dias.
- Resumo noturno mostra agenda/pagamentos de amanha.
- `Contas` e `Dívidas` sao lidas.
- Timezone America/Sao_Paulo esta correto.
- Eventos do Google Calendar aparecem com horario correto.
- Para validacao real controlada, usar `scripts/runCalendarSchedulerValidation.js <usuario_exato> <TESTE_APAGAR_marcador>`.
- A limpeza real deve usar apenas `deleteTestCalendarEventsByExactSummary`: titulo exato, usuario exato, origem `whatsapp` e prefixo `TESTE_APAGAR_`.
- Confirmar que a segunda limpeza retorna zero. Nunca apagar evento por substring, descricao generica ou busca fuzzy.

## Familia

Validar:

- Dono e membro ativos.
- Compartilhamento da planilha no Drive.
- Lancamento do membro entra na planilha do dono com `user_id` do membro.
- Perguntas por pessoa funcionam.
- Dashboard respeita escopo.
- Ao final de testes, desfazer vinculo se era apenas teste.

## Antes de beta/producao

Consultar:

- `docs/runbooks/release-checklist.md`.
- `docs/decisions/ADR-002-admin-financial-data-access.md`.
- `docs/security/threat-model.md`.

Validar:

- Sem segredos em git/logs/respostas.
- `ADMIN_IDS` somente Daniel no beta atual.
- Backup antes de limpar usuarios/dados reais.
- PM2 online e WhatsApp pronto apos deploy.
