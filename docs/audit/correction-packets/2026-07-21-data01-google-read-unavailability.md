# DATA-01 — indisponibilidade de leitura Google

Data: 2026-07-21

## Resultado

`GO local integral` no candidato
`96ca43b5a82a1d6944f400cb6167fe6feb4d298f`.

O contrato passou a distinguir uma leitura vazia bem-sucedida de uma falha do
Google. `readDataFromSheet` retorna `[]` apenas para dados realmente vazios ou
para uma aba opcional efetivamente ausente; outras falhas são propagadas como
`GOOGLE_SHEET_READ_UNAVAILABLE`, sem mensagem crua do provedor.

Dashboard pessoal responde `503` sem apresentar fallback SQLite como dado
financeiro válido. Resumo e pergunta no WhatsApp informam indisponibilidade em
vez de zero ou ausência. O scheduler não envia resumo assertivo quando a fonte
falha.

## Fechamento do LOW de logs

O delta final
`f5ec7d2b22a2b22a9d6b5e2b4eacc933b1243b3c..96ca43b5a82a1d6944f400cb6167fe6feb4d298f`
removeu `error.message` do warning de retry e `retryError.message` do erro após
reautorização. Tentativas, backoff, reautorização, propagação e fallback foram
preservados. O hook `reauthorize` permanece interno e sua exportação existe
somente em `__test__`.

## Evidência local

- RED final do LOW: `0/2`;
- GREEN focado: `2/2`;
- bateria diretamente afetada DATA-01: `342/342`;
- `node --check` e `git diff --check`: verdes;
- runner hermético válido: `1162` testes, `1157` pass, cinco skips funcionais
  esperados, zero falhas, rede externa bloqueada e restauração concluída;
- após o runner, somente os dois arquivos intencionais estavam modificados;
  arquivos antigos não rastreados permaneceram intocados.

## Revisão independente

O Chat confirmou o hash completo, o pai direto e os dois arquivos do delta.
Veredito estático: `LOW-01 FECHADO`, nenhum novo `BLOCKER`, `HIGH`, `MEDIUM` ou
`LOW` material e `GO` para fechamento local integral de DATA-01. O Chat não
executou testes; reconciliou a evidência local reportada com o código público
imutável.

## Limites

Deploy, produção, EC2, Google real e WhatsApp real ficaram fora do escopo. O
fechamento de DATA-01 não fecha a sanitização global de `PRIV-01` nem autoriza
qualquer mudança operacional.

Próxima correção causal: `DATA-02`, neutralização de texto na fronteira
genérica `USER_ENTERED` do Google Sheets.
