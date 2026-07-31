# OPS-04 — recovery de privacidade, durabilidade e ordem causal

Data: 2026-07-31

## Parecer anterior

O candidato imutável
`a47ce899adb34f0c94847d8e8654aa06a6586fce` recebeu `NO-GO` independente.
O parecer identificou:

- `HIGH`: a `.env` com a chave podia preservar permissões excessivas e os
  backups eram copiados antes de receber `0600`, sem publicação atômica nem
  sincronização do diretório;
- `MEDIUM`: o teste positivo não falhava causalmente se o bootstrap ocorresse
  antes da parada confirmada do PM2.

Nenhuma nova promoção foi executada depois desse parecer.

## Recovery

`scripts/release/ociArtifactRelease.js` passa a:

1. exigir uma fronteira de processo parado antes da primeira inspeção interna
   do bootstrap;
2. fornecer essa fronteira somente depois do retorno bem-sucedido de
   `pm2 delete`;
3. fixar `.env`, snapshot e backups em `0600`;
4. fixar o diretório de backups em `0700`;
5. criar cada backup em temporário privado e durável, publicá-lo com hard link
   exclusivo, remover o temporário e sincronizar o diretório;
6. verificar os modos resultantes em sistemas POSIX;
7. restaurar `.env` e snapshot em `0600` tanto na falha interna quanto antes do
   rollback do processo anterior.

O resultado público continua contendo somente booleanos e nomes relativos dos
backups. Chave, payload e identificadores não são retornados.

## Prova causal

O teste de promoção agora lê `.env`, `state_store.json` e a ausência do
diretório de backups no exato ingresso de `pm2 delete`. Ele falha se chave,
snapshot criptografado ou backup existirem antes da parada.

Uma prova negativa adicional chama o bootstrap com a fronteira de parada
negada e exige:

- erro `oci_release_state_store_process_not_stopped`;
- conteúdos originais inalterados;
- nenhum diretório de backup criado.

Em POSIX, a prova positiva também exige `0700` no diretório e `0600` na
`.env` e nos dois backups.

## Evidência executada pelo Codex

- release/OPS-04: `21/21`;
- segurança do snapshot, isolada: `14/14`;
- shutdown do state store, isolado: `5/5`;
- sintaxe e `git diff --check`: verdes.

As três suítes foram executadas sequencialmente para evitar a interferência
conhecida entre testes que usam o mesmo state store da raiz. Uma revisão
independente não deve tratar essas contagens como execução própria.

## Estado

`RECOVERY CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

O release OCI permanece bloqueado até parecer independente sobre o novo hash.
