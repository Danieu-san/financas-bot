# Workstream — roadmap do FinançasBot Next

Atualizado em: 2026-08-30
Status: `DRAFT_V2 CANDIDATO FINAL; ZERO IMPLEMENTAÇÃO`

## Objetivo

Projetar o FinançasBot Next em paralelo, com IA conversacional única, tools
tipadas, kernel/ledger determinísticos e writers separados, preservando o legado
até cutover comprovado.

## Base e isolamento

- branch: `codex/financasbot-next-roadmap`;
- draft v1 publicado: `570ec0878ebbaf479b9aef23320e9e37a5b62d67`;
- worktree: `.codex-worktrees/financasbot-next-roadmap`;
- bot atual, produção, dados e credenciais permanecem intocados.

## Evidência

- Chat: `APROVÁVEL APÓS AJUSTES`, 0 CRITICAL, 9 HIGH;
- Claude: `APROVÁVEL APÓS AJUSTES`, 3 CRITICAL, 5 HIGH;
- os pareceres convergiram em autoridade do ledger, coexistência, estado de
  proposta, cálculo no kernel, regras aprendidas, integrações e gates por
  domínio;
- draft v2 e matriz de resolução incorporam todos os achados.

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

`NEXT-ROADMAP-V2-FOCAL-REVIEW`: Chat e Claude verificam o mesmo hash do draft v2
e matriz. Depois Daniel decide se confirma o roadmap.

## Próxima ação exata

Publicar o delta documental que torna o Golden Set v1 entregável obrigatório de
NEXT-00 e proíbe GO com limiares numéricos `TBD`; pedir confirmação focal curta
a Chat e Claude. Sem confirmação humana, o estado máximo é `DRAFT_V2`, nunca GO
de implementação.

