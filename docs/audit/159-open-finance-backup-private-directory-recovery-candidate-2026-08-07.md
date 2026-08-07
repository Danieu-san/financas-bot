# OF-NUMERIC-SAVE-OCI-01 - recovery de permissao do backup

Data: 2026-08-07
Base: `8e5a91b780cf706e63ddfe7e4561064473e6ed1e`

## Bloqueador operacional

O primeiro backup/restore v3 na OCI passou em schema, quatro arquivos,
paridade, retencao, revogacao isolada, ausencia de segredo, limpeza do restore e
`financial_writes=0`. O diretorio do pacote, entretanto, foi criado em `0775`.
A raiz era `0700` e os arquivos eram `0600`, mas o contrato operacional exige
que o proprio diretorio do pacote seja privado.

O diretorio produzido foi imediatamente reduzido a `0700`. Nenhum arquivo,
store, flag, processo ou dado financeiro foi alterado.

## Recovery local

- `ensureEmptyDirectory` cria o destino explicitamente em `0700`;
- `chmodSync` reaplica `0700` inclusive para diretorio vazio preexistente;
- em POSIX, a funcao verifica o modo efetivo e falha fechado se ele divergir;
- a mesma protecao vale para backup e restore isolado;
- o teste precria ambos em `0755` e exige `0700` depois da operacao.

## Evidencia local

- `tests/openFinanceStateBackup.test.js` e
  `tests/openFinanceOperationalBackupGate.test.js`: `9/9`;
- `tests/openFinanceNumericSaveReleaseGate.test.js`: `9/9`;
- `node --check` nos dois arquivos alterados: verde;
- `git diff --check`: verde.

A primeira tentativa de teste foi bloqueada pelo sandbox antes de carregar os
arquivos. A reexecucao identica com acesso ao runtime do SSD concluiu verde; o
bloqueio inicial nao foi contado como falha do produto.

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

O artefato anterior nao pode ser enviado. Depois de GO independente, construir
e verificar novo artefato, reexecutar o backup/restore v3 na OCI e exigir o
diretorio real em `0700` antes de continuar o gate 34.
