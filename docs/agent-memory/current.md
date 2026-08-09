# Estado atual portatil do FinancasBot

Atualizado em: 2026-08-09

## Retomada vigente - Gate 34

Atualizacao mais recente: o candidato `OF-FAST-POLL-01` permite uma janela de
15 minutos com expiracao automatica, somente sob as seis flags seguras. A prova
local terminou com focal `20/20`, causal `71/71` e suite hermetica 1.553 total,
1.543 aprovados, zero falhas e 10 skips. Estado:
`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`; producao permanece no release
`f5806e1b071b47d6441354928740d2139fb5ae51`, com escrita desligada.

O release `f5806e1b071b47d6441354928740d2139fb5ae51` foi auditado e
promovido de forma controlada na Oracle/OCI. Processo unico, health local e
publico, SQLite, WhatsApp, liveness, flags, stores, retencao e logs sanitizados
ficaram verdes. A regra SSH temporaria foi removida e a porta voltou a ficar
fechada. Escrita continua `off`, aprovacao falsa e `financial_writes=0`.

Estado vigente: `PROMOCAO VERDE; GATE 34 AGUARDA SMOKE NATURAL`.

Proxima acao: nao forcar polling. Aguardar um lote numerado genuinamente novo;
quando Daniel estiver com os dois celulares, executar o smoke familiar e parar
antes de qualquer confirmacao ou escrita. Evidencia:
`docs/audit/166-open-finance-numeric-save-priority-oci-promotion-2026-08-09.md`.

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
