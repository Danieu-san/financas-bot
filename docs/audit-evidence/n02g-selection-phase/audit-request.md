# Revisão focal N02G-SB-001 e suporte de validação

Estado: candidato aguardando auditoria independente. Sem GO global N02-G.
Base/pai esperado: `be520f4f0cf64812c80f0f4b9b8eefb2a5445189`.
O hash candidato será o commit imutável que contém este pacote; não usar HEAD
de branch como autoridade. Confirmar o hash lido e os arquivos examinados.

## Perguntas ao auditor

1. A regra por operand_bindings em `graphStructure.js` implementa o §4 de
   `graph-binding-contract-v1.md` sem obter obrigações do trace observado?
   Verificar candidato node_set único, prebound não vazio, ambiguidade,
   ausência de binding, cobertura de excluídos e separação proof/derivation.
2. O delta mantém todas as 76 provas, os 70 grafos não afetados e os demais
   campos dos seis grafos ajustados? Usar `focal-records.json` e
   `verify-evidence.cjs`; não é necessário imprimir o documento integral.
3. A mudança de NODE_OPTIONS no suporte dos testes preserva o bloqueio de
   rede em filhos/netos e a recusa de overrides adicionais pelo timezone?
   Examinar a geração compartilhada, consumo exato após instalação/captura,
   preload por CLI e testes de spawn/execFile/fork e variantes síncronas.
4. A inspeção de desenvolvimento mantém os 15 pins históricos e a fronteira
   de imports, identifica os 29 módulos pendentes e permanece explicitamente
   inelegível para release? A API estrita e o comando de gate permanecem
   estritos. O verde dos testes não deve ser interpretado como admissão N02-G.
5. Os quatro relógios fixados pertencem somente ao contexto dos testes, com
   restauração automática e controles de expiração preservados?

## Leitura dirigida

`candidate-manifest.json` contém caminhos exatos e hashes SHA-256/blobs Git
dos arquivos deste delta. Todos são relativos à raiz do mesmo commit.
`review-delta.patch` é um recorte textual dos deltas de código, testes e
contratos em relação ao pai acima, sem o JSON volumoso dos grafos e sem o
checkpoint cronológico. É auxiliar: conferir contra os arquivos imutáveis.

Começar por:

- `docs/contracts/next/provenance-v2/graph-binding-contract-v1.md`, §4;
- `src/next/provenance/graphStructure.js`;
- `tests/next/provenance/graphStructure.cases.js`, STRUCTURE-007/008;
- `tests/next/provenance/authoringIndex.cases.js`, selectionInput,
  OBSERVED-METRIC-002 e SELECTION-BINDING-001;
- `tests/next/provenance/proofAcceptance.cases.js`, TRACE-SELECTION-008;
- `docs/audit-evidence/n02g-selection-phase/focal-records.json`;
- `docs/audit-evidence/n02g-selection-phase/verify-evidence.cjs`;
- `scripts/runExhaustiveLocalTestCoverage.js`;
- `tests/helpers/exhaustiveNetworkTripwire.js`;
- `tests/helpers/exhaustiveNodeOptions.js`;
- `tests/helpers/exhaustiveTimezoneChild.cjs`;
- `tests/exhaustiveLocalTestCoverageRunner.test.js`;
- `scripts/agent/financasBotNext02ValidationPolicy.js`;
- `tests/next02DevelopmentInventory.test.js`.

As demais alterações de testes estão no patch/manifesto: seis consumidores
do inventário e quatro casos temporais em três arquivos. Ler as funções
afetadas nos arquivos imutáveis se o recorte não bastar. Não reauditar toda
a arquitetura ou declarar completo o motor de proveniência.

Referências preservadas, disponíveis no mesmo commit:

- `src/next/provenance/executionProfile.js` e `pinnedCivilTimezone.js`;
- `scripts/agent/financasBotNext01ValidationPolicy.js`, pins e scanner;
- `scripts/agent/validateFinancasBotNext02.mjs`, chamada da API estrita;
- `src/next/provenance/proofAcceptance.js`, comparador de seleção;
- `docs/contracts/next/provenance-v2/claims-v2.json`, bindings inalterados.

## Evidência e seus limites

`local-validation.json` registra execução local hermética, não veredito
independente. Última ampla: 2.265 testes, 2.255 PASS, zero FAIL e 10 SKIP
esperados; exit=0, valid=true, Node 22.17.0. Não houve alteração posterior de
código/testes que exija repetir essa ampla; somente consolidação de evidência
e documentação. O verificador pode ser executado com:

`node docs/audit-evidence/n02g-selection-phase/verify-evidence.cjs <SHA_CANDIDATO>`

O checkout deve conter o candidato e o pai. A verificação por SHA lê bytes
imutáveis do Git; a opção worktree normaliza CRLF para LF e é distinta.

Pedir veredito focal GO/NO-GO, achados por severidade com caminho/linha,
limitações de acesso e confirmação de quais arquivos foram realmente lidos.
Um GO focal não aprova os 29 módulos pendentes, o gate executável integral,
NEXT-03, deploy, produção, dados reais ou integrações externas.
