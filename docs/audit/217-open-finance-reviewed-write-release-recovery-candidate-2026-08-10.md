# Gate 39 - recovery da ativacao e do rollback write-off

Data: 2026-08-10

## Origem

O candidato documental `a26e6373084756c1806a63ad1c063242be94f028`
recebeu `NO-GO` independente com dois achados `ALTO` no controlador:

1. `confirm` podia partir de proposta `off` e ligar `prompt` no mesmo passo;
2. `write-off` exigia canarios, stores e pre-health, podendo ser recusado
   justamente durante degradacao.

A composicao das seis classes foi considerada suficiente e nao recebeu
achados.

## Recovery

- `confirm` exige que o estado corrente seja exatamente proposta `prompt`,
  escrita `off` e aprovacao `false` antes de construir o plano;
- o controlador nao pode mais saltar diretamente de proposta `off` para
  escrita habilitada;
- apenas `prompt` e `confirm` exigem canarios e stores disponiveis;
- `write-off` continua produzindo proposta `prompt`, escrita `off` e aprovacao
  `false`, mas pode ser planejado com canarios ou stores degradados;
- `write-off` ignora o pre-health para poder desligar escrita em incidente;
- se o health posterior falhar, o `.env` seguro nao e restaurado para o estado
  anterior `confirm`; o controlador sinaliza degradacao mantendo
  `write=off/approved=false` no arquivo duravel.

Commit, inventario PM2, backup privado, troca atomica, restart e tentativa de
health posterior permanecem exigidos. As mudancas nao alteram writers nem a
semantica das seis classes.

## Evidencia local

- sintaxe do controlador e do teste: verde;
- focal do controlador: `13/13`;
- adversarial novo: `confirm` vindo de proposta `off` falha fechado;
- adversarial novo: `write-off` funciona sem canario/store/pre-health e nunca
  restaura `confirm` depois de health degradado;
- unica suite hermetica ampla apos o recovery: `1630/1620/0/10`, zero falhas;
- cobertura: linhas `91,28%`, branches `73,78%`, funcoes `90,92%`;
- workflow e diff check: verdes.

As contagens sao execucao local relatada pelo Codex, nao execucao do auditor.

## Perguntas de reauditoria

1. O salto causal `off -> confirm` foi fechado pela exigencia do estado
   corrente `prompt/off/false`?
2. `write-off` permanece disponivel sob degradacao de canarios, stores e
   pre-health e evita restaurar a configuracao habilitada?
3. Permanece alguma lacuna causal indispensavel antes de iniciar o preflight
   OCI, sem autorizar deploy por esta revisao?

Estado maximo: `RECOVERY LOCAL VERDE; AGUARDANDO NOVO HASH E REAUDITORIA; SEM DEPLOY`.
