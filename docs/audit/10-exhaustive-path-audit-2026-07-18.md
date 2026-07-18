# Auditoria exaustiva de caminhos do FinancasBot - 2026-07-18

## Correção de escopo

O fechamento técnico do P5 em
`docs/audit/09-p5-negative-proof-execution-2026-07-18.md` encerrou a prova
profunda dos caminhos de identidade administrativa, lifecycle, Google/OAuth,
causalidade, concorrência, revogação, recuperação e prova negativa. Ele não
equivale, sozinho, a uma auditoria exaustiva de todas as superfícies do bot.

Esta auditoria amplia explicitamente o escopo para todos os pontos de entrada,
roteamentos, decisões, persistências, efeitos externos, respostas, erros,
retries, replays e caminhos administrativos estaticamente alcançáveis no
produto. A execução é paralelizada por superfícies, sem reduzir a profundidade.

## Objeto e travas

- Base inicial publicada: `0737d7ccbdd309e4c39f503ca781e89d5aac7bc3`.
- Código de produto em `src` e `index.js`: somente leitura durante a auditoria.
- Permitido: documentação, harnesses locais, armazenamento temporário
  descartável e testes com doubles.
- Proibido sem autorização posterior: correção de produto, deploy, mudança de
  flags, produção, Google real, WhatsApp real, planilha real ou dados do casal.
- Acesso do Chat: somente arquivos públicos por URLs imutáveis do GitHub.

## Definição operacional de exaustividade

A auditoria só pode ser encerrada quando:

1. todos os módulos de `src` estiverem classificados como runtime,
   operacional, somente teste ou não referenciado;
2. todas as entradas de `index.js`, eventos WhatsApp, rotas HTTP, crons,
   timers e comandos operacionais estiverem inventariadas;
3. cada roteamento e decisão material tiver guards, efeitos, erros e cobertura
   registrados;
4. cada caminho possuir prova reproduzível ou lacuna explícita, sem converter
   ausência de evidência em `GO`;
5. todos os testes locais seguros forem executados juntos;
6. caminhos que exigem serviços reais forem separados e sustentados apenas
   por evidência operacional histórica sanitizada, sem nova execução implícita;
7. o pacote final publicado for revisado pelo Chat em commit imutável.

Exaustividade aqui significa cobertura de caminhos de decisão estaticamente
alcançáveis. Não significa enumerar valores infinitos nem todas as combinações
matemáticas de entrada equivalentes.

## Frentes paralelas

| Frente | Escopo | Artefato |
|---|---|---|
| WhatsApp e conversa | eventos, áudio, estados, handlers, Gemini e respostas | `docs/audit/workstreams/2026-07-18-whatsapp-conversation-paths.md` |
| Web, Google e lifecycle | startup, dashboard, OAuth, Google, usuário/admin e scheduler | `docs/audit/workstreams/2026-07-18-web-google-lifecycle-paths.md` |
| Financeiro e analítico | writes, ledger, planner, consultas, planos, importação e Open Finance | `docs/audit/workstreams/2026-07-18-financial-analytical-paths.md` |
| Reconciliação central | alcance estático, suíte total, sobreposições e lacunas entre frentes | este documento |

## Inventário estático consolidado

Harness: `scripts/runExhaustiveRuntimeInventory.js`.
Teste: `tests/exhaustiveRuntimeInventory.test.js`.

Resultado sobre `src`:

- unidades JavaScript/MJS: `147`;
- runtime por `index.js`: `116`;
- somente roots operacionais do `package.json`: `24`;
- somente testes: `4`;
- não referenciadas: `3`;
- imports relativos não resolvidos em produto/scripts: `0`;
- imports dinâmicos não literais alcançáveis no runtime: `0`.

Módulos não referenciados:

- `src/handlers/debtUpdateHandler.js`;
- `src/utils/auth.js`;
- `src/utils/dateTimeNormalizer.js`.

Complementos que o grafo JS inicial não modelava e foram inspecionados
manualmente:

- sete migrações SQL carregadas por filesystem em
  `src/ledger/migrations/001...007`;
- dois listeners operacionais `SIGHUP`, nos runtimes do agente analítico e do
  command planner;
- quatro scripts rastreados não expostos no `package.json`:
  `previewDashboardV2.js`, `runCalendarSchedulerValidation.js`,
  `runFinancialQueryAcceptanceBattery.js` e
  `runWhatsappAnalyticalBatch.js`; os dois últimos podem executar baterias e o
  de Calendar/WhatsApp exige cuidado operacional;
- comandos PM2 e efeitos de processo não são inferidos integralmente pelo
  grafo de imports;
- `package.json` declara `pm2 start ecosystem.config.js`, mas esse arquivo não
  existe na tree auditada.

Contagem atual de testes:

- arquivos `*.test.js`: `111`;
- arquivos seguros descobertos pelo runner: `110`;
- E2E WhatsApp real excluído: `1`;
- arquivos listados pelo caminho padrão do `npm test`: `81`;
- arquivos citados por algum script npm: `85`;
- fora de todos os scripts npm: `26`;
- fora do caminho padrão: `30`.

`covering_test_count` no inventário significa apenas que o root de teste importa
estaticamente o módulo. Não prova que uma asserção exercita seu comportamento.

## Correção metodológica da bateria integrada

O primeiro resultado de `1.207` testes estava superestimado: o agregador
`openFinanceSandboxStaging.test.js` importa 18 arquivos que também eram
executados diretamente, somando 98 execuções duplicadas. O runner foi corrigido
com TDD para:

1. descobrir os 110 arquivos locais seguros;
2. executar 92 roots e carregar os 18 agregados uma única vez;
3. falhar fechado se TAP ou cobertura não puderem ser interpretados;
4. restaurar `state_store.json` e os logs locais após a bateria;
5. bloquear HTTP, HTTPS, fetch e sockets externos, permitindo apenas loopback;
6. listar nominalmente os testes skipados.

Resultado final deve ser lido como **execuções de testes**, não casos únicos:

- roots executados: `92`;
- arquivos agregados carregados: `18`;
- execuções: `1.114`;
- aprovadas: `1.109`;
- falhas/canceladas/todo: `0`;
- skips: `5`;
- linhas dos arquivos carregados: `88,42%`;
- branches dos arquivos carregados: `71,35%`;
- funções dos arquivos carregados: `89,02%`.

Os cinco skips são os cenários funcionais que podem resetar planilha:

- consentimento/onboarding/settings/dashboard;
- gastos/entradas/cartão parcelado;
- metas/dívidas/pagamentos/lembretes;
- análise/exclusão/admin/fallback;
- análise complexa com typos/contagens/duplicados/extremos.

A cobertura do Node inclui somente arquivos carregados. Ela não pode ser usada
como percentual de cobertura do produto inteiro. O bloqueio de rede prova que
a repetição final não contatou serviços externos; testes loopback continuam
permitidos para APIs locais.

## Veredito por workstream

| Frente | Caracterização | Conformidade | Achados principais |
|---|---|---|---|
| WhatsApp/conversa | `GO` | `NO-GO` | áudio antes dos gates, exceções fora do catch, estado órfão/sanitizado, lote parcial, invalidação desigual |
| Web/Google/lifecycle | `GO` | `NO-GO` | callback OAuth sem precedência, ausência de revogação, sagas/replay, fallback central, dashboard/scheduler com fonte vazia |
| Financeiro/analítico | `GO COM RESSALVAS` | `NO-GO` | semântica errada em dívidas, follow-up perde período, source health fraco, verifier superficial, writes compostos parciais |

Artefatos:

- `docs/audit/workstreams/2026-07-18-whatsapp-conversation-paths.md`;
- `docs/audit/workstreams/2026-07-18-web-google-lifecycle-paths.md`;
- `docs/audit/workstreams/2026-07-18-financial-analytical-paths.md`.

## Reconciliação das causas raiz

As listas das frentes se sobrepõem. A ordem abaixo consolida causas, não soma
achados como se fossem independentes.

### Críticas

1. **C-01 — dados de áudio saem antes de identidade, acesso, rate limit e
   filtro sensível** (`WCP-01`). Uma mensagem que seria descartada ainda pode
   ser baixada/transcrita externamente.
2. **C-02 — callback OAuth não preserva lifecycle** (`WGL-01`). Pode ativar
   status impeditivo, persistir credencial para usuário inexistente e
   ressuscitar conta inativada durante o fluxo.
3. **C-03 — não existe revogação OAuth individual operacional** (`WGL-02`).
   Inativar/bloquear/excluir não encerra credenciais, planilha ou Calendar.

### Altas

4. **H-01 — falha de fonte pode virar central fallback, `[]` ou zero real**
   (`WGL-05`, `WGL-09`, `FAP-AN-03`). Escopo e disponibilidade não falham
   fechados de maneira uniforme.
5. **H-02 — sagas externas não têm compensação/idempotência integral**
   (`WGL-03`, `WGL-04`, `WGL-07`). OAuth, planilha, membership e Drive podem
   divergir.
6. **H-03 — mutações financeiras compostas podem ficar parciais**
   (`WCP-04`, `FAP-WR-01..03`). Lote, parcelamento, meta e exclusão não têm um
   commit lógico comum em todas as rotas.
7. **H-04 — confirmação de escrita e leitura posterior não são causalmente
   alinhadas** (`WCP-06/07`, `FAP-WR-04/05`). Nem todo writer invalida o
   read-model e a projeção canônica não cobre update/delete.
8. **H-05 — consultas podem estar estruturalmente válidas e semanticamente
   erradas** (`FAP-AN-01/02/06/07`). Dívida, ranking e follow-up têm exemplos
   concretos.
9. **H-06 — verifier do agente não vincula integralmente afirmação ao plano e
   resultado** (`FAP-AN-04`). Presença do número não prova significado.
10. **H-07 — dashboard/rotinas expõem ou explicam dados com critérios
    inconsistentes** (`WGL-08/10/11`, `FAP-AN-05`).
11. **H-08 — gates administrativos/lifecycle possuem bypass ou cache obsoleto**
    (`WGL-06/12/13/14`).
12. **H-09 — exceções importantes escapam da resposta conversacional**
    (`WCP-02/05/10`).

### Médias sistêmicas

13. rate limit/filtro sensível não cobrem handlers anteriores (`WCP-08`);
14. caminhos mutantes mortos e undo isolado continuam compiláveis
    (`WCP-09`, `FAP-WR-06`);
15. consentimento/defaults/onboarding/jobs/admin têm commits ou estado volátil
    sem outbox/compensação (`WGL-15/16/19`);
16. boot, health, HTTP e recovery 401 não possuem prova/controle integral
    (`WGL-17/18/20`);
17. timezone e composer SQL ainda não são uniformes (`FAP-AN-08/09`).

## Inventário de entrypoints e efeitos

| Classe | Entry points inventariados | Estado |
|---|---|---|
| Processo | `index.startBot`, `SIGINT`, `SIGTERM`, dois `SIGHUP`, watchdog/exit WhatsApp | caracterizado; boot composto sem prova integral |
| WhatsApp | `message`, `ready`, `qr`, `loading_screen`, `change_state`, `authenticated`, `auth_failure`, `disconnected`, backfill | caracterizado; vários eventos só por inferência/doubles |
| HTTP | dashboard v1/v2, health, OAuth start/callback | caracterizado; sem browser/serviço real nesta rodada |
| Scheduler | nove cron families e read-model sync | caracterizado; overlap/restart/outbox não provados |
| Timers | dedup TTL, pending admin, receipt, watchdog, restart | caracterizado; parte somente em memória |
| Operacional | scripts npm, quatro scripts rastreados externos ao npm, PM2 | inventariado; efeitos reais não executados |
| Persistência | Sheets, Calendar, Drive, SQLite stores, JSONL, state store, migrações SQL | caracterizado; serviços reais deliberadamente fora do gate |

## Avaliação da definição operacional de exaustividade

| Critério | Resultado |
|---|---|
| módulos `src` classificados | satisfeito para JS/MJS; sete SQL listados separadamente |
| entradas/eventos/rotas/crons/timers/comandos | satisfeita por inventário central + workstreams, com lacunas explícitas |
| guards, efeitos, erros e cobertura | satisfeita no nível de caminho material; não significa combinação infinita |
| prova ou lacuna explícita | satisfeita; inferência não foi promovida a execução real |
| todos os testes locais seguros juntos | satisfeita, deduplicada e com rede externa bloqueada |
| serviços reais separados | satisfeita; nenhuma nova execução real foi feita |
| pacote final em commit imutável revisado pelo Chat | **pendente** |

## Veredito geral

- **Caracterização ampla dos caminhos:** `GO COM RESSALVAS`.
- **Conformidade do produto aos invariantes declarados:** `NO-GO`.
- **Autorização para deploy/rollout:** `NO-GO`.
- **Fechamento independente da auditoria:** pendente somente do commit
  sanitizado imutável e revisão final do Chat exigidos pelo contrato.

Isto não significa que “o bot inteiro está quebrado”. Significa que a bateria
verde comprova muitos controles locais, mas não neutraliza as causas críticas e
altas acima. Corrigir por contagem de testes seria uma conclusão errada.

## Ordem de correção após o gate independente

1. `C-01`: mover descarte/acesso/rate limit/filtro antes de qualquer áudio/LLM.
2. `C-02/C-03`: lifecycle OAuth causal + revogação/recovery individual.
3. `H-01`: eliminar fallback central inseguro e representar fonte indisponível.
4. `H-05/H-06`: corrigir contrato semântico de consultas e fortalecer verifier.
5. `H-03/H-04`: commit composto, dirty/sync centralizado e projeção corretiva.
6. `H-07/H-08`: dashboard, scheduler, admin e token/lifecycle.
7. demais altas; depois médias, remoção de mortos e simplificação.

O próximo ponto de implementação anterior à auditoria (`FLOW-01`) não deve ser
retomado automaticamente: a nova priorização mostra blockers anteriores mais
graves. Após o review independente, abrir pacotes pequenos na ordem acima,
mantendo produto e deploy congelados até cada gate.
