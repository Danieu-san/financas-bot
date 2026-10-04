# N02-G — proposta de completion tipada para path singleton de mês

Estado: **PROPOSTA NÃO RATIFICADA; IMPLEMENTAÇÃO BLOQUEADA**.
Base imutável: `9f232674602e3b528cfd07e61b65537c01a9e784`.
O parecer focal dessa base confirmou apenas `M-01#1#1 / binding_1` como
UNSATISFIED sob o adendo v2. Não aprovou qualquer solução.
Objetivo: decidir um domínio de qualificação ampliado, não tornar o corpus
histórico não-singleton nem obter crédito por alteração de operador.

## 1. Escolha proposta, custo e limite da alegação

Adotar o perfil versionado `claim-month-path-completion/v1`, exclusivo de
qualificação negativa, com uma **view tipada adicional para P**. A claim
authored original, sua projeção funcional, snapshots, parents e oracle positivo
não mudam. Um sidecar selado antes do compiler fornece uma célula auxiliar
de período mensal; ela existe na view de qualificação, não na claim financeira.

É uma construção contrafactual explícita de locator, não alternativa já
existente no corpus, nem evolução silenciosa do schema financeiro. Portanto
altera limitadamente a regra "locator existente no closed world original"
de §10.2/v2: admite locator existente no **closed world estendido e selado do
perfil**. A alegação resultante é resistência ao wrong-path nesse perfil,
não execução do witness impossível no corpus histórico.

A escolha evita adicionar dados fictícios à claim de produto. Em compensação,
exige autoridades e isolamento novos, conformance autoria→IR, uma regra estreita
de admissão de qualificação e trace com origens distinguíveis. Sem demonstrar
cada um desses controles, o mesmo ID continua UNSATISFIED. Não há aplicação
automática, contagem projetada de PASS ou expansão para os outros 730 casos.

Não escolher corpus financeiro v3 com um segundo período nesta proposta:
sem significado funcional aprovado para esse campo, isso seria alterar o
modelo do fato para satisfazer o teste. Se a view não puder ser implementada
com isolamento, manter HOLD e preparar outra decisão; não converter a
dificuldade em bypass de checker ou enriquecimento de produção.

## 2. Aplicabilidade declarativa e ordem de construção

A obrigação v2 permanece por predicado. Primeiro procurar alternativa existente
na classe/tipo do corpus original. Somente admitir este perfil quando a análise
independente do schema+autoria+tipagem comprovar simultaneamente:

1. predicado alvo `period_eq`, atom/obligation `period`, exatamente dois args;
2. primeiro arg e único path authored é `claim.segments=["period"]`; segundo
   arg é `period_literal` de kind `month`, igual ao período original da claim;
3. o domínio original claimPath/period/month contém somente esse locator;
4. alvo não é consumido por selection, template/binding externo, D ou outra
   asserção; não é site causal de seleção ou de cálculo;
5. todos os parents reais, demais predicates, registries e guards do baseline
   são admitidos e o baseline executa D/P com oracle positivo congelado;
6. schema original não admite a raiz reservada `qualification`, e nenhuma
   entrada original, selection ou cálculo depende dela.

A aplicabilidade não depende do sucesso do mutant. Month kinds diferentes,
range, date, fieldPath, selector, subject/identity e outros operadores ficam
fora deste perfil e continuam sujeitos à regra v2 original. Não são SKIP/N/A:
se seu ID já é obrigatório, permanece obrigatório/UNSATISFIED sem witness.
Não codificar fact_key/predicate_id em allowlist para simular esta classe.

A primeira prova de integração será M-01/binding_1. Outros IDs só recebem
crédito após satisfazer individualmente os mesmos controles e execução própria.
Existência de uma classe declarativa não comprova os membros do WIP.

## 3. Autoridades seladas e identidade

O construtor confiável recebe baseline admitido, ID obrigatório, perfil
ratificado e fontes congeladas. Não recebe actual nem expected fornecido pelo
guest. Constrói antes de D/P um ticket privado, não serializável como autoridade,
vinculado por hash a:

- ID v2 original, fact_key, predicate_id, site `args[0].claim.segments`;
- commits/hashes do perfil, schema, registry, autoria, claim e oracle originais;
- pacote/snapshots/evaluator/parents reais e seus artefatos;
- sidecar e schema/view de qualificação, controle, mutant e manifesto de trace;
- args/op/atom/obligation originais e esperado da conformance do site;
- referência independente de operandos/booleano e plano de execuções únicas.

Metadados JSON, mapa autodeclarado do compiler e flags true não autorizam o
ticket. Ticket pertence à TCB externa; erro de vínculo, dado ativo/getter/proxy,
perfil não ratificado ou campo adicional desconhecido falha fechado.

CoreClaim é byte/canonical-equivalente à claim congelada; CoreContext é a
projeção original já admitida. D recebe exatamente CoreContext original.
P recebe uma view composta cujo núcleo é CoreContext e cujo único novo root
é qualification. Remover esse root reproduz CoreContext integralmente.
Não passar um raw claim ampliado ao evaluator nem mascarar novo hash como
hash original.

A view tem hash próprio e origem própria. Seus valores auxiliares não se
tornam evidência econômica nem campos da claim financeira. Os fingerprints
originais permanecem; novos artefatos/autoria/view/sidecar recebem seus próprios
hashes canônicos. Qualquer conteúdo material realmente alterado exige seu
fingerprint correto e torna este perfil inelegível se sair do único sidecar.

## 4. Schema e referência contrafactual fechados

O schema de view de qualificação, controlado pelo perfil e validado antes do
compiler, acrescenta exatamente:

```text
qualification:
  alternative_period:
    kind: "month"
    value: YYYY-MM válido, anos 0001..9999
```

A regra nominal vem de uma declaração de locator do perfil:
`["qualification","alternative_period"] → form:period, periodKind:month`.
Não se infere period por shape nem se confia em tipo fornecido pelo sidecar.
A mesma declaração vincula schema, resolver, projeção observável e IR; sua
conformance exige reconstrução independente, não o próprio mapa do compiler.

Gerador puro: para YYYY-MM, escolher o mês seguinte no mesmo domínio; no
máximo 9999-12, escolher 9999-11. O valor é válido e diferente por construção.
Não usar data local, relógio, timezone, resultado R, evaluator ou compiler.
A referência selada compara o mês original e o alternativo ao literal
congelado: control=true, mutant=false, restore=true. Essa comparação não
substitui a execução de P nem é oracle novo de R.

D continua confrontado exclusivamente com o oracle positivo original. Não
copiar R observado, recomputar oracle com o guest ou importar a exceção
contrafactual funcional de source_state. Se R divergir, não há witness.

## 5. Três autorias e admissão: alteração normativa adicional explícita

Control C: baseline integral + perfil/view/sidecar; predicado alvo original.
Mutant M: mesmo mundo C, **uma única troca** de segments no alvo, de
`["period"]` para `["qualification","alternative_period"]`.
Restore S: mesmas fontes de C/M e troca inversa; autoria igual à de C.
Op, ID, operands restantes, atom/obligation, nós, edges, seleções e parents
permanecem iguais. Sidecar é idêntico em C/M/S; não surge depois de actual.

Há uma dificuldade separada: `validateClaimRequirements` atual exige um
period_eq direto sobre claim.period; após a troca de path o mutant pode falhar
com claim_requirements_missing antes de P. **Acrescentar a view não resolve
isso sozinho.** A proposta altera explicitamente só a admissão de qualificação:

- compiler financeiro normal não muda; ausência do binding continua recusada;
- compiler de qualificação executa o pipeline sobre a autoria M completa,
  nunca compila C e injeta outro arg no IR após a compilação;
- somente a subobrigação de consistência estática do binding period_eq alvo
  pode ser transportada por um certificado de origem C→M: baseline normal
  admitido, site original obrigatório, delta único, tipo válido, ticket íntegro;
- o certificado não afirma que M prova o período da claim. Ele exige que o
  site mutado seja executado em P e que essa relação rejeite;
- restante de claimRequirements, bindings, seleção, coleção, identidade,
  tipos e todos os demais checkers continuam obrigatórios na autoria M;
- não capturar um erro genérico e continuar, não ignorar todo claimRequirements,
  não emprestar outro predicate de período nem adicionar uma asserção reparadora.

O controle C/S também atravessa o compiler de qualificação e prova equivalência
com o baseline normal. A implementação deve expor o checker de subobrigações
declarativas para este transporte, não acrescentar um catch por mensagem/ID.
O transporte semântico é parte ratificável deste perfil; não chamar isso de
"admissão normal preservada" nem reutilizar seu resultado no ledger de admission.

Conformance externa exige autoria M→IR do locator M, ID/op/tipo/operands e
todos os sites exatos, esperado selado antes do IR. Normalizar para claim.period,
omitir/duplicar site, mudar outro predicate ou usar um mapa autodeclarado
como única prova impede qualificação, mesmo que um teste de P isolado passe.

## 6. Trace e não interferência: núcleo idêntico, fringe explícita

O baseline core_context_binding já lê a projeção original em handles vivos.
Essa validação continua observada em C/M/S; ela verifica integridade do núcleo,
não faz a comparação period_eq com o literal nem repara a prova alvo.

A view só é consultável por P; D não recebe sua extensão. O recorder externo
distingue no evento origem original e origem qualification, inclusive site,
fase e papel causal. A leitura auxiliar do alvo em M não pode ser confundida
com uma leitura financeira de claim.period. Não fabricar trace no guest.

Manifesto esperado selado antes de D/P, derivado independentemente de autoria
e declaração de locator, nunca copiado da observação:
- núcleo das leituras/edges/selections D/P e binding original preservado;
- em M, fringe exata das folhas kind/value do sidecar lidas pelo site alvo;
- em C/S, nenhuma leitura auxiliar pelo predicado alvo;
- nenhum outro predicate, selection ou fase D pode consultar essa fringe.

Hash/forma/conteúdo do sidecar são verificados pela TCB antes do guest; não
ler toda extensão em P apenas para preencher required_reads. Uma declaração
de leitura não é prova: recorder deve atribuir a leitura ao site real P.
Prova que rejeita sem ler os operands esperados não satisfaz o ID.

O trace financeiro histórico não é alterado. O artefato de trace de
qualificação tem identidade própria; a diferença permitida é só a fringe
declarada pela troca de locator. Comparação após projetar o núcleo deve ser
exata, e igualdade agregada de totais não basta. Mudança de conjunto
selecionado, edge, read de D ou outra origem é cofalha trace, sem crédito.
Esta é uma alteração limitada do perfil de trace de witness, não autorização
para descartar trace colateral de paths comuns ou das famílias anteriores.

## 7. Execução, classificação e contabilidade

C e S precisam: D/R iguais ao oracle positivo; P original satisfeito; core
trace íntegro; IR conforme; negative financial boundary íntegra.
M precisa: D/R iguais ao mesmo oracle; alvo P executado com operands selados;
false predicate IDs exatamente {target}; átomos/barreiras rejeitados exatamente
{period} no site alvo; todos os outros gates íntegros e core trace preservado.
Não agregar dois predicates, não aceitar cofalha identity/claim/selection/trace.

Reportar separadamente:
`standard_baseline_admitted`, `qualification_profile_admitted`,
`static_target_binding_transported`, `authorship_ir_conformance`,
`positive_oracle_matched`, `core_trace_matched`, `fringe_trace_matched`,
`proof_satisfied`, `target_assertion_rejected`,
`original_corpus_witness_qualified=false`, `profile_witness_qualified`,
`financial_release_eligible=false`, `receipt_created=false`.
Explicitar se compiler financeiro do mutant foi executado; não inventar seu
resultado com base na extração documental.

C/M/S ficam em quarentena e nenhum pode gerar receipt/validated_parent/resposta
financeira. Mesmo C/S com P=true não é fato liberado. Parents necessários
vêm da cadeia positiva real congelada, nunca de controles/negativos deste perfil.
No modo financeiro normal, ticket/view/profile são rejeitados antes de release;
o guest não pode retirar o perfil para reutilizar o pacote como positivo.

O domínio de identidade do root/artefato de qualificação inclui obrigatoriamente
perfil, sidecar e origem de quarentena. Esse vínculo é verificado pela TCB;
não é um booleano removível pelo guest. Retirar metadata não converte um root
negativo em root positivo. Reexecutar legitimamente o baseline original pelo
fluxo financeiro normal é outra execução/autoridade, não promoção de C/S.

ID original é mantido, mas autoridade da qualificação torna-se
`path-domain-v2 + claim-month-path-completion/v1 ratificado`. Um futuro row
matched precisa incluir essa autoridade e hashes; não retificar o row histórico
UNSATISFIED. Expected não diminui. C/S/probes auxiliares não contam como novos
matched nem compensam outro ID. Cada mutant tem invocação própria, distinta
de controles e de qualquer outro predicate/família. Sem sucesso integral,
manter UNSATISFIED. Exigir cobertura independente do inventário antes de ativar
o perfil; não somar relatórios históricos nem declarar G11 fechado.

## 8. Controles causais obrigatórios na futura implementação

1. Baseline normal real, C e S equivalentes funcionalmente; R congelado antes.
2. M chega a D/P pelo compiler de qualificação completo, não injeção pós-IR.
3. Lowering errado, site ausente/extra ou normalização para original ficam RED.
4. Sidecar inválido/igual ao original, expected derivado de actual, tipo/namespace
   forjado e perfil não ratificado falham antes de crédito.
5. Outro path/campo/claim/oracle modificado, segunda asserção falsa, target errado
   ou false-set/atom genérico impedem matched.
6. Perfil aplicado fora da classe (range/field/selector/operador diferente,
   target consumido por seleção ou D, alternativa original existente) recusa.
7. D recebendo/leitura da extensão e P colateral lendo-a são RED de isolamento.
8. Fringe omitida/extra/trocada, origem rotulada como original, trace sintetizado
   ou ausência de leitura observada no site alvo impedem matched.
9. Ticket com ID/hash/parents/root incorretos e tentativa de receipt/export/
   validated_parent em C/M/S são RED; nenhum negative vira positive.
10. Mutant padrão sem perfil continua recusado pelos contratos normais;
    nenhum relaxamento desse compiler pode passar pelo teste de quarentena.
11. Remover um ID ou reutilizar invocação, controle ou witness para outro
    predicate/família impede completude. Novas autorias mudam expected.
12. Gerar propriedades da classe: todos os meses válidos incluindo limite
    9999-12; alterações adversariais de site, phase, origem e closure de dados.
    Não fazer allowlist de fact_key nem corrigir só os exemplos vistos.

## 9. Artefatos documentais e gate de implementação

`path-singleton-month-profile-witness.json` e verifier correspondente:
extraem fontes imutáveis, registram original/locator/view propostos e demonstram
somente propriedades da construção mensal/delta/projeção. Não executam WIP,
compiler, evaluator, P, host, recorder ou release; não provam que o perfil já
é implementável sem finding. Não tratá-los como runtime PASS.

O veredito solicitado é suficiência normativa **deste perfil completo**,
inclusive transporte restrito da admissão e fringe de trace, não aprovação
de um campo adicional isolado. APTO documental precisa anteceder implementação.
Depois: REDs, implementação coesa de autoridades/compiler/view/recorder/report,
focais M-01, afetados, revisão adversarial, uma ampla estável e auditoria
independente de código antes de qualquer ativação/fechamento.

Sem aptidão, não aplicar nem criar o ticket no WIP. Nenhuma contagem global
nova é afirmada. Histórico semântico 2419/1331/390/387, 2032 pendentes, e ampla
RED 2413 PASS/3 FAIL/10 SKIP continuam históricos. V1/freezes/tabela r2/receipts
anteriores permanecem. Sem GO G11/N02-G/NEXT-02, NEXT-03, deploy ou dados reais.
