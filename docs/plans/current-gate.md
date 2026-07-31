# Gate ativo — OPS-05 readiness do WhatsApp no release OCI

Atualizado em: 2026-07-31

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

## Objetivo

Permitir uma janela explícita e limitada para o WhatsApp alcançar `ready` na
OCI sem afrouxar o health, desabilitar rollback ou ampliar a interrupção sem
limite.

## Escopo

- parser limitado de `--health-attempts`;
- prova causal de readiness após a décima segunda tentativa;
- preservação integral do rollback e do health;
- testes focais e auditoria independente.

## Não escopo

- ignorar o estado do WhatsApp;
- espera ilimitada ou sem rollback;
- alterar flags funcionais do bot;
- usar AWS como destino ou rollback.

## Incidente

O artefato `ce43a8f8f6c4080bda5ab92e697388753da598d8` passou build, checksums,
manifesto e preparo. A promoção fez rollback porque o WhatsApp não chegou a
`ready` na janela padrão. Google, Sheets, SQLite, read-model e dashboard haviam
iniciado. A sessão recebeu `LOGOUT`, foi reautenticada por QR e o runtime
anterior voltou a `ready`.

## Invariantes

1. Health continua fail-closed e não ignora WhatsApp.
2. A janela só aumenta por parâmetro explícito.
3. Somente inteiros entre `12` e `60` são aceitos.
4. Valor inválido falha antes de qualquer restart.
5. Candidato saudável tardiamente não sofre rollback prematuro.
6. Candidato que não fica saudável dentro do limite ainda executa rollback.
7. AWS não participa de deploy ou rollback.

## Evidência

- release/OPS-03/04/05: `23/23`;
- sintaxe e diff: verdes.

Manifesto:
`docs/audit/98-oci-whatsapp-readiness-window-candidate-2026-07-31.md`.

## Critérios de GO

- parser aceita `60` e recusa valores fora dos limites;
- prova tardia não executa rollback;
- health e rollback permanecem inalterados;
- testes focais/afetados e auditoria independente ficam verdes.

## Condições de parada

- identidade do servidor/processo divergente;
- falha de health ou rollback;
- `NO-GO` independente.

## Próxima ação exata

Publicar o candidato sanitizado, obter auditoria independente do hash e,
somente com GO, reconstruir/preparar o artefato e repetir a promoção OCI com
`--health-attempts 60` e `--confirm-empty-state-bootstrap`.

## Capacidade

`Codex -> Sol -> Alto -> auditar OPS-05 e repetir o release OCI.`
