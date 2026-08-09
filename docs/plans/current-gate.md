# Gate ativo — PROD-ACT-01 ativação funcional Open Finance

Atualizado em: 2026-08-09

## Preparacao local do Gate 35 em paralelo

Daniel determinou que a janela do Gate 34 permanecesse aberta e inalterada,
avancando ao proximo trabalho sem declarar o smoke funcional concluido. O Gate
35 foi iniciado somente no repositorio, sem ativacao, dados privados ou
producao.

O candidato compoe os nucleos reais de revisao historica e reconciliacao,
retorna estado cifrado na preparacao, exige snapshot de decisoes completo e
recalcula o RX com `financial_writes=0`. Blockers independentes permanecem
visiveis como `partial_no_go`; nenhuma inferencia foi adicionada.

Evidencia: focal `3/3`, integracao real `11/11`, causal `34/34`, suite
hermetica ampla `1.558/1.548/0/10`. Estado:
`CANDIDATO LOCAL VERDE; AGUARDA COMMIT E AUDITORIA INDEPENDENTE`.

Manifesto:
`docs/audit/177-open-finance-historical-rx-gate35-orchestrator-candidate-2026-08-09.md`.

## Estado vigente - Gate 34

O artefato do hash `09b6dab6e679ce28202cb87f83d38549f64e6ae8` foi
promovido na OCI sem rollback. Processo unico, hash runtime, health
local/publico, SQLite, WhatsApp, servicos e flags ficaram verdes; estado
critico permaneceu byte a byte equivalente. O smoke real `admin stats` teve
uma resposta e zero escrita.

As sessoes e o Bastion temporarios foram excluidos, o plugin foi desativado, a
regra privada TCP/22 foi removida e nao existe regra SSH na VCN. Evidencia:
`docs/audit/176-gate34-oci-release-promotion-2026-08-09.md`.

Estado: `GO OPERACIONAL DA PROMOCAO OCI; SMOKE NUMERICO AINDA PENDENTE`.
A promocao nao encerra o Gate 34: falta uma compra real elegivel gerar o lote
numerado nos dois telefones e provar selecao/revisao com escrita desligada.

O recovery do hash `d5597d3d0d47f453940b60fcee200f70f62be25c`
recebeu `GO TECNICO LOCAL` independente, com zero achados e nenhuma lacuna
indispensavel. O Gate 34 esta apto ao fluxo de release OCI autorizado. Parecer:
`docs/audit/174-open-finance-pending-purchase-durable-state-independent-close-2026-08-09.md`.

O hash `809930a5f516cc33d61db42d020bfc279738e7a3` recebeu `NO-GO`
independente por lacuna `MEDIUM` exclusivamente probatoria: o teste de runtime
substituia o gerenciador duravel por um `Map`.

O recovery usa o `userStateManager` real, persiste snapshot cifrado, fecha e
reabre o modulo e exige a selecao `[1,2]` restaurada. Focal `1/1`, causal
`38/38`, syntax verde, suite hermetica final `1.555/1.545/0/10` e
`financial_writes=0`. Estado:
`CANDIDATO LOCAL VERDE; AGUARDA NOVO HASH E REAUDITORIA`.
Manifesto:
`docs/audit/173-open-finance-pending-purchase-durable-state-recovery-candidate-2026-08-09.md`.

O ciclo real das 10:27 comprovou coleta e entrega da compra e do estorno novos.
A compra ainda estava `PENDING`, por isso nao podia originar proposta; o estorno
permanece apenas informativo. O teste causal ausente foi acrescentado e prova
`PENDING -> POSTED -> lote numerado`, com estado duravel e zero escrita.

O candidato de transparencia altera somente o texto do alerta
`purchase/PENDING` para explicar a espera pela confirmacao bancaria. Focais
`2/2`, bateria causal `38/38`, syntax e diff verdes; suite hermetica valida com
1.555 testes, 1.545 aprovados, zero falhas e 10 skips esperados. Estado:
`CANDIDATO LOCAL VERDE; AGUARDA COMMIT E AUDITORIA INDEPENDENTE`.
Manifesto:
`docs/audit/172-open-finance-pending-purchase-transparency-candidate-2026-08-09.md`.

Segunda janela aplicada: backup privado verificado, intervalo de 15 minutos por
115 minutos, exatamente um restart e primeiro ciclo automatico `GO` com
`new=0`, `delivered=0`, `retries=0` e `writes=0`. Processo, health local,
SQLite, WhatsApp, flags e stores ficaram verdes. A regra SSH `/32` usada na
janela foi removida e a porta 22 foi confirmada fechada. Evidencia:
`docs/audit/171-open-finance-second-fast-poll-window-observation-2026-08-09.md`.

Diagnostico posterior confirmou que os alertas sem numeracao da janela rapida
eram backlog comum: itens ainda `PENDING` ou apenas `purchase_candidate`, sem
proposta elegivel. Ciclos `GO` sem observacao nova podem escoar esses alertas;
isso nao viola a prioridade do lote numerado. Evidencia:
`docs/audit/169-open-finance-unnumbered-fast-poll-diagnosis-2026-08-09.md`.

Atualizacao mais recente: `OF-FAST-POLL-01` recebeu GO independente e o hash
`b6f8edc37bd46ba977a7a4a4e59f54ad092300d6` foi promovido na Oracle/OCI. A
janela de 15 minutos esta ativa por menos de duas horas e volta efetivamente a
seis horas ao expirar. Processo, health, SQLite, WhatsApp, flags, stores,
retencao e logs ficaram verdes; a regra SSH temporaria foi removida. Evidencia:
`docs/audit/168-open-finance-temporary-fast-polling-oci-promotion-2026-08-09.md`.

`PROMOCAO VERDE; SEGUNDA JANELA RAPIDA ATIVA; PRIMEIRO CICLO SEM LOTE NOVO; SMOKE PENDENTE; CONFIRM BLOQUEADO`.

O hash `f5806e1b071b47d6441354928740d2139fb5ae51` recebeu GO independente e
foi promovido na Oracle/OCI sem rollback. Processo, health, SQLite, WhatsApp,
liveness, flags, stores, retencao e logs sanitizados ficaram verdes; a regra
SSH temporaria foi removida. `OPEN_FINANCE_WRITE_MODE=off`, aprovacao falsa e
`financial_writes=0` permanecem invariantes.

Proxima acao: observar os dois celulares durante a janela vigente. Somente com
lote `purchase/POSTED/new` numerado, executar o smoke familiar e parar antes de
qualquer confirmacao/escrita. Sem lote novo, deixar a janela expirar e manter o
gate pendente.

## Estado

`POLÍTICA FAMILIAR ATIVA; OF-ALERT-BIND-01 GO TÉCNICO E OPERACIONAL;
9P.4 REAL SMOKE PENDENTE; CONFIRM BLOQUEADO`.

O recovery de dependências `c781365d1b6b5524b3ae5ac0ce821d9461821a28`
recebeu GO independente e foi promovido na OCI com processo, WhatsApp e health
verdes. O primeiro ciclo Open Finance, porém, falhou fechado com zero escrita.
O diagnóstico em cópias consistentes do estado real reproduziu
`save_proposal_replay_conflict`: propostas anteriores ao refinamento do
classificador permaneciam persistidas embora tivessem deixado de ser elegíveis.

O primeiro candidato, `63d7bb66dba9040047b22935760b32344e9059e1`, recebeu
NO-GO independente porque uma mudança de conta podia deslocar a referência e
deixar a proposta anterior ativa, e porque faltava prova completa de rollback e
reabertura. O candidato atual usa identidade HMAC estável da transação fonte,
terminaliza a proposta deslocada, bloqueia a substituta e prova recuperação
após falha injetada entre journal e preview com reabertura real. Evidência:
`docs/audit/109-open-finance-stale-proposal-identity-recovery-candidate-2026-08-03.md`.

Esse candidato, no commit `f5768a03ea57fa7665dd1b0f5fd2dea5749fe9b6`,
recebeu novo NO-GO independente: o mapa de identidade estável não incorporava
uma inserção feita dentro do mesmo ingest. O recovery atual atualiza o mapa na
mesma transação; uma segunda representação da mesma fonte encontra a primeira,
é reconhecida como intraingest e causa rollback integral. Evidência:
`docs/audit/110-open-finance-intraingest-identity-collision-recovery-candidate-2026-08-03.md`.

O hash final `1a1630949cf6acb301a2a054e61987d1cf516fb4` recebeu GO
independente, foi promovido por artefato OCI sem rollback e produziu no novo
processo `cycle=GO`, zero entrega e `writes=0`. Health local/público, WhatsApp,
PM2, Caddy e estado crítico permaneceram verdes. Fechamento:
`docs/audit/111-open-finance-stale-proposal-identity-independent-production-close-2026-08-03.md`.

## Recovery ativo — OF-ALERT-BIND-01

O smoke real demonstrou que transporte resolvido sem id podia entregar uma
proposta sem vincular a conversa, uma transferência observada era excluída dos
alertas e marcador de saldo em atraso podia virar compra. O provedor não
retornou a compra e o estorno adicionais relatados mesmo após atualização, por
isso o produto não os sintetizou.

O candidato vincula uma única proposta ao telefone e principal exatos, mantém
falhas ambíguas inelegíveis, amplia somente a visibilidade das classes
reconciliadas e bloqueia `bill_balance`. Evidência local: `192/192` afetados,
`13/13` no fixture temporal de 9P.4 e suíte hermética com `1.431` testes,
`1.426` aprovados, zero falha e cinco skips esperados. Manifesto:
`docs/audit/104-open-finance-alert-binding-recovery-candidate-2026-08-03.md`.

Invariantes preservadas: proposta `prompt`, escrita `off`, aprovação falsa,
zero escrita e `confirm` bloqueado. Entradas e transferências ficam alertáveis;
seu salvamento proativo permanece fora deste recovery e exige gate próprio.

O commit imutável `ed4326759c9108a81b4903abf7e14dc171f7feb7` recebeu
`NO-GO` independente com um achado `ALTO`: falha de transporte ambígua não
reservava o destinatário no restante do ciclo. O recovery agora reserva o
principal sempre que o transporte possa ter enviado, sem criar estado de
resposta para a falha ambígua. A prova com outbox real mantém uma segunda
proposta pendente e exige que ela não possa ser reclamada. Evidência final:
afetada `193/193`; hermética `1.432` testes, `1.427` aprovados, zero falha e
cinco skips esperados. Manifesto:
`docs/audit/105-open-finance-ambiguous-recipient-reservation-recovery-candidate-2026-08-03.md`.

O hash `c26594f3f11cbe702acee37dd85b72f6721d686c` recebeu `GO TÉCNICO LOCAL`
independente, com todas as severidades zeradas e sem lacuna indispensável
residual. O alcance autorizado é somente release OCI por artefato imutável com
`prompt`, write `off` e aprovação falsa. Fechamento:
`docs/audit/106-open-finance-alert-binding-independent-close-2026-08-03.md`.

## Objetivo

Promover de forma controlada a experiência proativa de salvamento para o casal,
sem transformar alerta em escrita automática e sem habilitar flags antes de
prova operacional, auditoria independente e rollback explícito.

## Escopo

- inventário das flags vigentes e da política de ativação;
- sequência reversível `shadow/prompt` antes de `confirm`;
- prova real de segunda confirmação, escrita única e recibo;
- rollback imediato para `OPEN_FINANCE_WRITE_MODE=off`;
- auditoria independente do plano e da evidência antes do GO funcional.

## Não escopo

- escrita automática ao detectar movimentação;
- aceitar correspondência ou ambiguidade como item novo;
- ampliar o produto além do casal autorizado;
- usar AWS como destino ou rollback;
- ativar escrita sem Daniel disponível para o smoke controlado.

## Incidente

O controlador auditado no commit
`bae6454ba5ab1cc109ce608e41cb0b849b6266af` ativou `prompt` na OCI com
WhatsApp `ready/healthy`, escrita `off`, aprovação falsa e zero escrita. Após
Daniel atualizar os quatro Items, o ciclo real encontrou cinco observações
novas, mas aceitou somente uma entrega para a titular da fonte. A política
privada ainda estava em modo individual nas quatro fontes. O fan-out familiar
não foi comprovado e `confirm` permanece bloqueado.

O candidato `OF-FAMILY-ACT-01` adiciona um controlador transacional para mudar
somente o escopo da política privada para o casal autorizado, com backup exato,
troca atômica, health e rollback. Evidência:
`docs/audit/102-open-finance-family-policy-activation-candidate-2026-07-31.md`.

O commit `33ab7969bf9ef4190a64f103e46b1ddce9ffe4b0` recebeu `GO TÉCNICO LOCAL`
independente, foi promovido na OCI por artefato imutável e aplicou a política
familiar sem rollback. O primeiro ciclo pós-política entregou dois alertas
cruzados para Daniel e dois para Thaís, com `writes=0`; eram expansões de eventos
já observados, por isso o smoke de uma nova movimentação ainda não terminou.

## Invariantes

1. Detecção e alerta nunca escrevem automaticamente.
2. Somente evento `new`, revalidado, pode originar proposta.
3. O primeiro cônjuge autorizado que confirmar reserva a operação.
4. A segunda confirmação explícita é obrigatória antes da escrita.
5. Operation key e recibo impedem duplicação em retry/restart.
6. Falha ou incerteza permanece fail-closed e reconciliável.
7. Rollback de flags remove imediatamente a capacidade de escrita.
8. AWS não participa de deploy ou rollback.

## Evidência

- fechamento técnico local de 9P.4:
  `docs/audit/66-open-finance-finalization-independent-close-2026-07-30.md`;
- composição fail-closed:
  `docs/audit/78-open-finance-write-activation-independent-close-2026-07-30.md`;
- fanout familiar:
  `docs/audit/92-open-finance-family-alerts-independent-close-2026-07-30.md`;
- release OCI vigente:
  `docs/audit/99-oci-whatsapp-readiness-window-independent-production-close-2026-07-31.md`.
- controlador candidato:
  `docs/audit/100-open-finance-production-activation-controller-candidate-2026-07-31.md`;
- testes focais do controlador: `12/12`;
- controlador mais instalador OCI: `35/35`;
- o primeiro parecer independente do hash
  `b56fd6a930057788f0afe24ea93fee09aaf621bc` foi `NO-GO`: exigiu sincronizar
  no pai a criação de `data/backups` e tornar causalmente observável
  `backup → alteração` e `restauração → restart`;
- o recovery implementa exatamente essas duas exigências;
- a segunda reauditoria confirmou o fechamento das duas exigências e encontrou
  a borda `rename` aplicado seguido de falha no fsync; o recovery marca a
  substituição no instante do rename, restaura também nesse caso e mantém o
  restart seguro mesmo se o fsync do rollback falhar;
- a terceira auditoria independente do hash
  `bae6454ba5ab1cc109ce608e41cb0b849b6266af` emitiu `GO TÉCNICO LOCAL`, sem
  lacuna residual;
- fechamento e produção:
  `docs/audit/101-open-finance-activation-controller-independent-production-close-2026-07-31.md`;
- bateria causal afetada: `92/92` antes do reforço final somente probatório.
- primeiro smoke prompt-only: `new=5`, uma entrega aceita sem id confirmado,
  `writes=0`; política owner-only identificada como bloqueio;
- controlador familiar: `33/33` testes causais e `git diff --check` verde;
  auditoria independente emitiu `GO TÉCNICO LOCAL`.
- auditoria e produção da política familiar:
  `docs/audit/103-open-finance-family-policy-independent-production-close-2026-07-31.md`;
- política pós-aplicação: `changed=0`, health completo, quatro entregas cruzadas
  e `writes=0`.

## Critérios de GO

- plano de ativação identifica todos os estados e rollback;
- flags parciais continuam com zero escrita;
- smoke real prova pergunta, revisão, segunda confirmação, escrita única e
  recibo sem dados de teste residuais;
- replay/restart não duplica;
- health, WhatsApp, Sheets, ledger e dashboard permanecem coerentes;
- evidência recebe auditoria independente antes do GO funcional.

## Condições de parada

- Daniel indisponível para confirmar e conferir o lançamento real;
- identidade do servidor/processo divergente;
- qualquer escrita antes da segunda confirmação;
- falha de health, recibo, reconciliação ou rollback;
- `NO-GO` independente.

## Próxima ação exata

Aguardar uma nova compra genuína observada pelo Pluggy e, com Daniel presente,
executar o smoke de proposta proativa, revisão guiada e ausência de efeito antes
da segunda confirmação. Não reutilizar respostas antigas. A etapa `confirm`
continua bloqueada. O diagnóstico remoto de 2026-08-03T20:00Z encontrou health
verde, release correto e 105 aceitações antigas não confirmadas, mas nenhum
ciclo posterior a 16:46:59Z; esse backlog não é evidência do smoke. Depois da
compra, atualizar o Item no Meu Pluggy e aguardar o próximo ciclo de seis horas.

## Capacidade

`Codex -> Sol -> Medio -> acompanhar o smoke real do recovery com Daniel presente.`
