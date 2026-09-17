# N02-G — revisão focal da seleção de source_coverage

Data: 2026-09-16. Estado: PERGUNTA DE COMPATIBILIDADE; SEM VEREDITO.
Fonte imutável: `2ca7d32505728b985f7616dcaa17bec4acd11e18`.
Parent da fonte: `6ee7282eb9c77c00afd79fca0368dabb2058c8fc`.

## Escopo mínimo

Decidir somente a compatibilidade entre os bindings e a seleção derivacional
de `S-16#1#1` (`source_coverage`). Não reauditar os 76 grafos nem os comparadores
WIP como produto pronto. Não alterar contrato, runtime ou fixtures nesta revisão.
O pacote de evidência é inerte e não concede GO global, NEXT-03, deploy,
produção ou acesso a dados reais.

Os comparadores WIP ainda não aceitam grafos nem emitem recibos de parents.
Suas limitações são explícitas: observações não classificadas impedem o match
local; o comparador de seleção, isoladamente, não valida reads/predicados/R.
Não se pede a aprovação desse código neste parecer.

## Evidência verificável sem abrir JSONs gigantes

Ler integralmente estes três arquivos em `docs/audit-evidence/n02g-selection-binding/`:

- `evidence-manifest.json`: oito paths de origem, SHA-256 integral e blob Git;
- `focal-record.json`: claim, entrada de registry, evaluator contract, grafo
  focal (nós/arestas/seleção), contrato derivacional, recorte da prova e fontes
  causais com número inicial de linha;
- `verify-evidence.cjs`: relê os oito blobs no SHA fonte, verifica identidade,
  unicidade global de fact_key e extração exata com `assert.deepEqual`.

O verificador não usa o expected para decidir alcance ou extrair os campos.
O digest prova identidade de bytes, não a suficiência semântica do recorte.
Se faltar uma regra causal, consultar somente o trecho necessário no blob de
origem. Não presumir que a execução relatada substitui a leitura independente.

Comando local: `node docs/audit-evidence/n02g-selection-binding/verify-evidence.cjs`.
Validação do pacote: um positivo e seis negativos passaram. Os negativos
alteram required_selections, alcance derivado, binding da fonte, trecho de
código, SHA-256 e blob Git; todos são recusados pela comparação exata.

## Fatos reproduzidos

1. O registry declara somente context:claim_context e source:node. O claim liga
   source a source_complete_june; não há role com as quatro fontes.
2. O grafo declara candidates com quatro fontes e selected com uma. Em
   derivation, required_selections exige candidates→selected, mas
   required_nodes/read contém somente source_complete_june.
3. A transitividade dirigida das material_ref a partir do role source alcança
   apenas source_complete_june, synthetic_ledger e next_golden_financial_v1.
   Não alcança as outras três candidatas.
4. O compiler atual recusa openSet para source:node e recusa abrir os outros
   três aliases nesse role. O evaluator atual retorna coverage pela fonte
   ligada, após verificar identidade/período; não executa select.
5. A mesma seleção pode ser executada em openProof, onde os quatro candidatos
   são acessíveis. Isso não autoriza reclassificar essas observações como
   derivation nem reutilizar proof_trace como derivation_trace.

`N02G:SELECTION-BINDING-001` reproduz 1–5. Seu PASS NÃO prova defeito do contrato:
o compiler/proxy atuais também podem estar incompletos. Os cinco fatos acima
devem ser confrontados com essa alternativa antes de qualquer conclusão.

## Pergunta adversarial e alternativas

Existe execução que satisfaça o contrato atual, mantendo simultaneamente:

- roles normativos do registry e acesso somente por handles autorizados;
- required_nodes/read exatos por fase;
- seleção observada externamente por I→L/T, nunca copiada do conjunto esperado;
- separação entre resolução estática, execução derivacional e prova?

Examinar primeiro a alternativa de seleção feita pelo host durante a resolução
do binding. Se ela for válida, explicar qual operação real é observada, quais
dados o host/proxy pode consultar nessa fase, como os quatro candidatos são
considerados sem admitir reads/nós extras e qual regra ratificada sustenta
essa interpretação. Não basta renomear resolução estática como execução.

Se for uma lacuna de implementação, indicar a menor correção compatível e seu
teste causal. Se for inconsistência de autoria, identificar a cláusula exata
e a menor decisão normativa necessária; não implementar essa decisão durante
a auditoria. Não propor redesign ou novo subsistema sem demonstrar necessidade.

## Evidência local e limites

No SHA fonte: 20 testes dos comparadores PASS; 52 claims confrontados para
seleção em três testes de integração; reprodução focal acima PASS; bateria
N02-G 262/262 PASS, zero FAIL/SKIP/TODO, 157,03s. Syntax/diff/workflow PASS.
São execuções locais do executor, não execução independente do auditor.
Não houve suíte hermética ampla: o N02-G ainda está em desenvolvimento, não
é candidato de fechamento global. Contratos, graphs, registry e oracle estão
inalterados. A correção traversal/trace anteriormente aprovada não foi reaberta.

## Retorno operacional

Publicar parecer e slot SOMENTE na branch
`chat/chat-codex-orchestration-20260824` de `Danieu-san/financas-bot`.
A branch `codex/financasbot-n02g-provenance-engine-20260911` é somente leitura
para o auditor. Relatar SHA/parent lidos, arquivos, conclusão causal e limites.
Se incompleta, registrar a pendência explícita; não simular aprovação.
Respeitar o estado/task slot vigente e o protocolo de dois commits do canal;
não sobrescrever outra tarefa. O prompt de envio fixa o task_id e paths.
