# Gate ativo — PRIV-01

Atualizado em: 2026-07-22

Commit de partida: `9894d8215cec7f7b7d3add9329d3e3071f62fc58`.
Primeiro candidato auditado: `45dbfa1632779924bc8795baefd969f03afde7e7`.

## Estado

`SEGUNDO NO-GO REPRODUZIDO, CORRIGIDO E VALIDADO, AGUARDANDO NOVO COMMIT
IMUTÁVEL E REAUDITORIA INDEPENDENTE`. Este gate não autoriza deploy.

## Objetivo

Fechar `PRIV-01`: impedir que warnings/errors do runtime contornem a fronteira
sanitizada ou levem objetos, mensagens livres, payloads, tokens, conteúdo ou
identificadores crus aos logs.

## Escopo

- `index.js` e JavaScript de `src/**`, exceto `src/testing/**`;
- logger central, sinks warning/error, aliases injetáveis e payloads de erro;
- prova adversarial do sanitizador e prova negativa estática do runtime;
- preservação da severidade e de códigos categóricos úteis.

## Não escopo

- mudança de regras financeiras, retries, respostas, efeitos ou ordem causal;
- produção, WhatsApp/Google real, deploy ou `STATE-04`;
- logs de dependências externas ou arquivos históricos já gravados;
- saídas estáticas de inicialização que não carregam dados do runtime.

## Caracterização e RED inicial

O inventário encontrou 146 arquivos de runtime, 34 `console.error`, 9
`console.warn` e quatro dumps explícitos de payload de provider. Dois REDs
mostraram redação incompleta de identificador/conteúdo e sete módulos que
usavam console warning/error diretamente.

## Primeiro candidato e NO-GO independente

O Chat leu integralmente os 12 arquivos solicitados no hash
`45dbfa1632779924bc8795baefd969f03afde7e7` e emitiu `NO-GO` por dois achados
HIGH:

1. propriedades livres como `error.message` continuavam interpoladas antes da
   sanitização;
2. módulos injetáveis ainda aceitavam `console` como logger, e o WhatsApp
   entregava esse alias ao ready-rescue.

O parecer também demonstrou que o primeiro scanner tinha produzido falso verde
porque reconhecia somente chamadas textuais diretas a `console.warn/error`.

## Correção pós-parecer

- todos os sinks warning/error caracterizados passaram a usar evento estável e
  `safeError`, sem mensagem, payload, response, config ou stack;
- `safeError` ficou fail-closed: somente classes conhecidas e códigos HTTP ou
  categóricos em caixa alta e formato estrito sobrevivem;
- configs de runtime, Open Finance, unread backfill e ready-rescue usam o logger
  central como fallback, nunca `console`;
- o WhatsApp injeta o logger central no ready-rescue e não registra motivo livre
  de desconexão;
- a prova negativa reprova console direto, aliases de console e propriedades
  livres de erro em sinks warning/error no recorte completo.

## Segundo candidato e segundo NO-GO independente

O Chat leu integralmente os 27 arquivos exigidos no hash
`44d703bd3792674d1089e118f08403e1c2e55ee4`. Confirmou o fechamento dos aliases
de `console`, mas emitiu novo `NO-GO` porque cinco sinks multilinha em
`messageHandler.js` ainda interpolavam `error.message`, `google.js` interpolava
`warning.error`, `safeError` consultava `error.response?.status` e o scanner
limitado à linha não detectava essas chamadas.

Todos os achados foram reproduzidos. Os seis sinks agora passam dados de erro
por `safeError`; o sanitizador não consulta `response`; e a prova negativa
analisa chamadas completas, atravessa quebras de linha, diferencia o argumento
sanitizado e possui fixtures contra falso negativo e falso positivo.

## Evidência executada pelo Codex

- reprodução dos dois achados HIGH: confirmada;
- padrões estáticos do `NO-GO` depois da correção: zero;
- sintaxe dos JavaScript alterados: verde;
- provas focais ampliadas: `3/3`;
- bateria transversal afetada: `526/526`;
- bateria final dos últimos sinks: `418/418`;
- `npm test`: pretests verdes e runner principal `1.077/1.077`, sem falha,
  cancelamento ou skip.

Essas execuções pertencem ao Codex. O Chat fará revisão estática e não deve
tratá-las como execução própria.

## Critérios de GO

1. workflow do agente, diff e varredura de segredos verdes;
2. novo commit sanitizado publicado por hash completo;
3. reauditoria limpa confirma os arquivos e confronta os dois achados HIGH;
4. nenhum achado bloqueante ou lacuna indispensável permanece em `PRIV-01`;
5. executor confronta o parecer com o código e registra fechamento separado.

## Condições de parada

- evidência de segredo real exige contenção própria sem reproduzi-lo;
- necessidade de alterar autorização, efeitos financeiros ou produção;
- conflito com arquivos concorrentes da migração Oracle;
- constatação de que `Alto` deixou de ser suficiente.

## Capacidade

`Codex → Sol → Alto → publicar e reauditar a recuperação de PRIV-01 sem deploy.`

## Próxima ação exata

Validar workflow/segredos, adicionar somente os arquivos do segundo pós-NO-GO,
publicar o novo hash e submetê-lo uma única vez a uma reauditoria limpa no Chat
conectado ao GitHub.
