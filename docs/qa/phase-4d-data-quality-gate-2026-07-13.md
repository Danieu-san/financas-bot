# Gate da Fase 4D — Qualidade dos dados e pendências

Data: 2026-07-13

## Decisão

`GO de produção` para a Fase 4D. O próximo passo oficial é o gate 4E; nenhuma
auditoria agregada da Fase 4, remoção de legado ou decisão da Fase 5 foi
antecipada.

## Escopo entregue

- indicadores read-only de sem categoria, incerto, status pendente, não
  conciliado, sem conta financeira e sem comprovante quando obrigatório;
- cobertura por período e origem pública;
- resumo, listagem por tipo de pendência e agrupamento por origem no WhatsApp;
- bloco de qualidade do Dashboard v2 usando a mesma ferramenta financeira;
- leitura do ledger canônico e das decisões sanitizadas de importação depois do
  escopo autorizado;
- itens públicos sem ids, hashes, contas internas, valores financeiros ou
  linhas cruas;
- pendências não removem eventos nem alteram totais financeiros confiáveis;
- comprovante fica `not_applicable` quando nenhum evento observado declara a
  exigência, sem representar esse estado como cobertura zero.

## Evidências automatizadas

- TDD reproduziu e fechou indicadores, filtros, isolamento e sanitização;
- teste ponta a ponta cobre plano, leitor canônico, Query Engine, compositor e
  verificador;
- fixture adversarial mantém o item ruim como pendência sem alterar o total de
  referência;
- teste com usuários distintos prova que eventos, linhas e decisões de
  importação são filtrados antes da consulta;
- regressão focada final: `109/109`;
- suíte principal completa final: `788/788`;
- `npm audit --audit-level=high`: `0` vulnerabilidades;
- sintaxe e `git diff --check`: aprovados.

## Privacidade e release

- ADR-002 e checklist de release revisados;
- `ADMIN_IDS` permaneceu com um único administrador;
- `DASHBOARD_ADMIN_ALL_USERS_ENABLED=false`;
- Dashboard v2 continua rejeitando `user=all` e outro escopo com `403`;
- nenhum `.env`, flag, planilha ou dado financeiro real foi alterado;
- backups do `.env` e do ledger foram criados antes de cada restart;
- nenhum conteúdo financeiro real foi incluído neste relatório público.

## Produção

- commit principal `c4d7735` implantado por fast-forward;
- dependências atualizadas sem vulnerabilidades;
- testes remotos principais: `27/27`;
- PM2 online, Google/read-model/WhatsApp prontos e health
  `{"ok":true,"sqlite":true}`;
- smoke sanitizado confirmou os seis campos, agrupamento por origem, itens
  públicos, ausência de chaves internas, resposta verificada e contratos de
  segurança do dashboard.

## NO-GO inicial e hotfix

O primeiro teste manual mostrou duas respostas incompatíveis: a pergunta de
resumo foi convertida em listagem e a pergunta geral de pendências recebeu um
filtro de status que eliminou os itens. A causa foi a substituição indevida do
plano local determinístico pelo planner Gemini.

O hotfix `0d6af01` executa qualquer `FinancialQueryPlan` já classificado como
`quality` antes do planner LLM. A regressão prova que:

- `detail` permanece `detail`;
- `list` sem filtro continua sem filtro;
- o planner LLM não é chamado;
- resumo e lista são verificados e não exibem moeda ou identificadores.

Testes remotos do hotfix: `8/8`. O restart também eliminou respostas antigas do
cache.

## Reteste manual final

O WhatsApp real confirmou, sem registrar conteúdo financeiro neste documento:

- resumo com os seis indicadores e critério temporal;
- total de pendências coerente com a quantidade listada;
- composição das pendências coerente com os indicadores agregados;
- cobertura por origem coerente;
- comprovante obrigatório apresentado como não aplicável;
- ausência de valores monetários e identificadores internos.

Decisão final da fatia: `GO de produção`. A 4D está encerrada. O próximo passo
é `4E - Gate de saída da Fase 4`, que depende de nova configuração explícita.
