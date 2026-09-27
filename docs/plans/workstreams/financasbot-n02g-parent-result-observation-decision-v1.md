# N02-G — decisão focal sobre observação de resultado parental

Status: **proposta para auditoria normativa; não autoriza implementação nem GO**.
Base da análise: `1d398edd3fdbd77c3f30f54d5533428a572f6604`.
Escopo: somente os três grafos `M-01#1#3`, `M-01#1#4` e `M-14#1#3`,
cada um com dois nós `validated_parent`.

## Fatos causais

O contrato de binding §4 exige cobertura exata de toda leitura causal e
separa `required_reads` de `required_edges`. O §5 só admite `derived_claim`
depois de recibo interno validado na mesma `execution_id`; `R` não entra no
trace da invocação que o produziu. Seu resultado anterior vira input de uma
nova invocação, então acessos a esse input são observados por `I`.

O proxy expõe `get('result')` como handle de record: seu evento observa apenas
o contêiner. Obter o escalar exige `get('value')` nesse handle, emitindo outro
evento em `['result','value']`. Os três grafos exigem `['result']` nas fases
derivation e proof, mas não `['result','value']` em nenhuma. O structural pass
da base rejeita qualquer path aninhado em `typed_result`. A comparação de
reads da base também não contabiliza `get(record)` como read, embora a
validação de metadado de acesso o trate como navegação. Esses defeitos
impedem PASS exato; não podem ser corrigidos filtrando eventos nem derivando
o esperado do actual.

Em desenvolvimento local, REDs confirmaram as duas lacunas. O ajuste de
baixo nível ainda **não publicado** permite somente `result.value` como
required_read de derived_claim e contabiliza o contêiner como read, com
validação de shape/ancestralidade por `access_metadata`. O corpus local tem
apenas os seis reads adicionais de derivation, comprovados por reconstrução
integral a partir da base. Esses resultados locais não são aprovação do
desenho de proof nem evidência de execução dos 76 grafos.

## Decisão proposta para uma única ratificação

1. Derivation deve declarar, para cada parent consumido, tanto
   `['result']` quanto `['result','value']`. O metric evaluator só recebe
   o handle instrumentado. `unit`/`kind` e a identidade do resultado são
   verificados pelo host contra o registry e o recibo antes da exposição;
   não são copiados de R para T nem aceitos do guest.
2. `get(record)` é simultaneamente uma leitura causal a comparar com
   `required_reads` e um evento cujo shape, binding e ancestralidade são
   validados por `access_metadata`. Apenas este último componente pode
   cobrir sua sequência na composição; a comparação de reads sozinha não
   aprova o evento. O leaf scalar continua outro read obrigatório.
3. Proof não recebe automaticamente os mesmos reads de derivation. O
   ponto normativo a ratificar é como deve comprovar o parent: a opção
   mínima é observar `result.value` e comparar o escalar com o recibo
   autenticado, mantendo `result` e acrescentando o leaf na fase proof.
   `fact_key`, `evaluator_version` e `result_hash` permanecem observados.
   O host verifica o resultado tipado integral e mede o fingerprint do
   snapshot derivado antes de emiti-lo; não aceita um recibo, fingerprint
   ou expected value fornecido pelo caller.
4. Se o §4 exigir que **a própria fase proof** percorra todos os campos
   materiais de `derived_claim` para recomputar seu fingerprint via handle,
   a opção mínima do item 3 é insuficiente. Nesse caso o contrato precisa
   declarar explicitamente os reads de `id`, `result.unit/kind/value` e
   `parents`, suas operações estruturais e o lowering fechado de
   `role_ref_list` antes de autorar o corpus. Não inferir essa escolha do
   trace observado. Este caso deve ser tratado como decisão normativa
   adicional, não como ajuste de teste.

## Critério da auditoria

Julgar se a opção mínima do item 3 é consistente com a frase vigente
“Fingerprint exige os campos materiais completos do nó. Esses acessos
pertencem à fase proof” e com o §5 sobre fingerprint de `derived_claim`.
Se não for, apontar a obrigação exata de proof e o menor ajuste normativo
necessário. Não aprovar implementação pela aprovação deste documento.

Qualquer solução deve preservar: trace exato por fase, sem expectativa
preenchida pelo actual; parent validado na mesma execução; result_hash
canônico; registry como autoridade única; R/I/M/L/T separados; nenhuma
aceitação parcial dos 76 grafos. Não abre NEXT-03, deploy, produção ou
dados reais.
