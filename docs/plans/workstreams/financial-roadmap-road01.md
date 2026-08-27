# Plano — ROAD-01 Schema e identidade consumer-first

Status: `OPEN — INVENTÁRIO ANTES DE IMPLEMENTAÇÃO`
Data: 2026-08-27
Branch: `chat/financial-roadmap-road01-20260827`
Contrato semântico: `docs/specs/financial-semantic-convergence-contract-v1.md`
Roadmap canônico: `docs/plans/workstreams/financial-roadmap-canonical.md`

## Objetivo

Corrigir divergências de schema e identidade sem migração ampla cega, começando pelos consumers reais e mantendo compatibilidade entre planilhas antigas, template atual e adapters.

## Etapas

### ROAD-01.1 — inventário consumer-first
Mapear para cada consumer:
- arquivo/função;
- aba/range/índices usados;
- campos de identidade;
- campos opcionais/novos;
- fallback/compatibilidade;
- risco de drift;
- teste mínimo necessário.

### ROAD-01.2 — contrato de identidade de cartão
- `card_id` é identidade estável;
- labels/nomes/legacy sheet names são apresentação/compatibilidade;
- nenhum consumer agrega fatura por label quando `card_id` está disponível;
- todos os cartões ativos permanecem compartilhados entre usuários familiares autorizados.

### ROAD-01.3 — schema versioning/compatibilidade
- congelar template atual;
- reconhecer readers antigos sem interpretar coluna ausente como valor válido;
- introduzir adaptação por header/range quando necessário;
- nenhuma migração real sem prova da planilha-alvo.

### ROAD-01.4 — campos estruturados
- preservar `Conta Financeira` em Saídas/Entradas;
- preservar subcategoria no caminho de cartão;
- classificar recorrências sem `user_id` para migração de dado, mantendo fail-closed;
- alinhar timezone sem usar configuração de planilha como única fonte de data civil.

### ROAD-01.5 — implementação mínima por consumer
Somente depois do inventário e desenho, corrigir o menor conjunto causal de readers/writers e adicionar compatibilidade.

### ROAD-01.6 — validação e auditoria
- testes focais por consumer;
- bateria causal de schema/identidade;
- uma suíte ampla somente no candidato estável;
- commit imutável e auditoria independente em conversa limpa do Chat para mudanças materiais de código.

## Invariantes

- sem restrição de cartão por titular;
- sem atribuir novo `card_id` por nome se um ID estável já existe;
- sem converter ausência de coluna em zero/dado válido;
- sem backfill ou escrita real em planilha durante diagnóstico;
- sem tocar ROAD-02/03/AUDIO/04C;
- sem retirar legado por busca estática.

## Gate de saída

ROAD-01 recebe GO quando consumers críticos usam contratos compatíveis de schema/identidade, testes provam leitura/escrita sem perda de campos, e mudanças materiais de código recebem auditoria independente.
