# Revisão da arquitetura conversacional financeira

Atualizado em: 2026-08-22

## Estado

`ARQ-01 A ARQ-05 EM GO TÉCNICO LOCAL — ARQ-06 RECOVERY`.

## Objetivo

Reconstruir os erros recorrentes do caminho conversacional, confrontá-los com o
código e obter duas opiniões externas independentes antes de decidir uma nova
arquitetura.

## Base e worktree

- base: `efc762deaa031dab691e9328b7cbf0d2b88caaf8`;
- branch: `codex/interpreter-architecture-review-20260821`;
- worktree isolada: `.codex-worktrees/interpreter-architecture-review-20260821`.

## Invariantes

- zero mudança de runtime, flags, dados ou produção;
- nenhum segredo ou valor financeiro real no Git ou nos prompts;
- Chat e Claude recebem o mesmo commit e as mesmas perguntas;
- pareceres são consultivos e não autorizam implementação.

## Evidência principal

- dossiê: `docs/audit/293-financial-conversation-architecture-multi-review-candidate-2026-08-21.md`;
- benchmark sanitizado: `docs/audit/293-financial-interpreter-gpt-benchmark-evidence-2026-08-21.json`;
- parecer Claude parcial: `docs/audit/294-claude-opus-5-financial-conversation-architecture-review-2026-08-22.md`;
- parecer Chat integral: `docs/audit/295-chatgpt-financial-conversation-architecture-review-2026-08-22.md`;
- consolidação: `docs/audit/296-financial-conversation-architecture-multi-review-consolidation-2026-08-22.md`.

## Decisão recomendada

Reaproveitar LangGraph e o kernel financeiro, mas substituir o pipeline linear
por agente read-only limitado a duas ou três tools semânticas. Escopo, fonte,
matemática e toda escrita continuam determinísticos.

## Implementação ARQ-01

- worktree: `.codex-worktrees/financial-agent-arq01-20260822`;
- branch: `codex/financial-agent-arq01-20260822`;
- base: `ade123e921837a683ec5989d7cb768e5f1dcbf87`;
- contrato, evidência, recoveries e fechamento: documentos 297 a 300;
- checkpoint v2 passa a representar o plano realmente executado;
- evidência do segundo recovery: focal `9/9`, agente `87/87`, baseline `265/265` e
  críticos `15/15`;
- suíte ampla final: `1.756/1.766` aprovados, `0` falhas e `10` ignorados;
- a instabilidade temporal preexistente de Open Finance foi isolada no commit
  test-only `5108ace`, validado focalmente em `15/15` antes da suíte ampla;
- zero flag, deploy, produção ou escrita financeira.

## Próxima ação exata

Publicar e reauditar independentemente o recovery ARQ-06. Com GO, preparar um
artefato OCI imutável com o canário ainda desligado, validar saúde e rollback e
somente então avaliar a ativação mínima de um domínio read-only. Writer e
retirada do legado continuam proibidos.

## Implementação ARQ-02

- fachada única para as cinco consultas read-only já existentes;
- identidade, escopo, proprietário, mapa familiar, banco e ambiente injetados
  exclusivamente pelo servidor após a filtragem dos argumentos do plano;
- envelope padronizado com provenance, fallback, cobertura, critérios, payload
  sanitizado e falha;
- compositor contextual usa o envelope sem duplicar o resultado bruto;
- o primeiro parecer confirmou escopo, adapters, sanitização e ausência de
  writer, mas emitiu NO-GO por cobertura inconsistente de dashboard vazio;
- recovery interpreta coleção por capability, mantendo dashboard material
  disponível mesmo sem transações recentes;
- evidência local final: focal `8/8`, recorte afetado `13/13`, agente `87/87`,
  aceitação e baseline `265/265`, críticos `15/15`, suíte ampla
  `1.764/1.774`, zero falha e dez ignorados;
- candidato: `docs/audit/301-financial-semantic-read-facade-candidate-2026-08-22.md`.
- recovery: `docs/audit/302-financial-semantic-read-facade-coverage-recovery-2026-08-22.md`.
- fechamento independente: `docs/audit/303-financial-semantic-read-facade-independent-close-2026-08-22.md`;
- reauditoria do hash `06bf6b4b...`: GO técnico local, zero achados e nenhuma
  lacuna causal indispensável.

## Implementação ARQ-03

- agente iterativo somente leitura executado depois do pipeline vigente;
- limite absoluto de três consultas pela fachada semântica do ARQ-02;
- trajetória reconstruída por allowlist e envelopes sanitizados são o único
  contexto fornecido ao reasoner;
- função pública descarta adapters do chamador e adapters sintéticos existem
  somente no export de teste;
- resposta candidata não é exibida e o pipeline vigente permanece a única
  autoridade;
- comparação interna por capacidade, fonte, cobertura e fingerprint;
- falhas e rejeições são contidas com zero mensagem e zero escrita financeira;
- ativação somente por callback explícito de teste, sem flag ou handler de
  produção;
- evidência focal final `7/7`, integração `1/1` e suíte hermética ampla
  `1.772/1.782`, zero falha e dez ignorados;
- candidato: `docs/audit/304-financial-iterative-shadow-agent-candidate-2026-08-22.md`.
- auditoria do hash `5523b6a3...`: GO técnico local, zero achados e nenhuma
  lacuna causal indispensável;
- fechamento independente:
  `docs/audit/305-financial-iterative-shadow-agent-independent-close-2026-08-22.md`.

## Implementação ARQ-04

- verificador determinístico de adequação composto ao verificador numérico
  anterior;
- pessoa, período, base temporal, dimensões, fonte e ausência validados contra
  a leitura efetivamente executada;
- fonte indisponível, coleção vazia e agregado zero permanecem distintos;
- alegação “não houve” sobre evidência disponível não zero falha fechado;
- resultado inserido somente no relatório shadow, sem alterar a resposta
  vigente;
- evidência focal `21/21`, integração `1/1`, agente `88/88`, aceitação e
  baseline `265/265`, críticos `15/15`;
- suíte hermética ampla `1.786/1.796`, zero falha e dez ignorados;
- candidato:
  `docs/audit/306-financial-evidence-adequacy-verifier-candidate-2026-08-22.md`.
- auditoria do hash `accb4060...`: NO-GO por bundle numérico multileitura não
  vinculado à última execução estruturalmente adequada;
- recovery remove o bundle e vincula todos os fatos à última leitura;
- controles multileitura negativo/positivo, focais `23/23` e integração `1/1`;
- suíte ampla final do recovery `1.788/1.798`, zero falha e dez ignorados;
- recovery:
  `docs/audit/307-financial-evidence-adequacy-multiread-recovery-2026-08-22.md`.
- reauditoria do hash `d1f0bd3b...`: GO técnico local, achados alto e médio
  fechados e nenhuma lacuna causal indispensável;
- fechamento independente:
  `docs/audit/308-financial-evidence-adequacy-independent-close-2026-08-22.md`.

## Implementação ARQ-05

- canário iterativo read-only atrás de modo, allowlist exata do casal, domínio
  e fonte, todos fail-closed;
- identidade, família, owner, domínio e fonte resolvidos server-side;
- fonte central pela fachada semântica e fonte pessoal por leitura real do
  dashboard da planilha autorizada;
- timeout, orçamento persistente, falha externa e evidência inadequada
  preservam integralmente o baseline;
- promoção exige answer adequado e zero mensagens/escritas; telemetria não
  contém identidade, valores, texto financeiro ou payload;
- `SIGHUP` aplica somente configuração completamente válida e permite rollback
  independente por domínio;
- evidência focal `12/12`, causal `119/119`, regressões `70/70`, aceitação
  `265/265` e suíte hermética ampla `1.800/1.810`, zero falha e dez ignorados;
- candidato:
  `docs/audit/309-financial-iterative-domain-canary-candidate-2026-08-22.md`;
- auditoria do hash `e74441d6...`: GO técnico local, zero achados e nenhuma
  lacuna indispensável residual dentro do escopo estático;
- fechamento independente:
  `docs/audit/310-financial-iterative-domain-canary-independent-close-2026-08-22.md`;
- ensaio local focal de promoção/rollback `5/5`, sem rede nem escrita:
  `docs/audit/311-financial-iterative-domain-canary-local-rehearsal-2026-08-22.md`;
- modo real, OpenRouter, Google, WhatsApp, deploy e writer continuam inativos.

## Implementação ARQ-06

- `origin/main` foi integrado sem alterar o contrato financeiro;
- toda tentativa realmente elegível passa a registrar `promoted` ou `fallback`
  antes de uma possível exposição da resposta candidata;
- falha da telemetria bloqueia promoção e preserva o baseline;
- promoção exige contadores numéricos explícitos de mensagens e escritas em
  zero; ausência, texto ou valor desconhecido falham fechado;
- JSONL sanitizado não contém identidade, mensagem, resposta, valores ou
  payload e possui relatório agregado por domínio, fonte, resultado e motivo;
- evidência final: canário `16/16`, telemetria `3/3`, causal `119/119`, aceitação
  `265/265` e suíte hermética ampla `1.807/1.817`, zero falha e dez skips
  previstos;
- candidato:
  `docs/audit/312-financial-iterative-canary-observability-candidate-2026-08-22.md`;
- auditoria do hash `5ac43f9f...`: `NO-GO` porque `promoted` antecedia a
  confirmação de `msg.reply`, permitindo falso sucesso em falha de entrega;
- recovery separa `selected` durável de `promoted` terminal, registra
  `fallback` na rejeição e deixa interrupções entre fases como `pending`;
- os dois pontos reais do handler usam a mesma fronteira de entrega; o cache só
  é atualizado depois do envio concluído;
- o predicado final também exige a elegibilidade recalculada pelo handler;
  resultado incoerente do runner não promove;
- evidência do recovery: focal `22/22`, causal `119/119`, aceitação `265/265` e
  suíte ampla `1.810/1.820`, zero falha e dez skips previstos;
- recovery:
  `docs/audit/313-financial-iterative-canary-delivery-recovery-2026-08-22.md`;
- nenhum segredo, flag real, chamada externa, deploy ou writer foi ativado.
