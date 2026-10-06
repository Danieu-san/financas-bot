# Recorte causal — diagnóstico nativo de assinatura em templates

Partida: fixture180547 APTO focal, ampla local verde anterior preservada.
Histórico semântico v2: cinco rows none_match encerraram como
operator_types_shape antes de gerar candidatos. Não são PASS nem prova de
impossibilidade normativa. Fonte: relatório histórico hash3187e36259bc11fcd2c9063a6a4ba25987f1e1acca18a81a96aee87834b007d0.

Causa inspecionada: unifyOperatorTypes lança erro sem autoridade privada;
atBinding só atribui erros já nativos de templateReferences. Assim, um candidato
mal tipado interrompe toda a enumeração, em vez de ser recusado pelo checker e
deixar a busca continuar. Não resolver por regex/allowlist de mensagens ou por
novo caso especial de none_match. A abstração é proveniência do erro nativo do
checker de assinatura, composta no checker de template com a origem authored.

Escopo: diagnóstico privado WeakMap no produtor operatorTypes; composição no
wrapper de template, sem mudança de recusa/mensagem; testes de todas as
assinaturas, origens e erros externos forjados; enumeração por classe de template.
Sem mudança de norma, schema, tipos admitidos, seleção, claim, oracle, trace,
inventário/IDs ou exceção mensal. Sem expected oriundo de actual. Nenhum crédito
D/P decorre de descartar candidatos inválidos. Nenhum catch genérico novo.

Saída: RED causal, syntax, focais e afetados. Ampla somente após candidato
estável/revisão adversarial; auditoria independente por hash novo obrigatória.
Não atualizar contagens históricas nem reiniciar matriz completa. Git/index/WIP
original preservados; este delta reside no candidato isolado, não no produto.
Capacidade Codex→GPT-6.1 Sol→Alto; interfaces já ratificadas, sem nova norma.
Parent do candidato auditável:180547085ab3a24504c7d584374264ef242e1689.
Delta fechado: operatorTypes.js/templateReferences.js, seus dois arquivos de
testes, pathSemanticV2.cases.js e três artefatos deste recorte (este escopo,
path-template-diagnostic-final-evidence-20261006.json e
verify-path-template-final-evidence-20261006.cjs). Nenhum outro path.
Confrontar os leitores nativos e descarte em pathMutationInventory.js, o runner
hermético/tripwire e as regras de tipagem anteriores, todos inalterados.

## Evidência local inicial

RED3/3 FAIL antes da alteração: falta de reader nativo, origem template ausente
e enumeração interrompida por operator_types_shape. Depois3/3 PASS.
Bateria32/32 PASS e syntax5 PASS, fontes do recorte inalteradas durante execução;
hash do report0c1ef551ad07d8503bc8322b10efec366d7ec8b6af4e123ab008984faa2687bd.
Property probe cobre todos os operandos de todas as32 assinaturas registradas;
erros externos com texto igual continuam sem autoridade. Classe completa de
predicados authored com template é enumerada sem hardcode dos cinco IDs.
Nenhuma afirmação de completude dos locators nem de witness D/P aprovado.
Uma ampla final nova iniciada após revisão adversarial/diff check, fontes765
hash3e2ba6461cd9092ad3bc49d0fc2e15814ea3ee4463b0a93ddbf2084da9e74e35,
job path-template-final-wide-20261006-job.json. A ampla verde anterior foi obtida
antes deste delta: não usá-la como validação executada do código novo.

Ampla final CONCLUÍDA VERDE2026-10-06T04:48:14.349Z:2633tests/2623PASS/zero
FAIL/cancel/10SKIP previstos/exit0,coverage92.49linha80.52branch92.84função.
Report hash6dab8cd13ec4b6bb57596f6edac0c1d1945c83922faeee91b24fd232c7d837cd.
Captura,dez títulos SKIP,fontes e todos JSONs nativos são reconciliados pelo
verifier local sem executar testes. Brutos locais não publicados; auditor pode
verificar o código e a cadeia documental, não executar/ler aqueles brutos.
Flags audit/global=false representam a extração anterior à revisão independente.
Monitor de ampla excluído após conclusão,recorrência cinco horas preservada.
Código aguarda auditoria independente,sem GO de semântica/runtime/gate global.
