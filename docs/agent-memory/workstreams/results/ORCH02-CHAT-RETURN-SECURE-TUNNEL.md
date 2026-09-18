# ORCH02-CHAT-RETURN-SECURE-TUNNEL

## Escopo

Substituir somente o endpoint temporário do retorno `Codex -> Chat`, mantendo
congelado o caminho já provado `Chat -> GitHub -> watcher -> Codex App`.

## Candidato

- Secure MCP Tunnel oficial conectado ao servidor local em `127.0.0.1:3210`;
- app `FinancasBot Chat Wake Definitivo` conectado no Chat;
- uma única ferramenta: `open_financasbot_chat_wake`;
- recurso novo: `ui://financasbot/chat-wake-definitive-v1.html`;
- SDK do componente embutido no HTML, sem Cloudflare Quick Tunnel;
- estado remoto continua sendo a única autoridade para `ORCH_WAKE`;
- idempotência por `task_id + SHA-256` preservada.

## Evidência local

- syntax check dos módulos: verde;
- testes focais do widget: `3/3` verdes;
- smoke MCP: somente a ferramenta e o recurso definitivos anunciados;
- runtime do Secure MCP Tunnel reiniciado e `ready`;
- nenhum acesso a produção, WhatsApp, Pluggy, planilha ou segredo durante o
  candidato.

## Limite

O processo corrente está ativo, mas a instalação do watchdog no logon do
Windows ainda exige autorização específica. Até essa instalação e seu teste,
o canal não possui evidência de recuperação após reboot.
