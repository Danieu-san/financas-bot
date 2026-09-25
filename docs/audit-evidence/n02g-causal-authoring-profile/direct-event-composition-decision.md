# DIRECT-EVENT — decisão normativa pendente sobre cinco derivações

2026-09-25. Fonte imutável: 3d343696482136ff4c5535e81776d3ed04c44f7e.
Estado: PROPOSTA NÃO APLICADA; sem aprovação de runtime ou GO global.

## Por que esta questão está separada

O APTO externo de 3d343696 encerrou o endurecimento nominal/keys do helper.
No esclarecimento posterior, o auditor confirmou expressamente que NÃO havia
concluído a suficiência normativa das cinco proposed_derivation. Não ampliar
retrospectivamente aquele parecer. Esta é a questão restante, não repetição
dos testes aprovados nem nova auditoria integral do N02-F/N02-G.

## Objeto exato a julgar

Ratificar ou rejeitar a composição das cinco derivações de direct-event-proposal-v2.json,
sem alterá-las. O novo JSON focal apenas extrai contratos, cinco claims completos,
bindings dos roles/relações diretas, snapshots correspondentes e requisitos
originais/propostos. A ordem e os campos copiados são preservados. Identidades
dos documentos fixam a fonte; não são prova de correção semântica.

| Claims | Contrato | Decisão de composição proposta |
|---|---|---|
| M-04#1#1 e M-04#1#2 | balance_delta | evento ligado ao role, data/state e contexto; account_id scalar + relação admitida, igualdade ao sujeito account; amount_minor com sinal. Não consumir person/category/transfer_pair na fórmula. |
| M-05#1#2 | invoice_payment_amount | identidade/data/state/contexto; category_id nominal neutral.invoice_payment, account_id e settles_card_id, cada scalar + relação admitida; magnitude amount_minor. Sem payload dos alvos ou person_id na fórmula. |
| M-05#1#3 | invoice_payment_target_card | identidade/data/state/contexto; settles_card_id scalar + relação; ID do card resolvido, concordante com binding/version do role card. Sem owner/person/category/account na fórmula. |
| M-05#1#4 | statement_payment_correspondence | identidade/data/state/contexto; keys do evento com schema v1 fechado, ausência de vínculo específico à fatura; resultado unproven. Role card admitido, mas não consumido pela fórmula. |

O núcleo usa get instrumentado de event.id/date/state e dos cinco paths de
claim_context explicitados na proposta. Para subject event, identidade coincide
com subject.ref_id; para subject account, account_id coincide com subject.ref_id.
date coincide com period.value civil, com period.kind=date/time_basis=event_date;
state precisa ser confirmed. O binding fecha qual evento foi consultado.

Não presumir que esses guards bastam por constarem nesta tabela: o auditor deve
decidir se cada contrato exige outra dependência causal, ou se alguma das
obrigações propostas é excedente. Separar admissão de binding/versão do host de
leituras feitas pelo evaluator; nenhuma leitura real pode ser ocultada.

Referencia scalar e travessia são operações distintas. Uma travessia admitida
não inventa get do payload alvo. Somente target_card consome explicitamente
card.id. Conferência nominal de categoria usa o scalar do evento já observado.
Não copiar expected da execução; o conjunto proposto está congelado antes dela.

As obrigações econômicas de proof continuam obrigatórias e inalteradas. Retirar
uma relação da derivation não a retira do grafo nem da proof. Não considerar
preservação de proof como prova autossuficiente de adequação da nova derivation;
se uma decisão exigir um predicado específico não projetado, registrar a lacuna
precisa. Não reler os 76 grafos para esta decisão de cinco composições.

## Evidência e limites

prepare-direct-event-composition-review.cjs extrai apenas de fontes locais
iguais ao commit fixado. Confere singularidade de registros/bindings, relação
scalar/alvo, hashes dos contratos e do snapshot manifest e igualdade do JSON
materializado com a extração. Não executa métrica, oracle, recorder ou trace.
O pacote inclui integralmente os quatro contratos e os cinco claims, além das
seções 2 e 4 do binding. event_payload_schema é a definição payload_event;
eventuais referências de tipo continuam no schema original, não redefinidas.
Predicados/proof completos e relações transitivas fora dos roles não são
projetados. O hash de proof é identificação, não atestado de suficiência.

O helper/documento da proposta v2 e seu APTO continuam evidência anterior.
Nada em src, contratos normativos, corpus, registry, dependências ou execução
financeira deve mudar neste candidato documental. Não repetir ampla verde.

## Resposta necessária e próxima fronteira

Responder por métrica se a composição é APTO DOCUMENTAL PARA IMPLEMENTAR ou
NÃO APTO/INCOMPLETA, indicando dependência causal ausente/excedente. Esta revisão
deve julgar suficiência normativa, não apenas fidelidade da extração/preservação.
Se aprovada e confrontada localmente, a autorização prévia de Daniel permite
produzir um candidato de código: aplicar exatamente as cinco derivações,
atualizar identidades dependentes, implementar guards/leituras, executar REDs,
afetados e uma ampla estável, depois auditoria independente de código.
Nenhum desses resultados futuros fica aprovado por esta revisão documental.
Sem NEXT-03, GO global N02-G/NEXT-02, deploy, produção ou dados reais.
