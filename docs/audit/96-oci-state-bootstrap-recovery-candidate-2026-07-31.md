# OPS-04 — recovery do bootstrap criptográfico do state store OCI

Data: 2026-07-31

## Incidente reproduzido

O primeiro release OCI do runtime auditado
`e712bc11c81c67035b7f4e3e9972853c5307e9cc` foi preparado com sucesso, mas
falhou depois da promoção e acionou rollback automático.

Evidência sanitizada de produção:

- o candidato registrou `state_store_restore_failed` antes de Google e
  WhatsApp;
- `state_store.json` era o objeto legado vazio `{}`, com dois bytes e modo
  `0600`;
- `STATE_STORE_ENCRYPTION_KEY` não estava configurada;
- o rollback restaurou um único PM2 no script OCI anterior e health HTTP
  `200`;
- nenhum dado financeiro foi escrito pelo candidato.

## Causa

O preparador de slot validava artefato, dependências nativas e Chrome isolado,
mas não confrontava o estado persistente da raiz com o contrato criptografado
do runtime novo. Assim, uma incompatibilidade determinística só aparecia depois
de o processo anterior ser removido.

## Recovery

`scripts/release/ociArtifactRelease.js` passa a:

1. inspecionar `.env`, snapshot, temporários e journal antes de parar o PM2;
2. validar chave, envelope AES-256-GCM, AAD, payload e journal com o mesmo
   contrato do produto;
3. recusar snapshot legado não vazio, adulterado, replayado ou interrompido;
4. exigir `--confirm-empty-state-bootstrap` para o único caso migrável:
   objeto legado comprovadamente vazio;
5. parar o processo anterior antes de gerar chave e trocar os arquivos;
6. criar backups privados e executar substituições atômicas com `fsync`;
7. restaurar exatamente `.env` e snapshot antes de iniciar o rollback se o
   candidato falhar;
8. manter a correção de parsing do plano para que o processo padrão seja
   `financas-bot`, e não um argumento posicional.

Nenhuma chave, conteúdo do estado ou identificador é incluído nos resultados.

## Evidência local

- release/OPS-04: `20/20`;
- segurança do snapshot, executada isoladamente: `14/14`;
- shutdown do state store, executado isoladamente: `5/5`;
- sintaxe e `git diff --check`: verdes.

A execução conjunta dos três arquivos produziu uma falha de interferência
porque suítes diferentes manipulam o mesmo `state_store.json` da raiz. A suíte
afetada passou integralmente quando executada de forma sequencial, que é o
contrato de isolamento deste gate.

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Sem parecer independente, o recovery não será usado em nova promoção.
