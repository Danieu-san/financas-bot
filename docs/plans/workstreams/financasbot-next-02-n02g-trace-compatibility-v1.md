# N02-G — resolução focal de compatibilidade entre traversal e trace

Estado: **CORREÇÃO IMPLEMENTADA; REAUDITORIA FOCAL PENDENTE**.
Não é GO global do N02-G. Não altera grafos, fixtures, oracle ou contratos
ratificados e não autoriza NEXT-03, deploy, produção ou dados reais.

## Decisão independente

A revisão independente do candidato `9ffaa60669904c2a7d5af547a529e60f09c5e36b`
confirmou que `required_edges` e `required_reads` são obrigações exatas e
independentes. O grafo `S-01#1#1` exige `e0023` na derivação sem exigir o nó
`person_b` ou leituras desse nó nessa fase. Essas leituras pertencem à prova.

O bloqueio era da implementação: `instrumentedAccess.traverse` relia a referência
da origem e `target.id` apenas para redescobrir uma relação já validada pelo TCB.
Essas leituras incidentais entravam corretamente no trace real, mas não eram
causalmente necessárias à derivação. Copiar o trace observado para o contrato ou
filtrar leituras reais continuaria proibido.

Evidência independente:

- evidence commit `77d894b705f58c1e76d7333c5330ae4a1dc714b0`, parent `9ffaa606...`;
- SHA-256 do source focal `0fb853ce45ee06f6abade90176a332caf20d3f592fa932a1300a1e519bc777f7`;
- blob do registro focal `5abcb5d528065b00bd575298176947ec605600ba`;
- parecer publicado em `1a2466dae00712d9ad10428eaff37eb61548ec81`;
- recibo operacional concluído em `54d90d3fee3bc4154fe25d92aa1acb433fc58cb6`.

## Correção aplicada

Na construção de `createInstrumentedAccess`, o TCB agora admite cada relação
material contra os valores copiados e já validados dos bindings:

- origem, alvo, campo e tipo continuam fechados pelo link compilado;
- o identificador real do alvo deve coincidir exatamente uma vez com a referência
  escalar, lista de referências ou `parent_ref` estruturado;
- relação ausente, divergente ou ambígua falha antes da execução guest;
- a admissão não emite evento de leitura e não materializa trace.

Durante a execução guest, `traverse(edgeId)` aceita somente uma aresta admitida e
alcançável a partir do handle corrente, emite a observação `traverse` e devolve o
handle do alvo. Não executa `get` na origem nem em `target.id`. Qualquer leitura
posterior realmente feita pelo guest continua instrumentada e visível.

O diagnóstico `inspectNextProvenanceTraceCompatibility.mjs` deixou de chamar a
independência entre aresta e reads de incompatibilidade. Ele continua verificando
que toda aresta exigida existe, informa os casos edge-only e nunca fabrica trace:

- 76 grafos e 152 fases examinados;
- 66 grafos e 1.133 obrigações edge-only, todas em derivation;
- `compatible=true`, pois edge-only é uma combinação normativa válida.

## Evidência local após a correção

RED prévio: seis casos focais falharam no comportamento antigo pelas leituras
incidentais e pela admissão tardia.

GREEN atual:

- seis casos causais de trace/traversal: 6/6 PASS;
- módulos `instrumentedAccess` + `authoringIndex`: 70/70 PASS;
- regressão de parcela divergente agora aceita a rejeição antecipada da admissão;
- bateria focal integrada `tests/nextProvenance.test.js`: 241/241 PASS,
  zero FAIL/SKIP/TODO;
- diagnóstico: exit 0, 76 grafos/152 fases, 66 grafos edge-only e 1.133
  ocorrências informativas.

A suíte ampla do repositório não foi executada neste incremento focal. O N02-G
permanece em desenvolvimento e ainda exige integração integral, confronto exato
de ambos os traces, recibos de parents validados, mutações/witnesses, closure/TCB
final e gate global. A próxima decisão é a reauditoria independente deste delta
corretivo; somente depois dela o desenvolvimento do N02-G pode continuar.
