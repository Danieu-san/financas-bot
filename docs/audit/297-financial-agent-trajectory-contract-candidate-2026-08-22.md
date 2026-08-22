# ARQ-01 — contrato de trajetória e baseline — candidato

Data: 2026-08-22

## Estado

`RECOVERY LOCAL VALIDADO — AGUARDA NOVO COMMIT IMUTÁVEL E REAUDITORIA INDEPENDENTE`.

## Objetivo

Fixar, antes de qualquer mudança de roteamento, um contrato sanitizado que
registre o que o agente realmente executou e permita comparar os próximos gates
com uma linha de base factual.

## Base

- commit de partida: `ade123e921837a683ec5989d7cb768e5f1dcbf87`;
- branch: `codex/financial-agent-arq01-20260822`;
- nenhuma flag, fonte, cálculo, resposta, writer ou produção foi alterado.

## Contrato implementado

`financial_agent_trajectory` registra somente:

- forma e faixa de tamanho da pergunta, nunca o texto;
- quantidade agregada de usuários autorizados e escopo efetivo;
- decisão, origem do planner e código sanitizado de motivo;
- `FinancialQueryPlan` efetivamente executado, preferindo o plano confirmado
  pela ferramenta ao plano fornecido antes da execução; em falha da ferramenta,
  não existe `executedPlan`;
- ferramenta, fonte e fallback;
- disponibilidade, tipo e faixa de volume da evidência;
- resultado da verificação e estado/tamanho agregado da resposta;
- custo agregado, sem prompt, resposta, linhas, IDs ou valores financeiros.

O log recebe uma projeção ainda menor: domínio, operação, base temporal, escopo,
ferramenta, fonte, fallback, cobertura e verificação. Valores de filtros como
cartão, categoria ou conta não são enviados ao log. A flag preexistente
`FINANCIAL_AGENT_LOG_FULL` também passou a emitir somente essa projeção e
metadados allowlisted; resposta e evidência cruas não são mais serializadas.

## Checkpoint de follow-up

Quando a resposta visível veio do agente verificado, o estado passa de
`analytical_followup_v1` para `analytical_followup_v2` e guarda o plano realmente
executado. O checkpoint continua local, com TTL máximo de cinco minutos, aceita
somente filtros previstos pelo contrato e nunca guarda mensagem, resposta,
`user_id`, telefone, planilha, token ou linhas cruas. Checkpoints v1 existentes
continuam legíveis para rollback e compatibilidade.

## Baseline sanitizado

A bateria oficial foi regenerada após o primeiro parecer independente por
`npm run test:financial-agent:trajectory-baseline`:

- total: `265`;
- aceitos: `265`;
- gaps: `0`;
- trajetórias ausentes: `0`;
- read-only: `265`;
- casos críticos: `15/15`;
- tools fora da allowlist read-only observadas: `0`;
- fingerprint SHA-256 da projeção-fonte: presente e validado;
- validação do artefato: `ok=true`;
- artefato sanitizado: documento JSON 297 do mesmo gate.

O relatório sanitizado contém apenas agregações e IDs públicos do corpus. A
bateria operacional completa permanece artefato local ignorado pelo Git.

## Evidência causal local

- teste focal do contrato, privacidade e artefato: `7/7`;
- suíte causal do agente e full-debug sanitizado: `87/87`;
- bateria afetada, incluindo agente e máquina de estados: `231/231`;
- bateria oficial/baseline: `265/265`, críticos `15/15`;
- suíte hermética ampla final após o recovery: `1.754` aprovados, `0` falhas e
  `10` ignorados, em `1.764` testes;
- cobertura ampla: linhas `91,64%`, branches `74,53%` e funções `91,18%`;
- nenhuma chamada de modelo foi necessária para o baseline fornecido pelo
  corpus;
- nenhuma tool de escrita foi selecionada e nenhum acesso a produção ocorreu.

A primeira execução ampla reproduziu cinco falhas já presentes no commit-base,
todas na suíte `openFinanceSaveProposalShadow.test.js`. A comparação direta no
base confirmou a mesma assinatura (`10/15`). O commit test-only `5108ace`
substituiu datas de observação já expiradas por uma linha temporal relativa ao
instante do teste; a suíte focal passou a `15/15`. Somente então a suíte ampla
foi repetida uma vez, porque houve mudança causal na fixture, e terminou verde.

## Recovery do primeiro parecer independente

O parecer do hash `544078e2fce30758c8744d907eb0d161b1aa7910` devolveu
`NO-GO` com três achados médios. O recovery:

1. deixa `executedPlan=null` quando a tool falha, impedindo que um plano
   pré-execução seja apresentado como executado;
2. remove resposta e `toolResult` crus do full-debug e testa sua ausência;
3. versiona a saída real do builder, inclui fingerprint sanitizado, deriva e
   valida `total=265`, `accepted=total`, `readOnly=total`, ausência de trajetória,
   críticos e zero tool fora da allowlist read-only.

As contagens continuam sendo execução local relatada, não execução do auditor.

## Invariantes e rollback

- o runtime continua linear e read-only; ARQ-03 ainda não começou;
- o agente continua limitado às mesmas tools atuais;
- cálculo, autorização, fonte e writers permanecem determinísticos;
- rollback de código remove a construção/projeção da trajetória e faz novos
  checkpoints voltarem a v1; estados v1 permanecem compatíveis durante todo o
  gate;
- nenhuma promoção de flag ou deploy é autorizada por este candidato.

## Critério de fechamento

ARQ-01 só recebe GO após:

1. uma `npm test` verde no candidato estável;
2. workflow portátil válido;
3. commit sanitizado publicado em hash imutável;
4. auditoria independente do hash confirmando causalidade, privacidade,
   preferência pelo plano executado e neutralidade de runtime.

## Próximo estado

Com GO independente, ARQ-01 encerra e autoriza apenas o início de ARQ-02, a
fachada de tools semânticas e o envelope padronizado de evidência. Não autoriza
canário, deploy nem retirada de legado.
