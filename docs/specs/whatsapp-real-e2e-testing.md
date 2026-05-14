# Spec: WhatsApp Real E2E Testing

## Assumptions
1. O teste real deve ser executado a partir deste workspace local, não de dentro do EC2.
2. O bot continua rodando no EC2 com o numero oficial dele.
3. Neste momento, os testes podem usar o numero pessoal/admin do mantenedor como remetente temporario, porque ele e diferente do numero do bot.
4. O Codex pode controlar um navegador local via Playwright ou ferramenta equivalente.
5. O teste real nao deve rodar no `npm test` padrao, porque depende de sessao WhatsApp Web, rede, QR e estado externo.
6. O primeiro login do WhatsApp Web de teste pode exigir acao manual para escanear QR.

## Objective
Construir um runner E2E que permita testar o FinancasBot pelo WhatsApp real, validando o caminho completo: WhatsApp Web remetente, bot no EC2, `whatsapp-web.js`, Google Sheets, SQLite read-model, dashboard e respostas enviadas ao usuario.

O usuario principal e o mantenedor do bot, que precisa verificar regressao de fluxo real sem depender apenas de mocks.

Sucesso significa conseguir rodar um comando local que envia mensagens reais para o bot, aguarda respostas reais e falha de forma legivel se o WhatsApp, a sessao, o bot, a planilha ou a logica de resposta quebrarem.

## Tech Stack
- Node.js `>=18`
- Test runner: `node --test`
- Browser automation: Playwright, a adicionar como `devDependency` apos aprovacao
- Target UI: WhatsApp Web
- Bot target: instancia PM2 no EC2
- Persistence local do teste: perfil de navegador em `.e2e/whatsapp-sender-profile`
- Dados reais: Google Sheets e SQLite read-model ja usados pelo bot
- Remetente inicial: numero pessoal/admin do mantenedor
- Remetente futuro recomendado: numero QA dedicado

## Commands
Comandos existentes:

```bash
npm test
npm run test:functional
npm run reset:spreadsheet
```

Comandos propostos:

```bash
npm run test:whatsapp:e2e
npm run test:whatsapp:e2e:headed
npm run test:whatsapp:e2e:setup
```

Comandos auxiliares esperados no EC2 durante validacao:

```bash
pm2 status
pm2 logs financas-bot --lines 120 --nostream
curl http://localhost:8787/dashboard/health
```

## Project Structure
Estrutura proposta:

```text
tests/
  whatsapp-real-e2e.test.js       -> teste E2E real via WhatsApp Web

scripts/
  runWhatsappRealE2E.js           -> wrapper que seta env e executa o teste
  setupWhatsappRealE2E.js         -> abre navegador headed para login inicial

src/testing/
  whatsappWebDriver.js            -> abstracao para abrir chat, enviar texto e ler respostas
  e2eAssertions.js                -> helpers de espera, timeout e validacao textual

docs/specs/
  whatsapp-real-e2e-testing.md    -> esta especificacao

.e2e/
  whatsapp-sender-profile/        -> perfil local do navegador, ignorado pelo git
```

## Configuration
Variaveis propostas:

```env
WHATSAPP_E2E_ENABLED=true
WHATSAPP_E2E_BOT_PHONE=5521XXXXXXXX
WHATSAPP_E2E_TEST_USER_PHONE=5521YYYYYYYY
WHATSAPP_E2E_SENDER_KIND=personal-temporary
WHATSAPP_E2E_BOT_CHAT_NAME=Meu numero
WHATSAPP_E2E_TIMEOUT_MS=60000
WHATSAPP_E2E_HEADLESS=false
WHATSAPP_E2E_PROFILE_DIR=.e2e/whatsapp-sender-profile
WHATSAPP_E2E_RESET_SPREADSHEET=false
```

Regras:
- `WHATSAPP_E2E_ENABLED` deve ser obrigatorio para evitar execucao acidental.
- `WHATSAPP_E2E_RESET_SPREADSHEET=true` so deve ser usado quando o mantenedor aceitar apagar dados.
- `WHATSAPP_E2E_BOT_PHONE` deve apontar para o numero do bot, nao para o numero remetente.
- `WHATSAPP_E2E_TEST_USER_PHONE` deve apontar para o remetente temporario atual.
- `WHATSAPP_E2E_SENDER_KIND=personal-temporary` explicita que esta configuracao e provisoria ate existir um numero QA dedicado.

## Code Style
O driver de WhatsApp Web deve esconder seletores frageis atras de funcoes pequenas e mensagens de erro claras.

```js
async function sendAndWaitForReply(driver, text, expected, options = {}) {
    await driver.sendMessage(text);
    const reply = await driver.waitForIncomingMessage({
        contains: expected,
        timeoutMs: options.timeoutMs || 60000
    });

    if (!reply) {
        throw new Error(`WhatsApp E2E: resposta esperada nao recebida: ${expected}`);
    }

    return reply;
}
```

Convencoes:
- Funcoes do driver usam nomes orientados ao dominio: `openChat`, `sendMessage`, `waitForIncomingMessage`.
- Timeouts devem ser configuraveis.
- Logs devem indicar qual mensagem foi enviada, qual resposta era esperada e quanto tempo levou.
- Seletores do WhatsApp Web devem ficar concentrados em um unico arquivo.

## Testing Strategy
Camadas de teste:
- Unitarios: continuam no `npm test`.
- Funcional mockado com Sheets real: continua no `npm run test:functional`.
- E2E WhatsApp real: novo `npm run test:whatsapp:e2e`, opt-in, fora da rotina automatica padrao.

Fluxo minimo do E2E real:
1. Verificar que o dashboard do EC2 responde ou que uma URL publica configurada esta saudavel.
2. Abrir WhatsApp Web com perfil persistente.
3. Confirmar que o remetente esta logado; se nao estiver, falhar com instrucao de rodar setup/login.
4. Abrir chat com o bot.
5. Enviar `TERMOS` e esperar resumo de termos.
6. Enviar `ACEITO` e validar criacao/ativacao ou continuidade do onboarding.
7. Completar onboarding quando aplicavel.
8. Enviar `gastei 10 no teste e2e no pix`.
9. Esperar confirmacao e concluir fluxo de pagamento se o bot perguntar.
10. Enviar `quanto gastei esse mes?`.
11. Validar resposta com total coerente.
12. Enviar `dashboard` e validar que a resposta contem `/dashboard?token=`.

Testes negativos desejaveis:
- Bot offline: falha com mensagem clara.
- WhatsApp Web nao logado: falha sugerindo `npm run test:whatsapp:e2e:setup`.
- Resposta atrasada: falha com timeout contextual.
- Chat errado: falha antes de enviar mensagens destrutivas.

## Boundaries
Always:
- Rodar o E2E real somente quando `WHATSAPP_E2E_ENABLED=true`.
- Usar o numero pessoal/admin apenas como remetente temporario enquanto a planilha estiver zerada ou os dados E2E forem claramente isolados.
- Isolar perfil de navegador em pasta ignorada pelo git.
- Registrar logs suficientes para reproduzir falhas.
- Manter o E2E real fora do `npm test` padrao.

Ask first:
- Adicionar Playwright ou qualquer dependencia nova.
- Rodar teste que apaga planilha real.
- Usar numero pessoal do mantenedor como remetente automatizado.
- Alterar configuracoes de PM2/EC2.
- Expor porta, token ou URL publica nova.

Never:
- Versionar perfil de WhatsApp Web, cookies, tokens ou QR.
- Automatizar envio em massa.
- Usar o mesmo numero do bot como remetente.
- Acoplar testes ao Puppeteer interno do `whatsapp-web.js`.
- Rodar E2E real em loop continuo contra WhatsApp Web.

## Success Criteria
- Existe um comando local opt-in para rodar E2E real via WhatsApp Web.
- A primeira execucao guiada permite autenticar o WhatsApp Web remetente.
- O teste envia pelo menos uma mensagem real ao bot e valida resposta real.
- O teste cobre onboarding, registro de gasto, pergunta analitica e dashboard link.
- Falhas comuns produzem mensagens acionaveis, nao stack traces obscuros.
- O perfil/cookies locais do WhatsApp Web ficam fora do git.
- O teste nao interfere no Puppeteer interno do bot em producao.

## Open Questions
1. Quando trocar o remetente temporario pelo numero QA dedicado?
2. O teste pode limpar a planilha automaticamente quando `WHATSAPP_E2E_RESET_SPREADSHEET=true`, ou deve apenas criar dados com prefixo `E2E` e depois apagar?
3. O teste deve abrir navegador visivel por padrao no inicio, ou rodar headless depois do setup?
4. O alvo do bot sera sempre o EC2 atual ou devemos permitir ambiente local/servidor alternativo?
5. As mensagens E2E devem usar o usuario Daniel/admin inicialmente e depois migrar para usuario QA separado?
