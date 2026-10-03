# N02-G — proposta v2 do domínio e da migração de estratégias de path

Estado: **PROPOSTA NÃO RATIFICADA; IMPLEMENTAÇÃO DE PRODUTO BLOQUEADA**.
Base documental: `0b2fa642bda2737381d74b9e4baa205ea333a5e3`.
Objetivo: resolver o domínio de §§10.2/10.5/10.6, não fabricar G11 verde.
O parecer focal da base exige esta decisão; não aprovou um inventário substituto.

## 1. Decisão proposta e alcance

Adotar inventário v2 com duas granularidades explicitamente diferentes:

- **Semântica:** uma obrigação `same_type_wrong_path` por predicado que possua
  pelo menos um site path-bearing. O witness registra qual site foi usado.
- **Admissão:** uma obrigação `unknown_path` por site de path e uma obrigação
  distinta `unknown_reference` por site de referência authored.

É escolha normativa nova e limitada, não interpretação retrospectiva nem ajuste
de um número. A cobertura de admissão por site é deliberadamente mais forte
que a antiga redação por predicado. Não criar obrigação de mutar um literal
como path. Não acrescentar nesta decisão uma família universal de wrong-literal
ou wrong-reference semântico: isso exige seu próprio contrato discriminante.

Predicados sem path têm um registro positivo de aplicabilidade com zero sites
de path. Não recebem uma obrigação de path nem SKIP. Continuam sujeitos às
obrigações originais de predicate_atom, remoção, relação e estratégia de operador,
além dos controles de referência presentes e das demais famílias G11. Não
alegar que este adendo resolve a realização dessas outras famílias.

## 2. Sites definidos pela gramática, não pelo valor observado

Um site tem identidade `(fact_key, predicate_id, site_path, class, namespace)`;
site_path é um array de tokens de localização na autoria, começando em `args`.
Binding names e índices não podem ser deduplicados por valores iguais.

| Definição do schema | Site de path | Site de referência |
|---|---|---|
| fieldPath | segments, com locator fieldPath inteiro tipado | node, namespace de nós |
| claimPath | segments, com ramo do claim preservado | nenhum ID implícito inventado |
| selector | segments, com kind estrutural preservado | kind não é ID de evidência |
| reference (id/version/hash) | nenhum | identidade referenciada, controlada em id |
| id em node/edge/set/period_ref/period_bound.period | nenhum | respectivo namespace |
| literal / period_literal | nenhum | nenhum, inclusive literal de tipo id |

`fieldPath` inclui o anchor node: uma troca semântica de locator pode escolher
outro anchor admitido do mesmo kind ou outros segments existentes, preservando
o ramo, tipagem nominal/unidade/domínio e a forma do locator. Não transformar
field em claim, selector em literal, nem alterar outra asserção para compensar.
No negativo de admissão de path, alterar somente segments; o negativo de
referência altera somente o ID do anchor, mantendo segments intactos.

Aplicar a regra composicionalmente também a ref_set.field, sort, projection
e bindings de templates. Templates podem conter outros args conforme o schema;
percorrer toda a árvore finita authored, não apenas o primeiro binding.
Cada template/reference conserva version/hash ao testar ID desconhecido.
Não expandir corpos do registry nem multiplicar sites por membros em runtime.
Partial_policy tem forma reference, não path, mas o baseline typed pass atual
recusa esse ramo com partial_policy_missing: não existe resolver admitido para
ele nesta base. Se aparecer, o inventário v2 bloqueia por namespace não resolvido
até que o contrato/resolver correspondente seja ratificado; não inventar um
registry de policies nem omitir a coordenada. Não há ocorrência no corpus atual.
Namespaces são definidos pelo schema/registry; novo ramo sem regra declarada
falha fechado e bloqueia inventário v2, nunca é ignorado por default.

## 3. Ledger semântico

Família v2 `predicate_path_semantic`; ID depende de fact_key/predicate_id e
strategy, não do site escolhido depois. Expected enumera todos os predicados
com pelo menos um path conforme o schema admitido e deve coincidir com uma
enumeração independente da autoria. A escolha do site/alternativa é selada
antes do negativo e registrada com tipo, locator original e locator candidato.

O mutant preserva operador/estrutura do ramo e usa locator existente, resolvível
e plenamente compatível em tipo. Precisa atravessar a admissão e produzir o
witness semântico discriminante com conjunto exato de barreiras recusadas.
Claim/oracle e demais obrigações continuam preservados; nenhuma nova exceção
contrafactual ou de cofalha é criada. As exceções source-state e a fronteira A/B
eq já ratificadas conservam seus limites e não se generalizam por este adendo.

Recalcular hashes de autoria/pacote/artefatos afetados; não alterar fingerprints
de payload que permaneceu intacto. Se a construção modificar conteúdo material,
recalcular os fingerprints exigidos e provar isolamento sem compensação.
Compiler RED, throw, timeout ou recusa anterior a D/P não qualificam este ledger.
Falta contingente ou estrutural de alternativa discriminante mantém
UNSATISFIED_MUTATION_WITNESS. A aplicabilidade não depende de haver alternativa.

Uma execução não cobre outro predicate_id nem outra estratégia. Vários sites
do mesmo predicado não criam novas obrigações semânticas por este adendo.
Se desejada, cobertura semântica adicional por site é inventário auxiliar,
explicitamente separado e não usado para compensar obrigação G11 faltante.

## 4. Ledger de admissão

Famílias v2 `predicate_path_admission` e `predicate_reference_admission`.
Uma invocação própria por site. Expected, ID, tipo/namespace e diagnóstico
esperado são derivados antes de executar o negativo, sem actual/IR observado.

Negativo: uma única alteração, mesma forma, locator sintaticamente válido e
não resolvível no closed world do namespace exato. Schema deve aceitar a forma.
O resolver/checker específico rejeita; comprovar código e coordenada autênticos,
baseline admitido, restore, wrong-coordinate e rejeição de diagnóstico forjado.
`dp_execution=false`, `semantic_mutation_credit=0`, sem receipt/validated_parent.
Mensagem genérica não é autoridade. Unknown_operator permanece controle próprio
por predicado, sem receber crédito D/P e sem usar IDs deste inventário de paths.

Não chamar o native pass isolado de compiler completo. Relatório publica a
barreira efetivamente executada. Uma recusa de checker não prova integração
end-to-end do compiler; esta continua requisito da auditoria final de código.

## 5. Cardinalidade v2 e fail-closed

```text
path_semantic_expected = predicates_with_at_least_one_authored_path_site
path_admission_expected = authored_path_sites
reference_admission_expected = authored_reference_sites
```

São parcelas declaradas distintas; nenhuma substitui todas as mutations G11.
Restantes famílias preservam seus requisitos/IDs e ledger aplicável. Não alterar
os doze átomos, trace, nós/arestas, parents, oracle ou segurança de release.
Para cada ledger obrigatório, expected=generated=executed=matched, IDs únicos,
invocações únicas, zero UNSATISFIED e fontes/hashes/completude suficientes.
Applicability, migration e probes auxiliares nunca entram em matched/execução.
Cada nova autoria altera expected automaticamente. Enumeração deve confrontar
schema+autoria+IR; erro, ramo desconhecido, site omitido ou extra bloqueia v2.

## 6. Migração total sem apagar história

Congelar v1: duas estratégias por 22.994 operandos, **45.988 IDs**. Preservar
manifesto e relatórios originais, incluindo REDs, contagens e hashes. Após
ratificação, materializar uma tabela completa, um row por ID v1, contendo:
old_id/old_target, disposição normativa, todos os IDs v2 relacionados e hash
do adendo ratificado. Também publicar todos os sites v2 introduzidos sem
equivalente v1 e sua justificativa. Nenhum ID v1 pode ficar sem disposição.

Disposições propostas:

- `remapped_semantic_predicate`: antigo same_type_wrong_path num arg com path
  passa à obrigação por predicado; vários IDs antigos podem apontar à mesma
  obrigação v2, sem conceder várias execuções/créditos.
- `remapped_admission_sites`: antigo unknown_path num arg com locator aponta
  aos sites v2 de path/referência contidos nele; uma expansão requer execuções
  próprias de todos os sites novos, não reaproveitamento conjunto.
- `superseded_literal_outside_path_domain`: literal/period_literal sem locator;
  sem matched, SKIP ou PASS, com supersessão explícita por este adendo.
- `superseded_unratified_semantic_reference`: antigo wrong-path num arg só
  referencial; essa obrigação extra do WIP não é ratificada. As obrigações
  originais do predicado/nó/aresta continuam intactas; não alegar cobertura
  semântica de referências por um teste de admissão.

Estas disposições pertencem somente à migração, não à matriz de testes.
Uma obrigação v2 exigida não pode ser supersedida por ausência de witness.
Os IDs usam domínio `financasbot.mutation-requirement.v2`, separado de v1.
O inventário v1 nunca muda de estado histórico nem é retroativamente verde.

Ativação exige: auditoria documental suficiente; implementação RED/afetados;
tabela integral v1→v2; nenhuma linha órfã/duplicada; todos os sites introduzidos
declarados; zero mapeamentos para IDs inexistentes; comparação com IR/autoria;
e auditoria independente do candidato de código. Até lá v1 e WIP seguem HOLD.

Relatórios locais antigos não recebem crédito automático em IDs v2. Reutilizar
evidência apenas se a identidade causal completa e a invocação única estiverem
comprovadas; caso contrário executar o novo controle. Não repetir lotes por
mera troca de rótulo, nem somar relatórios parciais para fabricar G11 verde.

## 7. Projeção documental e limites

`path-domain-v2-projection.json` é gerado pelo verifier de extração imutável.
Reconstrói schema/corpus, sites, obrigações propostas e todos os rows de migração
em memória, publicando hashes/contagens e exemplos. Não aplica a migração ao WIP,
não valida suficiência normativa/runtime, não chama compiler/evaluator/oracle.
A implementação ratificada terá de persistir a tabela completa antes de ativar v2.
Na base congelada a projeção deriva 2.419 obrigações semânticas por predicado,
3.092 controles por site de path e 16.077 controles por site de referência.
Esses números são extração da proposta, não novas contagens aprovadas nem PASS.

Ampla histórica permanece RED 2.413 PASS / 3 FAIL / 10 SKIP. Nenhum amplo novo
é necessário para esta proposta documental. Não aprova código, G11/N02-G/
NEXT-02, NEXT-03, deploy, produção ou dados reais.

Revisor: julgar se estas regras fecham a lacuna sem esconder obrigação anterior,
se a semântica por predicado e admissão por site são suficientemente precisas,
e se a migração/disposições impedem falso verde. Resultado pedido: APTO
DOCUMENTAL PARA IMPLEMENTAR ESTA PROPOSTA, NÃO APTO ou REVISÃO INCOMPLETA.
