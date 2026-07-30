# Pós-9P.4 — caracterização da composição operacional de escrita

Atualizado em: 2026-07-30

Base:
`10c7dc025938c4206e92996a4dbc94709f9687c5`.

## Veredito

`LACUNA OPERACIONAL CONFIRMADA`.

Os componentes locais da proposta proativa estão tecnicamente encerrados, mas
o runtime não possui uma combinação autorizada de configuração que conecte a
pergunta à finalização confirmada:

1. `saveProposalConfiguration()` permite
   `OPEN_FINANCE_SAVE_PROPOSAL_MODE=prompt` somente com
   `OPEN_FINANCE_WRITE_MODE=off`;
2. `finalizationConfiguration()` habilita a segunda confirmação e o writer
   somente com `prompt + confirm`;
3. `buildOpenFinanceRolloutPolicy()` bloqueia todo write mode diferente de
   `off`;
4. o entregador do canário exige uma política cujo
   `can_write_financial` seja estritamente `false`;
5. `.env.example` declara corretamente que `confirm` ainda existe somente para
   gate local.

Logo, o fluxo completo aprovado em testes não pode ser ligado por configuração
de produto sem contradizer pelo menos uma dessas fronteiras.

## Escopo do recovery

- manter todos os defaults em `off`;
- centralizar a decisão de autorização da escrita confirmada;
- exigir simultaneamente canário de alerta, reconciliação, preview, proposta
  `prompt`, write mode `confirm` e aprovação explícita separada;
- fazer combinações parciais ou desconhecidas falharem fechado;
- permitir que o entregador apenas proponha, sempre com zero escrita;
- habilitar o writer somente depois da segunda confirmação;
- preservar rollback por flags e estados duráveis pendentes;
- provar a composição sem Google, Pluggy, WhatsApp ou produção reais.

## Não escopo

- alterar flags reais;
- deploy, restart ou acesso à Oracle/OCI;
- escrita financeira real;
- ampliar fontes, usuários ou o casal autorizado;
- remover a rota read-only existente;
- tratar este recovery como autorização operacional.

## Critério de fechamento

O gate exige testes causais verdes, commit sanitizado e reauditoria independente
no Chat. Mesmo com `GO TÉCNICO LOCAL`, ativação e deploy continuarão dependendo
de decisão operacional separada.
