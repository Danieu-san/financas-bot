# ARQ-01 — contrato de trajetória e baseline — candidato

Data: 2026-08-22

## Estado

`CANDIDATO LOCAL VALIDADO — AGUARDA COMMIT IMUTÁVEL E AUDITORIA INDEPENDENTE`.

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
  pela ferramenta ao plano fornecido antes da execução;
- ferramenta, fonte e fallback;
- disponibilidade, tipo e faixa de volume da evidência;
- resultado da verificação e estado/tamanho agregado da resposta;
- custo agregado, sem prompt, resposta, linhas, IDs ou valores financeiros.

O log recebe uma projeção ainda menor: domínio, operação, base temporal, escopo,
ferramenta, fonte, fallback, cobertura e verificação. Valores de filtros como
cartão, categoria ou conta não são enviados ao log.

## Checkpoint de follow-up

Quando a resposta visível veio do agente verificado, o estado passa de
`analytical_followup_v1` para `analytical_followup_v2` e guarda o plano realmente
executado. O checkpoint continua local, com TTL máximo de cinco minutos, aceita
somente filtros previstos pelo contrato e nunca guarda mensagem, resposta,
`user_id`, telefone, planilha, token ou linhas cruas. Checkpoints v1 existentes
continuam legíveis para rollback e compatibilidade.

## Baseline sanitizado

A bateria oficial foi executada uma vez por
`npm run test:financial-agent:trajectory-baseline`:

- total: `265`;
- aceitos: `265`;
- gaps: `0`;
- trajetórias ausentes: `0`;
- read-only: `265`;
- casos críticos: `15/15`;
- chamadas externas de escrita: `0`;
- artefato sanitizado: documento JSON 297 do mesmo gate.

O relatório sanitizado contém apenas agregações e IDs públicos do corpus. A
bateria operacional completa permanece artefato local ignorado pelo Git.

## Evidência causal local

- teste focal do contrato e privacidade: `6/6`;
- bateria afetada, incluindo agente e máquina de estados: `231/231`;
- bateria oficial/baseline: `265/265`, críticos `15/15`;
- suíte hermética ampla final: `1.753` aprovados, `0` falhas e `10`
  ignorados, em `1.763` testes;
- cobertura ampla: linhas `91,65%`, branches `74,57%` e funções `91,17%`;
- nenhuma chamada de modelo foi necessária para o baseline fornecido pelo
  corpus;
- nenhuma escrita financeira ou acesso a produção ocorreu.

A primeira execução ampla reproduziu cinco falhas já presentes no commit-base,
todas na suíte `openFinanceSaveProposalShadow.test.js`. A comparação direta no
base confirmou a mesma assinatura (`10/15`). O commit test-only `5108ace`
substituiu datas de observação já expiradas por uma linha temporal relativa ao
instante do teste; a suíte focal passou a `15/15`. Somente então a suíte ampla
foi repetida uma vez, porque houve mudança causal na fixture, e terminou verde.

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
