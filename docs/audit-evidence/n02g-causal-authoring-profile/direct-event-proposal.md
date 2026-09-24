# DIRECT-EVENT — proposta focal anterior a qualquer correção

2026-09-24. Base `07a2b2f04707c504c5412c0fc1456f1ced02fcf4`.
DOCUMENTAL, NÃO APLICADA. PAYMENT-REFERENCE foi aprovado no código
`09cb5f1cc9994373364c083f6b82e8d7b8534efb`; aquele parecer não aprova este grupo.

## Decisão pedida e limite

Revisar a composição causal de quatro métricas diretas (cinco claims), antes
de corrigir `metricDirectReads.js`. Não alterar fórmulas, resultado esperado,
seleção, proof, registry, contratos ou runtime neste candidato. O único delta
normativo proposto é uma operação `keys` na derivation de
`statement_payment_correspondence`. Nenhum delta é aplicado pelo helper.

A sonda revelou inconsistências; não é fonte de expected. A proposta abaixo
deriva dos contratos de evaluator, binding §4, schemas, claims e relações
autoradas. O helper não importa ou executa evaluator, recorder, oracle,
comparador ou diagnóstico, nem interpreta o runtime para gerar obrigações.

## Contrato composicional proposto

Reusar os níveis já existentes de `metricReferences`: referência admitida
(scalar + resolução) e referência cujo alvo é consumido (mais identidade/
payload preciso). Não criar tratamento por fact_key/alias, filtro de trace ou
uma tabela que copie o actual. No código futuro, compor operações por assinatura
semântica do metric ID, não acrescentar sucessivas exceções por grafo.

| Métrica | Consumo derivacional proposto | Fora da derivation |
|---|---|---|
| balance_delta | identidade/data/state do evento; person_id, category_id e account_id como referências admitidas; account_id coincide com sujeito; amount_minor com sinal | payload de pessoa/categoria/conta; prova do par de transferência |
| invoice_payment_amount | identidade/data/state do evento; person_id, category_id e settles_card_id como referências admitidas; categoria nominal neutral.invoice_payment; magnitude de amount_minor | account_id e payload de conta/cartão/categoria, sujeitos às obrigações de proof |
| invoice_payment_target_card | mesmo contexto de pagamento sem amount_minor; identidade/versão do cartão resolvido coincide com o role card; owner_id do cartão como referência admitida; retornar ID | payload de pessoa/categoria/conta; identidade de uma fatura |
| statement_payment_correspondence | composição do target_card e observação de keys do evento; recusar campo de vínculo a fatura fora do schema v1; retornar somente unproven | inferir fatura pelo cartão; fabricar proven |

Contexto comum: período date/event_date civil válido, data do evento igual à
consulta, state confirmed, sujeito account para balance_delta e event para os
demais. Não relaxar esses guards. Identidades/relações são admitidas pelo host;
handles falsificados não são substituto da admissão real em testes integrados.
Resolver person/category que não entram na aritmética valida referências
obrigatórias da autoria, mas não prova seu payload nem neutralidade isoladamente.

Para amount, a frase do contrato "após validar categoria, conta e vínculo ao
cartão" precisa ser julgada expressamente: propõe-se que a conta seja validada
pela proof obrigatória já autorada, não por uma leitura ornamental na fórmula.
Se o auditor considerar necessária validação adicional na própria derivation,
esta proposta não é autorizada como está; não se retira a obrigação do contrato.

A comparação de identidade/versão do cartão preserva o binding de role já
existente. Resolver seu owner_id não introduz uma igualdade nova entre pagador
e titular: exigir essa igualdade seria mudança financeira não autorizada. A
semântica de ownership e os predicados existentes devem permanecer distintos.

## Por que keys é uma obrigação, não acomodação do runtime

O contrato statement_payment_correspondence exige simultaneamente schema
revisado e observações estruturais que comprovem ausência de vínculo a uma
fatura. O schema v1 é fechado e não admite statement_id,
settles_statement_id ou settles_statement_period. O grafo dessa métrica tem
required_structural vazio em derivation. A verificação de ausência precisa de
uma observação estrutural autorada; não pode ser substituída por retorno
constante, argumento "o teste passa" ou esconder a enumeração realmente feita.

Propõe-se `keys` no evento ligado ao role event: uma enumeração cobre a
inspeção dos nomes expostos, permitindo rejeitar extensões não revistas sem
acessar campo que o schema não admite. Não alegar ausência só porque uma
referência a cartão existe. O perfil é selecionado pela métrica e resolve o
alias pelo claim, sem hardcode de M-05#1#4. Nenhuma obrigação de payload surge
automaticamente dessa operação. O auditor deve avaliar se esta primitiva é
suficiente para o contrato e o closed-world vigente.

## Evidência compacta e controles

`prepare-direct-event-proposal.cjs` lê fontes iguais à base imutável, verifica
76 fact_keys únicos, vínculo unívoco claim/graph, contratos do registry, snapshots
referenciados e ausência de campos de fatura no schema. Produz
`direct-event-proposal.json` com derivation integral dos cinco registros,
relações pertinentes, campos de proof pertinentes, contratos completos,
hash/blob das fontes e delta candidato separado. Não altera os grafos.

Testes internos: regra semântica invariável sob renomeação de aliases e IDs de
arestas, reordenação de registros, rejeição de métrica/role ambíguos e operação
keys já presente. Aplicação simulada em cópia: exatamente uma adição, quatro
grafos focais e os outros 71 inalterados; proof integral de todos preservada.
O hash do corpus original permanece igual antes/depois. Não é autenticação de
execução externa nem validação de fingerprints/reexecução financeira completa.

## Implementação posterior, somente após revisão

1. Fixar a composição aprovada sem ler expected no evaluator.
2. Produzir REDs gerados por variação de IDs, aliases, valores, datas, states e
   referências ausentes/divergentes; usar admissão real para coerência de alvo.
3. Se aprovado, aplicar somente o delta estrutural declarado e atualizar as
   identidades documentais dependentes pelo workflow existente.
4. Corrigir o runtime para essa composição; manter observações reais visíveis.
5. Integrar cinco grafos com expected congelado antes do evaluator, resultados
   confrontados separadamente com oracle e negativos removendo operações reais.
6. Afetados, uma ampla estável e nova auditoria de CÓDIGO. Esta aprovação
   documental não aprova tal código nem fecha os outros 12 residuais/derivados.

Sem GO global N02-G, NEXT-03, deploy, produção ou dados reais.
