# Estado atual portátil do FinancasBot

Atualizado em: 2026-07-30

## Objetivo ativo

A fila original da auditoria exaustiva e os gates `9P.0`, `9P.1`, `9P.2` e
`9P.3` estão tecnicamente encerrados. 9P.3 recebeu `GO TÉCNICO LOCAL`
independente no commit imutável
`f8a1e9f41eee3c904f0de69ae465219ef874212d`, sem achado residual e com
`financial_writes=0`.

O objetivo ativo seguinte é fechar por auditoria independente a correção da
perda silenciosa de liveness da sessão WhatsApp/Puppeteer observada em produção
Oracle em 2026-07-30.
PM2, Google, read-model e `/dashboard/health` permaneceram verdes enquanto
operações do WhatsApp acumulavam `Runtime.callFunctionOn timed out`; não houve
recuperação automática. O candidato local OPS-02 agora possui monitor
single-flight pós-`ready`, timeout e limiar de duas falhas, recuperação única
pelo supervisor, health composto SQLite/WhatsApp e retry limitado do backfill.
9P.4 permanece não autorizado até o fechamento desse incidente.

## Workspace vigente

Raiz recuperada:
`C:\Users\Administrador\Documents\FinancasBot\financas-bot`.
Branch ativa: `codex/whatsapp-liveness-recovery`; base:
`43c4555f534421aa87fee6ccc97d242d80a1744c`. O hash do candidato OPS-02 será
registrado depois do commit sanitizado.

O SSD portátil anterior foi perdido e não é mais a raiz canônica. A produção
vigente é Oracle/OCI e permanece separada deste gate; o código 9P.3 não foi
deployado.

9P.2 recebeu `GO TÉCNICO LOCAL` no hash
`b52b7879fd5a795a436b4f6332294052732ebe7a`. A reauditoria fechou o único
`MEDIUM` do primeiro candidato: apenas `delivered_confirmed` habilita resposta;
`accepted_unconfirmed` continua at-most-once e inelegível. Severidades finais:
`CRITICAL 0`, `HIGH 0`, `MEDIUM 0`, `LOW 0`.

O primeiro candidato 9P.3
`c452b9b999a6caf6af62696b5c8927ec5970c1f2` recebeu `NO-GO` independente por
três achados `MEDIUM`. As correções locais agora:

- terminalizam ou reconciliam revisão `prepared` depois de recusa/cancelamento;
- negam linhas de categoria/conta sem `user_id` familiar explícito e exigem
  leitura user-scoped das cinco fontes;
- provam a queda exata depois de `accepted` e antes da ativação, com restart e
  retomada pela rota de produto;
- recuperam a revisão aceita/preparada pela entrada pública mesmo quando o
  snapshot auxiliar restaurado ainda aponta para confirmação.

Cartões continuam compartilhados somente dentro da planilha familiar
autorizada, coerente com o uso privado pelo casal. Não há ampliação
multiusuário.

Evidência pós-NO-GO: RED `17/19`; GREEN focal `20/20`; causal `150/150`; toda a
bateria Open Finance `259/259`; máquina de estados e entrada pública `122/122`.
O runner hermético definitivo teve `1.305/1.310`, zero falhas e cinco skips
funcionais previstos; cobertura de linhas `90,18%`, branches `72,27%` e
funções `90,03%`.

O candidato corrigido foi publicado no hash
`f8a1e9f41eee3c904f0de69ae465219ef874212d`. A revisão manual final no Chat
confirmou o hash e os arquivos, encerrou M1, M2 e M3, registrou `CRITICAL 0`,
`HIGH 0`, `MEDIUM 0`, `LOW 0` e não identificou lacuna indispensável residual.
O fechamento está em
`docs/audit/60-open-finance-save-proposal-guided-review-independent-close-2026-07-30.md`.

Alterações intencionais: produto, testes, plano e manifesto de 9P.3.
Não executar fase 8, produção, Oracle/AWS, cofre Pluggy ou integrações reais.

Não houve transporte WhatsApp real, escrita financeira, produção, Google ou
Pluggy real.

## Último gate encerrado

`9P.3` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`f8a1e9f41eee3c904f0de69ae465219ef874212d`. O fechamento autoriza somente a
revisão guiada local e durável da proposta aceita, preservando
`financial_writes=0`; não autoriza 9P.4, revalidação final, writer, integração
real ou produção.

O parecer foi estático e não executou os testes. A evidência local publicada
permanece: focal `20/20`, causal `150/150`, Open Finance `259/259`, entrada
pública/máquina de estados `122/122` e runner hermético `1.305/1.310`, com
zero falhas e cinco skips previstos.

## Gate encerrado anterior — STATE-03

`STATE-03` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`e341d4feae5b6ecba8990a226f386e11cb18d027`; o fechamento documental foi
publicado em `f8d124f785f89479642fbf4847a9f4c3860a268d`.

Os seis jobs gerais do scheduler usam outbox SQLite cifrado e privado, com
deduplicação durável, retry limitado, lease, retenção e isolamento por usuário.
Falha posterior a transporte resolvido não reabre retry e expira para
`accepted_unconfirmed`.

Evidência: focados `42/42`; afetados `46/46`; gate exaustivo `1.256/1.261`,
zero falhas e cinco skips previstos; controles locais verdes. O Chat confirmou
o fechamento do `HIGH` inicial e deixou somente dois achados `LOW`
composicionais.

Não houve produção, Google, WhatsApp ou dado real nem deploy.

## Gate encerrado anterior — FLOW-02

`FLOW-02` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`73abb5e575f0af8cf36f826c5646e2843a1997a5`.

O rate limit agora antecede comprovantes, OCR, exportação, importação e
gerenciamento de metas. Áudio continua consumindo um limite antes da
transcrição, e as exceções operacionais preexistentes não saltam para os cinco
handlers.

Evidência executada: RED causal; prova `1/1`; handler completo `121/121`;
módulos afetados `56/56`; sintaxe, diff e workflow verdes. O gate exaustivo
válido teve `1.240/1.246` aprovações, uma falha não reproduzida em domínio não
alterado e cinco skips permitidos; ele não é rotulado como verde.

Não houve produção, Google, WhatsApp ou Pluggy reais nem deploy.

## Gate encerrado anterior — STATE-04

`STATE-04` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`22fff090192269e71d71025653f1b5450b3132e2`.

O snapshot local preserva o estado necessário dentro de envelope AES-256-GCM
estrito, privado e autenticado, com journal de replay, ordem durável, retenção,
restore fail-closed e arquivos `0600`. Redis permanece indisponível e falha
antes de qualquer efeito até o gate separado `STATE-03`.

Evidência executada pelo Codex: RED Redis reproduzido; teste dedicado `14/14`;
bateria causal `345/345`; runner hermético `1.238` testes, `1.233` aprovados,
zero falhas e cinco skips previstos. O Chat confirmou o hash, os cinco commits,
os 19 arquivos e a ausência de achado bloqueante, sem executar os testes.

Não houve acesso a snapshot real, Redis real, produção, Google, WhatsApp ou
deploy.

## Gate encerrado anterior — AUTH-04

`AUTH-04` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`beb8e0ff7f2eccd74688aa347de6b7d79170d094`.

As APIs financeiras v1, v2 e wrappers autenticados agora validam assinatura/TTL
e consultam o cadastro fresco antes de qualquer leitura. Ausência, exclusão ou
status diferente de `ACTIVE` negam com `403`; indisponibilidade da fonte nega
com `503` distinto. O Chat confirmou hash, base e os cinco arquivos, sem achado
`CRITICAL`, `HIGH` ou `MEDIUM`.

Evidência executada pelo Codex: RED causal `200 !== 403`; cenários `3/3`;
dashboard `24/24`; OAuth `7/7`; auditoria sanitizada `1/1`; pretests verdes e
runner principal `1.080/1.080`. O parecer externo foi estático e não reproduziu
essas execuções. Os dois achados `LOW` de cobertura e o ponto informativo de
telemetria pré-roteamento não abrem bypass nem vazamento.

Não houve acesso a Google/WhatsApp real, produção ou deploy.

## Git e workspace

- branch ativa: `codex/open-finance-save-proposal`;
- último produto com `GO TÉCNICO LOCAL`:
  `f8a1e9f41eee3c904f0de69ae465219ef874212d`;
- fechamento documental de 9P.0:
  `bcdbf0e8772270019e9223e6a996f5102eb446bd`;
- alterações concorrentes do workstream AWS/Oracle e arquivos não rastreados do
  usuário permanecem fora do gate e não devem ser adicionados, alterados ou
  removidos;
- raiz canônica recuperada:
  `C:\Users\Administrador\Documents\FinancasBot\financas-bot`.

## Próximo gate

OPS-02 está em `candidato local verde; auditoria independente pendente`. O
incidente real comprovou que o health anterior media processo, HTTP e SQLite,
mas não detectava uma página WhatsApp incapaz de executar funções ou sem
conexão externa.

Evidência executada: focal `36/36`; afetada `211/211`; runner hermético
`1.321/1.326`, zero falhas e cinco skips funcionais previstos; cobertura de
linhas `90,37%`; contrato de ambiente verde. O audit de dependências relata 11
avisos `high` transitivos preexistentes; nenhum lockfile foi alterado neste
gate.

Plano corrente: `docs/plans/current-gate.md`.

## Decisões vigentes

- manter `Codex → Sol → Alto` no próximo gate, que cruza transporte WhatsApp,
  Puppeteer, supervisor, health e recuperação sem duplicidade;
- parar e avisar Daniel antes de reduzir ou trocar capacidade;
- a produção vigente é Oracle/OCI; não reutilizar caminhos AWS e não executar
  Oracle e AWS simultaneamente com a mesma sessão WhatsApp;
- antes do próximo deploy funcional, definir e ensaiar instalação por artefato
  imutável com preservação de estado, checksums e rollback;
- preservar o bot familiar privado do casal; expansão multiusuário não faz
  parte do escopo;
- usar commit sanitizado e imutável em auditorias independentes e separar
  evidência executada localmente de revisão estática externa.

## Próxima ação exata

Publicar o commit sanitizado de OPS-02 e executar uma tentativa de auditoria
independente no Chat conectado usando hash completo e URLs imutáveis. Não
reiniciar produção nem alterar a sessão real.

## Capacidade para retomar

`Codex → Sol → Alto → corrigir e auditar a perda silenciosa de liveness do
WhatsApp antes de retomar 9P.4.`

## Fila de produto posterior

Depois da correção operacional de liveness, abrir gate próprio para revalidação
final, confirmação idempotente, operation key e recibo de 9P.4. Somente depois:

1. permitir atribuição familiar uniforme de um lançamento a Daniel ou Thaís;
2. apresentar a forma de pagamento como menu numerado;
3. na dúvida de categoria, oferecer mais categorias existentes antes da opção
   de criar uma nova.

## Histórico dirigido

- candidato 9P.0:
  `docs/audit/46-open-finance-save-proposal-shadow-candidate-2026-07-23.md`;
- recovery pós-NO-GO 9P.0:
  `docs/audit/47-open-finance-save-proposal-shadow-recovery-candidate-2026-07-23.md`;
- fechamento independente 9P.0:
  `docs/audit/48-open-finance-save-proposal-shadow-independent-close-2026-07-23.md`;
- candidato 9P.1:
  `docs/audit/49-open-finance-save-proposal-confirmation-candidate-2026-07-24.md`;
- recuperação pós-NO-GO 9P.1:
  `docs/audit/50-open-finance-save-proposal-confirmation-recovery-candidate-2026-07-24.md`;
- segunda recuperação 9P.1:
  `docs/audit/51-open-finance-save-proposal-terminal-journal-recovery-candidate-2026-07-24.md`;
- terceira recuperação 9P.1:
  `docs/audit/52-open-finance-save-proposal-terminal-anchor-recovery-candidate-2026-07-24.md`;
- fechamento independente 9P.1:
  `docs/audit/53-open-finance-save-proposal-confirmation-independent-close-2026-07-24.md`;
- candidato 9P.2:
  `docs/audit/54-open-finance-save-proposal-conversation-candidate-2026-07-24.md`;
- recuperação pós-NO-GO 9P.2:
  `docs/audit/55-open-finance-save-proposal-delivery-proof-recovery-candidate-2026-07-24.md`;
- fechamento independente 9P.2:
  `docs/audit/56-open-finance-save-proposal-conversation-independent-close-2026-07-24.md`;
- candidato 9P.3:
  `docs/audit/57-open-finance-save-proposal-guided-review-candidate-2026-07-24.md`;
- reauditoria candidata 9P.3:
  `docs/audit/58-open-finance-save-proposal-guided-review-reaudit-candidate-2026-07-24.md`;
- reauditoria do Chat interrompida pelo handoff:
  `docs/audit/59-open-finance-save-proposal-guided-review-chat-pending-2026-07-24.md`;
- fechamento independente 9P.3:
  `docs/audit/60-open-finance-save-proposal-guided-review-independent-close-2026-07-30.md`;
- fechamento independente STATE-03:
  `docs/audit/45-state03-independent-close-2026-07-23.md`;
- recuperação de sinais repetidos STATE-03:
  `docs/audit/44-state03-repeated-signal-recovery-candidate-2026-07-23.md`;
- fechamento independente FLOW-04:
  `docs/audit/42-flow04-independent-close-2026-07-23.md`;
- recuperação pós-NO-GO FLOW-04:
  `docs/audit/41-flow04-post-audit-recovery-candidate-2026-07-23.md`;
- fechamento independente FLOW-02:
  `docs/audit/39-flow02-independent-close-2026-07-23.md`;
- candidato FLOW-02:
  `docs/audit/38-flow02-rate-limit-candidate-2026-07-23.md`;
- fechamento independente de OPS-01:
  `docs/audit/37-ops01-independent-close-2026-07-23.md`;
- fechamento independente de COV-01:
  `docs/audit/36-cov01-independent-close-2026-07-23.md`;
- fechamento independente de STATE-04:
  `docs/audit/35-state04-independent-close-2026-07-23.md`;
- recuperação da fronteira Redis de STATE-04:
  `docs/audit/34-state04-redis-boundary-recovery-candidate-2026-07-23.md`;
- recuperação da terceira revisão de STATE-04:
  `docs/audit/33-state04-third-review-recovery-candidate-2026-07-23.md`;
- recuperação após o segundo `NO-GO` de STATE-04:
  `docs/audit/32-state04-second-nogo-recovery-candidate-2026-07-23.md`;
- recuperação após `NO-GO` de STATE-04:
  `docs/audit/31-state04-independent-nogo-recovery-candidate-2026-07-23.md`;
- primeiro candidato STATE-04:
  `docs/audit/30-state04-snapshot-hardening-candidate-2026-07-23.md`;
- fechamento independente AUTH-04:
  `docs/audit/29-auth04-independent-close-2026-07-23.md`;
- candidato AUTH-04:
  `docs/audit/28-auth04-dashboard-revocation-candidate-2026-07-23.md`;
- fechamento atual:
  `docs/audit/18-flow03-independent-close-2026-07-22.md`;
- candidato PRIV-01:
  `docs/audit/24-priv01-runtime-log-boundary-candidate-2026-07-22.md`;
- recuperação pós-NO-GO PRIV-01:
  `docs/audit/25-priv01-post-audit-recovery-candidate-2026-07-22.md`;
- recuperação dos escapes multilinha PRIV-01:
  `docs/audit/26-priv01-multiline-log-recovery-candidate-2026-07-22.md`;
- fechamento independente PRIV-01:
  `docs/audit/27-priv01-independent-close-2026-07-22.md`;
- candidato STATE-01:
  `docs/audit/19-state01-sender-serialization-candidate-2026-07-22.md`;
- correção pós-commit candidata:
  `docs/audit/22-state01-post-commit-recovery-candidate-2026-07-22.md`;
- fechamento independente de STATE-01:
  `docs/audit/23-state01-independent-close-2026-07-22.md`;
- tentativa automática sem acesso:
  `docs/audit/20-state01-chat-access-pending-2026-07-22.md`;
- tentativa manual sem acesso e integridade dos anexos:
  `docs/audit/21-state01-manual-access-insufficient-2026-07-22.md`;
- candidato FLOW-03:
  `docs/audit/17-flow03-scheduler-personal-source-candidate-2026-07-22.md`;
- fechamento anterior:
  `docs/audit/16-auth03-wgl07-independent-close-2026-07-22.md`;
- candidato AUTH-03/WGL-07:
  `docs/audit/15-auth03-wgl07-candidate-2026-07-22.md`;
- fechamento anterior:
  `docs/audit/14-wgl03-wgl04-independent-close-2026-07-22.md`;
- fila original:
  `docs/audit/11-exhaustive-path-independent-review-2026-07-18.md`.
