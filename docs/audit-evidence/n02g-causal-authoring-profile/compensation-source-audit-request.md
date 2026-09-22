# Revisão focal — classe da fonte de compensação

2026-09-21 (UTC 2026-09-22). Base/pai:
`3fc0f3d83ac5e418a802ca93f097b0c7459fface`.
O candidato é o novo commit imutável que contém este pedido, informado no
prompt externo. Não confundir com a auditoria da reconciliação de runtime.

## Defeito e mudança delimitada

O gerador candidato já verifica presença de compensates, classe compensation,
identidade/relação da fonte e ausência de self/chain. Porém, depois de ler a
categoria efetiva da fonte, não rejeitava income/neutral: apenas excluía a
contribuição ao filtrar por eligible_class. O runtime preexistente rejeita
explicitamente originalCategory.economicKind diferente de expense antes de
filtrar, e o README candidato declara que categoria incoerente aborta.

AUTHOR-GENERATE-011 reproduziu RED no pai: Missing expected exception em
M-02#1#1, fonte income com compensação confirmed. Correção geral de uma linha:
rejeitar effectiveClass diferente de op.eligible_class logo após sua leitura,
antes do filtro. Não há fact_key/alias especial nem import do runtime. Ambos
os perfis existentes fixam eligible_class=expense e permanecem intactos.

O teste percorre seis claims × duas classes de fonte × dois estados da
compensação. Muda a relação/material category_id da fonte, mantém categoria
compensation do reembolso, reconstitui fingerprint e confirma admissão tipada
antes de exigir erro específico. Fixture autoadmitida: não demonstra origem
externa, autenticidade ou replay de autoria. Teste separado do runtime, nos
dois modos, confirma rejeição após traversal da fonte, sem amount_minor lido.

## Fontes exatas no hash candidato

- `scripts/agent/nextCausalAuthoring.cjs`: admissão, classificação, branch de
  compensação e filtro; confrontar a linha adicionada com o pai.
- `tests/next/provenance/causalAuthoring.cases.js`: AUTHOR-GENERATE-011,
  corpusAuthorities, mutateSnapshot, validate/generate e controles próximos.
- `tests/next/provenance/metricSelection.cases.js`: INSTRUMENT-PROFILE-003 e
  compensationFixture. `src/next/provenance/metricSelection.js` é referência
  preexistente de semântica, não fonte do expected do gerador; não foi alterado.
- `docs/contracts/next/provenance-v2/causal-authoring-candidates/README.md`
  e os dois perfis JSON na mesma pasta.
- Nesta pasta: `compensation-source-validation.json`,
  `prepare-compensation-source-evidence.cjs`, `reconciliation-independent-review.md`.
  Candidate-report e source-extract existentes permanecem iguais ao pai.

Dois focais PASS (24 mutações no gerador e oito controles do runtime), bateria
hermética afetada de 108 PASS, ampla 2.365 PASS/0 FAIL/10 SKIP esperados.
Quatro hashes causais iguais antes/depois; runtime/corpus/perfis/relatórios
preservados, checker mecânico próprio. Evidência local, não execução do Chat.
Não repetir ampla verde sem novo delta causal. Helpers anteriores permanecem
vinculados aos seus candidatos e não precisam passar sobre o código posterior.

## Questões e formato de resposta

Confirme hash/pai e fontes efetivamente lidas. A guarda fecha a incoerência de
fonte sem introduzir cálculo R ou eliminar observações obrigatórias? O teste
alcança uma fonte não expense admitida, com uma expectativa de erro independente,
e realmente cobre compensação excluída? O scope permanece limitado ao gerador
e suporte de teste, sem alteração de runtime/normativa? Identifique achados por
severidade e conclua APTO/NÃO APTO exclusivamente para esta correção candidata.

Declare limites de leitura/execução/hashing. Nenhum parecer anterior ratifica
este código novo. Não aprovar aplicação normativa, 76 grafos, host/M/derivados,
N02-G global, deploy ou produção. A proposta normativa local continua suspensa
até a correção ser ratificada; ela não integra as perguntas deste pedido.
