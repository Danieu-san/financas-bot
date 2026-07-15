# Fase 8B.9 - caracterizacao dos consumidores WhatsApp de cartao

Data: 2026-07-15

## Veredito

`GO de producao para instrumentacao e observacao`. `NO-GO` para mudar os
caminhos de importacao, exclusao ou manutencao, remover fallback/aba, ou iniciar
a 8C antes da janela minima de cartoes.

## Inventario comprovado

| Consumidor | Tipo | Fonte atual | Decisao |
| --- | --- | --- | --- |
| Orcamento mensal | read-only | unificada primeiro; legado somente quando a unificada nao tem linhas | manter rota; atribuir `whatsapp_budget` |
| Exportacao 6B | read-only | `Lancamentos Cartao` pessoal | ja unificada; atribuir `whatsapp_export` |
| Analitico pessoal | read-only | `Lancamentos Cartao` pessoal | ja unificado; manter |
| Importacao/deduplicacao | preview que governa escrita posterior | unificada e quatro nomes legados em paralelo | observar como `whatsapp_import_dedup`; nao migrar sem paridade de duplicatas |
| Exclusao | mutavel e dependente de indice | `Saidas`, unificada e legado condicional | observar como `whatsapp_deletion`; exigir fixture/revalidacao/rollback proprio |
| Manutencao em lote 6A | mutavel com preview/checksum | `Saidas` e unificada | ja unificada; manter gate 6A |

A projecao pessoal de um nome legado para a aba unificada nao preserva a
identidade do cartao solicitado. Por isso, retirar as quatro leituras da
deduplicacao pode mudar a classificacao `matched`/`possible_duplicate`, e mudar
a exclusao pode deslocar indices de linha. Nenhum desses riscos foi aceito
nesta fatia.

## Implementacao

- commit principal `fca78931c9794463868a9cf639c64f68eac64a78`;
- hotfix de schema `6b449d82ae61ec93b2e4abe16d8c7199211fae0a`;
- consumidores sanitizados adicionados ao schema duravel e ao relatorio;
- nenhuma mensagem, telefone, valor, cartao, planilha, linha ou payload e
  persistido;
- comportamento de leitura, fallback, filtro, preview, confirmacao e escrita
  permaneceu inalterado.

O primeiro deploy revelou que o agregador reconhecia os novos rotulos, mas o
schema central ainda os converteria para `unknown`. O gate detectou a lacuna,
o hotfix atualizou a allowlist e um teste passou a exigir o rotulo persistido.

## Evidencia

- testes focados finais: `14/14`;
- suite integral repetida depois do hotfix: `887/887`, com pretests 6A-6E;
- testes remotos finais: `14/14`;
- probe controlado: evento unificado `whatsapp_budget`, heartbeat ativo, zero
  leitura de dado financeiro e zero escrita;
- relatorio desde o deploy final: `OBSERVING`, 1 heartbeat, 10 eventos, zero
  linha invalida, 5 leituras unificadas, 4 legadas e zero escrita;
- o evento `whatsapp_budget` do recorte e prova controlada, nao adocao real;
- health `ok=true`, `sqlite=true`; PM2 online no hash `6b449d8`.

## Inteligencia da decisao

O menor consumidor read-only, orcamento, ja era unified-first; exportacao e
analitico pessoal tambem ja usam a fonte unificada. Alterar suas respostas nao
traria migracao adicional. O ganho seguro era separar seus eventos do rotulo
generico `message_handler` e tornar observaveis os caminhos sensiveis antes de
qualquer mudanca. Importacao e exclusao permanecem bloqueadas porque uma leitura
aparentemente inocente governa deduplicacao ou indice de escrita.

## Janela e proximo gate

A janela duravel comecou em 2026-07-14. Para cartoes, a auditoria exige dois
fechamentos ou pelo menos 60 dias, alem de instrumentacao continua. Assim, a 8C
nao pode usar ausencia de eventos antes de 2026-09-12 como prova de uso zero.
Mesmo depois, cada item sera apenas candidato a remocao.

Proximo passo: manter a 8B.9 em observacao, confirmar heartbeat/retencao e
classificar eventos reais por consumidor. Nao ha smoke manual de WhatsApp
pendente e nenhuma remocao esta autorizada.
