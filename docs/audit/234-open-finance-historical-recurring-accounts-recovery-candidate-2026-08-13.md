# Gate 41 - recovery do catalogo recorrente

Data: 2026-08-13

## Origem

O candidato anterior, no hash
`6514858813016e368e92f4500748cdbbbca8184a`, recebeu `NO-GO` independente.
A lista de ranges incluia `Contas!A:I`, mas a leitura suprimia erro de aba
ausente e nao validava retorno vazio. A auditoria tambem apontou lacunas focais
para regra inativa, cartao e execucao CLI pela funcao real do produto.

## Fechamento

- cada range obrigatorio deve retornar um array nao vazio; ausencia aborta o
  snapshot antes da criacao do artefato;
- o configurador exige `Contas` novamente na fronteira de consumo, portanto um
  snapshot antigo ou adulterado sem o catalogo tambem aborta;
- teste negativo usa `Regra Ativa=Não` com
  `applyAccountClassificationRules` real e exige ausencia de sugestao;
- teste de cartao injeta uma sugestao recorrente e exige o schema real de sete
  colunas, sem valor `Sim` sintetico;
- teste CLI executa `--use-established-category-rules`, prova uma regra ativa,
  ignora uma inativa e mantem `financial_writes=0`;
- teste CLI separado prova que falta de `Contas` impede a criacao da
  configuracao privada.

## Evidencia local

- bateria focal recuperada: 60/60 testes verdes;
- bateria historica ampla unica do recovery: 131/131 testes verdes;
- `git diff --check` sem erro;
- nenhum dado privado, segredo ou artefato financeiro foi adicionado;
- o caminho permanece read-only e nao autoriza importacao real.

## Estado

`CANDIDATO LOCAL AGUARDANDO REAUDITORIA INDEPENDENTE`.
