# ORCH-02 — recovery do schema da configuração da ponte

Data: 2026-08-25

## Achado independente

O parecer do commit `1acc4d2e755764237762a9ef86c72f5813d67955`
foi `NO-GO`: o worker exigia
`financasbot-codex-app-wake-bridge-config-v2`, mas o instalador ainda gravava
literalmente `config-v1`.

## Correção delimitada

- o instalador passou a gravar `config-v2`;
- o teste do instalador extrai o schema literal que ele produzirá e o compara
  com `CONFIG_SCHEMA` exportado pelo worker real;
- nenhuma fronteira, permissão, payload ou comportamento do canal foi alterado.

## Evidência local pós-achado

- suíte focal ponte/IPC: verde;
- parser PowerShell: verde;
- o novo controle falharia exatamente com o literal `config-v1` anterior.

A suíte ampla `62/62` do candidato pai não foi repetida, pois o recovery altera
somente o literal apontado e seu controle causal direto.

## Critério de GO

GO técnico local se a revisão confirmar a compatibilidade estática entre o
schema produzido pelo instalador e o aceito pelo worker e a causalidade do novo
teste cruzado.
