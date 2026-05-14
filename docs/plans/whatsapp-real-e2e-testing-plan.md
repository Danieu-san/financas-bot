# Implementation Plan: WhatsApp Real E2E Testing

## Overview
Vamos criar um teste E2E real que roda localmente, controla o WhatsApp Web do remetente temporario (numero pessoal/admin do mantenedor), envia mensagens reais para o numero do bot no EC2 e valida respostas reais. O teste sera opt-in, fora do `npm test` padrao, e posteriormente podera trocar o remetente para um numero QA dedicado sem mudar a arquitetura.

## Architecture Decisions
- Usar um navegador controlado localmente como remetente, nao o Puppeteer interno do bot. Isso evita conflito com a sessao do `whatsapp-web.js` em producao.
- Persistir a sessao do WhatsApp Web em `.e2e/whatsapp-sender-profile`, ignorado pelo git. Isso reduz necessidade de QR a cada execucao.
- Manter o teste real fora do `npm test` padrao. O WhatsApp Web e dependente de rede, sessao e UI externa, entao deve ser manual/opt-in.
- Usar o numero pessoal/admin apenas temporariamente. O plano ja isola configuracao para migrar depois para `qa-dedicated`.
- Falhar cedo quando o bot, dashboard ou WhatsApp Web nao estiverem prontos. Melhor uma falha clara do que um teste que fica esperando sem diagnostico.

## Dependency Graph
```text
Config/env + gitignore
    |
    v
Playwright dependency + setup command
    |
    v
WhatsApp Web driver
    |
    v
E2E assertions/helpers
    |
    v
Smoke flow real: termos -> aceite/onboarding -> gasto -> pergunta -> dashboard
    |
    v
Docs + runbook + migration to QA number
```

## Task List

### Phase 1: Safety and Configuration

## Task 1: Update spec and ignore local E2E artifacts
**Status:** Done
**Description:** Finalizar a decisao de usar o numero pessoal/admin como remetente temporario e garantir que perfil/cookies locais do WhatsApp Web nao entrem no git.

**Acceptance criteria:**
- [x] Spec cita `WHATSAPP_E2E_SENDER_KIND=personal-temporary`.
- [x] `.gitignore` ignora `.e2e/`.
- [x] Nenhum cookie, perfil ou token e versionado.

**Verification:**
- [x] `git status --short` mostra apenas docs/config intencionais.
- [x] `git diff -- .gitignore docs/specs/whatsapp-real-e2e-testing.md` nao contem segredo.

**Dependencies:** None

**Files likely touched:**
- `docs/specs/whatsapp-real-e2e-testing.md`
- `.gitignore`

**Estimated scope:** Small

## Task 2: Add explicit E2E environment contract
**Status:** Done
**Description:** Documentar as variaveis necessarias e criar uma validacao local que bloqueia execucao acidental sem `WHATSAPP_E2E_ENABLED=true`.

**Acceptance criteria:**
- [x] Existe helper que valida `WHATSAPP_E2E_ENABLED`, `WHATSAPP_E2E_BOT_PHONE`, `WHATSAPP_E2E_TEST_USER_PHONE` e `WHATSAPP_E2E_PROFILE_DIR`.
- [x] Erros de configuracao sao legiveis e dizem exatamente qual env falta.
- [x] O runner nao inicia o navegador se env obrigatoria estiver ausente.

**Verification:**
- [x] `node --test tests/whatsapp-real-e2e-config.test.js`
- [x] Execucao sem env falha antes de abrir WhatsApp Web.

**Dependencies:** Task 1

**Files likely touched:**
- `src/testing/whatsappE2EConfig.js`
- `tests/whatsapp-real-e2e-config.test.js`

**Estimated scope:** Small

### Checkpoint: Safety
- [x] Spec e plano revisados.
- [x] `.e2e/` ignorado.
- [x] Config falha com seguranca sem env opt-in.

### Phase 2: Browser Setup

## Task 3: Add Playwright and setup command
**Status:** Done

**Description:** Adicionar Playwright como devDependency e criar comando de setup/login que abre WhatsApp Web em modo visivel com perfil persistente.

**Acceptance criteria:**
- [x] `npm run test:whatsapp:e2e:setup` abre WhatsApp Web em navegador visivel.
- [x] O perfil e salvo em `.e2e/whatsapp-sender-profile`.
- [x] O script orienta o usuario a escanear QR se necessario.

**Verification:**
- [x] `node --check scripts/setupWhatsappRealE2E.js`
- [ ] `npm run test:whatsapp:e2e:setup` manualmente, quando o usuario quiser abrir o navegador.
- [ ] Fechar e reabrir o setup mantem a sessao quando WhatsApp permitir.

**Dependencies:** Task 2

**Files likely touched:**
- `package.json`
- `package-lock.json`
- `scripts/setupWhatsappRealE2E.js`

**Estimated scope:** Medium

## Task 4: Build WhatsApp Web driver foundation
**Status:** Done

**Description:** Criar uma camada pequena para abrir WhatsApp Web, detectar login, abrir chat do bot e fechar o navegador corretamente.

**Acceptance criteria:**
- [x] Driver expõe `launch`, `assertLoggedIn`, `openChat` e `close`.
- [x] Se nao estiver logado, erro sugere `npm run test:whatsapp:e2e:setup`.
- [x] Seletores ficam concentrados no driver.

**Verification:**
- [x] `node --check src/testing/whatsappWebDriver.js`
- [x] `npm test`
- [ ] Smoke manual: abrir chat do bot sem enviar mensagem usando `npm run test:whatsapp:e2e:check`.

**Dependencies:** Task 3

**Files likely touched:**
- `src/testing/whatsappWebDriver.js`
- `scripts/checkWhatsappRealE2E.js`

**Estimated scope:** Medium

### Checkpoint: Browser Control
- [x] Comandos e driver para abrir WhatsApp Web localmente estao implementados.
- [x] Sessao persistente esta configurada para `.e2e/whatsapp-sender-profile`.
- [ ] Validacao manual pendente: abrir chat do bot sem acionar fluxos de mensagem.

### Phase 3: Real Message Smoke

## Task 5: Implement send/wait primitives
**Status:** Done

**Description:** Adicionar primitives para enviar uma mensagem, esperar resposta nova e registrar logs com tempo de espera.

**Acceptance criteria:**
- [x] `sendMessage(text)` envia texto no chat aberto.
- [x] `waitForIncomingMessage({ contains, timeoutMs })` espera uma resposta recebida, nao apenas mensagem antiga.
- [x] Timeout inclui mensagem enviada e expectativa.

**Verification:**
- [x] `node --check src/testing/whatsappWebDriver.js`
- [x] `node --check src/testing/e2eAssertions.js`
- [ ] Smoke manual com mensagem inocua, por exemplo `Oi`.
- [ ] Timeout proposital em WhatsApp real gera erro legivel.

**Dependencies:** Task 4

**Files likely touched:**
- `src/testing/whatsappWebDriver.js`
- `src/testing/e2eAssertions.js`

**Estimated scope:** Medium

## Task 6: Create minimal real WhatsApp E2E test
**Status:** Done

**Description:** Criar primeiro teste real curto: abrir chat, enviar `TERMOS`, validar resposta, enviar `dashboard`, validar link.

**Acceptance criteria:**
- [x] `npm run test:whatsapp:e2e` so roda com `WHATSAPP_E2E_ENABLED=true`.
- [x] Teste valida pelo menos uma resposta textual real.
- [x] Teste valida que `dashboard` retorna `/dashboard?token=`.

**Verification:**
- [x] Execucao sem opt-in falha antes de abrir navegador.
- [ ] `npm run test:whatsapp:e2e` com WhatsApp Web logado.
- [ ] `pm2 logs financas-bot --lines 120 --nostream` mostra mensagens recebidas.

**Dependencies:** Task 5

**Files likely touched:**
- `tests/whatsapp-real-e2e.test.js`
- `scripts/runWhatsappRealE2E.js`
- `package.json`

**Estimated scope:** Medium

### Checkpoint: First Real E2E
- [ ] O teste envia mensagem real ao bot.
- [ ] O bot responde no WhatsApp real.
- [x] O teste falha com diagnostico acionavel quando algo externo esta fora.

### Phase 4: Full Bot Flow

## Task 7: Add onboarding-aware flow
**Status:** Done

**Description:** Tornar o teste capaz de lidar com usuario novo ou usuario ja ativo, sem quebrar se a planilha estiver zerada ou se o usuario ja tiver cadastro.

**Acceptance criteria:**
- [x] Se receber pedido de aceite/onboarding, o teste completa o fluxo.
- [x] Se usuario ja estiver ativo, o teste segue sem onboarding.
- [x] O teste nao depende de estado anterior invisivel.

**Verification:**
- [x] `node --check tests/whatsapp-real-e2e.test.js`
- [ ] Rodar apos `npm run reset:spreadsheet`.
- [ ] Rodar novamente sem reset e confirmar que pula ou se adapta.

**Dependencies:** Task 6

**Files likely touched:**
- `tests/whatsapp-real-e2e.test.js`
- `src/testing/e2eAssertions.js`

**Estimated scope:** Medium

## Task 8: Add transaction and analytics validation
**Status:** Done

**Description:** Expandir o fluxo para registrar gasto E2E, confirmar pagamento se necessario e consultar total mensal.

**Acceptance criteria:**
- [x] Teste envia gasto com descricao prefixada `E2E`.
- [x] Teste conclui prompts intermediarios do bot se houver confirmacao/metodo de pagamento.
- [x] Teste valida resposta de `quanto gastei esse mes?`.

**Verification:**
- [ ] `npm run test:whatsapp:e2e` com WhatsApp Web logado.
- [ ] Planilha contem linha esperada com descricao `E2E`, quando reset/limpeza nao estiver ativo.

**Dependencies:** Task 7

**Files likely touched:**
- `tests/whatsapp-real-e2e.test.js`
- `src/testing/e2eAssertions.js`

**Estimated scope:** Medium

## Task 9: Add cleanup/reset strategy
**Status:** Done

**Description:** Implementar estrategia segura para dados E2E: reset completo apenas quando autorizado por env, ou limpeza por prefixo `E2E` quando houver dados reais.

**Acceptance criteria:**
- [x] `WHATSAPP_E2E_RESET_SPREADSHEET=true` chama reset antes do teste.
- [x] Sem reset, dados E2E usam prefixo claro.
- [x] Documentacao explica quando usar cada modo.

**Verification:**
- [x] Execucao sem opt-in nao abre navegador.
- [ ] Rodar com reset em ambiente zerado.
- [ ] Rodar sem reset e confirmar que dados ficam identificaveis.

**Dependencies:** Task 8

**Files likely touched:**
- `scripts/runWhatsappRealE2E.js`
- `tests/whatsapp-real-e2e.test.js`
- `docs/specs/whatsapp-real-e2e-testing.md`

**Estimated scope:** Medium

### Checkpoint: Full Flow
- [ ] Fluxo real cobre termos/onboarding, gasto, pergunta e dashboard.
- [ ] Dados de teste sao isolados ou resetados sob env explicita.
- [ ] Reexecucao nao exige mexer manualmente na planilha.

### Phase 5: Documentation and Migration

## Task 10: Write runbook for local E2E
**Status:** Done

**Description:** Criar guia curto para preparar QR, configurar env, rodar teste e interpretar falhas.

**Acceptance criteria:**
- [x] Guia tem passo a passo de primeira execucao.
- [x] Guia tem checklist de falhas comuns: bot offline, QR expirado, chat errado, timeout.
- [x] Guia explica diferenca entre numero pessoal temporario e futuro numero QA.

**Verification:**
- [x] Guia criado em `docs/whatsapp-real-e2e-runbook.md`.

**Dependencies:** Task 9

**Files likely touched:**
- `docs/whatsapp-real-e2e-runbook.md`
- `tests/manual_checklist.md`

**Estimated scope:** Small

## Task 11: Add QA-number migration switch
**Status:** Done

**Description:** Garantir que migrar do numero pessoal/admin para numero QA dedicado seja apenas troca de env e nao refatoracao.

**Acceptance criteria:**
- [x] `WHATSAPP_E2E_SENDER_KIND=qa-dedicated` e aceito.
- [x] Logs indicam qual modo esta em uso.
- [x] Runbook descreve migracao para chip QA.

**Verification:**
- [x] Config test cobre `personal-temporary` e `qa-dedicated`.

**Dependencies:** Task 10

**Files likely touched:**
- `src/testing/whatsappE2EConfig.js`
- `tests/whatsapp-real-e2e-config.test.js`
- `docs/whatsapp-real-e2e-runbook.md`

**Estimated scope:** Small

### Checkpoint: Ready to Use
- [ ] Todos os testes unitarios passam.
- [ ] E2E real passa pelo menos uma vez localmente.
- [ ] Runbook documenta setup, execucao e troubleshooting.
- [ ] Nenhum artefato local sensivel aparece em `git status`.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---:|---|
| WhatsApp Web muda seletores | Alto | Centralizar seletores no driver e manter fallback por textos/roles quando possivel. |
| Sessao do remetente expira | Medio | Setup headed claro para reautenticar. |
| Teste envia para chat errado | Alto | Validar nome/numero do chat antes de enviar mensagem. |
| Dados reais misturados com dados E2E | Alto | Prefixo `E2E` e reset apenas com env explicita. |
| Numero pessoal/admin recebe fluxos diferentes | Medio | Teste onboarding-aware e futuro modo `qa-dedicated`. |
| Playwright adiciona peso ao projeto | Baixo | DevDependency apenas, E2E opt-in. |
| Automacao excessiva aciona bloqueios do WhatsApp | Alto | Teste curto, manual/opt-in, sem loop continuo ou envio em massa. |

## Open Questions
- O bot target do E2E sera identificado por telefone (`WHATSAPP_E2E_BOT_PHONE`) ou por nome do chat (`WHATSAPP_E2E_BOT_CHAT_NAME`) na primeira versao?
- Podemos adicionar Playwright como devDependency agora?
- Para o primeiro E2E real, voce prefere reset completo da planilha ou dados prefixados com `E2E`?
- O teste deve verificar logs do EC2 via SSH ou apenas validar pelo WhatsApp/dashboard?
