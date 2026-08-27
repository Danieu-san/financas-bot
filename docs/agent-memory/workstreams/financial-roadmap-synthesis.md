# Controle de síntese do roadmap financeiro

Status: `DRAFT_V1_CREATED — AWAITING CODEX ADVERSARIAL REVIEW`
Data: 2026-08-27
Branch de trabalho: `chat/financial-roadmap-synthesis-20260826`
Snapshot-base usado para o draft: `98c30b5548a3f3ed06747acd6818adf833d3c628`
Draft v1 criado no commit: `a894895a2b5c0d0662981c43d731584e12dc1430`

## Objetivo

Preservar fatos, decisões, evidências, shadows/canários, gates antigos e novas descobertas e consolidá-los sem perda em um roadmap atualizável. Este workstream não autoriza implementação, deploy ou retirada de legado.

## Fontes já reconciliadas no draft v1

- `docs/plans/family-financial-platform-evolution-roadmap.md`;
- `docs/plans/family-financial-platform-step-by-step-roadmap.md`;
- Fase 8A/8B e checkpoint `phase-8-legacy-retirement`;
- Fase 9/Open Finance read-only e reconciliação shadow;
- `docs/agent-memory/workstreams/financial-conversation-architecture-review.md` (ARQ-01..06);
- auditoria Codex `FIN-AUDIT-PRE-ROADMAP-RETRY-20260826`, publicada no commit `ea3ad3a604ce99c580bf5d18bda2ecb365d27545` da branch `chat/chat-codex-orchestration-20260824`;
- código/testes atuais de áudio e relato do usuário de falha real;
- decisões recentes sobre cartões compartilhados, fechamento variável, parcelamentos, Atacadão e UX de pagamento.

## Resultado da auditoria pré-roadmap incorporado

O Codex confirmou os problemas estruturais de identidade de cartão, timeBasis, parcelas futuras no mês da compra, saldo não cumulativo, `budget.sum`, ranges antigos, menu numérico e subcategoria. Classificou fechamento no dia, Atacadão/Pluggy, estornos e timezone como parciais. Refutou apenas a hipótese de que `user_id` vazio abriria escopo: o loader atual falha fechado. Portanto o roadmap preserva o fail-closed e trata linha legítima sem escopo como migração de dado, não como autorização ampla.

## Draft atual

Arquivo:
`docs/plans/workstreams/financial-roadmap-draft-v1.md`

Estrutura consolidada:

- ROAD-00 baseline verificável, Golden Set e mapa de fontes;
- ROAD-AUDIO-01 recuperação causal do áudio do WhatsApp;
- ROAD-01 contrato de dados/schema/identidade;
- ROAD-02 verdade temporal de cartões/faturas/parcelamentos;
- ROAD-03 saldo/orçamento/transferências/compensações;
- ROAD-04 personal_sheet/UX/onboarding Pluggy;
- ROAD-05 Financial Truth Kernel;
- ROAD-06 evolução conversacional ARQ;
- ROAD-07 writers confiáveis;
- ROAD-08 continuação da retirada progressiva do legado pela Fase 8 existente;
- ROAD-09 cutover final da fonte canônica;
- ROAD-10 hardening e gate final;
- Fase 7 patrimônio/investimentos preservada como `DEFERRED`, não cancelada.

## Regras anti-perda e anti-alucinação ainda ativas

- roadmap histórico não prova estado atual sozinho;
- capacidade existente deve ser integrada/corrigida antes de propor reconstrução;
- legado, Financial Agent v1 e novo agente/ARQ permanecem nomes distintos;
- ausência de evento nunca prova uso zero sem heartbeat/telemetria saudável;
- nenhum item desaparece sem `ADDED`, `MERGED`, `DEFERRED`, `SUPERSEDED` ou `REMOVED_WITH_EVIDENCE`;
- cartões continuam sujeitos aos gates históricos de observação/rollback até evidência explícita de supersessão;
- áudio permanece causa aberta até reprodução ponta a ponta; teste unitário não prova runtime.

## Próxima ação exata

Publicar o draft v1 como input imutável no canal Chat↔Codex e solicitar revisão adversarial fase a fase. O Codex deve classificar cada ROAD como `CONCORDO`, `DISCORDO`, `FALTA EVIDÊNCIA` ou `RISCO NÃO COBERTO`, procurar trabalho histórico indevidamente reconstruído, dependências circulares, gates fracos e riscos de remoção prematura de legado. Depois o Chat reconciliará o parecer em um draft v2 e pedirá confirmação explícita do usuário.

## Gate de saída

`Chat consolida -> Codex tenta refutar -> Chat reconcilia -> usuário confirma -> roadmap canônico`.

Até a confirmação do usuário, `canonical_roadmap_allowed=false`.
