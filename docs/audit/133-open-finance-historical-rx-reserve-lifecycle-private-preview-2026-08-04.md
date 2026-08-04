# 133 - Resultado sanitizado da previa privada de reserva/lifecycle

Data: 2026-08-04

## Pre-condicao

- codigo auditado no hash `95b56590f516e4df34ae9293b9a482c12394cc44`;
- `GO TECNICO LOCAL` independente do identificador e contrato read-only;
- nova copia privada local com cinco arquivos e checksums conferidos;
- lifecycle declara todas as contas bancarias existentes em `2025-07-01` e o
  cartao Itau inexistente nessa data, sem inventar `availableFrom`.

## Resultado sanitizado

- gate publicado: `RX-HIST-RESERVE-LIFECYCLE-01`;
- nove segmentos;
- `ready_for_reconciliation=false`;
- `financial_writes=0`;
- arquivos privados byte a byte inalterados;
- nenhuma chamada Pluggy live, planilha, deploy, OCI, WhatsApp ou producao;
- nenhum ID, valor, saldo, data ou descricao privado levado ao Git.

## Blockers

1. `cristina_nubank:installment_series_ambiguous`;
2. `daniel_nubank:investment_history_unlinked`;
3. `daniel_nubank:investment_movement_semantics_ambiguous`.

O terceiro blocker cobre 22 movimentos agregados com o rotulo de provedor
`RESGATE_APLIC_FINANCEIRA` e direcao incompatível com a regra assumida. Eles
permaneceram nos movimentos brutos, fora de aplicacao, resgate ou rendimento.
O antigo `thais_itau:account_start_unknown` desapareceu e nenhuma atividade
anterior ao lifecycle declarado foi encontrada.

## Proximo criterio

Nao alterar a regra de sinal por inferencia. Consultar fonte primaria do
provedor e manter reconciliacao bloqueada ate haver evidencia suficiente.
