# Gate 41.5 - candidato de decisoes residuais de entrada

Data: 2026-08-14

## Objetivo

Aplicar somente oito decisoes de entrada confirmadas por Daniel, por ocorrencia
exata, sem criar regra ampla por pagador, valor, data ou descricao parcial.

## Decisoes privadas

As oito ocorrencias pertenciam ao residual bancario ja retido em
`needs_review / income_or_refund`. Daniel classificou uma como presente de
casamento, tres como renda por servicos de arquitetura, uma como entrada sem
finalidade lembrada, uma como reembolso de cota imobiliaria e duas como renda
extra por entrega de mercadorias.

Cada decisao foi vinculada a uma unica referencia privada e validada contra
origem, data, valor e moeda. O catalogo privado passou de 209 para 217 decisoes
e preservou as 208 regras anteriores. Nenhum nome, valor, identificador ou
descricao financeira privada foi incluido no Git.

## Comparacao causal

O config recalculado preservou oito bindings, cobertura completa e zero
escrita financeira. A comparacao integral dos dois planos manteve a mesma
cardinalidade de 2.351 entradas e encontrou exatamente as oito referencias
esperadas como unicas diferencas.

Todas passaram de `needs_review / income_or_refund` para `ready / income`, com
operacao `income.create`, aba `Entradas`, conta financeira e titular ja
vinculados, recorrencia `Nao` e `financial_writes=0`. As categorias finais sao
`Presentes`, `Renda Extra`, `Outros` ou `Reembolso`, conforme a decisao
individual de Daniel.

`existing`, `possible_duplicate`, `excluded` e `outside_window` permaneceram
identicos. `ready` aumentou de 1.762 para 1.770 e `needs_review` caiu de 113
para 105. O plano privado final tem cobertura completa, zero escrita e hash
`d6dd5174cda03fa3375675dfe645b5178c8ad6b79562630d59f7c9ad6b96ecb4`.

## Residual preservado

Depois deste lote, 81 creditos bancarios continuam sem decisao semantica. Os
outros 24 itens em revisao permanecem separados: 16 creditos de cartao sem
vinculo forte, quatro taxas de Pix financiado e quatro moedas nao suportadas.
Transferencias familiares sem par causal, creditos de emprestimo, depositos em
dinheiro e identidades humanas ainda opacas nao foram promovidos.

## Alcance e limites

Nao houve mudanca de codigo de produto, writer, importacao real, alteracao da
planilha, WhatsApp, deploy ou producao. Os artefatos privados permanecem fora
do GitHub; a auditoria independente pode avaliar apenas a consistencia e o
alcance da evidencia sanitizada. O estado maximo antes do parecer e
`candidato aguardando auditoria`.
