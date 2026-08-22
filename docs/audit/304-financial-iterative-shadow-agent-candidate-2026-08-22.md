# ARQ-03 — candidato do agente iterativo em shadow

Data: 2026-08-22

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este documento não autoriza flag, canário de resposta, deploy, escrita
financeira nem retirada do caminho vigente.

## Objetivo causal

Executar, depois da resposta produzida pelo pipeline vigente, uma investigação
iterativa estritamente somente leitura com no máximo três consultas semânticas.
O resultado serve apenas para comparar evidência e resposta candidata; não
responde ao usuário e não pode alcançar adapters injetados pelo chamador.

## Implementação

- `src/agent/financialIterativeShadowAgent.js` implementa o laço limitado;
- o reasoner recebe apenas mensagem limitada, trajetória reconstruída e
  sanitizada, catálogo abstrato, limite restante e envelopes de evidência;
- cada consulta passa pela fachada semântica read-only fechada no ARQ-02;
- ferramenta desconhecida, writer, adapter indisponível ou escopo ausente
  encerra o shadow sem efeito;
- a função pública descarta qualquer `adapters` fornecido pelo chamador;
- adapters sintéticos existem somente no export explícito `__test__`;
- `src/agent/langGraphRuntime.mjs` executa o shadow somente quando recebe uma
  função `iterativeShadowReasoner` injetada diretamente na invocação;
- nenhuma flag de ambiente, handler público ou rota de produção injeta esse
  reasoner;
- `iterativeShadowAdapters` é ignorado pelo runtime;
- resposta, verificação e ação do pipeline vigente permanecem a única saída
  autoritativa.

## Comparação

O relatório interno compara capacidade, fonte, cobertura e fingerprint do
payload sanitizado entre a evidência vigente e a candidata. O payload não é
copiado para o objeto de comparação. O relatório declara sempre
`visibleResponse: null`, `messagesSent: 0` e `financialWrites: 0`.

## Invariantes

- máximo absoluto de três leituras, mesmo se o chamador pedir mais;
- zero writer, zero envio de mensagem e zero resposta candidata visível;
- identidade, escopo, ledger e data continuam vindos somente do servidor;
- a trajetória exposta ao reasoner é reconstruída por allowlist e sanitizada;
- falha do reasoner ou do shadow é contida e não altera a resposta vigente;
- nenhuma nova fonte, soma, saldo, regra financeira ou fallback é criado;
- zero ativação em WhatsApp, produção ou chamada normal do produto.

## Evidência local

- teste focal do agente iterativo: `7/7`;
- integração LangGraph afetada: `1/1`;
- bateria causal do agente antes do endurecimento público: `88/88`;
- bateria de aceitação: `265/265`, 23 bloqueios de segurança, 238 respostas
  verificadas e zero chamada Gemini;
- baseline de trajetória: `265/265`, críticos `15/15`;
- suíte hermética ampla final após o endurecimento público: `1.772/1.782`
  aprovados, zero falha e dez ignorados;
- cobertura ampla final: linhas `91,70%`, branches `74,71%`, funções `91,21%`;
- teste real de WhatsApp, rede, produção, planilha e writer permaneceram fora.

As contagens são execução local relatada pelo candidato. A auditoria deve
revisar o hash imutável e não tratá-las como execução própria.

## Arquivos causais

- `src/agent/financialIterativeShadowAgent.js`;
- `src/agent/financialSemanticReadFacade.js`;
- `src/agent/langGraphRuntime.mjs`;
- `src/agent/financialAgentTrajectory.js`;
- `tests/financialIterativeShadowAgent.test.js`;
- `tests/financialAgent.test.js`;
- `package.json`.

## Critério de GO técnico local

O parecer independente deve confirmar que:

1. o limite máximo real é de três consultas semânticas read-only;
2. o reasoner não recebe identidade confiável, topologia ou payload bruto fora
   dos envelopes sanitizados;
3. writer, ferramenta desconhecida e adapter injetado pelo chamador falham
   fechados sem efeito;
4. a resposta vigente permanece autoritativa e a candidata nunca é exibida;
5. falha ou rejeição do shadow não altera o comportamento principal;
6. a comparação mede resultado/evidência sem expor o payload;
7. não existe caminho normal ou flag de produção que ative o shadow;
8. não permanece lacuna causal indispensável dentro do ARQ-03.

Com GO, fica autorizado apenas encerrar tecnicamente o ARQ-03 e iniciar o
ARQ-04, verificador de adequação. Deploy, canário de resposta, writer e retirada
do caminho vigente continuam proibidos.
