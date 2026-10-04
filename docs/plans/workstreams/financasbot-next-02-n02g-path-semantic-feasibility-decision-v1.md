# N02-G — decisão focal de viabilidade do witness de path

Estado: DIAGNÓSTICO DOCUMENTAL CANDIDATO; NÃO ALTERA A NORMA.
Base imutável: `f892a35fce88fe21d474bd7ed408fe2697052ce7`.
A proposta de domínio v2 nessa base recebeu APTO DOCUMENTAL de Daniel.
Isso não é aprovação de código, inventário materializado ou G11.

## Pergunta fechada

Para `M-01#1#1 / binding_1`, existe sob o adendo v2 ratificado um locator
**claimPath distinto, resolvível e do mesmo tipo período** que possa substituir
`claim.period`, preservando a classe authored, operador `period_eq`, claim,
oracle, estrutura restante e barreiras D/P?

Se não existir, confirmar o resultado `UNSATISFIED_MUTATION_WITNESS` e indicar
qual decisão normativa/corpus adicional é realmente necessária para permitir
o fechamento futuro, sem a implementar ou aprovar nesta revisão.

Não pedimos uma exceção já escolhida nem autorização para remover a obrigação.
Um achado de alternativa existente deve apontar o locator exato, tipo e cadeia
de admissão no corpus imutável — não somente uma possível intenção.

## Contraexemplo mínimo reproduzível

O witness é extraído SOMENTE da base imutável com `git show`:

- `docs/contracts/next/provenance-v2/graphs-v2.json`;
- `docs/contracts/next/provenance-v2/claims-v2.json`;
- `src/next/provenance/predicateTypes.js`.

O predicate é `period_eq(claim.period, period_literal(month,2042-06))`.
O primeiro operando é o único authored path; o segundo é literal de período,
não path e não uma alternativa de locator da mesma classe.

A função `claimField` publicada atribui `period`/`range` somente quando
`segments.join('.') === 'period'`. Os demais ramos retornam scalar, record
ou sequence; um objeto com os mesmos campos não se torna nominalmente período.
A claim inteira e todos os locators de chaves de objetos são publicados no witness.
Array indices não são caminhos authored `claimPath`; a enumeração não os inventa.

Portanto o diagnóstico é de singleton de locator tipado: no domínio
`claimPath`/período só há o locator original. O verifier publica a extração,
o trecho integral da função e os hashes; não executa o typed pass nem prova
independentemente o código WIP. O auditor deve confrontar a gramática, a regra
de tipos e o adendo, em vez de tratar `extraction_matched` como aprovação.

## Por que os atalhos não fecham esta coordenada

- `eq→not_eq` ou troca de `period_eq`: outra família de estratégia, não path.
- Trocar `claim` por `field`, `period_ref` ou `period_literal`: muda o ramo
  estrutural do operando e não é locator da mesma classe.
- Trocar valor/conteúdo de `claim.period`: não é wrong path e muda a claim congelada.
- Acrescentar um campo/célula de período ou alterar claim schema: muda corpus ou
  modelo, precisa de fronteira explícita; não é implementação silenciosa do adendo.
- Rejeição de schema/compiler: não recebe crédito D/P desta família semântica.
- Supersedir/N/A/SKIP porque o gerador não conseguiu: o adendo mantém a obrigação
  quando há path mas não há alternativa discriminante.
- Aplicar quarentena/injeção A/B ou referência contrafactual source-state: as
  exceções anteriores foram limitadas e não foram ampliadas para paths.

## Relação com a evidência local (relatada, não verificada pelo auditor)

A matriz WIP preservada terminou em 2026-10-04T01:53:17.303Z:
76 baselines;2419 expected/1331 generated/390 executed/387 matched;
2032 UNSATISFIED; exit1/valid=false; accounting_complete e fontes inalteradas.
Hash `sha256:3187e36259bc11fcd2c9063a6a4ba25987f1e1acca18a81a96aee87834b007d0`.
Entre os731 rows sem alternativa tipada há76 `binding_1`; esta revisão NÃO
generaliza a demonstração mínima para todas essas731 coordenadas ou2032 pendências.

Lacuna de referência temporal foi implementada em recorte independente:
`date_in_period`, sem importar runtime/evaluator e com RED/propriedades.
Focal F-01:43 expected/30 generated/8 executed/8 matched,35 pendentes;
`p0315_selected_period` agora possui referência discriminante, mas é recusado
por `selection_binding_selected` antes de D/P, corretamente sem crédito.
Isso não resolve nem altera o singleton `claim.period` do caso mínimo.

Admissão v2 local anterior3092 paths e16077 referências é ledger separado,
sem crédito semântico. Nenhuma soma de relatórios v1/v2 fecha esta coordenada.
Ampla histórica permanece RED2413 PASS/3 FAIL/10 SKIP, legado fora do recorte.

## Decisão solicitada e limites

1. Confirmar identidade do candidato e os três paths documentais adicionados.
2. Ler witness/verifier/plano, o adendo v2 e a gramática/tipagem na base imutável.
3. Julgar somente a viabilidade da coordenada sob a norma vigente, apontando
   alternativa concreta se existir ou a decisão faltante se não existir.
4. Não aprovar WIP, helpers de execução, contagens locais ou outras famílias.

O produto continua HOLD. Nenhum ID foi retirado/remapeado; v1, tabela r2,
relatórios RED, claim/oracle e fontes medidas foram preservados.
Qualquer proposta normativa posterior precisa de ratificação própria antes
de aplicação. Sem GO global G11/N02-G/NEXT-02, NEXT-03, deploy, produção ou dados reais.
