# ORCH02-CHAT-RETURN-POC

## Escopo

Provar somente o retorno automático `Codex -> Chat`. O caminho
`Chat -> GitHub -> watcher -> Codex App` ficou congelado como funcional.

## Resultado

`GO FUNCIONAL DO POC; ENDPOINT DEFINITIVO PENDENTE`.

Em 2026-08-25, a ação `open_chat_wake_poc_v7` foi executada uma vez. O widget
aguardou 15 segundos, enviou `ORCH_PLUGIN_WAKE_POC` sem clique e o Chat produziu
uma nova resposta, registrando o wake às 12:32:55 no fuso de Brasília.

## Controles

- ferramenta sem argumentos;
- mensagem de PoC fixa;
- idempotência local por chave do widget;
- nomes `v7` de ferramenta e recurso para invalidar snapshot antigo;
- nenhum acesso a produção, WhatsApp, Pluggy, planilha, segredo ou dado privado;
- nenhuma alteração do watcher ou do caminho Chat -> Codex.

## Pendência

O Cloudflare Quick Tunnel usado no PoC é temporário. Tailscale HTTPS foi
habilitado, mas o cliente Windows não conseguiu sincronizar com o control plane
e nenhum Funnel foi criado. Promover somente após configurar um Secure MCP
Tunnel estável, validar reinício e repetir um único smoke do retorno.
