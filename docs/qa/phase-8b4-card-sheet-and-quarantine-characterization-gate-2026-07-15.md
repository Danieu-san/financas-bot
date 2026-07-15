# Fase 8B.4 - caracterizacao de abas de cartao e modulos em quarentena

Data: 2026-07-15

## Veredito

`GO de observacao` para manter a telemetria em producao e preparar migracao
controlada. `NO-GO` para remover abas, fallbacks ou modulos.

## Escopo executado

- classificacao logica de acessos a cartao em rota unificada ou legada;
- instrumentacao central de leitura, append, update e delete em Google Sheets;
- persistencia somente no schema allowlisted da telemetria 8B.0;
- relatorio agregado sem nome de aba, cartao, pessoa, ator ou sessao;
- busca de consumidores em runtime, testes, scripts, templates e formulas;
- classificacao dos modulos antes colocados em quarentena.

Nenhum fluxo financeiro, flag de fonte, planilha, formula ou dado foi alterado.

## Evidencia arquitetural

### Abas de cartao

- `Lancamentos Cartao` e a estrutura unificada dos templates de usuario.
- `Faturas` e `Parcelamentos` dependem por formula da estrutura unificada.
- O read-model, analytics, scheduler, importacao, exportacao, manutencao em lote
  e exclusao ainda possuem caminhos logicos legados.
- A rotina antiga de estrutura ainda preserva templates de abas legadas.
- O fluxo de exclusao usa a rota unificada primeiro e conserva as abas antigas
  como fallback quando nao encontra candidatos.

Portanto, a estrutura unificada e o destino atual, mas as rotas antigas ainda
sao dependencias de runtime/rollback. Existencia estrutural nao e prova de uso
zero, e o pos-deploy confirmou uso real.

### Modulos em quarentena

| Modulo | Consumidor encontrado | Classificacao 8B.4 |
| --- | --- | --- |
| `debtUpdateHandler` | teste de seguranca/log; nenhum import produtivo | quarentena/test-support |
| `debtAvalancheService` | `financialExplainability.test.js` | QA/test-support |
| `financialHealthService` | `financialExplainability.test.js` | QA/test-support |

Ausencia de import produtivo nao autoriza exclusao: os artefatos preservam
capacidades e cobertura explicativa. Uma remocao futura exige decisao de produto
e substituto comprovado.

## Implementacao e privacidade

Commit de codigo: `a150f55` (`feat: medir rotas de abas de cartao`).

O evento persiste somente:

- consumidor `sheets_runtime`;
- handler `google_sheets`;
- rota abstrata `card_sheet_access`;
- operacao `read` ou `write`;
- motivo `card_sheet_unified_route` ou `card_sheet_legacy_route`;
- resultado `partial`, pois mede invocacao logica e nao confirma efeito
  financeiro.

Nomes de aba/cartao/pessoa sao usados apenas para classificar em memoria e nao
sao enviados ao gravador. Ator e sessao seguem HMAC rotativo da 8B.0. O relatorio
publica somente contagens agregadas e sempre retorna `removal_candidate=false`.

## Gates locais

- telemetria e relatorios: `11/11`;
- consumidores Google/Sheets ampliados: `239/239`;
- Fase 6A: `17/17`;
- Fase 6B: `41/41`;
- Fase 6C: `8/8`;
- Fase 6D: `5/5`;
- Fase 6E: `5/5`;
- baseline principal: `861/861`;
- sintaxe, JSON e `git diff --check`: verdes.

## Deploy e evidencia de producao

- fast-forward de `a28f9f8` para `a150f55`;
- backup `.env.pre-8b4-<timestamp>` criado antes do restart;
- `APP_COMMIT_SHA=a150f55`;
- teste remoto focado: `11/11`;
- PM2 online, WhatsApp pronto, bot pronto e cron inicializado;
- health: `ok=true`, `sqlite=true`;
- arquivo de telemetria em modo `600`;
- heartbeat de autodiagnostico gravado;
- zero linha invalida.

Relatorio desde o deploy:

| Rota | Eventos | Leituras | Escritas |
| --- | ---: | ---: | ---: |
| unificada | 1 | 1 | 0 |
| legada | 8 | 8 | 0 |

Veredito agregado: `OBSERVING`. Os eventos ocorreram naturalmente na
inicializacao; nenhum smoke de leitura foi fabricado e nenhuma escrita ocorreu.

## Inteligencia da decisao

Oito leituras legadas imediatamente apos o restart eliminam a hipotese de que
as abas/caminhos antigos sejam codigo morto. A leitura unificada confirma que os
dois modelos coexistem. O proximo passo seguro e medir paridade e migrar um
consumidor por vez, mantendo fallback e rollback; remocao agora produziria risco
real de perda de cobertura.

## Janela e proximo gate

A observacao especifica de cartoes iniciou em 2026-07-15. Uso zero somente pode
ser avaliado depois de dois fechamentos ou pelo menos 60 dias, com todos os
pontos de entrada instrumentados. Mesmo assim, o item vira apenas candidato a
8C.

Proximo passo: `8B.5 - paridade e plano de migracao dos consumidores de cartao`,
read-only, sem remover abas ou desligar fallbacks.
