# Quality, Stability and Retention Contract v0

Estado: `FROZEN FOR NEXT-00`
Versão: `0.1.0`
Escopo: avaliação, beta, cutover, rollback, backup e ciclo de vida dos dados

## 1. Princípio

“Melhor”, “estável” e “pronto” significam atingir os limiares abaixo antes da
decisão. Métrica não pode ser criada ou afrouxada depois do teste que ela julga.
Qualquer violação de severidade crítica reinicia a janela aplicável após a
correção auditada.

## 2. Unidades de medição

- `claim`: fato quantitativo/material com entidade, período, unidade e coverage.
- `conversation`: turno inicial e follow-ups até conclusão/abandono de objetivo.
- `effect`: operação externa com operation/idempotency key.
- `logical_notification`: mensagem de negócio, independente de tentativas de
  transporte.
- `capability_window`: período contínuo em que a mesma versão/manifest/policy
  esteve ativa.

Mudança causal em kernel, source policy, proposal, writer, lease, tool budget ou
Model Boundary zera apenas a janela das capabilities afetadas.

## 3. Qualidade funcional

### Gates locais e Golden Set

| Métrica | Limiar |
|---|---:|
| invariantes críticos de kernel/authority/security | 100% |
| assertions factuais do Golden Set | 100% |
| conversas sem erro material | 100% |
| rubrica de clareza/ utilidade não material | >=95% |
| dimensões críticas com cobertura mínima | >=3 casos cada |
| falso zero/empty com coverage insuficiente | 0 |
| writer sem confirmação válida | 0 |
| proposta expirada/superseded aceita | 0 |
| vazamento cross-family/ID/secret | 0 |

O Golden Set v1 tem 48 conversas: 16 simples, 16 multi-tool, 8 follow-ups e 8
negativas. Falha material em uma conversa impede GO; nota de estilo pode entrar
na margem de 5% se fato, scope, coverage e ação permanecerem corretos.

### Shadow/beta

| Métrica | Limiar |
|---|---:|
| divergência factual material por claim | 0.0% |
| divergência apenas de apresentação | <=1.0% |
| claims sem coverage/evidence completa | 0 entregues como conclusivos |
| clarificação redundante | <=5.0% das conversas |
| budget exhausted com resposta incorreta | 0 |
| resposta de insuficiência correta quando exigida | 100% |
| dashboard/WhatsApp com fingerprint divergente | 0.0% |

Comparação exige mesma pergunta, scope, source policy, time basis e snapshot de
observações. Diferença textual não é divergência se claims/fingerprints forem
iguais.

## 4. Efeitos, exactly-once lógico e reconciliação

| Métrica | Limiar |
|---|---:|
| evento econômico duplicado | 0 |
| logical notification duplicada | 0 |
| cursor perdido/retrocedido | 0 |
| stale epoch produz efeito | 0 |
| confirmação ligada à proposta errada | 0 |
| effects com receipt/idempotency ausente | 0 |
| effects reconciliados em até 15 min | >=99.9% |
| effects reconciliados em até 24 h | 100% |
| `uncertain` reexecutado antes de reconcile | 0 |

Uma capability com `uncertain` ainda aberto após 24 horas perde GO operacional e
seu lease de novos efeitos é suspenso até diagnóstico.

## 5. Latência e custo

Medição começa quando o gateway aceita o turno e termina quando a resposta está
pronta para transporte. Tempo de fila do WhatsApp é medido separadamente.

| Fluxo | p50 | p95 | hard timeout |
|---|---:|---:|---:|
| pergunta simples read-only | <=4 s | <=10 s | 30 s |
| investigação multi-tool | <=8 s | <=20 s | 30 s |
| follow-up com cache/evidência vigente | <=3 s | <=8 s | 20 s |
| dashboard snapshot | <=1.5 s | <=3 s | 5 s |
| prepare + preview de writer | <=5 s | <=12 s | 20 s |
| commit até receipt/reconcile síncrono | <=8 s | <=20 s | 20 s; depois `uncertain` |

Custo é normalizado em USD pela tabela do provider registrada na data da
execução, mesmo quando o tier efetivo é gratuito:

| Métrica | Limiar |
|---|---:|
| custo p50 por conversa | <=US$0.01 |
| custo p95 por conversa | <=US$0.03 |
| teto por conversa | <=US$0.05 |
| custo não atribuível/indisponível | 0 conversas usadas como evidência |

Ultrapassar o teto bloqueia novas model calls no turno; não autoriza provider
mais barato não aprovado.

## 6. Disponibilidade e janelas

### Beta read-only

- 7 dias consecutivos na mesma versão causal;
- mínimo de 200 conversas e 500 claims comparáveis;
- disponibilidade do gateway >=99.5%;
- todos os limiares das seções 3 e 5 cumpridos;
- zero incidente crítico/alto aberto.

Se o volume mínimo não ocorrer em 7 dias, a janela continua até atingi-lo; o
tempo sozinho não concede GO.

### Capability com efeito

- 14 dias consecutivos;
- mínimo de 30 operações controladas: pelo menos 10 canários no destino real
  autorizado e 20 casos de fault injection/replay;
- 100% dos testes de state machine/fencing;
- limiares da seção 4 cumpridos;
- dois drills de rollback consecutivos verdes.

### Cutover do WhatsApp principal

- 14 dias consecutivos do conjunto de capabilities classes 1 e 2;
- mínimo de 500 conversas, 1.000 claims e 100 efeitos agregados;
- ao menos 10 operações controladas por capability effectful necessária;
- disponibilidade >=99.9%;
- zero incidente crítico/alto aberto;
- paridade dashboard/WhatsApp e backlog/cursor reconciliados;
- rollback completo ensaiado nas últimas 72 horas.

## 7. Lease, scheduler e cursor

- lease TTL: 60 segundos;
- renovação: a cada 20 segundos;
- após uma renovação falhar, não iniciar nova operação;
- safety cutoff: 40 segundos após a última renovação bem-sucedida;
- tolerância máxima de clock observada: 5 segundos;
- cursor checkpoint: após cada lote e no máximo a cada 30 segundos;
- job scheduler heartbeat: 20 segundos;
- delivery claim timeout: 60 segundos.

O lease store fornece a hora autoritativa. Rollback/reacquisition sempre emite
epoch superior.

## 8. RPO, RTO e rollback

| Objeto | RPO | RTO |
|---|---:|---:|
| ledger/eventos/propostas/write ledger | <=5 min | <=60 min |
| cursor/outbox/delivery ledger | <=5 min | <=30 min |
| read models/projeções reproduzíveis | <=24 h | <=4 h |
| rollback de uma capability | não perde effect reconciliado | <=15 min |
| rollback do WhatsApp principal | não copia sessão entre runtimes ativos | <=30 min |
| restore completo do ambiente Next | <=5 min para autoridade; projeções reproduzidas | <=4 h |

Procedimento de rollback:

1. suspender novas claims da capability;
2. reconciliar `pending/uncertain` até o timeout do runbook;
3. checkpoint de cursor/outbox e backup consistente;
4. revogar lease atual;
5. emitir lease/epoch superior ao owner anterior;
6. validar health e um smoke sintético/read-only;
7. reprocessar projeções, nunca effects já reconciliados;
8. registrar hash, tempos e divergências.

Rollback falha se restaurar epoch, reabrir item terminal, perder tombstone,
duplicar efeito ou exceder RTO. Dois drills verdes são obrigatórios antes de
beta effectful/cutover.

## 9. Backup e restore

- backup consistente da autoridade a cada 24 horas;
- cobertura incremental/WAL/checkpoint suficiente para RPO de 5 minutos;
- retenção rolling de backups: 35 dias;
- criptografia em repouso e trânsito;
- acesso somente por runtime/operador autorizado, auditado;
- teste automatizado de integridade em cada backup;
- restore isolado semanal e antes de promoção/cutover;
- comparação de contagem, fingerprints, links e tombstones;
- restore nunca expõe dados antes de reaplicar tombstone/reversal registry.

Backup não contém secrets, sessão WhatsApp, caches do modelo ou raw payloads
temporários. Export do usuário é artefato separado.

## 10. Retenção

| Classe | Retenção |
|---|---|
| contexto conversacional operacional | 24 h após última atividade |
| proposta ativa | TTL de 10 min; máximo 30 min |
| payload de proposta cancelada/rejeitada/expirada | apagar em até 24 h |
| payload/receipt de proposta reconciliada | enquanto a conta estiver ativa; sujeito a delete/export |
| raw payload de provider | não persistir; quarantine cifrada de falha <=24 h |
| transcript/áudio temporário | apagar em até 24 h |
| export temporário/cache de comprovante | apagar em até 24 h |
| traces operacionais sanitizados | 30 dias |
| auditoria de segurança/ownership sanitizada | 180 dias |
| OAuth attempt | 7 dias |
| revocation journal sanitizado | 30 dias |
| backups cifrados | 35 dias |
| conteúdo financeiro normalizado | enquanto conta ativa ou até pedido de exclusão |

Pedido de exclusão remove conteúdo em até 30 dias. Durante essa janela, acesso
normal fica bloqueado. Depois da purga, permanece somente tombstone não
reversível e sem conteúdo por 90 dias para impedir replay/restore; então ele é
apagado, salvo obrigação legal documentada e informada ao titular.

Provider de modelo mantém treinamento desabilitado e retenção de conteúdo de no
máximo 30 dias, conforme Model Data Boundary. Retenção desconhecida bloqueia o
provider.

## 11. Delete, tombstone e restore

- Draft nunca confirmado pode sofrer hard delete.
- Evento reconciliado ou com efeito externo usa tombstone/reversal.
- Correção cria nova versão; não reescreve histórico.
- Hard delete por obrigação legal exige audit event sem conteúdo e confirmação
  de escopo.
- Restore reaplica todos os tombstones/reversals mais novos que o backup antes
  de liberar leitura.
- Projeção restaurada é regenerada do ledger, não vira observação.

## 12. Severidade e reset de janela

- `CRITICAL`: write não autorizado, vazamento cross-family/secret, perda ou
  duplicação material. Suspende capability e reinicia janela completa.
- `HIGH`: fato financeiro material incorreto, stale proposal, rollback/RTO
  falho. Suspende promoção e reinicia janela afetada.
- `MEDIUM`: insuficiência/clarificação/latência fora do limiar sem fato errado.
  Exige correção; reinicia métricas afetadas, não toda a janela.
- `LOW`: apresentação sem impacto factual. Entra na rubrica de 95%.

## 13. Testes obrigatórios

| ID | Prova |
|---|---|
| QS-01 | 48/48 conversas sem erro material e críticos 100% |
| QS-02 | falso zero e factual divergence material 0 |
| QS-03 | p50/p95 calculados por classe, sem misturar transporte |
| QS-04 | custo atribuído em 100% da evidência |
| QS-05 | 7/14 dias e volumes mínimos, sem GO por tempo vazio |
| QS-06 | lease expirado/stale epoch sem efeito |
| QS-07 | dois rollback drills dentro do RTO |
| QS-08 | backup corrompido rejeitado |
| QS-09 | restore preserva tombstone e não repete receipt |
| QS-10 | delete purga conteúdo e backups expiram em 35 dias |
| QS-11 | trace de 30 dias e audit de 180 sem conteúdo bruto |
| QS-12 | provider com retenção desconhecida bloqueado |
| QS-13 | `uncertain` não reexecuta e fecha em até 24 h |
| QS-14 | dashboard/WhatsApp usam mesmo claim fingerprint |

## 14. Mudança de limiar

Qualquer alteração exige versão nova, justificativa causal e auditoria antes de
nova evidência. Resultado já observado não pode ser reclassificado pelo novo
limiar. Tornar limiar mais rígido preserva evidência anterior apenas se ela já o
satisfazia; afrouxar exige decisão explícita de Daniel e reauditoria.
