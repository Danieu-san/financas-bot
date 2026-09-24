# Transfer scope — recibo documental independente

Candidato: dd2518a6b7c34f3387c49d50e22b716af0751c77.
Pai: 94138a06d293e0fb7d68f4d3387d9ca85e8c51d7.
Revisão auxiliar: f068aa13a343f584790890744fbd7a27072a5715, pai igual ao candidato.
Conversa limpa, GPT-5.6 Sol / Alta, uma solicitação enviada:
https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab48b3a-0544-83e9-a5ed-29f5a38c69f3

## Veredito recebido e alcance

APTO DOCUMENTAL estritamente focal; nenhum achado crítico, alto, médio ou baixo.
O auditor confirmou hash/pai e leu plano, proposta, helper, metricEffects,
contrato consumption_effect, binding contract, registry de evaluators, claims,
manifest e definições event no schema/material registry. Conferiu os três
objetos no patch auxiliar, inclusive sequências das linhas originais removidas
18/37/85 e sua representação formatada; não se limitou ao extrato da proposta.

Conclusão: has_then_get corresponde à seleção real de cada evento, antes dos
filtros finais de estado/período. Como os dois snapshots de cada grafo possuem
transfer_pair, o delta é +2 reads/+2 has por grafo. Aliases/fact_keys localizam
dados, não decidem a semântica. Actual/oracle/selected não formam obrigações.
Runtime não percorre transfer_pair: não inventar travessia ou importar closure
de proof. Relações e predicados econômicos continuam obrigatórios em proof.

## Limites e confronto local

O auditor não carregou o corpus raw inteiro (>4 MiB), mas acessou os objetos
focais diretamente no patch imutável do filho. Nenhuma outra fonte solicitada
ficou inacessível. Não executou helper, testes, evaluator, recorder, host,
schema, hashes ou comparação integral. Propriedades geradas são planejadas,
não provas executadas. O parecer não aprova aplicação, código futuro ou gate.

Confronto local: helper --check PASS após publicação; as 12 fontes permanecem
iguais aos blobs da base. Comparação integral da visualização auxiliar provou
igualdade profunda de 76 grafos e bytes LF fora dos três objetos. A branch
auxiliar é somente evidência de acesso e NÃO será integrada. Syntax, diff-check
e workflow PASS. Nenhuma suíte ampla foi repetida nesta etapa documental.

Ratificação: proposta documental apta para iniciar a implementação/testes sob
a autorização de continuidade vigente, não para declarar a implementação pronta.
Exigir RED/GREEN, propriedades, integrações, negativos de trace, kernel,
comparação integral, afetados e uma ampla final antes do commit de código e
sua revisão independente. N02-G permanece sem GO global/grafo/host/produção.
