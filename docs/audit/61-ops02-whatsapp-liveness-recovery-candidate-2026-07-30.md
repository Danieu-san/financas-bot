# OPS-02 — candidato de liveness e recuperação do WhatsApp

Data: 2026-07-30

## Estado

`CANDIDATO LOCAL VERDE; AUDITORIA INDEPENDENTE PENDENTE`.

Este documento não autoriza deploy, restart, QR, produção nem fechamento do
gate. O hash imutável deve ser preenchido pelo próprio commit que inclui este
manifesto e confirmado pelo auditor no GitHub.

## Incidente caracterizado

Na Oracle, PM2, Caddy, Google, read-model, SQLite e o health anterior
permaneceram verdes enquanto o WhatsApp repetia
`Runtime.callFunctionOn timed out` e deixava de receber mensagens. Não houve
evento `disconnected` nem recuperação automática. Um restart controlado e novo
QR restauraram o transporte e uma mensagem real confirmou o retorno.

## Fronteira implementada

1. `src/services/whatsappLivenessService.js` mantém estado sanitizado, executa
   `getState()` somente depois de `ready`, impede probes sobrepostos, aplica
   timeout próprio e exige falhas consecutivas antes da recuperação.
2. Uma falha degrada o health; sucesso antes do limiar restaura `ready`. O
   limiar solicita uma única recuperação, e `src/services/whatsapp.js` possui
   segunda guarda idempotente antes de `process.exit(1)` para o PM2.
3. QR, startup e autenticação não executam probe. `auth_failure` e
   `disconnected` preservam seus fluxos existentes de supervisor.
4. `src/services/runtimeHealthService.js` e
   `src/services/dashboardServer.js` retornam `200` somente quando SQLite e
   WhatsApp estão saudáveis; nos demais estados retornam `503` sem causa
   interna, QR, sessão, destinatário ou mensagem.
5. Timeout visto pelo wrapper central de envio alimenta o mesmo limiar como
   sinal antecipado; o probe periódico continua sendo a cobertura independente
   de qualquer caminho individual de envio.
6. O ready rescue tolera apenas o erro exato de binding de mensagem já
   existente e ainda executa a sincronização. Outros erros continuam falhando.
7. O unread backfill repete leitura/handler por no máximo três tentativas,
   registra apenas reason code e preserva a entrada pública/deduplicação
   durável existente. Retry não cria writer financeiro próprio.

## Invariantes e limites

- Processo único com PM2; este gate não implementa alta disponibilidade.
- A recuperação encerra o processo para o supervisor; não apaga
  `.wwebjs_auth`, não gera QR e não reinicia por conta própria.
- Um probe subjacente que excedeu o timeout permanece single-flight. Se ainda
  estiver pendente no ciclo seguinte, conta como a segunda falha sem criar
  outra chamada ao Chrome.
- O health muda para `503` durante inicialização e QR por desenho.
- Nenhum teste usa rede, WhatsApp, Google, dados financeiros ou produção reais.
- Os testes locais são evidência relatada; o auditor externo deve fazer revisão
  estática e não declarar que os executou.

## Evidência executada localmente

- RED: módulos/contratos novos ausentes e três falhas dirigidas em rescue/retry.
- GREEN focal: `36/36`.
- Bateria afetada: `211/211`.
- Runner hermético: 124 arquivos descobertos, 106 executados diretamente, 18
  por runners aninhados; `1.321/1.326`, zero falhas, cinco skips funcionais
  previstos.
- Cobertura: linhas `90,37%`, branches `72,31%`, funções `89,86%`.
- Contrato de ambiente: 188 nomes referenciados, 201 documentados, zero
  ausentes/duplicados e zero acesso dinâmico não aprovado.
- Sintaxe, `git diff --check`, workflow e varredura dirigida de segredos:
  verdes.
- `npm audit` relata 11 avisos `high` transitivos preexistentes no lock atual;
  há um caminho sem correção disponível no Puppeteer de `whatsapp-web.js`.
  Dependências e lockfile não foram alterados neste gate.

## Arquivos centrais para a auditoria

- `docs/audit/61-ops02-whatsapp-liveness-recovery-candidate-2026-07-30.md`
- `src/services/whatsappLivenessService.js`
- `src/services/runtimeHealthService.js`
- `src/services/whatsapp.js`
- `src/services/dashboardServer.js`
- `src/services/whatsappReadyRescueService.js`
- `src/services/whatsappUnreadBackfillService.js`
- `index.js`
- `tests/whatsappLivenessService.test.js`
- `tests/runtimeHealthService.test.js`
- `tests/whatsappServiceLiveness.test.js`
- `tests/dashboardApiContracts.test.js`
- `tests/whatsappReadyRescueService.test.js`
- `tests/whatsappUnreadBackfillService.test.js`

## Critério de fechamento

Somente auditoria independente que confirme o hash completo, leia os arquivos
centrais e não encontre lacuna causal indispensável pode conceder
`GO TÉCNICO LOCAL`. Mesmo com GO, deploy OCI exige gate separado por artefato,
checksum, preservação de estado e rollback ensaiado.
