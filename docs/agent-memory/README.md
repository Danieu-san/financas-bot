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

## Rotina obrigatoria de alinhamento ao roadmap

Antes de iniciar qualquer fatia nao trivial, confira o roadmap geral em
`docs/plans/family-financial-platform-evolution-roadmap.md` e responda
explicitamente:

1. fase atual do roadmap geral;
2. subplano/fatia ativa, quando houver;
3. o que esta dentro e fora do escopo desta fatia;
4. gate de saida que autoriza avancar;
5. proximo passo recomendado sem pular fase.

Durante a execucao, se surgir uma correcao lateral ou uma tentacao de remover
legado, ativar nova flag, expandir rota ou mudar arquitetura, pare e reconcilie
com o roadmap antes de seguir. Remocao ampla de legado pertence a Fase 8; fases
anteriores podem criar telemetria, gates e flags desligadas, mas nao devem
tratar remocao como objetivo final sem decisao explicita.

Ao encerrar a fatia, atualize `current-state.md` com: fase/subfase, evidencia,
GO/NO-GO, flags alteradas ou preservadas, residuos/limpeza e o proximo passo do
roadmap. Quando o roadmap pedir observacao, substitua espera passiva por bateria
adversarial repetivel e limpavel, salvo risco externo impossivel de simular.

## Documentos permanentes relacionados

- `docs/decisions/ADR-002-admin-financial-data-access.md` - regra critica de privacidade/admin.
- `docs/runbooks/release-checklist.md` - checklist antes de beta/producao.
- `docs/security/threat-model.md` - riscos de seguranca.
- `docs/legal/privacy-security-research.md` - pesquisa legal/privacidade.
- `docs/qa/diario-de-falhas.md` - falhas reais e aprendizados.
