# Gate ativo - Gate 38.5 escrita de aplicacao e resgate de reserva

Atualizado em: 2026-08-10

## Estado

`CANDIDATO LOCAL VERDE; AGUARDA AUDITORIA INDEPENDENTE; SEM DEPLOY`.

## Objetivo

Permitir escrita gradual somente de movimentos `POSTED/new` decididos de forma
duravel como `reserve_application` ou `reserve_redemption`, preservando
principal e neutralidade patrimonial.

## Escopo

- aplicacao: uma transferencia unica da conta bancaria para a reserva;
- resgate: uma transferencia unica da reserva para a conta bancaria;
- selecao explicita da conta financeira e da reserva inequivoca;
- revalidacao da fonte, decisao, geracao, catalogo e semantica antes do segundo
  `sim`;
- recibo canonico neutro e idempotencia em replay, restart e resultado incerto;
- somente testes locais.

## Origem autorizada

- revisao Gate 37 com `review_kind=reserve`;
- decisao terminal `reserve_application` ou `reserve_redemption`;
- fonte atual `POSTED/new`, sem mudanca de direcao ou valor;
- semantica fornecida pelo provedor ou confirmada explicitamente na revisao;
- conta bancaria e reserva pertencentes ao escopo familiar autorizado.

Rendimento, movimento generico, descricao isolada, transferencia familiar,
pagamento de fatura, cartao, entrada genuina ou despesa permanecem inelegiveis.

## Invariantes

1. A primeira decisao e a conferencia mantem zero escrita.
2. Aplicacao e resgate nunca viram receita, despesa ou verba livre.
3. Cada movimento gera uma unica linha em `Transferencias`.
4. A direcao conta->reserva ou reserva->conta nunca pode ser invertida.
5. Conta e reserva devem existir, estar autorizadas e ser distintas.
6. Fonte, geracao, revisao, catalogo e reconciliacao sao relidos no final.
7. Somente o segundo `sim` pode chamar o writer.
8. Operation key, recibo, replay, restart e resultado incerto preservam no
   maximo uma tentativa de append.
9. Producao continua com escrita desligada.

## Nao escopo

- rendimento de investimento, reservado ao Gate 38.6;
- reconstruir o historico de Caixinhas bloqueado no Gate 35;
- alterar flags, deployar, reiniciar ou acessar Sheets, Pluggy e WhatsApp reais.

## Criterios de GO

Teste RED/focal, caminho publico, regressao das classes anteriores, uma unica
suite hermetica ampla final, hash imutavel e auditoria independente. Estado
maximo: `GO TECNICO LOCAL; SEM DEPLOY`.

## Condicoes de parada

- semantica, direcao, conta ou reserva ambiguas;
- principal absorvido por receita/despesa ou escrita dupla;
- segunda tentativa de append em replay/restart;
- regressao anterior, falha de teste ou `NO-GO` independente;
- qualquer mutacao de producao enquanto Daniel estiver ausente.

## Evidencia do candidato

- focal `6/6`;
- caminho publico real `1/1`;
- causal afetada `246/246`;
- suite hermetica ampla `1624/1614/0/10`, com skips previstos;
- manifesto: `docs/audit/210-open-finance-reserve-write-candidate-2026-08-10.md`.

## Proxima acao

Publicar o commit sanitizado, auditar o hash imutavel no Chat e somente um `GO`
independente pode encerrar tecnicamente o Gate 38.5 ou autorizar promocao.
