# Camada de confiabilidade de interpretacao

Atualizado em: 2026-06-13

## Problema

O bot financeiro nao pode depender apenas do LLM para interpretar mensagens que escrevem dados. O LLM pode ajudar com linguagem natural, mas campos criticos de escrita precisam ser extraidos, canonicalizados e validados por codigo antes de qualquer append, update ou delete.

## Objetivo

Criar uma camada model-independent que:

- extraia campos deterministicamente quando possivel;
- use Gemini apenas para lacunas;
- canonicalize aliases e categorias;
- valide conflitos;
- decida entre executar, confirmar, perguntar ou bloquear;
- execute escritas com idempotencia e recibo;
- registre telemetria sanitizada em shadow mode.

## Pipeline alvo

```text
Mensagem/audio
-> Security Gate
-> Extrator deterministico
-> Gemini somente para lacunas
-> Canonicalizacao
-> Validacao cruzada
-> Decisao de risco
-> Confirmacao/esclarecimento quando necessario
-> Executor idempotente
-> Recibo estruturado
-> Read-model/dashboard
```

## Contratos

### InterpretationCandidate

```js
{
  operation: 'expense.create',
  fields: {
    amount: {
      value: 25,
      source: 'deterministic',
      assurance: 'verified',
      evidence: 'money_pattern'
    }
  },
  conflicts: [],
  missingFields: [],
  itemCount: 1
}
```

Fontes permitidas:

- `deterministic`
- `user_state`
- `llm`
- `inferred`

Garantias permitidas:

- `verified`
- `supported`
- `ambiguous`
- `missing`

### InterpretationDecision

```js
{
  action: 'execute',
  reasons: [],
  clarificationFields: [],
  preview: 'expense.create - R$ 25,00 - PIX'
}
```

Acoes permitidas:

- `execute`
- `confirm`
- `clarify`
- `block`

### FinancialWriteEnvelope

```js
{
  operationKey: 'hash',
  actorScope: { userHash: 'hash', scope: 'personal' },
  operation: 'expense.create',
  payload: { sheetName: 'Saidas', rowFingerprint: 'hash' },
  provenance: { messageIdHash: 'hash' },
  validationVersion: 'interpretation-reliability-v1'
}
```

O envelope nao pode conter mensagem financeira bruta, telefone, `user_id`, `sheet_id`, token, URL privada ou prompt interno. Valores e descricoes sao armazenados como hash quando necessarios para auditoria/reconciliacao.

## Politica de decisao

Executar automaticamente somente quando:

- item unico;
- operacao allowlisted;
- escopo autorizado;
- campos criticos completos;
- campos criticos deterministicos ou vindos de estado do usuario e `verified`;
- existe um unico valor monetario inequivoco; frases com multiplos numeros sem marcador monetario exigem confirmacao/esclarecimento;
- sem conflito entre parser, estado e Gemini;
- chave idempotente livre;
- credito tem cartao e parcelas explicitos;
- transferencia tem tipo/direcao claros.

Confirmar quando:

- todos os campos existem, mas algum campo critico depende de LLM ou inferencia;
- a mensagem veio do master LLM e resultaria em escrita financeira;
- operacao e sensivel;
- ha lote, importacao, exclusao, correcao, meta, divida, conta, lembrete ou possivel duplicidade.

Perguntar quando:

- falta campo critico;
- parser e LLM discordam;
- escopo, valor, data, pagamento, cartao, parcelas ou alvo e ambiguo;
- Gemini esta indisponivel, invalido ou sem quota.

Bloquear quando:

- ha prompt injection, falso admin, bypass, escopo nao autorizado ou pedido de dado interno;
- operacao viola invariantes financeiros ou de privacidade.

## Campos criticos

Sempre criticos:

- operacao;
- valor;
- usuario/responsavel/escopo;
- tipo/direcao do movimento.

Criticos por operacao:

- gasto em credito: cartao e parcelas;
- transferencia: origem/destino ou tipo;
- meta/divida/conta: alvo;
- exclusao/correcao: item alvo;
- importacao: origem, tipo de extrato e proprietario quando houver familia.

## Componentes implementados nesta etapa

- `src/reliability/deterministicExtractor.js`
  - detecta operacoes e campos basicos sem Gemini;
  - nao trata nomes pessoais como familia sem aliases autorizados.
- `src/reliability/interpretationReliability.js`
  - canonicalizacao;
  - decisao de risco;
  - aliases de pagamento/transferencia;
  - sanitizacao de telemetria.
- `src/reliability/financialWriteLedger.js`
  - ledger SQLite de operacoes de escrita;
  - estados `pending`, `committed`, `uncertain`, `failed`;
  - envelopes sanitizados.
- `src/reliability/reliabilityTelemetry.js`
  - shadow telemetry opt-in;
  - allowlist por operacao;
  - JSONL sanitizado.
- `src/reliability/enforceReadinessMonitor.js`
  - avalia se o shadow tem evidencia suficiente para revisao manual de `enforce`;
  - nao altera flags, nao escreve dados financeiros e nao executa a camada em modo `enforce`.
- `src/reliability/enforceReadinessNotifier.js`
  - envia alerta sanitizado somente aos admins configurados;
  - deduplica alertas de prontidao e de divergencia critica em estado local sem dados financeiros.
- `src/reliability/interpretationReliabilityAcceptance.js`
  - 340 casos offline executaveis para aceite.
- `scripts/runInterpretationReliabilityAcceptanceBattery.js`
  - runner standalone da bateria IRAB.
- `scripts/reportInterpretationEnforceReadiness.js`
  - comando local para emitir o relatorio de prontidao do shadow.

## Integracoes aplicadas

- Appends no contexto de mensagem usam operation key automatica e ledger quando possivel.
- Append financeiro nao faz retry cego por padrao.
- Updates no contexto de mensagem usam operation key automatica e ledger quando possivel.
- Update financeiro `committed` e idempotente por replay; update `pending/uncertain` so reconcilia quando a linha atual ja tem exatamente o valor esperado, senao bloqueia para evitar restaurar valor antigo.
- Deletes no contexto de mensagem usam operation key automatica e ledger quando possivel.
- Delete financeiro nao faz retry cego; replay `committed` retorna recibo idempotente e replay `pending/uncertain` bloqueia em vez de arriscar apagar linha deslocada.
- Importacoes confirmadas usam operation key estavel por item importado, derivada de campos canonicos do item e do indice no arquivo. Isso permite repetir a confirmacao sem duplicar linhas e preserva compras legitimamente iguais dentro do mesmo arquivo.
- Escrita derivada do master LLM exige confirmacao antes de salvar.
- Parcelas de lote sao mapeadas deterministicamente; item nao mapeado pergunta de novo.
- `parseAmount` e `parseDate` nao chamam Gemini para campos criticos.
- Preview de confirmacao mostra reserva/familia como `Transferencia` quando o destino real e a aba `Transferencias`.
- QA failure log guarda `message_ref` e tamanho, nao mensagem financeira textual.

## Flags

- `INTERPRETATION_RELIABILITY_MODE=off|shadow|enforce`
- `INTERPRETATION_RELIABILITY_OPERATIONS=expense.create,income.create`
- `INTERPRETATION_RELIABILITY_TELEMETRY_PATH=data/interpretation-reliability-shadow.jsonl`
- `INTERPRETATION_RELIABILITY_ALERTS_ENABLED=true|false`

Padrao: `off`.

## Shadow mode

No modo `shadow`:

- a camada avalia campos e decisao;
- o fluxo atual continua respondendo;
- nenhuma chamada Gemini adicional e feita;
- nenhuma escrita financeira adicional e feita;
- a telemetria guarda apenas hashes, fontes, garantias, operacao, decisao, motivos e comparacao sanitizada com o fluxo atual.

No modo `enforce`:

- somente operacoes presentes em `INTERPRETATION_RELIABILITY_OPERATIONS` sao controladas;
- allowlist ausente nao habilita nenhuma operacao em `enforce`;
- `execute` permite seguir;
- `confirm` exige confirmacao explicita do usuario;
- `clarify` exige completar o campo critico ausente;
- `block` interrompe o fluxo;
- operacoes fora da allowlist preservam o comportamento atual;
- a ativacao inicial cobre apenas gasto/entrada unitarios fora do credito. Credito, transferencias, lotes, audio, importacao e demais mutacoes exigem pacotes proprios antes de entrar na allowlist. A protecao idempotente de importacao ja existe, mas nao significa que importacao esteja liberada para `enforce`.

## Monitor de prontidao para enforce

O bot possui um observador local para o shadow mode, executavel por:

```bash
npm run report:interpretation-readiness
```

Ele le `data/interpretation-reliability-shadow.jsonl` ou o caminho configurado em `INTERPRETATION_RELIABILITY_TELEMETRY_PATH` e aplica gates de seguranca antes de qualquer discussao sobre `enforce`.

O monitor verifica:

- pelo menos 50 decisoes reais em `shadow`;
- janela minima de 14 dias desde a primeira decisao observada;
- pelo menos 10 decisoes para cada operacao obrigatoria inicial (`expense.create` e `income.create`);
- zero divergencia critica entre o fluxo atual e a decisao da camada de confiabilidade;
- zero linha de telemetria invalida.
- pelo menos 99,5% de alinhamento operacional dos candidatos a auto-save;
- zero caso ambiguo observado sendo auto-gravado;
- zero chamada Gemini adicional causada pela camada;
- evidencia de latencia em todas as decisoes e p95 de avaliacao local de no maximo 50 ms.

O alinhamento operacional compara a decisao da camada com o controle aplicado pelo fluxo atual. Ele nao prova sozinho que a interpretacao financeira esta semanticamente correta. O monitor nunca altera `INTERPRETATION_RELIABILITY_MODE`, nunca escreve dados financeiros e nunca habilita `enforce` sozinho. Quando todos os gates passam, a recomendacao e apenas `manual_review_for_enforce`; a troca para `enforce` continua exigindo bateria offline, revisao humana, configuracao reversivel, smoke dedicado e rollback por flag.

O scheduler executa o observador diariamente as 09:15 no fuso `America/Sao_Paulo`. Ele permanece silencioso enquanto nao houver condicao de alerta. Quando o shadow estiver pronto para revisao manual, envia uma unica mensagem aos admins configurados. Se surgir divergencia critica, envia um alerta de bloqueio e volta a avisar somente quando a contagem de divergencias criticas aumentar. O estado de deduplicacao fica em `data/interpretation-reliability-alert-state.json` e guarda apenas tipo, chave e data do ultimo alerta.

## Rollout recomendado

1. Manter `off` por padrao no deploy inicial.
2. Ativar `shadow` apenas para `expense.create,income.create`.
3. Observar pelo menos 50 decisoes reais sanitizadas por 14 dias.
4. Rodar `npm run report:interpretation-readiness`.
5. Exigir zero divergencia critica inexplicada e recomendacao `manual_review_for_enforce`.
6. Fazer revisao humana antes de qualquer alteracao de flag.
7. Ativar `enforce` apenas para operacoes candidatas a auto-save.
8. Expandir para credito, transferencias, lotes, audio, importacao, metas, dividas, contas, exclusao e correcao.

## Nao fazer

- Nao enviar planilha inteira ao Gemini.
- Nao aceitar metadados internos de confiabilidade, identidade ou escopo vindos do JSON do Gemini.
- Nao escolher silenciosamente o primeiro numero de uma frase como valor financeiro.
- Nao deixar Gemini calcular saldo, total, percentual, ranking, fatura, orcamento, meta ou divida.
- Nao transformar erro de Gemini em default financeiro.
- Nao registrar mensagem financeira crua em log, estado, QA log, ledger ou telemetria.
- Nao usar `all_users` ou admin como escopo financeiro de escrita.
- Nao repetir append financeiro sem idempotencia ou reconciliacao.
