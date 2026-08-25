# ORCH-02 — recovery da fronteira de caminhos sensíveis

Data: 2026-08-25

## Achado independente

O parecer do commit `8337b4700f596d016a74bd365a86ae6c6e916c06`
foi `NO-GO`: a fronteira recusava `.env`, mas ainda aceitava variantes como
`.env.local` e recipientes nominalmente sensíveis como
`config/secrets.json`.

## Correção delimitada

`assertSafeRepoPath` passou a recusar, tanto em `required_files` quanto em
`allowed_paths`:

- qualquer segmento `.env` ou iniciado por `.env.`;
- basenames `secret`, `secrets`, `credential` ou `credentials`, inclusive com
  sufixos separados por ponto, hífen ou sublinhado;
- `client_secret` e `service-account` com variantes de sufixo;
- chaves SSH privadas usuais (`id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`);
- extensões privadas `.pem`, `.key`, `.p12`, `.pfx`, `.jks` e `.keystore`.

A regra continua aplicada antes de carregar o manifesto no modelo. Nenhum
outro comportamento do watcher, publicador ou instalador foi alterado.

## Evidência local pós-achado

- bateria causal afetada: `30/30` verde;
- syntax check de `chatCodexTaskContract.js`: verde;
- `git diff --check`: verde;
- casos negativos novos cobrem leitura e escrita para `.env.local`,
  `config/secrets.json`, `client_secret`, `service-account`, `.pem` e
  `id_ed25519`.

Não foi repetida a suíte ampla `62/62`, pois não houve mudança fora da
fronteira causal e ela já estava verde no candidato anterior.

## Limite

O contrato evita que uma tarefa declare recipientes convencionais de segredos.
Ele não transforma o executor em classificador de conteúdo arbitrário: o canal
continua restrito ao repositório público e sanitizado, conforme o contrato do
projeto.

## Critério de GO

O recovery pode receber GO técnico local se a revisão independente confirmar
que as variantes apontadas no NO-GO agora falham antes do modelo e que a
correção não abriu a fronteira de leitura, escrita ou publicação.
