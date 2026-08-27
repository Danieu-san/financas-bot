# Controle de síntese do roadmap financeiro

Status: `DRAFT_V2_AWAITING_USER_CONFIRMATION`
Data: 2026-08-27
Branch de trabalho: `chat/financial-roadmap-synthesis-20260826`
Draft v1: `docs/plans/workstreams/financial-roadmap-draft-v1.md`
Draft v2: `docs/plans/workstreams/financial-roadmap-draft-v2.md`

## Objetivo

Preservar fatos, decisões, evidências, shadows/canários, gates antigos e novas descobertas e consolidá-los sem perda em um roadmap atualizável. Este workstream não autoriza implementação, deploy, promoção de flag, escrita financeira ou retirada de legado.

## Evidências independentes já incorporadas

1. Auditoria pré-roadmap `FIN-AUDIT-PRE-ROADMAP-RETRY-20260826`, publicada na branch `chat/chat-codex-orchestration-20260824`.
2. Revisão adversarial `FIN-ROADMAP-V1-REVIEW-20260827`, candidato `d2e045d44dbc9ec3419530884e0cb3674969d0f3`, retornado ao Chat pelo commit state-only `3144c9cfb6d7d59933aa9e07800420158c9f487b`.
3. Veredito da revisão v1: `APROVÁVEL APÓS AJUSTES`.

## Reconciliação v1 -> v2

As dez mudanças obrigatórias do Codex foram incorporadas no draft v2:

1. `ROAD-K0` move o contrato mínimo de convergência semântica para logo após ROAD-00.
2. ROAD-01 virou consumer-first; migração física só após detector de versão/drift.
3. `Mês de Cobrança` e forecasts exigem provenance; presença não equivale a confirmação.
4. ROAD-03 foi dividido em 03A saldo/budget/transferências e 03B eventos/refunds/fatura.
5. ROAD-04 foi dividido em 04A personal_sheet, 04B menu numérico e 04C Pluggy/Atacadão.
6. ARQ mantém limite atual máximo de 3 tools; quarta exige gate separado.
7. Casos críticos exigem 100%; >=95% vale apenas ao corpus cego não crítico e deve superar baseline.
8. Writers são fatiados por comando/classe e precedidos por inventário do que já existe.
9. Fase 8 exige revalidação atual de heartbeat/retention/rotation; `legacy_auth_utility` mantém estado individual.
10. ROAD-08/09 passam a ser intercalados por domínio: migrar consumidor -> cutover -> estabilidade -> remover fallback morto.

## Regras anti-perda e anti-alucinação

- roadmap histórico não prova estado atual sozinho;
- capacidade existente deve ser integrada/corrigida antes de reconstrução;
- legado, Financial Agent v1 e novo agente/ARQ permanecem sistemas distintos;
- ausência de evento nunca prova uso zero sem telemetria saudável;
- item não desaparece sem `ADDED`, `MERGED`, `DEFERRED`, `SUPERSEDED` ou `REMOVED_WITH_EVIDENCE`;
- cartões/dashboard não viram candidatos de remoção por inferência;
- áudio continua causa aberta até reprodução real;
- Atacadão real permanece `EXTERNAL_REQUIRED` até mapeamento autorizado;
- headers antigos reais, provenance histórico de competência e cobertura de saldo continuam lacunas explícitas;
- nenhum shadow/canário é descrito como ativo sem revalidar runtime datado.

## Estado do canal Chat↔Codex

A revisão v1 já retornou. O wake foi validado por hash e o canal foi reconhecido de volta como `CHAT_WORKING`. O resultado alterou somente o state mecânico e o result_file autorizado no intervalo do candidato.

## Próxima ação exata

Apresentar `financial-roadmap-draft-v2.md` ao usuário e pedir uma decisão explícita:

- `CONCORDO COM O ROADMAP V2`;
- `CONCORDO COM RESSALVAS: ...`;
- `NÃO CONCORDO: ...`.

Somente a primeira opção sem ressalvas autoriza criar a versão canônica. Mesmo depois da canonização, a implementação deve começar apenas por ROAD-00; nenhuma fase posterior é automaticamente autorizada.

## Gate de saída

`Chat consolidou v1 -> Codex revisou -> Chat reconciliou v2 -> usuário confirma -> roadmap canônico`.

Até a confirmação explícita do usuário, `canonical_roadmap_allowed=false`.
