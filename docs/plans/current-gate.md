# Gate ativo — OPS-03 deploy OCI por artefato

Atualizado em: 2026-07-30

Base:
`508324403417a319cfe609eb43019b5fe682eeec`.

## Estado

`RECOVERY LOCAL VERDE; REAUDITORIA INDEPENDENTE PENDENTE`.

## Objetivo

Criar e ensaiar localmente o procedimento permanente de release OCI por
artefato imutável, preservando estado, validando checksums e mantendo rollback.

## Escopo

- builder a partir de commit completo;
- checksum externo e manifesto interno;
- bloqueio de segredos/estado no pacote;
- instalação em slot sem tocar no runtime ativo;
- preflight, promoção explícita e rollback;
- alinhamento dos runbooks com Oracle/OCI.

## Não escopo

- SSH, upload, restart, deploy ou mudança de produção;
- rotação de segredos;
- remoção da AWS ou de releases antigos.

## Invariantes

1. O pacote contém somente arquivos do commit e metadados gerados.
2. Estado, segredos, sessão e `node_modules` nunca entram no artefato.
3. Adulteração, arquivo extra e path traversal falham antes da instalação.
4. Preparação não para nem reinicia o PM2.
5. Promoção é explícita e captura o script anterior antes da troca.
6. Rollback nunca inicia AWS nem outra cópia da sessão WhatsApp.

## Etapas

1. [concluída] Caracterizar contradições e ausência de tooling.
2. [concluída] Criar provas RED do pacote, adulteração e layout.
3. [concluída] Implementar builder, verificador e preparação do slot.
4. [concluída] Documentar promoção e rollback fail-closed.
5. [concluída] Ensaiar localmente sem rede nem produção.
6. [concluída] Publicar o primeiro candidato e receber o `NO-GO` independente.
7. [em andamento] Publicar o recovery e reauditar no Chat.
8. [pendente] Registrar fechamento sem executar deploy.

## Critérios de GO

- pacote e manifesto correspondem ao hash completo;
- estado e segredos são proibidos;
- adulteração e caminhos inseguros são rejeitados;
- preparação isolada preserva uma raiz sintética;
- promoção/rollback possuem pré-condições e ordem inequívocas;
- nenhum achado independente bloqueante.

## Condições de parada

- estado ou segredo incluído/substituído;
- instalação que altere o slot ativo durante preparação;
- ausência de checksum ou rollback verificável;
- necessidade de SSH, restart, deploy ou produção;
- achado independente bloqueante.

## Próxima ação exata

Publicar o recovery, reconstruir/verificar o artefato do hash e reauditar no
Chat.

## Capacidade

`Codex → Sol → Alto → implementar e ensaiar o deploy OCI por artefato.`
