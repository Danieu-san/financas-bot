# Inventário de estados e durabilidade

Objeto: tree `363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.

## Estado conversacional

`userStateManager` mantém um `Map` em memória e persiste snapshots a cada 60
segundos em `state_store.json`, com fallback opcional para Redis. Foram
catalogados estados de orçamento, meta diária, pagamentos, recebimentos,
cartões, parcelas, transferências, faturas, dívidas, contas, criação de
meta/dívida, exclusão, lote, importação, comprovante, OCR e onboarding.

O snapshot usa arquivo temporário e rename atômico. Campos textuais conhecidos
como descrição, observação, mensagem e título são substituídos por hash curto.
Ainda permanecem no arquivo:

- chaves de remetente/user state;
- valores, datas, conta/cartão, pessoa, filename e classificações;
- arrays e metadados cujas chaves não constam na denylist.

Não há `chmod` explícito na criação do arquivo. A confidencialidade depende do
usuário do processo e de `umask` operacional.

## Estado apenas em memória

| Estado | Retenção | Comportamento no restart |
| --- | --- | --- |
| `processedMessages` | 5 min | perde deduplicação recente |
| pending admin confirmations | 5 min | falha fechado; confirmação some |
| pending receipt event | 15 min | chave persistida fica órfã e fluxo expira sem salvar |
| cache analítico | 5 min | perde cache, sem perda financeira |
| contexto analítico | via state manager | persiste sanitizado |
| IDs de eventos já notificados | até limpeza/restart | pode repetir lembrete após restart |
| locks Open Finance de ciclo | duração do processo/ciclo | reinício impede sobreposição antiga, mas recomeça timer |

## Estado durável principal

| Store | Conteúdo | Proteção observada | Backup/restore |
| --- | --- | --- | --- |
| Google Sheets por usuário/central | fatos financeiros e cadastro | OAuth + `user_id` | responsabilidade Google; sem restore unificado local |
| OAuth SQLite | tokens cifrados, conta/planilha e shares | AES-GCM; metadados em claro | sem gate de backup/restore localizado nesta rodada |
| read-model SQLite | projeção de leitura | escopo por usuário | reconstruível da fonte |
| financial write ledger | operation keys e recibos | local | reconcilia append/update/delete incertos |
| canonical ledger shadow | eventos/projeções | flags e recibos | gates próprios históricos |
| projected plans | identidades/versões/movimentos | operation key | gates próprios |
| receipts SQLite + Drive | vínculo e arquivo | hash, escopo e revalidação | compensação de upload parcial |
| Open Finance: vault/baseline/outbox/journal/preview | dados cifrados e lifecycle | segredo + DBs privados no EC2 | pacote v3 de quatro DBs; journal separado |
| JSONL admin/dashboard/QA/telemetria | eventos sanitizados | hash/sanitização | sem retenção unificada demonstrada |

## Achados de estado

### STATE-01 — P1 — não existe serialização por remetente

O listener do WhatsApp registra `handleMessage` diretamente. O EventEmitter não
aguarda a Promise retornada e não há fila/mutex por remetente. Duas mensagens
diferentes podem ler o mesmo estado e executar confirmações simultaneamente.
As operation keys protegem replay do mesmo `messageId`, mas mensagens distintas
geram chaves distintas.

Impacto: duas respostas rápidas ou entrega concorrente podem produzir duas
mutações válidas a partir da mesma confirmação, sobrescrever estado ou avançar
etapas fora de ordem. Evidência: `CODE`; falta prova concorrente (`GAP`).

### STATE-02 — P1 — deduplicação de áudio começa tarde

O ID de áudio só entra em `processedMessages` depois de download, conversão e
transcrição. Duas entregas concorrentes do mesmo áudio podem consumir Gemini e
seguir o roteamento duas vezes. Evidência: `CODE`; sem teste concorrente.

### STATE-03 — P2 — encerramento Redis não é aguardado

`closeStateStore` dispara `flushStateToRedis().finally(...)` com `void`, e o
handler de sinal não prolonga explicitamente o processo até flush/quit. Existe
janela de perda do último minuto de estado conversacional. O fallback em arquivo
é síncrono e não tem essa mesma janela.

### STATE-04 — P2 — política de proteção do snapshot é parcial

O teste atual prova apenas que descrição/mensagem brutas são redigidas e aceita
valor financeiro e identificador no snapshot. Não há teste de modo do arquivo,
inventário completo de chaves sensíveis ou retenção. A situação operacional do
arquivo será conferida de forma sanitizada no fechamento da auditoria.
