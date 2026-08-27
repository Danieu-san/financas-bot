# ROAD-01.1 — inventário consumer-first de schema e identidade

Data: 2026-08-27
Branch: `chat/financial-roadmap-road01-20260827`
Base de entrada: `9ea7906e16c0639681e9cf9437bcef8a9ef92eda`
Contrato comum: `docs/specs/financial-semantic-convergence-contract-v1.md`
Status: `ROAD-01.1 COMPLETE — STATIC INVENTORY`

> Este documento descreve o snapshot Git. Planilhas reais antigas não foram lidas nem migradas nesta etapa. `CURRENT_CODE` não significa que todos os dados existentes possuem o schema atual.

## 1. Schema de template atual

| Aba | Template atual | Identidade/escopo | Drift relevante |
| --- | --- | --- | --- |
| `Saídas` | A:K — Data, Descrição, Categoria, Subcategoria, Valor, Responsável, Pagamento, Recorrente, Observações, user_id, Conta Financeira | `user_id` J; Conta Financeira K | maintenance antigo ainda lê A:J; planilha real antiga pode ter K sem header |
| `Entradas` | A:J — Data, Descrição, Categoria, Valor, Responsável, Recebimento, Recorrente, Observações, user_id, Conta Financeira | `user_id` I; Conta Financeira J | maintenance antigo ainda lê A:I; planilha real antiga pode ter J sem header |
| `Transferências` | A:I | `user_id` I | alinhado no snapshot principal |
| `Cartões` | A:G — card_id, Nome, Banco, fechamento, vencimento, Ativo, Observações | `card_id` A | labels não podem substituir ID |
| `Lançamentos Cartão` | A:J — Data, Descrição, Categoria, Valor Parcela, Parcela, Mês de Cobrança, card_id, Cartão, Observações, user_id | `card_id` G; display H; `user_id` J | **não possui Subcategoria estruturada**; H ainda carrega labels incompatíveis |
| `Contas` | A:I | `user_id` D | linhas sem user_id são excluídas por readers escopados; tratar como migração de dado, não permissão |
| `Contas Financeiras` | A:I | `user_id` H | readers atuais esperam A:I |
| `Faturas` | summary | fórmula atual agrupa H + F | **P0 identidade:** agrupa display label, não `card_id` |
| `Parcelamentos` | summary | fórmula atual agrupa B + H + C | label de cartão participa da identidade e não existe schedule ID; semântica ampla fica ROAD-02 |

## 2. Matriz consumer → schema → identidade → risco

| Consumer | R/W | Fonte/range atual | Assunção de identidade/schema | Compat/fallback | Risco ROAD-01 | Teste alvo |
| --- | --- | --- | --- | --- | --- | --- |
| `userSpreadsheetService` template | W/template | headers acima | posição fixa por template | cria abas ausentes; não prova schema de aba já existente | HIGH: template novo ≠ planilha antiga | fixture de headers v1/v2 e repair plan dry-run |
| `buildInvoiceSummaryRows` | W/fórmula | `Lançamentos Cartão!A2:J` | `group by H,F` | nenhum catálogo de card_id | **P0**: um `card_id` com dois labels vira duas faturas | duas labels, mesmo card_id => um grupo |
| `buildInstallmentSummaryRows` | W/fórmula | `A2:J` | agrupa B,H,C | summary legado | HIGH identidade; semântica de schedule deferida ROAD-02 | labels variam, não criar compra duplicada |
| `messageHandler.buildCreditCardOptionsForUser` | R | `Cartões!A:G` em personal sheet | lê `card_id` e label | central `creditCardConfig` se sem personal sheet | bom ponto de catálogo; precisa ser origem do display | card_id estável com aliases de label |
| `messageHandler.saveCreditCardExpense` | W | legacy `cardInfo.sheetName` | escreve linha A:G virtual; `sheetName=Cartão ${label}` | `google.js` traduz para unified A:J | **P0/P1**: H recebe legacy sheetName, produz `Cartão X` em vez do label catalogado; subcategoria é perdida | writer deve persistir card_id + display catalogado + subcategory quando schema suportar |
| `messageHandler` import de cartão | W | `cardInfo.sheetName` + `buildImportedCreditCardRow` | parcela default `1/1`; usa cardInfo | mesma tradução de legacy sheet | identidade de display sofre mesmo drift; metadata de parcela é ROAD-02 | import não muda card_id/display por alias |
| `google.mapRowForUserSpreadsheet` | adapter W | legacy `Cartão ...` -> `Lançamentos Cartão` A:J | G = option cardId ou derivado do sheetName; H = **sheetName** | mantém virtual legacy API | HIGH: adapter perpetua label `Cartão ...`; derivar card_id por nome é fallback frágil | cardId fornecido vence sempre; display vem catálogo, não sheetName |
| `google.mapValuesFromUserSpreadsheetRange` | adapter R | unified A:J -> virtual A:G | expõe J como antigo user_id G | legacy compatibility | necessário até migrar consumers; não retirar agora | round-trip por versões |
| `readModelService` | R | Saídas A:K, Entradas A:J, cartões/config | índices atuais; account K/J | SQLite/memory/read-model | alinhado para account; card identity precisa ser conferida nos agregadores | fixtures old/new header sem deslocamento |
| `userSheetAnalyticsService` | R | canonical tabs | Saídas account K, Entradas J; card `card=row[7]||row[6]` | personal sheet source | HIGH: representação pública prefere label; sem subcategoria de cartão | card object carrega card_id separado; label só display |
| `financialPersonalSheetSemanticAdapters` | R | snapshot de analytics | consome totais/transactions já materializados | baseline ARQ | herda identidade/schema do analytics; não corrigir isoladamente | adapter não deve inventar identidade própria |
| `openFinanceRuntimeReconciliation` | R | Saídas A:K; Entradas A:J; Transferências A:I; Lançamentos Cartão A:J; Cartões A:G; Contas Financeiras A:I | card_id G, card_name H; account K/J | unavailable fail-closed | schema atual alinhado; não há subcategory de cartão | old/new schema via mapper explícito |
| `financialExportHandler` | R | Saídas A:K; Entradas A:J; Cartão A:J | fixed indices | nenhum fallback de schema | card export usa H como `Conta`, não card_id; card subcategory vazio | export preserva display e stable ID internamente sem expor ID se UX não pedir |
| `financialExportService` | R/format | source specs | Saídas subcat D/account K; Entradas account J; cartão account H, subcategory null | — | comprova ausência de subcategoria estruturada no cartão | novo schema não desloca user_id/card fields |
| `userIdMaintenanceService.validateUserIdIntegrity` | R | Saídas A:J; Entradas A:I; legacy cards A:G; unified card A:J em mode canary/on | ranges antigos deliberados | legacy fallback | MEDIUM: não observa novas colunas K/J, porém user_id continua no mesmo índice; não deve ser usado como schema validator | separar user-id integrity de schema integrity |
| `userIdMaintenanceService.backfillMissingUserIds` | **W** | mesmos tracked ranges | infere owner por texto/card sheet/single user | batch + row fallback | HIGH se usado como “repair” genérico; cartões são compartilhados e nome não é autorização | não executar automaticamente; classificação explícita antes de backfill |
| `scheduler` | R | Sheets + canonical card entries/read model | user scoped; São Paulo runtime | legacy reads ainda coexistem | precisa tolerar schema sem assumir coluna nova como presente | focal scheduler com old/new fixtures |
| `Faturas` sheet formula | R derivado | H/F/D/A | display label como identidade | nenhum | **P0** atual e comprovado | card_id G group + lookup display |
| `Parcelamentos` sheet formula | R derivado | B/H/C/D/A | descrição+label+categoria | nenhum | HIGH identidade; redesign de obrigação fica ROAD-02 | separar correção de ID da semântica de schedule |

## 3. Achados classificados

### P0 — identidade de fatura por label

`Faturas` agrupa `H` (`Cartão`) e `F` (`Mês de Cobrança`). O contrato ROAD-K0 define `card_id` como identidade. Portanto duas labels para G igual são contabilmente a mesma entidade, mas a fórmula atual cria grupos distintos.

Correção ROAD-01 deve fazer a agregação por `card_id` e competência; o label deve ser resolvido para apresentação pelo catálogo `Cartões`. ROAD-02 continuará responsável por decidir se a competência está confirmada/projetada.

### P0/P1 — writer cria drift de display

Em personal sheet, `buildPersonalCreditCardOptionsFromRows` constrói `cardInfo.cardId` a partir da coluna A, mas também `sheetName: Cartão ${label}`. `saveCreditCardExpense` escreve por esse legacy sheet name; `google.mapRowForUserSpreadsheet` põe esse `sheetName` na coluna H. Resultado: a mesma identidade G pode coexistir com H `Nubank - Daniel` e H `Cartão Nubank - Daniel`.

Target: legacy routing pode continuar internamente, mas a linha unificada precisa receber **card_id estável + display catalogado** separadamente.

### P1 — subcategoria não existe em cartão

O template A:J não tem coluna de subcategoria. Writer, analytics, Open Finance reconciliation e export não podem preservá-la estruturalmente. A categoria pode ser detalhada na importação/interpretation, mas é descartada ao salvar cartão.

Target ROAD-01: versão de schema compatível acrescentando subcategoria sem deslocar silenciosamente campos em readers antigos. Ordem de colunas deve ser explícita e readers devem suportar v1/v2 por header/schema adapter.

### P1 — `Conta Financeira` é schema novo, manutenção ainda usa ranges antigos

Template/readers analíticos usam Saídas A:K e Entradas A:J, enquanto `userIdMaintenanceService` continua em A:J/A:I. Isso não quebra seu objetivo de user_id porque os índices permanecem J/I, mas comprova que ele não é um validador de schema completo.

Target: criar validação de schema independente; não ampliar maintenance antigo apenas para “parecer atual”.

### P1 — abas existentes não têm migração de header comprovada

`ensureUserSpreadsheetTabs` garante tabs e formatação/headers durante setup, mas a existência da aba não prova que uma planilha histórica possui todas as colunas atuais. Qualquer repair precisa primeiro identificar a versão real, sem sobrescrever colunas desconhecidas.

### P1 — recorrências sem `user_id` são problema de dado, não de autorização

Readers escopados devem continuar fail-closed. Uma regra ativa sem `user_id` fica invisível ao usuário, mas liberar linhas vazias globalmente seria erro de segurança.

Target: fila de classificação/migração com owner/scope confirmado; nenhuma inferência por cartão compartilhado ou admin.

### P2 — timezone de spreadsheet não está congelado no resource de criação

O template mostrado não define `properties.locale/timeZone`. Código de scheduler e vários helpers usam `America/Sao_Paulo`; uma sheet criada/copied com timezone diferente pode produzir fórmulas/datas divergentes.

Target: definir contrato de criação/repair para `pt_BR` + `America/Sao_Paulo`, com migração de planilhas existentes somente após inspeção autorizada.

## 4. Limites entre ROAD-01 e ROAD-02/03

ROAD-01 corrige **identidade e shape**. Não deve redesenhar:

- precedência de fechamento real/fallback (`ROAD-02`);
- significado completo de `Mês de Cobrança` (`ROAD-02`);
- construção do schedule 6x e saldo restante (`ROAD-02`);
- refund/settlement semantics (`ROAD-03B`);
- saldo cumulativo/budget (`ROAD-03A`).

Assim, a fórmula de `Parcelamentos` pode receber stable card identity/compatibilidade em ROAD-01, mas sua substituição por schedule canônico pertence ROAD-02.

## 5. Ordem de migração proposta

1. **Schema reader/adapter v1/v2**: função comum de leitura por header/versão para Saídas, Entradas e Lançamentos Cartão; sem mudar planilha real.
2. **Card catalog resolver**: resolver `{card_id, display_name}` a partir de `Cartões`; legacy sheet name deixa de ser display persistido.
3. **Card writer compatível**: persistir ID + display canônico e preservar subcategoria no schema v2; v1 continua suportado durante transição.
4. **Faturas stable-ID-first**: agregar por card_id/competência e resolver label só no resultado visual.
5. **Analytics/export/Open Finance/read model**: consumir adapter comum e carregar `card_id/display/subcategory` separadamente.
6. **Schema health/repair dry-run**: identificar planilhas v1/v2 e gaps; nenhuma mutação sem evidência/autorizações do gate.
7. **Recurring blank-scope queue**: classificar linhas sem user_id; manter reads fail-closed.
8. **Timezone contract**: criação nova com timezone correto; reparo existente como migração controlada.

## 6. Bateria mínima antes de GO

- mesmo `card_id`, três labels diferentes => uma identidade e uma fatura;
- card writer personal-sheet => G ID estável e display catalogado, sem prefixo técnico;
- legacy `Cartão X!A:G` read/write round-trip continua compatível;
- Saídas v1 A:J e v2 A:K não deslocam `user_id`; v2 preserva Conta Financeira;
- Entradas v1 A:I e v2 A:J idem;
- Lançamentos Cartão v1 A:J e v2 com subcategoria preservam card_id/display/user_id;
- export/read model/analytics/Open Finance consomem as duas versões sem perda silenciosa;
- `user_id` vazio continua excluído dos reads escopados;
- repair identifica mismatch sem escrever por padrão;
- nenhuma regra restringe cartões compartilhados por titular;
- nenhuma alteração de competence/closing é feita por ROAD-01.

## 7. Gate para implementação

ROAD-01.1 está completo. O próximo passo material é criar o adapter/schema contract e testes focais antes de tocar writers. Como isso será mudança funcional de código, deverá ter bateria local e, ao candidato estável, auditoria independente em **conversa limpa do Chat** por hash imutável.