# ARQ-05 — candidato do canário iterativo read-only por domínio

Data: 2026-08-22

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este documento não autoriza alterar `.env` real, ativar canário, enviar resposta
nova, fazer deploy, escrever dados financeiros nem retirar o caminho vigente.

## Objetivo causal

Permitir que o agente iterativo aprovado nos ARQ-03/04 substitua uma resposta
analítica somente quando domínio, usuário e fonte forem explicitamente
habilitados, a resposta estiver sustentada por evidência adequada e toda a
execução permanecer read-only. Qualquer falha preserva a resposta vigente.

## Implementação

- `financialIterativeCanaryRuntimeConfig` mantém modo `off|canary`, allowlist
  exata do casal, domínios e fontes habilitados;
- a configuração é aplicada atomicamente por `SIGHUP`; configuração inválida
  não altera os valores anteriores e a retirada de um domínio funciona como
  rollback independente;
- `financialIterativeReasoner` usa OpenRouter somente quando a chave existe e o
  gate está elegível, com timeout, limite persistente por pergunta/mês e saída
  JSON restrita a tool, answer ou clarify;
- o reasoner recebe apenas mensagem, trajetória e envelopes sanitizados; não
  escolhe usuário, família, planilha, tenant, fonte, SQL livre ou writer;
- a fonte central reutiliza as tools semânticas aprovadas no ARQ-02;
- a fonte pessoal lê a planilha resolvida server-side pelo owner autorizado e
  expõe somente agregados completos suportados, transações recentes limitadas e
  snapshot público; operação que poderia parecer completa usando amostra falha
  fechado;
- `financialIterativeCanary` promove somente answer com adequação aprovada e
  contadores explícitos de mensagens e escritas em zero;
- falha do provedor, orçamento, tool, fonte ou integração mantém integralmente a
  resposta do pipeline vigente;
- a telemetria contém apenas estado, domínio, classe de fonte, contagem de
  leituras, ação, adequação e comparações booleanas, sem pessoa, identificador,
  descrição, valor ou payload.

## Integração

O `messageHandler` resolve usuário, família, escopo, domínio e fonte antes do
canário. Para o read-model central, a trajetória verificada do agente vigente é
o baseline. Para planilhas pessoais, o pipeline vigente continua produzindo o
baseline e o canário faz sua leitura semântica separada sob o mesmo owner e
escopo autorizados. Follow-ups preservam o plano e a marca de continuidade já
resolvidos pelo servidor.

O canário está integrado atrás de quatro flags novas documentadas com modo
`off`. Nenhuma flag real, segredo ou ambiente de produção foi alterado.

## Invariantes

- somente dois `user_id` explicitamente autorizados podem entrar no canário;
- domínio e fonte precisam estar simultaneamente habilitados;
- a fonte é selecionada pelo servidor, nunca pelo modelo;
- nenhuma tool de escrita existe no catálogo iterativo;
- até três leituras semânticas, com até quatro chamadas do reasoner para
  permitir a resposta posterior à terceira leitura;
- limite mensal persistente é reservado antes de cada chamada externa;
- fonte indisponível, operação pessoal incompleta ou evidência inadequada caem
  no baseline sem resposta falsa de zero/ausência;
- rollback de um domínio não desliga os demais e não exige desfazer estado
  financeiro, pois o canário não escreve;
- produção permanece com o comportamento anterior enquanto o modo estiver
  `off`.

## Evidência local

- RED confirmado pela ausência inicial dos módulos do ARQ-05;
- testes focais finais do ARQ-05: `12/12`;
- bateria causal ARQ-03/04/agente: `119/119`;
- regressões dirigidas 3F1H/4D/5B e política familiar: `70/70`;
- regressão 4A incluída na bateria causal do agente;
- bateria de aceitação: `265/265`, zero gap, 23 bloqueios de segurança, 238
  respostas verificadas e zero chamada Gemini;
- contrato de ambiente: zero variável não documentada e zero acesso dinâmico
  não aprovado;
- suíte hermética ampla final: `1.800/1.810`, zero falha e dez ignorados;
- cobertura ampla final: linhas `91,68%`, branches `74,59%`, funções `91,17%`;
- rede bloqueada na suíte ampla; WhatsApp real, Google real, OpenRouter real,
  planilha, produção e writer permaneceram fora.

As contagens são execução local relatada pelo candidato. A auditoria deve
revisar o hash imutável e não tratá-las como execução própria.

## Arquivos causais

- `.env.example`;
- `index.js`;
- `src/config/financialIterativeCanaryRuntimeConfig.js`;
- `src/agent/financialIterativeCanary.js`;
- `src/agent/financialIterativeReasoner.js`;
- `src/agent/financialPersonalSheetSemanticAdapters.js`;
- `src/agent/financialIterativeShadowAgent.js`;
- `src/handlers/messageHandler.js`;
- `tests/financialIterativeCanary.test.js`;
- dependências preservadas do ARQ-02/03/04, sem nova matemática ou writer.

## Critério de GO técnico local

O parecer independente deve confirmar que:

1. o padrão `off` não chama reasoner nem tools do canário;
2. usuário, domínio e fonte falham fechados e são definidos server-side;
3. read-model central e planilha pessoal possuem caminhos reais, sem permitir
   que o modelo injete owner ou identidade;
4. consultas pessoais incompletas não são apresentadas como resultados
   completos;
5. timeout, orçamento, resposta inválida e falha de fonte preservam o baseline;
6. somente candidato answer adequado e com side effects zerados é promovível;
7. follow-up e família preservam a trajetória e o escopo autorizados;
8. métricas e logs não expõem identidade, texto financeiro, valores ou payload;
9. a recarga é atômica e o rollback é independente por domínio;
10. não existe ativação real, segredo versionado, writer ou mudança de produção.

Com GO, fica autorizado apenas encerrar tecnicamente o candidato local do
ARQ-05 e preparar um ensaio controlado de promoção/rollback. Ativação real e
deploy continuam condicionados a evidência e decisão separadas.
