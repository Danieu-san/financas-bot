# Auditoria exaustiva dos caminhos WhatsApp e da maquina conversacional

Data da caracterizacao: 2026-07-18
Escopo: entrada WhatsApp, audio, roteamento conversacional, estados, handlers auxiliares, Gemini e composicao da resposta.
Restricoes observadas: nenhuma producao, rede, credencial, sessao real, planilha real ou dado pessoal foi acessado; nenhum codigo de produto foi alterado.

## 1. Veredito desta frente

- **Caracterizacao estatica da superficie:** `GO`. Os entrypoints produtivos, a ordem real dos gates, todos os estados e estados auxiliares encontrados, os intents finais, os efeitos e os caminhos mortos relacionados foram cruzados com callers e testes.
- **Conformidade da superficie:** `NO-GO`. Permanecem lacunas indispensaveis, sobretudo audio processado antes de identidade/acesso/rate limit, excecoes de handlers fora da protecao final, retomada de estados persistidos com conteudo necessario sanitizado e caminhos de escrita que podem deixar feedback/replay ambiguo.
- **Alcance do veredito:** somente esta frente. Ele nao fecha nem substitui o veredito geral da reauditoria.

## 2. Fontes e metodo

Fontes produtivas principais:

- `index.js`;
- `src/services/whatsapp.js`;
- `src/services/whatsappReadyRescueService.js`;
- `src/services/whatsappUnreadBackfillService.js`;
- `src/utils/whatsappMessaging.js`;
- `src/handlers/audioHandler.js`;
- `src/handlers/messageHandler.js`;
- `src/handlers/{onboarding,creation,deletion,debt,debtUpdate,batchMaintenance,financialExport,financialReceipt}Handler.js`;
- `src/state/userStateManager.js`;
- `src/services/gemini.js`;
- `src/ai/{intentClassifier,responseGenerator}.js`;
- `src/agent/financialAgent.js` e os callers diretos do planner/agente citados pelo handler.

Metodo:

1. levantamento de imports, exports, listeners e callers;
2. extracao de todos os `case` do roteador e de todos os valores gravados em `action`;
3. leitura dos fluxos de entrada, guards, mutacoes, efeitos externos, respostas, telemetria e tratamento de falha/replay;
4. cruzamento com testes locais e caminhos explicitamente sem caller;
5. bateria local isolada e verificacao de sintaxe.

## 3. Grafo de entrada e ordem real de precedencia

### 3.1 Inicializacao e eventos do cliente

| Entry/caller | Ramos e guards | Persistencia/efeito externo | Falha, retry e replay | Prova atual / lacuna |
|---|---|---|---|---|
| `index.startBot()` | Exige quatro variaveis; autoriza Google e prepara Sheets antes do WhatsApp; inicia dashboard depois de criar o cliente. | Google, read model, dashboard, cliente WhatsApp. | Erro de boot chama `process.exit(1)`; `unhandledRejection` apenas registra. | Nao houve boot real nesta frente. Testes de componentes nao provam a composicao integral do boot. |
| `client.once('ready')` em `index.js` | Executa uma vez. | Inicia scheduler, runtime Open Finance e backfill de nao lidas. | Backfill tem `catch` local; scheduler/Open Finance nao tem isolamento individual no callback. | Backfill unitario existe; falta teste integrado do listener `ready` e da ordem/isolamento dos tres efeitos. |
| `client.on('message', handleMessage)` | Toda mensagem emitida pela biblioteca. | Entra no roteador financeiro. | Promise rejeitada nao e capturada no listener; cai no `unhandledRejection` global. | Lacuna indispensavel: handlers anteriores ao `try` interno podem rejeitar sem resposta ao usuario. |
| `initializeWhatsAppClient()` | Singleton; segunda chamada durante inicializacao retorna `null`; configura versao/cache/UA e Puppeteer. | `LocalAuth`, processo Chromium e sessao local. | Watchdog encerra para PM2; QR desarma watchdog; `auth_failure` encerra 1; `LOGOUT` destroi e encerra 0; demais desconexoes encerram 1. | Rescue tem teste. Nao ha teste direto dos listeners `qr/loading/change_state/authenticated/ready/auth_failure/disconnected` nem da semantica de exit. |
| `ready rescue` | So roda se autenticado e ainda inicializando; exige `pupPage.evaluate`; reanexa listeners e dispara callback interno de sync. | Atua na pagina do WhatsApp Web. | Skip seguro quando nao pendente/pagina ausente; falha e registrada. | `whatsappReadyRescueService.test.js`: 3/3 verdes. Falta prova contra versao real da biblioteca, deliberadamente fora desta frente. |
| `backfillUnreadMessages()` | Flag, `getChats`, handler, atraso, chat com `unreadCount`, limite por chat, apenas recebidas e posteriores ao boot. | Reinjeta mensagens em `handleMessage` em ordem cronologica. | Uma falha para o loop inteiro; nao continua por mensagem. `index` nao fornece `isAlreadyProcessed`, mas o handler deduplica depois. | `whatsappUnreadBackfillService.test.js`: 2/2 verdes. Lacuna: corrida de audio live/backfill antes de entrar no set de deduplicacao. |
| `sendPlainMessage()` | Prefere `client.sendMessage(target)` e cai para `msg.reply`; sem ambos retorna `null`. | Envio WhatsApp. | Nao faz retry ou confirmacao de entrega. | Exercitado indiretamente; nao ha contrato unitario para alvo `author` versus `from` ou retorno `null`. |

### 3.2 Ordem de `handleMessage`

A ordem abaixo e material: caminhos anteriores nao recebem automaticamente as protecoes dos caminhos posteriores.

1. metrica `message.received`;
2. deduplicacao em memoria por `msg.id.id`;
3. **download, conversao e envio do audio ao Gemini**;
4. inclusao do ID no set por cinco minutos;
5. descarte de `status` e `fromMe`;
6. `resolveUserAccess`;
7. comando admin pre-acesso;
8. bloqueio/aviso/aprovacao/conexao Google para acesso nao permitido;
9. gate de modo familiar;
10. entrada no contexto da planilha do usuario;
11. avisos `justActivated` e `justReconsented`;
12. comandos legais;
13. onboarding;
14. lifecycle da conta;
15. configuracoes;
16. dashboard;
17. admin pos-acesso;
18. comprovantes;
19. OCR de documento;
20. exportacao;
21. importacao CSV/OFX/XLS/XLSX;
22. movimentos/status de metas;
23. rate limiter;
24. filtro de pedido sensivel;
25. cache de resposta por `senderId:body`;
26. cancelamento/ajuda/interrupcao global de estado;
27. maquina de estados;
28. greeting e clarificacao de movimento interno;
29. manutencao em lote;
30. classificadores deterministicos, planner de comandos, fallback local e LLM mestre;
31. roteamento final por intent.

Consequencias comprovadas pela ordem:

- audio de mensagem nao autorizada, `status` ou `fromMe` pode ser transcrito externamente antes de qualquer descarte, acesso, rate limit ou filtro sensivel;
- comprovante, OCR, exportacao, importacao, metas, dashboard, admin, configuracoes e onboarding passam antes do rate limiter generico;
- o `try/catch` final com resposta amigavel comeca somente na analise de novos comandos; a maior parte dos passos 6 a 27 pode rejeitar para o listener sem resposta local;
- uma mensagem de audio que falha na transcricao nao e marcada como processada e pode ser tentada novamente; duas entregas concorrentes do mesmo audio podem atravessar o check antes de qualquer uma adicionar o ID.

## 4. Entrada de audio

| Decisao | Branch/guard | Efeito e resposta | Falha/replay | Teste / lacuna |
|---|---|---|---|---|
| Tipo `ptt`/`audio` | Executa antes de `isStatus/fromMe` e acesso. | Responde “processando”, baixa media, grava OGG, converte MP3, envia MP3 base64 ao Gemini e substitui `msg.body` pela transcricao. | Download vazio responde e retorna `null`; conversao/transcricao captura erro; `finally` tenta apagar OGG/MP3. | `audioHandlerPrivacy.test.js`: 2/2; estado financeiro prova que transcricao entra no roteamento. Lacuna critica de precedencia descrita acima. |
| Gemini de audio | Timeout, mas sem o loop de retry de `callGemini`. | API `gemini-2.5-flash`; prompt pede apenas transcricao. | Erro vira texto generico; o handler o considera uma transcricao valida, pois so rejeita texto que contenha “nao consegui entender”. Assim, uma falha pode seguir ao roteador como mensagem financeira desconhecida. | Falta teste que prove que a string de erro de `transcribeAudio` encerra o fluxo sem segunda resposta/LLM mestre. |
| Temporarios/log | Diretorio criado no carregamento do modulo; nomes por milissegundo. | Disco local e logs sem transcricao. | Colisao de timestamp e sincronismo de `writeFileSync` nao tem controle explicito. | Limpeza e ausencia de texto financeiro em logs estao provadas; colisao concorrente nao. |

## 5. Guards de identidade, acesso e escopo

| Gate | Resultado/efeito | Cobertura e lacuna |
|---|---|---|
| `processedMessages` | Ignora mesmo ID por 5 min; somente memoria. | Ha cobertura indireta, mas nao prova ID vazio, reinicio ou corrida concorrente de audio. |
| `resolveUserAccess` | Pode negar, notificar admins, exigir Google, responder termos/status ou liberar usuario. | Auditorias Google cobrem varios subgates; nesta frente o caller foi caracterizado. Excecao nao e capturada localmente. |
| admin pre-acesso | Somente prefixo `admin` ou “confirmar/confirmo admin”; `isAdminWithContext` decide. | Testes unitarios provam bypass de LID autorizado e negacao de nome falso. |
| `evaluateFamilyModeAccess` | Bloqueia fora do casal/configuracao permitida. | `familyModeService.test.js` existe; esta bateria nao o reexecutou. |
| `runWithUserSheetContext` | Envelopa todo o fluxo autorizado e fornece contexto de usuario/mensagem para Google/telemetria. | Operacoes Google possuem testes de chave/replay; falta teste de limpeza do contexto quando um handler pre-roteador rejeita. |
| escopo analitico | `resolveFinancialQueryScope` permite pessoal/familia/membro autorizado, esclarece ambiguidade e bloqueia acesso amplo. | Cobertura extensa em `unit.test.js`; nao reexecutada nesta bateria. |
| rate limiter | So bloqueia depois dos handlers especiais; sem resposta ao usuario, apenas log/metrica. | `rateLimiter.test.js`: 2/2. Lacuna de cobertura e UX: caminhos caros anteriores ignoram o limite e o bloqueio e silencioso. |
| filtro sensivel | Bloqueia exposicao de IDs, tokens, prompts/regras e dados de terceiros. | Testes unitarios de deteccao/log. Nao protege audio nem handlers especiais anteriores. |

## 6. Maquina de estados: inventario integral

### 6.1 Regras globais dos estados

- `cancelar`/equivalentes apagam qualquer estado retornado por `getConversationStateForMessage` e respondem que nada pendente foi salvo;
- `ajuda` apaga o estado e volta ao roteamento normal;
- um comando novo explicito interrompe apenas `confirming_statement_import`;
- estados de importacao podem ser recuperados de outra chave de remetente quando o `userId` coincide;
- nao existe `default` no `switch`: um estado desconhecido persistido engole silenciosamente a mensagem;
- estado de onboarding e comprovante e consumido antes do `switch`; confirmacao admin usa outro `Map`;
- o store e arquivo atomico ou Redis, com TTL opcional; varios estados nao usam TTL;
- campos textuais/descritivos sao substituidos por hash na serializacao. Isso protege privacidade, mas nao ha prova de que estados financeiros retomados apos restart continuem executaveis sem corromper descricao/titulo/observacao.

### 6.2 Onboarding, configuracoes e criacao guiada

| Estado | Entrada e branches | Persistencia/efeito | Resposta/falha/replay | Teste / lacuna |
|---|---|---|---|---|
| `onboarding_flow` | 6 passos: nome completo, nome de uso, renda, gasto fixo, divida sim/nao, objetivo; aceita voltar, recomecar e ajuda; rejeita texto parecido com comando. | `UserProfile` e display name; TTL 12h. | Conclusao oferece criacao de divida quando aplicavel. | `onboardingState`: 8/8. Falta falha simulada entre `upsertUserProfile` e `updateUserDisplayName`. |
| `post_onboarding_debt_offer` | Sim inicia `creating_debt`; nao limpa; qualquer outro texto limpa e continua como novo comando. | Somente estado. | Nao prende o usuario. | Exercitado por funcional/state machine apenas no ramo nao; ramo sim nao tem prova dedicada. |
| `awaiting_monthly_budget_amount` | Valor positivo; pode pedir dia, escopo ou salvar; familia sem vinculo cai para pessoal. | `UserSettings`. | Valor invalido mantem estado. | Cobertura de amount/scope/day; falta excecao de leitura de settings/escopo. |
| `awaiting_monthly_budget_cycle_start_day` | Dia 1..31; depois resolve escopo. | `UserSettings`. | Invalido repete. | Coberto. |
| `awaiting_monthly_budget_scope` | Pessoal/familia; familia sem vinculo e convertida para pessoal. | `UserSettings`. | Invalido repete. | Coberto. |
| `awaiting_daily_goal_scope` | Alias legado executa a mesma logica de orcamento mensal. Nenhum writer atual encontrado cria esse estado. | `UserSettings`. | Resposta fala orcamento mensal. | Caminho aparentemente morto/compatibilidade; sem teste de reachability. |
| `creating_goal` | Escopo, nome, alvo, atual, data fim, prioridade; `cancelar`. | Append em `Metas` com formulas, `user_id`, escopo. | `finally` limpa ate quando salvar falha. | Criacao feliz coberta; validadores unitarios. Sem teste de cada entrada invalida, datas passadas, falha parcial ou invalidacao do cache/read model. |
| `creating_debt` | Nome, credor, tipo, original, saldo, parcela, juros, vencimento, inicio, parcelas, observacao; `cancelar`. | Le header e append em `Dividas`. | `finally` limpa em sucesso/erro. | Helpers testados; fluxo integral de criacao de divida nao aparece na bateria state-machine. Sem invalidacao de cache/read model. |

### 6.3 Gastos, entradas, contas financeiras, cartoes e transferencias

| Estado | Entrada/decisoes | Escrita/efeito | Falha/replay/resposta | Teste / lacuna |
|---|---|---|---|---|
| `awaiting_payment_method` | Aceita Debito/Credito/PIX/Dinheiro; credito pede cartao; detecta transferencia; pode pedir categoria, conta financeira ou confirmacao. | `Saidas`, `Transferencias` ou cartao. | Metodo invalido repete. No append simples, a limpeza ocorre depois da resposta; falha de envio pode deixar estado apos escrita. | Cobertura ampla. Lacuna de write-sucesso/reply-falha/reentrada. |
| `awaiting_receipt_method` | Conta Corrente/Poupanca/PIX/Dinheiro; transferencia, confiabilidade, conta financeira. | `Entradas` ou `Transferencias`; sugestao de reserva. | Metodo invalido repete; limpeza tambem ocorre depois de respostas. | Coberto, inclusive reembolso/conta. Mesma lacuna de feedback/replay. |
| `awaiting_expense_financial_account` / `awaiting_planned_expense_financial_account` | Escolha exata/numerica de conta no escopo. | Continua write legado ou planejado. | Invalido repete. | Coberto no legado e planejado. |
| `awaiting_income_financial_account` | Escolhe conta de destino. | Continua append em `Entradas`. | Invalido repete. | Coberto. |
| `awaiting_expense_category` / `awaiting_planned_expense_category` | Numero existente ou criar nova; opcao invalida repete. | Apenas prepara categoria; write posterior exige confirmacao. | Preserva origem de interpretacao. | Varios testes adversariais verdes. |
| `awaiting_expense_new_category_name` | Nome curto. | Estado intermediario. | Invalido repete. | Cobertura parcial indireta. |
| `awaiting_expense_new_subcategory_name` | Nome ou sem subcategoria. | Registra categoria e continua fluxo; confirmacao antes do gasto. | Falha de registro pede retry. | Coberto para planejado e legado. |
| `awaiting_planned_expense_payment_method` | Quatro metodos. | Continua planner expense. | Invalido repete. | Cobertura indireta. |
| `confirming_planned_expense` | Sim grava; nao cancela; outros repetem. | Categoria opcional, `Saidas`, telemetria e alerta de orcamento. | Registro de categoria falho mantem estado; write em si nao tem `try/catch` local neste case. | Coberto em multiplos testes; falta falha do append apos categoria criada. |
| `awaiting_credit_card_selection` | Cartao valido; com parcelas ja detectadas pode gravar, senao pede parcelas. | Append de parcelas no cartao. | Save tem catch/finally e limpa inclusive em erro. | Coberto. Lacuna: limpar em erro elimina retry guiado e nao informa write incerto. |
| `awaiting_installment_number` | Inteiro >=1 e controle de confiabilidade. | Cartao. | Invalido repete; save catch/finally. | Coberto. |
| `confirming_credit_card_expense` | Somente texto normalizado exatamente `sim` grava; qualquer outro cancela. | Cartao. | Ambiguidade e tratada como cancelamento, nao como reprompt; limpa em finally. | Nao ha teste dedicado ao vocabulário de confirmacao/cancelamento deste estado legado. |
| `awaiting_planned_expense_credit_card_selection` | Numero do cartao. | Estado de parcelas. | Invalido repete. | Coberto. |
| `awaiting_planned_expense_credit_installments` | Inteiro >=1. | Vai para confirmacao final. | Invalido repete. | Coberto. |
| `confirming_planned_credit_card_expense` | Sim/nao explicitos; categoria pendente antes do write. | Cartao e telemetria. | Catch registra erro e `finally` limpa; replay usa operation key de origem. | Coberto em caminho feliz/cancelamento; falta write incerto. |
| `awaiting_transfer_origin_account` | Escolhe origem. | Estado de destino. | Invalido repete. | Coberto. |
| `awaiting_transfer_destination_account` | Escolhe destino diferente da origem. | Vai para confirmacao. | Reuso/invalido repete ou bloqueia conforme opcoes. | Coberto. |
| `confirming_manual_transfer` | Sim grava; nao cancela; outro repete. | `Transferencias`, read model/cache dirty. | Operation key; resposta diferencia replay/status. | Coberto, inclusive cancelamento. |
| `confirming_transactions` | `sim`; qualquer outra entrada cancela. Salva direto quando todos completos, senao pede metodo. | Mistura `Saidas`, `Entradas`, `Transferencias`. | Erro por item continua e reporta contagem; transferencia unica pode pedir contas. Resposta ambigua cancela. | Cobertura de lote misto e transferencias. Falta prova de replay apos falha parcial. |
| `awaiting_batch_payment_method` | Um metodo para o lote; credito abre fluxo de cartao. | Append item a item. | Erro por item continua; limpeza apos resposta final. | Coberto. Falta resposta-falha apos writes e idempotencia end-to-end apos restart. |
| `awaiting_credit_card_selection_batch` | Numero. | Estado de parcelas. | Invalido repete. | Coberto. |
| `awaiting_installments_batch` | Parser deterministico exige mapa completo. | Loop de todos os itens e todas as parcelas. | **Sem catch/rollback local**: falha no meio pode deixar lote parcial, estado pendente e rejeicao fora do `try` final. | Caminho feliz coberto; falha parcial/replay e lacuna indispensavel. |

### 6.4 Planner de comandos: contas, dividas, faturas e metas

| Estado | Entrada/guard | Escrita/efeito | Falha/replay | Teste / lacuna |
|---|---|---|---|---|
| `awaiting_bill_payment_selection` | Seleciona conta recorrente ambigua. | Prepara pagamento. | Invalido repete. | Coberto. |
| `awaiting_bill_payment_method` | Debito/PIX/Dinheiro. | Vai para confirmacao. | Invalido repete. | Coberto. |
| `confirming_bill_payment` | Sim/nao/outro. | Registra saida/conta paga via write seguro e telemetria. | Operation key e replay; erro registra e e relancado apos limpar estado. | Coberto para route/canary/replay/cancelamento. Falta resposta amigavel garantida no erro relancado. |
| `awaiting_debt_payment_selection` | Divida ambigua no escopo. | Prepara pagamento. | Invalido repete. | Coberto. |
| `awaiting_debt_payment_amount` | Positivo e <= saldo. | Vai para confirmacao. | Invalido repete. | Coberto. |
| `confirming_debt_payment` | Sim/nao/outro. | Atualiza divida e plano/projecao, telemetria. | Operation key/replay; erro responde e limpa. | Coberto, inclusive adversarial e stale replay. |
| `awaiting_invoice_payment_selection` | Fatura ambigua. | Prepara pagamento. | Invalido repete. | Coberto. |
| `awaiting_invoice_payment_method` | Debito/PIX/Dinheiro; credito proibido. | Pode pedir conta financeira. | Invalido repete. | Coberto. |
| `awaiting_invoice_payment_financial_account` | Escolha da conta pagadora. | Vai para confirmacao. | Invalido repete. | Coberto. |
| `confirming_invoice_payment` | Sim/nao/outro. | Registra transferencia de pagamento sem duplicar gasto. | Operation key/replay; erro e relancado apos limpar. | Coberto; mesma lacuna de resposta no erro relancado. |
| `confirming_goal_movement` | Movimento ou status, sim/nao/outro. | Plano/projecao + meta/movimento, cache dirty. | Exige `shadowWritesAllowed`; operation key; erro responde e limpa. | Coberto para aporte, retirada, ajuste, status, familia e replay. |
| `awaiting_payment_amount` | Fluxo legado de pagamento de divida. | Valida propriedade/saldo; pode ir para confirmacao ou gravar legado. | Caminho sem shadow grava antes de confirmacao explicita; operation key. | Coberto no feliz e no shadow. Falta configuracao sem shadow + replay/falha de resposta. |
| `confirming_legacy_debt_payment` | Sim/nao/outro. | Atualiza divida e projecao. | Operation key/replay; limpa em finally. | Coberto. Nao marca read model/cache dirty no handler legado. |

### 6.5 Exclusao, manutencao, importacao e comprovantes

| Estado | Entrada/guard | Escrita/efeito | Falha/replay | Teste / lacuna |
|---|---|---|---|---|
| `confirming_delete` | Sim fuzzy apaga todos; numeros apagam selecao; nao cancela; outro cancela. Revalida apenas os indices/escopo guardados, nao o conteudo atual da linha. | `deleteRowsByIndices` agrupado por aba. | Google possui write ledger, mas o handler nao marca read model/cache dirty. | Coberto para cancelar, selecao, ultimo e ordem de limpeza. Falta linha alterada entre preview/delete e cache stale. |
| `confirming_batch_maintenance` | Sim/nao; preview opaco paralelo em memoria, TTL 15m; revalida linhas. | Atualiza lote completo; rollback no servico; dirty. | Restart perde preview e falha fechado; distingue stale, rolled back e uncertain. | `batchMaintenanceHandler`: 7/7. |
| `awaiting_statement_import_owner` | Escolhe membro autorizado da familia. | Define `person/userId` de destino. | Invalido repete; recuperavel de outra chave do mesmo usuario. | Coberto. |
| `awaiting_statement_import_date` | Data completa ou mes/ano. | Aplica fallback apenas onde falta data. | Invalido repete. | Coberto. |
| `awaiting_statement_import_kind` | Conta corrente ou cartao. | Conta: classifica/deduplica/recorrencia; cartao: filtra compras e pede cartao. | Tipo invalido repete; cartao sem compras encerra. | Coberto. |
| `awaiting_statement_recurring_income_classification` | Classifica salario/renda extra/movimento interno. | Reanota transacoes e vai ao preview. | Invalido repete. | Coberto. |
| `awaiting_statement_import_card_selection` | Cartao valido. | Monta competencia e preview. | Invalido repete. | Coberto. |
| `confirming_statement_import` | Sim grava; nao cancela; outro repete; comando novo explicito interrompe. | `Saidas`, `Entradas`, `Transferencias`, cartao; reconciliation shadow. | Chaves estaveis por item; erro limpa e responde. Possivel sucesso parcial e mensagem afirma apenas que nao reteve arquivo, nao rollback integral. | Cobertura feliz/dedup; falta falha no item N com prova do estado financeiro parcial e resposta exata. |
| `confirming_recurring_bill_suggestion` | Sim pede classificacao; nao encerra; outro repete. | Estado. | Sem TTL explicito. | Coberto. |
| `awaiting_recurring_bill_classification` | Parser de nome/categoria/regra. | Append em `Contas`. | Sem `try/catch` local e sem dirty/cache clear. | Feliz coberto; falha e cache nao. |
| `awaiting_financial_receipt_media` | Consumido pelo handler de comprovante **antes** do switch; aceita media ou cancelar. | Upload Drive e indice local de comprovantes; nao altera transacao. | Token opaco fica em `Map` por 15m; restart perde e falha fechado; valida evento novamente, hash duplicado e compensacao de upload. | `financialReceiptHandler`: 3/3. Falta download/upload exception no fluxo `get` e prova de resposta amigavel. |

### 6.6 Estados/caminhos sem caller produtivo

| Caminho | Evidencia de reachability | Risco/lacuna |
|---|---|---|
| `debtUpdateHandler.startDebtUpdate()` | Nenhum import produtivo encontrado; somente testes/auditoria documental. | Handler mutante pode atualizar saldo sem confirmacao quando ha match unico. Se chamado e ambiguo, cria `confirming_debt_update`, que nao existe no switch principal. Quarentena aparente, mas sem trava de build que impeça reintroducao acidental. |
| `debtUpdateHandler.confirmDebtUpdateSelection()` / `confirming_debt_update` | Exportado, sem caller produtivo. | Estado orfao engoliria mensagens pelo switch sem `default`. |
| `awaiting_daily_goal_scope` | Case existe; nenhum `setState` atual encontrado. | Compatibilidade morta/legada sem prova de remocao segura. |
| `resumo` | Nao e mais placeholder: constroi o mesmo resumo do dashboard, com planilha pessoal ou read model. | A descricao historica do projeto esta desatualizada; o caminho atual tem catch e cache. |

## 7. Rotas de novos comandos fora dos estados

| Rota | Branches/guards | Efeitos/respostas | Teste / lacuna |
|---|---|---|---|
| legal | `termos`, `privacidade`, politica. | Resumo/URLs e log contextual. | Teste unitario e state-machine. |
| lifecycle | `aceito` ja ativo, `inativar conta`, `excluir conta`. | Atualiza status; soft delete preserva historico. | `aceito` coberto; inativar/excluir nao tem teste direto nesta bateria e nao limpam estados/caches. |
| settings | Nome completo, check-in, relatorio, reserva, orcamento mensal e alias legado de meta diaria. | `UserProfile/UserSettings`; pode abrir estados. | Variacoes principais cobertas; excecoes de persistence ficam fora do catch final. |
| dashboard | Atual/v2; fallback visivel; token proprio e evento de acesso/legado. | Envia URL temporaria. | Unitarios existem; nao houve abertura real. Registro de auditoria falho depois do link enviado pode rejeitar o handler. |
| admin | Gate por `ADMIN_IDS`; leitura: ajuda/listar/stats/status bot/status usuario/log; mutacao: expirar, restart, convite, share/revoke, aprovar/negar, reset onboarding, mensagem, alterar status. | Mutacoes de usuario, Drive, mensagens, processo e logs. Operacoes de risco exigem frase exata em 5m. | Cobertura relevante de auth/confirmacao/envio/restart/status; varios subcomandos (share/revoke/deny/status changes) nao tem teste conversacional integral nesta frente. |
| comprovante | Anexar/buscar ultimo gasto/entrada/cartao; rollout fail-closed. | Drive + indice de comprovantes. | 3/3. |
| OCR | Media + verbo importar/ler/extrair + extrato/lancamentos; rollout. | Envia documento ao Gemini, apenas stage, depois usa importacao comum. | Servico OCR tem testes, mas o caller WhatsApp e a precedencia antes do rate/security nao tem teste integral. |
| exportacao | Verbo + alvo + periodo; uma origem; filtros categoria/conta; rollout. | Le tres fontes e envia XLSX como documento. | 4/4. |
| importacao | Qualquer media nao audio; CSV/OFX e XLS/XLSX sob rollout; unsupported fail-closed. | Download e parse antes do preview. | Fluxos principais cobertos. Download/parse exception antes de estado nao tem catch local. |
| meta | Parser deterministico de aporte/retirada/ajuste/status. | Preview+confirmacao quando shadow permitido; senao pode aplicar diretamente. | Cobertura ampla. Excecao do parser/preview esta fora do catch final. |
| manutencao em lote | Parser local antes do LLM; bloqueia campos criticos; exige preview/confirmacao. | Atualiza somente categoria/subcategoria/descricao/nota permitida. | 7/7. |
| greeting | Saudacoes isoladas. | Resposta estatica. | Unitario. |
| clarificacao de movimento interno | Pergunta de renda ambigua e interrompida antes de IA. | Resposta estatica. | State-machine. |
| planner de comandos | Apenas texto, se flag/usuario/operacao permitem: `bill.pay`, `debt.pay`, `invoice.pay`, `expense.create`. | Context tools, estados e telemetria. Falha cai para roteamento legado. | Cobertura extensa de route/canary/adversarial/replay. |
| classificador local | Perguntas, comandos ajuda/resumo e transacoes explicitas. | Evita Gemini. | Unit/state-machine extensos. |
| LLM mestre | Somente quando nenhum caminho anterior resolve; schema de 11 intents. | Gemini JSON; erros de quota/timeout recebem resposta. | Mocks cobrem roteamento; nao houve chamada real. Prompt inclui corpo integral e nome de uso, dentro do acesso ja autorizado. |

## 8. Intents finais e cadeia analitica

### 8.1 Intents do LLM mestre

| Intent | Destino | Efeito / guard | Prova e lacuna |
|---|---|---|---|
| `gasto` / `entrada` | valida valor, sanitiza campos, reliability gate, transferencia/cartao/conta/categoria, direto ou `confirming_transactions`. | Writes em Sheets/ledger; provenance e telemetria. | 103 testes de estado cobrem muitos ramos. Nao ha cobertura de todas as combinacoes entre modo reliability, origem LLM, conta e reply failure. |
| `pergunta` | classificador local ou `intentClassifier`; scope resolver; agente opcional; read model; fallback Sheets; resposta local ou `responseGenerator`. | Somente leitura, cache e checkpoint analitico sanitizado. | Unit/agent/exit gates extensos. Nesta frente nao foram reexecutados; fallback `intentClassifier` converte qualquer erro em `pergunta_geral`. |
| `resumo` | snapshot do dashboard. | Leitura e cache. | State/unit. |
| `criar_lembrete` | valida titulo/data e chama Calendar com user/WhatsApp. | Evento Google. | State-machine feliz; falta idempotencia/replay do lembrete e falha de Calendar detalhada. |
| `registrar_pagamento` | debt handler legado. | Le/atualiza divida; states descritos. | Cobertura parcial/integrada. |
| `apagar_item` | deletion handler. | Preview e delete. | Coberto. |
| `criar_divida` / `criar_meta` | creation handler. | Estados guiados. | Meta feliz; divida apenas helpers nesta bateria. |
| `ajuda` | texto estatico. | Nenhum write. | Coberto por interrupcao e detector local. |
| `desconhecido` / default | grava falha QA sanitizada e responde ajuda. | JSONL de QA. | Unitario de roteamento/log; falha do log pode impedir resposta porque esta dentro do `try`, mas sera capturada pelo catch fatal. |

### 8.2 Perguntas financeiras

1. contexto analitico anterior e carregado por chave separada/TTL 5m;
2. plano local cobre as capacidades conhecidas; se ausente, `intentClassifier` chama Gemini;
3. `financialQueryPlan` e normalizado e o escopo autorizado e aplicado fora do LLM;
4. bloqueio de escopo responde com mensagem de seguranca; ambiguidade pede esclarecimento;
5. agente financeiro so pode responder em modos/allowlists e com verificacao aprovada; planilha pessoal força fallback;
6. se fallback legado estiver desabilitado para o dominio, responde fail-closed;
7. read model e preferido; erro gera evento QA e fallback Sheets;
8. Sheets filtra cada dominio por IDs autorizados antes do calculo;
9. resposta local e preferida; `responseGenerator` atual e deterministico e nao envia rows crus ao Gemini;
10. resposta e cacheada e o contexto de follow-up e sanitizado/persistido.

Lacunas desta cadeia:

- `intentClassifier.classify()` presume string de `askLLM`; o objeto de erro provoca catch e vira genericamente `pergunta_geral`, sem distinguir quota/timeout ao usuario;
- o catch da pergunta tenta gravar QA antes de responder; se o proprio log QA falhar, a resposta de recuperacao pode ser perdida e subir ao catch fatal;
- cache e limpo por `markFinancialReadModelDirty`, mas alguns writers legados nao chamam esse wrapper (ver secao 10);
- nao ha prova neste pacote de que toda intent retornavel pelo classificador remoto tenha composer especifico; o default e deliberadamente generico.

## 9. Persistencia, falha, retry e replay

| Mecanismo | Caracterizacao | Lacuna |
|---|---|---|
| dedup de mensagem | Set em memoria por 5 minutos. | Nao sobrevive restart, nao e atomico durante audio e nao trata ID vazio. |
| state store | File atomico a cada 60s ou Redis; TTL quando caller fornece; SIGINT/SIGTERM flush. | Falha de flush apenas loga; nenhuma confirmacao ao usuario. Conteudo necessario sanitizado pode tornar retomada semanticamente invalida. |
| analytical checkpoint | Chave separada, TTL e sem rows crus. | Bom isolamento; cancelamento de write preserva checkpoint. |
| write ledger/operation key | Planner, importacao e camadas Google cobrem varios writes e replays. | Nem todo caller passa chave explicita; prova depende do contexto implicito. Falta bateria sistematica de crash em cada borda write/reply/state-delete. |
| pending maps | Admin, lote e comprovante usam Map em memoria. | Restart falha fechado, mas somente lote/comprovante explicam claramente a perda; admin diz que nao ha pendencia. |
| envio WhatsApp | Quase sempre `await`; sem retry/ack. | Se write confirma e reply falha, varios estados permanecem ou sao limpos de modo desigual. O usuario pode repetir sem saber o resultado. |
| backfill | Ordena e chama sequencialmente. | Uma mensagem que rejeita interrompe todas as seguintes. |

## 10. Lacunas indispensaveis priorizadas

### WCP-01 — critica — audio sai do dispositivo antes dos gates

`handleMessage` chama `handleAudio` antes de `isStatus`, `fromMe`, identidade, acesso, modo familiar, rate limit e filtro sensivel. Isso permite download, arquivo temporario e transmissao ao Gemini de audio que depois seria descartado/bloqueado. A bateria atual prova limpeza/log, nao a precedencia segura.

### WCP-02 — alta — excecoes fora do catch conversacional

O `try/catch` que responde “erro interno” cobre apenas novos comandos. Resolucao de acesso e todos os handlers especiais/estados podem rejeitar. O listener `client.on('message', handleMessage)` nao captura a Promise. Resultado possivel: `unhandledRejection`, ausencia de resposta e interrupcao do backfill.

### WCP-03 — alta — retomada persistida pode destruir dados necessarios

`sanitizeStateForPersistence` redige campos como descricao, body, text, titulo e observacoes. Muitos states dependem exatamente deles para confirmar, localizar ou escrever. A privacidade do snapshot esta testada, mas a retomada real file/Redis apos restart nao. O risco e gravar marcador redigido, falhar ou selecionar alvo incorreto.

### WCP-04 — alta — lote de cartao pode ficar parcialmente gravado

`awaiting_installments_batch` grava parcela por parcela sem catch/rollback local. Uma falha intermediaria rejeita fora do catch final, mantem estado e nao emite resultado confiavel. A cobertura existente prova apenas sucesso.

### WCP-05 — alta — estado desconhecido/orfao silencia a conversa

O switch nao tem `default`. Qualquer action antiga/corrompida — inclusive `confirming_debt_update`, se reintroduzida — faz o handler terminar sem resposta e sem limpar estado. Cancelar/ajuda sao as unicas saidas genericas.

### WCP-06 — alta — cache/read model nao e invalidado por todos os writers

Nao chamam `markFinancialReadModelDirty` de forma comprovada: criacao legada de meta/divida, pagamento de divida legado no handler auxiliar, exclusao, cadastro de conta recorrente e mudancas de settings que afetam consultas de orcamento. A camada Google invalida cache de leitura de planilha, mas nao necessariamente o cache de respostas `senderId:body` do message handler.

### WCP-07 — media/alta — write confirmado e resposta falha tem semantica desigual

Em alguns states a limpeza vem depois da resposta; em outros, `finally` limpa ate com erro; em outros o erro e relancado. Nao existe matriz de crash points `antes do write / depois do write / antes da reply / depois da reply / antes de deleteState` para todos os writes. O ledger reduz duplicacao, mas nao prova UX nem recuperacao uniforme.

### WCP-08 — media — rate limit e filtro sensivel nao cobrem toda a superficie

Media/comprovante/OCR/export/import/meta/settings/dashboard/admin/onboarding executam antes do rate limiter; OCR e audio tambem podem usar Gemini antes do filtro sensivel generico. Alguns possuem policies proprias, mas nao ha orcamento/limite comum por remetente para toda a entrada.

### WCP-09 — media — caminhos mortos mutantes permanecem compilaveis

`debtUpdateHandler` nao tem caller, mas exporta escrita de saldo sem confirmacao para match unico e produz estado sem consumer. Falta tripwire especifico que garanta “nenhum import produtivo” continuamente.

### WCP-10 — media — lacunas de erro em importacao e handlers de arquivo

Download/parse do statement import, download do comprovante no modo `get`, OCR caller e export handler podem rejeitar em bordas que nao tem catch no proprio nivel ou ficam fora do catch final. A bateria cobre erros de dominio selecionados, nao excecoes de I/O em toda borda.

## 11. Cobertura de testes observada

Bateria executada nesta frente: **134 testes, 134 verdes, 0 falhas**.

- `audioHandlerPrivacy.test.js`: 2;
- `onboardingState.test.js`: 8;
- `batchMaintenanceHandler.test.js`: 7;
- `financialExportHandler.test.js`: 4;
- `financialReceiptHandler.test.js`: 3;
- `whatsappReadyRescueService.test.js`: 3;
- `whatsappUnreadBackfillService.test.js`: 2;
- `rateLimiter.test.js`: 2;
- `financialStateMachine.test.js`: 103.

Tambem foram aprovados por `node --check` 19 arquivos produtivos auditados.

Testes existentes consultados, mas nao executados por exigirem escopo maior, dependencias ou ambiente real:

- `unit.test.js`: guards/admin/scope/cache/Google/analytics e diversos helpers;
- `functional.test.js` e `functionalHarness.js`: fluxo funcional com infraestrutura de teste;
- `whatsapp-real-e2e.test.js`: smoke real de onboarding, transacao, analytics e dashboard;
- suites do financial agent, planner e exit gates.

Nao executar o E2E real foi deliberado para cumprir a proibicao de producao, rede e dados reais. Portanto, os 134 verdes sustentam caracterizacao local, nao saude operacional do WhatsApp real.

## 12. Comandos de inspecao e teste

Inspecao estatica, sem rede:

```powershell
rg --files src tests
rg -n '^\s*case ' src/handlers/messageHandler.js
rg -n '^(async )?function |^const [A-Za-z0-9_]+\s*=\s*(async\s*)?\(' <arquivos auditados>
rg -n 'debtUpdateHandler|startDebtUpdate|confirmDebtUpdateSelection' . -g '!node_modules/**'
rg -n "stateMachineTest\('" tests/financialStateMachine.test.js
```

Bateria local isolada:

```powershell
node --test tests/audioHandlerPrivacy.test.js
node --test tests/onboardingState.test.js
node --test tests/batchMaintenanceHandler.test.js
node --test tests/financialExportHandler.test.js
node --test tests/financialReceiptHandler.test.js
node --test tests/whatsappReadyRescueService.test.js
node --test tests/whatsappUnreadBackfillService.test.js
node --test tests/rateLimiter.test.js
node --test tests/financialStateMachine.test.js
```

Sintaxe:

```powershell
node --check <cada um dos 19 arquivos produtivos auditados>
```

## 13. Gate de saida desta frente

Para transformar o `NO-GO` de conformidade desta superficie em candidato a `GO`, a evidencia minima e:

1. prova de que audio so e processado depois dos gates de mensagem/identidade/acesso e de que falha de transcricao nao reentra como texto normal;
2. boundary unico que capture rejeicoes de todo handler e permita ao backfill continuar por mensagem;
3. teste de restart file/Redis para cada classe de state, demonstrando retomada valida ou cancelamento fail-closed sem usar conteudo redigido como dado financeiro;
4. crash/replay matrix para todos os writes conversacionais, com foco no lote de cartao e na borda write/reply/state cleanup;
5. default fail-closed para action desconhecida e tripwire dos handlers mortos;
6. invalidacao comprovada de cache/read model apos todo writer relevante;
7. bateria de excecoes de I/O dos handlers de media/arquivo;
8. somente depois, E2E real controlado do WhatsApp para confirmar a composicao — fora da autorizacao desta frente.

Nenhum item acima autoriza correcao, deploy ou teste real automaticamente.
