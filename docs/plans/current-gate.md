# Gate ativo — PRIV-01

Atualizado em: 2026-07-22

Commit de partida: `9894d8215cec7f7b7d3add9329d3e3071f62fc58`.

## Estado

`CANDIDATO LOCAL VALIDADO, AGUARDANDO COMMIT IMUTÁVEL E AUDITORIA
INDEPENDENTE`. Este gate não autoriza deploy.

## Objetivo

Fechar `PRIV-01`, P1 da auditoria exaustiva: impedir que caminhos de runtime
contornem o logger sanitizado ou enviem a logs objetos de erro/resposta, tokens,
URLs sensíveis, conteúdo de mensagens ou identificadores crus.

## Escopo

- entrypoint `index.js` e módulos JavaScript de `src/**`, exceto utilitários
  exclusivamente de teste em `src/testing/**`;
- logger central, sinks `console.error`/`console.warn` e payloads de erros de
  providers;
- testes adversariais do sanitizador e prova negativa estática do runtime;

## Não escopo

- mudança de regras financeiras, retries, respostas, efeitos ou ordem causal
  do produto;
- produção, WhatsApp/Google real, deploy ou `STATE-04`;
- logs de dependências externas ou arquivos históricos já gravados.

## Inventário e RED

O inventário reproduzível encontrou 146 arquivos JavaScript de runtime, 34
ocorrências de `console.error`, 9 de `console.warn` e quatro dumps explícitos de
payload de provider. Os escapes estavam em sete módulos: `index.js`,
`creationHandler`, `messageHandler`, `google`, `googleOAuthService`, `whatsapp`
e `userStateManager`.

Dois testes foram escritos antes da correção e falharam causalmente:

1. o sanitizador preservava um `spreadsheet_id` e conteúdo em `message`;
2. a prova negativa localizava os sete módulos que contornavam o logger.

## Correção candidata

- o logger central ganhou resumo seguro de erro composto apenas por nome e
  código/status sanitizados, sem mensagem, resposta, configuração ou stack;
- a redação central passou a cobrir chaves ampliadas de identificador e conteúdo
  tanto em JSON quanto em pares `chave=valor`;
- todos os `console.error` e `console.warn` do runtime foram encaminhados ao
  logger central com evento estável e resumo seguro;
- os quatro dumps explícitos de `response.data` foram removidos;
- testes que observavam os sinks antigos agora observam o logger, sem alterar a
  decisão de produto exercitada.

## Evidência executada pelo Codex

- RED: `2/2` falharam antes da correção pelos escapes acima;
- provas focais depois da correção: `2/2`;
- regressões dirigidas dos antigos sinks: `5/5`;
- recorte WhatsApp após eliminar o último motivo dinâmico: `27/27`;
- bateria afetada de 20 arquivos: `510/510`;
- `npm test`: pretests verdes e runner principal `1.076/1.076`, sem falha,
  cancelamento ou skip;
- sintaxe dos arquivos alterados e `git diff --check`: verdes;
- busca final: zero `console.error`/`console.warn` no recorte de runtime e zero
  dump explícito dos payloads de provider caracterizados.

Essas execuções pertencem ao Codex. A auditoria externa será estática e não
deve alegar que as reproduziu.

## Critérios de GO

1. workflow do agente e varredura de segredos verdes;
2. diff restrito e commit sanitizado publicado no GitHub por hash completo;
3. auditor independente confirma hash e arquivos, não encontra achado
   bloqueante nem lacuna indispensável dentro de `PRIV-01`;
4. executor confronta o parecer com o código e registra fechamento separado.

## Condições de parada

- evidência de segredo real exige contenção própria sem reproduzi-lo;
- necessidade de alterar autorização, efeitos financeiros ou produção;
- conflito com arquivos concorrentes da migração Oracle;
- constatação de que `Alto` deixou de ser suficiente para manter qualidade.

## Capacidade

`Codex → Sol → Alto → publicar e auditar o candidato PRIV-01 sem deploy.`

## Próxima ação exata

Criar o manifesto candidato, validar workflow/segredos, adicionar somente os
arquivos de `PRIV-01`, publicar o commit imutável e submetê-lo uma única vez ao
Chat conectado ao GitHub.
