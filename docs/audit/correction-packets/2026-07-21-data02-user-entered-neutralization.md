# DATA-02 — neutralização de texto em `USER_ENTERED`

Data: 2026-07-21

## Resultado

`GO local integral` no candidato
`d8a58c5cb0a3601555029d4582c46fa8bdd65cca`.

Strings cujo primeiro conteúdo, inclusive após whitespace ou controles C0,
começa por `=`, `+`, `-` ou `@` agora recebem uma aspa simples somente no
payload final enviado ao Google Sheets. Números e texto comum permanecem
inalterados.

A proteção cobre os cinco escritores genéricos/não-template que usam
`USER_ENTERED`: append, update, batch update, dashboard visual e
`DashboardData`. O escritor de `src/services/userSpreadsheetService.js`
permanece intencionalmente fora porque grava fórmulas internas do template.

## Contratos preservados

- arrays e objetos do chamador não são mutados;
- idempotência, ledger, fingerprints, reconciliação e projeções continuam
  usando os valores originais do domínio;
- somente o resource enviado à API recebe a cópia neutralizada;
- uma segunda passagem não duplica a neutralização, pois a string já começa
  por aspa simples;
- ranges, retries e modo de escrita não foram alterados.

## Evidência local

- RED causal nos dois caminhos cobertos;
- GREEN focado: `2/2`;
- bateria diretamente afetada em seis arquivos: `296/296`;
- `node --check` dos dois arquivos alterados e `git diff --check`: verdes;
- runner hermético válido: `1164` testes, `1159` pass, cinco skips funcionais
  esperados, zero falhas, rede externa bloqueada e restauração concluída;
- após o runner, somente os dois arquivos intencionais estavam modificados;
  arquivos antigos não rastreados permaneceram intocados.

## Revisão independente

O acesso do Chat ao commit recém-publicado falhou e nenhum veredito foi aceito
nessa tentativa. O patch exato gerado por `git format-patch -1` foi então
anexado à mesma conversa. A revisão estática confirmou pelo artefato o commit
exportado e os dois arquivos, não encontrou `BLOCKER`, `HIGH`, `MEDIUM` ou
`LOW` material e deu `GO` para fechamento local integral de DATA-02.

O auditor registrou corretamente que o formato anexado não codifica o hash do
pai. A relação
`e832f2680cff9a6a5641619796bbc744cb71e799..d8a58c5cb0a3601555029d4582c46fa8bdd65cca`
permanece evidência Git confirmada pelo Codex, não confirmação independente do
Chat. O Chat não executou testes.

## Limites

Deploy, produção, EC2, Google real e WhatsApp real ficaram fora do escopo.
Fórmulas internas do template não foram alteradas. O fechamento de DATA-02
não autoriza escrita Open Finance nem `salvar <referência>`.

Próxima correção causal: tratar replay/uso único e compensação da saga Google
em `WGL-03/WGL-04`.
