# Plano — ROAD-00 Baseline verificável, Golden Set e inventário total

Status: `OPEN — SOMENTE BASELINE/INVENTÁRIO`
Data: 2026-08-27
Branch: `chat/financial-roadmap-road00-20260827`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`

## Objetivo

Criar uma base operacional verificável para todo o roadmap, impedindo que fases posteriores dependam de memória de conversa, status histórico desatualizado, falso zero de telemetria ou suposição sobre qual fonte/consumer está ativo.

## Princípios

1. Estado histórico não é estado atual sem revalidação.
2. `UNKNOWN` é aceitável; inventar estado não é.
3. Ausência de evento não significa uso zero sem heartbeat/retention/rotation saudáveis.
4. Nenhum dado privado ou segredo entra nos artefatos.
5. Nenhuma correção funcional é necessária para fechar ROAD-00.
6. O roadmap v2 é normativo; ROAD-00 não altera sua ordem/semântica.

## Etapas

### 00.1 Snapshot e autoridade
- registrar branch e HEAD usados por cada leitura;
- apontar roadmap canônico e blob normativo aprovado;
- identificar releases/checkpoints históricos relevantes;
- classificar fonte de evidência como `CURRENT_CODE`, `QA_GATE`, `PRODUCTION_EVIDENCE`, `HISTORICAL_PLAN`, `EXTERNAL_REQUIRED` ou `OPEN`.

### 00.2 Inventário de capacidades e consumidores
Montar matriz versionada com, no mínimo:
- capacidade/domínio;
- consumer (`WhatsApp`, dashboard, job, importação, manutenção, Open Finance, writer);
- fonte primária observada/esperada;
- fallback;
- flag/modo;
- telemetria e heartbeat;
- rollback;
- último gate/evidência datada;
- status atual `VERIFIED`, `STALE`, `UNKNOWN` ou `NOT_APPLICABLE`.

### 00.3 Golden Set sanitizado
Cobrir pelo menos:
- identidade `card_id` vs labels;
- fatura por competência;
- compra antes/no/depois do fechamento;
- compra parcelada 6x;
- projeção vs realizado;
- refund/estorno;
- pagamento de fatura;
- transferência interna;
- recorrência;
- saldo multi-mês e cobertura incompleta;
- budget diário vs ciclo;
- fonte indisponível vs zero;
- personal_sheet;
- follow-up;
- áudio marker-only.

Cada caso deve registrar `domain`, `metric`, `operation`, `timeBasis`, `scope`, `expected source`, `evidence state` e `expected side effects`.

### 00.4 Telemetria Fase 8
- revalidar heartbeat, retenção e rotação antes de aproveitar janela histórica;
- considerar arquivos rotacionados/backups quando aplicável;
- classificar `HEALTHY`, `STALE`, `BROKEN` ou `UNKNOWN`;
- carregar separadamente `legacy_auth_utility`, cartões e dashboard;
- não declarar candidato à remoção dentro de ROAD-00.

### 00.5 Fixtures de schema
- congelar versões conhecidas de `Saídas`, `Entradas`, `Lançamentos Cartão`, `Cartões`, `Contas Financeiras` e demais abas relevantes;
- distinguir template atual de planilha real antiga ainda não verificada;
- não migrar nada nesta fase.

### 00.6 Lacunas externas
Registrar sem resolver por inferência:
- vínculo Atacadão Pluggy -> alias -> `card_id` -> closing/due;
- fronteira causal do áudio real;
- quais planilhas pessoais ainda possuem headers antigos;
- provenance histórico de `Mês de Cobrança`;
- cobertura cumulativa suficiente para saldo `as_of`;
- estado atual de gates de writer/Open Finance posteriores às evidências históricas disponíveis.

## Validação

- Golden Set revisável e sem dados sensíveis;
- inventário sem consumer crítico omitido;
- falso zero explicitamente testado;
- nenhuma mutação financeira;
- nenhuma flag/deploy/restart;
- nenhuma remoção de legado;
- qualquer lacuna não verificável marcada `UNKNOWN/EXTERNAL_REQUIRED`.

## Gate de saída

GO de ROAD-00 exige simultaneamente:

1. matriz de autoridade e consumers completa;
2. Golden Set versionado;
3. telemetria Fase 8 classificada com saúde datada;
4. fixtures de schema congeladas;
5. shadows/canários/flags relevantes com status datado ou `UNKNOWN` explícito;
6. lacunas externas registradas;
7. revisão independente do artefato ROAD-00 antes de abrir ROAD-K0;
8. nenhuma alteração funcional de produto durante o gate.

## Não escopo

ROAD-00 não implementa ROAD-K0, não corrige áudio, não muda schema, não integra Atacadão, não promove ARQ, não cria writer e não remove legado.
