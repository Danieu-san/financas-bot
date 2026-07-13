# Gate da Fase 4C — Dashboard familiar v2 mobile-first

Data: 2026-07-13

## Decisão local

`GO local` para commit e implantação opt-in. A rota atual `/dashboard` permanece
como padrão; a nova interface entra somente em `/dashboard/v2` e pelo comando
WhatsApp `dashboard v2`/`painel v2`/`painel novo`.

## Escopo entregue

- hierarquia: hoje, ciclo, contas, categorias, faturas, próximos vencimentos,
  metas/dívidas, atividade recente e qualidade;
- todos os blocos consomem exclusivamente `/dashboard/api/v2/summary`;
- drill-down por bloco mostra o `criteria` já fornecido pelo contrato;
- `null`/fonte indisponível nunca é apresentado como zero;
- não há seletor de usuário nem parâmetro `user` na v2;
- o token continua no fragmento da URL e é removido da barra após a carga;
- a matriz funcional ficou versionada em
  `docs/specs/dashboard-v2-coverage-matrix.md`.

## Evidências automatizadas

- sintaxe dos arquivos alterados: aprovada;
- contratos/segurança/paridade focados: `22/22`;
- unidade + contratos após cobrir o comando opt-in: `209/209`;
- suíte principal completa final: `778/778`;
- `npm audit --audit-level=high`: `0` vulnerabilidades;
- teste explícito compara competência, orçamento restante, saldo de contas,
  caixa atual e previsão com os mesmos resultados verificados usados pela
  ferramenta do WhatsApp.

## QA visual repetível

A prévia `scripts/previewDashboardV2.js` usa somente dados sintéticos e fica
restrita a `127.0.0.1`.

- desktop `1280x720`: quatro KPIs na primeira dobra, sem estouro horizontal;
- mobile `390x844`: uma coluna, sem estouro horizontal, tabela com largura de
  `315px`, seletores com `44px` e botão com `46px`;
- drill-down de orçamento abriu e exibiu o critério esperado;
- datas aparecem em `DD/MM/AAAA` e domínios técnicos foram traduzidos;
- console do navegador: zero erro/aviso;
- contraste medido: texto principal/fundo `14,45:1`, branco/azul `13,13:1`,
  texto secundário/branco `5,69:1` e status verde/fundo `7,28:1`.

## Privacidade e release

- ADR-002 revisado;
- v2 não permite escopo administrativo cruzado;
- a API continua rejeitando `user=all` e outro usuário com `403`;
- nenhuma flag, `.env`, planilha ou dado financeiro real foi alterado nesta
  etapa local;
- `DASHBOARD_ADMIN_ALL_USERS_ENABLED` deve permanecer ausente/falso em produção;
- somente Daniel pode permanecer em `ADMIN_IDS`.

## Produção

Pendente do commit/deploy desta mesma entrega. Após implantar: validar PM2,
WhatsApp pronto, health, HTML `/dashboard/v2`, API v2 autorizada com token
técnico sem imprimir valores, rejeição cross-user e comando opt-in.
