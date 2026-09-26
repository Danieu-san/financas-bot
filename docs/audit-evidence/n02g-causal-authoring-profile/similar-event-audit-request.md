# SIMILAR-EVENT — solicitação de auditoria independente

2026-09-26. Preparada, NÃO ENVIADA: ChatGPT exige verificação de login por
e-mail. Nenhum parecer existe para este candidato. Não registrar falha de
autenticação como NO-GO técnico, nem como filtro de segurança do prompt.
Após autenticação pelo usuário, abrir conversa limpa e fazer uma única
tentativa automática por hash. Verificar o modelo disponível no seletor;
não houve acesso ao seletor nesta sessão. Retorno: Codex → Astra → Alto.

## Prompt pronto

Faça uma revisão documental independente da suficiência do perfil causal
SIMILAR-EVENT, sem implementar mudanças. Candidato:
https://github.com/Danieu-san/financas-bot/commit/a7d1422d7d2051a23cc15c5115a2bb4f43ec09c9
Pai: c3db3ecb8ffe4af681ec2547df6abb13896e9c40.

Comece pela proposta e examine as fontes exatas listadas em sua seção final:
https://github.com/Danieu-san/financas-bot/blob/a7d1422d7d2051a23cc15c5115a2bb4f43ec09c9/docs/audit-evidence/n02g-causal-authoring-profile/similar-event-proposal.md
https://raw.githubusercontent.com/Danieu-san/financas-bot/a7d1422d7d2051a23cc15c5115a2bb4f43ec09c9/docs/audit-evidence/n02g-causal-authoring-profile/similar-event-proposal.json
https://raw.githubusercontent.com/Danieu-san/financas-bot/a7d1422d7d2051a23cc15c5115a2bb4f43ec09c9/docs/audit-evidence/n02g-causal-authoring-profile/prepare-similar-event-proposal.cjs

Para acesso direto ao objeto ORIGINAL completo M-16#1#2 no corpus grande,
há este commit auxiliar cujo único pai é o candidato:
https://github.com/Danieu-san/financas-bot/commit/bebbde44526a2b72d13bd285e127d752f6e7d178
Ele apenas formata o objeto no arquivo original; o diff nativo mostra os
campos anteriores à aplicação, não o resultado proposto. Não integrar a branch.
A igualdade integral foi conferida localmente, não a trate como execução sua.

Confirme hash, pai, fontes realmente acessadas e limites. Julgue contrato,
binding, relações e leituras do runtime, sem presumir correto o JSON proposto
ou usar actual/oracle para escolher expected. Não basta aprovar o helper:
julgue explicitamente a suficiência normativa da proposed_derivation. Liste
achados por severidade e conclua APTO DOCUMENTAL PARA IMPLEMENTAR ou NÃO APTO,
somente neste recorte. Não aprove código futuro, grafo/host, N02-G global ou
produção. Declare o que não leu ou não executou. Se faltar acesso suficiente
às fontes imutáveis, não conceda aprovação independente.

## Recibo de acesso e preservação local

- Candidato a7d1422: cinco arquivos, todos documentais/checkpoint/helper.
- Auxiliar bebbde4: apenas graphs-v2.json, somente whitespace no objeto M-16#1#2.
- Blob original graphs-v2.json: 7befc35e12e51c47816d183af8ea261ede17549a.
- SHA-256 LF original: 51a8ce8b97366df352d88a7eb5dc61049ef0e771daa9be9cef1eb030f1cdb08b.
- SHA-256 LF auxiliar: 33d837c0452f9d9b2d297f9798c54d3c332b90c043d25c5c91c6042e6eb96ac4.
- Objeto original começava na linha 66; deepEqual do corpus integral e
  restauração byte a byte fora da formatação passaram antes da publicação.
- Checagem de egress inicialmente reteve a publicação auxiliar. Conferência
  somente leitura do raw público retornou HTTP 200, 4.963.056 bytes e SHA-256
  idêntico ao original. Publicação autorizada depois dessa evidência de que
  nenhum conteúdo novo estava sendo exposto. Sem contorno de restrição.
- Não houve aplicação normativa, alteração de runtime ou nova suíte financeira.
