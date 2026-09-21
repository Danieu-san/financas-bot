# Perfis candidatos de autoria causal — não normativos

2026-09-21. Implementação local do método documental revisado em
`8b9c4fca93186c9f747ba1a868bf1616ba15d92a`. O APTO do método permite construir
estes candidatos, não ratifica suas decisões semânticas ou seu delta. Nenhum
perfil aqui é carregado pelo runtime nem aplicado a graphs-v2.json.

## Escopo e decisões explícitas

Somente consumption_by_instrument e statement_total. Os seis passos do
programa são operações fechadas; não há expressão executável, callback ou
consulta a actual/expected. Ordem diferente, operação/campo/ramo sem suporte
aborta, inclusive quando um campo opcional não está presente nos dados.

1. Validar coverage/evidence_state/time_basis pelos valores declarados.
2. Conferir a identidade do instrumento contra o sujeito do claim.
3. Construir a janela civil: mês do evento, ou ciclo de fechamento
   `(previous_close, current_close]`. Validar due_day, mês anterior exato e
   calendário declarado; sem Date/timezone do ambiente, clamp ou statement_id.
4. Examinar identidade e classificação de toda a população de categorias.
5. Examinar todos os candidatos: identidade, data, estado, presença/referência
   do tipo de instrumento consultado, categoria e compensação quando presente.
   A categoria efetiva da compensação vem de sua fonte. Cadeia de compensações
   e categoria incoerente abortam. Todas essas guardas são observadas antes de
   filtrar financeiramente; esta é uma decisão explícita do perfil candidato.
6. Declarar a leitura de amount_minor apenas para contribuições elegíveis.
   Não somar, emitir R ou impor nova aceitação financeira por magnitude/sinal;
   essas responsabilidades continuam nos gates próprios. Valores materiais
   diferentes, mantendo os discriminantes, não mudam obrigações de leitura.

A política `identity_for_every_resolved_target` exige identidade e versão
também do alvo estrangeiro antes de excluí-lo. Sua justificativa proposta é
que a relação resolvida deve ter identidade nominal validada, não apenas um
texto coincidente. O pertencimento ao instrumento ligado exige o mesmo ID e
a mesma versão; outra versão admitida do mesmo ID permanece alvo observado,
mas não contribuição desse instrumento. Essa escolha é candidata à revisão, não inferência do
runtime. A alternativa reconhecida na fronteira
`identity_version_only_for_matching_id` não possui interpretação implementada:
a geração com ela aborta, sem escolher um default.

Não se propõe consultar person_id/owner_id quando o escopo é o instrumento,
nem a referência ao outro tipo de instrumento. Para datas já civis, o perfil
de fatura consulta calendar, mas não converte timezone. São diferenças que
precisam de revisão explícita do delta, não autorização para apagar leituras
da autoria antiga ou do runtime. As relações econômicas de proof continuam
inteiras e fora da saída do gerador. Seleção ratificada nunca é reescrita.

## Fronteiras e evidência

`scripts/agent/nextCausalAuthoring.cjs` recebe somente strings JSON; projeta
topologia, campos permitidos do claim e bindings. Exclui trace_contract antigo,
proof, sets, selections, predicates, selected_nodes, fact_key e resultados.
O núcleo recebe snapshots materiais e descritores de campos tipados, não
handles de execução. Não importa avaliador, compiler, recorder ou oracle.
Reutiliza apenas canonicalValue/digest, primitiva pura de JSON/hash.

Manifesto separado fixa schemas de claim/snapshot, registries material e de
métricas, contrato, perfil, manifesto de snapshots e todas as suas fontes.
Admissão confere hashes, schemas, roles, tuplas, relações fornecidas e
fingerprints semânticos. Referência exigida ausente/ambígua aborta a geração.
Isso não autentica a raiz ou o host e não reexecuta todos os mapeamentos de
authorship dos snapshots contra fontes. Os testes sintéticos que mudam dados
e recalculam fingerprints continuam candidatos autoadmitidos, não evidência
de origem externa. Alteração de fonte exige revisão de autoria independente.

A saída contém apenas cinco dimensões de obrigações, justificativas e digests.
`graph_accepted=false` e `normative_application_allowed=false` são invariantes.
Não emite resultado financeiro, selected_nodes ou autorização de produção.

`scripts/agent/reportNextCausalAuthoring.cjs` gera primeiro; só depois compara
com a derivation antiga. Lista cada adição com sua regra e cada ausência como
remoção proposta que exige revisão. Confere que o corpus inteiro e os claims
não foram alterados; registra o hash das partes protegidas de cada grafo.
Somente os seis claims dos dois contratos são candidatos; os outros 70
permanecem fora do perfil. Nenhum caminho de aplicação existe.

O CLI usa explicitamente UTF-8/LF para a fixture sintética, como os testes do
corpus. Os hashes são dos bytes LF fornecidos, não medição dos arquivos crus
do host. Saída opcional apenas em arquivo novo diretamente em .codex-temp;
recusa sobrescrita, diretório linkado, caminho externo e opção desconhecida.

```text
node scripts/agent/reportNextCausalAuthoring.cjs
node scripts/agent/reportNextCausalAuthoring.cjs --output .codex-temp/candidate-new.json
node --test tests/next/provenance/causalAuthoring.cases.js
```

## Primeiro delta observado — ainda não autorizado

Seis grafos, sem alteração de qualquer um dos 76 originais:

| Dimensão | Adições propostas | Remoções propostas |
| --- | ---: | ---: |
| Nós consumidos | 8 | 0 |
| Reads de snapshots | 11 | 155 |
| Reads do claim | 12 | 0 |
| Arestas | 0 | 148 |
| Observações estruturais | 192 | 0 |

A magnitude das remoções exige confronto semântico, não aprovação por
contagem ou coincidência com runtime. Exemplo: person_id e referência ao outro
instrumento são omitidos pelo programa; has é declarado para as duas guardas
opcionais por candidato. Não houve comparação com actual neste gerador.
O relatório integral identifica cada obrigação em
`docs/audit-evidence/n02g-causal-authoring-profile/candidate-report.json`, com
extrato completo separado e verificador mecânico. Bateria hermética afetada:
93 PASS; ampla da composição local: 2.359 PASS/0 FAIL/10 SKIP esperados,
candidato inalterado. Esses resultados não autorizam o delta. Auditoria
independente do novo código/perfil permanece pendente.
