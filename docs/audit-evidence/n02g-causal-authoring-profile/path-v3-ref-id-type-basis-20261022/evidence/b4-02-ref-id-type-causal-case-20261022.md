# REF-ID-TYPE-BASIS-01 — argumento causal do executor, PENDING REVIEW

Não é revisão independente, A/W provado, admissão normal, ticket, guest ou crédito.
O critério geral blocked0 continua aberto; ledger23verified/2396blocked/credit1
não foi alterado. A falha de entrega da8e31 é separada e não é a causa deste delta.

## Fundamento já existente reutilizado

1. predicateTypes.js targetKind retorna descriptor.targets[0] imediatamente
   quando há um único destino; não consulta snapshot ou membro nesse ramo.
2. fieldValue constrói scalar id/kind para ref. O eventual known é um valor não
   literal. O refinamento scalar:T só usa known de literais; field_path:T mantém
   a mesma forma field. operatorTypes.identity usa id/kind, não known.
3. pathLocatorDomainV3 já enumera nominal id/kind completo e exige o mesmo nominal
   original/alternativo. O frame normal de uma mutação preserva o resto da autoria,
   operands/peers, windows, sets e regras; os outros passes ainda são compostos.
4. A extensão de projectStructuralLocatorConstraint representa somente esse
   construtor normal para fieldPath material/ref com exatamente um target.
   O contrato fechado explicita forma/tipo/origem do kind e ausência de lookup.
   O código exige igualdade do nominal baseline com o nominal original selado
   e do nominal alternativo com o baseline. Nenhum checker ou operador é alterado.
5. Contrato e frames têm hash, mas o hash não é a prova semântica: o argumento
   é a aplicação dos construtores e consumidores normais descritos acima. Os
   pins de predicateTypes/operatorTypes e demais fontes continuam exatos; a
   baseline positiva, dados plain, bindings reais, revisão e controles continuam
   premissas. Todas seis required_premises e todos discharged ficam false.

Não se estende a ref com múltiplos targets (resolução dependente do snapshot),
selector ref, ref_list, records ou claim-schema. Não altera nove casos de
claim_requirements/selection_bindings. A tabela real tem29construtores desta
classe e12kinds-alvo, e não uma allowlist das três rows observadas.

## Evidência causal local

RED089 no módulo anterior:14:12:14.003Z→14:13:33.983Z/Node22.17.0,
child1/1FAILexato no fundamento ausente/0cancel-skip-todo/fontes6antes-depoisiguais.
Report b4-02-ref-id-type-red-20261022.json SHA54cbe0e8e8395d6d0ebd1193536e546af763bf06878216872f88e324a57b321b.
Wrapper0 significa RED esperado confirmado, não childPASS.

Focal074/089/090:14:15:59.993Z→14:26:59.675Z/child0/3PASS/0FAIL/
0cancel-skip-todo/títulos exatos/fontes6iguais. Report SHA
e158e2fda1ee5aa0ff49a231053fb581d02607c66a98c749661761532257108b.
Um JSON de cobertura1214695bytes/536ee8a47c7f0ae9ed19fc8bb9b2f6a543615d35a48001deec1c1cfbef57bd8b;
cobertura de ferramenta não equivale aprovação independente.

089 percorre TODOS16/30/30membros genuínos das rows204/1695/1830, confirma a
partição CONDICIONAL e primeiros índices0/2/0, e compara os tipos normais de
todos76mutantes ao baseline. Essa comparação é controle de regressão, não um
expected operacional inventado após M ou o fundamento autoral da partição.
090 percorre os29descritores usando inputs SINTÉTICOS do projector, sem promover
tais inputs a L/admissão real; rejeita múltiplos destinos, nominal errado, sequência,
record e selector. Nos planos reais950/2308,16/46referências indisponíveis mantêm
W incompleto e flags/crédito falsos, mesmo que exista selected condicional.
074 preserva a comparação normal dos tipos primitivos, a rejeição de clone de
contrato e o controle adversarial de byte-pin do checker, sem afrouxar guardas.

Bindings de fonte atuais do focal:
- v3.js234892969200b0ef9862971852422e6e23bc796129893359f2b77d0e70de3755
- casefile b4bf1e4a939c917bb3992e6fe0c2a8385f9102206e925b4610cc034516618820

## Limites e próxima evidência

O primeiro validateAgentWorkflow desta rodada recusou metadata por duas
duplicate_path_authority: o registro REF-ID separado repetia v3.js/casefile já
autorizados por PATH-COMPOSITION-01. A correção foi unir a descrição causal à
autoridade existente, não alterar o validador, a lista17, orçamento, baseline ou
fonte de produto. A cadeia parou antes da primeira captura; os cinco caminhos
de job/report/diretório novos foram confrontados ausentes. Esse erro operacional
não é RED de produto nem motivo para repetir os12testes verdes.

Revisão adversarial local: fundamento de alvo único não lê known, não admite
target ambíguo pelo valor presente e não depende do sucesso de M. L já mantém
o nominal; este delta não relaxa a checagem de namespace/coordenada, os peers,
o frame single-site ou a cobertura dos outros11passes. O verificador do domínio
continua exigindo o domínio genuíno e igualdade integral, não flags em clone.
Consumidor pathProofProgramContract continua ligando TODOSsource_bindings antes
de selar o contrato e mantém baseline/discharged false. As fontes normais de
predicateTypes/operatorTypes, o domínio de L, checkers, schemas e operadores
permanecem inalterados. No host-bootstrap herdado não há módulo v3/constructor
de inventário: nenhuma alteração de TCB é inferida só pelo produtor modificado;
as próximas capturas devem confirmar os bytes efetivos, sem sobrescrever os antigos.

Bateria afetada067/068/069/070/075/080/086/087/088 terminou14:56:20.519Z,
desde14:28:03.364Z/child0/9PASS/0FAILcancel-skip-todo/títulos exatos/fontes6iguais.
Report SHA3d22fdb7458a0fb691700fdabf5d85fdf47f2866acdaad45f739c5d1e92e4b85;
JSON de cobertura2099471bytes/565b1db6f18dd478123d43b08955eeddc1665dc55cabf2f021154800eeff440e.
Não é uma suíte ampla ou qualificação.
Workflow corrigido: agent-workflow/active-scope OK antes captura. A pipeline
serial encerrou native0. Captura9 terminou15:12:09.050Z (início15:07:19.833Z),
report11b40b35a8dbeca5f32c3d0b4c8bd9c404450eee29a04b3f2cf261415ea79ebf;
snapshot646 novo22a18c7bd60421928a162cc71219d2b00063e737178e6b4a9906d0f1e2844a6e.
Oito artefatos são byte-exatos aos anteriores; compiler2281d7ef.../TCB34f059df...
permanecem iguais. Capturas antigas não foram sobrescritas.

Três planos/snapshots próprios précompile terminaram15:19:27.480Z/432197ms,
report6a99fd68c02b91bd18857cccc7fe7eee774c8b47c62984e4c2a8c050c01d5ca6.
204:16membros/primeiro0/snapshot492391bytes/e97dc026d54063ed21bfccbc6aecda2d012e3b7aa054051bda7d78b992616476.
1695:30/primeiro2/580393bytes/87cae24f9e21d7c75de4e115a79cca41c708b9205837732d4993d7932e2381a5.
1830:30/primeiro0/580277bytes/28b535c3b86a2dfe7756a7d45aa188adb4a30dd3573f5594fab3290262583954.
Roster foi fixado antes materializar; produtor088 existente reutilizado, sem
selected normal compile, ticket, guest ou crédito. Tempo posterior de observação
não é duração da execução.

Leitor mecânico separado native0 confrontou todos9bytes/SHA/Gitblobs,202inputs/
281fontes atuais e895fontes antes-depois-ATUAIS; conferiu três planos, snapshots,
16/30/30membros, todos bindings literais,12passes condicionais,6premissasfalse,
flagsfalse,ledger e índice intactos. Report8fddaf2e452824724719c48165555b721c7543dbe29732e13099723d3883a9b9.
Fonte895 atual533d1d3a095dd3d71a72178965f9ed75968b009e889be9991808719472c1c652;
únicos deltas perante ampla2788 são v3.js/casefile. Não é revisão semântica
independente: igualdade de bytes/contagens continua sendo só vínculo.

Próximo: UMA ampla final hermética do candidato estável e revisão independente
inteira material. A ampla2788 histórica não é resultado deste código.
Três domínios completos condicionais não são três witnesses qualificados.
BUILD/ticket/pins revisados antes handles e fresh C/M/S próprios continuam necessários.
As duas execuções reais anteriores140/1952 retêm sua identidade antiga e aguardam
parecer integrado suficiente; não se reexecutam nem ganham crédito por este delta.
