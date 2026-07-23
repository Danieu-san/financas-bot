# Comece aqui — retomada portátil do FinancasBot

Este é o ponto de entrada estável para qualquer Codex que receba o SSD depois
de trabalho feito em outro computador ou em outra conversa.

## Frases-gatilho

- `vou continuar em outro Codex` ou equivalente: executar imediatamente a
  rotina de fechamento descrita em `$handoff-portable-work`;
- `continuei o trabalho em outro Codex` ou equivalente: executar
  `scripts/agent/resumePortableWork.ps1` e seguir a ordem de leitura abaixo.

Não pedir a Daniel que reconstrua o contexto enquanto estes arquivos estiverem
disponíveis.

## Ordem mínima de retomada

1. `AGENTS.md`;
2. este arquivo;
3. `docs/agent-memory/README.md`;
4. `docs/agent-memory/current.md`;
5. `docs/plans/current-gate.md`;
6. o checkpoint específico apontado por `current.md`;
7. somente os workstreams, runbooks, código e testes citados por essas fontes.

Antes de editar, confirmar raiz, branch, HEAD completo e `git status`. Preservar
todos os arquivos alheios ou não rastreados. O GitHub serve para commits
imutáveis e auditoria; o repositório no SSD e o checkpoint vigente definem o
estado local a retomar.

## Referências operacionais portáteis

As chaves SSH ficam fora do repositório, na pasta `FinancasBot` que contém a
raiz `financas-bot`. O Codex deve localizar primeiro por caminho relativo, para
que a retomada continue funcionando se a letra do SSD mudar:

- produção Oracle/OCI:
  `..\financas_bot_oci_ed25519_20260722`;
- rollback AWS:
  `..\financasBot.pem`.

No computador em que este checkpoint foi preparado, os caminhos observados
eram:

- `E:\Users\horus\Documents\FinancasBot\financas_bot_oci_ed25519_20260722`;
- `E:\Users\horus\Documents\FinancasBot\financasBot.pem`.

Esses registros são referências de localização, não cópias das chaves. Nunca
ler, imprimir, versionar ou enviar o conteúdo das chaves. Antes de ação remota,
ler o workstream e os runbooks vigentes para descobrir provedor, host, usuário,
diretório, processo, política de deploy e rollback. A produção atual é Oracle;
a AWS permanece somente como rollback e nunca pode executar simultaneamente
com a Oracle usando a mesma sessão WhatsApp.

## Rotina de fechamento

Na primeira fronteira consistente:

1. atualizar o checkpoint do objetivo/workstream ativo;
2. registrar objetivo, estado, HEAD, mudanças, testes, riscos, arquivos alheios,
   próxima ação e capacidade;
3. executar `node scripts/agent/validateAgentWorkflow.js`;
4. executar `scripts/agent/preparePortableHandoff.ps1`;
5. fazer commit/push somente quando já autorizado e usando staging explícito;
6. deixar em `Trabalho Codex no outro PC\last-safe-handoff.json` o relatório
   mecânico de saída.

O relatório deve confirmar a presença das referências operacionais e apontar
este arquivo. Ele não transporta autenticação, cookies, sessões, tokens,
histórico privado nem o conteúdo das chaves.

## Rotina de retomada

Executar, a partir da raiz do repositório:

`powershell -ExecutionPolicy Bypass -File scripts\agent\resumePortableWork.ps1`

Se `git` não estiver no `PATH`, informar `-GitBin` com o executável local. A
rotina produz `Trabalho Codex no outro PC\last-resume-check.json`, valida o
workflow, confirma Git e verifica apenas a existência das chaves referenciadas.

Depois, retomar a próxima ação exata de `current.md`/`current-gate.md`, usando a
capacidade ali recomendada. Não acessar produção ou fazer deploy sem a
autorização correspondente.
