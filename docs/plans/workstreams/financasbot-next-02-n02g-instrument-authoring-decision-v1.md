# N02-G — decisão proposta de autoria instrument/statement

2026-09-21 (UTC 2026-09-22). PROPOSTA DOCUMENTAL, não aplicada nem ratificada.
Base/pai esperado do commit documental: `0a8c5709a5234e95ddce212c0b571908dacf32bf`.
O candidato é o hash imutável que contém este documento, informado ao auditor.
Pré-requisito concluído: a guarda de classe da fonte, após RED independente,
testes e ampla, recebeu APTO focal ratificado em 0a8c570. Recibo na pasta
n02g-causal-authoring-profile/compensation-source-independent-review.md.
A antiga suspensão local é levantada apenas para submeter esta proposta,
não para aplicar o delta. O commit documental não altera código/normativa.
Objetivo único: decidir a regra de autoria das cinco dimensões derivacionais
de consumption_by_instrument e statement_total e seu delta fechado em seis
grafos. Não solicitar GO do runtime, já revisto focalmente, nem do N02-G.

## Por que esta decisão é distinta

O gerador candidato foi revisto; sua correção ID + versão foi ratificada em
1e83baac; guarda de classe da fonte em 0a8c570. A reconciliação de runtime foi
ratificada em 3fc0f3d. Esses pareceres
demonstram consistência e independência, mas explicitamente não ratificaram
as remoções da autoria antiga. O verde de um trace contra um perfil candidato
não decide quais dependências devem ser normativas. Esta proposta submete
essa decisão agora, antes de alterar graphs-v2.json.

## Regra geral proposta, sem exceção por instância

Aplicar somente aos dois contratos/versionamentos pinados nos perfis. Cada
obrigação deve ser determinada por claim, roles, snapshots admitidos, relações
materiais e programa fechado antes da execução, nunca por actual/trace/R.

1. Ler coverage/evidence_state/time_basis e exigir seus valores admitidos.
   Coverage completa não pode ser presumida porque há um roster de eventos.
2. Ler identidade do instrumento ligado: kind, ID material e versão; confrontar
   o sujeito do claim. Resolver e consumir identidade dos alvos do campo
   account_id OU card_id correspondente ao kind consultado, inclusive alvos
   estrangeiros. Só ID + versão iguais pertencem ao instrumento consultado.
3. Consumption usa mês civil; statement usa closing_day/due_day e identidade/
   calendar da policy, com janela (previous_close,current_close]. Não ler
   timezone para dados já civis; não criar conversão, clamp ou statement_id.
4. Consumir identidade/classificação de toda a população de categorias e
   identidade/data/estado/categoria de todos os eventos candidatos. Para cada
   evento, observar has do campo do instrumento relevante e de compensates,
   mesmo quando depois excluído. Presença de compensates exige classe
   compensation e fonte resolvida; ausência é incompatível com essa classe.
   Fonte não pode ser o próprio evento nem ter compensates; sua categoria
   efetiva deve ser expense. Guardas são distintas da leitura de amount_minor.
5. Ler amount_minor somente nas contribuições elegíveis; declarar a obrigação,
   sem somar R ou acrescentar regra de aceitação por sinal/magnitude.
6. Não ler person_id/owner_id nem percorrer suas relações para decidir escopo
   por instrumento; tampouco ler a referência ao OUTRO tipo de instrumento.
   Esses campos/relações continuam materiais e disponíveis na proof, mas não
   são dependências dessa fórmula derivacional. Isso não remove requisitos de
   admissão/privacidade nem altera métricas por pessoa/família.
7. Não ler opening_balance_minor/opening_balance_as_of para consumo por
   instrumento. O contrato soma eventos confirmed no mês, não calcula saldo
   da conta. Identidade da conta continua obrigatória; seu saldo de abertura
   é uma dependência de métricas de saldo, não desta soma de consumo.

O fundamento a examinar são os dois contratos de evaluator, o binding contract
§4 (operação efetiva e fase causal) e a topologia material/claims publicados.
Os perfis formalizam a interpretação proposta, não provam sozinhos que ela
deve ser norma. Revisar especialmente as remoções e a política de observar
identidade de alvo estrangeiro antes de excluí-lo.

Fontes exatas adicionais (todas no hash que acompanha a proposta):
`docs/contracts/next/provenance-v2/evaluator-contracts/consumption_by_instrument.json`,
`docs/contracts/next/provenance-v2/evaluator-contracts/statement_total.json`,
`docs/contracts/next/provenance-v2/graph-binding-contract-v1.md`,
`docs/contracts/next/provenance-v2/causal-authoring-candidates/README.md` e os
dois perfis JSON na mesma pasta; `scripts/agent/nextCausalAuthoring.cjs` e
`scripts/agent/reportNextCausalAuthoring.cjs`. O runtime metricSelection.js é
apenas confronto, nunca fundamento único ou fornecedor de expected.

## Delta fechado e âncora independente

Fonte: `docs/audit-evidence/n02g-causal-authoring-profile/candidate-report.json`
no hash base; bytes UTF-8/LF SHA256:
`0140b589491ea40a1f315b744f338b84d987656707e62cb798b420d991eec012`.
Extrato completo dos seis grafos/claims: `source-extract.json` na mesma pasta,
SHA256 LF `ab07fc9265c7412943fb814be96b71b3e6eb237f6b6e12f4ccf7b5c6e119363f`.
Esses artefatos precedem a reconciliação do runtime e não serão sobrescritos.

| Instância (somente inventário do delta) | Nós + | Reads + / - | Claim reads + | Edges - | Estruturas + |
| --- | ---: | ---: | ---: | ---: | ---: |
| S-05#1#1 | 1 | 2 / 26 | 2 | 25 | 32 |
| M-02#1#1 | 2 | 2 / 26 | 2 | 24 | 32 |
| M-02#1#2 | 1 | 1 / 25 | 2 | 25 | 32 |
| M-05#1#1 | 1 | 2 / 26 | 2 | 25 | 32 |
| F-03#1#1 | 2 | 2 / 26 | 2 | 24 | 32 |
| F-03#2#1 | 1 | 2 / 26 | 2 | 25 | 32 |
| Total | 8 | 11 / 155 | 12 | 148 | 192 |

Sem remoção de nós/claim reads/estruturas nem adição de edges neste delta.
Conferência local por classe, sem consultar runtime/trace: reads removidos
somam 96 person_id, 4 owner_id, 32 account_id em consultas de cartão,
16 card_id em consultas de conta, 3 timezone e 2 pares de opening_balance_minor/
opening_balance_as_of (155). Edges removidos são os mesmos campos de relação,
sem timezone/saldo (148). Os 11 reads adicionados são id; oito novos nós são
quatro contas/quatro cartões. Os seis novos pares de claim reads são coverage
e evidence_state. As 192 estruturas são 96 has(compensates), 64 has(card_id)
e 32 has(account_id). A contagem não é fundamento de aprovação; cada classe
deve ser justificada pela regra acima e conferida nos registros integrais.
Os nomes das instâncias delimitam o inventário revisado; não entram como
condicional para gerar obrigação. O programa continua selecionado por contrato
e perfil/versionamento, e as relações são materiais, não aliases especiais.

Após eventual APTO documental, alterar SOMENTE required_nodes, required_reads,
required_claim_reads, required_edges e required_structural de
graphs-v2.json → graphs[*].trace_contract.derivation dessas seis instâncias,
com os valores exatos do relatório imutável. Preservar todo o restante: proof,
sets, predicados, required_selections, selected_nodes, operadores, nodes/edges
materiais, fontes, medições, claims e todos os 70 outros grafos. Remover uma
obrigação de required_edges NÃO apaga uma relação do inventário graph.edges.

## Condições vinculantes da implementação futura

- Antes de editar normativa, exigir parecer APTO explícito para ESTA regra e
  delta; APTO do runtime ou do método não basta. Não usar actual como seleção
  ou filtro de obrigações e não chamar evaluator para gerar expected.
- Conferir corpus/claims/perfis/fontes contra a base e relatório congelado;
  recomputar candidato independentemente e exigir igualdade. Divergência
  interrompe a aplicação, não autoriza atualizar o relatório para acompanhá-la.
- Provar exatamente seis diferenças nos cinco campos e igualdade estrutural
  de todas as partes protegidas/70 outros grafos. Claims e fontes sem mudança.
  O gerador permanece candidato, sem função de aplicar normativa ou flag de GO.
- Adicionar teste RED do corpus antigo contra a regra independente; após a
  aplicação, conferir as obrigações normativas diretamente. Manter a prova
  histórica do delta em fixture/commit imutável, sem recalculá-la do actual.
- Atualizar somente controles de autoria/evidência afetados pela nova base.
  Helpers históricos continuam vinculados aos hashes antigos: não reescrever
  suas evidências nem alegar que precisam passar sobre normativa posterior.
- Fazer testes focais/causais, uma ampla final pela mudança normativa e novo
  commit/auditoria de implementação. Nenhuma nova ampla nesta proposta apenas
  documental. Se houver necessidade de mudar contrato, perfil, gerador,
  runtime, roster/seleção ou medição confiada, parar e delimitar outro delta.

## Pedido de decisão independente

Confirme hash/pai e fontes realmente lidas. Revise a regra geral e todas as
classes de adição/remoção do relatório/extrato, contra os dois contratos e
binding contract, não por mera coincidência com o runtime. Informe se falta
alguma dependência causal ou se alguma guarda introduz norma sem fundamento.
Conclua APTO/NÃO APTO DOCUMENTAL para implementar o delta fechado sob as
condições acima. Não exigir uma implementação já aplicada para decidir se
ela pode ser feita; execução e nova auditoria continuam gates posteriores.

Declarar limites, especialmente se não ler blobs integrais ou não verificar
igualdade do extrato. Não emitir GO dos seis grafos, 76 grafos, proof/host/M,
três derivados, N02-G global, release, deploy ou produção. Nenhuma mudança de
graph_accepted/releaseEligible decorre desta decisão.
