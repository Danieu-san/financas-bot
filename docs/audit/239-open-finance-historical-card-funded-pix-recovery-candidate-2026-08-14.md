# Gate 41 - recovery de titular no Pix financiado

Data: 2026-08-14

## Achado independente

O commit `0bbcda38106fecfd603f17a45132d8153655d7cd` recebeu `NO-GO`: a
comparacao entre os titulares do binding bancario e do cartao aceitava duas
identidades ausentes, porque `undefined === undefined` e verdadeiro.

## Correcao

O reconhecedor agora exige `ownerUserId` bancario nao vazio antes de procurar a
triade e exige `ownerUserId` do cartao tambem nao vazio e igual ao titular
bancario. Sem identidade positiva nos dois lados, nenhum papel de principal ou
taxa e produzido.

O controle adversarial novo fornece bindings bancario e de cartao com titulares
vazios e exige falha fechada. Os controles anteriores de titular divergente,
ambiguidade, status, horario, identidade, valor, descricao, operacao, janela e
correspondencia previa permanecem ativos.

## Evidencia local posterior

- syntax check verde;
- focal afetado: 47/47 verdes;
- unica bateria historica ampla posterior a correcao: 139/139 verdes, zero
  falhas e zero skips;
- recalc privado `v208` preservou exatamente o hash
  `70bc39c8572cbe7851a2d3f8f918b6e2d108a84cbb5819dc9345ce7324f3f745`;
- 1.704 prontos, 2 existentes, 34 duplicatas provaveis, 279 excluidos, 171 em
  revisao, 161 fora da janela, cobertura completa e `financial_writes=0`;
- nenhum artefato financeiro privado ou segredo foi adicionado ao Git.

## Arquivos para reauditoria

- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`;
- este manifesto.

## Estado

`CANDIDATO LOCAL CORRIGIDO AGUARDANDO REAUDITORIA INDEPENDENTE`.
