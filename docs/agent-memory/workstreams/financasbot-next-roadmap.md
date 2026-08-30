# Workstream — roadmap do FinançasBot Next

Atualizado em: 2026-08-30
Status: `DRAFT_V2 APROVADO INDEPENDENTEMENTE; AGUARDA CONFIRMAÇÃO HUMANA; ZERO IMPLEMENTAÇÃO`

## Objetivo

Projetar o FinançasBot Next em paralelo, com IA conversacional única, tools
tipadas, kernel/ledger determinísticos e writers separados, preservando o legado
até cutover comprovado.

## Base e isolamento

- branch: `codex/financasbot-next-roadmap`;
- draft v1 publicado: `570ec0878ebbaf479b9aef23320e9e37a5b62d67`;
- candidato final publicado: `911af93343210ccfe2d7b7fe0b898542044a1fdf`;
- worktree: `.codex-worktrees/financasbot-next-roadmap`;
- bot atual, produção, dados e credenciais permanecem intocados.

## Evidência

- Chat: `APROVÁVEL APÓS AJUSTES`, 0 CRITICAL, 9 HIGH;
- Claude: `APROVÁVEL APÓS AJUSTES`, 3 CRITICAL, 5 HIGH;
- os pareceres convergiram em autoridade do ledger, coexistência, estado de
  proposta, cálculo no kernel, regras aprendidas, integrações e gates por
  domínio;
- draft v2 e matriz de resolução incorporam todos os achados.
- confirmação focal final no hash `911af93343210ccfe2d7b7fe0b898542044a1fdf`:
  Chat `APROVÁVEL` e Claude `APROVÁVEL`.

## Decisões v2

- ledger Next é autoridade semântica a partir de NEXT-02;
- SourceObservation -> CanonicalFinancialEvent -> Projection;
- single writer/notifier por família/capacidade com fencing;
- proposta imutável com TTL/CAS/source version;
- claims quantitativos somente pelo kernel;
- dashboard v2 preservado como UX sobre a mesma verdade do WhatsApp;
- gasto por categoria é o primeiro vertical;
- NEXT-08 é loop por domínio, não fase monolítica;
- capacidades solicitadas por Daniel permanecem no produto alvo.

## Não escopo

- implementação, acesso real, deploy, flags, produção, dados ou segredos;
- alteração do FinançasBot legado;
- abertura automática de NEXT-00.

## Gate

`NEXT-ROADMAP-V2-FOCAL-REVIEW`: `FECHADO`. Chat e Claude verificaram o mesmo
hash do draft v2 e da matriz e emitiram `APROVÁVEL`. Daniel decide se confirma
o roadmap e autoriza a abertura de NEXT-00.

## Próxima ação exata

Obter a decisão humana de Daniel sobre o roadmap aprovado. Somente se ele
confirmar, preparar a abertura documental de NEXT-00 em objetivo separado. Não
há autorização implícita para implementação, acesso real, deploy ou produção.

