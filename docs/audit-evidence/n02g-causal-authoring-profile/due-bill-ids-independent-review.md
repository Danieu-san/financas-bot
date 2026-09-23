# Due bill IDs — revisão documental independente

Candidato 2c287a53cbbbe6588a470d3db0aa3728b1b4d37c;
pai adc9cfcec1108c056fb2dd6f974c6f1ccd52d89c. Uma solicitação em conversa limpa:
https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab3b360-93ac-83e9-aa2f-45fbb794c6a9

APTO DOCUMENTAL, sem crítico/alto/médio. Auditor confirmou hash/pai único e
quatro arquivos documentais, sem alteração de runtime/testes/corpus.
Leu plano, inventário, helper, checkpoint, runtime, referência histórica,
claims, registry, schema, material registry, binding, manifest e os contratos
due_bill_ids/due_bills_total. Não recuperou graphs-v2.json integral por tamanho;
leu sua extração na proposta, sem tratá-la como segunda leitura independente.

Fundamento confirmado: IDs filtram pessoa/status/data e projetam id; soma lê
amount_minor. Materialidade/obrigatoriedade de amount_minor em bill não implica
consumo derivacional na listagem. Campo permanece na proof e na soma.
Regra despacha por evaluator ID+versão, resolve role bills e snapshot por
kind/ref_id/version/payload.id/fingerprint declarado. Sem actual/oracle;
fact_key é junção, alias é binding, não critério semântico.

Dois limites baixos/probatórios: ausência de leitura integral direta do corpus
e helper não executar evaluator/traces nem recalcular fingerprints semânticos.
Auditor não executou --check/testes; 75 outros grafos intactos é obrigação da
futura aplicação. Codex confrontou com fontes locais e helper --check PASS:
11 fontes iguais aos blobs da base, uma remoção proposta, nada aplicado.

Ratificado somente para implementar o delta fechado de M-15#1#1: retirar um
required_read amount_minor em derivation. Exigir RED, comparação integral,
focais/afetados, ampla única e auditoria de código por novo hash.
Sem GO de implementação/grafo/host/N02-G global/produção.
