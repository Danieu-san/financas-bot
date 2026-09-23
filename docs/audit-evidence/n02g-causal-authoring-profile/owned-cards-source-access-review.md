# owned_cards — NÃO APTO probatório e evidência adicional de acesso

Parecer fornecido por Daniel e confirmado na conversa:
https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab439e1-eb04-83e9-a4d1-96b4371f33ac
Candidato 5bd039cd6bc68338ecbd869659070cec044db01c;
pai 76c8a2fe6891ad043ad3e8015ec7ff2471bf473b.

## Veredito preservado

NÃO APTO DOCUMENTAL por impossibilidade de acesso direto ao graphs-v2.json
original, maior que o limite do renderizador. Nenhum defeito causal substantivo
identificado nas outras fontes. A regra/delta de um nó e um read recebeu
corroboração, não aprovação. Projeção do helper não substitui a fonte original.
Auditor não executou testes, helper, evaluator ou conferência local do corpus.
Não aplicar normativa com base nesse parecer.

## Evidência nova, sem aplicação normativa

Criada worktree auxiliar isolada financasbot-n02g-owned-cards-source-view a
partir do próprio candidato. Commit de visualização:
8f94d2bb453933d03c33dc4a33e1a18f19bbc4f1, pai único 5bd039cd6bc68338ecbd869659070cec044db01c.
Branch auxiliar publicada codex/n02g-owned-cards-source-view-20260923.
Não integrar/cherry-pick essa revisão à implementação: serve somente ao acesso.

Único arquivo modificado: docs/contracts/next/provenance-v2/graphs-v2.json.
Uma linha original de 17.342 bytes (linha 17, S-07#1#1) foi reformatada em
1.543 linhas; nenhum valor/chave alterado. Verificação local por deepEqual do
corpus inteiro: PASS, 76 grafos iguais. Substituir o trecho formatado pela
linha original restitui exatamente todos os bytes LF do blob original: PASS.
Demais arquivos inalterados. Sem teste de produto ou suíte ampla repetida.

Blob Git original: 073e6aac37c40af4c2e87d15952ea8a54634f748.
SHA-256 LF original: 921777537f47cd113f3ebb7217f68f9c706a2271f5c90d3efc040ecf7cc40c4c.
SHA-256 LF formatado: 5c73f239d1070c5aafddc55f40b45f78a6d6edde5cad80f83f602c48cea59c91.

Fonte pública primária para o auditor (diff nativo, não extrato gerado por nós):
https://github.com/Danieu-san/financas-bot/commit/8f94d2bb453933d03c33dc4a33e1a18f19bbc4f1
https://github.com/Danieu-san/financas-bot/commit/8f94d2bb453933d03c33dc4a33e1a18f19bbc4f1.patch

No navegador, clicar Load diff expôs a linha removida ORIGINAL do pai e o
objeto formatado. Codex leu diretamente a linha original no DOM do GitHub:
required_nodes derivacional contém apenas card_blue/card_green/card_offline/
person_a; zero reads derivacionais de person_b; e0001/e0002/e0003 já exigidas;
proof contém person_b com id e family_id. Isso confirma localmente o diagnóstico,
mas a nova auditoria precisa examinar a fonte por si mesma.

A consulta web do Codex retornou cache miss nos links novos, enquanto o
navegador público abriu o diff. Não presumir que todas as ferramentas externas
tenham o mesmo acesso; declarar qualquer limite persistente.

Próximo: revisão documental da nova evidência imutável em conversa limpa,
confrontando o objeto original do diff com a proposta e fontes do candidato.
Sem nova leitura independente suficiente, continuar NÃO APTO; não contornar
o requisito probatório nem converter os checks locais em execução externa.
Sem GO global N02-G, aceitação de grafo/host, deploy ou produção.
