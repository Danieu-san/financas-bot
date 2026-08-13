# Gate 41 - catalogo de contas recorrentes no RX historico

Data: 2026-08-12

## Escopo

Este candidato corrige uma lacuna de fonte no planejamento historico read-only:
o snapshot sanitizado da planilha consultava movimentos, categorias, cartoes e
contas financeiras, mas nao capturava o catalogo `Contas`, usado pelo produto
para classificar pagamentos recorrentes ja cadastrados.

O gate nao escreve na planilha, nao ativa o writer historico e nao altera o
contrato de conciliacao, duplicidade, conta ou cartao.

## Mudanca

- `runOpenFinanceHistoricalSheetSnapshot.js` passa a exigir `Contas!A:I`;
- o configurador reutiliza `applyAccountClassificationRules`, funcao real do
  produto, para obter sugestoes do catalogo recorrente ativo;
- regra inativa continua ignorada pelo produto;
- correspondencias conflitantes falham fechado e nao produzem sugestao;
- regra de um unico termo exige contexto de pagamento ou servico para impedir
  que nome curto de prestador classifique compra de loja por coincidencia;
- categoria historica exata da planilha conserva precedencia sobre o catalogo;
- quando o catalogo tambem reconhece a linha, a recorrencia e preservada mesmo
  que a categoria venha da evidencia historica exata;
- somente linhas bancarias de saida recebem `Recorrente=Sim`; cartoes nao
  recebem campo sintetico inexistente em seu schema.

## Evidencia local

- RED focal inicial comprovou ausencia do range, da sugestao recorrente e do
  indicador na linha planejada;
- bateria focal final: 56/56 testes verdes;
- bateria historica ampla unica apos estabilizacao: 127/127 testes verdes;
- `git diff --check` sem erro;
- recalculo privado com oito vinculos, cobertura completa e 82 sugestoes
  recorrentes registradas;
- verificacao privada confirmou que os grupos ja cadastrados deixaram a fila
  residual e que pagamentos recorrentes mantiveram o indicador esperado;
- `financial_writes=0` no configurador, no plano e na fila de revisao.

## Controles adversariais

1. Duas regras ativas conflitantes para a mesma descricao nao classificam.
2. Uma regra curta nao classifica compra comercial sem contexto de pagamento.
3. A mesma regra classifica descricao explicita de fatura ou servico.
4. Evidencia historica exata vence na categoria sem apagar a recorrencia.
5. O snapshot falha fechado se o catalogo `Contas` nao estiver presente.
6. O planejador permanece puro e retorna zero escritas financeiras.

## Alcance do candidato

O candidato elimina perguntas redundantes causadas pela omissao do catalogo e
fortalece a ordem de pesquisa: fontes estruturadas do usuario precedem pesquisa
publica ou decisao humana. Ele nao transforma os demais grupos residuais em
classificacoes automaticas e nao autoriza importacao real.

Estado maximo antes de auditoria independente: `CANDIDATO LOCAL`.
