# Gate 41.3 - candidato de reconciliacao do catalogo recorrente

Data: 2026-08-14

## Objetivo

Registrar de forma sanitizada a substituicao de um favorecido mensal no
catalogo operacional e provar que o recalculo privado alterou somente a
classificacao e a marcacao de recorrencia da ocorrencia correspondente.

## Estado final observado

- a linha recorrente preexistente foi atualizada; nenhuma regra alternativa ou
  duplicada permaneceu;
- vencimento, valor esperado, escopo de usuario e ativacao foram preservados;
- categoria e subcategoria finais: `Educacao / CURSOS / ESTUDOS`;
- a captura final foi somente leitura e retornou as mesmas contagens das faixas
  financeiras anteriores; `Contas` voltou de 15 para 14 linhas apos a remocao
  da duplicacao intermediaria;
- o config privado final preservou 1.098 decisoes e 208 regras;
- o plano privado final preservou 2.357 entradas e o resumo de 71 `ready`, 18
  `excluded`, zero `needs_review` e 2.268 `outside_window`;
- cobertura completa e `financial_writes=0` foram preservados;
- hash privado final:
  `1fb4e50f4290ea59fe6b56b2143578df671e0cafc41fe99da162554e7fefee23`.

## Comparacao causal

A comparacao por `source_ref` entre o plano fechado do Gate 41.2 e o plano
recalculado exigiu a mesma cardinalidade e encontrou exatamente uma entrada
alterada. Nessa entrada, somente tres campos do `write_plan` mudaram:

1. categoria anterior para `Educacao`;
2. subcategoria anterior para `CURSOS / ESTUDOS`;
3. recorrencia de `Nao` para `Sim`.

Depois de normalizar esses tres campos, os objetos ficaram identicos. O resumo
dos planos tambem permaneceu identico. Nenhuma descricao, valor, identificador
de usuario, conta ou favorecido privado foi publicado neste documento.

## Caminhos rejeitados

Uma reconstrucao intermediaria baseada em catalogo de decisoes anterior omitiu
23 decisoes incrementais e produziu 14 revisoes indevidas. Ela foi rejeitada
antes de qualquer uso. Uma versao intermediaria que mantinha dois aliases para
a mesma mensalidade tambem foi descartada; o snapshot e o plano finais foram
recriados somente depois da substituicao simples solicitada.

## Validacao proporcional

Nao houve mudanca de codigo de produto. Por isso, suites causais e amplas ja
verdes nao foram repetidas. A evidencia nova e composta por:

- leitura dirigida da linha final e confirmacao de ausencia da linha extra;
- captura consolidada somente leitura;
- invariantes de cardinalidade do config;
- execucao unica do planejador real;
- comparacao integral das entradas por referencia;
- verificacao de cobertura completa e zero escrita financeira.

## Limites

Os dados privados e a planilha real nao fazem parte do GitHub. A auditoria por
hash pode avaliar a consistencia, suficiencia e alcance desta evidencia
sanitizada, mas nao deve alegar leitura independente dos artefatos privados.
Este candidato nao autoriza writer historico, importacao real, WhatsApp, deploy
ou producao.
