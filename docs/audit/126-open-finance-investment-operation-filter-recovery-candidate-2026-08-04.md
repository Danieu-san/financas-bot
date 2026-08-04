# RX-HIST-TIME-INV-01 - recovery do filtro de operacoes de investimento

Data: 2026-08-04

## Base e causa

- candidato auditado: `7a4540b4df7efe01b91720007671953832182d64`;
- veredito independente: `NO-GO` por uma unica lacuna causal;
- causa: o filtro por substring aceitava qualquer `operation_type` contendo
  `APLIC`, inclusive o rotulo adversarial `NAO_APLICAVEL`;
- alcance: filtro puro e prova adversarial; nenhum dado real, deploy ou escrita.

## Recovery

O classificador agora aceita somente prefixos financeiros positivos e ancorados:

- `APLIC_FINANCEIRA` e `APLICACAO_FINANCEIRA`;
- `INVESTIMENTO`;
- `RESGATE`;
- `RENDIMENTO_APLIC_FINANCEIRA`.

O sufixo, quando houver, deve comecar em limite de token `_`. O valor
`NAO_APLICAVEL` nao corresponde ao contrato. Descricoes continuam fora da
decisao e nenhum movimento sem rotulo do provedor e inferido.

## Prova causal

- RED: a fixture com `operation_type=NAO_APLICAVEL` entrou indevidamente no
  subtotal e elevou a contagem de dois para tres;
- GREEN focal: 15/15;
- bateria causal Open Finance: 337/337;
- suite hermetica final posterior ao recovery: 1.469 testes, 1.459 aprovados,
  0 falhas e 10 skips conhecidos;
- cobertura: linhas 90,62%, branches 72,90%, funcoes 90,24%;
- o subtotal preserva os dois rotulos positivos e exclui o falso positivo;
- `financial_writes=0` permanece invariavel.

As contagens sao evidencia local relatada e nao execucao do auditor.

## Arquivos materiais

- `src/openFinance/openFinanceHistoricalRx.js`;
- `tests/openFinanceHistoricalRx.test.js`;
- este manifesto.

## Estado autorizado

`RECOVERY CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`.

Este documento nao autoriza preview privado, planilha, escrita financeira,
deploy, WhatsApp ou producao.
