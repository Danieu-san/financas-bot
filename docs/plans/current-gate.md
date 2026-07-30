# Gate ativo — OPS-02 liveness e recuperação do WhatsApp

Atualizado em: 2026-07-30

Base:
`43c4555f534421aa87fee6ccc97d242d80a1744c`.

## Estado

`CANDIDATO LOCAL VERDE; AUDITORIA INDEPENDENTE PENDENTE`.

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
6. [pendente] Commit sanitizado e auditoria independente por hash imutável.
7. [bloqueado até GO] Planejar deploy OCI por artefato com rollback.

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

## Próxima ação exata

Publicar o candidato sanitizado, fornecer o hash completo e os arquivos exatos
ao Chat e confrontar o parecer estático independente com a evidência executada
localmente. Sem resposta auditável, o estado máximo continua `candidato`.

## Capacidade

`Codex → Sol → Alto → implementar e validar causalmente OPS-02.`
