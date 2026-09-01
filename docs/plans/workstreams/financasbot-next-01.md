# NEXT-01 — Esqueleto isolado do FinançasBot Next

Atualizado em: 2026-09-01
Estado: `CANDIDATO — VALIDAÇÃO LOCAL VERDE; AUDITORIA INDEPENDENTE PENDENTE`
Predecessor ratificado: `f8137f0396fcdf41b1a3e2535040f663c4ed171a`
Roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`
Ratificação: `financasbot-next-00-architecture-ratification-v1.md`

## Objetivo material

Construir o menor esqueleto isolado capaz de executar conversa sintética,
follow-up versionado e falha fechada, sem rede, writer, adapter real ou dados
privados. O esqueleto deve tornar executáveis as fronteiras congeladas no
NEXT-00 sem antecipar o primeiro vertical financeiro do NEXT-02.

NEXT-01 não parte do zero. Ele preserva e reaproveita comportamento comprovado
do FinançasBot v1 quando esse comportamento passa pelos contratos novos e por
testes de conformidade. Código incidental, autoridades antigas e acoplamentos
do legado não são portados por conveniência.

## Escopo

1. topologia isolada de módulos/workspace do Next;
2. interfaces tipadas do Tool Gateway e do kernel, ainda sem fonte real;
3. schemas e tipos derivados dos contratos ratificados do NEXT-00;
4. ledger/event store vazio, com armazenamento local hermético e nenhuma
   ingestão externa;
5. catálogo e policy de tools read-only; writers ausentes ou bloqueados;
6. memória de sessão versionada, com CAS e contexto explícito de follow-up;
7. orçamento de tools e política fail-closed;
8. observabilidade sanitizada, sem payload financeiro bruto;
9. runner de replay sintético sem rede;
10. mapa de reaproveitamento do v1 com evidência de conformidade por ativo;
11. testes focais para conversa simples, follow-up, falha fechada e zero writer.

## Reaproveitamento obrigatório e seletivo do v1

O primeiro trabalho técnico é confrontar os candidatos abaixo com os contratos
do Next. Reaproveitamento não significa copiar arquivos integralmente: pode ser
extração de algoritmo, adaptação atrás de interface nova ou uso como fixture e
oracle de comportamento.

### Candidatos prioritários

- `AST-01` — `FinancialQueryPlan` e planejamento estruturado de consulta;
- `AST-02` — fachada semântica de leitura;
- `AST-03` — verificação de evidência, sem autoridade quantitativa própria;
- `AST-04` — projetor de ledger, inicialmente contra ledger vazio;
- `AST-11` — fixtures e conversas sintéticas;
- `AST-12` — ADR-002 de acesso financeiro administrativo, `PORT_AS_IS`;
- `AST-13` — timezone canônico, `PORT_AS_IS`;
- `AST-15` — suíte de regressão como fonte de comportamento esperado;
- capacidades `CAP-01`, `CAP-13`, `CAP-14`, `CAP-25A`, `CAP-26`, `CAP-29` e
  `CAP-30`, conforme a matriz de cutover.

### Protocolo de aceitação

Cada ativo recebe uma decisão registrada:

`PORT_AS_IS | WRAP | ADAPT | EXTRACT_BEHAVIOR | REWRITE | DEFER | DO_NOT_PORT`.

Uma decisão positiva exige:

1. contrato do Next que o ativo satisfaz;
2. dependências e autoridade removidas ou encapsuladas;
3. teste de conformidade focal;
4. ausência de acesso real, writer e fallback silencioso;
5. justificativa de por que reutilizar reduz risco ou custo.

Sem essa evidência, o ativo não entra no esqueleto.

### Proibições herdadas

Continuam proibidos todos os itens `DNP-01..DNP-12`, especialmente handler
monolítico, estado conversacional em memória como verdade, múltiplos cérebros,
Sheets como autoridade, writer genérico, acesso admin amplo, fallback silencioso,
logs brutos e auto-write.

## Não escopo

- WhatsApp, Pluggy, Google, Sheets, Calendar, OCI ou qualquer adapter real;
- credenciais, OAuth real, sessões, dados financeiros reais ou produção;
- writer, notificação, scheduler, commit de proposta ou efeito externo;
- cálculo completo de gasto por categoria, reservado ao NEXT-02;
- migração, shadow, canário, cutover ou alteração do legado produtivo;
- implementação completa do grafo de provenance além do necessário para provar
  as interfaces e fronteiras do esqueleto.

## Invariantes

1. zero rede e zero writer durante todos os testes do gate;
2. ledger começa vazio e nenhuma projeção pode virar observação;
3. identidade, escopo, autorização e matemática nunca pertencem ao modelo;
4. memória de sessão é explícita, versionada e rejeita estado obsoleto;
5. tools são fachadas tipadas; nenhuma tool genérica cria semântica financeira;
6. falha de evidência, escopo, coverage ou budget termina fail-closed;
7. logs guardam IDs e estados sanitizados, nunca payload financeiro bruto;
8. `R`, `I`, `M`, `L` e `T` permanecem canais disjuntos, e `E` permanece
   reservado às arestas do grafo;
9. regras de família e administração são aplicadas server-side conforme ADR-002;
10. reutilização preserva comportamento válido, não autoridade ou arquitetura
    incidental do legado;
11. nenhum item `DO_NOT_PORT` pode aparecer no grafo de dependências do Next;
12. qualquer dependência externa não prevista causa falha do teste hermético.

## Entregáveis

1. mapa de topologia e dependências do esqueleto;
2. relatório de conformidade e decisão dos ativos v1 candidatos;
3. interfaces/schemas tipados do gateway, sessão, ledger vazio e catálogo;
4. policy read-only e prova estrutural de zero writer;
5. armazenamento local hermético para sessão/ledger vazio;
6. observabilidade sanitizada e budget/failure policy;
7. runner de replay sintético com tripwire de rede;
8. casos focais executáveis de conversa simples, follow-up e falha fechada;
9. relatório final, commit sanitizado imutável e auditoria independente.

## Ordem de execução

1. mapear topologia e candidatos de reaproveitamento;
2. criar testes RED das fronteiras antes do código funcional;
3. implementar interfaces e storage mínimos;
4. ligar sessão, catálogo/policy, observabilidade e replay;
5. executar somente testes focais durante a implementação;
6. quando o candidato estiver estável, executar uma única suíte hermética ampla;
7. revisar diff, publicar SHA imutável e obter auditoria independente;
8. somente após GO técnico e decisão humana avaliar abertura do NEXT-02.

## Critérios de GO

1. uma conversa sintética simples atravessa o gateway sem rede;
2. follow-up restaura estado versionado e rejeita versão obsoleta;
3. ausência, inconsistência ou budget excedido produz falha fechada;
4. ledger permanece vazio antes de qualquer evento sintético explícito;
5. catálogo executável contém somente capacidades read-only autorizadas;
6. prova estrutural e dinâmica confirma zero writer e zero efeito externo;
7. tripwire confirma zero acesso de rede;
8. todo código v1 reutilizado possui decisão e teste de conformidade;
9. nenhum item `DO_NOT_PORT` foi incorporado;
10. observabilidade está sanitizada;
11. suíte focal e suíte hermética ampla final estão verdes;
12. auditoria independente do SHA imutável não encontra lacuna indispensável.

## Condições de parada

Parar diante de necessidade de fonte real, credencial, writer, alteração do
legado, acesso de produção, nova autoridade semântica, fallback silencioso,
dependência não hermética ou reaproveitamento sem contrato/teste de conformidade.

## Evidência executável vigente

O esqueleto mínimo está implementado sob `src/next/` sem import direto do
runtime v1. A bateria focal cobre 18 propriedades e está verde:

- query plan e Model Data Boundary recursiva;
- Tool Gateway read-only, escopo confiável e output allowlisted;
- catálogo de rotas declarando métrica e filtros materiais;
- SessionState explícito com CAS e rejeição de campo arbitrário;
- claim tipado ligado a entidade, período, time basis, coverage e evidence;
- ledger vazio sem writer;
- observabilidade sanitizada;
- tool budget soft/hard, repetição, timeout, paralelismo, rodadas,
  esclarecimentos e recomposição;
- replay sintético inicial e follow-up com restauração de contexto;
- scope divergente, claim de outra família, coverage incompleta, versão obsoleta
  e budget ausente/excedido falhando fechados;
- tripwire de `fetch` e módulos de rede;
- manifesto executável de reaproveitamento e boundary física do Next.

O runner atual é deliberadamente um tripwire em processo para o corpus
sintético; ele não é alegado como sandbox de rede do sistema operacional nem
como prova contra uma capability de rede capturada antes da execução. Nenhuma
dessas capabilities é aceita pelo grafo de dependências do esqueleto.

### Suíte ampla

A primeira execução ampla revelou uma integração de inventário do novo teste e
sete testes legados envelhecidos. Daniel autorizou estabilizar esse baseline
antes da execução final, sem alterar produto ou produção.

As correções foram causais e restritas a testes:

- o entrypoint `tests/financasBotNext01.test.js` registra os módulos de casos
  Next sem criar execução duplicada;
- fixtures Open Finance passaram a injetar de forma completa o relógio já
  previsto pelos stores, em vez de misturar julho de 2026 com o relógio real;
- o teste do watcher usa somente o Git local auditado em uma raiz temporária
  controlada; o tripwire libera exclusivamente `init`, `add .gitignore` e
  `ls-files --others --ignored` nessa fixture, sem rede ou comando genérico.

A única suíte hermética ampla final do candidato terminou em:

- `1.922` testes;
- `1.912` passes;
- `0` falhas;
- `10` skips esperados e `0` todo;
- coverage: linhas `91,81%`, branches `75,03%`, funções `91,26%`;
- `176` arquivos de teste descobertos e `158` entrypoints executados;
- tripwire local válido, sem rede nem subprocesso fora da allowlist auditada.

O relatório completo está em
`docs/plans/workstreams/financasbot-next-01-final-validation-v1.md`.

## Próxima ação exata

Publicar um commit sanitizado imutável e submetê-lo à auditoria independente do
Chat. NEXT-01 não fecha e NEXT-02 não abre antes de parecer auditável e decisão
humana explícita. Não criar adapter, writer, modelo ou integração real.
