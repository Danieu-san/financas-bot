# Fase 8B.8 - validacao de user_id de cartao unified-first

Data: 2026-07-15

## Veredito

`GO de producao em canario` para a validacao read-only de integridade de
`user_id`. `NO-GO` para migrar o backfill mutavel, remover abas/fallback ou
ativar modo global.

## Caracterizacao e decisao

As quatro leituras `maintenance_service` vinham de
`userIdMaintenanceService`, executado no startup, e nao da manutencao em lote
6A. O mesmo inventario de abas era compartilhado por:

- `validateUserIdIntegrity`: read-only e ativo por padrao;
- `backfillMissingUserIds`: mutavel, opt-in e operacional.

A fatia separou somente a origem da validacao. O backfill, suas inferencias,
seus ranges e suas escritas permaneceram intocados.

## Implementacao

Commit `1d5c55d555b4ebbfac55a2f6ed9fd519d0527063`
(`feat: validar user id de cartao em canario`).

- flag `CARD_USER_ID_VALIDATION_UNIFIED_FIRST_MODE=off|canary|on`;
- ausente/invalida falha fechado em `off`;
- `canary` agrega `Lancamentos Cartao` de escopos pessoais ativos;
- se nenhum escopo ou algum escopo estiver indisponivel, preserva fallback das
  quatro abas centrais;
- relatorio agrega rotas/escopos sem publicar identidades;
- `getTrackedSheets` do backfill continua com quatro abas legadas;
- `AUTO_BACKFILL_USER_ID_ON_STARTUP=false` em producao.

## Evidencia

- unidade local: `192/192`;
- suite integral: `887/887` e pretests 6A-6E verdes;
- unidade remota: `192/192`;
- E2E read-only antes e depois da flag: `GO`;
- 3 escopos ativos, 3 acessiveis, zero indisponivel;
- central legado: zero linha de cartao;
- pessoal unificado: 76 linhas, zero `user_id` ausente;
- alvos do backfill permanecem legados;
- zero escrita e saida sanitizada.

## Producao

- backup `.env.bak-phase8b8-20260715165247`;
- flag efetiva `canary`;
- Git/`APP_COMMIT_SHA` no hash completo `1d5c55d...`;
- PM2, WhatsApp, bot, cron e integridade de startup verdes;
- health `ok=true`, `sqlite=true`.

Telemetria desde `2026-07-15T16:52:00Z`: `OBSERVING`, heartbeat 1, 23 eventos,
zero linha invalida e zero escrita. As 12 leituras legadas incluem as provas
controladas do modo `off`; nao autorizam remocao nem significam que o startup
canario voltou ao legado.

## Inteligencia da decisao

Migrar o inventario compartilhado inteiro teria mudado silenciosamente os
ranges de um backfill que escreve por numero de linha. Separar a validacao
read-only elimina as leituras obsoletas do startup normal sem arriscar escrever
`user_id` na linha errada. O backfill permanece uma ferramenta operacional
legada ate receber um gate proprio, se ainda for necessario.

## Proximo gate

`8B.9 - consumidores WhatsApp de cartao` em modo de caracterizacao:

1. separar leitura analitica, importacao, exclusao e manutencao em lote;
2. mapear identidade de aba/linha usada por preview e confirmacao;
3. confirmar quais caminhos ja sao unificados;
4. migrar primeiro somente um consumidor read-only;
5. nenhuma mudanca de exclusao/escrita sem fixture e rollback proprios.
