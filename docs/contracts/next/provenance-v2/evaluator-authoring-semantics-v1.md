# Contratos funcionais e bindings — autoria N02-F

Estado: RASCUNHO; nenhum evaluator implementado ou aprovado por este pacote.

## Autoridade e reuso

As 39 entradas de metric-evaluator-registry-v1.json resolvem os contratos
funcionais existentes, seus hashes medidos e os roles normativos. Todos os
artefatos executáveis permanecem not_built. Os contratos referem o comportamento
de derive no validador v1 como fonte de revisão; não autorizam importar esse
validador no runtime nem chamá-lo como evaluator instrumentado.

Cada contrato descreve a fórmula em prosa revisável e propriedades algébricas.
Essas strings não são interpretadas como código. A implementação futura deve
reaproveitar kernel/read-model/canonicalValue quando semanticamente equivalentes
e preservar as diferenças históricas explicitadas nos contratos. O graph
evaluator não recebe branches por nome de métrica ou uma segunda fórmula.

## Entradas explícitas

context é uma referência de role definida pelo registry e ligada ao handle do
claim atual. Esse handle possui a revisão do claim contract, não é objeto cru.
Suas leituras são incluídas em required_claim_reads de cada fase. Isso fecha a
dependência de sujeito/período/filtros sem permitir contexto global implícito.

Os demais roles são referências a snapshots, conjuntos ordenados explicitamente
enumerados ou resultados de pais validados. A enumeração de população permite
examinar candidatos descartados; o grafo precisa provar separadamente seleção,
escopo e completude. Não se equipara população de entrada ao conjunto financeiro
selecionado. O registry não recebe o resultado esperado do oracle.

A política evaluation-policy-v1.json registra calendário, timezone, critério e
direção de ranking, desempate e parâmetros do ritmo diário. O snapshot policy
é medido sobre esses bytes e seus campos materiais entram no fingerprint.
Modificar uma configuração comportamental altera a revisão da política e exige
novo freeze/revisão. Na futura execução, esses bytes também devem ser incluídos
no closure comportamental correspondente, conforme NEXT-00; sua representação
como operando instrumentado não os isenta dessa exigência.

## Normalização dos claims

claims-v2.json foi autorado a partir do contrato de fatos e confrontado com os
diálogos do corpus. Não contém valores do oracle. A grammar admite as famílias
S/M/F/N e o gate de autoria exige igualdade dos 76 fact_keys.

Períodos de mês são tipados como month. Intervalos julho..agosto viram limites
civis inclusivos julho-01..agosto-31; isso preserva a abrangência e não converte
lente financeira. statement_due, as_of e through conservam tipos distintos.
A lente statement_competence do follow-up conserva a representação histórica
statement_due do contrato revisado, com justificação explícita no grafo.

person_comparison lista as duas pessoas sem redefinir o papel aritmético dos
operandos: left/right continuam no registry e nos bindings dos pais. O sujeito
da comparação não fica codificado em person-a-minus-person-b. Filtros de classe
orçamentária são campos próprios. budget_person preserva a condição revisada
de membro do orçamento familiar, inclusive o caso de consumo individual zero.

## Witnesses e limite de evidência

evaluator-witness-contracts-v1.json fornece 39 contratos discriminantes fora
do Golden Set, como 3-5=-2, floor(16/15)=1 e inclusão/exclusão nos fechamentos.
São descrições de casos sintéticos, ainda não fixtures de execução nem testes
passados. Sua materialização precisa de operandos schema-valid e isolamento
dos átomos pertinentes; falha de realização produz UNSATISFIED_MUTATION_WITNESS.
Esses exemplos não substituem a geração integral por nós/campos/arestas/reads.

Checks locais de 2026-09-10: os 76 claims satisfazem o schema e o conjunto/tipo
exato dos roles; 39 entradas de registry e 39 contratos satisfazem seus schemas.
Esses checks não demonstram semântica de seleção, leitura efetiva, closure ou
resultado. Ainda é necessária autoria/revisão dos 76 grafos e auditoria integral.
