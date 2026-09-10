# Tipos, identidade e vínculo de execução — proposta N02-F

Estado: RASCUNHO NÃO RATIFICADO. Nenhuma implementação de runner ou evaluator.
Deriva do desenho NEXT-00 §§3–8/12–14, roadmap §6 e Model Data Boundary §3–5.

## 1. Identidades distintas

O contrato de autoria possui `contract_id` e um `claim_id` opaco, atribuído
pelo autor e único dentro desse contrato. `fact_key` permanece uma referência
independente ao corpus. Dois fact_keys não podem compartilhar claim_id no mesmo
contrato. A unicidade é comparação de valores, não convenção lexical.

Identidade estática: `(contract_id, claim_id)`. A revisão congela uma associação
imutável entre essa identidade e o descriptor inteiro do claim: fact_key,
métrica/unidade, sujeito, período, lente, coverage/estado, evaluator_ref e
operand_bindings. Alterar descriptor mantendo ID não mantém a revisão antiga:
o hash integral do contrato muda e exige revisão. Nunca resolver só pelo ID.

Identidade de uma instância: `(execution_id, contract_id, claim_id)`, associada
pelo host confiado à invocação real. `execution_id` vem do host, não da fixture,
do modelo ou do evaluator. Para um mesmo escopo, associação duplicada ou
divergente é erro; outra execução cria outra instância, mesmo com mesmo valor.

O executor futuro entrega handles segundo os bindings resolvidos. Seu retorno
funcional R é validado como saída daquela invocação e só pode ser associado ao
claim previsto. Uma resposta de outra invocação não é aceita por ter o mesmo
valor. O vínculo está no host confiado, não em um claim_id retornado pelo
evaluator. A aceitação confronta separadamente R/oracle e T/provenance; não
constrói um envelope comum denominado trace.

O código do projeto que mantém esse vínculo e decide a aceitação pertence ao
`validation_tcb_root`; não existe associador não pinado entre resultado, claim
e execução. Isso especifica uma responsabilidade do host existente, não um
novo serviço ou uma terceira autoridade sobre R/T.

Para derived_claim, a identidade adicional permanece exatamente
`(fact_key, evaluator_version, result_hash)`. O contrato de hashing do resultado
derivado deve incluir resultado tipado, descriptor, bindings de roles e hashes
dos pais. Pais são associados por role, não reordenados arbitrariamente;
ciclos falham. O preimage proposto, sua ordem canônica e a resolução dos pais
estão em `graph-binding-contract-v1.md`, §5. A autoria mantém referência ao pai;
somente uma execução validada futura pode materializar seu resultado/hash.

## 2. Projeção pública

O gateway futuro aloca IDs públicos opacos e efêmeros a partir do namespace
privado do request, mantendo mapa interno para as instâncias validadas. Tokens
não derivam de IDs internos, hashes estáveis ou contadores globais. Reutilizar
o mesmo token dentro do request pode referenciar o mesmo claim; associá-lo a
outro claim é erro. Fora do request a resolução falha, mesmo se o token existir
em outro mapa. O descarte/TTL deve acompanhar o contrato de request.

Não expor contract_id, fact_key, execution_id interno, hashes/roots, source IDs
ou a tabela de binding. O envelope público só conterá os campos permitidos pela
Model Data Boundary. `claim-contract.schema.json` descreve contrato interno de
autoria, não esse envelope público e não autorização de egress.

## 3. Tipos e semântica além do JSON Schema

O schema é closed-world estrutural. Ele não prova sozinho: unicidade de IDs
entre objetos; igualdade de conjuntos; validade de datas no calendário;
ordenação de intervalos; resolução de refs por kind; permissões; consistência
da unidade com evaluator; completude ou provenance. Esses checks são obrigações
do futuro compile/proof gate. PASS de JSON Schema não será PASS financeiro.

Datas são datas civis ISO válidas, sem coerção de timestamp. Intervalos usam
start/end com inclusividade explícita; start deve ser <= end. `through` e
`as_of` são tipos distintos mesmo quando usam a mesma data. Mês tem início/fim
calculados sob calendário/policy explicitamente registrados, não relógio global.
statement_due e statement_competence não são aliases de billing_period.

`registry_snapshot` referencia uma revisão explícita; `request_execution` é
ligado ao turno sintético do corpus. Nenhum deles implica uso de estado global
corrente. A lente histórica `15_full_days_after_as_of` permanece enum explícito;
o evaluator contract deve declarar a propriedade correspondente, sem extrair
parâmetro por regex ou entregar a matemática ao modelo.

Sujeitos simples têm kind/ref_id; composições têm campos tipados separados.
Comparações usam sujeito da consulta e roles de operandos do registry, não
strings como `person-a-minus-person-b`. A extensão `budget_person` explicita a
composição já presente no contrato v1 e será revisada no schema v2.

## 4. Registry de autoria versus execução

`metric-evaluator-registry.schema.json` distingue documentos completos por
`stage`: `authoring` ou `execution`. A mesma entrada id/version conserva uma
única definição de roles e contrato; não existe tabela paralela autoritativa.

Authoring exige contrato funcional existente/referenciado e seu hash real, mas
declara `artifact_status: not_built` e proíbe artifact root. Não pode ser usado
para execução, medição, PASS de closure ou freeze executável. Não é `null`
interpretado como sucesso. O conjunto declarativo pode ser revisado antes do
código, conforme a ordem ratificada.

Execution exige roots reais para todas as entradas e revisão independente do
candidato que os introduziu. Uma flag não promove authoring: resolver o
documento authoring no runner é erro, mesmo que todos os outros checks passem.
Alterações de código/contrato/roles requerem nova versão e revisão; a vinculação
inicial do artefato requer revisão do novo hash, sem alegar que a auditoria da
declaração anterior já aprovou esse executável.

O hash do contrato é medido sobre seus bytes UTF-8 exatos, sem normalização
implícita. Artifact root continua Merkle root do closure pós-transformação
integral, conforme NEXT-00; nunca o hash isolado de entry module. O freeze
referencia somente o hash integral do registry para essa autoridade.

Além do schema, o futuro gate deve exigir unicidade de id/version por entrada
e de role_id por evaluator, resolução de contract_path/witness IDs, hash real
dos bytes, consistência de metric/unit com a assinatura e igualdade exata dos
bindings com os roles declarados. Array presente ou digest bem formado não
comprova nenhuma dessas propriedades.

Os identificadores dos schemas são URNs locais: resolvê-los não autoriza I/O
nem lookup de rede. Os metasschemas são usados apenas por ferramentas locais
de validação documental; não entram como código remoto no closure.

## 5. Snapshots sem alteração da fixture v1

O snapshot v2 precisa identificar explicitamente fixture/version e registro.
Onde v1 não tem version por registro, a revisão imutável da fixture pode ser
parte da identidade de snapshot; não inventar uma versão bancária de origem.
O manifest de autoria deverá mapear o registro original e cada campo promovido
ao objeto tipado, preservando presença/ausência e sem inferir statement_id.

Uma coleção vazia exige objeto de prova que registre coleção, revisão, escopo,
cobertura e membership observado. Zero elementos não implica complete: é o
closed-world sintético revisado que deve sustentar essa declaração. O schema
dos membros e o witness de adição válida continuam necessários, mesmo sem
exemplos presentes. O material registry, snapshot schema e manifest já existem
como rascunhos; sua validação de shape/referências não prova coverage financeira.

## 6. Critérios adversariais documentais

Os schemas devem rejeitar campos desconhecidos, resultado numérico dentro do
claim de autoria, cópia de hashes/roles nele, sujeito/período com shape errado,
bindings não tipados, authoring com artifact root e execution sem root.
Testes mecânicos desses shapes não substituem as futuras provas causais de
troca de invocação, colisão de IDs, egress entre requests, DAG ou execução real.

Validação local de 2026-09-09: 20/20 checks com `Test-Json -Schema`, aplicados
aos dois schemas. Os dados temporários foram montados em memória e não são
fixtures financeiras nem um registry publicado. Os hashes repetidos usados
nesses exemplos são apenas witnesses de formato, nunca hashes medidos.

| Grupo | Casos executados | Resultado |
|---|---|---|
| Claim positivo | contrato mínimo tipado | aceita |
| Campos proibidos | value, result, evaluator_contract_hash, roles, unknown | rejeita os cinco |
| Shape do claim | sem claim_id; sujeito string; range sem inclusividade; mês inválido; binding string; hash em evaluator_ref | rejeita os seis |
| Registry positivo | authoring sem root; execution com shape de root | aceita os dois apenas estruturalmente |
| Registry negativo | root em authoring; execution sem root; root null; hash placeholder; cardinalidade incompatível; stage desconhecido | rejeita os seis |

Esta bateria pontual ainda não é uma suíte de regressão versionada. As provas
causais finais continuam pendentes; nenhum total foi promovido a GO N02-F.
