# Coordenação Chat ↔ Codex

Atualizado em: 2026-08-25

## Objetivo

Estender o workflow portátil existente com um estado mecânico mínimo para
coordenação assíncrona entre Chat e Codex, sem criar uma segunda memória do
projeto e sem tocar no runtime do FinancasBot, produção, WhatsApp, Pluggy,
planilhas ou writers.

## Estado

`ORCH-01 FINISHED — GO TÉCNICO LOCAL`.

## Base e branch

- base imutável do workstream: `11c8fe591287d7f020338594dbd08fb4e2920bee`;
- branch isolada: `chat/chat-codex-orchestration-20260824`;
- estado mecânico versionado:
  `docs/agent-memory/workstreams/chat-codex-orchestration.state.json`;
- candidato mecânico mais recente antes deste checkpoint:
  `d3c1c3e2faec87c7e61a5a5aa5f17f64bff435ba`;
- workstream independente do ARQ-01..06 já encerrado.

## Decisão de arquitetura

O GitHub continua sendo a memória imutável e os checkpoints/workstreams
existentes continuam sendo a autoridade humana. A extensão adiciona somente um
arquivo JSON mecânico deste workstream, validado por script, para indicar posse,
próximo executor e artefatos da troca.

Não existe `docs/refactor/`, `MASTER-PLAN.md`, `CONTROL.md` ou outra memória
paralela.

## Campos mecânicos

O estado versionado contém somente:

- `orchestration_state`;
- `next_executor`;
- `task_id`;
- `expected_base_sha`;
- `task_file`;
- `candidate_sha`;
- `result_file`;
- `updated_at`;
- `schema` para validar a versão do protocolo.

`expected_base_sha` identifica a base material imutável da tarefa. Commits
posteriores restritos ao próprio protocolo/checkpoint podem existir para
publicar a passagem de bastão; eles não alteram silenciosamente a base material.

Nenhum prompt, segredo, dado financeiro, log privado, token, cookie, sessão ou
conteúdo do Chat/Codex pertence ao arquivo mecânico.

## Máquina de estados

Fluxo normal:

`CHAT_WORKING -> CODEX_READY -> CODEX_RUNNING -> CHAT_READY -> CHAT_WORKING`.

Estados terminais/de parada:

- `BLOCKED`;
- `FAILED`;
- `HUMAN_APPROVAL_REQUIRED`;
- `FINISHED`.

O `next_executor` é derivado pelo estado e validado fail-closed. Estados
terminais não possuem transição de saída nesta versão.

## Proteção contra execução duplicada

O transitioner implementa duas barreiras complementares:

1. lock local exclusivo por arquivo (`wx`) para impedir dois transitioners na
   mesma worktree de reivindicarem o estado simultaneamente;
2. `--expected-state-hash` opcional para compare-and-swap lógico: se o conteúdo
   mudou desde a observação do timer, a transição falha antes de executar.

Em integração via GitHub, o executor também deve publicar sua mudança sobre o
blob/HEAD esperado e falhar fechado se o remoto avançar de forma concorrente.

## Invariantes

1. O timer do Codex deve observar somente hash/estado mecânico; ausência de
   mudança não pode despertar o modelo.
2. A automação não é considerada pronta enquanto as duas pontas reais não forem
   provadas: Chat publica `CODEX_READY` e o Codex acorda; Codex publica
   `CHAT_READY` e este Chat é reativado.
3. Dependência local ou privada continua exclusiva do Codex.
4. Chat só altera código quando GitHub/CI fornecem evidência suficiente.
5. Nenhuma transição autoriza deploy, writer, migração, alteração sensível de
   produção ou escrita financeira real.
6. `HUMAN_APPROVAL_REQUIRED` é obrigatório antes de qualquer ação irreversível
   ou previamente não autorizada.
7. Transições são validadas e o arquivo é substituído por escrita temporária +
   rename no ambiente local; no GitHub, cada commit é a unidade atômica.
8. `expected_base_sha` e `candidate_sha`, quando presente, são hashes completos
   de 40 caracteres hexadecimais.
9. `task_file` e `result_file`, quando presente, são caminhos relativos seguros
   dentro do repositório, incluindo rejeição portátil de caminhos absolutos
   Windows/UNC.

## Histórico relevante

Em 2026-08-24 foram fechados transitioner, schema, CAS, lock, escrita atômica,
watcher econômico, perfil isolado, Git explícito e publicação JSON-only. O
Agendador provou sem intervenção a ponta
`GitHub/CODEX_READY -> watcher -> Codex -> GitHub/CHAT_READY`, com 13/13 testes,
syntax e validator verdes. A tentativa de usar tarefa agendada do Chat como
retorno foi negativa e descartada; o navegador interno passou a ser somente a
campainha, nunca memória ou autoridade.

## Recovery da campainha e prova completa em 2026-08-25

O Codex App e o watcher pertencem a usuários Windows diferentes. A chamada IPC
direta do watcher falhou corretamente nessa fronteira. Um PoC isolado por S4U,
executado como o mesmo usuário do Codex App, foi aceito pelo cliente real e
acordou esta tarefa; a tarefa temporária terminou com código zero e foi
removida.

A solução permanente separa responsabilidades:

- `FinancasBot-ChatCodex-Orchestration` permanece `Interactive/Limited` sob o
  usuário operacional, consulta GitHub e executa Codex somente em hash novo
  `CODEX_READY`;
- ao publicar `CHAT_READY`, o watcher grava numa caixa de entrada local somente
  schema, SHA-256 do estado e horário;
- `FinancasBot-CodexApp-Wake-Bridge` roda `S4U/Limited` sob o usuário do Codex
  App, lê configuração fixa protegida e chama uma cópia protegida do helper IPC;
- caixa de entrada permite `Modify` ao watcher; binário/configuração e marcador
  idempotente permitem apenas leitura ao watcher, impedindo que ele substitua o
  código ou apague a prova de envio;
- pedido, configuração, helper e marcador por symlink são recusados;
- o histórico protegido registra cada hash antes do IPC como `dispatching`, de
  modo que queda, erro e replay posterior, inclusive `A -> B -> A`, ficam
  terminais e não duplicam a campainha.

Prova final sem intervenção entre as pontas mecânicas:

1. o Chat publicou `CODEX_READY` no commit `b48e22ebe6281cfb3f6fd8f6e2bbc83153a324b8`;
2. o Agendador detectou o hash
   `0e93f928e1e6bfb041db63d978dbc7be0d7296b094502e56059fe40aad32a33a`;
3. o Codex CLI executou 13/13 testes, syntax check e validator verde;
4. o watcher publicou `CHAT_READY` em
   `e09708e8e5810addf1ab9278a161db4ce4161c74` e marcou `launch_status: succeeded`;
5. a caixa recebeu o hash
   `8125c03786a7ca275e9503c6905d483cd385f0706cc582a1bc64807f8b24eed9`;
6. a ponte S4U registrou `accepted` por um cliente real do Codex App;
7. esta tarefa foi acordada e enviou exatamente uma mensagem `ORCH_WAKE` à
   conversa configurada no navegador interno.

A bateria ampla final do domínio ficou 56/56 verde. As duas tarefas instaladas
ficaram `Ready`, resultado zero, `RunLevel Limited` e `IgnoreNew`.

## Auditoria independente e recovery em 2026-08-25

O Chat leu integralmente o commit
`bf7667cec8bea693f48c1f0c544ddc670d15d96d` e emitiu `NO-GO`: a versão inicial
lembrava somente o último hash e não fechava o replay `A -> B -> A`. A fronteira
de privilégio e a causalidade restante foram aceitas.

O recovery substitui o marcador único por histórico protegido de registros,
mantém `dispatching` antes do IPC, aceita de forma compatível o resultado `v1`
já instalado e acrescenta prova causal explícita de `A -> B -> A`. Nenhuma
fronteira, destino ou dado novo foi acrescentado.

A reauditoria do commit
`5eb87a0dffbbc95b97577b5cdf0df36a72fd4180` confirmou leitura integral dos
quatro arquivos, fechou `A -> B -> A`, migração e fronteira de privilégio e
emitiu `GO TÉCNICO LOCAL` sem lacuna indispensável residual. Depois do GO, a
cópia protegida foi atualizada; o SHA-256 instalado coincidiu com o artefato
auditado e a tarefa permaneceu `Ready`, `S4U`, `Limited`, resultado zero. O
estado mecânico foi transicionado para `FINISHED` por CAS.

## Limites operacionais

- polls inalterados não iniciam modelo, mas as duas tarefas Node acordam o SO a
  cada minuto por poucos instantes;
- o retorno exige Codex App em execução e a conversa autenticada e aberta no
  navegador interno;
- GitHub continua sendo a única memória/autoridade; a mensagem é só campainha;
- falha do IPC fica terminal para o hash e exige recuperação explícita, sem
  relançamento automático;
- nenhum bot, OCI, WhatsApp, Pluggy, planilha, `.env`, writer ou dado financeiro
  participa desta automação.

## Próxima ação exata

Nenhuma ação material pendente em ORCH-01. Usar a automação em novos objetivos
somente por uma nova transição/workstream autorizado; estados terminais não
reiniciam silenciosamente.

## Capacidade

`Codex App -> Sol -> Baixo -> consultar o fechamento, se necessário.`
