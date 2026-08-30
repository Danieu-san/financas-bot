# Workstream — roadmap do FinançasBot Next

Atualizado em: 2026-08-30
Status: `DRAFT_V1 AMPLIADO; AGUARDANDO REVISÕES; ZERO IMPLEMENTAÇÃO`

## Objetivo

Projetar um novo FinançasBot em paralelo, com IA conversacional única,
ferramentas financeiras determinísticas e writers separados, preservando o
legado até cutover comprovado.

## Base e isolamento

- base: `2f698e5e396b77bf2271925ea1a87907b966f95f`;
- branch: `codex/financasbot-next-roadmap`;
- worktree: `.codex-worktrees/financasbot-next-roadmap`;
- bot atual, produção, dados e credenciais permanecem intocados.

## Escopo atual

- elaborar o draft v1;
- preparar prompts idênticos em substância para Chat e Claude;
- preservar explicitamente Calendar, lembretes, contas a pagar, operações de
  correção, compartilhamento familiar, regras aprendidas, limites, projeções,
  ambiguidades e extensibilidade de integrações;
- validar coerência documental;
- receber revisões e produzir draft v2 posteriormente.

## Não escopo

- implementação;
- mudança do roadmap canônico legado;
- deploy, flags, produção ou WhatsApp;
- acesso a Planilha, Pluggy ou dados privados;
- cópia ou rotação de segredos;
- retirada de qualquer componente existente.

## Evidências consultadas

- roadmap canônico legado e draft v2 normativo;
- revisão/implementações ARQ-01..06;
- checkpoint e inventário ROAD-01;
- falhas recentes de validação e composição conversacional registradas nesses
  workstreams.

## Gate

`NEXT-ROADMAP-REVIEW`: duas revisões independentes do mesmo draft, reconciliação
causal, draft v2 e confirmação explícita de Daniel.

## Próxima ação exata

Validar o draft v1 e enviar o mesmo commit imutável ao Chat e ao Claude. Nenhuma
implementação pode começar antes da reconciliação e confirmação humana.

