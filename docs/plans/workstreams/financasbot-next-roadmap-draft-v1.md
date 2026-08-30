# Roadmap do novo FinançasBot — draft v1

Data: 2026-08-30
Status: `DRAFT_AWAITING_INDEPENDENT_REVIEWS_AND_USER_DECISION`
Produto temporário: `FinançasBot Next`
Legado: FinançasBot atual, mantido operacional e sem alterações por este plano

## 1. Decisão de produto proposta

Construir um novo FinançasBot em paralelo, aproveitando capacidades comprovadas
do produto atual, mas sem transportar sua arquitetura conversacional, seus
fallbacks cruzados ou seus estados implícitos.

O novo produto terá:

1. uma única IA como cérebro conversacional;
2. ferramentas financeiras pequenas, tipadas, observáveis e combináveis;
3. um núcleo determinístico para identidade, escopo, cálculos e verdade
   financeira;
4. writers determinísticos, separados por operação, sempre protegidos por
   preview, confirmação, idempotência, recibo e reconciliação;
5. ingestão Open Finance proativa, com detecção de itens ainda não registrados;
6. memória explícita de conversa e follow-up, sem depender de estados ocultos
   distribuídos pelo handler;
7. migração gradual, com o bot atual preservado até o cutover comprovado.

Este draft não autoriza implementação, acesso a produção, dados privados,
credenciais, escrita financeira, deploy ou retirada do bot atual.

## 2. Por que reconstruir

Os ciclos recentes demonstraram que corrigir componentes isolados não elimina
erros emergentes causados pela composição do sistema:

- múltiplos classificadores, planners, agentes, verificadores e fallbacks podem
  competir pela mesma mensagem;
- regras financeiras aparecem em código, planilha, prompts, adapters e
  formatadores, sem uma autoridade única;
- identidade textual de cartão/conta pode divergir da identidade contábil;
- disponibilidade, coleção vazia e zero podem ser confundidos;
- resposta natural pode ser rejeitada por verificadores excessivamente ligados
  ao formato de uma consulta específica;
- limites rígidos de tools podem impedir uma resposta que exigiria composição;
- testes focais verdes não garantem o comportamento emergente da conversa
  completa;
- o custo de demonstrar ausência de regressão cresce a cada novo fallback.

O aprendizado preservado é que a IA responde melhor quando pode investigar a
pergunta com contexto e operações adequadas. O código deve garantir verdade e
segurança, não tentar antecipar todas as frases do usuário.

## 3. Princípios não negociáveis

### 3.1 Liberdade da IA com autoridade limitada

A IA pode interpretar, perguntar, planejar, selecionar e combinar quantas
operações de leitura forem necessárias dentro de um orçamento configurável de
tempo, passos e custo. Não haverá limite semântico arbitrário de três tools.

O runtime mantém limite de segurança contra loops, repetição e custo sem valor.
Ao atingir o limite, a IA deve responder com a evidência disponível ou pedir a
informação indispensável; nunca inventar.

A IA não pode:

- resolver `user_id`, `family_id`, `account_id`, `card_id` ou permissões;
- calcular ou corrigir silenciosamente valores financeiros finais;
- declarar zero quando a fonte estiver ausente ou incompleta;
- executar escrita sem o protocolo determinístico correspondente;
- ampliar o escopo familiar ou administrativo;
- transformar projeção em realizado;
- ocultar divergência entre fontes.

### 3.2 Código como plataforma de operações

O código fornece operações simples e semanticamente estáveis. A IA compõe as
operações; não existe um fluxo determinístico diferente para cada possível
pergunta.

Cada ferramenta declara:

- nome, versão e domínio;
- schema de entrada e saída;
- autorização necessária;
- natureza `read`, `prepare_write` ou `commit_write`;
- fonte e provenance;
- período, cobertura e `as_of`;
- estados `available`, `empty`, `zero`, `incomplete` e `unavailable`;
- efeitos colaterais esperados;
- idempotência e timeout;
- dados permitidos para observabilidade.

### 3.3 Uma verdade financeira, várias fontes

Planilha, Pluggy/Open Finance e dados internos são fontes, não significados
concorrentes. Um kernel financeiro determinístico normaliza eventos e responde
às operações sem depender do texto do usuário.

Devem permanecer distintos:

- conta e cartão;
- compra, parcela e fatura;
- pagamento de fatura e despesa;
- transferência interna e receita/despesa;
- estorno, cashback e entrada comum;
- aplicado/resgatado em reserva e consumo;
- realizado, comprometido, projetado, estimado e indisponível;
- saldo bancário observado e saldo reconstruído;
- data da transação, competência, vencimento, liquidação e `as_of`.

### 3.4 Novo produto, migração por prova

Nada é portado apenas porque existe no legado. Cada componente recebe uma
classificação:

- `REUSE_AS_IS`: contrato e comportamento comprovados;
- `EXTRACT_AND_HARDEN`: lógica útil, removida de dependências legadas;
- `REIMPLEMENT_BEHIND_CONTRACT`: resultado desejado, implementação inadequada;
- `REFERENCE_ONLY`: serve como caso de teste ou aprendizado;
- `DO_NOT_PORT`: complexidade/fallback sem valor demonstrado.

## 4. Arquitetura alvo

```text
WhatsApp / futuro canal
        |
        v
Conversation Gateway
  identidade server-side, sessão, rate limit, entrega
        |
        v
Single Conversational Agent
  interpreta, planeja, chama tools, responde, mantém follow-up
        |
        +-----------------------+
        |                       |
        v                       v
Read Tool Gateway         Write Proposal Gateway
        |                 prepare -> preview -> confirm
        v                       |
Financial Truth Kernel          v
        |                 Deterministic Writers
        v                 commit -> receipt -> reconcile
Source Adapters                 |
Sheets | Pluggy | Ledger <------+
```

Componentes transversais:

- catálogo de entidades e aliases;
- ledger/event store canônico;
- política de fonte e reconciliação;
- memória conversacional explícita;
- observabilidade sanitizada;
- suíte de avaliação replayable;
- configuração e flags por capacidade, nunca por emaranhado de rotas.

## 5. Catálogo inicial de tools

O catálogo começa pequeno. Novas tools exigem necessidade demonstrada, não uma
nova formulação de pergunta.

### 5.1 Leitura

- `transactions.search`
- `transactions.summarize`
- `balances.get_as_of`
- `accounts.list`
- `cards.list`
- `card_statement.get`
- `installments.get_schedule`
- `budgets.get_cycle`
- `recurring.list`
- `income.summarize`
- `debts.get_status`
- `goals.get_status`
- `open_finance.unregistered_events`
- `financial_sources.get_coverage`

As operações podem devolver registros e agregados determinísticos. A IA decide
quais chamar e como explicar o resultado.

### 5.2 Escrita

Cada operação é um protocolo independente:

- `expense.prepare/commit`
- `income.prepare/commit`
- `transfer.prepare/commit`
- `card_expense.prepare/commit`
- `refund.prepare/commit`
- `recurring.prepare/commit`
- `open_finance_event.prepare/commit`

Não haverá uma tool genérica `write_financial_data`.

## 6. O que aproveitar do FinançasBot atual

### 6.1 Candidatos fortes a reaproveitamento

- conexão WhatsApp e recuperação de sessão, após teste isolado;
- integrações Google OAuth/Sheets e Pluggy, atrás de adapters novos;
- identificadores e configuração válidos de contas/cartões;
- regras familiares e escopo server-side;
- protocolos de preview, confirmação, idempotência e recibo já comprovados;
- detecção proativa e lista numérica de movimentações;
- conhecimento confirmado de categorias, estabelecimentos e recorrências como
  dados versionados, não regras soltas em prompts;
- infraestrutura OCI, empacotamento, health e rollback comprovados;
- Golden Sets, testes financeiros e falhas reais como corpus de regressão;
- contratos já sólidos para neutralidade de pagamento de fatura, transferência
  e reserva.

### 6.2 Reaproveitar somente atrás de contrato novo

- readers e writers de Sheets;
- reconciliação Open Finance;
- cálculo de orçamento, fatura, parcela e saldo;
- read-model/SQLite;
- importação de extratos;
- áudio e transcrição;
- dashboard;
- scheduler.

### 6.3 Não portar como arquitetura

- `messageHandler` monolítico;
- cadeias de classifier -> planner -> fallback -> outro agente;
- regras financeiras embutidas em prompts ou formatadores;
- identidade por nome de cartão, conta ou aba;
- múltiplas semânticas para a mesma métrica;
- fallback silencioso entre fontes;
- verificador que exige repetir a forma exata de uma leitura em vez de validar
  fatos e cobertura;
- estado conversacional distribuído e implícito;
- remoções de legado não demonstradas;
- telemetria que não altera decisão operacional.

## 7. Estratégia de dados

### 7.1 Ledger canônico

O novo bot deve possuir eventos financeiros canônicos com identidade estável,
provenance e vínculos de compensação. A Planilha pode continuar como interface
e destino compatível durante a migração, mas não define sozinha a semântica.

### 7.2 Catálogo de entidades

Contas, cartões e pessoas usam IDs internos estáveis. Nomes e descrições são
aliases de apresentação. Acesso familiar é policy; titularidade textual não é
autorização.

### 7.3 Cobertura e reconciliação

Toda resposta baseada em dados informa internamente cobertura, fonte e
completude. Divergências são reconciliadas por regras explícitas ou expostas ao
usuário; nunca corrigidas por palpite da IA.

### 7.4 Migração de histórico

O histórico existente não será reimportado diretamente no início. Primeiro o
novo modelo reproduz consultas em read-only. Migração ocorre depois de:

1. inventário por fonte;
2. deduplicação determinística;
3. reconciliação de identidades;
4. dry-run e fingerprint;
5. backup e rollback;
6. validação amostral e totais por período.

## 8. Estratégia conversacional

### 8.1 Uma sessão explícita

A memória guarda apenas contexto necessário e estruturado:

- sujeito/pessoa;
- período e base temporal;
- dimensão/filtro;
- entidades selecionadas;
- pergunta anterior e referências de follow-up;
- proposta de escrita pendente;
- evidências usadas.

Texto integral não deve ser a única memória. Reinício precisa restaurar estado
válido sem reexecutar efeitos.

### 8.2 Resposta baseada em evidência

A IA recebe resultados tipados, pode comparar várias leituras e produz uma
resposta natural. Um verificador leve confirma apenas invariantes críticos:

- escopo;
- números citados existem nos resultados;
- ausência/zero/completude;
- período e base temporal;
- nenhuma alegação contradiz provenance;
- nenhuma escrita ocorreu por uma rota read-only.

Ele não impõe frase, quantidade de itens ou estrutura textual específica quando
os fatos permanecem corretos.

### 8.3 Perguntas complexas

A IA pode decompor livremente uma pergunta em várias operações. Exemplos:

- comparar gasto de alimentação com o mês anterior;
- explicar por que o saldo caiu mesmo com salário;
- projetar o restante do ciclo sem contar transferências;
- relacionar aumento de fatura, parcelas e estornos;
- continuar com “e só da Thaís?” ou “e sem supermercado?”.

## 9. Salvamento proativo preservado

O monitor Open Finance continua sendo requisito do novo produto.

Fluxo alvo:

1. buscar eventos desde cursor durável;
2. normalizar e reconciliar com ledger/planilha;
3. classificar deterministicamente a natureza financeira;
4. agrupar somente itens realmente elegíveis;
5. numerar propostas por usuário/conversa;
6. permitir `sim` quando houver uma, e `1, 3`, `todas`, `nenhuma` quando houver
   várias;
7. preparar cada item selecionado;
8. pedir esclarecimento apenas para ambiguidade que muda o lançamento;
9. confirmar preview final;
10. gravar idempotentemente e reconciliar;
11. não reenviar item já visto, rejeitado, expirado ou registrado, salvo mudança
    material do evento bancário.

Compra em fatura aberta não será chamada de pendente apenas por estar em fatura
aberta. O estado depende do contrato real do provedor. Estornos e reversões são
eventos próprios.

## 10. Qualidade e observabilidade

### 10.1 Golden Conversation Set

Converter perguntas e falhas reais em casos sanitizados e permanentes:

- pergunta simples;
- investigação com múltiplas tools;
- follow-up;
- família/pessoa/cartão/conta;
- período e competência;
- saldo, orçamento, fatura e parcela;
- transferência, estorno e pagamento de fatura;
- fonte vazia, indisponível e incompleta;
- áudio;
- salvamento manual e proativo;
- restart, duplicidade e concorrência.

### 10.2 Métricas úteis

- resposta factual correta;
- cobertura suficiente;
- tools chamadas e repetidas;
- latência por etapa;
- clarificação necessária versus redundante;
- fallback explícito;
- falso zero;
- dupla contagem;
- proposta duplicada;
- writer sem confirmação;
- reconciliação divergente;
- custo por conversa.

Logs não armazenam conteúdo financeiro bruto, transcrição, tokens, IDs pessoais
ou payloads bancários.

### 10.3 Critério de regressão

Todo erro real confirmado cria um teste replayable antes da correção. Um gate
não fecha apenas porque o caso original passou: invariantes do domínio e
conversas vizinhas também precisam permanecer verdes.

## 11. Fases e gates

### NEXT-00 — Charter, baseline e fronteira com o legado

**Objetivo:** congelar o escopo do novo produto e impedir mistura acidental.

Entregas:

- mapa `reusar/extrair/reimplementar/referência/não portar`;
- Golden Conversation Set v1;
- inventário de acessos reutilizáveis sem copiar segredos;
- orçamento inicial de custo, latência e ferramentas;
- processo, banco, flags e diretórios separados;
- regra de convivência de uma única sessão WhatsApp produtiva.

**GO:** o novo produto pode ser iniciado sem alterar runtime, dados ou
credenciais do legado.

### NEXT-01 — Esqueleto isolado e contratos

**Objetivo:** criar aplicação mínima sem lógica financeira completa.

Entregas:

- gateway de conversa;
- tool protocol;
- envelope de evidência;
- catálogo de identidade/policy;
- memória conversacional persistente mínima;
- observabilidade sanitizada;
- simulador/replay sem rede.

**GO:** conversa sintética chama tools falsas, faz follow-up e não possui writer.

### NEXT-02 — Financial Truth Kernel mínimo

**Objetivo:** responder corretamente um domínio vertical completo.

Primeiro domínio sugerido: despesas liquidadas por período, pessoa, categoria,
conta e cartão, incluindo neutralidade de transferência e pagamento de fatura.

**GO:** respostas determinísticas reproduzem o Golden Set do domínio e
distinguem zero, vazio, incompleto e indisponível.

### NEXT-03 — Agente conversacional read-only

**Objetivo:** permitir interpretação livre e composição de tools sobre o kernel.

Entregas:

- planner/reasoner único;
- loop controlado de tools;
- follow-up;
- verificador mínimo de invariantes;
- respostas e clarificações naturais;
- comparação cega com ChatGPT analisando o mesmo snapshot autorizado.

**GO:** 100% dos invariantes críticos e qualidade superior ao bot legado no
corpus cego, sem efeitos colaterais.

### NEXT-04 — Adapters read-only reais

**Objetivo:** conectar cópias/read-only de Sheets, Pluggy e ledger legado.

Entregas:

- adapters separados;
- coverage/provenance;
- reconciliação e divergências;
- shadow sem resposta ao usuário.

**GO:** paridade factual por domínio e nenhuma leitura fora do escopo.

### NEXT-05 — Canal de teste e áudio

**Objetivo:** provar conversa completa fora do número produtivo.

Entregas:

- WhatsApp ou canal de teste isolado;
- entrega/retry/deduplicação;
- áudio -> transcrição -> mesma rota textual;
- restart e concorrência.

**GO:** texto, áudio e follow-up passam em E2E sem tocar o bot produtivo.

### NEXT-06 — Writers manuais por operação

**Objetivo:** habilitar primeiro writer com protocolo completo.

Ordem sugerida:

1. despesa manual;
2. entrada manual;
3. transferência;
4. cartão;
5. estorno/ajuste;
6. recorrência.

Cada writer possui gate independente. Nenhum herda GO de outro.

**GO por writer:** preview, confirmação, replay, concorrência, falha parcial,
recibo, reconciliação e rollback comprovados.

### NEXT-07 — Salvamento proativo Open Finance

**Objetivo:** portar o fluxo proativo como capacidade nativa do novo bot.

Entregas:

- cursor e identidade duráveis;
- reconciliação;
- agrupamento e menu numérico;
- ambiguidade antes da escrita;
- promoção de estado do provedor sem duplicar proposta;
- entradas, transferências, estornos, parcelas e reservas com semântica própria.

**GO:** eventos novos aparecem uma vez, itens já registrados não reaparecem e
escritas selecionadas reconciliam integralmente.

### NEXT-08 — Demais domínios financeiros

Migrar um domínio por vez:

- faturas e parcelas;
- orçamento livre e essencial;
- recorrências;
- dívidas e metas;
- importação;
- dashboard;
- scheduler.

Cada domínio passa por kernel -> tools -> agente -> shadow -> writer, quando
aplicável.

### NEXT-09 — Beta paralelo e cutover

**Objetivo:** substituir o legado somente após evidência comparativa.

Etapas:

1. replay histórico;
2. shadow real read-only;
3. canal de teste;
4. allowlist familiar;
5. writers individuais;
6. janela de estabilidade;
7. cutover da sessão WhatsApp;
8. legado em standby reversível.

**GO:** nenhuma regressão crítica, rollback ensaiado e confirmação do usuário.

### NEXT-10 — Retirada seletiva do legado

Somente após a estabilidade, arquivar componentes substituídos. Preservar
histórico, decisões e fixtures. Não apagar credenciais, dados ou infraestrutura
sem gate específico.

## 12. Dependências

```text
NEXT-00 -> NEXT-01 -> NEXT-02 -> NEXT-03 -> NEXT-04 -> NEXT-05
                                                     |
                                                     +-> NEXT-06
                                                     +-> NEXT-07
NEXT-06 + NEXT-07 -> NEXT-08 -> NEXT-09 -> NEXT-10
```

Writers podem evoluir por operação, mas nenhum cutover ocorre antes do caminho
read-only e do canal isolado estarem comprovados.

## 13. Itens explicitamente fora do escopo inicial

- multiusuário público;
- administração com acesso amplo a dados individuais;
- recomendações de investimento;
- patrimônio completo;
- PDF/imagem de extrato;
- auto-write sem confirmação;
- substituição imediata da planilha;
- redesign visual amplo do dashboard;
- retirada do legado durante construção inicial;
- uso simultâneo da mesma sessão WhatsApp por dois processos;
- migração de segredos para Git;
- treinamento de modelo próprio.

## 14. Segurança, privacidade e acessos

- reutilizar integrações não significa copiar segredos para o novo código;
- cada ambiente lê segredos do cofre/ambiente privado já autorizado;
- preferir credenciais de teste e permissões read-only durante NEXT-00..05;
- identidade e escopo sempre resolvidos server-side;
- nenhuma ferramenta retorna mais dados que o necessário;
- traces e fixtures são sanitizados;
- ações externas e produção continuam exigindo gates próprios;
- ADR-002 permanece obrigatório antes de qualquer expansão multiusuário.

## 15. Custo e escolha de modelo

O provedor do cérebro é substituível por contrato. A avaliação compara pelo
menos:

- qualidade no Golden Conversation Set;
- uso correto de tools;
- follow-up;
- latência;
- custo;
- structured outputs/tool calling;
- privacidade e retenção;
- estabilidade de API.

O modelo mais forte pode ser usado para planejamento/resposta complexa e um
modelo menor para tarefas simples, desde que exista um único agente lógico e a
troca não crie semânticas concorrentes. O primeiro MVP deve preferir uma única
configuração para facilitar medição.

## 16. Critérios globais de sucesso

1. Uma pergunta financeira não passa por cérebros concorrentes.
2. A IA pode combinar tools suficientes sem depender de fluxos por frase.
3. Valores finais e permissões são determinísticos.
4. Mesma pergunta, escopo e período produzem o mesmo fato em WhatsApp e
   dashboard.
5. Zero, vazio, incompleto e indisponível são distintos.
6. Transferência, pagamento de fatura, parcela e estorno não duplicam consumo.
7. Follow-ups preservam contexto correto e permitem alterar somente a dimensão
   pedida.
8. Nenhuma escrita ocorre sem protocolo do writer.
9. Eventos proativos aparecem uma vez e podem ser salvos com fluxo numérico.
10. Todo erro real vira regressão permanente.
11. O bot atual continua disponível até o cutover reversível.
12. Custos e latência são medidos por conversa e por capacidade.

## 17. Decisões ainda abertas para revisão

1. Novo repositório versus monorepo/workspace isolado.
2. Ledger novo como autoridade imediata ou espelho durante a transição.
3. Primeiro domínio vertical: despesas ou visão financeira completa mínima.
4. Canal de teste WhatsApp separado versus simulador até NEXT-05.
5. Banco local inicial: SQLite/PostgreSQL e estratégia de backup.
6. Provedor/modelo inicial do agente.
7. Limite operacional de tools, latência e custo por turno.
8. Estratégia de execução dos dois bots sem conflito de sessão.
9. Quais componentes recebem `REUSE_AS_IS` após inventário causal.
10. Critério temporal de estabilidade antes do cutover.

## 18. Gate atual deste draft

O único gate autorizado é a revisão arquitetural do documento.

Próxima sequência proposta:

1. revisão independente pelo Chat;
2. revisão independente pelo Claude usando o mesmo documento e perguntas;
3. reconciliação dos achados, sem decisão por maioria;
4. draft v2;
5. confirmação explícita do usuário;
6. somente então abrir NEXT-00.

