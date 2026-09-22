# N02-G — proposta de autoria das guardas de evidence_state

2026-09-22. PROPOSTA DOCUMENTAL; não aplicada. Base:
`69a385832876329afb4da73ffb5cc79d1ef94254`. O candidato documental é o hash
imutável que contém este texto e o inventário indicado abaixo.

## Objetivo fechado

Decidir se a autoria derivacional deve incluir as leituras das guardas de
estado já existentes em oito contratos v1, sem modificar runtime, perfis,
gerador, schemas, claims, snapshots ou grafos neste commit. Não pedir GO de
código nem global. A aplicação instrumental anterior recebeu APTO focal em
50ad614, recibo instrument-normative-independent-review.md; não autoriza este
novo delta.

Diagnóstico local posterior, base limpa 69a3858: 73/76 derivações exercitadas,
73 seleções coincidentes, 17 composições exatas, 58 eventos inválidos e zero
operações sem suporte. Os três derivados continuam pendentes. O diagnóstico
revelou omissões, mas NÃO fornece os valores do expected desta proposta.

## Regra proposta e fundamento a decidir

Uma guarda que valida a compatibilidade entre o estado declarado do claim e
a fórmula executada é consumo causal do contexto instrumentado. Sua leitura
deve constar em required_claim_reads da fase derivation, mesmo quando o valor
normal do corpus já é conhecido. Não é leitura gratuita do descriptor nem
licença para copiar toda a proof.

Para os oito evaluator_id/version abaixo, exigir leitura de claim.evidence_state
e preservar a guarda de compatibilidade existente: confirmed nas métricas de
consumo/renda/contagem e estimated somente em safe_daily_pace. Essa decisão não
equipara estado do claim ao estado de cada evento: a entrada de safe_daily_pace
permanece confirmed, seu resultado permanece estimated, como exige a decisão
temporal e seu contrato. Não altera valor, unidade, seleção ou fórmula.

Nos dois contratos que consomem limite orçamentário, a guarda do orçamento
ligado ao role budget também lê evidence_state=confirmed antes de consumir
limit_minor. Propor required_reads desse campo no nó resolvido pelo binding;
ele já pertence a required_nodes. Não escolher budget_snack/budget_leisure
por nome e não promover relações transitivas adicionais.

**Ponto explícito para revisão:** o schema de budget admite somente confirmed.
A proposta mantém a validação causal explícita do operando no evaluator e
autora sua observação; não a confunde com validação de schema nem inventa uma
mutação projected schema-valid para budget. A existência do get no código,
isoladamente, não torna a guarda necessária: o auditor deve decidir se ela
materializa legitimamente a pré-condição do limite confirmado ou se deve ser
reconsiderada antes de autorizar a leitura. O mesmo rigor vale para a guarda
do claim: estado da entrada confirmed, sozinho, não prova estado do resultado.

Âncoras normativas: graph-binding-contract-v1.md §4 (contexto instrumentado,
leitura por fase, nenhuma leitura gratuita); evaluator-authoring-semantics-v1.md
(roles/contexto e separação de estados); temporal-relations-decision-v1.md
(confirmed de entrada versus estimated do claim); authoring-contract-v1.md
(estado ligado ao claim/fontes/conjuntos); oito contratos funcionais v1;
claim-contract.schema.json e evidence-snapshot.schema.json. Os 28 grafos já
possuem predicado de igualdade de claim.evidence_state e leitura correspondente
em proof; os seis orçamentos já possuem predicado confirmed e read em proof.
Isso ancora os valores sem autorizar copiar proof indiscriminadamente.

Confronto causal, não fonte normativa única: metricSelection.js verifica o
estado do claim antes de selecionar/somar e, em budget_remaining/safe_pace,
o do orçamento antes de ler limite. eligible_event_count, em metricDirectReads.js,
compõe selectConsumption: sua guarda não desaparece por ser transitiva.

## Delta fechado, apenas adições

| Contrato v1 | Claims | Estado do claim | Reads de budget adicionais |
| --- | ---: | --- | ---: |
| consumption_total | 7 | confirmed | 0 |
| category_consumption | 6 | confirmed | 0 |
| category_spent | 3 | confirmed | 0 |
| income_realized | 1 | confirmed | 0 |
| budget_class_consumption | 2 | confirmed | 0 |
| category_budget_remaining | 4 | confirmed | 4 |
| safe_daily_pace | 2 | estimated | 2 |
| eligible_event_count | 3 | confirmed | 0 |
| Total | 28 | — | 6 |

Adicionar `{segments:["evidence_state"]}` a required_claim_reads das 28
derivações e `{node:<binding budget>,segments:["evidence_state"]}` a
required_reads das seis orçamentárias. Nenhuma remoção ou outra alteração.
Preservar todos os outros campos desses grafos, 48 grafos fora do recorte,
proof, seleção, inventário, predicados, operadores, fontes, flags e resultados.

Inventário auditável: docs/audit-evidence/n02g-causal-authoring-profile/
evidence-state-proposal.json. Contém 28 registros exatos, bindings, predicados
existentes, adições propostas, oito hashes de contrato e fontes pinadas na base.
prepare-evidence-state-proposal.cjs só extrai/confere a proposta, não é novo
evaluator, gerador normativo ou admissão integral. Seleciona por ID/versão do
evaluator no registry, resolve role budget e exige estado/predicado/read de
proof coerentes; fact_key serve apenas para unir e identificar registros.
Não importa evaluator, trace, diagnóstico ou oracle; não aplica saída.

## Condições para eventual implementação

1. APTO documental explícito para ambas as classes de leitura. Se a guarda
   for considerada dispensável/inadequada, não esconder a divergência: parar
   e delimitar correção causal separada; não aplicar delta para obter verde.
2. Confrontar bytes da base e inventário congelado; qualquer drift interrompe.
   Obrigações determinadas por contrato/versionamento e bindings antes de
   executar, sem copiar observações do trace.
3. RED da autoria antiga; aplicação somente das 34 adições; teste que restaure
   o corpus-base removendo apenas essas adições, preservando todo o restante.
4. Testes instrumentados de leitura real e guarda, inclusive distinção
   estimated/confirmed de safe_daily_pace e percurso transitivo de contagem.
   Estado alternativo do claim admitido pelo schema pode testar a guarda;
   estado alternativo do budget viola schema e não será vendido como witness
   admitido. Não alterar schema/contrato para fabricar esse witness.
5. Teste de independência: expected congelado antes da execução; ausência da
   observação necessária deve falhar. Não exigir cobertura integral nos casos
   com outras pendências conhecidas nem removê-las deste candidato.
6. Testes afetados, única ampla final, commit sanitizado e nova auditoria de
   implementação antes de fechar. Não repetir ampla para esta proposta documental.

Fora do escopo: coverage dos demais claims, has(entity_id) da contagem,
budget_class, contas, parcelas, pagamentos, coleções, proof/host/M/derivados.
Nenhuma decisão aqui aceita um grafo ou altera graph_accepted/releaseEligible.

## Pedido ao revisor

Confirme hash/pai e fontes realmente lidas; avalie a necessidade causal das
duas guardas e a separação dos estados, não só a coincidência com runtime.
Confronte regra, contratos, predicados e inventário. Informe achados, limites
e APTO/NÃO APTO DOCUMENTAL para implementar exclusivamente 28 claim reads e
6 budget reads. Não execute mudanças nem emita GO de código/global/produção.
