# ARQ-02 — candidato da fachada semântica somente leitura

Data: 2026-08-22

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este documento não autoriza flag, canário, deploy, escrita financeira nem
retirada do caminho legado.

## Objetivo causal

Encapsular as consultas já executadas pelo agente financeiro atrás de uma
única fronteira somente leitura, fazer identidade e escopo permanecerem sob
autoridade do servidor e retornar um envelope de evidência uniforme, sem criar
fonte, cálculo ou regra financeira.

## Implementação

- `src/agent/financialSemanticReadFacade.js` define as cinco capacidades de
  leitura já existentes e seus argumentos semânticos permitidos;
- argumentos vindos do plano são filtrados por allowlist antes da chamada;
- `userIds`, `ownerUserId`, mapa de pessoas, data civil, ambiente e caminho do
  ledger são injetados depois, exclusivamente pelo contexto confiável;
- ausência de escopo confiável, ferramenta desconhecida ou adapter ausente
  falha fechado antes da consulta;
- o runtime LangGraph usa uma única função pública para executar ferramentas;
- o resultado público anterior permanece no topo para compatibilidade;
- `evidence` padroniza capability, modo read-only, provenance, escopo abstrato,
  fallback, cobertura, critérios, payload sanitizado e falha;
- o compositor contextual usa o envelope quando presente, evitando enviar ao
  modelo uma segunda cópia do resultado bruto.

## Capacidades encapsuladas

1. `query_financial_plan`;
2. `list_recent_transactions`;
3. `run_safe_readonly_sql`;
4. `get_dashboard_snapshot`;
5. `explain_metric`.

Todas continuam chamando os adapters e kernels anteriores. A fachada não
possui writer e rejeita ferramenta fora do catálogo.

## Invariantes

- o modelo não escolhe identidade, proprietário, mapa familiar, banco ou
  ambiente;
- o modelo não expande o escopo autorizado;
- nenhuma topologia física ou identificador interno entra no envelope;
- `available`, `empty` e `unavailable` são estados distintos;
- fallback registra uso e motivo;
- nenhuma soma, saldo, orçamento, parcela ou métrica financeira é recalculada
  pela fachada;
- respostas determinísticas e verificador vigente continuam consumindo os
  campos compatíveis do resultado original;
- zero alteração de runtime de produção.

## Evidência local

- RED confirmado pela ausência inicial do módulo;
- teste focal da fachada: `6/6`;
- bateria causal do agente: `87/87`;
- bateria de aceitação: `265/265`, zero gap, 23 bloqueios de segurança e 238
  respostas verificadas, sem chamada Gemini;
- baseline de trajetória: `265/265`, críticos `15/15`;
- suíte hermética ampla única: `1.762/1.772` aprovados, zero falha e dez
  ignorados;
- cobertura ampla: linhas `91,66%`, branches `74,57%`, funções `91,20%`;
- teste real de WhatsApp, rede, produção, planilha e writer permaneceram fora.

As contagens acima são execução local relatada pelo candidato. A auditoria
independente deve revisar os arquivos no hash imutável e não tratá-las como
execução própria.

## Arquivos causais

- `src/agent/financialSemanticReadFacade.js`;
- `src/agent/langGraphRuntime.mjs`;
- `src/agent/contextualFinancialAnalyst.js`;
- `tests/financialSemanticReadFacade.test.js`;
- `package.json`.

## Critério de GO técnico local

O parecer independente deve confirmar que:

1. nenhum argumento do plano consegue substituir identidade ou escopo;
2. somente ferramentas de leitura existentes são acessíveis;
3. o envelope diferencia disponibilidade, vazio e indisponibilidade e registra
   provenance/fallback sem identificadores internos;
4. adapters e cálculos de produto anteriores continuam sendo executados;
5. o compositor contextual não duplica o resultado bruto quando há envelope;
6. não existe writer, nova fonte, nova matemática ou ativação de produção;
7. não permanece lacuna causal indispensável dentro do ARQ-02.

Com GO, fica autorizado apenas encerrar tecnicamente o ARQ-02 e iniciar o
desenho do ARQ-03 em shadow. Deploy, canário, writer e retirada do legado
continuam proibidos.
