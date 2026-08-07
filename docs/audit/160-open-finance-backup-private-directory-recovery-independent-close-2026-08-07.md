# OF-NUMERIC-SAVE-OCI-01 - fechamento independente do recovery

Data: 2026-08-07

## Cadeia auditavel

O primeiro backup/restore v3 real na OCI passou nos contratos funcionais, mas
revelou que o diretorio do pacote era criado em `0775`. O diretorio produzido
foi imediatamente reduzido a `0700`, sem alteracao de store, flag ou processo.

O recovery foi publicado no hash imutavel
`2af482094cd325f2e6c7f543020c07babcfd5d57` e reavaliado em conversa limpa.
O auditor confirmou literalmente o hash, o pai
`8e5a91b780cf706e63ddfe7e4561064473e6ed1e` e a leitura integral dos tres
arquivos solicitados.

## Evidencia local

- backup state e gate operacional: `9/9`;
- gate de prontidao do fluxo numerico: `9/9`;
- `node --check` nos arquivos alterados: verde;
- `git diff --check`: verde;
- nenhuma chamada Pluggy/Sheets/WhatsApp real, flag, promocao ou escrita
  financeira.

As contagens sao evidencia local relatada; o auditor nao reproduziu os testes
nem validou producao.

## Veredito independente

`GO TECNICO LOCAL` para o recovery de permissao.

O parecer confirmou que destinos novos e vazios preexistentes sao normalizados
para `0700`, que divergencia POSIX falha fechado, que backup e restore usam o
mesmo contrato e que os testes nao enfraquecem garantias anteriores.

Achados: `CRITICAL 0`, `HIGH 0`, `MEDIUM 0`, `LOW 1`. O `LOW` registra apenas
que o teste nao injeta a condicao rara em que `chmod` retorna e o `stat`
subsequente ainda observa modo divergente. A verificacao fail-closed existe no
produto; por isso a lacuna de cobertura e aceita como nao bloqueante, sem mudar
o hash auditado.

## Alcance

O recovery local esta encerrado. O artefato anterior continua invalidado. O
gate 34 ainda exige novo artefato, prova operacional do diretorio real em
`0700`, preparacao e plano antes da confirmacao final de promocao.
