# Release Checklist — Oracle/OCI por artefato

Use este checklist antes de qualquer deploy funcional. A produção vigente é
Oracle/OCI, em `/home/ubuntu/financas-bot`, processo PM2 `financas-bot`.

O diretório de produção não possui contrato de checkout Git. Nunca execute
`git pull`, `git reset`, `git revert` ou `git checkout` nele.

## 1. Autorizações e invariantes

- [ ] O deploy e o restart foram autorizados explicitamente para o commit.
- [ ] A AWS permanece sem PM2/Chrome/Puppeteer e não será iniciada.
- [ ] Existe exatamente um processo PM2 `financas-bot` na Oracle.
- [ ] O commit sanitizado recebeu a auditoria obrigatória aplicável.
- [ ] O hash completo a publicar foi registrado.
- [ ] O rollback será para o script OCI atualmente ativo, nunca para a AWS.

Não prossiga se houver dúvida sobre servidor, chave, diretório, processo,
sessão WhatsApp ou hash.

## 2. Gates locais

- [ ] `git status --short` não contém mudanças inesperadas.
- [ ] O HEAD local é o commit imutável aprovado.
- [ ] `npm test` passou.
- [ ] `npm audit --audit-level=high` não encontrou vulnerabilidade bloqueante.
- [ ] `node scripts/agent/validateAgentWorkflow.js` passou.
- [ ] `APP_COMMIT_SHA` será promovido para o hash completo do artefato.
- [ ] `.env.example` e o contrato de ambiente foram revisados.
- [ ] `ADMIN_IDS` contém somente Daniel.
- [ ] `DASHBOARD_ADMIN_ALL_USERS_ENABLED` permanece ausente ou `false`, salvo
      exceção temporária, explícita e auditada.
- [ ] Flags novas permanecem no estado aprovado; ausência nunca vira ativação.
- [ ] `STATE_STORE_ENCRYPTION_KEY` e `state_store.json` satisfazem o contrato
      criptografado do runtime que será promovido.

Quando a release tocar OAuth, dashboard, cron, planner, ledger, Open Finance ou
multiusuário, executar também seus gates e ADRs específicos.

## 3. Construção imutável

Na raiz local:

```powershell
npm run release:oci:build -- <HASH_COMPLETO> release-artifacts
```

O builder usa somente o commit informado, mesmo se houver arquivos locais
ignorados ou não rastreados. Ele produz:

1. `financas-bot-<HASH>.tar.gz`;
2. `financas-bot-<HASH>.tar.gz.sha256`;
3. `oci-artifact-release-<HASH>.js`;
4. `oci-artifact-release-<HASH>.js.sha256`.

O pacote falha se contiver `.env`, credenciais, sessão WhatsApp, `data`,
`private`, stores, logs, backups ou `node_modules`.

Verificação local independente do pacote:

```powershell
npm run release:oci:verify -- release-artifacts\financas-bot-<HASH>.tar.gz release-artifacts\financas-bot-<HASH>.tar.gz.sha256
```

- [ ] O checksum externo foi aceito.
- [ ] O manifesto interno confirmou o mesmo hash completo.
- [ ] Todos os arquivos declarados passaram por tamanho e SHA-256.
- [ ] Nenhum arquivo extra, symlink ou caminho inseguro foi aceito.

## 4. Transferência para OCI

Somente após autorização remota, enviar os quatro arquivos para um diretório
temporário fora do slot ativo. Não enviar `.env`, chaves, credenciais, sessão,
stores ou backup junto do artefato.

No servidor, antes de executar o instalador:

```bash
cd /home/ubuntu/financas-bot/incoming
sha256sum -c oci-artifact-release-<HASH>.js.sha256
node oci-artifact-release-<HASH>.js verify \
  --artifact financas-bot-<HASH>.tar.gz \
  --checksum financas-bot-<HASH>.tar.gz.sha256
```

Qualquer divergência encerra o deploy antes de tocar no runtime.

## 5. Preparação isolada

```bash
node oci-artifact-release-<HASH>.js prepare \
  --artifact financas-bot-<HASH>.tar.gz \
  --checksum financas-bot-<HASH>.tar.gz.sha256 \
  --target /home/ubuntu/financas-bot
```

A preparação:

- instala em `/home/ubuntu/financas-bot/releases/<HASH>`;
- mantém o `cwd` futuro em `/home/ubuntu/financas-bot`;
- não para nem reinicia PM2;
- não lê a sessão WhatsApp;
- não altera `.env`, `credentials.json`, `.wwebjs_auth`, `.wwebjs_cache`,
  `data`, `private`, `state_store.json` ou o `node_modules` ativo;
- usa `PUPPETEER_SKIP_DOWNLOAD=true` no `npm ci`;
- valida `index.js`, `better-sqlite3` e um Chrome headless isolado antes da
  promoção.

- [ ] O slot preparado corresponde ao hash.
- [ ] O PM2 continuou online e com o script anterior.
- [ ] Checksums do estado crítico antes/depois são idênticos.
- [ ] O script anterior ainda existe e é legível.

## 6. Plano e promoção

Primeiro gere e confira o plano sem alterar o processo:

```bash
node oci-artifact-release-<HASH>.js plan \
  --target /home/ubuntu/financas-bot \
  --commit <HASH> \
  --previous-script <SCRIPT_ATUAL_CONFIRMADO>
```

O plano deve apontar:

- provider `oracle_oci`;
- `cwd=/home/ubuntu/financas-bot`;
- próximo script `releases/<HASH>/index.js`;
- script OCI anterior como rollback;
- processo único `financas-bot`.

Somente após a segunda conferência e autorização de restart:

```bash
node oci-artifact-release-<HASH>.js promote \
  --target /home/ubuntu/financas-bot \
  --commit <HASH> \
  --process financas-bot \
  --health-url http://127.0.0.1:8787/dashboard/health \
  --confirm-process-restart
```

Se, e somente se, o promotor diagnosticar
`oci_release_state_store_bootstrap_confirmation_required` e o snapshot legado
for comprovadamente o objeto vazio `{}`, repetir acrescentando:

```bash
  --confirm-empty-state-bootstrap
```

Essa confirmação não aceita estado legado não vazio. O promotor para o PM2
antes da migração, gera a chave sem imprimi-la, cria backups privados, troca
`.env` e snapshot atomicamente e restaura ambos antes de iniciar o rollback se
o candidato falhar.

O promotor lê `pm2 jlist`, exige exatamente um processo online no `cwd` OCI,
captura script/hash anteriores, remove o processo antes de iniciar o novo e
executa `pm2 save` somente após health verde. Se a promoção ou o health
falharem, restaura automaticamente o script capturado e exige health verde do
rollback.

## 7. Validação pós-deploy

Executar `docs/runbooks/production-health.md`.

- [ ] `pm2 status` mostra um único `financas-bot` online.
- [ ] O script PM2 aponta para `releases/<HASH>/index.js`.
- [ ] `APP_COMMIT_SHA=<HASH>` está no processo.
- [ ] Health local e público estão verdes.
- [ ] WhatsApp está `ready/healthy`, sem novo processo concorrente.
- [ ] Google, read-model, SQLite, cron e dashboard estão verdes.
- [ ] Smoke WhatsApp: `Oi`, `dashboard`, `admin stats` e consulta mensal.
- [ ] Nenhuma resposta duplicada.
- [ ] Nenhuma flag não autorizada foi ativada.

## 8. Rollback

O rollback automático cobre falha de start ou health durante a promoção.
Falha posterior exige usar o mesmo promotor com o hash do slot anterior já
preparado, após registrar o incidente e confirmar novamente o script atual.

Nunca:

- ligar a AWS para um rollback comum;
- copiar a sessão WhatsApp entre processos ativos;
- apagar o slot anterior antes do fim da observação;
- modificar estado para fazer o novo código iniciar;
- usar Git no diretório de produção.

## 9. Hold

Interrompa e mantenha/restaure o release anterior se:

- checksum, manifesto, preflight ou inventário PM2 falhar;
- o processo anterior não estiver dentro da raiz OCI;
- health, WhatsApp, Google, read-model ou SQLite degradar;
- houver reinícios crescentes, duplicidade ou erro de isolamento;
- admin amplo, segredo ausente ou flag não autorizada aparecer.
