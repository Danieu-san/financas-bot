# Roadmap canônico do FinançasBot

Data de canonização: 2026-08-27
Status: `CANONICAL — ROAD-00 É O ÚNICO GATE ABERTO`
Branch de origem: `chat/financial-roadmap-synthesis-20260826`

## Autoridade

O usuário confirmou explicitamente em 2026-08-27: `CONCORDO COM O ROADMAP V2`.

O conteúdo normativo completo deste roadmap é **exatamente** o arquivo:

`docs/plans/workstreams/financial-roadmap-draft-v2.md`

na versão cujo blob Git é:

`904d652fc1931ff5c80d6c1066ac5f57a96f5b84`

Esse draft v2 incorporou integralmente as dez mudanças obrigatórias da revisão adversarial Codex `FIN-ROADMAP-V1-REVIEW-20260827`, cujo veredito foi `APROVÁVEL APÓS AJUSTES`.

Este arquivo canônico funciona como âncora de autoridade para preservar o texto aprovado sem reescrever ou duplicar silenciosamente o conteúdo detalhado. O draft v2 aprovado fica congelado como especificação normativa; qualquer evolução futura exige changelog explícito, novo gate e, quando alterar ordem/escopo/semântica material, nova confirmação humana.

## Ordem canônica

`ROAD-00 -> ROAD-K0 -> ROAD-01 -> {ROAD-02, ROAD-03A, ROAD-AUDIO-01, ROAD-04B} -> ROAD-03B -> ROAD-04A/ROAD-04C -> ROAD-05 -> ROAD-06 -> ROAD-07 -> loop por domínio ROAD-08B/ROAD-09/ROAD-08C -> ROAD-10`

A Fase 7 de patrimônio/investimentos permanece `DEFERRED`, não cancelada.

## Gate atualmente autorizado

Somente `ROAD-00 — Baseline verificável, Golden Set e inventário total` está aberto.

A canonização **não** autoriza automaticamente:

- correção de produto;
- deploy;
- promoção de flag;
- acesso a dado privado ou segredo;
- escrita financeira;
- migração destrutiva;
- retirada de legado;
- avanço automático para ROAD-K0 ou fases posteriores.

ROAD-00 é documental/observacional e deve primeiro construir o inventário de consumidores/fontes/fallbacks/telemetria/rollback, Golden Set sanitizado, classificação atual da telemetria da Fase 8 e registro explícito das lacunas externas.

## Regras de preservação

- roadmaps históricos continuam como evidência histórica e não são apagados;
- `financial-roadmap-draft-v1.md` e `financial-roadmap-draft-v2.md` permanecem preservados;
- legado, Financial Agent v1 e novo agente/ARQ continuam conceitos distintos;
- nenhuma capacidade já entregue é reconstruída sem inventário causal;
- nenhuma ausência de telemetria é interpretada como uso zero;
- nenhuma projeção é promovida a confirmado sem provenance;
- nenhum writer herda autorização de um rollout read-only;
- nenhuma retirada de legado ocorre sem gate individual, paridade, telemetria saudável, janela e rollback.
