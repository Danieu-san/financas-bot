# Problemas conhecidos e armadilhas

Atualizado em: 2026-07-14

## Fase 8A: remocao de legado bloqueada

- O gate `gate:analytical-legacy` retornou `NO_GO` em 2026-07-14 por uma lacuna
  em `BILL-015` (`canonical_transactions_unavailable`). O fallback analitico
  tambem teve uso real nos logs. Nao desabilitar por `*` nem remover o trio
  `intentClassifier`/`calculationOrchestrator`/`responseGenerator`.
- Dashboard v1 continua com trafego significativamente maior que a API v2. Nao
  remover v1 sem migrar os consumidores e observar uso zero de forma duravel.
- Zero ocorrencias em busca textual de log nao equivale a uso zero. Exigir
  contador sanitizado e janela de observacao por consumidor.

## Canario 6E sem consumidor no WhatsApp

- `FINANCIAL_UNDO_MODE=canary` esta configurada, mas
  `src/undo/financialUndoService.js` e consumido apenas por testes e scripts E2E;
  nao ha ligacao atual no `messageHandler`.
- Tratar 6E como infraestrutura validada, nao como funcao disponivel ao usuario.
  Antes de ampliar, decidir entre integrar com gate proprio ou desligar e
  documentar a flag como test-only.

## Omissao da configuracao/capacidade no handoff

- Regressao operacional observada duas vezes na Fase 4: a resposta informou o
  proximo passo, mas omitiu a linha obrigatoria
  `Superficie -> Modelo -> Esforco -> Proxima tarefa` e/ou a inteligencia que
  explica por que aquele passo era o correto.
- Mitigacao permanente: `AGENTS.md` agora exige essa linha ao iniciar ou retomar
  tarefas e exige quatro campos antes de toda resposta final: resultado,
  inteligencia da decisao, capacidade recomendada e proximo passo.
- `docs/agent-memory/README.md` coloca a conferencia antes da ordem de leitura.
- Se a configuracao nao mudou, ela ainda deve ser repetida. Nao presumir que o
  usuario lembrara uma mensagem anterior.

## Privacidade/admin

- O dashboard admin com acesso a todos os usuarios foi mitigado por padrao no codigo.
- `DASHBOARD_ADMIN_ALL_USERS_ENABLED` deve ficar ausente ou `false` em beta/producao.
- Se `DASHBOARD_ADMIN_ALL_USERS_ENABLED=true` for usado, tratar como modo suporte/teste controlado, temporario e aprovado explicitamente.
- Antes de beta amplo, manter removido o acesso admin amplo a dados financeiros individuais.
- Sempre consultar `docs/decisions/ADR-002-admin-financial-data-access.md` em mudancas de admin, dashboard, familia ou launch.

## Rollback do dashboard v2

- `DASHBOARD_V2_ENABLED` ausente preserva compatibilidade e equivale a `true`.
- Para rollback operacional, definir `DASHBOARD_V2_ENABLED=false` e reiniciar o
  PM2 com `--update-env`. A pagina/API v2 respondem `404`, o dashboard atual
  continua ativo e o comando `dashboard v2` entrega a versao atual com aviso.
- Nao usar `DASHBOARD_ENABLED=false` para rollback exclusivo da v2, pois essa
  chave derruba tambem o dashboard atual e o health server.

## Convites e mensagens diretas de admin

- Armadilha corrigida em 2026-06-03: `admin convidar <telefone>` e `admin mensagem <telefone> <texto>` nao podem depender apenas de `msg.client.sendMessage`.
- Em alguns caminhos de admin antes do gate de acesso, especialmente quando o admin chega por `@lid`, a mensagem recebida pode nao carregar `msg.client`, mesmo com o singleton do WhatsApp online.
- Sintoma real: `confirmar admin` era recebido e logado, mas o convite nao era enviado; o log mostrava `convidar_cliente_indisponivel`.
- Mitigacao: usar `msg.client` quando existir e cair para `sendWhatsAppMessage` do singleton global quando faltar; respostas admin tambem recebem fallback se `msg.reply` nao existir.
- Testes de regressao: `messageHandler admin invite uses fallback sender when message client is missing` e `messageHandler admin confirmation replies through fallback when reply is missing`.

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
- Em 2026-05-31, um lancamento manual `guardei ... na caixinha` entrou como `Entradas/Poupança` antes da correcao do roteamento.

Causa:

- Parte do dinheiro foi enviado para caixinha/reserva e depois resgatado conforme necessidade.
- O saldo economico nao e igual ao dinheiro disponivel fora da reserva.

Mitigacao atual:

- Dashboard exibe `Saldo` e `Disponivel estimado`.
- Importador classifica aplicacoes/resgates de reserva como `Transferências`.
- Fluxo manual agora tambem classifica `caixinha/reserva/investimento` como `Transferências`, nao como renda.

## Transferencias familiares manuais

- Em escopo familiar, mensagens como `transferi 1269,74 para a thais` devem entrar em `Transferências` com status `Provável transferência interna`.
- Isso evita inflar `Saídas`, orçamento mensal livre e alertas diarios.
- A deteccao depende de o membro estar no escopo financeiro familiar ativo; sem vinculo, o bot pode tratar como gasto comum.
- Achado em 2026-06-20: transferencias em lote com caixinha/reserva e transferencia familiar foram salvas corretamente em `Transferências`, mas nao apareceram em `data/interpretation-reliability-shadow.jsonl`. Isso e uma lacuna de observabilidade: nao bloqueia `enforce` limitado a `expense.create`/`income.create` unitarios, mas bloqueia ampliar `enforce` para transferencias, caixinha/reserva ou lotes ate instrumentar esse caminho.

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

- Em 2026-05-26 foi implementado gate local que bloqueia pedidos por `sheet id`, `user id`, `tenant id`, identificador interno, prompt/regras internas, tokens/secrets, dados de outros usuarios/clientes e bypass/admin antes da classificacao financeira.
- O gate e coberto por testes unitarios e tambem sanitiza logs de mensagens com tokens, parametros OAuth e IDs de documentos Google.
- Deploy em producao confirmado no commit `6dfca42`.
- Cuidado com falso positivo: perguntas legitimas sobre a propria familia devem continuar permitidas; pedidos amplos por `todos os usuarios/clientes` devem continuar bloqueados.

## WhatsApp Web pode travar ao iniciar

Sintoma:

- Logs param em `WhatsApp carregando: 100%` ou `Autenticado com sucesso! Carregando chats...`.
- Tambem pode acontecer de o WhatsApp Web ficar logado e visualmente pronto, mas mensagens recebidas durante a inicializacao ficarem como nao lidas na pagina sem disparar `client.on('message')` no Node.

Mitigacoes usadas:

- Aguardar mais tempo antes de concluir falha.
- Reiniciar PM2 com cuidado.
- Evitar apagar `.wwebjs_auth` sem necessidade, pois forca novo QR.
- Limpar cache `.wwebjs_cache` pode ajudar, mas nao deve ser primeira acao destrutiva.
- Producao passou a usar `WWEB_CACHE_TYPE=local` com `WWEB_VERSION=2.3000.1017054665` apos incidente de 2026-06-29 em que `none/live` travou no 100%.
- O startup agora reprocessa mensagens nao lidas apos `ready`, via backfill deduplicado, para cobrir mensagens que chegaram antes dos listeners de `Msg.on('add')` ficarem plenamente ativos.
- Armadilha corrigida em 2026-06-30: se o ready rescue chamar apenas `onAppStateHasSyncedEvent()` quando `window.WWebJS` ja existe, o WhatsApp pode emitir `ready` sem anexar novamente os listeners de mensagem. Sintoma: PM2/health/WhatsApp prontos, mensagens ficam nao lidas na pagina e nao aparece `[message] received` no log. O rescue agora chama `client.attachEventListeners()` antes de forcar o `ready`.

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
- Armadilha corrigida localmente em 2026-06-04: perguntas WhatsApp sobre totais/detalhes do mes nao podem misturar `Data` da compra com `Mês de Cobrança`. Se `quanto gastei esse mês?` inclui cartoes por competencia da fatura, follow-ups como `detalhe`, `e no cartão?`, `foram em quais estabelecimentos?` e `e por categoria?` precisam manter a mesma base temporal. A Query Engine deve receber `timeBasis: billing_month` nesses intents.
- Armadilha corrigida localmente em 2026-06-04: parser de mes nao pode usar substring simples, porque `maior` contem `maio` e fazia perguntas de maior gasto cairem em maio. Usar token limpo/palavra inteira.
- Armadilha corrigida localmente em 2026-06-04: percentuais, maior/menor e contagens de gastos devem manter a mesma base de competencia de cartao dos totais. `percentual_categoria_gastos` e extremos usam Query Engine; contagem usa linhas detalhadas com fuzzy para preservar tolerancia a typos.
- Armadilha corrigida localmente em 2026-06-04: `me explica de onde veio esse total` nao pode apenas cair em uma listagem generica. A resposta precisa nomear explicitamente o total explicado (`Esse total ... vem de:`) e mostrar a composicao, senao a UX parece que o bot desviou da pergunta.
- Armadilha corrigida localmente em 2026-06-04: perguntas de fatura com palavras como `compras`, `itens`, `lançamentos`, `compõem`, `detalhe` ou `mostra` nao devem cair em `total_fatura_cartao`. Devem ir para `detalhamento_cartao_mes` e responder com a composicao da fatura.
- Armadilha corrigida localmente em 2026-06-04: perguntas de parcelas em aberto sem citar explicitamente `cartão` podem ser legitimas, por exemplo `quais parcelas ainda tenho para pagar?`. Devem cair em `resumo_parcelamentos_cartao`, nao em fallback generico.
- Armadilha corrigida em 2026-06-04: no fluxo de exclusao, `gasto` nao pode significar apenas `Saídas`. Comandos como `apagar ultimo gasto` devem procurar o ultimo gasto do usuario em `Saídas` e cartoes (`Lançamentos Cartão`/abas legadas) e apagar da aba real onde o item foi encontrado.
- Armadilha corrigida em 2026-06-04: notificacoes pós-salvamento (ex.: alerta de orçamento mensal) nao podem ficar no mesmo `try/catch` da persistencia. Se o WhatsApp/Puppeteer falhar ao enviar o alerta depois que o gasto ja foi salvo, o usuario nao deve receber "erro ao salvar o gasto"; logar o alerta como falha e manter a confirmação de sucesso.
- Regra atual do orçamento mensal livre: lançamentos de cartão entram pelo vencimento/competência da parcela, consultando `Mês de Cobrança` em `Lançamentos Cartão` e `Dia de Vencimento` em `Cartões`. Nao voltar a usar a data da compra para o orçamento, pois isso faz parcelamentos pesarem integralmente no ciclo da compra.
- Armadilha corrigida em 2026-05-31: se a formula `QUERY` de `Faturas`/`Parcelamentos` consultar `Lançamentos Cartão!A2:J`, o parametro de cabecalho precisa ser `0`; usar `1` faz a primeira compra real virar cabecalho e sumir dos totais.
- Armadilha corrigida em 2026-05-31: valores de cartao escritos como texto com virgula fazem `SUM` retornar `0`. Novos fluxos gravam numero; planilhas antigas podem precisar de normalizacao da coluna `Valor Parcela`.
- Armadilha corrigida em 2026-05-31: frases como `à vista no cartão nubank thais` podem ser classificadas pela IA como `Débito`. O roteamento agora usa o nome do cartao cadastrado como sinal mais forte de credito, exceto quando o usuario disser explicitamente `debito`.
- Armadilha corrigida em 2026-05-31: formulas da aba `Dashboard` que começam em linha 3/4 para ignorar exemplos quebram quando o usuario apaga os exemplos e a primeira linha real vira linha 2. Preferir somas por `user_id` preenchido.
- Armadilha corrigida em 2026-05-31: o dashboard web de mês/consumo nao deve filtrar `Lançamentos Cartão` só por `Mês de Cobrança`, pois compras feitas em maio com fatura em junho somem das categorias de maio. Para o dashboard mensal, usar data da compra; para orçamento mensal livre, continuar usando competência/vencimento da fatura.
- Armadilha corrigida em 2026-05-31: o gráfico financeiro tinha cinco barras, mas o SVG foi dimensionado como se coubessem quatro e a barra `Disponível` podia aparecer cortada. Manter espaçamento calculado dinamicamente se novas barras forem adicionadas.
- Armadilha corrigida em 2026-05-31: `Lançamentos Recentes` do dashboard podia exibir datas serializadas (`46173`), nao indicar se o valor era entrada/saida/cartao e mostrar cada parcela como se fosse uma compra separada. A lista recente agora formata datas, mostra etiqueta de tipo e agrupa parcelas visualmente pelo total da compra.
- Armadilha corrigida em 2026-05-31: `UserSettings` cresceu para 19 colunas (`A:S`), mas processo antigo ainda tentou atualizar `A:M` e falhou com `tried writing to column [N]`. O range agora e derivado do schema `SETTINGS_HEADERS`, e novas linhas default ja nascem com todas as colunas.

## Duplicidade em UserSettings e consultas de orcamento

- Armadilha corrigida em 2026-07-03: linhas duplicadas do mesmo user_id em UserSettings podem fazer uma linha vazia sobrescrever no SQLite uma configuracao de orcamento familiar valida. A normalizacao do read-model deve deduplicar por usuario e preservar configuracao explicita.
- Perguntas quantitativas como "quanto falta do orcamento familiar?" nao sao perguntas de escopo. Familiar define o filtro; falta/restante define a operacao de forecast.
- Ferramentas de dashboard (explain_metric, get_dashboard_snapshot) nao devem substituir um FinancialQueryPlan de dominio budget, pois podem expor apenas criterio sem o valor calculado.

## Identidade de conta nos movimentos canonicos

- Lacuna confirmada em 2026-07-03: Saidas e Entradas registram forma de pagamento/recebimento (PIX, Debito, Dinheiro), mas o ledger de contas precisa da identidade da conta financeira (por exemplo Daniel - Nubank ou Thais - Itau).
- Nao tratar PIX, Debito ou Dinheiro como se fossem contas reais e nao escolher uma conta silenciosamente quando houver mais de uma candidata.
- Ate existir campo/contrato explicito de conta origem/destino e captura conversacional correspondente, o canario accounts serve para saldos de abertura e testes marker-only; nao deve ser promovido a fonte primaria de saldo atual.
