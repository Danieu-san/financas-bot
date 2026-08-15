# Gate 41.4 - candidato de decisoes historicas de entrada

Data: 2026-08-14

## Objetivo

Aplicar por ocorrencia somente entradas ja confirmadas como salario ou ligadas
ao casamento, sem presumir semantica para os demais creditos bancarios.

## Agrupamento privado

As 147 entradas ou estornos residuais foram atribuidas exatamente uma vez a
classes semanticas privadas. O agrupamento separou salario confirmado,
casamento confirmado, transferencia propria ou familiar, credito de emprestimo,
deposito em dinheiro e pagadores ainda sem semantica. Ele permaneceu fora do
Git e registrou `financial_writes=0`.

## Decisoes aplicadas

- 33 ocorrencias reproduzem os dois padroes salariais confirmados por Daniel na
  rodada incremental: mesma origem, descricao e tipo operacional;
- a fronteira de casamento foi definida exatamente por Daniel: todas as 23
  entradas de 2025-08-07 e os dois repasses do provedor de lista de casamento;
- nenhuma outra data proxima entrou pela inferencia inicial;
- cada ocorrencia recebeu decisao privada exata: 33 `income / Salario` e 25
  `income / Presentes`;
- nenhuma regra por valor, data aproximada ou nome parcial foi criada;
- o catalogo privado passou de 151 para 209 decisoes e preservou 208 regras;
- o config preservou oito bindings, cobertura completa e zero escrita.

## Comparacao causal

A comparacao por `source_ref` entre o plano anterior e o final exigiu a mesma
cardinalidade de 2.351 entradas. Exatamente as 58 referencias esperadas
mudaram de `needs_review / income_or_refund` para `ready / income`, com
operacao `income.create`, aba `Entradas`, categoria `Salario` ou
`Presentes`, recorrencia `Nao` e `financial_writes=0`.

Os campos `existing`, `possible_duplicate`, `excluded` e
`outside_window` do resumo permaneceram identicos. `ready` aumentou em 58 e
`needs_review` caiu em 58. O plano final tem 1.762 prontos, 113 em revisao,
cobertura completa e hash privado
`cfd0df66c4753d376ab03847fd376112af7d9703a482c70b4336e8e08e8e1fc3`.

## Itens preservados em revisao

Quinze creditos com remetente proprio ou do casal nao foram transformados em
receita. A busca por debito de mesmo valor em ate dois dias nas contas
vinculadas retornou zero pares. Tres creditos de emprestimo, sete depositos em
dinheiro e outros 64 creditos humanos, empresariais ou sem pagador tambem
permanecem fora destas 58 decisoes. Juntos, sao 89 creditos bancarios ainda sem
decisao; os outros 24 residuais do plano pertencem a gates de cartao, taxa e
moeda.

## Alcance e limites

Nao houve mudanca de codigo de produto nem motivo para repetir suites verdes.
Os artefatos privados nao estao no GitHub; a auditoria pode avaliar apenas a
consistencia e o alcance da evidencia sanitizada. Este candidato nao autoriza
writer, importacao real, alteracao da planilha, WhatsApp, deploy ou producao.
