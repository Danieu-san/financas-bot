# Auditoria de confiabilidade de interpretacao

Atualizado em: 2026-06-14

## Objetivo

Auditar os caminhos de interpretacao e escrita financeira para reduzir erro silencioso sem aumentar custo Gemini. A auditoria foi offline-first: corrigir por TDD, impedir defaults inseguros, manter Gemini fora de calculos e impedir que campos criticos vindos do LLM executem escrita sem confirmacao.

## Escopo auditado

- Benchmark de interpretacao Gemini e avaliador de qualidade.
- Security Gate antes do planner/LLM.
- Parser deterministico e canonicalizacao.
- Caminhos de pagamento/recebimento em estados financeiros.
- Audio apos transcricao.
- Lotes e parcelamentos.
- Metas, dividas e contas criadas por fluxo de estado.
- Escritas em Google Sheets e risco de retry nao idempotente.
- Uso de Gemini em resposta analitica legada.
- Persistencia de estado conversacional.
- Logs, QA logs, ledger e shadow telemetry.
- Dados pessoais hardcoded em arquivos versionados.

Fora de escopo desta rodada:

- Trocar o modelo Gemini de producao.
- Adicionar LangGraph.
- Substituir Sheets/SQLite.
- Rodar E2E real amplo ou chamadas Gemini amplas.
- Deploy/commit automatico.

## Achados e correcoes

| ID | Gravidade | Categoria | Evidencia | Causa raiz | Correcao | Teste |
|---|---|---|---|---|---|---|
| IRA-001 | HIGH | avaliador | Benchmark tratava equivalencias como erro completo | Comparacao literal por campo | Avaliador v2 com canonicalizacao e severidade por campo | `tests/geminiModelBenchmark.test.js` |
| IRA-002 | HIGH | validacao | Respostas desconhecidas de pagamento/recebimento podiam cair em default inseguro | Fallback LLM/normalizacao fraca em estados | Normalizacao deterministica e nova pergunta quando campo critico falta | `tests/financialStateMachine.test.js` |
| IRA-003 | HIGH | privacidade | Caminho legado podia redigir resposta analitica a partir de `rawResults` | Composer misturava dados crus com redacao | `responseGenerator` passou a ser deterministico e sem chamada Gemini | `tests/interpretationReliability.test.js` |
| IRA-004 | MEDIUM | privacidade | Audio podia registrar texto transcrito/caminho local e deixar temporarios apos falha | Logs verbosos e cleanup parcial | Logs por evento e cleanup idempotente em falha/sucesso | `tests/audioHandlerPrivacy.test.js` |
| IRA-005 | HIGH | recuperacao | Append financeiro podia repetir em retry de erro transiente | Retry cego em operacao nao idempotente | Retry de append desativado por padrao, operation key automatica no contexto de mensagem, ledger e reconciliacao de ultima linha | `tests/unit.test.js` |
| IRA-006 | MEDIUM | estado | `state_store.json` podia guardar mensagem/descritivo financeiro cru | Serializacao direta do estado em memoria | Sanitizacao no snapshot persistido, preservando estado vivo em memoria | `tests/unit.test.js` |
| IRA-007 | MEDIUM | observabilidade | Nao havia shadow mode local e sanitizado para medir confiabilidade | Camada sem trilha operacional | Telemetria opt-in por flag, allowlist, JSONL sanitizado e monitor de prontidao que recomenda apenas revisao manual antes de `enforce` | `tests/interpretationReliability.test.js` |
| IRA-008 | HIGH | privacidade | Telefones reais apareciam em codigo/docs/fixtures | Fixtures historicos foram reaproveitados | Fixtures sinteticas e mapeamento legado por env | `tests/unit.test.js` e varreduras `rg` |
| IRA-009 | HIGH | QA | Bateria de 300+ casos apenas contava fixtures | Runner nao executava decisoes | Runner executavel offline com 340/340 casos e relatorio por decisao | `tests/interpretationReliability.test.js` e `scripts/runInterpretationReliabilityAcceptanceBattery.js` |
| IRA-010 | HIGH | seguranca | Quatro familias de bypass escapavam do Security Gate inicial | Padroes adversariais incompletos | Bloqueio de token privado, bypass de confirmacao/validacao, falsa autorizacao e execucao como admin | `tests/unit.test.js` e bateria IRAB |
| IRA-011 | HIGH | escopo | Nome pessoal podia ser interpretado como transferencia familiar sem autorizacao | Alias de pessoa hardcoded | `family_transfer` so aceita alias vindo de vinculo autorizado | `tests/interpretationReliability.test.js` |
| IRA-012 | HIGH | interpretacao | Tipo de divida, juros e prioridade de meta vinham do Gemini sem validacao | Fluxos de criacao aceitavam texto normalizado por LLM | Validadores deterministicos e nova pergunta em caso ambiguo | `tests/financialStateMachine.test.js` |
| IRA-013 | HIGH | escrita | Parcelas em lote dependiam de JSON Gemini e item nao mapeado virava `1x` | Default silencioso para campo critico | Parser deterministico de parcelas e esclarecimento quando incompleto | `tests/financialStateMachine.test.js` |
| IRA-014 | HIGH | escrita | Single expense/income completo vindo do master LLM podia autoexecutar | Fonte do plano nao influenciava decisao | Escrita derivada de LLM exige confirmacao; fast-path deterministico permanece elegivel | `tests/financialStateMachine.test.js` |
| IRA-015 | HIGH | interpretacao | `parseAmount`/`parseDate` chamavam Gemini para valores/datas criticas | Helpers antigos usavam LLM para conversao | Parsing local de numero por extenso e datas validas; data impossivel retorna `null` | `tests/unit.test.js` |
| IRA-016 | MEDIUM | logs | Handlers podiam despejar `msg.body` ou objetos de transacao no console | Debug legado e `console.error(..., item)` | Remocao dos dumps e teste estatico contra logs crus | `tests/unit.test.js` |
| IRA-017 | MEDIUM | privacidade | QA failure log guardava mensagem textual sanitizada | Sanitizacao removia segredos, mas preservava conteudo financeiro | `message_ref` hash + tamanho, sem mensagem bruta | `tests/unit.test.js` |
| IRA-018 | MEDIUM | UX/seguranca | Confirmacao de movimento interno mostrava `Entrada`/`Gasto` antes de salvar como transferencia | Preview nao aplicava detector de transferencia | Preview de confirmacao agora rotula reserva/familia como `Transferencia` | `tests/financialStateMachine.test.js` |
| IRA-019 | HIGH | escopo | Frase com alias familiar autorizado e `cartao/fatura` podia ser classificada como pagamento de fatura | Prioridade de alias familiar vinha depois de `cartao/fatura` | Alias familiar autorizado passa a vencer `invoice_payment`, preservando reserva/caixinha como prioridade maior | `tests/interpretationReliability.test.js` e bateria IRAB |
| IRA-020 | HIGH | validacao | A flag `enforce` era aceita pela telemetria, mas nao controlava o fluxo de escrita | Nao existia policy gate antes da escrita | Gate real `off/shadow/enforce`; em `enforce`, somente decisao `execute` prossegue sem controle humano e confirmacao explicita satisfaz apenas decisao `confirm` | `tests/interpretationReliability.test.js` e `tests/financialStateMachine.test.js` |
| IRA-021 | HIGH | estado | Valor vindo do LLM podia ser salvo depois de o usuario responder apenas o metodo, sem confirmacao final do valor interpretado | Proveniencia da interpretacao se perdia entre estados | Proveniencia atravessa a maquina de estados; gasto/entrada LLM-only exigem confirmacao final em `enforce` | `tests/financialStateMachine.test.js` |
| IRA-022 | MEDIUM | observabilidade | Readiness media apenas volume, janela e divergencia critica | Faltavam gates de custo e desempenho | Monitor passou a bloquear revisao quando houver auto-save desalinhado, caso ambiguo auto-gravado, chamada Gemini adicional, falta de evidencia ou latencia p95 acima do limite | `tests/interpretationReliability.test.js` |
| IRA-023 | HIGH | seguranca | JSON estruturado do LLM podia carregar metadados internos como `reliabilityConfirmed` para o estado | Transacao externa era espalhada diretamente no objeto interno | Fronteira remove metadados de confiabilidade, escopo e identidade antes de adicionar proveniencia controlada pelo codigo | `tests/financialStateMachine.test.js` |
| IRA-024 | HIGH | interpretacao | `comprei 2 camisas por 100 no pix` era auto-gravado como R$ 2,00 pelo fast-path | Parser escolhia silenciosamente o primeiro numero da frase | Multiplos numeros sem marcador monetario inequivoco deixam de ser auto-save; o fluxo pede confirmacao/interpretacao segura | `tests/financialStateMachine.test.js` e `tests/interpretationReliability.test.js` |
| IRA-025 | HIGH | validacao | Campo critico deterministico podia sobrescrever valor divergente vindo da interpretacao sem registrar conflito | Merge privilegiava parser sem comparacao cruzada | Divergencias em campos criticos viram `field_conflict` e exigem esclarecimento antes de escrever | `tests/interpretationReliability.test.js` e `tests/financialStateMachine.test.js` |
| IRA-026 | MEDIUM | observabilidade | Uma unica amostra de uma operacao era suficiente para o readiness recomendar revisao de `enforce` | Gate por operacao exigia apenas presenca | Readiness exige ao menos 10 decisoes reais por operacao obrigatoria | `tests/interpretationReliability.test.js` |
| IRA-027 | HIGH | recuperacao | Repetir uma confirmacao de exclusao podia chamar `deleteRowsByIndices` novamente e apagar outra linha deslocada | Delete nao usava ledger/chave idempotente, embora retry cego ja estivesse desligado | `deleteRowsByIndices` ganhou operation key por contexto de mensagem, ledger para `committed`, bloqueio de `pending/uncertain` e recibo idempotente | `tests/unit.test.js` |
| IRA-028 | HIGH | recuperacao | Repetir update de meta/divida ou retry incerto podia aplicar de novo ou restaurar valor antigo | `updateRowInSheet` nao usava ledger e nao reconciliava linha atual antes de replay | `updateRowInSheet` ganhou operation key, ledger, replay idempotente, reconciliacao por fingerprint da linha atual e bloqueio de replay incerto quando a linha mudou | `tests/unit.test.js` |
| IRA-029 | HIGH | recuperacao | Repetir a confirmacao de uma importacao com novo id de mensagem podia salvar novamente itens ja confirmados | Importacao herdava chave do contexto da confirmacao, nao uma chave estavel por item do arquivo | Cada item importado ganhou operation key estavel derivada de tipo, data, descricao, valor, metodo, cartao e indice do arquivo; replay confirmado retorna via ledger sem novo append | `tests/unit.test.js` |

## Resultado dos gates

- `BLOCKER`: nenhum confirmado ate aqui.
- `HIGH`: achados confirmados nesta rodada foram corrigidos por TDD.
- `MEDIUM`: achados confirmados nesta rodada foram corrigidos por TDD.
- `LOW`: backlog futuro: ampliar ledger/envelope para toda escrita fora do contexto de mensagem e automatizar execucao da bateria IRAB em CI.

## Regras consolidadas

- Auto-save so deve ocorrer quando campos criticos estiverem completos, validados e sem conflito.
- Multiplos numeros sem um unico valor monetario inequivoco nunca podem virar auto-save.
- Metadados internos de confiabilidade, identidade ou escopo nunca podem ser aceitos de resposta LLM.
- Campo critico dependente de Gemini exige confirmacao ou esclarecimento.
- Falha de Gemini, JSON invalido ou quota nunca vira valor padrao.
- Append, update e delete financeiro nao devem repetir cegamente.
- Logs, estado persistido, QA logs, ledger, shadow telemetry e codigo versionado nao devem guardar mensagem financeira bruta, telefone real, `user_id`, token, `sheet_id` ou URL privada.
- Shadow mode nao chama Gemini extra e nao escreve dado financeiro.
- O monitor de prontidao do shadow nunca altera flags nem habilita `enforce`; ele so emite `keep_shadow` ou `manual_review_for_enforce`.
- O alinhamento observado dos candidatos a auto-save e um proxy operacional, nao prova de correcao semantica. A decisao de ativar `enforce` continua exigindo bateria offline e revisao humana.
- Alias de membro familiar so e valido quando vem do escopo familiar autorizado fora do LLM.

## Limitacoes ainda aceitas

- A idempotencia esta forte para appends, updates, deletes e importacoes com chaves estaveis por item. Batches manuais e escritas operacionais fora desse contexto ainda devem migrar por pacote proprio.
- A reconciliacao de append incerto compara a ultima linha nao vazia da aba. Se outra escrita entrar depois de uma operacao incerta, o sistema bloqueia a repeticao em vez de tentar adivinhar. Isso e intencional para evitar duplicacao silenciosa, mas um pacote futuro deve evoluir para identificador de operacao por linha.
- Shadow mode esta integrado a escritas manuais estruturadas e deve ser expandido gradualmente para todos os comandos sensiveis.
- O gate real de `enforce` cobre inicialmente gasto/entrada unitarios fora do credito. Cartao, transferencias, lotes, audio, importacoes e demais mutacoes continuam fora do enforce inicial.
- Estados redigidos em disco podem perder contexto livre apos restart. Esse e um tradeoff consciente: e melhor pedir de novo do que salvar dado sensivel cru no snapshot.
- A validacao real continua limitada pelo teto de custo Gemini definido no plano.

## Evidencias executadas nesta rodada

- `node --test --test-name-pattern="helpers critical|helpers.parseAmountLocal|financial write handlers do not dump" tests\unit.test.js` -> 3/3.
- `node --test --test-name-pattern="qaFailureLogService records" tests\unit.test.js` -> 1/1.
- `node --test tests\interpretationReliability.test.js tests\financialStateMachine.test.js` -> 81/81 apos a revisao adversarial.
- `node --test tests\unit.test.js --test-name-pattern "updateRowInSheet can use write ledger|updateRowInSheet reconciles uncertain|updateRowInSheet blocks uncertain"` -> 165/165, com regressao de update idempotente, reconciliacao de update incerto e bloqueio quando a linha mudou.
- `node --test tests\unit.test.js --test-name-pattern "deleteRowsByIndices|message write context deduplicates delete"` -> 162/162, com regressao de delete idempotente, replay incerto e contexto de mensagem.
- `node --test tests\unit.test.js --test-name-pattern "statement import uses stable"` -> 166/166, com regressao de importacao por item usando chave estavel entre confirmacoes.
- `C:\Users\horus\AppData\Local\Microsoft\WindowsApps\pwsh.exe -Command "node scripts\runInterpretationReliabilityAcceptanceBattery.js"` -> 340/340, mismatches 0.
- `node scripts\runFinancialQueryAcceptanceBattery.js` -> 265/265, mismatches 0, bloqueados antes do planner 23.
- `npm test` -> 408/408.
- `npm audit --audit-level=high` -> 0 vulnerabilidades.
- `node --check` nos JS alterados -> sem erro.
- `git diff --check` -> sem erro bloqueante, apenas avisos CRLF esperados no Windows.
- Varredura NUL em `docs`, `src`, `scripts`, `tests`, `package.json` e `state_store.json` -> sem achados.
- Varredura de padroes sensiveis nos artefatos novos e testes auditados -> sem achados.
- `state_store.json` -> `{}`.
- `npm run report:interpretation-readiness` -> `KEEP_SHADOW`, 0/50 decisoes reais, 0 divergencias criticas e bloqueio esperado por falta de amostra/janela.

Fechamento local: aprovado para manter producao em `shadow`; `enforce` continua bloqueado ate cumprir os gates da spec e passar por revisao humana. Esta evolucao local ainda requer commit/release separado antes de chegar a producao.
