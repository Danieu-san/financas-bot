# 131 - RX historico: reserva patrimonial e lifecycle

Data: 2026-08-04

## Escopo

Candidato local de `RX-HIST-RESERVE-LIFECYCLE-01`, baseado em
`f1d3f4f9208a6e0a408c396ac320d96bc5f50882`. Nenhum dado privado, chamada
Pluggy, planilha, deploy, OCI, WhatsApp ou escrita financeira pertence a este
gate.

## Fatos de dominio fornecidos pelo usuario

- todas as contas bancarias do inventario familiar existiam em `2025-07-01`;
- o cartao Itau da Thais nao existia no inicio e passa a existir durante o RX;
- Caixinha e reserva/investimento: aplicar e resgatar sao transferencias
  patrimoniais internas, enquanto rendimento e ganho;
- parcela ambigua deve ser resolvida antes de qualquer salvamento.

## Contrato do candidato

- conta e cartao mantem lifecycles independentes;
- atividade anterior a `availableFrom` declarado bloqueia e nao entra no RX;
- atividade posterior entra normalmente;
- movimentos brutos continuam compondo a reconstrucao de saldo;
- aplicacao e resgate rotulados pelo provedor sao excluidos dos subtotais nao
  patrimoniais e nunca classificados como receita/despesa;
- rendimento rotulado permanece ganho;
- rotulo generico ou direcao incompatível gera blocker sem inferencia por
  descricao;
- serie de parcela ambigua recebe
  `save_eligibility=blocked_pending_identity_resolution`;
- todo o RX permanece `write_mode=read_only` e `financial_writes=0`.

## Evidencia local

- teste focal: 21/21;
- bateria causal Open Finance: 343/343;
- suite hermetica ampla: 1.475 testes, 1.465 aprovados, 0 falhas e 10
  skips conhecidos; cobertura 90,64% linhas, 73,02% branches e 90,28% funcoes;
- auditoria independente por hash imutavel: pendente.

## Alcance

Mesmo com testes verdes, este documento descreve apenas candidato local. Nao
autoriza previa privada, salvamento operacional, deploy ou producao antes da
auditoria independente.
