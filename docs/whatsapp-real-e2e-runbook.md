# WhatsApp Real E2E Runbook

Este guia explica como rodar testes reais do FinancasBot pelo WhatsApp Web local, usando o numero pessoal/admin como remetente temporario. Depois, quando houver um chip QA dedicado, basta trocar as variaveis de ambiente.

## Quando Usar
- Antes de deploy importante.
- Depois de mudancas em `whatsapp-web.js`, onboarding, comandos, dashboard ou planilha.
- Quando o teste funcional mockado passa, mas queremos provar o caminho real do WhatsApp.

## O Que Este Teste Faz
O comando E2E:
1. Abre WhatsApp Web local com perfil persistente.
2. Usa o remetente configurado para falar com o numero do bot.
3. Envia `TERMOS`.
4. Envia `ACEITO` e completa onboarding se necessario.
5. Registra um gasto `E2E`.
6. Pergunta quanto foi gasto no mes.
7. Pede `dashboard` e valida que veio link com token.

## Variaveis Obrigatorias
Configure no `.env` local:

```env
WHATSAPP_E2E_ENABLED=true
WHATSAPP_E2E_BOT_PHONE=55XXXXXXXXXXX
WHATSAPP_E2E_TEST_USER_PHONE=55YYYYYYYYYYY
WHATSAPP_E2E_SENDER_KIND=personal-temporary
WHATSAPP_E2E_PROFILE_DIR=.e2e/whatsapp-sender-profile
WHATSAPP_E2E_TIMEOUT_MS=60000
WHATSAPP_E2E_HEADLESS=false
```

Opcional, apenas quando voce aceitar limpar a planilha antes do teste:

```env
WHATSAPP_E2E_RESET_SPREADSHEET=true
```

## Primeira Execucao
Abra o WhatsApp Web local:

```bash
npm run test:whatsapp:e2e:setup
```

Se aparecer QR Code, escaneie com o numero remetente temporario. Neste momento, e o seu numero pessoal/admin, porque ele e diferente do numero do bot.

Depois de logar, pressione Enter no terminal para fechar o navegador. A sessao fica salva em `.e2e/whatsapp-sender-profile`.

## Check Sem Enviar Mensagem
Antes do E2E completo, confirme que o chat do bot abre:

```bash
npm run test:whatsapp:e2e:check
```

Esse comando abre o chat do bot, mas nao envia mensagem.

## Rodar E2E Real
Com o bot online no EC2 e WhatsApp Web local logado:

```bash
npm run test:whatsapp:e2e
```

## Validar No Servidor
No EC2:

```bash
pm2 status
pm2 logs financas-bot --lines 120 --nostream
curl http://localhost:8787/dashboard/health
```

## Falhas Comuns
- `WHATSAPP_E2E_ENABLED=true` ausente: o teste para antes de abrir navegador.
- QR Code aparece no E2E: rode `npm run test:whatsapp:e2e:setup`.
- Chat errado abriu: confira `WHATSAPP_E2E_BOT_PHONE`.
- Timeout esperando resposta: veja se o bot esta online no PM2 e se o WhatsApp do bot esta autenticado.
- Dados antigos interferem: rode com `WHATSAPP_E2E_RESET_SPREADSHEET=true` somente se puder limpar a planilha.

## Migrar Para Numero QA Dedicado
Quando comprar um chip QA:

```env
WHATSAPP_E2E_TEST_USER_PHONE=55NUMEROQA
WHATSAPP_E2E_SENDER_KIND=qa-dedicated
```

Depois rode novamente:

```bash
npm run test:whatsapp:e2e:setup
npm run test:whatsapp:e2e
```

## Nunca Fazer
- Nao usar o mesmo numero do bot como remetente.
- Nao versionar `.e2e/`, cookies, perfil do navegador ou QR.
- Nao rodar este E2E em loop continuo.
- Nao usar `WHATSAPP_E2E_RESET_SPREADSHEET=true` se houver dados reais que precisam ser preservados.
