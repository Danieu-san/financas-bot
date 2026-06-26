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

## Interpretation reliability shadow

Validar:

- `npm run report:interpretation-readiness` permanece em `keep_shadow` enquanto os gates nao forem cumpridos.
- O scheduler chama o notifier diariamente as 09:15, mas fica silencioso sem condicao de alerta.
- Prontidao envia uma unica mensagem sanitizada somente aos admins.
- Prontidao exige alinhamento de auto-save >= 99,5%, zero caso ambiguo auto-gravado, zero chamada Gemini adicional, latencia p95 local <= 50 ms e evidencia completa dessas metricas.
- O alinhamento de auto-save e apenas proxy operacional; confirmar bateria offline e revisar amostra humana antes de ativar `enforce`.
- Divergencia critica envia alerta `NAO ative enforce` e so repete quando a contagem aumenta.
- No check diario operacional, divergencia critica do shadow deve aparecer como `ATENCAO`/rollout bloqueado. Ela nao deve transformar o status geral em `CRITICO` se WhatsApp, SQLite/read-model e flags estiverem saudaveis.
- Em teste com `INTERPRETATION_RELIABILITY_MODE=enforce`, gasto/entrada unitarios com campo critico LLM-only devem pedir confirmacao; mensagens deterministicas completas devem continuar diretas.
- JSON do LLM nao pode fornecer `reliabilityConfirmed`, escopo ou identidade internos.
- Frases com multiplos numeros sem marcador monetario inequivoco nao podem fazer auto-save.
- Conflito entre campo deterministico e campo LLM deve exigir esclarecimento.
- `data/interpretation-reliability-alert-state.json` nao contem telefone, `user_id`, texto financeiro, token ou ID de planilha.
- O notifier nunca altera `INTERPRETATION_RELIABILITY_MODE`.
- Repetir a mesma exclusao financeira com a mesma `operationKey` ou mesmo contexto de mensagem nao pode chamar o Google duas vezes.
- Exclusao com resultado `uncertain` deve bloquear replay automatico, nao tentar apagar novamente.
- Repetir o mesmo update financeiro com a mesma `operationKey` ou mesmo contexto de mensagem nao pode chamar o Google duas vezes.
- Update `uncertain` deve reconciliar somente se a linha atual ja tiver o valor esperado; se a linha mudou, deve bloquear replay automatico.
- Repetir a confirmacao de uma mesma importacao com outro id de mensagem nao pode salvar novamente os itens ja importados; a chave deve ser estavel por item do arquivo e preservar itens identicos legitimos quando o indice for diferente.

## Financial agent shadow

Validar:

- Para qualquer teste manual ou real usado como evidência de rollout, separar obrigatoriamente:
  - resposta visível/legada enviada no WhatsApp;
  - resultado do `FINANCIAL_AGENT_MODE=shadow` ou da exceção `FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED`;
  - decisão de rollout (`conta para answer`, `não conta`, `bloqueador`);
  - classe da divergência (`legado`, `agent/planner`, `query engine`, `read-model/escopo`, `composer`, `segurança`).
- Se o relatório não tiver a coluna do shadow/agente, o teste não pode ser usado para liberar `answer`/`enforce`, mesmo que a resposta visível pareça boa ou ruim.
- `verified=true` no log do agente prova que o verificador aprovou a ferramenta, mas não prova sozinho que a fonte/escopo estavam semanticamente corretos. Quando houver dúvida, fazer replay read-only/sanitizado da pergunta com o mesmo plano local antes de concluir.
- `npm run test:financial-agent` executa todos os casos oficiais pela rota LangGraph e termina sem gaps.
- O relatorio deve registrar `gemini_calls=0` enquanto `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=false`.
- Pedidos adversariais devem ser bloqueados antes do agente.
- Respostas e resultados de ferramentas nao podem conter IDs internos, tokens, prompts, owner hashes ou linhas cruas.
- `query_financial_plan` recebe apenas plano previamente validado; o planner Gemini nao pode construir esse plano.
- Orcamento inativo e uma resposta valida, nao erro de read-model.
- Pedidos para abrir, gerar link ou trocar UI do dashboard nao devem ser confundidos com consulta analitica.
- `FINANCIAL_AGENT_MODE=shadow` nunca muda a resposta enviada ao usuario.
- O verificador deve bloquear percentuais inventados, relacao percentual invalida, contagens sem suporte, "ultimo" fora da primeira linha ordenada e tendencias/rankings fora da ordem retornada pela ferramenta.
- `npm run test:financial-agent:novel` roda em `dry-run`, valida planos amostrais livres e deve consumir 0 chamadas Gemini.
- A bateria novel deve conter pelo menos 200 perguntas livres. Em 2026-06-16 ela cobre 255 casos e passou offline com `255/255`, `0` gaps e `0` chamadas Gemini.
- Para amostras pequenas e representativas, use `--stratified`; isso seleciona casos de recentes, SQL, dashboard, periodos relativos, clarificacao e seguranca antes de repetir capacidades.
- A bateria live do planner livre deve ser rodada somente com decisao explicita e comando com teto, por exemplo `node scripts/runFinancialAgentNovelPlannerBattery.js --live --max-calls 6 --limit 6 --stratified`. Nunca rodar live sem `--max-calls`; o hard limit do script e 40 chamadas.
- Para revalidar um gap especifico sem gastar chamadas desnecessarias, use `node scripts/runFinancialAgentNovelPlannerBattery.js --live --max-calls 1 --case NOVEL-003`.
- O prompt do planner deve receber data de referencia em `America/Sao_Paulo` para interpretar `hoje`, `ontem`, `este mes` e `do mes`; UTC pode apontar para o dia seguinte durante a noite brasileira.
- Pedidos como "explique meu disponivel sem abrir o dashboard" devem usar `explain_metric`; apenas pedidos positivos de abrir/gerar/enviar link devem ser tratados como navegacao.
- Nao ativar `answer` antes de uma bateria live curta do planner Gemini, auditoria dos gaps e revisao humana dos casos livres.

## Unified financial command planner

Validar:

- `npm run test:financial-command-planner` executa os fixtures em modo offline e
  deve terminar com `7/7`, zero gaps e `gemini_calls=0`.
- Modo live exige limite explicito, por exemplo
  `node scripts/runFinancialCommandPlannerBattery.js --live --max-calls 4 --limit 4`.
- O hard limit live e 12; nunca executar live sem `--max-calls` positivo.
- Prompt recebe somente mensagem atual, data de referencia e contrato publico;
  nunca Sheets, linhas cruas, IDs internos, tokens ou historico amplo.
- Conflito entre Gemini e extracao deterministica de operacao, valor ou
  ferramenta deve bloquear o plano.
- Datas e multiplos numeros ambiguos nao podem virar valor financeiro.
- Relatorios nao podem conter a mensagem financeira bruta.
- Ferramentas de contexto devem ter testes proprios, por exemplo
  `tests\financialCommandContextTools.test.js`, cobrindo escopo confiavel,
  saida minima e ausencia de `user_id`, notas, linhas cruas ou argumentos do
  modelo usados como escopo.
- Esta bateria nao autoriza roteamento; `FINANCIAL_COMMAND_PLANNER_MODE` deve
  permanecer ausente/desligado ate a etapa de shadow.
## Canonical Ledger

Validar:

- `node --test tests\canonicalLedgerProjector.test.js tests\canonicalLedgerParityReport.test.js tests\canonicalLedgerShadowStore.test.js tests\canonicalLedgerRolloutPolicy.test.js tests\canonicalLedgerReceiptProjector.test.js tests\canonicalLedgerCanaryRouter.test.js`.
- `node scripts\runCanonicalLedgerDryRun.js --run-id LEDGER_DRY_RUN_PHASE1_YYYYMMDD` deve gerar JSON com diferencas explicadas e `privacy_ok=true`.
- SQLite shadow deve permanecer sem escrita por padrao. Persistencia local so com opt-in explicito: `--write-shadow --shadow-db <caminho-local>`.
- O receipt adapter deve projetar apenas recibos `committed` com `operationKey`; writes sem identidade, imports e abas fora de `Saídas`/`Entradas`/`Transferências` devem ficar inelegiveis.
- Leituras canario de `transactions`, `accounts` e `transfers` devem cair para legado quando flags, dominio ou SQLite falharem.
- Backup/restore local deve continuar coberto por `tests\canonicalLedgerShadowStore.test.js` antes de qualquer proposta de dual projection.
- A projecao publica do ledger nao pode conter `user_id`, telefones, `spreadsheet`, tokens, prompts, hashes internos de linha ou linhas cruas.
- A politica de rollout deve falhar fechada: modo invalido vira `off`; escrita shadow em producao exige aprovacao separada; leitura canario exige aprovacao e allowlist de dominio.
- O rollback deve desligar projecao e leituras por flag sem apagar o banco shadow.
- A Fase 1 terminou com `NO-GO` para shadow em producao. Reavaliar somente depois do adapter de recibos verificados e da telemetria de paridade da Fase 2.

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
