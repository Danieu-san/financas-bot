# ARQ-04 — candidato do verificador de adequação da evidência

Data: 2026-08-22

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este documento não autoriza flag, canário de resposta, deploy, escrita
financeira nem retirada do caminho vigente.

## Objetivo causal

Preservar integralmente o verificador numérico existente e acrescentar uma
prova determinística de que a evidência usada pelo candidato shadow é adequada
à pessoa, período, base temporal, dimensões e fonte solicitadas. Ausência de
fonte, coleção vazia e agregado zero permanecem estados distintos.

## Implementação

- `src/agent/financialEvidenceAdequacyVerifier.js` compõe o
  `verifyAgentAnswer` vigente, sem substituir suas verificações;
- o plano esperado vem da trajetória executada e sanitizada do pipeline
  vigente;
- o plano efetivamente lido é derivado do resultado/adaptador e da requisição
  semântica, nunca da resposta candidata;
- pessoa compara scope e membro e rejeita atribuição explícita a outro membro
  conhecido, sem colocar nomes no relatório;
- período e base temporal exigem equivalência do contrato normalizado;
- dimensões exigem domínio, operação, agrupamentos e filtros equivalentes,
  normalizando caixa e acentuação textual;
- fonte exige envelope read-only sob autoridade do servidor e provenance
  explícita; fallback declarado continua observável;
- cobertura `unavailable` falha, `empty` exige contagem zero e `available` não
  aceita “não houve” sem coleção vazia ou agregado zero comprovado;
- envelope contraditório com falha da tool falha fechado;
- o relatório contém apenas estados, checks e códigos de razão, sem planos,
  nomes, valores ou payloads.

## Integração

O agente iterativo do ARQ-03 mantém os resultados brutos somente em memória e
os fornece ao verificador quando o reasoner produz uma resposta candidata. O
objeto `adequacy` entra somente no relatório shadow. Clarificação permanece
`not_applicable`. A resposta, ação e verificação do pipeline vigente continuam
sendo a única saída autoritativa.

## Invariantes

- verificações atuais de valores, percentuais, contagens, ordem, rótulos e
  vazamento interno não são alteradas;
- resultado inadequado não é exibido ao usuário e não muda a resposta vigente;
- no máximo três execuções read-only entram na avaliação;
- nomes conhecidos são usados somente localmente para detectar atribuição
  conflitante e nunca entram no relatório;
- nenhuma nova fonte, cálculo financeiro, writer ou fallback é criado;
- zero ativação em handler, WhatsApp ou produção.

## Evidência local

- RED confirmado pela ausência inicial do módulo;
- testes focais do verificador e agente iterativo: `21/21`;
- integração LangGraph afetada: `1/1`;
- bateria causal do agente: `88/88`;
- bateria de aceitação: `265/265`, zero gap, 23 bloqueios de segurança, 238
  respostas verificadas e zero chamada Gemini;
- baseline de trajetória: `265/265`, críticos `15/15`;
- suíte hermética ampla final: `1.786/1.796`, zero falha e dez ignorados;
- cobertura ampla final: linhas `91,70%`, branches `74,68%`, funções `91,23%`;
- WhatsApp, rede, produção, planilha e writer permaneceram fora.

As contagens são execução local relatada pelo candidato. A auditoria deve
revisar o hash imutável e não tratá-las como execução própria.

## Arquivos causais

- `src/agent/financialEvidenceAdequacyVerifier.js`;
- `src/agent/financialIterativeShadowAgent.js`;
- `src/agent/resultVerifier.js` (dependência preservada, sem alteração);
- `src/agent/financialAgentTrajectory.js` (contrato reutilizado, sem alteração);
- `tests/financialEvidenceAdequacyVerifier.test.js`;
- `tests/financialIterativeShadowAgent.test.js`;
- `tests/financialAgent.test.js`;
- `package.json`.

## Critério de GO técnico local

O parecer independente deve confirmar que:

1. o verificador numérico anterior continua sendo executado;
2. pessoa, período, base temporal, dimensões e fonte falham fechados quando não
   são comprovados pela leitura efetiva;
3. fonte indisponível, vazio explícito e zero agregado não são confundidos;
4. alegação textual de ausência sobre evidência não zero é rejeitada;
5. o relatório não expõe nome, plano, valor ou payload;
6. o resultado de adequação permanece interno e não autoritativo;
7. não existe ativação normal, writer, nova fonte ou nova matemática;
8. não permanece lacuna causal indispensável dentro do ARQ-04.

Com GO, fica autorizado apenas encerrar tecnicamente o ARQ-04 e preparar o
ARQ-05, canário read-only por domínio. Deploy, canário e produção continuam
dependendo de contrato e autorização próprios do ARQ-05.
