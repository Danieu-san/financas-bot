# Gate ativo - Gate 38.4 escrita de transferencia interna pareada

Atualizado em: 2026-08-10

## Estado

`CHARTER LOCAL; SEM IMPLEMENTACAO; SEM DEPLOY`.

## Objetivo

Permitir escrita gradual somente de transferencia interna `POSTED/new` cujas
duas pontas tenham sido fortemente pareadas e confirmadas de forma duravel,
preservando origem, destino e impacto patrimonial neutro.

## Escopo

Promocao da decisao duravel `confirm_transfer_pair`, proposta cifrada,
conferencia guiada, revalidacao das duas pontas e uma unica linha na aba de
transferencias, somente em testes locais.

## Origem autorizada

- revisao Gate 37 com `review_kind=transfer`;
- decisao terminal `confirm_transfer_pair` para o unico par forte apresentado;
- duas pontas atuais `POSTED/new`, uma debito e outra credito de mesmo valor;
- mesma familia autorizada e duas contas financeiras inequivocas;
- identidade forte do par, sem inferencia por descricao.

Transferencia nao pareada, `reject_transfer_pair`, `uncertain`, conta ausente,
cartao, pagamento de fatura, aplicacao/resgate de Caixinha, rendimento, entrada
genuina ou despesa permanecem inelegiveis.

## Invariantes

1. Confirmar o par semantico nao constitui consentimento financeiro.
2. Primeiro aceite e conferencia mantem zero escrita.
3. Fonte, revisao, par e catalogo sao relidos antes do prompt final.
4. Origem e destino sao contas distintas, autorizadas e nunca intercambiadas.
5. Uma transferencia gera um unico registro com origem e destino, nao duas
   receitas/despesas.
6. Impacto liquido em receita/despesa e verba livre permanece zero.
7. Somente o segundo `sim` pode chamar o writer.
8. Operation key, recibo, replay, restart e resultado incerto preservam no
   maximo uma tentativa de append.
9. Producao continua com escrita desligada.

## Nao escopo

- transferencia sem par forte ou entre fontes fora do escopo familiar;
- Caixinha, reserva, rendimento, pagamento de fatura, cartao ou PIX externo;
- alteracao de flags, deploy, restart, Sheets, Pluggy ou WhatsApp reais.

## Criterios de GO

Teste RED/focal, caminho publico, regressao de compra/entrada/reembolso, uma
suite hermetica ampla final quando o candidato estabilizar, hash imutavel e
auditoria independente. Estado maximo: `GO TECNICO LOCAL; SEM DEPLOY`.

## Condicoes de parada

- ausencia de duas pontas atuais, contas inequivocas ou identidade forte;
- qualquer gravacao dupla ou impacto em receita, despesa ou verba livre;
- segunda tentativa de append no replay ou restart;
- regressao de classe anterior, falha de teste ou NO-GO independente;
- qualquer mutacao de producao enquanto Daniel estiver ausente.

## Proxima acao

Mapear a decisao `confirm_transfer_pair` e o contrato atual de escrita de
`Transferencias`, definir o teste RED causal e implementar somente o Gate 38.4.
