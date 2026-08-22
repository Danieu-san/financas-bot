# ARQ-04 — recovery do vínculo causal em múltiplas leituras

Data: 2026-08-22

## Estado

`RECOVERY CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`.

Este documento não autoriza ARQ-05, canário, deploy, writer ou ativação normal.

## NO-GO anterior

O parecer independente do hash
`accb40608e4ad03c4aa718237c0540a4e8a17758` leu integralmente os oito arquivos
e emitiu `NO-GO` por uma lacuna alta/bloqueante:

- após duas ou três leituras, a verificação numérica recebia todas as
  execuções em um bundle;
- pessoa, período, base temporal, dimensão, fonte e ausência eram verificados
  somente contra a última execução;
- um fato de leitura anterior incompatível podia ser aceito enquanto a última
  leitura emprestava a adequação estrutural;
- os contratos do verificador anterior dependentes de `tool` e `plan` também
  perdiam a semântica exata ao receber o bundle sintético.

## Recovery

`numericalCheck` agora entrega ao `verifyAgentAnswer` somente o resultado da
última execução. Essa é exatamente a mesma execução usada pelos seis checks
estruturais e de coverage. Leituras anteriores podem orientar o refinamento do
reasoner, mas não podem fornecer fatos para a resposta candidata final.

Com isso:

- número presente apenas em leitura anterior incompatível falha como
  `invented_amount`;
- número presente na última leitura adequada permanece aceito;
- `tool`, `plan`, ordenação, rótulos e demais contratos do verificador vigente
  conservam a semântica de uma execução real;
- nenhuma leitura, valor, plano ou nome entra no relatório `adequacy`;
- resposta vigente, shadow read-only e zero writer permanecem inalterados.

## Evidência local após o recovery

- teste causal novo: leitura anterior incompatível com `R$ 99` seguida de
  leitura final adequada com `R$ 25`; resposta `R$ 99` é rejeitada;
- controle positivo: na mesma trajetória, resposta `R$ 25` é adequada;
- testes focais do verificador e agente iterativo: `23/23`;
- integração LangGraph afetada: `1/1`;
- suíte hermética ampla final após o recovery: `1.788/1.798`, zero falha e dez
  ignorados;
- cobertura ampla final: linhas `91,68%`, branches `74,56%`, funções `91,24%`;
- WhatsApp, rede, produção, planilha e writer permaneceram fora.

As contagens são execução local relatada e não devem ser tratadas pela
reauditoria como execução própria.

## Arquivos causais do recovery

- `src/agent/financialEvidenceAdequacyVerifier.js`;
- `tests/financialEvidenceAdequacyVerifier.test.js`;
- este documento.

## Critério de fechamento

A reauditoria deve confirmar que toda alegação factual aceita pertence à mesma
última leitura cuja pessoa, período, base temporal, dimensões, fonte e coverage
foram aprovados; que não existe mais bundle multileitura no verificador; e que
não resta lacuna causal indispensável dentro do ARQ-04.

Somente um GO independente no novo hash autoriza encerrar o ARQ-04 e preparar o
contrato do ARQ-05.
