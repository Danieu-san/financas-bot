# Gate 41.2 - segunda recuperacao probatoria da devolucao de fatura

Data: 2026-08-14

## Origem

A reauditoria do hash
`653268ad11440624cbc256cc27b5989adcc9b74f` confirmou as provas de identidade
repetida, devolucao exatamente existente e ambiguidade inversa, mas manteve
`NO-GO` por uma unica lacuna MEDIA: faltava integrar a devolucao revisada ao
caso de correspondencia forte, escopada e nao identica em `Entradas`.

## Controle adicionado

O teste do planejador real cria uma devolucao com decisao privada exata e um
registro de mesma conta, data e valor, mas descricao diferente. A prova exige:

- estado `possible_duplicate`;
- motivo `strong_non_identical_sheet_match`;
- ausencia de `strong_linked_card_payment_reversal`;
- ausencia de `write_plan`;
- `financial_writes=0`.

Assim, a deteccao de duplicata forte impede a neutralizacao antes que o papel
de devolucao seja materializado, preservando o comportamento fail-closed.

## Evidencia executada

- syntax check do teste alterado: verde;
- bateria causal focal: `68/68`, sem falhas ou skips;
- unica bateria historica ampla posterior a esta evidencia nova: `143/143`,
  sem falhas ou skips;
- nenhuma mudanca de produto foi necessaria;
- nenhum dado privado ou artefato financeiro foi adicionado ao Git.

## Alcance

Esta mudanca acrescenta somente evidencia adversarial. Nao altera produto,
writer, importacao, planilha, recorrencia, WhatsApp, deploy ou producao. O
estado permanece candidato aguardando reauditoria por novo hash.
