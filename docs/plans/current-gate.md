# Gate ativo - Gate 38.6 escrita de rendimento de investimento

Atualizado em: 2026-08-10

## Estado

`CANDIDATO LOCAL VERDE; AGUARDANDO AUDITORIA INDEPENDENTE; SEM DEPLOY`.

## Objetivo

Permitir escrita gradual somente de movimentos `POSTED/new` decididos de forma
duravel como `investment_income`, registrando apenas o ganho comprovado e sem
absorver principal, aplicacao ou resgate.

## Escopo

- rendimento como uma entrada financeira unica vinculada a reserva/conta de
  destino inequivoca;
- selecao explicita do destino autorizado, sem transformar principal em ganho;
- revalidacao da fonte, decisao, geracao, catalogo e semantica antes do segundo
  `sim`;
- recibo canonico de ganho e idempotencia em replay, restart e resultado
  incerto;
- somente testes locais.

## Origem autorizada

- revisao Gate 37 com decisao terminal `investment_income`;
- fonte atual `POSTED/new`, credito positivo e sem mudanca de direcao ou valor;
- semantica fornecida pelo provedor ou confirmada explicitamente na revisao;
- destino pertencente ao escopo familiar autorizado.

Principal, aplicacao, resgate, movimento generico, descricao isolada,
transferencia familiar, pagamento de fatura, cartao, entrada genuina, estorno
ou despesa permanecem inelegiveis.

## Invariantes

1. A primeira decisao e a conferencia mantem zero escrita.
2. Somente rendimento comprovado vira ganho; principal nunca vira receita.
3. Cada movimento gera uma unica escrita financeira de entrada.
4. O credito positivo e o destino autorizado nunca podem ser invertidos.
5. O destino deve existir e permanecer autorizado no catalogo atual.
6. Fonte, geracao, revisao, catalogo e reconciliacao sao relidos no final.
7. Somente o segundo `sim` pode chamar o writer.
8. Operation key, recibo, replay, restart e resultado incerto preservam no
   maximo uma tentativa de append.
9. Producao continua com escrita desligada.

## Não escopo

- aplicacao e resgate de reserva, encerrados no Gate 38.5;
- reconstruir o historico de Caixinhas bloqueado no Gate 35;
- alterar flags, deployar, reiniciar ou acessar Sheets, Pluggy e WhatsApp reais.

## Critérios de GO

Teste RED/focal, caminho publico, regressao das classes anteriores, uma unica
suite hermetica ampla final, hash imutavel e auditoria independente. Estado
maximo: `GO TECNICO LOCAL; SEM DEPLOY`.

## Condições de parada

- semantica, direcao ou destino ambiguos;
- principal absorvido como rendimento ou escrita dupla;
- segunda tentativa de append em replay/restart;
- regressao anterior, falha de teste ou `NO-GO` independente;
- qualquer mutacao de producao enquanto Daniel estiver ausente.

## Proxima acao

Publicar o candidato sanitizado em hash imutavel e fazer uma unica auditoria
independente. Somente um `GO` pode encerrar tecnicamente o Gate 38.6; este gate
nao autoriza deploy isoladamente.

## Evidencia do candidato

- focal `3/3`;
- caminho publico real `1/1`;
- causal afetada `223/223`;
- suite hermetica ampla `1628/1618/0/10`, com skips previstos;
- manifesto: `docs/audit/213-open-finance-investment-income-write-candidate-2026-08-10.md`.
