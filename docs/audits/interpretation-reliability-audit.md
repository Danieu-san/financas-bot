# Auditoria de confiabilidade de interpretacao

Atualizado em: 2026-06-13

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

## Resultado dos gates

- `BLOCKER`: nenhum confirmado ate aqui.
- `HIGH`: achados confirmados nesta rodada foram corrigidos por TDD.
- `MEDIUM`: achados confirmados nesta rodada foram corrigidos por TDD.
- `LOW`: backlog futuro: ampliar ledger/envelope para toda escrita fora do contexto de mensagem e automatizar execucao da bateria IRAB em CI.

## Regras consolidadas

- Auto-save so deve ocorrer quando campos criticos estiverem completos, validados e sem conflito.
- Campo critico dependente de Gemini exige confirmacao ou esclarecimento.
- Falha de Gemini, JSON invalido ou quota nunca vira valor padrao.
- Append financeiro nao deve repetir cegamente.
- Logs, estado persistido, QA logs, ledger, shadow telemetry e codigo versionado nao devem guardar mensagem financeira bruta, telefone real, `user_id`, token, `sheet_id` ou URL privada.
- Shadow mode nao chama Gemini extra e nao escreve dado financeiro.
- O monitor de prontidao do shadow nunca altera flags nem habilita `enforce`; ele so emite `keep_shadow` ou `manual_review_for_enforce`.
- Alias de membro familiar so e valido quando vem do escopo familiar autorizado fora do LLM.

## Limitacoes ainda aceitas

- A idempotencia esta forte para appends no contexto de mensagem; escritas operacionais fora desse contexto ainda devem migrar por pacote proprio.
- A reconciliacao de append incerto compara a ultima linha nao vazia da aba. Se outra escrita entrar depois de uma operacao incerta, o sistema bloqueia a repeticao em vez de tentar adivinhar. Isso e intencional para evitar duplicacao silenciosa, mas um pacote futuro deve evoluir para identificador de operacao por linha.
- Shadow mode esta integrado a escritas manuais estruturadas e deve ser expandido gradualmente para todos os comandos sensiveis.
- Estados redigidos em disco podem perder contexto livre apos restart. Esse e um tradeoff consciente: e melhor pedir de novo do que salvar dado sensivel cru no snapshot.
- A validacao real continua limitada pelo teto de custo Gemini definido no plano.

## Evidencias executadas nesta rodada

- `node --test --test-name-pattern="helpers critical|helpers.parseAmountLocal|financial write handlers do not dump" tests\unit.test.js` -> 3/3.
- `node --test --test-name-pattern="qaFailureLogService records" tests\unit.test.js` -> 1/1.
- `node --test tests\interpretationReliability.test.js tests\financialStateMachine.test.js tests\audioHandlerPrivacy.test.js tests\geminiModelBenchmark.test.js` -> 67/67.
- `C:\Users\horus\AppData\Local\Microsoft\WindowsApps\pwsh.exe -Command "node scripts\runInterpretationReliabilityAcceptanceBattery.js"` -> 340/340, mismatches 0.
- `node scripts\runFinancialQueryAcceptanceBattery.js` -> 265/265, mismatches 0, bloqueados antes do planner 23.
- `npm test` -> 377/377.
- `npm audit --audit-level=high` -> 0 vulnerabilidades.
- `node --check` nos JS alterados -> sem erro.
- `git diff --check` -> sem erro bloqueante, apenas avisos CRLF esperados no Windows.
- Varredura NUL em `docs`, `src`, `scripts`, `tests`, `package.json` e `state_store.json` -> sem achados.
- Varredura de padroes sensiveis nos artefatos novos e testes auditados -> sem achados.
- `state_store.json` -> `{}`.

Fechamento local: aprovado para permanecer sem deploy nesta etapa. O proximo passo operacional e ativar `shadow` apenas quando houver uma janela controlada de observacao real, acompanhar com `npm run report:interpretation-readiness` e manter `enforce` bloqueado ate cumprir os gates da spec e passar por revisao humana.
