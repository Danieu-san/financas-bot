# Gate ativo — PROD-ACT-01 ativação funcional Open Finance

Atualizado em: 2026-08-03

## Estado

`POLÍTICA FAMILIAR ATIVA; DEPENDENCY SECURITY RECOVERY CANDIDATE; AUDITORIA
INDEPENDENTE PENDENTE; CONFIRM BLOQUEADO`.

O preflight de release encontrou duas vulnerabilidades altas transitivas no
grafo de produção. O hash funcional aprovado não foi promovido. O recovery
altera somente o lockfile, atualiza `brace-expansion` e `js-yaml`, zera o audit
atual e preserva a suíte exaustiva verde. Evidência:
`docs/audit/107-runtime-dependency-security-recovery-candidate-2026-08-03.md`.

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

Publicar o recovery de dependências em hash imutável e submetê-lo à auditoria
independente. Somente após GO construir e promover esse novo hash na OCI. A
etapa `confirm` continua bloqueada.

## Capacidade

`Codex -> Sol -> Alto -> promover o hash auditado na OCI e validar o estado seguro.`
