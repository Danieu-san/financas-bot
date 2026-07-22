# ADR-010 — Workflow portátil e econômico para Codex

Status: aceito em 2026-07-22.

## Contexto

O FinancasBot é desenvolvido em múltiplas conversas e computadores usando um
SSD portátil. O estado operacional havia crescido para milhares de linhas e o
`AGENTS.md` misturava regras permanentes com mapa técnico, aumentando contexto,
redescoberta e risco de divergência.

## Decisão

Adotar camadas pequenas e versionadas:

- `AGENTS.md`: constituição permanente, segurança e comunicação;
- `docs/agent-memory/current.md`: único checkpoint vigente e curto;
- `docs/plans/current-gate.md`: contrato do único objetivo ativo;
- handoffs/roadmaps/auditorias: referências sob demanda;
- `.agents/skills`: workflows de execução, auditoria e handoff;
- `scripts/agent`: validação mecânica e instalador da orientação global.

O arquivo cronológico antigo fica congelado e consultável pelo Git. O novo
checkpoint não acumula histórico: cada atualização substitui o estado anterior.

## O que foi mantido

- contrato `Superfície → Modelo → Esforço → Próxima tarefa`;
- pausa antes de reduzir capacidade;
- privacidade/admin familiar e autorização explícita para ações externas;
- alinhamento ao roadmap sem pular gates;
- auditoria independente por commit imutável e múltiplas fontes;
- preservação de árvores sujas e arquivos alheios.

## O que foi ajustado

- roadmap completo só é relido ao abrir/fechar fase, mudar escopo ou resolver
  divergência; o gate ativo carrega o alinhamento necessário;
- worktrees são obrigatórias para escrita paralela, não para toda tarefa;
- testes seguem focal → afetado → uma suíte hermética, evitando repetição;
- planejamento, execução e auditoria permanecem separados, mas não exigem três
  fornecedores/modelos em toda tarefa;
- capacidade é recomendada dinamicamente e nunca fixada pelo repositório.

## O que não foi adotado

- `.codex/config.toml` com modelo/esforço fixos;
- cópia da pasta pessoal `~/.codex` no SSD;
- uso de API background, Batch, Flex ou caching para trabalho local que não usa
  a API diretamente;
- obrigação de reabrir todo o histórico ou criar worktree para execução única;
- GO baseado somente em resumo ou na opinião do executor.

## Alcance

As regras e skills do repositório acompanham o SSD e valem para qualquer Codex
aberto na raiz. Um template global instalável aplica o contrato básico a outras
conversas nesta máquina, sem copiar autenticação nem alterar `config.toml`.
