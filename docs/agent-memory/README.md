# Memoria operacional do FinancasBot

Esta pasta guarda o contexto curto que um agente deve ler antes de trabalhar no projeto. O objetivo e reduzir uso de contexto e evitar redescobrir decisoes ja tomadas.

## Ordem recomendada de leitura

1. `AGENTS.md` - regras permanentes, seguranca, privacidade e mapa base.
2. `docs/agent-memory/current-state.md` - estado atual do produto, deploy e pendencias.
3. `docs/agent-memory/architecture-map.md` - onde ficam as partes importantes do codigo.
4. `docs/agent-memory/known-issues.md` - bugs, riscos e armadilhas conhecidas.
5. `docs/agent-memory/testing-playbook.md` - como validar cada area.

## Regras de uso

- Nao guardar segredos, tokens, chaves OAuth, refresh tokens ou links sensiveis aqui.
- Nao assumir que producao esta saudavel sem validar no EC2 quando a tarefa envolver deploy, WhatsApp, dashboard ou dados reais.
- Nao usar esta memoria como fonte unica para alterar comportamento: confirme em codigo/testes antes de editar.
- Ao terminar uma mudanca relevante, atualize `current-state.md` e, se aplicavel, `known-issues.md` ou `testing-playbook.md`.

## Documentos permanentes relacionados

- `docs/decisions/ADR-002-admin-financial-data-access.md` - regra critica de privacidade/admin.
- `docs/runbooks/release-checklist.md` - checklist antes de beta/producao.
- `docs/security/threat-model.md` - riscos de seguranca.
- `docs/legal/privacy-security-research.md` - pesquisa legal/privacidade.
- `docs/qa/diario-de-falhas.md` - falhas reais e aprendizados.
