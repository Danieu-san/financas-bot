# Estado atual do FinancasBot

Atualizado em: 2026-06-07

## Produto

- Bot de WhatsApp para controle financeiro pessoal e familiar.
- Stack: Node.js, whatsapp-web.js/Puppeteer, Gemini 2.5 Flash, Google Sheets, Google Calendar, SQLite read model e dashboard web.
- Producao atual em EC2 com dominio `https://financasbot.duckdns.org`.
- Multiusuario existe, mas ainda exige cuidado juridico/privacidade antes de beta amplo.

## Estado de producao conhecido

- Ultimo deploy validado: commit local/GitHub `1ba4932` (`feat: add trackable goal movements`). Em producao, o mesmo patch foi aplicado por `git am` como `b38f7e1`.
- Health check em producao respondeu `{"ok":true,"sqlite":true}` e PM2 confirmou `Bot pronto para receber mensagens`.
- Dashboard passou a mostrar `Saldo` economico e `Disponivel estimado` apos caixinha/reserva.
- O bot estava online no PM2 e WhatsApp chegou em `Bot pronto para receber mensagens` apos o deploy.
- Health check esperado: `/dashboard/health` retornando `ok`.

Sempre revalidar EC2/PM2/logs antes de afirmar que producao esta saudavel.

## Validacao completa e benchmark Gemini - 2026-06-12

- A bateria offline da Financial Query Engine executou `265/265` casos sem divergencias; `23` casos adversariais foram bloqueados intencionalmente antes do planner.
- E2E real de importacao via WhatsApp do Daniel validou cancelar, confirmar, arquivo complexo sem abreviacao, duplicidade e limpeza seletiva dos marcadores.
- O smoke analitico real passou a exigir um mes populado. Ele encontrou e corrigiu uma inconsistencia em que o total mensal incluia cartoes, mas o subtotal `Cartões` era exibido como zero; a Query Engine agora devolve subtotais por fonte tambem em operacoes de soma.
- O benchmark sintetico comparou `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite` e `gemini-3.5-flash` sem usar dados reais. Na triagem, `gemini-3.1-flash-lite` teve a melhor precisao de campos; nenhuma troca de modelo foi feita.
- A etapa final do benchmark esta bloqueada por `429` com mensagem de limite mensal de gastos do projeto. O runner interrompe com seguranca apos tres erros consecutivos desse tipo.
- Consultas deterministicas da Query Engine continuam funcionando sem Gemini. Fluxos que dependem do Gemini permanecem degradados ate o limite mensal ser elevado ou renovado.

## Convites de pre-onboarding

Correcao implantada em 2026-06-03:

- `admin convidar <telefone>` e `admin mensagem <telefone> <texto>` agora usam fallback para o singleton global do WhatsApp quando `msg.client` nao esta anexado ao objeto da mensagem; respostas admin tambem usam fallback quando `msg.reply` nao existe.
- Isso corrige o caso real em que `confirmar admin` era recebido, mas o convite nao era disparado, com log `convidar_cliente_indisponivel`.
- Testes de regressao: `messageHandler admin invite uses fallback sender when message client is missing` e `messageHandler admin confirmation replies through fallback when reply is missing`.
- GitHub/local: `26f22e9` e `90b3ab7`.
- EC2 via `git am`: os mesmos patches foram aplicados em producao.
- `npm test` passou com 219 testes em 2026-06-02/03 antes do deploy final.
- Validacao de producao: `/dashboard/health` retornou `{"ok":true,"sqlite":true}`, PM2 ficou `online` e WhatsApp confirmou `Bot pronto para receber mensagens`.
- O `error.log` nao teve novas escritas apos `2026-06-03 00:08:11 UTC`; os erros `convidar_cliente_indisponivel` e `msg.reply is not a function` vistos no tail eram historico anterior ao deploy final.

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
- Comandos de manutencao admin seguros foram adicionados em 2026-06-03: `admin status bot`/`admin health` retorna resumo operacional sanitizado sem segredos/dados financeiros individuais, e `admin reiniciar bot` exige `confirmar admin` antes de agendar `process.exit(0)` para o PM2 reiniciar o processo. Nao existe comando de shell livre pelo WhatsApp.
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
- Metas passaram a funcionar como cofrinho rastreavel em 2026-06-03. Comandos suportados: `guardei 500 na meta reserva`, `retirei 200 da meta reserva`, `ajustar meta reserva para 1500`, `pausar meta reserva`, `retomar meta reserva`, `cancelar meta reserva` e `concluir meta reserva`. A aba nova `Movimentações Metas` audita valor antes/depois, responsavel e dono da meta.
- Metas familiares usam a planilha principal do grupo e preservam `user_id` de quem movimentou. Na criacao de meta, se houver familia ativa, o bot pergunta se a meta e pessoal ou familiar. Perguntas e dashboard carregam status, escopo e ultima movimentacao; metas pausadas/canceladas nao entram como progresso ativo.
- Validacao local do sistema de metas em 2026-06-03: `npm test` passou com 224 testes e `npm audit --audit-level=moderate` retornou 0 vulnerabilidades.
- Deploy em producao do sistema de metas em 2026-06-03: GitHub/local `1ba4932`; EC2 aplicado via patch como `b38f7e1` porque o repo privado bloqueou `git pull` HTTPS no servidor. Validacao: `/dashboard/health` publico retornou `{"ok":true,"sqlite":true}`, PM2 `financas-bot` online, logs mostraram `WhatsApp pronto` e `Bot pronto para receber mensagens`.
- Planilha do usuario teve correcoes em 2026-05-31: `Faturas` e `Parcelamentos` agora sao tratadas como abas da planilha pessoal, lancamentos de cartao passam a gravar valor numerico (nao texto) e as formulas `QUERY` dos resumos usam `headers=0` para nao ignorar a primeira compra real.
- Planilha real do Daniel foi copiada antes da limpeza (`Backup FinancasBot Daniel antes limpeza 2026-05-31 0249`) e depois teve linhas financeiras anteriores a 29/05/2026 removidas de `Entradas`, `Saídas`, `Transferências` e `Lançamentos Cartão`. Configuracoes, contas, metas, dividas, manual, dashboard e formulas foram preservados.
- Correcao em 2026-05-31: quando o usuario cita um cartao cadastrado pelo nome (ex.: `cartao nubank thais`) sem dizer `debito`, o bot trata como cartao de credito mesmo se a IA classificar equivocadamente como `Débito`; `à vista` vira parcela `1/1`. Se o usuario disser explicitamente `debito`, o fluxo de debito e preservado.
- Dado real corrigido em 2026-05-31: `restaurante malz` de R$125,25 foi movido de `Saídas/Débito` para `Lançamentos Cartão/Cartão Nubank - Thais`, apos backup `Backup FinancasBot Daniel antes mover restaurante malz 2026-05-31 1249`.
- Correcao local em 2026-05-31: lancamentos manuais como `guardei ... na caixinha` agora entram em `Transferências` como reserva/investimento, nao em `Entradas`; transferencias manuais para membro do escopo familiar entram em `Transferências`, nao em `Saídas`; valores manuais usam `parseValue` para preservar centavos com virgula. Cobertura adicionada em `tests/financialStateMachine.test.js`; `npm test` passou com 214 testes.
- Correcao local em 2026-05-31: formulas da aba `Dashboard` da planilha pessoal passaram a somar linhas com `user_id` preenchido, em vez de depender de uma linha inicial fixa. Isso evita zerar totais quando o usuario apaga a linha de exemplo. `Faturas` e `Parcelamentos` tambem passam a consultar `Lançamentos Cartão!A2:J` filtrando `J is not null`, para ignorar exemplos sem perder a primeira linha real.
- Correcao local em 2026-05-31: orçamento mensal livre passou a contar lançamentos de cartão pela competência/vencimento da parcela/fatura, usando `Lançamentos Cartão` + `Cartões`, e nao pela data da compra. Assim uma compra parcelada impacta o ciclo apenas pela parcela que vence nele. O dashboard tambem mudou o rótulo de `Orçamento do ciclo` para `Gasto livre no ciclo` e mostra a data explicita em `Hoje`.
- Correcao implantada em 2026-05-31: o dashboard web mensal passou a mostrar consumo de cartao pela data da compra, para que categorias de `Lançamentos Cartão` apareçam no mês em que o gasto aconteceu. Isso nao altera a regra do orçamento mensal livre, que continua usando competência/vencimento da fatura. O gráfico financeiro tambem foi ajustado para nao cortar a quinta barra (`Disponível`).
- Dado real corrigido em 2026-05-31: o lançamento `restaurante malz` de R$125,25 do Daniel em `Lançamentos Cartão` foi ajustado de `31/05/2026` para `30/05/2026 22:00`, apos backup `Backup FinancasBot Daniel antes ajustar data restaurante malz 2026-05-31T14-16-28-865Z`.
- Manuais externos em `C:\Users\horus\Documents\FinancasBot\manuals` foram regenerados em 2026-05-31 com backup dos PDFs anteriores. O manual do usuário usa a capa aprovada `ChatGPT Image 29 de mai. de 2026, 19_42_25.png`; ambos incluem a regra nova de parcelamentos no orçamento.

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
- O scheduler le `Contas!A:I` e resolve os campos por cabecalho, preservando compatibilidade com layouts atuais e legados sem depender de posicoes fixas.

## Dashboard - lançamentos recentes

Status: implementado e validado em producao em 2026-05-31.

Deploy:

- GitHub/local: `0c82a54`.
- EC2 via `git am`: `83346c1`.
- Health confirmado: `/dashboard/health` retornou `{"ok":true,"sqlite":true}`.
- WhatsApp confirmou `Bot pronto para receber mensagens` apos restart automatico do PM2.

Comportamento esperado:

- Datas serializadas do Google Sheets, como `46173`, devem ser exibidas em formato brasileiro (`31/05/2026`) no dashboard.
- A lista `Lançamentos Recentes` deve sinalizar o tipo do item: `Entrada`, `Saída` ou `Cartão`.
- Compras parceladas no cartão devem aparecer agrupadas como uma compra só, com o valor total exibido e sufixo como `(3x no cartão)`.
- O agrupamento dos parcelamentos e somente visual no dashboard recente; nao altera os lancamentos reais nem as abas de faturas/parcelamentos.

Teste de regressao:

- `userSheetAnalytics recent transactions format serial dates, label types and group installments`.

## UserSettings e orçamento mensal

Status: implementado e validado em producao em 2026-05-31.

Deploy:

- GitHub/local: `88caf5c`.
- EC2 via `git am`: `f33ed71`.
- Health confirmado: `/dashboard/health` retornou `{"ok":true,"sqlite":true}`.
- WhatsApp confirmou `Bot pronto para receber mensagens`.

Causa raiz do erro `UserSettings!A2:M2 ... tried writing to column [N]`:

- `UserSettings` foi expandida para 19 colunas (`A:S`) com orçamento mensal, escopo familiar e dia inicial do ciclo.
- Um processo/codigo antigo ainda tentou atualizar somente `A:M`, mas enviou dados além da coluna M.

Mitigacao:

- `userService` agora deriva o range de leitura/escrita a partir de `SETTINGS_HEADERS`.
- Novas linhas default de `UserSettings` ja sao criadas com o schema completo.
- Teste de regressao: `userService UserSettings range follows the full settings schema`.

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

Complemento de seguranca da Financial Query:

- Checklist de seguranca LLM/dados criado em `docs/security/financial-query-security-checklist.md` e auditoria documental aplicada em `docs/audits/financial-query-security-audit.md`.
- A bateria de aceite usa `security/block/clarify` apenas como resultado pre-plano de Security Gate, roteamento ou esclarecimento. Esses valores nao sao operacoes executaveis do `FinancialQueryPlan`.

## Modo analista para detalhamento de gastos

Status: implantado em producao em 2026-06-04.

Motivacao:

- Uma usuaria perguntou detalhes sobre gastos e estabelecimentos; o bot classificou perguntas como `detalhe os gastos pra mim`, `foram gastos como no cartão?` e `foram em quais estabelecimentos?` como totais genericos ou `pergunta_geral`.
- O dashboard nao substitui esse caso: o usuario queria explicar a composicao de um valor diretamente no WhatsApp.

Comportamento novo:

- Novas intents deterministicas: `detalhamento_gastos_mes`, `detalhamento_cartao_mes` e `ranking_estabelecimentos_gastos`.
- O roteamento local reconhece pedidos como `detalhe os gastos`, `explique esse total`, `foram gastos como no cartão?`, `em quais estabelecimentos?` e variacoes de fala/transcricao como `os 328 e 81 foram gastos em quais estabelecimentos?`.
- A resposta local mostra total, quebra por categoria, principais estabelecimentos e lancamentos que compoem o valor.
- Para cartoes, o criterio e `Mês de Cobrança`/fatura, coerente com as perguntas de fatura. A resposta avisa que cartoes entram pela competencia da fatura.
- SQLite/read-model e fallback em memoria tambem sabem responder essas intents, reduzindo dependencia de leituras diretas do Google Sheets.

Decisao arquitetural:

- Nao enviar planilha inteira ao LLM.
- A IA pode ajudar a entender a pergunta, mas os calculos e agrupamentos devem ser feitos por codigo deterministico.
- Documento de ideia/contrato salvo em `docs/ideas/financial-query-engine.md`.
- Em 2026-06-04, o documento foi ampliado para cobrir o universo de perguntas financeiras por dominios, operacoes, filtros, escopo familiar e base temporal.
- Nova base local: `src/query/financialQueryPlan.js` valida planos `FinancialQueryPlan`, bloqueia campos sensiveis/internos vindos de planner LLM e mapeia todos os intents analiticos legados atuais para um contrato composicional.
- Nova base local: `src/query/financialQueryEngine.js` executa a engine generica para `expenses`, `cards`, `income`, `transfers`, `goals`, `debts`, `bills`, `budget` e `dashboard`, com operacoes de soma, contagem, lista, detalhe, agrupamento, ranking, media, percentual, extremos, comparacao, forecast, busca, trend/recommend inicial e deteccao inicial.
- `calculationOrchestrator` ja usa a Query Engine por baixo para `detalhamento_gastos_mes`, `detalhamento_cartao_mes` e `ranking_estabelecimentos_gastos`, preservando o formato legado de resposta para nao quebrar o WhatsApp.
- `messageHandler` agora guarda contexto analitico curto por remetente (TTL 5 minutos) apos uma pergunta financeira bem sucedida. O contexto preserva apenas intent e parametros seguros (`mes`, `ano`, `categoria`, `categorias`, `cartao`, `origem`), sem linhas da planilha, `user_id`, sheet id, token ou dados crus.
- Follow-ups como `e no cartão?`, `foram em quais estabelecimentos?`, `e por categoria?` e `detalha esse total` herdam periodo/cartao/categoria da pergunta anterior quando nao houver periodo explicito. Em follow-up, mes/ano so sao substituidos se o usuario mencionar explicitamente outro periodo.

Testes:

- `node --test tests/unit.test.js` passou com 86 testes.
- `node --test tests/readModelSqlite.test.js` passou com 4 testes.
- `npm test` passou com 241 testes em 2026-06-04.

Deploy:

- GitHub/local: `9c59e88` (`feat: add financial query engine`).
- EC2 via `git am`: `ea0e943`, porque o repo privado bloqueia `git pull` HTTPS sem credencial interativa.
- Validacao em producao: `npm install` retornou 0 vulnerabilidades, `/dashboard/health` retornou `{"ok":true,"sqlite":true}`, PM2 ficou `online`, logs mostraram `WhatsApp pronto` e `Bot pronto para receber mensagens`.

Correcao local em 2026-06-04 apos teste real no WhatsApp:

- Sintoma: `quanto gastei esse mês?` respondia R$328,81, mas follow-ups como `detalhe os gastos pra mim`, `foram em quais estabelecimentos?` e `e por categoria?` caiam para R$55,85 porque alguns caminhos usavam data da compra enquanto outros usavam mes da fatura.
- Ajuste: intents analiticas legadas de gastos passam a usar `timeBasis: billing_month` de forma consistente quando incluem cartoes; follow-ups com `origem=cartao` usam dominio `cards`.
- `ranking_categorias_gastos` tambem passou pela Query Engine antes do fallback legado para nao misturar criterios.
- `me explica de onde veio esse total` agora e reconhecido como pergunta analitica rapida, evitando fallback generico.
- Teste de regressao adicionado em `tests/unit.test.js` cobrindo compras feitas em maio com fatura de junho, ranking por estabelecimento no cartao e explicacao de total.

Nova correcao local em 2026-06-04 apos "bloco 2" real no WhatsApp:

- Sintoma: `qual foi meu maior gasto esse mês?` respondia `maio/2026`, porque o parser de mes encontrava `maio` dentro da palavra `maior`.
- Sintoma: `quanto alimentação representa do total de gastos?` usava R$23,46/R$55,85 em vez de R$206,19/R$328,81, pois `percentual_categoria_gastos` ainda passava pelo calculo legado por data da compra.
- Ajuste: parser de mes agora compara tokens limpos, nao substring; `percentual_categoria_gastos`, `maior_menor_gasto` e `maior_menor_gasto_categoria` usam a Query Engine com `billing_month`; `contagem_ocorrencias` usa linhas detalhadas com fatura para cartoes e mantem fuzzy matching para typos como `onibis`.
- Teste de regressao: `calculationOrchestrator block 2 analytics keep card billing-month totals consistent`.

Complemento local em 2026-06-04:

- Sintoma UX: `me explica de onde veio esse total` era classificado como detalhe, mas a resposta parecia uma listagem generica (`Detalhamento dos gastos...`) em vez de responder diretamente a pergunta do usuario.
- Ajuste: `buildLocalPerguntaResponse` detecta perguntas de explicacao/composicao do total e abre a resposta com `Esse total ... vem de:` e `Total explicado`, mantendo categorias, estabelecimentos e lancamentos.
- Teste de regressao atualizado em `messageHandler local replies cover richer spreadsheet calculations`.

Novo complemento local em 2026-06-04:

- A familia semantica de cartoes/faturas/parcelamentos foi ampliada sem depender de frases exatas.
- Perguntas como `quais compras compõem a fatura deste mês?`, `me mostra os itens da fatura`, `quais lançamentos estão na fatura desse mês?`, `qual cartão tem mais valor em aberto?` e `quais parcelas ainda tenho para pagar?` agora roteiam para respostas deterministicas de composicao de fatura, ranking de cartoes em aberto ou resumo de parcelamentos.
- Respostas de composicao de fatura abrem com `Compras que compõem a fatura...`, evitando UX ambigua de detalhe generico.
- Itens vindos de `Lançamentos Cartão` sao sinalizados como `Cartão - <nome>` mesmo quando o payload nao traz `tipo=cartao`, desde que contenha origem/pagamento/cartao compativel.
- Testes adicionados em `messageHandler.classifyPerguntaLocally covers complex analytical questions`, `messageHandler local replies cover richer spreadsheet calculations` e `calculationOrchestrator calculates card invoices and open installments deterministically`.

Arquitetura alvo oficial:

- Em 2026-06-05, a arquitetura alvo das perguntas financeiras foi formalizada em `docs/specs/financial-query-architecture.md`.
- Decisao central: perguntas financeiras sao consultas analiticas read-only; devem virar `FinancialQueryPlan`, ser calculadas pela Query Engine e formatadas pelo Response Composer.
- Gemini pode interpretar linguagem natural ou melhorar redacao, mas nao pode calcular saldo, total, percentual, ranking, parcelas, orcamento, metas ou dividas.
- Query Engine fica separada da Command Engine: registrar gasto, importar extrato, criar/apagar itens, admin, OAuth e manutencao continuam fora da Query Engine.
- A matriz de cobertura das perguntas financeiras foi criada em `docs/specs/financial-query-coverage-matrix.md`, organizando dominios, operacoes, filtros, bases temporais, fallback e aceite por dominio.
- O contrato oficial do `FinancialQueryPlan` foi criado em `docs/specs/financial-query-plan-contract.md`. Formato canonico: `period` e `scope` ficam dentro de `filters`; `period.month` e zero-based (`0` janeiro, `5` junho, `11` dezembro); campos internos/sensiveis como `user_id`, `sheet_id`, tokens, prompts e linhas cruas devem ser bloqueados antes da execucao.
- O mapa do legado das perguntas financeiras foi criado em `docs/audits/financial-query-legacy-map.md`, classificando rotas atuais como Query Engine, adaptadores legados, SQLite/read-model, fallback em memoria, fallback Sheets, Gemini e riscos conhecidos.
- O roadmap oficial de migracao por dominio foi criado em `docs/specs/financial-query-migration-roadmap.md`. A ordem fixada e: gastos; cartoes/faturas/parcelamentos; entradas; transferencias/caixinha/reserva; orcamento; metas; dividas; contas/vencimentos; familia/escopo; dashboard/resumos. Implementacoes futuras devem seguir esse roteiro e so marcar um dominio como pronto quando ele virar `query_engine_primary`.
- Os pacotes de implementacao para capacidade alta foram criados em `docs/specs/implementation-packets/`. Cada pacote fixa objetivo, arquivos provaveis, limites, aceite, testes, perguntas reais, riscos e criterio de pronto para migrar um dominio sem voltar a remendar frases isoladas.
- A bateria oficial de aceitacao da Financial Query Engine foi criada em `docs/qa/financial-query-acceptance-battery.md`. Ela registra 265 casos porque os minimos por bloco somam 265, cobrindo dominios financeiros, familia, dashboard, adversariais, typos e follow-ups.

Inicio local do Packet 01 - Expenses em 2026-06-05:

- Perguntas locais de gastos agora carregam um `FinancialQueryPlan` validado antes da consulta de dados; `calculationOrchestrator` fica como adaptador temporario de formato para gastos.
- A Query Engine calcula soma, detalhe, ranking por categoria/estabelecimento, percentual, media, maior/menor e trend/evolucao mensal para gastos gerais, incluindo cartoes por `billing_month` quando a pergunta e mensal geral.
- Perguntas de hoje/ontem/ultimos dias e metodos como Pix/dinheiro/debito usam `transaction_date`.
- Respostas de gastos com cartao por `billing_month` agora avisam que cartoes entram pelo mes de cobranca/fatura, nao necessariamente pela data da compra. Isso cobre total mensal, detalhamento, ranking, percentual e evolucao.
- SQLite/read-model segue como fonte preferida quando disponivel e alimenta a Query Engine em caminhos cobertos. Decisao do Packet 01: usuarios em planilha pessoal ainda podem cair no fallback escopado de Google Sheets quando SQLite/read-model nao cobre ou nao esta sincronizado; esse caminho fica documentado como lacuna aceita, medido por `analysis_source=personal_sheet`/`analysis_source=sheets_fallback`, sem enviar dados crus ao Gemini, sem mudar schema e preservando escopo pessoal/familiar.
- Lacunas explicitas do pacote: `gastos_valores_duplicados` e `contagem_lancamentos_saida` permanecem fora do caminho primario porque nao representam consumo geral com cartoes inclusos.
- Validacao local apos revisao do Packet 01: `node --check` passou nos JS alterados; `node --test tests/unit.test.js tests/readModelSqlite.test.js` passou com 100 testes; `npm test` passou com 251 testes.

Inicio local do Packet 02 - Cards, Invoices and Installments em 2026-06-05:

- Perguntas analiticas de cartao/fatura/parcelamento agora entram como `FinancialQueryPlan` com dominio `cards` e passam pelo `query_engine_primary` antes de qualquer fallback.
- Cobertura implementada: total de fatura, faturas por cartao, composicao/itens da fatura, ranking por cartao em aberto, parcelas/parcelamentos ativos, previsao por meses futuros, maior/menor compra parcelada e saldo restante por estabelecimento.
- A Query Engine calcula valores finais, rankings, extremos, previsoes e agrupamentos; `calculationOrchestrator` segue apenas como adaptador temporario para formatos legados de resposta.
- Respostas de cartao declaram a base temporal: fatura/cartao por mes de cobranca/fatura; compras feitas hoje/ontem/data explicita por data da compra.
- SQLite/read-model recebeu metadados derivados de cartao (`card_id`, `card_name`, `installment_text`) para alimentar a Query Engine tambem em parcelamentos sem mudar schema da planilha real.
- Correcao local apos auditoria do Packet 02: a fonte SQLite da Query Engine nao usa mais `LIMIT 1000` antes do calculo. O read-model aplica filtros SQL de escopo, dominio e periodo antes de devolver linhas para a engine, evitando total incompleto silencioso em historicos grandes.
- Semantica ajustada para compra parcelada: quando a pergunta e sobre a compra original maior/menor, o total planejado usa o maior valor entre a soma das parcelas no escopo e `valor da parcela * total de parcelas`; o saldo/restante continua usando apenas parcelas em aberto/no escopo consultado.
- Fallback Sheets continua existindo como rota escopada quando SQLite/read-model nao esta sincronizado ou nao cobre o contexto, mas nao e rota principal e nao envia dados crus ao Gemini.

Inicio local do Packet 03 - Income/Entradas em 2026-06-05:

- Perguntas analiticas de entradas/recebimentos/renda agora entram como `FinancialQueryPlan` com dominio `income` e `timeBasis=transaction_date`, usando a Query Engine como rota primaria.
- Cobertura implementada: total recebido, total por categoria/fonte, salario, renda extra, listagem/detalhe, ranking de fontes e formas de recebimento, maior/menor entrada, contagem, media, percentual, comparacao com mes anterior e evolucao mensal.
- Entradas usam criterio temporal explicito de data de recebimento registrada; respostas locais incluem `Critério: data de recebimento registrada.` quando relevante.
- SQLite/read-model passou a alimentar a Query Engine para entradas com filtros SQL de escopo e periodo antes do calculo, incluindo `Recebimento` e `Recorrente` como metadados derivados, sem alterar schema de planilha real.
- Perguntas ambiguas entre entrada, transferencia, caixinha/reserva ou fatura nao sao roteadas como `income` pelo planner local; quando chegam como pergunta, recebem esclarecimento antes de Gemini/calculo.
- Escritas manuais como `recebi ... da caixinha/reserva` sao tratadas como `Transferências` (resgate de reserva), nao como `Entradas`, para nao inflar renda/dashboard.

Inicio local do Packet 04 - Transferencias/Caixinha/Reserva em 2026-06-05:

- Perguntas analiticas de transferencias, caixinha/reserva e pagamento de fatura agora entram como `FinancialQueryPlan` com dominio `transfers` e `timeBasis=transaction_date`, usando a Query Engine como rota primaria.
- Cobertura implementada: total de transferencias, listagem, reserva aplicada, reserva resgatada, reserva liquida, transferencias entre contas proprias, transferencias para membro familiar autorizado, pagamento de fatura e disponivel estimado.
- A Query Engine classifica transferencias em categorias canonicas (`reserve_applied`, `reserve_redeemed`, `invoice_payment`, `own_transfer`, `family_transfer`) e calcula disponivel estimado como saldo economico ajustado pela reserva liquida.
- SQLite/read-model passou a sincronizar `Transferências` e alimentar a Query Engine com filtros SQL de escopo e periodo antes do calculo, sem mudar schema da planilha real.
- Respostas locais explicam que transferencia interna, pagamento de fatura e caixinha/reserva nao sao gasto real nem renda nova; tambem declaram `Critério: data da transferência registrada.`
- Correcao apos auditoria do Packet 04: escopo explicito pessoal em perguntas de transferencia (`transferi`, `mandei`, `enviei`, `paguei`) agora limita a consulta ao usuario atual; frases como `transferencia para Thais` preservam o escopo familiar/autorizado e usam `Thais` como destino/filtro de membro, nao como troca automatica de `user_id`.
- Fallback Sheets continua existindo apenas como compatibilidade escopada quando SQLite/read-model nao cobre ou nao esta sincronizado; ele nao envia dados crus ao Gemini.

Inicio local do Packet 05 - Budget/Orcamento em 2026-06-06:

- Perguntas analiticas de orcamento mensal livre agora entram como `FinancialQueryPlan` com dominio `budget` e `timeBasis=budget_cycle`, usando a Query Engine como rota primaria.
- Cobertura implementada: quanto posso gastar hoje, quanto ja usei do orcamento, ritmo diario, restante ate o fim do ciclo, escopo pessoal/familiar e explicacao auditavel do calculo.
- A Query Engine calcula ciclo configurado, gasto livre do ciclo, gasto de hoje, ritmo diario recomendado, restante no ciclo, dias restantes, totais por saidas/cartoes e criterios; Response Composer/local reply apenas formata.
- A semantica do dashboard foi preservada: orcamento nao usa mes calendario quando ha dia inicial configurado; ciclos podem cruzar meses; dias 1/28/30/31 usam o helper existente de ciclo; cartoes impactam o orcamento por vencimento/competencia da parcela, nao por data da compra.
- SQLite/read-model passou a sincronizar configuracao publica de orcamento (`UserSettings`) e cadastro de cartoes (`Cartões`) para alimentar a Query Engine com escopo e periodo filtrados antes do calculo, sem mudar schema da planilha real.
- Escopo familiar continua resolvido fora do LLM; resultados de agrupamento por membro usam rotulos publicos (`Membro 1`, etc.) e nao expõem `user_id`.
- Correcao apos auditoria do Packet 05: configuracao de orcamento agora e selecionada pelo escopo pedido. Consulta pessoal nao reutiliza silenciosamente orcamento familiar; consulta familiar usa a configuracao familiar mesmo quando o membro possui orcamento pessoal antigo; sem escopo explicito, vinculo familiar com orcamento familiar ativo prioriza o familiar, em paridade com o dashboard.
- Definir, alterar e desativar orcamento continuam na Command Engine; alertas existentes seguem fora da Query Engine. Fallback Sheets permanece apenas como compatibilidade escopada quando SQLite/read-model nao cobre/sincroniza.
- Auditoria de recuperacao concluida em 2026-06-06: a cobertura equivalente dos Packets 01-04 foi reconstruida por capacidade em `tests/unit.test.js`, cobrindo planner, Query Engine, Response Composer, bases temporais, follow-ups seguros, escopo pessoal/familiar e seguranca. A auditoria encontrou e corrigiu regressões funcionais causadas pela recuperacao: tendencia mensal agrupando linhas/dias em vez de meses, maior/menor compra parcelada comparando parcelas isoladas e reserva liquida somando aplicacao com resgate em vez de subtrair. Uma revisao adversarial posterior tambem corrigiu tendencias por `transaction_date` que ainda agrupavam cartoes pelo mes da fatura, limite de tendencia que retornava os meses mais antigos e fusao indevida de compras parceladas distintas com mesmo estabelecimento/cartao/categoria. `tests/unit.test.js` passou com 110/110; bateria focada com SQLite e maquina de estados passou com 161/161; `npm test` passou com 274/274. O blocker de cobertura antes do Packet 06 foi removido, mas nenhum trabalho do Packet 06 foi iniciado.

## Packet 06 - Goals/Metas (local, sem deploy)

- Consultas analiticas de metas agora usam `FinancialQueryPlan` com `domain=goals` e passam por `query_engine_primary`.
- `Metas` permanece a fonte autoritativa de valor atual, alvo, status e escopo. `Movimentacoes Metas` alimenta historico, aportes, retiradas e explicacao auditavel; a Query Engine nao soma as duas fontes, evitando dupla contagem.
- O read-model SQLite ganhou `goal_movements` e filtra metas pessoais/familiares autorizadas antes da Query Engine. Sheets permanece como fallback escopado e observado.
- Metas pausadas, canceladas e concluidas sao distinguidas e nao entram no faltante/progresso ativo.
- Criacao, aporte, retirada, ajuste e mudanca de status continuam exclusivamente no Command Engine.
- Cobertura local adicionada para planner, progresso/faltante, historico, status, escopo familiar, ausencia de IDs publicos e compatibilidade com a maquina de estados.
- Correcao apos auditoria do Packet 06: `resumo_metas` agora preserva filtros seguros vindos do planner, incluindo `scope=family`, e o classificador local reconhece `familiares` no plural. Isso evita que perguntas como "quais metas familiares temos?" misturem metas pessoais na resposta.
- Validacao apos auditoria: bateria focada (`unit`, `readModelSqlite`, `financialStateMachine`) passou com 167/167 e `npm test` passou com 280/280. Nenhum deploy, commit ou Packet 07 iniciado.

## Packet 07 - Debts/Dividas (local, sem deploy)

- Consultas analiticas de dividas agora usam `FinancialQueryPlan` com `domain=debts` e `timeBasis=due_date`, passando por `query_engine_primary`.
- Cobertura implementada: saldo total, saldo por divida/credor, parcelas/vencimentos proximos, atrasadas, quitadas, ranking por juros/vencimento/saldo, recomendacao read-only de prioridade e explicacao auditavel.
- SQLite/read-model sincroniza campos ja existentes da aba `Dívidas` para uma tabela local expandida e alimenta a Query Engine com escopo filtrado antes do calculo. A planilha real nao teve schema alterado.
- Criar divida e registrar pagamento continuam no Command Engine; perguntas de escrita nao entram na Query Engine.
- Resultados publicos nao expoem `user_id`, `sheet_id`, tokens, URLs privadas ou linhas cruas. Escopo pessoal/familiar segue resolvido antes da Query Engine.
- Lacuna aceita: a aba atual nao possui historico individual de pagamentos de dividas; "pagamentos registrados" sao inferidos de forma deterministica como `Valor Original - Saldo Atual`. Historico detalhado exigiria pacote/schema proprio futuro.
- Correcao apos auditoria do Packet 07: perguntas de vencimento relativo como "nos proximos dias" nao recebem mais mes/ano implicitos e atravessam corretamente a virada do mes.
- Correcao apos auditoria do Packet 07: o read-model preserva e usa os cabecalhos reais da aba `Dívidas`, mantendo compatibilidade com o schema legado e com o schema atual de planilhas de usuario.
- Correcao apos auditoria do Packet 07: dividas ativas sem `Próximo Vencimento` explicito derivam o proximo vencimento pelo dia cadastrado e nao ficam atrasadas para sempre; dias 29/30/31 sao ajustados para meses curtos.
- Correcao apos auditoria do Packet 07: a criacao de divida monta a linha conforme os cabecalhos da planilha ativa, evitando gravar status, parcelas pagas e proximo vencimento em colunas incorretas.
- Validacao apos auditoria: bateria focada (`unit`, `readModelSqlite`, `financialExplainability`, `financialStateMachine`) passou com 178/178 e `npm test` passou com 289/289. A bateria `functional.test.js` habilitada permaneceu bloqueada corretamente pela trava de seguranca de reset de planilha; ela nao foi forçada contra dados reais. Nenhum deploy, commit ou Packet 08 iniciado.

## Packet 08 - Bills/Contas e vencimentos (local, sem deploy)

- Consultas analiticas de contas recorrentes e vencimentos agora usam `FinancialQueryPlan` com `domain=bills` e `timeBasis=due_date`, passando por `query_engine_primary`.
- Cobertura implementada: cadastro/listagem de contas recorrentes, vencimentos hoje/amanha/proximos N dias, total esperado, total realizado associado, total pendente, status pago/pendente, comparacao esperado versus realizado e explicacao auditavel.
- A Query Engine materializa ocorrencias mensais deterministicamente e ajusta dias 29, 30 e 31 para o ultimo dia valido em meses curtos. Janelas relativas atravessam viradas de mes e ano.
- `Contas` continua sendo a fonte do valor esperado e vencimento; `Saídas` fornece o realizado. Cada saida e atribuida a melhor conta compativel do mesmo usuario e mes por descricao, categoria e subcategoria, sem dupla contagem. `Regra Ativa` continua significando classificacao automatica, nao status pago.
- SQLite/read-model ganhou a tabela local `recurring_bills` e alimenta a Query Engine com contas e apenas as saidas do escopo/periodo necessario antes do calculo. Nao houve mudanca no schema real da planilha.
- Scheduler e Query Engine compartilham a mesma regra de vencimento recorrente para meses curtos. Eventos do Calendar permanecem fora do calculo financeiro de contas.
- Escopo pessoal/familiar continua resolvido antes da Query Engine; resultados publicos nao expoem IDs internos. Criar/alterar conta, lembrete e calendario continuam fora da Query Engine.
- Lacunas aceitas: a aba `Contas` nao possui confirmacao explicita de pagamento, entao pago/pendente e inferido por associacao com `Saídas`; uma conta manual paga somente por cartao ou registrada apenas como transferencia pode continuar pendente ate existir vinculacao explicita entre fontes. Contas muito parecidas podem exigir um identificador de regra em pacote/schema futuro. Planilha pessoal ainda pode usar fallback Sheets escopado quando o read-model nao cobre ou nao esta sincronizado.
- Validacao apos auditoria do Packet 08: bateria focada (`unit`, `readModelSqlite`, `schedulerJobs`, `financialExplainability`, `financialStateMachine`) passou com 197/197; `npm test` passou com 301/301. Nenhum deploy, commit ou Packet 09 iniciado.
- Correcao apos auditoria do Packet 08: o scheduler agora calcula o proximo vencimento recorrente, atravessando viradas de mes e ano, e mostra o dia real quando um vencimento 29/30/31 e ajustado para mes curto.
- Correcao apos auditoria do Packet 08: a inferencia de pagamento deixou de aceitar subcategoria isolada como evidencia suficiente; exige nome/descricao compativel ou categoria, subcategoria e valor esperado compativeis.
- Correcao apos auditoria do Packet 08: textos muito curtos nao podem produzir correspondencia fuzzy e marcar uma conta como parcialmente realizada por engano.
- Correcao apos auditoria do Packet 08: consultas familiares autorizadas reconhecem pagamento feito por outro membro, enquanto consultas pessoais continuam isoladas. Perguntas por conta especifica filtram tanto nome amigavel quanto nome original cadastrado.

## Packet 09 - Family and Scope (local, sem deploy)

- O `Scope Resolver` transversal foi consolidado em `src/services/financialScopeResolver.js` e agora roda uma unica vez, fora do LLM, depois do plano e antes de qualquer leitura financeira.
- Escopo pessoal virou o default efetivo. Familia exige vinculo ativo; membro exige correspondencia unica dentro do vinculo autorizado; ambiguidade ou membro nao autorizado gera esclarecimento antes da Query Engine.
- O escopo resolvido e aplicado ao `FinancialQueryPlan`, ao SQLite/read-model e ao fallback Sheets. O read-model ignora listas de usuarios que tentem ampliar acesso sem um escopo resolvido autorizado.
- Follow-ups preservam apenas `scope` e nome publico seguro do membro. Contexto pessoal nao pode ser promovido silenciosamente para familia/membro, e revogar o vinculo remove o membro da proxima resolucao imediatamente.
- Correcao apos auditoria do Packet 09: follow-up generico vindo de contexto pessoal tambem nao pode ser promovido para `member` apenas porque planner/contexto trouxe `requestedMember`. A promocao para membro segue permitida quando o usuario nomeia explicitamente o membro na nova pergunta.
- Correcao apos auditoria do Packet 09: `matchedUser` no resultado do resolver foi reduzido a rotulo publico, evitando carregar o registro completo do usuario em objetos que podem circular por helpers, logs ou testes.
- Nomes de cartao nao concedem identidade/permissao de membro. Consultas como fatura do `Nubank Thais` continuam pessoais salvo pedido familiar ou por pessoa explicitamente autorizado.
- Admin nao ganha acesso financeiro amplo pela Query Engine. `ALL_USERS_ID` e pedidos de todos os usuarios sao bloqueados nesse caminho; a excecao temporaria do dashboard continua separada e regida pelo ADR-002.
- Logs novos de resolucao registram apenas escopo, contagem e motivo seguro. Logs de vinculo/revogacao familiar deixaram de imprimir IDs internos.
- Lacuna aceita: o dashboard ainda possui excecao all-users controlada por flag para beta/teste, fora da Financial Query Engine; sua remocao/substituicao permanece gate obrigatorio antes de escala multiusuario, conforme ADR-002.
- Lacuna aceita: logs novos da rota analitica e de vinculo/revogacao familiar nao imprimem IDs internos, mas ainda existem logs operacionais legados fora da Query Engine, especialmente em admin/OAuth/escritas, que carregam IDs. A sanitizacao global deve ser tratada em pacote proprio para nao ampliar o Packet 09 sobre onboarding, OAuth, admin e escrita financeira.
- Validacao local do Packet 09: `node --check` passou nos 12 arquivos JS alterados; bateria focada de escopo, seguranca, Query Engine, SQLite, OAuth, explainability e maquina de estados passou com 207/207; `npm test` passou com 307/307. Nenhum deploy, commit ou Packet 10 iniciado.
- Revalidacao apos auditoria corretiva do Packet 09: `node --check` passou nos arquivos revisados; bateria focada (`unit`, `readModelSqlite`, `googleOAuthService`, `financialStateMachine`, `dashboardAuthSecurity`) passou com 204/204; `npm test` passou com 307/307; `state_store.json` foi restaurado para `{}`. Nenhum deploy, commit ou Packet 10 iniciado.

## Packet 10 - Dashboard and Summaries (local, sem deploy)

- Dashboard API, UI e WhatsApp `resumo` passaram a compartilhar criterios publicos de calculo via `dashboardSummaryService`, sem Gemini calcular KPIs, percentuais, rankings, orcamento, metas, dividas ou parcelas.
- O `resumo` do WhatsApp deixou de montar leitura paralela de Sheets/saude de caixa e agora formata o mesmo snapshot deterministico do dashboard/read-model ou da planilha pessoal escopada.
- O dashboard declara bases temporais: entradas por data de recebimento/lancamento, saidas por data da compra/lancamento, cartoes do dashboard mensal por data da compra, orcamento por ciclo configurado/competencia da parcela, e transferencias internas fora de renda/gasto.
- SQLite/read-model agora inclui reserva/caixinha no `saldoDisponivelEstimado` e mostra transferencias em lancamentos recentes com tipo explicito, sem misturar com renda ou despesa.
- Planilha pessoal continua como fonte primaria quando existe contexto OAuth do usuario, mas o contrato publico agora e decorado com os mesmos criterios do dashboard. A excecao admin `ALL_USERS_ID` continua apenas como modo beta/suporte isolado por flag conforme ADR-002.
- Validacao local do Packet 10: `node --check` passou nos JS alterados; bateria obrigatoria (`dashboardApiContracts`, `dashboardAuthSecurity`, `financialExplainability`, `readModelSqlite`, `unit`) passou com 170/170; `npm test` passou com 309/309; `git diff --check` passou; varredura NUL sem achados; `state_store.json` restaurado para `{}`. Nenhum deploy, commit ou Packet 11 iniciado.

## Higiene do workspace

## Validacao completa de 2026-06-12

- A bateria `Financial Query Acceptance` passou com 265/265 casos, incluindo 23 pedidos adversariais bloqueados antes do planner.
- O smoke analitico real de Daniel passou usando um periodo populado (`junho de 2026`) e confirmou totais, detalhamento, categorias, extremos e estabelecimentos coerentes.
- O runner do WhatsApp Web deixou de depender apenas da contagem de texto visivel. Ele agora reconhece a ultima mensagem recebida por fingerprint, evitando falso timeout quando o WhatsApp virtualiza uma resposta antiga e uma nova resposta identica entra no DOM.
- O security gate passou a bloquear identificadores internos escritos com separadores, como `sheet_id` e `user-id`, antes de chamar Gemini ou Query Engine.
- Benchmark final: `gemini-3.1-flash-lite` teve 96/120 correspondencias, JSON valido 120/120, zero saida insegura, consistencia 40/40 e media de 1138 ms; `gemini-3.5-flash` teve 90/120, JSON valido 120/120, zero saida insegura, consistencia 40/40 e media de 5141 ms. Nenhum atingiu o gate de 98% de campos criticos, portanto nao trocar o modelo de producao ainda.
- O teto mensal foi liberado temporariamente e permitiu concluir o benchmark, mas o proprio benchmark consumiu a nova margem. Mesmo apos novo aumento informado em 2026-06-12, uma chamada minima ainda recebeu `monthly_spending_cap`; pode haver atraso de propagacao no AI Studio. Consultas deterministicas continuam operacionais; audio e interpretacao livre dependem da liberacao efetiva do teto.

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
