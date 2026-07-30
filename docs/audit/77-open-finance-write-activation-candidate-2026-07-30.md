# Pós-9P.4 — candidato de ativação fail-closed da escrita

Atualizado em: 2026-07-30

Base:
`10c7dc025938c4206e92996a4dbc94709f9687c5`.

## Veredito local

`CANDIDATO LOCAL VERDE; AUDITORIA INDEPENDENTE PENDENTE`.

Este recovery elimina a contradição operacional caracterizada em
`docs/audit/76-open-finance-write-activation-characterization-2026-07-30.md`
sem ativar flags ou acessar produção.

## Contrato implementado

A decisão compartilhada em
`src/openFinance/openFinanceWriteActivationPolicy.js` mantém escrita desligada
por padrão. `OPEN_FINANCE_WRITE_MODE=confirm` somente fica habilitado quando
todos estes controles coexistem:

1. alerta `canary`;
2. proposta `prompt`;
3. preview `canary`;
4. reconciliação `canary`;
5. aprovação separada `OPEN_FINANCE_WRITE_APPROVED=true`.

Modo de escrita desconhecido e qualquer combinação parcial falham fechado. O
rollback para `OPEN_FINANCE_WRITE_MODE=off` preserva o canário read-only e
remove a capacidade de escrita.

## Fronteiras causais

- o inicializador valida a combinação antes de instalar timers;
- a política de rollout só expõe `can_write_financial=true` com a combinação
  completa e com os controles preexistentes de evidência, vault e destinatário;
- o entregador aceita a política habilitada, mas continua apenas enviando a
  proposta e retorna `financial_writes=0`;
- conversa e finalização consultam a mesma decisão;
- somente a segunda confirmação explícita alcança o writer 9P.4 já idempotente,
  revalidado e user-scoped;
- a desativação não converte nem apaga estado durável.

## Evidência executada pelo Codex

- RED dirigido: `16/18`, com as duas falhas esperadas na composição impossível;
- GREEN dirigido: `18/18`;
- causal afetada: `71/71`;
- bateria Open Finance completa, sequencial: `280/280`;
- máquina de estados e suíte unitária, sequencial: `330/330`;
- sintaxe, `git diff --check` e workflow portátil: verdes.

Essas contagens são evidência local relatada. A auditoria no Chat é estática e
não deve tratá-las como execução própria.

## Limites

- nenhuma flag real foi alterada;
- nenhuma chamada real a Google, Pluggy ou WhatsApp foi feita;
- nenhum deploy, restart ou acesso à OCI ocorreu;
- produção deve permanecer com escrita `off` e aprovação `false` ou ausente;
- este gate não autoriza ativação operacional nem deploy.

## Perguntas para a revisão independente

1. A decisão compartilhada mantém defaults e combinações parciais fail-closed?
2. A política completa é a única que concede capacidade financeira?
3. Polling e entrega continuam incapazes de gravar?
4. Conversa e finalização exigem o mesmo gate antes da segunda confirmação?
5. Os testes exercitam o código de produto e provam rollback e zero escrita
   antes da confirmação?
6. Há lacuna causal indispensável dentro deste gate local?
