# Gate ativo - Gate 38.3 escrita de estorno/reembolso vinculado

Atualizado em: 2026-08-10

## Estado

`CHARTER LOCAL; SEM IMPLEMENTACAO; SEM DEPLOY`.

## Objetivo

Permitir escrita gradual somente de estorno/reembolso `POSTED/new` cuja
semantica e vinculo com a compra original tenham sido confirmados de forma
duravel, sem transformar credito ambiguo em entrada e sem gravar compra e
estorno que ja foram neutralizados antes do salvamento.

## Escopo

Promocao da decisao duravel `confirm_pair`, proposta cifrada, conferencia
guiada, revalidacao do par e append unico em `Entradas`, somente em testes
locais.

## Origem autorizada

- revisao Gate 36 com `review_kind=refund_link`;
- decisao terminal `confirm_pair` para o unico par apresentado;
- lifecycle atual `refund/POSTED` e reconciliacao atual `new`;
- mesma fonte, alias, geracao, conta, transacao, valor e par de compra;
- compra original ja existente no ledger interno e inequivocamente vinculada.

`unlinked_refund`, `reject_pair`, `not_refund`, `uncertain`, par multiplo,
compra original ainda nao salva e par neutralizado permanecem inelegiveis.

## Invariantes

1. Revisar o vinculo nao constitui consentimento financeiro.
2. Primeiro aceite e conferencia mantem zero escrita.
3. Fonte, revisao, par, ledger e catalogo sao relidos antes do prompt final.
4. O destino e `Entradas`, com categoria de reembolso e conta coerentes com o
   evento; cartao nao pode ser escolhido como conta financeira de entrada.
5. Somente o segundo `sim` pode chamar o writer.
6. Operation key, recibo, replay, restart e resultado incerto preservam no
   maximo um append.
7. O append do reembolso deve manter o vinculo causal necessario para o ledger
   compensar a compra original sem criar receita genuina.
8. Producao continua com escrita desligada.

## Não escopo

- estorno sem compra original unica e observavel;
- compra e estorno ambos ainda nao salvos, ja neutralizados pelo Gate 36;
- transferencia, reserva, rendimento ou entrada genuina;
- alteracao de flags, deploy, restart, Sheets, Pluggy ou WhatsApp reais.

## Critérios de GO

Teste RED/focal, caminho publico, regressao de entradas e compras, uma suite
hermetica ampla final quando o candidato estabilizar, hash imutavel e auditoria
independente. Estado maximo: `GO TECNICO LOCAL; SEM DEPLOY`.

## Condições de parada

- estorno sem compra original unica e ja observavel no ledger;
- par neutralizado ou compra ainda nao salva promovido para escrita;
- segunda tentativa de append no replay ou restart;
- regressao de compra/entrada, falha de teste ou NO-GO independente;
- qualquer mutacao de producao enquanto Daniel estiver ausente.

## Proxima acao

Confirmar o contrato canonico do vinculo de reembolso, escrever testes RED e
implementar promocao/revalidacao fail-closed sem tocar producao.
