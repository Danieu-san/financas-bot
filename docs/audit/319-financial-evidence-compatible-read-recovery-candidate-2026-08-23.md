# ARQ-06 — recovery de prova compatível entre múltiplas leituras

Data: 2026-08-23

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

O canário de produção está `off`. Este candidato não autoriza novo artefato,
deploy, reativação, writer ou retirada do baseline vigente.

## Falha real observada

O recovery 318 recebeu `GO TÉCNICO LOCAL`, foi publicado por artefato imutável
na OCI com o canário desligado e manteve PM2, SQLite, WhatsApp e health
local/público saudáveis.

No smoke real, a pergunta `Quais foram os maiores gastos da família neste mês?`
resolveu `scope=family`, selecionou os dois membros autorizados e usou
`source=personal_sheet`. O adaptador produziu `candidate_answer`, provando que o
ranking mensal passou a existir, mas a promoção foi bloqueada com três leituras
e `adequacy=inadequate`. O fallback vigente foi entregue e o canário foi
imediatamente revertido para `off` por `SIGHUP`, sem restart ou escrita
financeira.

## Causa e recovery

O verificador de adequação vinculava todos os critérios exclusivamente à última
leitura executada. Assim, uma leitura compatível que sustentasse integralmente
a resposta era descartada quando o reasoner realizava depois uma leitura
auxiliar não equivalente.

O recovery avalia no máximo as três leituras já permitidas, da mais recente
para a mais antiga, e só aceita a resposta quando uma única leitura prova ao
mesmo tempo:

- todos os números mencionados;
- pessoa e escopo;
- período;
- base temporal;
- domínio, operação, agrupamento e filtros;
- origem server-side read-only;
- cobertura e eventual alegação de ausência.

Resultados de leituras diferentes não são combinados. Um valor presente apenas
em leitura incompatível continua rejeitado, mesmo quando existe outra leitura
estruturalmente correta. Sem uma leitura individual integralmente adequada, o
resultado permanece `inadequate` e o baseline continua sendo a única resposta
visível.

## Evidência local

- RED: prova compatível anterior seguida de leitura auxiliar era rejeitada;
- GREEN focal do verificador: `18/18`, incluindo o controle negativo simétrico;
- integração sintética: ranking compatível, duas leituras auxiliares, três
  leituras totais e promoção apenas porque o ranking sozinho sustenta a resposta;
- bateria causal de adequação, shadow, canário e agente: `134/134`, zero falha;
- syntax check do verificador: verde;
- suíte hermética ampla única: `1.815/1.825`, zero falha e dez skips previstos;
- cobertura ampla: linhas `91,72%`, branches `74,62%`, funções `91,19%`;
- rede e subprocessos externos foram bloqueados pelo runner amplo;
- nenhuma consulta adicional com dados financeiros reais foi enviada a provedor
  externo durante o diagnóstico deste recovery.

As contagens são execução local relatada, não execução do auditor.

## Arquivos causais para auditoria

- este documento;
- `src/agent/financialEvidenceAdequacyVerifier.js`;
- `tests/financialEvidenceAdequacyVerifier.test.js`;
- `tests/financialIterativeCanary.test.js`.

## Critério de GO

O auditor deve confirmar que a busca por prova anterior não mistura evidências,
que cada tentativa usa somente um resultado de ferramenta, que o scan permanece
limitado às três leituras já autorizadas, que valores de leituras incompatíveis
continuam bloqueados e que nenhuma superfície de escrita, identidade ou produção
foi ampliada.

Com `GO TÉCNICO LOCAL`, fica autorizado apenas construir e promover um novo
artefato OCI mantendo o canário `off`. A reativação estrita para
`expenses`/`personal_sheet`, a pergunta real, o follow-up e a telemetria terminal
continuam sendo um gate operacional separado com rollback imediato.
