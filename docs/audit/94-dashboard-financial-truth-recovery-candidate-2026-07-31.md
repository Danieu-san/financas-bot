# DASH-DATA-01 — recovery após NO-GO independente

Data: 2026-07-31

Base imutável reprovada:
`7e16c75708f34765fce28911761052093de057e0`.

## Estado

`CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`.

O Chat leu integralmente os dez arquivos do primeiro candidato e emitiu
`NO-GO`. Este recovery não autoriza deploy, restart, alteração de flags,
produção ou promoção do dashboard v2.

## Achados reproduzidos

1. **ALTA — identidade da fatura:** quando a fotografia Open Finance não
   continha fatura formal, o dashboard v2 reutilizava itens de previsão com
   domínio `invoice` como se fossem a fatura atual.
2. **ALTA — filtro público:** `accounts` e `forecast` retornavam antes da
   aplicação de `excludePublicTestMarkers`; portanto, marcadores controlados
   podiam participar de contagem e soma.
3. **ALTA — cobertura de escopo:** mapeamentos autorizados sem registro no
   staging eram descartados, permitindo que os registros restantes parecessem
   uma fotografia completa.
4. **MÉDIA — completude dos limites:** `used_limit_cents` ausente não tornava o
   bloco de cartões parcial.

Os quatro contratos falharam antes da correção.

## Correção mínima

- ausência de fatura formal agora produz `invoices.status=unavailable`,
  `total=null` e razão explícita; itens previstos permanecem somente no bloco
  `forecast`;
- contas e previsões removem marcadores controlados das linhas canônicas antes
  de qualquer filtro, limite, contagem ou soma, somente quando a superfície
  pública solicita a exclusão;
- a mesma consulta sem `excludePublicTestMarkers` continua observando a fonte
  integral, provando que nada foi apagado;
- qualquer mapeamento autorizado sem registro torna contas e cartões parciais;
- `used_limit_cents` ausente torna o bloco de cartões parcial e preserva
  `usedLimit=null`.

## Evidência executada pelo Codex

- RED causal: quatro falhas correspondentes aos quatro contratos acima;
- focal final:
  `node --test --test-concurrency=1 tests/dashboardFinancialTruthService.test.js tests/dashboardPublicDataFilter.test.js tests/dashboardV2SummaryService.test.js`;
  resultado `15/15`;
- bateria afetada:
  `node --test --test-concurrency=1 tests/dashboardApiContracts.test.js tests/dashboardFinancialTruthService.test.js tests/dashboardPublicDataFilter.test.js tests/dashboardV2SummaryService.test.js tests/financialAgent.test.js tests/phase4ExitGate.test.js tests/phase5ExitGate.test.js`;
  resultado `123/123`;
- suíte hermética:
  `npm test`;
  resultado `1.398` testes, `1.393` aprovados, zero falha e cinco skips
  esperados;
- sintaxe dos seis arquivos JavaScript alterados: verde;
- `git diff --check`: verde.

## Invariantes preservadas

- staging continua SQLite somente leitura;
- escopo financeiro continua derivado dos usuários autorizados;
- saldo, resultado econômico, fatura formal, previsão e limites permanecem
  conceitos distintos;
- fonte ausente ou incompleta não vira zero nem fotografia completa;
- consultas normais do bot não recebem o filtro público implicitamente;
- dados de origem e evidências `TESTE_APAGAR` não são removidos;
- o comando `dashboard` continua no v1 e v2 permanece opt-in.

## Critério de fechamento

Reauditoria independente do novo hash imutável deve confirmar os quatro
fechamentos, a ordem pré-agregação do filtro, a preservação da fonte e a ausência
de nova lacuna indispensável. Sem esse parecer, o estado máximo permanece
`candidato aguardando auditoria`.
