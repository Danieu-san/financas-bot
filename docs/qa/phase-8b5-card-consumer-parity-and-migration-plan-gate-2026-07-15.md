# Fase 8B.5 - paridade e plano de migracao dos consumidores de cartao

Data: 2026-07-15

## Veredito

`GO de caracterizacao e planejamento` para iniciar uma migracao reversivel do
read-model. `NO-GO` para canario amplo, remocao de abas, remocao de fallback ou
promocao da fonte.

## Resultado principal

A comparacao inicialmente retornou paridade com zero linhas. Esse resultado foi
rejeitado como paridade vazia e o gate passou a exigir amostra populada. A
auditoria completa encontrou:

- fonte central: `EMPTY_SAMPLE`, zero linha nos dois modelos;
- 3 escopos pessoais ativos e acessiveis na EC2;
- 2 escopos pessoais com dados;
- 76 linhas unificadas validas;
- zero linha unificada invalida;
- zero erro de fonte;
- zero escrita;
- projecao legada pessoal nao filtra o cartao solicitado;
- projecao legada pessoal nao preserva `card_id`/nome do cartao;
- veredito agregado: `GAP_DOCUMENTED`.

Isso demonstra que os dados atuais vivem no modelo pessoal unificado e que o
adaptador de leitura legado e apenas uma compatibilidade parcial. Ele nao pode
ser usado como prova de paridade por cartao.

## Implementacao

Commit de codigo: `39441f5` (`feat: planejar migracao das rotas de cartao`).

- consumidor allowlisted propagado pelo contexto de Google Sheets;
- atribuicao para read-model, scheduler, WhatsApp, dashboards, Fases 6A-6C e
  manutencao;
- escrita em lote de manutencao passou a ser observavel;
- consumidor `card_parity_audit` e separado e excluido da metrica de uso real;
- relatorio de uso v2 agrega somente rotas/consumidores abstratos;
- comparador multiconjunto reutiliza os normalizadores do read-model;
- duplicatas sao preservadas na comparacao;
- paridade vazia retorna `EMPTY_SAMPLE`;
- script real le central e escopos pessoais, sem publicar identidade, nome de
  cartao, descricao, valor, linha ou fingerprint.

## Evidencia local

- contratos finais de paridade/telemetria: `15/15`;
- bateria focada dos consumidores: `85/85`;
- Fase 6A: `17/17`;
- Fase 6B: `41/41`;
- Fase 6C: `8/8`;
- Fase 6D: `5/5`;
- Fase 6E: `5/5`;
- baseline principal: `864/864`;
- sintaxe, JSON e `git diff --check`: verdes.

O PC local nao tinha OAuth pessoal disponivel: 3 ativos, zero escopo acessivel.
Mesmo assim, a sonda sintetica registrou `GAP_DOCUMENTED` sem inventar
paridade. A evidencia de dados pessoais foi obtida somente na EC2.

## Deploy e producao

- fast-forward de `a150f55` para `39441f5`;
- backup `.env.pre-8b5-<timestamp>` antes do restart;
- `APP_COMMIT_SHA=39441f5`;
- remoto focado `15/15`;
- PM2 online, WhatsApp/bot/cron prontos;
- health `ok=true`, `sqlite=true`;
- heartbeat gravado e zero linha de telemetria invalida;
- worktree rastreado limpo.

Relatorio de uso desde o deploy, excluindo o proprio auditor:

| Consumidor | Eventos | Reads | Writes |
| --- | ---: | ---: | ---: |
| `read_model_service` | 5 | 5 | 0 |
| `maintenance_service` | 4 | 4 | 0 |

Rotas: 1 leitura unificada, 8 legadas, zero escrita. O read-model executou uma
leitura unificada e quatro legadas; a manutencao executou quatro legadas.

## Plano por consumidor

| Consumidor | Estado atual | Destino | Acao/rollback |
| --- | --- | --- | --- |
| read-model | le unificada + quatro legadas; prefere unificada quando populada | unificada primeiro | 8B.6 por flag; fallback legado imediato |
| manutencao | quatro leituras legadas centrais; amostra central vazia | estrutura unificada escopada | manter ate gate proprio; sem remocao |
| scheduler mensal | rota legada estatica; sem evento na janela curta | leitura unificada escopada | migrar depois do read-model; testar ciclo mensal |
| WhatsApp analitico/exclusao | caminhos mistos e fallback | unificada por escopo | migrar ramo por ramo, preservando precedencia |
| dashboards v1/v2 | leitura pessoal unificada | manter | apenas observar; v1 continua rollback |
| handlers 6A-6C | leitura/escrita unificada | manter | telemetria atribuida; sem mudanca funcional |
| auditor de paridade | read-only, excluido de adocao | QA | nunca conta como uso real |

## Inteligencia da decisao

As oito leituras legadas nao significam oito conjuntos de dados legados. A
fonte central esta vazia e os 76 registros validos estao na estrutura pessoal
unificada. O risco real e de roteamento: consumidores ainda invocam adaptadores
que, no escopo pessoal, perdem a identidade do cartao. A primeira migracao deve
ser o read-model porque ele ja prefere a saida unificada; deixar de buscar as
quatro rotas legadas quando a unificada esta populada reduz ambiguidade sem
mudar o resultado financeiro.

## Proximo gate

`8B.6 - read-model unified-first`:

1. flag fail-closed por consumidor;
2. unificada populada evita as quatro leituras legadas;
3. unificada ausente/vazia conserva fallback legado;
4. mesmas entradas canonicas antes/depois;
5. rollback testado;
6. zero escrita e nenhuma remocao.
