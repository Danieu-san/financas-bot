# Estado atual portatil do FinancasBot

Atualizado em: 2026-08-09

## Retomada vigente - Gate 34

Release OCI candidata no hash
`09b6dab6e679ce28202cb87f83d38549f64e6ae8`: workflow, build, checksum,
manifesto e inventario verdes; artefato com `819` arquivos. A OCI correta esta
`Running`, mas o SSH permanece fechado porque o IP do navegador nao corresponde
ao IP de saida do executor. Nenhum upload, restart ou deploy ocorreu e todas as
regras SSH temporarias foram removidas. Estado: `HOLD SEGURO ANTES DE UPLOAD`.
Evidencia:
`docs/audit/175-gate34-oci-release-preflight-hold-2026-08-09.md`.

Proxima acao: obter autorizacao explicita para consultar
`https://checkip.amazonaws.com/` a partir do executor, abrir somente o `/32`
resultante, confirmar fingerprint e retomar o preflight OCI.

Reauditoria independente do hash
`d5597d3d0d47f453940b60fcee200f70f62be25c`: `GO TECNICO LOCAL`, zero
achados em todas as severidades e nenhuma lacuna indispensavel. O recovery
duravel esta fechado. Parecer:
`docs/audit/174-open-finance-pending-purchase-durable-state-independent-close-2026-08-09.md`.

Proxima acao autorizada: preparar e executar release OCI por artefato imutavel,
preservar estado e rollback, validar release exato, health, processo, WhatsApp,
flags e zero escrita.

Auditoria do hash `809930a5f516cc33d61db42d020bfc279738e7a3`:
implementacao suficiente, mas `NO-GO` probatorio por um achado `MEDIUM`. O teste
usava um `Map` no lugar da persistencia real do estado numerico.

Recovery aplicado: o runtime agora e testado com o `userStateManager` real,
snapshot cifrado, fechamento, remocao do modulo do cache e reabertura. O estado
`awaiting_open_finance_save_selection` reaparece com duas propostas numeradas;
focal `1/1`, bateria causal `38/38` e zero escrita. Estado:
suite hermetica final unica `1.555/1.545/0/10`, com os skips esperados. Estado:
`CANDIDATO LOCAL VERDE; AGUARDA NOVO HASH E REAUDITORIA`.
Manifesto:
`docs/audit/173-open-finance-pending-purchase-durable-state-recovery-candidate-2026-08-09.md`.

Proxima acao: publicar novo hash e reauditar antes de qualquer promocao OCI.

Diagnostico novo: depois da atualizacao do Meu Pluggy, o ciclo das 10:27
entregou a compra e o estorno recentes. A coleta e o WhatsApp funcionaram; a
compra ainda nao era `POSTED`, portanto recebeu alerta comum, e o estorno segue
fora do salvamento proativo. Uma prova causal nova confirmou que duas compras
`PENDING` promovidas a `POSTED` originam um unico lote numerado e zero escrita.

O candidato agora explica no proprio alerta que a compra esta pendente e so
entrara na proposta depois da confirmacao do banco. Evidencia focal `2/2`,
causal `38/38`, syntax e diff verdes; suite hermetica valida com 1.555 testes,
1.545 aprovados, zero falhas e 10 skips esperados. Estado:
`CANDIDATO LOCAL VERDE; AGUARDA COMMIT E AUDITORIA INDEPENDENTE`.
Manifesto:
`docs/audit/172-open-finance-pending-purchase-transparency-candidate-2026-08-09.md`.

Proxima acao: publicar o commit sanitizado e obter auditoria independente antes
de qualquer nova promocao OCI.

Segunda janela concluida operacionalmente: backup privado verificado, intervalo
de 15 minutos renovado por 115 minutos, exatamente um restart e primeiro ciclo
`GO` com `new=0`, `delivered=0`, `retries=0` e `writes=0`. Processo, health
local, SQLite, WhatsApp, flags e cinco stores ficaram verdes. A unica regra SSH
`/32` correspondia a conexao da janela, foi removida e a porta 22 voltou a ficar
fechada. O health publico nao foi verificavel nesta rede por interceptacao TLS
Fortinet. Evidencia:
`docs/audit/171-open-finance-second-fast-poll-window-observation-2026-08-09.md`.

Diagnostico mais recente: as mensagens sem numeracao observadas durante a
janela rapida vieram do backlog comum, nao de propostas elegiveis novas. Os
ciclos sem observacao nova escoaram itens `PENDING` ou `purchase_candidate`, que
intencionalmente nao recebem `proposal_ref`. O hash promovido, processo e
invariantes estavam corretos; a regra SSH de diagnostico foi removida.
Evidencia:
`docs/audit/169-open-finance-unnumbered-fast-poll-diagnosis-2026-08-09.md`.

Atualizacao mais recente: `OF-FAST-POLL-01` recebeu GO independente e o hash
`b6f8edc37bd46ba977a7a4a4e59f54ad092300d6` foi promovido na Oracle/OCI.
A janela natural de 15 minutos esta ativa por menos de duas horas, sob as seis
flags seguras, com fallback automatico para seis horas ao expirar. Processo,
health, SQLite, WhatsApp, stores, retencao e logs sanitizados ficaram verdes;
a regra SSH temporaria foi removida e a porta voltou a ficar fechada.

O release `f5806e1b071b47d6441354928740d2139fb5ae51` foi auditado e
promovido de forma controlada na Oracle/OCI. Processo unico, health local e
publico, SQLite, WhatsApp, liveness, flags, stores, retencao e logs sanitizados
ficaram verdes. A regra SSH temporaria foi removida e a porta voltou a ficar
fechada. Escrita continua `off`, aprovacao falsa e `financial_writes=0`.

Estado vigente:
`PROMOCAO VERDE; SEGUNDA JANELA RAPIDA ATIVA; PRIMEIRO CICLO SEM LOTE NOVO; GATE 34 AGUARDA SMOKE`.

Proxima acao: observar os dois celulares durante a janela vigente. Quando
surgir lote `purchase/POSTED/new` numerado, executar o smoke familiar e parar
antes de qualquer confirmacao ou escrita. Se a janela expirar sem lote, manter
o Gate 34 pendente sem novo restart automatico.

## Objetivo ativo

Fechar o recovery de compatibilidade de estado de `OF-ALERT-BIND-01`, auditar o
hash imutavel e promover um novo artefato na OCI com proposta `prompt`, escrita
`off`, aprovacao falsa e `confirm` bloqueado.

## Estado vigente

`OF-ALERT-BIND-01 GO TÉCNICO E OPERACIONAL; 9P.4 REAL SMOKE PENDENTE;
CONFIRM BLOCKED`.

O commit `c781365d1b6b5524b3ae5ac0ce821d9461821a28` recebeu GO tecnico local
independente para o recovery de dependencias e foi promovido na OCI. O release
ficou com processo unico, WhatsApp ready/healthy, health local e publico verdes,
flags seguras e zero escrita. O primeiro ciclo Open Finance, porem, terminou em
`NO_GO`; portanto o fechamento de producao nao foi declarado.

O primeiro candidato, no commit
`63d7bb66dba9040047b22935760b32344e9059e1`, recebeu NO-GO independente:
mudanca de conta podia deslocar observation/proposal ref e esconder a proposta
anterior, e faltava prova de rollback entre journal e preview com reabertura
real. O recovery atual indexa propostas pela identidade HMAC estavel da fonte,
terminaliza a proposta deslocada e bloqueia a substituta. A prova nova injeta
falha depois do journal, comprova o preview ainda pending/ready, fecha e reabre
journal, ancora e store, e exige reaplicacao cancelled/declined com zero escrita.

O commit `f5768a03ea57fa7665dd1b0f5fd2dea5749fe9b6` recebeu novo NO-GO
independente: o índice estável não era atualizado após uma inserção no mesmo
ingest, permitindo duas propostas da mesma fonte com referências diferentes.
O recovery atual atualiza o índice dentro da transação e transforma a segunda
representação em `save_proposal_replay_conflict`, com rollback integral.

O hash final `1a1630949cf6acb301a2a054e61987d1cf516fb4` recebeu GO
independente, foi promovido na OCI por artefato imutavel e iniciou com processo
unico, zero reinicios, WhatsApp/health verdes e estado preservado. O primeiro
ciclo do novo release terminou `GO`, com quatro eventos novos, zero entrega e
zero escrita. Duas propostas obsoletas ficaram canceladas e nenhuma duplicidade
foi criada.

Fechamento:
`docs/audit/111-open-finance-stale-proposal-identity-independent-production-close-2026-08-03.md`.

## Evidencia

- Pluggy real somente leitura: verde, sem WhatsApp e sem escrita;
- ensaio completo com estado copiado e codigo candidato: `GO`, duas propostas
  inelegiveis invalidadas, quatro entregas simuladas e zero escrita;
- save proposal shadow `13/13`;
- confirmation `9/9`;
- family alerts `6/6`;
- state machine `124/124`;
- bateria causal relacionada: `152/152`;
- suite hermetica: `1.436` testes, `1.431` aprovados, zero falha e cinco
  skips esperados;
- cobertura: linhas `90,59%`, branches `72,90%`, funcoes `90,15%`.

As contagens sao execucao local do Codex e ainda nao substituem a auditoria
independente obrigatoria.

Diagnostico remoto somente leitura em 2026-08-03T20:00Z confirmou release
`1a1630949cf6acb301a2a054e61987d1cf516fb4`, PM2 unico/online com zero
reinicios e health/WhatsApp verdes. O ultimo ciclo Open Finance permanece o de
16:46:59Z; nao houve ciclo posterior capaz de observar uma compra nova. O
outbox possui 105 entregas antigas `accepted_unconfirmed`, todas inelegiveis
para o smoke. Nenhuma escrita, restart ou mudanca de flag foi executada.

## Git e workspace

- raiz canonica:
  `C:\Users\Administrador\Documents\FinancasBot\financas-bot`;
- branch: `codex/open-finance-finalization`;
- parent implantado: `c781365d1b6b5524b3ae5ac0ce821d9461821a28`;
- o SSD antigo nao e raiz canonica e nao deve receber edicoes deste gate;
- no proximo handoff, reconstruir uma copia nova no SSD a partir do HEAD
  publicado com `syncPortableRepository.ps1`; preservar integralmente a arvore
  antiga/suja e usar o `OPEN-THIS.json` como ponteiro de retomada.

## Producao vigente

- provedor: Oracle/OCI;
- host, usuario, chave, diretorio e processo devem ser redescobertos nos
  runbooks antes de nova acao remota;
- release vigente: `1a1630949cf6acb301a2a054e61987d1cf516fb4`;
- processo e WhatsApp saudaveis na ultima verificacao;
- proposta `prompt`, escrita `off`, aprovacao falsa;
- AWS nao participa de deploy ou rollback;
- nao executar Git no diretorio de producao: usar artefato imutavel, checksum e
  rollback.

## Limites preservados

- eventos ausentes no provedor nao sao sintetizados;
- propostas proativas continuam restritas a compras reconciliadas;
- entrada, transferencia, saida bancaria, pagamento e tarifa sao apenas
  alertaveis;
- `confirm` continua bloqueado;
- nenhuma resposta antiga `sim` deve ser usada como smoke do recovery.

## Padrao economico permanente

O workflow global e portatil exige revisao adversarial antes da suite ampla,
testes focais e causais durante a implementacao, uma unica suite hermetica por
candidato estavel e repeticao somente apos mudanca causal. Saidas de ferramentas
devem ser filtradas na origem; Chat usa uma conversa e uma tentativa por hash;
logs, manifestos e navegador nao devem carregar conteudo integral sem necessidade
probatoria. Subagentes permanecem desligados sem pedido explicito e beneficio
liquido demonstravel.

## Próxima ação exata

Aguardar uma nova compra genuina observada pelo Pluggy e, com Daniel presente,
executar o smoke de proposta proativa sem usar respostas antigas. Validar uma
unica proposta por telefone, revisao guiada e nenhum efeito antes da segunda
confirmacao. Atualizar o Item no Meu Pluggy depois da compra; sem restart, o
proximo ciclo automatico e esperado aproximadamente as 22:46Z (19:46 de
Brasilia). `confirm` permanece bloqueado.

## Capacidade para retomar

`Codex -> Sol -> Medio -> executar o smoke real do recovery com Daniel presente.`

## Referencias dirigidas

- plano vigente: `docs/plans/current-gate.md`;
- recovery atual:
  `docs/audit/111-open-finance-stale-proposal-identity-independent-production-close-2026-08-03.md`;
- candidato final:
  `docs/audit/110-open-finance-intraingest-identity-collision-recovery-candidate-2026-08-03.md`;
- candidato anterior e segundo NO-GO:
  `docs/audit/109-open-finance-stale-proposal-identity-recovery-candidate-2026-08-03.md`;
- candidato anterior e NO-GO:
  `docs/audit/108-open-finance-stale-proposal-invalidation-recovery-candidate-2026-08-03.md`;
- recovery de dependencias:
  `docs/audit/107-runtime-dependency-security-recovery-candidate-2026-08-03.md`;
- fechamento funcional anterior:
  `docs/audit/106-open-finance-alert-binding-independent-close-2026-08-03.md`;
- release OCI anterior:
  `docs/audit/99-oci-whatsapp-readiness-window-independent-production-close-2026-07-31.md`;
- arquitetura: `docs/agent-memory/architecture-map.md`;
- riscos: `docs/agent-memory/known-issues.md`;
- testes: `docs/agent-memory/testing-playbook.md`.
