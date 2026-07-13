# Gate 4E - Saída da Fase 4

Data: 2026-07-13

## Decisão atual

`GO local` para a implementação e a bateria da 4E.

`NO-GO de produção` até concluir commit/push, deploy EC2 e smoke remoto. Esse estado provisório não
autoriza iniciar a Fase 5.

## Escopo executado

1. Paridade entre fotografia de Sheets, ledger/Query Engine, dashboard atual,
   dashboard v2 e formatação do WhatsApp.
2. Invariantes de orçamento por categoria com compra no cartão, pagamento de
   fatura, recorrência liquidada, reembolso, transferência neutra e importação
   reconciliada.
3. QA visual real em desktop e celular.
4. Rollback isolado do dashboard v2 por `DASHBOARD_V2_ENABLED=false`.
5. Auditoria da matriz do benchmark com classificação adotado, adiado ou
   descartado.
6. Verificação de privacidade, escopo e ausência de IDs internos nas superfícies
   públicas.

Ficaram fora do escopo: planos da Fase 5, manutenção/OCR da Fase 6,
investimentos da Fase 7 e remoção de legado da Fase 8.

## Evidência automatizada

- TDD do rollback começou RED nos três contratos e terminou GREEN:
  link autenticado, página/API e comando do WhatsApp.
- Bateria final de rollback + contratos + unidade + paridade: `208/208`.
- Paridade 4E, orçamento por categoria e composição do dashboard v2: `20/20`.
- Privacidade/segurança/read-model/ledger: `79/79`.
- Suíte completa após incluir `phase4ExitGate.test.js` no comando padrão:
  `792/792`.
- `git diff --check`: limpo.
- `package-lock.json`: sem alteração; nenhuma dependência foi adicionada ou
  atualizada.
- `npm audit --audit-level=high`: `0` vulnerabilidades.

## Paridade das superfícies

O teste `phase4ExitGate.test.js` parte de uma única fotografia representando a
fonte Sheets, passa pelos valores verificados do ledger/Query Engine e confirma:

- dashboard atual preserva saldo econômico e disponível da fotografia;
- dashboard v2 usa os mesmos saldos, competência, orçamento e forecast;
- WhatsApp apenas formata os mesmos KPIs, sem recalcular;
- os planos realmente consultados são `expenses`, `budget`, `accounts`,
  `forecast` e `quality` nas operações aprovadas.

Fonte ausente continua `unavailable`; não é transformada em zero.

## Invariantes de orçamento

A bateria canônica provou que:

- compra no cartão conta uma vez;
- pagamento da fatura é movimento neutro para o orçamento;
- ocorrência recorrente liquidada não vira gasto livre duplicado;
- reembolso reduz o gasto da categoria sem ultrapassar o original;
- transferência interna é neutra;
- item importado reconciliado não duplica o lançamento manual;
- categoria sem alocação não é tratada como orçamento zero.

## QA visual

Prévia local validada no navegador em:

- desktop `1440 x 900`: quatro cards essenciais alinhados, sem overflow
  horizontal;
- celular `390 x 844`: cards em coluna única, filtros legíveis, tabela contida
  e sem overflow horizontal.

O DOM confirmou todas as regiões, critérios de origem, qualidade e aviso de
versão experimental. A prévia temporária foi encerrada e o viewport restaurado.

## Rollback

Com `DASHBOARD_V2_ENABLED=false`:

- `/dashboard` permanece `200`;
- `/dashboard/v2` retorna `404`;
- `/dashboard/api/v2/summary` retorna `404` antes de consultar dados;
- `dashboard v2` no WhatsApp emite link da versão atual com aviso explícito;
- auditoria registra o caminho e a versão efetivamente entregues.

A ausência da variável equivale a `true` para não desligar a v2 já implantada.
Produção deve manter o valor explícito `true`; rollback exige `false` e restart
PM2 com `--update-env`.

## Benchmark

`docs/specs/dashboard-v2-coverage-matrix.md` agora classifica os itens das duas
auditorias obrigatórias:

- adotado: núcleo contábil, cockpit, orçamento, faturas, projeções, qualidade,
  explicabilidade e conversa verificada;
- adiado: planos, manutenção em lote, XLS/XLSX, OCR/comprovantes, exportação,
  tour, investimentos, bloco histórico e Open Finance;
- descartado: cópia visual/literal, web obrigatória, float, recorrência
  pré-criada, transferência de uma ponta, IA sem preview, bloqueio total por
  pendência e expansão para assistente geral.

## Privacidade e resíduos

- Dashboard v2 continua sem seletor de usuário e rejeita escopo cruzado mesmo
  com token admin.
- `DASHBOARD_ADMIN_ALL_USERS_ENABLED` permanece ausente/falso no fluxo normal.
- Nenhum dado financeiro real, token, telefone ou ID interno foi gravado na
  evidência.
- O arquivo do roadmap já alterado pelo usuário e os arquivos antigos não
  rastreados não pertencem à 4E e devem permanecer fora do commit.

## Gate restante para produção

1. Commitar apenas os arquivos da 4E e enviar ao GitHub.
2. Fazer backup e deploy fast-forward na EC2, com
   `DASHBOARD_V2_ENABLED=true` explícito.
3. Rodar testes remotos focados, audit `high`, health, estado, PM2/WhatsApp e smoke das rotas.
4. Confirmar `dashboard` e `dashboard v2` pelo WhatsApp e então decidir GO final
   para abrir a Fase 5.
