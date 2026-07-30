# Gate ativo — OPS-02 liveness e recuperação do WhatsApp

Atualizado em: 2026-07-30

Base:
`43c4555f534421aa87fee6ccc97d242d80a1744c`.

## Estado

`GO TÉCNICO LOCAL`.

## Evidência do incidente

Na produção Oracle, o processo permaneceu `online`, sem reinícios, e
`/dashboard/health` continuou `200` com SQLite verde. Ao mesmo tempo:

- operações do WhatsApp falharam repetidamente com
  `Runtime.callFunctionOn timed out` desde 2026-07-27;
- o Chrome não mantinha conexão externa, apenas o socket local com Node;
- Google e read-model continuaram sincronizando;
- `client.on('disconnected')` não foi emitido e o processo não se recuperou;
- restart controlado restaurou o runtime, mas a sessão exigiu novo QR;
- depois do QR, `ready` e uma mensagem real confirmaram recuperação.

O código possui watchdog somente entre inicialização/autenticação e `ready`.
Depois de `ready`, o health não consulta a sessão WhatsApp e não existe probe
periódico ou escalonamento ao supervisor.

## Objetivo

Detectar de forma limitada e sanitizada a perda de liveness da sessão
WhatsApp/Puppeteer depois de `ready`, refletir o estado no health e acionar uma
única recuperação pelo supervisor após falhas consecutivas, sem reiniciar
durante QR/autenticação e sem criar caminho de duplicação de mensagens.

## Escopo

- máquina de liveness testável e independente do navegador real;
- estados mínimos `starting`, `qr_pending`, `ready`, `degraded` e `stopped`;
- probe single-flight e com timeout próprio;
- limiar configurável de falhas consecutivas e recuperação após sucesso;
- escalonamento exatamente uma vez para o supervisor;
- integração com `ready`, `qr`, `authenticated`, `auth_failure`,
  `disconnected` e falha de transporte;
- `/dashboard/health` distingue processo/SQLite de WhatsApp operacional;
- retry limitado do unread backfill após reconexão, com reason codes estáveis;
- logs sanitizados por reason code, sem destinatário, mensagem ou sessão;
- variáveis novas presentes no contrato de ambiente;
- testes de não regressão do ready rescue e do backfill.

## Não escopo

- deploy, restart adicional, QR ou alteração da sessão real;
- upgrade de `whatsapp-web.js`, Chrome ou mudança de flags Puppeteer;
- remoção de `LocalAuth` ou troca de provedor de transporte;
- alta disponibilidade com dois processos concorrentes;
- escrita financeira, 9P.4 ou ativação Open Finance;
- provar a causa raiz do alto CPU steal da VM.

## Invariantes

1. QR pendente, inicialização e autenticação em curso nunca acionam restart por
   liveness de runtime.
2. Somente sessão previamente `ready` pode ser sondada como runtime.
3. Um probe lento não permite probes concorrentes.
4. Falha isolada degrada o health, mas não encerra o processo.
5. Sucesso antes do limiar zera falhas consecutivas.
6. O limiar aciona no máximo uma saída; eventos posteriores não duplicam a
   recuperação.
7. Timeout não vira sucesso por ausência de erro.
8. Health não expõe IDs, números, conteúdo, QR, URL de sessão ou erro cru.
9. A correção não envia mensagem e não chama writer financeiro.
10. A deduplicação e o backfill existentes continuam na mesma entrada pública.

## Riscos

- falso positivo reiniciar uma sessão saudável sob pressão transitória;
- probe pendente acumular trabalho no Chrome;
- loop de restart quando a sessão exigir QR;
- health mudar de `200` para `503` durante startup e afetar monitor externo;
- saída durante transporte ambíguo reprocessar mensagem sem deduplicação.

## Etapas

1. [concluído] RED causal da sessão `ready` cujo probe trava ou retorna
   desconectado.
2. [concluído] RED do health falso verde com WhatsApp degradado.
3. [concluído] Implementação mínima da máquina, integração e contrato de
   ambiente.
4. [concluído] Testes focais, ready rescue, backfill, dashboard e entrada
   pública afetada.
5. [concluído] Bateria hermética, diff, contrato de ambiente e varredura de
   segredos.
6. [concluído com NO-GO] Primeiro commit sanitizado
   `4647ea775f801dcd277d0282a8cc424a43d3f4f3` e auditoria independente.
7. [concluído localmente] Fechamento de um `HIGH`, dois `MEDIUM` e um `LOW`.
8. [concluído] Commit de recuperação
   `ccd4d2e2bb8689d4f838cab21f92ffc6b8b5b6ff` e reauditoria independente com
   `GO TÉCNICO LOCAL`.
9. [separado] Planejar deploy OCI por artefato com rollback antes de qualquer
   publicação funcional.

## Evidência local do candidato

- RED: os novos contratos de liveness/health não existiam; a prova dirigida de
  ready rescue e retry do backfill terminou com três falhas esperadas.
- GREEN focal HTTP/runtime/rescue/backfill: `36/36`.
- Bateria afetada com dashboard, OAuth, scheduler, estado e auditorias Google:
  `211/211`.
- Runner hermético exaustivo: `1.321/1.326`, zero falhas e cinco skips E2E
  funcionais previstos; 124 arquivos descobertos, 106 executados diretamente e
  18 cobertos por runners aninhados.
- Cobertura: linhas `90,37%`, branches `72,31%`, funções `89,86%`.
- Contrato de ambiente: 188 nomes referenciados, 201 documentados, zero nomes
  ausentes, duplicados ou acessos dinâmicos não aprovados.
- `git diff --check`, sintaxe dos módulos alterados e varredura dirigida de
  segredos: verdes.
- `npm audit --audit-level=high` relata 11 vulnerabilidades transitivas da árvore
  já fixada, incluindo `js-yaml` sem correção disponível via
  `whatsapp-web.js`/Puppeteer. O lockfile não foi alterado e nenhum `audit fix`
  foi aplicado neste gate.

## Primeiro parecer independente

O Chat leu os 14 arquivos no hash
`4647ea775f801dcd277d0282a8cc424a43d3f4f3` e emitiu `NO-GO`:

- `HIGH 1`: o manifesto atribuía retry ao handler, mas o handler público
  absorvia a falha;
- `MEDIUM 2`: faltavam provas de resolução tardia após decisão de recovery e
  concorrência entre causas de saída;
- `LOW 1`: faltava o negativo do rescue para erro diferente do binding
  permitido.

## Recuperação pós-NO-GO

- O retry agora termina antes de executar handlers e cobre somente descoberta e
  leitura de não lidas. Falha ambígua do handler nunca reabre o lote nem repete
  uma mensagem já tentada.
- `index.js` usa `handleMessageForBackfill`, que conserva a mesma fila pública
  por remetente, transforma falha absorvida no processamento em código
  sanitizado e a propaga ao serviço.
- A integração real `backfillUnreadMessages -> handleMessageForBackfill ->
  processMessage` é exercitada com falha interna, duas tentativas de resposta,
  zero escrita e uma única descoberta.
- Resolução `CONNECTED` tardia depois de recovery solicitado não restaura o
  health nem solicita nova saída.
- Todas as causas de saída atravessam uma única instância idempotente; teste do
  produto combina limiar de liveness e `disconnected` e exige um só timer/exit.
- Rescue rejeita e não avalia a página quando `attachEventListeners` falha por
  causa diferente de `onAddMessageEvent ... already exists`.
- GREEN pós-auditoria focal: `142/142`.
- Runner hermético após as mudanças de produto: `1.325/1.330`, zero falhas e
  cinco skips funcionais previstos; a última adição foi somente a prova de
  composição já coberta na bateria focal.

## Critérios de GO

- RED reproduz o falso verde sem rede ou WhatsApp real;
- duas falhas consecutivas configuradas acionam uma única recuperação;
- uma falha seguida de sucesso não aciona recuperação;
- probe single-flight não acumula chamadas;
- QR/startup/auth não iniciam probe nem recuperação;
- health retorna `503` sanitizado quando WhatsApp não está operacional e
  `200` somente com SQLite e WhatsApp saudáveis;
- `ready` restaura health, falhas degradam e sucesso posterior recupera;
- integração real de `src/services/whatsapp.js` exercitada com cliente falso;
- ready rescue e unread backfill permanecem verdes;
- binding de mensagem já existente não invalida o ready rescue, e falha
  transitória do backfill é repetida sem expor erro cru;
- nenhuma escrita financeira, mensagem real ou integração externa;
- auditoria independente sem achado bloqueante.

## Condições de parada

- necessidade de apagar `.wwebjs_auth`;
- necessidade de tocar produção durante a implementação;
- recuperação que possa executar mais de uma vez;
- ausência de prova da fronteira entre falha isolada e sessão morta;
- mudança de transporte, pacote ou arquitetura fora deste gate.

## Veredito independente final

O Chat confirmou o hash completo e a leitura integral dos 14 arquivos. O parecer
encerrou o `HIGH`, os dois `MEDIUM` e o `LOW`, registrou `HIGH 0`, `MEDIUM 0` e
`LOW 0` residuais e não encontrou lacuna indispensável dentro do gate de
processo único. A revisão foi estática e não executou os testes.

Fechamento:
`docs/audit/63-ops02-independent-close-2026-07-30.md`.

## Próxima ação exata

Abrir o gate 9P.4 para revalidação final, confirmação idempotente, operation key
e recibo, mantendo writer, integração real e produção desligados.

## Capacidade

`Codex → Sol → Alto → delimitar e implementar o primeiro elo causal de 9P.4.`
