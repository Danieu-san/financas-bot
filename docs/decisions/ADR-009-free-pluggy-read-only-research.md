# ADR-009: Pluggy gratuito e somente leitura para o FinancasBot familiar

## Status

Aceito para 9A e POC sandbox. Producao/contas reais ainda nao autorizadas.

## Data

2026-07-15.

## Contexto verificado

A pagina oficial de precos informa que a API comercial de Dados parte de
R$ 2.500/mes e oferece teste de producao por 14 dias. Esse custo nao e adequado
ao FinancasBot familiar.

A mesma pagina confirma um caminho gratuito para uso pessoal: o Conector 200
acessa via API os dados que o proprio usuario ja conectou no Meu Pluggy. A
Pluggy alerta que esse caminho nao tem SLA/contrato, webhooks, categorizacao
comercial nem portabilidade de historico para o plano pago.

Fontes oficiais consultadas:

- https://www.pluggy.ai/precos
- https://docs.pluggy.ai/docs/sandbox
- https://docs.pluggy.ai/docs/consent-management-delete-an-item
- https://docs.pluggy.ai/docs/consents
- https://docs.pluggy.ai/docs/creating-an-item
- https://docs.pluggy.ai/docs/transactions

## Decisao

1. O requisito comercial e custo recorrente zero.
2. A API comercial de Dados fica `NO-GO` enquanto exigir mensalidade.
3. A 9B usara primeiro o sandbox oficial, apenas com dados ficticios.
4. O candidato para uso familiar real e Meu Pluggy + Conector 200.
5. Daniel e Thais devem possuir contas/consentimentos separados. Uma conta Meu
   Pluggy nunca autoriza ou centraliza os dados da outra pessoa.
6. O FinancasBot nao guarda credenciais bancarias.
7. Dados do provedor entram apenas em staging append-only e nunca criam ou
   alteram lancamentos automaticamente.
8. Revogacao deve ser acessivel e remover a referencia local do Item. No fluxo
   comercial/sandbox, `DELETE /items/{id}` e o contrato de referencia.
9. Links one-use de consentimento nao serao enviados diretamente por WhatsApp,
   pois previews automaticos podem consumi-los. Usar abertura iniciada pelo
   usuario em pagina controlada, se a POC real for autorizada.
10. Nenhum cadastro pago, compra ou conexao bancaria real sera feito sem nova
    autorizacao explicita.

## Gate da 9B

- sandbox sem segredo no repositorio;
- contas, transacoes, cartoes/faturas e erros em staging;
- idempotencia de webhooks/polling simulados;
- exclusao/revogacao simulada;
- zero escrita financeira;
- saida publica sanitizada;
- adapter permite abandonar Pluggy sem alterar o ledger.

## Criterio de parada

Se o Conector 200 deixar de ser gratuito, nao expuser os dados necessarios ou
exigir compartilhar a mesma conta entre Daniel e Thais, o projeto para antes de
qualquer conexao real e solicita nova decisao.
