# AGENTS.md — Mapa do Projeto: FinancasBot

## Visão Geral
Bot de WhatsApp para controle financeiro pessoal. Usa **whatsapp-web.js** (via Puppeteer), **Gemini 2.5 Flash** como LLM e **Google Sheets/Calendar** como banco de dados.

## Memória Operacional do Agente
Antes de trabalhos não triviais, leia primeiro `docs/agent-memory/README.md`.

Essa pasta é a memória curta e atualizável do projeto. Ela evita reler o histórico inteiro e aponta quais documentos/códigos consultar por tarefa. Não substitui validação em código, testes, logs ou EC2 quando a tarefa envolver produção.

## Contrato Obrigatório de Comunicação e Capacidade

Antes de iniciar ou retomar qualquer tarefa, a primeira atualização visível ao
usuário deve conter exatamente esta estrutura:

`Superfície → Modelo → Esforço → Próxima tarefa`

Exemplo: `Codex → Sol → Alto → corrigir e revalidar o gate 4D.`

Essa linha deve ser repetida quando uma resposta do usuário abrir a próxima
ação material, mesmo que modelo e esforço não tenham mudado. Não basta informar
apenas o próximo passo.

Antes de enviar toda resposta final ou handoff, executar esta conferência:

1. **Resultado:** o que foi concluído, falhou ou permanece aguardando validação.
2. **Inteligência da decisão:** o que a evidência significa e por que o próximo
   passo é o correto, sem apenas despejar contagens de testes.
3. **Capacidade recomendada:** repetir `Superfície → Modelo → Esforço → Próxima
   tarefa` para a ação seguinte.
4. **Próximo passo:** fornecer a ação concreta, as perguntas exatas ou o gate
   que precisa ser satisfeito.

Se qualquer um dos quatro itens estiver ausente, a resposta ainda não está
pronta para ser enviada. Em testes manuais de WhatsApp, informar também o que
cada pergunta valida e qual resultado é esperado. Esta trava é obrigatória
mesmo em respostas curtas e mesmo quando a única ação seguinte depende de
Daniel.

## Controle de Esforco
Antes de iniciar cada nova tarefa de implementacao, diagnostico, teste, deploy ou revisao substancial, informar a proxima acao e o nivel de esforco recomendado. Parar e aguardar a confirmacao explicita do usuario para que ele possa trocar modelo ou nivel, quando desejar.

Durante uma tarefa, reavaliar o esforco em cada ponto de decisao relevante. Se o nivel atual se mostrar insuficiente ou excessivo, parar antes da proxima acao material, explicar brevemente o motivo e solicitar a troca. Nao elevar, reduzir ou trocar modelo/esforco automaticamente.

Excecao: somente continuar sem pausa quando o usuario tiver autorizado expressamente uma sequencia de acoes com o mesmo nivel de esforco, ou em incidente urgente cuja continuidade tenha sido autorizada de forma explicita.

## Delegacao para Chat
Sempre que uma tarefa puder ser executada no Chat comum sem acesso ao repositorio, terminal, arquivos locais, testes, GitHub ou producao, recomendar o esforco adequado, fornecer um prompt pronto para uso e parar para aguardar a resposta do usuario. Isso inclui analise, pesquisa, revisao logica, brainstorming, comparacao de alternativas, auditoria documental e redacao.

Usar Codex diretamente somente quando a proxima acao exigir inspecao ou alteracao do repositorio, execucao de comandos/testes, leitura de logs privados, GitHub, EC2, WhatsApp, Google Sheets ou outra ferramenta local/externa. Depois que o usuario trouxer a resposta do Chat, reavaliar o esforco antes de continuar.

## Diretriz Legal/Privacidade Crítica
**Antes de escalar para multiusuário real, remover o acesso admin a gastos de todos os usuários.**

O dashboard admin com seletor `Todos os usuários` existe apenas como exceção temporária de beta/testes para diagnosticar dados presos em usuários de teste. Em produção/multiusuário, administradores não devem ter acesso amplo a lançamentos financeiros individuais por questões legais, LGPD e privacidade.

Qualquer trabalho em dashboard, admin, permissões, multiusuário ou launch deve consultar `docs/decisions/ADR-002-admin-financial-data-access.md` e o checklist de release antes de seguir.

**Administração:**
- Apenas números presentes em `ADMIN_IDS` têm privilégio de admin.
- Em produção/beta atual, `ADMIN_IDS` deve conter apenas Daniel.
- O número da Thaís deve ser tratado como usuário comum/de teste, sem privilégio administrativo.
- Cartões/abas com nome "Thaís" podem continuar existindo como dados financeiros/cartões; isso não concede permissão admin.

**Fluxo multiusuário aprovado:**
- Novo usuário envia mensagem → recebe termos → responde `ACEITO`.
- Após `ACEITO`, o status vira `PENDING_APPROVAL`; o admin é notificado.
- Admin libera com `admin aprovar <telefone>`.
- Usuário aprovado fica em `APPROVED_AWAITING_GOOGLE` até conectar Google.
- Sem conexão Google concluída, o usuário não deve usar fluxos financeiros.
- A planilha financeira final deve ser criada no Drive do próprio usuário.
- Importação de extrato começa apenas com CSV/OFX; PDF/imagem ficam fora do MVP.

---

## Estrutura de Arquivos

```
index.js                          → Entry point. Inicializa Google → WhatsApp → scheduler
src/
  config/constants.js             → userMap, sheetCategoryMap, creditCardConfig (4 cartões)
  services/
    whatsapp.js                   → Cliente WhatsApp singleton, eventos qr/ready/disconnected
    google.js                     → Google Sheets + Calendar (auth via refresh_token no .env); funções: appendRowToSheet, readDataFromSheet, deleteRowsByIndices, getSheetIds, ensureSpreadsheetStructure, createCalendarEvent
    gemini.js                     → Chamadas à API Gemini (callGemini, askLLM, getStructuredResponseFromLLM, transcribeAudio)
    analysisService.js            → Funções de análise de dados da planilha (filter/total/avg/min-max)
    calculationOrchestrator.js    → Orquestra análises por intent (total/média/lista/saldo etc.)
  handlers/
    messageHandler.js             → Handler principal. Máquina de estados + roteamento de intents
    audioHandler.js               → Recebe áudio ptt/audio, transcreve via Gemini
    creationHandler.js            → Fluxo de criação de metas e dívidas
    deletionHandler.js            → Fluxo de exclusão de itens
    debtHandler.js                → Fluxo de registro de pagamento de dívidas
  ai/
    geminiClient.js               → Re-export de askLLM (wrapper simples)
    intentClassifier.js           → Classifica perguntas analíticas em intents específicos
    responseGenerator.js          → Gera resposta final em linguagem natural para perguntas
  state/
    userStateManager.js           → Gerencia estado de conversas multi-etapa (objeto em memória)
  utils/
    helpers.js                    → parseValue, parseSheetDate, normalizeText, parseAmount, parseDate, getFormattedDateOnly
    cache.js                      → Cache em memória (node-cache)
    rateLimiter.js                → Rate limit por userId
    adminCheck.js                 → Verifica se userId está em ADMIN_IDS
  jobs/
    scheduler.js                  → Cron jobs: resumo matinal (7h), resumo noturno (20h), lembretes de contas
```

---

## Fluxo Principal de Mensagem (messageHandler.js)

1. **Deduplicação** por `msg.id.id` (Set com TTL 5 min)
2. **Áudio** → transcreve via Gemini antes de processar
3. **Rate limit** check
4. **Cache** check (retorna resposta cacheada se existir)
5. **Máquina de estados**: se usuário tem estado ativo (`userStateManager`), roteia para o handler do estado
6. **Nova mensagem**: envia ao Gemini com `MASTER_SCHEMA` → retorna intent estruturada
7. **Roteamento por intent**: gasto/entrada → confirma → pergunta método pagamento → salva

---

## Intents do MASTER_SCHEMA

| Intent | Ação |
|---|---|
| `gasto` / `entrada` | Confirma transação → pergunta pagamento/recebimento → salva na planilha |
| `pergunta` | Lê planilhas → classify() → execute() → generate() |
| `apagar_item` | `deletionHandler` |
| `criar_divida` | `creationHandler` |
| `criar_meta` | `creationHandler` |
| `registrar_pagamento` | `debtHandler` |
| `criar_lembrete` | `createCalendarEvent()` |
| `resumo` | (parcialmente implementado — apenas reply de placeholder) |
| `ajuda` | Mensagem de ajuda estática |

---

## Estados de Conversa (userStateManager)

- `awaiting_payment_method` → pergunta Débito/Crédito/PIX/Dinheiro
- `awaiting_receipt_method` → pergunta onde recebeu entrada
- `awaiting_credit_card_selection` → pergunta qual cartão (single item)
- `awaiting_installment_number` → pergunta nº de parcelas (single item)
- `confirming_transactions` → confirmação de lote (sim/não)
- `awaiting_batch_payment_method` → método de pagamento para lote
- `awaiting_credit_card_selection_batch` → cartão para lote
- `awaiting_installments_batch` → parcelas para lote (aceita texto livre → IA mapeia)
- `creating_goal` / `creating_debt` → fluxo multi-etapa
- `awaiting_payment_amount` → valor do pagamento de dívida
- `confirming_delete` → confirmação de exclusão

---

## Google Sheets — Estrutura das Abas

| Aba | Colunas principais |
|---|---|
| Saídas | Data, Descrição, Categoria, Subcategoria, Valor, Responsável, Pagamento, Recorrente, Obs |
| Entradas | Data, Descrição, Categoria, Valor, Responsável, Recebimento, Recorrente, Obs |
| Dívidas | Nome, Credor, Tipo, Valor Original, Saldo Atual, Parcela... |
| Metas | Nome, Valor Alvo, Valor Atual, % Progresso... |
| Cartão Nubank - Daniel | Data, Descrição, Categoria, Valor Parcela, Parcela, Mês de Cobrança |
| Cartão Nubank - Thais | idem |
| Cartão Nubank - Cristina | idem |
| Cartão Atacadão | idem |

---

## Cartões de Crédito (creditCardConfig)

| Chave | Aba na planilha | Fechamento |
|---|---|---|
| `nubank daniel` | Cartão Nubank - Daniel | dia 8 |
| `nubank thais` | Cartão Nubank - Thais | dia 29 |
| `nubank cristina` | Cartão Nubank - Cristina | dia 11 |
| `atacadao` | Cartão Atacadão | dia 8 |

---

## Variáveis de Ambiente (.env)

```
SPREADSHEET_ID
GEMINI_API_KEY
GOOGLE_REFRESH_TOKEN
ADMIN_IDS          # IDs separados por vírgula
```
Auth Google: usa `credentials.json` + `refresh_token` (sem fluxo OAuth interativo).

---

## Cron Jobs (scheduler.js)

- **07:00** → `sendMorningSummary()` (dívidas próximas 7 dias) + `checkUpcomingBills()` + limpa `notifiedEventIds`
- **20:00** → `sendEveningSummary()` (agenda do dia seguinte)
- Envia para os dois usuários (Daniel + Thaís)

---

## Notas Técnicas Importantes

- `whatsapp-web.js` instalado direto do GitHub (`github:pedroslopez/whatsapp-web.js#main`) — precisa rodar `npm install` periodicamente para atualizar quando WhatsApp muda o protocolo Web (causa LOGOUT imediato se desatualizado)
- Sessão salva em `.wwebjs_auth/` — deletar força novo QR
- `client.on('ready')` em whatsapp.js + `client.once('ready')` em index.js são **dois listeners separados** (normal)
- `processedMessages` Set em memória — reinicia ao reiniciar o bot
- `userStateManager` também em memória — estados perdem ao reiniciar
- Gemini model: `gemini-2.5-flash` para tudo (texto e transcrição de áudio)
