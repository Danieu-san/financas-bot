# Revisão focal — gerador candidato e primeiro delta de autoria

2026-09-21. Base/pai de preparação:
`8b9c4fca93186c9f747ba1a868bf1616ba15d92a`. O hash candidato será o commit
imutável que contém este arquivo, informado no pedido externo.

## Decisão solicitada e limites

Revisar a implementação offline, os dois perfis e o delta concreto proposto
para seis grafos de consumption_by_instrument/statement_total. Decidir se
estão APTOS para orientar a reconciliação limitada de runtime/autoria desses
dois contratos, ou apontar bloqueios. Mesmo um APTO não autoriza aplicar o
delta automaticamente, dispensar os testes causais após mudar runtime ou
declarar GO dos outros incrementos, N02-G, deploy ou produção.

O parecer anterior (independent-review.md) aprovou apenas o método com sete
condições. Agora há código e candidato concreto, não nova revisão do resumo.
O commit inclui também a composição local acumulada para tornar os testes e
fontes reproduzíveis. Esses demais incrementos continuam pendentes de sua
própria revisão; a suíte verde não os converte em GO. Não pedir nem conceder
auditoria exaustiva de todo o commit nesta revisão focal.

## Fontes fechadas para a revisão focal

1. `scripts/agent/nextCausalAuthoring.cjs` — projeção, pinagem, admissão, perfil
   tipado e interpretação candidata; não importa evaluator/recorder/oracle.
2. `scripts/agent/reportNextCausalAuthoring.cjs` — comparar autoria antiga só
   após geração; nunca aplicar mudanças.
3. `docs/contracts/next/provenance-v2/causal-authoring-candidates/README.md`
   e os dois `*-profile-v1.json` na mesma pasta — decisões semânticas explícitas.
4. `tests/next/provenance/causalAuthoring.cases.js` e somente
   `N02G:AUTHOR-INTEGRATION-001` em `tests/next/provenance/authoringIndex.cases.js`.
5. Nesta pasta: `candidate-report.json` (obrigações, justificativas e delta),
   `source-extract.json` (seis grafos/claims completos), `local-validation.json`
   e `prepare-evidence.cjs` (reprodução local da igualdade e dos hashes).
6. Autoridades do mesmo hash em `docs/contracts/next/provenance-v2/`:
   `graph-binding-contract-v1.md` §4; contratos
   `evaluator-contracts/consumption_by_instrument.json` e `statement_total.json`;
   entradas correspondentes de `metric-evaluator-registry-v1.json`;
   `claim-contract.schema.json`, `evidence-snapshot.schema.json`,
   `material-field-registry-v1.json`, `snapshot-manifest-v1.json` e fontes
   deste manifesto. `src/next/kernel/canonicalValue.js` é a primitiva de digest.

O extrato é conferido localmente contra os documentos, não precisa ser aceito
como atestação externa. Se não abrir os blobs completos graphs-v2/claims-v2,
declare esse limite; não diga que conferiu a igualdade só por ler o recibo.
O kernel não recebe o extrato completo: recebe projeção sem expected/proof.

## Perguntas causais obrigatórias

- Há vazamento de derivation/proof/selected_nodes/actual/oracle para gerar
  expected? Alterar o expected antigo muda apenas o comparador posterior?
- Autoridades, versão/contrato e política de alvo estrangeiro estão ligadas
  antes da interpretação? O escopo sem autenticação de host está honesto?
- As guardas de presença, consumo de categorias, alvo estrangeiro e origem
  da compensação têm justificativa sem remendo por alias/fact_key?
- O candidato remove 148 arestas e 155 reads, propõe 8 nós, 11 reads,
  12 claim reads e 192 estruturas. Confronte cada classe, especialmente
  person_id/owner_id, referência ao outro instrumento e timezone civil.
  Não valide remoção só porque o programa não emitiu a obrigação.
- Há incompatibilidade semântica com o contrato financeiro ou fechamento
  `(previous_close,current_close]`? Datas inexistentes abortam sem clamp?
- O gerador deixa R, proof, seleção e os outros 70 grafos fora de sua saída?
  A integração fixa o candidato antes do evaluator sem regenerá-lo do trace?

Não se pede que o perfil atual coincida com o runtime local: ainda é uma
proposta de reconciliação. O runtime não fornece as obrigações do perfil e
nenhum dos seis grafos recebeu o delta proposto. As sete alterações anteriores
de derivation (refund/família/contagem) são identificadas separadamente no
extrato e têm pareceres documentais prévios, não GO de código.

## Resposta esperada

Confirme hash e pai; liste fontes efetivamente examinadas; apresente achados
por severidade e APTO/NÃO APTO para o recorte acima. Separe revisão estática,
execuções locais relatadas e verificações que você próprio realizou. Sem GO
global, sem pressupor igualdade do extrato, sem substituir lacunas por
contagens de testes.
