# Gate 35 - declaracao de Caixinhas e diagnostico do historico

Data: 2026-08-09

## Declaracao factual

Daniel declarou que todas as posicoes apresentadas pelo Nubank Daniel como
investimentos correspondem a Caixinhas e que nunca utilizou outro produto de
investimento no Nubank.

Consequencia semantica:

- aplicacao e resgate de principal sao transferencias patrimoniais internas;
- principal nao e receita nem despesa;
- somente rendimento comprovado e ganho financeiro.

## Prova privada read-only

A topologia privada mostrou vinte e quatro posicoes somente no Nubank Daniel,
todas normalizadas pelo provedor como `FIXED_INCOME/CDB`. As vinte e quatro
posicoes possuem historico de transacoes indisponivel e zero linhas de historico
ligadas. As outras tres fontes nao apresentam posicoes de investimento neste
snapshot.

A origem permaneceu inalterada e `financial_writes=0`. Nenhum valor, descricao,
data, ID ou referencia privada foi registrado no Git.

## Veredito

A declaracao resolve a natureza economica das posicoes, mas nao substitui o
historico ausente. Agregar os saldos atuais identifica a reserva atual, porem nao
prova aportes, resgates e rendimentos ao longo de toda a janela nem permite
reconstruir o saldo inicial sem inferencia.

O blocker `daniel_nubank:investment_history_unlinked` permanece correto. Nao ha
mudanca segura de produto a aplicar e o Gate 35 continua `PARTIAL_NO_GO`, sem
impedir gates independentes.
