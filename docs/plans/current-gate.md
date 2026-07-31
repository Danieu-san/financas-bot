# Gate ativo - DASH-DATA-01 verdade canônica de saldos e dashboards

Atualizado em: 2026-07-31

Base:
`f896ce9f1d60b39300237afb64fd67bc47e03d4a`.

## Estado

`GO TÉCNICO LOCAL`.

O primeiro candidato `7e16c75708f34765fce28911761052093de057e0`
recebeu `NO-GO`. O recovery fecha os retornos antecipados sem filtro, impede
previsão de substituir fatura formal e falha parcialmente quando há mapeamento
autorizado ou limite usado ausente.

## Objetivo

Estabelecer um contrato único e auditável para saldo de conta, fatura atual,
limite total, limite disponível e movimentações; fazer dashboard v1, dashboard
v2 e consultas do bot representarem a mesma verdade autorizada do casal.

## Sintomas observados

- dashboard v2 expõe registros `TESTE_APAGAR`;
- dashboards v1 e v2 apresentam valores diferentes;
- valores das contas no provedor não coincidem com os dashboards;
- existe risco de confundir limite usado com fatura corrente;
- precisa ser confirmado qual versão é entregue pelo comando `dashboard`.

## Escopo

- mapear o comando público `dashboard` até a versão entregue;
- mapear fontes e semântica de saldos, faturas, limites e movimentações;
- comparar agregações e filtros de v1, v2, read-model e Open Finance;
- reproduzir divergências com fixtures sanitizadas;
- definir e implementar a menor correção fail-closed;
- impedir dados de teste na visão familiar sem apagar ledger ou evidência.

## Não escopo

- deploy, restart, alteração de flags ou dados reais;
- exclusão destrutiva de lançamentos;
- mudança das permissões administrativas sem revisão da ADR-002;
- correção do limite semanal, que terá gate próprio se não compartilhar a
  mesma causa.

## Invariantes

1. Saldo, fatura, limite usado e limite disponível são conceitos separados.
2. Ausência ou desatualização do provedor nunca vira zero atual.
3. Dashboard v1 e v2 não podem divergir por fonte ou filtro silencioso.
4. Dados de teste podem ser preservados no histórico, mas não contaminar a
   visão familiar normal.
5. Acesso familiar deriva da autorização do casal, nunca de privilégio admin.
6. Nenhuma correção local altera produção antes de release autorizado.

## Etapas

1. [concluído] Mapear entrada pública, versões e fontes.
2. [concluído] Caracterizar cada divergência e sua causa.
3. [concluído] Fixar contrato RED com fixtures sanitizadas.
4. [concluído] Implementar correção mínima e validar bateria afetada.
5. [concluído com NO-GO] Publicar o primeiro candidato e auditar no Chat.
6. [concluído] Publicar o recovery sanitizado e reauditar no Chat.
7. [em andamento] Preparar o release OCI autorizado do hash auditado.

## Resultado do diagnóstico e correção

- `dashboard` continua entregando v1; v2 permanece opt-in por comando explícito;
- saldo bancário, resultado econômico, fatura, limite usado, total e disponível
  agora possuem nomes, fontes e campos distintos;
- v1 e v2 priorizam a mesma fotografia Open Finance autorizada para posição
  observada de contas e cartões;
- staging é aberto em SQLite somente leitura;
- observação antiga é `partial`/`stale`, nunca atual ou zero presumido;
- fallback do ledger é rotulado `ledger_estimate`;
- marcadores controlados de teste são excluídos antes das agregações públicas
  de planilha, Query Engine, orçamento e qualidade, sem apagar a fonte;
- evidência local: focal final `12/12`, transversal `98/98`, suíte hermética
  `1.395` testes com `1.390` aprovações, zero falha e cinco skips esperados.

Manifesto candidato:
`docs/audit/94-dashboard-financial-truth-recovery-candidate-2026-07-31.md`.

Fechamento independente:
`docs/audit/95-dashboard-financial-truth-independent-close-2026-07-31.md`.

Recovery pós-NO-GO:

- previsão não substitui fatura formal ausente;
- `accounts` e `forecast` filtram marcadores antes de agregar;
- mapeamento autorizado sem registro e `usedLimit` ausente tornam os blocos
  parciais;
- evidência: focal `15/15`, afetada `123/123`, suíte hermética `1.398` testes
  com `1.393` aprovações, zero falha e cinco skips esperados.

## Critérios de GO

- comando `dashboard` entrega versão explicitamente definida;
- v1 e v2 usam conceitos e filtros consistentes;
- conta corrente, fatura, limite total, usado e disponível não são
  intercambiados;
- dados de teste não aparecem na visão familiar normal;
- fonte ausente ou antiga é rotulada e não mascarada;
- auditoria independente sem lacuna indispensável.

## Condições de parada

- necessidade de ler dados financeiros reais sem autorização específica;
- ambiguidade de produto que altere o significado financeiro dos números;
- regressão de privacidade prevista na ADR-002;
- `NO-GO` independente.

## Próxima ação exata

Construir e verificar o artefato imutável do commit auditado
`e712bc11c81c67035b7f4e3e9972853c5307e9cc`; aplicar o release aprovado na
OCI sem alterar flags e preservando estado, checksums e rollback; validar a
versão e a saúde de produção.

## Capacidade

`Codex -> Sol -> Alto -> preparar e validar o release OCI do hash auditado.`
