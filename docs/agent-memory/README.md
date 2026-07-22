# Memoria operacional do FinancasBot

Esta pasta guarda o contexto curto que um agente deve ler antes de trabalhar no projeto. O objetivo e reduzir uso de contexto e evitar redescobrir decisoes ja tomadas.

## Trava de comunicacao antes de agir ou responder

O contrato de capacidade em `AGENTS.md` e parte do gate operacional, nao uma
preferencia de estilo. Antes de agir, sempre publicar:

`Superficie -> Modelo -> Esforco -> Proxima tarefa`

Antes de toda resposta final, confirmar a presenca de: resultado, inteligencia
da decisao, capacidade recomendada na mesma estrutura e proximo passo concreto.
Se um desses campos faltar, nao enviar a resposta. A omissao ja ocorreu duas
vezes durante a Fase 4 e deve ser tratada como regressao operacional.

Sempre que uma tarefa for delegada ao Chat comum, informar no mesmo envio duas
configuracoes completas e distintas:

1. `Chat -> Modelo -> Esforco -> tarefa delegada`, para executar o prompt;
2. `Codex -> Modelo -> Esforco -> validacao de retorno`, para o usuario saber
   qual capacidade selecionar antes de colar a resposta de volta.

Nao considerar a delegacao completa sem a capacidade de retorno ao Codex. Ao
receber a resposta do Chat, confrontar os achados com as fontes que exigem
repositorio, testes ou producao antes de aceitar conclusoes ou alterar o plano.

## Ordem minima de leitura

1. `AGENTS.md` - constituicao permanente, capacidade, seguranca e privacidade.
2. Este `README.md` - roteamento de contexto.
3. Identificar o workstream:
   - gate raiz: `current.md` e `docs/plans/current-gate.md`;
   - assunto paralelo: `workstreams/index.md`, checkpoint e plano proprios.

Depois disso, abra somente o que esses arquivos ou a tarefa apontarem:

- `architecture-map.md` para localizar codigo;
- `known-issues.md` para riscos do dominio tocado;
- `testing-playbook.md` para escolher a bateria;
- roadmaps ao abrir/fechar fase, mudar ordem/escopo ou resolver divergencia;
- handoffs e auditorias historicas para uma pergunta factual especifica.

`current-state.md` e historico cronologico congelado. Nao o carregue por
padrao.

## Regras de uso

- Nao guardar segredos, tokens, chaves OAuth, refresh tokens ou links sensiveis aqui.
- Nao assumir que producao esta saudavel sem validar no EC2 quando a tarefa envolver deploy, WhatsApp, dashboard ou dados reais.
- Nao usar esta memoria como fonte unica para alterar comportamento: confirme em codigo/testes antes de editar.
- Ao terminar uma mudanca relevante, substitua o estado vigente em `current.md`
  e, se aplicavel, atualize `current-gate.md`, `known-issues.md` ou
  `testing-playbook.md`.
- Execute `node scripts/agent/validateAgentWorkflow.js` antes de handoff ou
  encerramento de gate.

## Trava de retorno depois de auditorias paralelas

Quando uma auditoria for iniciada enquanto outro gate estiver em observacao,
registrar antes o ponto interrompido em `current.md` e no charter da
auditoria. Ao concluir a auditoria, voltar e fechar esse gate antes de iniciar
qualquer correcao encontrada. O relatorio pode priorizar correcoes, mas nao
autoriza implementacao, deploy, mudanca de flag ou teste real automaticamente.

## Alinhamento ao roadmap sem releitura indiscriminada

`current.md` e `current-gate.md` devem registrar fase, subplano, escopo e gate
de saida. Confira os roadmaps completos somente ao iniciar/encerrar uma fase,
alterar a fila, ampliar escopo ou resolver divergencia. Nesses pontos, responda
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

Ao encerrar a fatia, atualize `current.md` com: fase/subfase, evidencia,
GO/NO-GO, flags alteradas ou preservadas, residuos/limpeza e o proximo passo do
roadmap. Quando o roadmap pedir observacao, substitua espera passiva por bateria
adversarial repetivel e limpavel, salvo risco externo impossivel de simular.

## Documentos permanentes relacionados

- `docs/decisions/ADR-002-admin-financial-data-access.md` - regra critica de privacidade/admin.
- `docs/runbooks/release-checklist.md` - checklist antes de beta/producao.
- `docs/security/threat-model.md` - riscos de seguranca.
- `docs/legal/privacy-security-research.md` - pesquisa legal/privacidade.
- `docs/qa/diario-de-falhas.md` - falhas reais e aprendizados.
- `docs/plans/family-financial-platform-step-by-step-roadmap.md` - fila operacional detalhada do roadmap restante; conferir antes de iniciar ou encerrar fatias.
