# 137 - RX historico: prova causal do limite de posicoes

Data: 2026-08-05

## Escopo

Recovery exclusivamente probatorio de `RX-HIST-INVESTMENT-LINKAGE-01` sobre o
hash `260ff76986fc98682317c1570a3dc760e870045f`. Nenhum codigo de produto foi
alterado neste recovery.

## NO-GO independente anterior

A reauditoria confirmou que o produto fecha todas as propriedades funcionais
solicitadas e nao encontrou defeito critico ou alto. O unico achado foi medio e
probatorio: o teste do limite de posicoes exigia a rejeicao final, mas nao
obrigava explicitamente que ela ocorresse antes de qualquer chamada a
`/investments/{id}/transactions`.

## Recovery

O teste instala um tripwire na fronteira HTTP, conta qualquer request ao
historico por posicao, excede `maxInvestmentPositions`, exige a rejeicao
`pluggy_investment_position_limit` e depois exige contador igual a zero. Assim,
a prova falha se uma refatoracao mover o gate para depois da primeira coleta.

## Evidencia local

- syntax check da suite alterada: verde;
- teste focal conjunto: 39/39;
- `git diff --check`: verde;
- a suite hermetica final do codigo de produto permanece a do hash anterior:
  1.484 testes, 1.474 aprovados, zero falhas e 10 skips conhecidos;
- a suite ampla nao foi repetida porque este recovery altera somente uma
  assercao de teste, sem mudar produto ou causalidade de runtime;
- nenhuma rede real, dado privado, escrita financeira ou acao de producao.

## Arquivos da reauditoria

- `docs/audit/137-open-finance-investment-position-limit-proof-candidate-2026-08-05.md`;
- `src/openFinance/pluggyReadOnlyClient.js`;
- `tests/openFinancePluggyReadOnly.test.js`.

## Alcance

O estado maximo permanece candidato local aguardando auditoria independente.
Este recovery nao autoriza chamada Pluggy live, previa privada, salvamento,
planilha, deploy ou producao.
