# Gate ativo — OPS-04 bootstrap criptográfico do release OCI

Atualizado em: 2026-07-31

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

## Objetivo

Impedir que um release pare o PM2 antes de descobrir incompatibilidade entre o
state store persistente e o runtime novo; migrar somente o estado legado
comprovadamente vazio e garantir rollback exato de `.env` e snapshot.

## Escopo

- inspeção criptográfica anterior à remoção do PM2;
- bootstrap confirmado do objeto legado vazio;
- backups, substituição atômica e restauração transacional;
- correção do processo padrão no plano de promoção;
- testes causais e auditoria independente.

## Não escopo

- migrar estado legado com entradas;
- ler, imprimir ou transferir payload, chave ou identificadores;
- alterar flags funcionais do bot;
- usar AWS como destino ou rollback.

## Incidente

O artefato `e712bc11c81c67035b7f4e3e9972853c5307e9cc` passou build, checksum,
manifesto e preparo isolado. A promoção falhou em
`state_store_restore_failed`, pois a raiz OCI ainda tinha
`state_store.json={}` e não possuía `STATE_STORE_ENCRYPTION_KEY`. O rollback
automático restaurou o script anterior.

## Invariantes

1. Inspeção ocorre antes de remover o processo antigo.
2. Estado legado não vazio nunca é migrado automaticamente.
3. Chave, payload e identificadores nunca aparecem na saída.
4. Bootstrap exige confirmação literal e ocorre com PM2 anterior já parado.
5. Falha do candidato restaura `.env` e snapshot antes de iniciar o rollback.
6. Snapshot, envelope e journal adulterados ou replayados falham fechados.
7. AWS não participa de deploy ou rollback.

## Evidência

- release/OPS-04: `20/20`;
- segurança do snapshot isolada: `14/14`;
- shutdown isolado: `5/5`;
- sintaxe e diff: verdes.

Manifesto:
`docs/audit/96-oci-state-bootstrap-recovery-candidate-2026-07-31.md`.

## Critérios de GO

- incompatibilidade é detectada antes de parar PM2;
- somente `{}` legado aceita bootstrap explícito;
- envelope, payload e journal inválidos falham fechados;
- rollback restaura `.env` e snapshot antes do script anterior;
- testes focais/afetados e auditoria independente ficam verdes.

## Condições de parada

- estado legado não vazio ou temporário de escrita presente;
- identidade do servidor/processo divergente;
- falha de backup, `fsync`, substituição, health ou rollback;
- `NO-GO` independente.

## Próxima ação exata

Publicar commit sanitizado, obter auditoria independente do hash e, somente com
GO, reconstruir/preparar o artefato e repetir a promoção OCI com
`--confirm-empty-state-bootstrap`.

## Capacidade

`Codex -> Sol -> Alto -> auditar o recovery OPS-04 e repetir o release OCI.`
