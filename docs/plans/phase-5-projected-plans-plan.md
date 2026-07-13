# Plano de execução da Fase 5 - Planos projetados

Data de abertura: 2026-07-13

Este documento detalha a execução da Fase 5 já definida em
`family-financial-platform-step-by-step-roadmap.md`. Ele não redefine fases, não
cria uma fase intermediária e não antecipa escrita da 5C.

## Objetivo e limites

Evoluir metas, dívidas, financiamentos e consórcios para planos auditáveis sem
quebrar comandos atuais.

Dentro da Fase 5:

- 5A define contrato, identidade, adapters, projetor puro e restore/paridade;
- 5B calcula cronogramas e simulações sem gravar fatos;
- 5C adapta escritas atuais com recibo, idempotência e reconciliação;
- 5D comprova paridade, rollback, privacidade e zero duplicação.

Fora desta fase: promoção ou remoção do dashboard legado, OCR/comprovantes,
investimentos e remoção ampla de caminhos antigos.

## Reconciliação da auditoria externa

Itens aceitos:

- `plan_id` e `movement_id` não dependem de nomes editáveis;
- valores financeiros usam centavos inteiros;
- movimentos persistidos representam somente fatos realizados;
- projeções e simulações nunca entram em `plan_movements`;
- ausência de fonte permanece nula/parcial, nunca zero inventado;
- associações legadas ambíguas falham explicitamente;
- contrato comporta meta, dívida, financiamento e consórcio sem inventar taxa,
  amortização ou prazo;
- backup/restore valida integridade por checksum;
- visão pública remove identidade, referência legada e chave de operação.

Ajustes após inspeção do repositório:

- o caminho novo de `debt.pay` já possui `operation_key`, recibo e replay
  seguro; o caminho legado ainda ativo e as metas precisam ser unificados na
  5C;
- a deduplicação em memória do WhatsApp não substitui idempotência durável;
- a política atual de meta familiar permite mutação por membros do domicílio e
  não exige confirmação conjunta; mudar essa política exige decisão de produto;
- o simulador de avalanche não é usado em respostas reais e não é autoridade
  para o cronograma da 5B.

## 5A - Contrato comum de planos

### Contrato interno v1

`plans` contém:

- `plan_id` determinístico a partir de referência legada estável;
- versão, tipo, escopo, status, nome e moeda;
- domicílio e proprietário internos;
- valores em centavos;
- termos temporais, juros e amortização quando observados;
- estado da fonte e da identidade;
- política explícita de mutação pessoal/familiar.

`plan_movements` contém:

- `movement_id`, `plan_id` e `operation_key`;
- tipo, estado realizado e status do fato;
- valor e saldos anterior/posterior em centavos;
- datas do fato, efeito e competência;
- ator, eventual reversão e referência de origem.

### Primeira fatia concluída localmente

- contrato puro `projected-plan-v1`;
- adapters das abas `Metas`, `Dívidas` e `Movimentações Metas`;
- identidade estável quando a origem fornece `legacy_ref` e identidade
  `provisional` quando existe apenas número da linha;
- renomear com a mesma referência não altera `plan_id`;
- conflito de metas homônimas não associa movimento automaticamente;
- tipos `goal`, `debt`, `financing` e `consortium`;
- projetor puro e visão pública sanitizada;
- backup/restore portátil com checksum;
- nenhuma alteração de comando, Sheets, SQLite, dashboard ou produção.

### Trabalho restante dentro da 5A

1. Definir a persistência de `plans`, `plan_movements` e versões no shadow.
2. Criar uma referência legada persistente para substituir identidade por
   número de linha; identidade provisória não autoriza cutover nem escrita.
3. Fazer dry-run read-only sobre uma fotografia real sanitizada de metas,
   dívidas e movimentos e registrar conflitos.
4. Validar backup/restore do armazenamento persistente junto dos dados legados.
5. Provar que metas e dívidas atuais aparecem como views equivalentes, sem
   mudar os comandos existentes.

Gate final da 5A: nenhuma identidade ambígua é promovida; valores equivalentes
são idênticos em centavos; restore recompõe contrato e histórico; comandos
atuais permanecem inalterados.

## 5B - Cronograma e simulação mensal

- cálculo determinístico por tipo de plano;
- datas de fato, efeito, competência e vencimento separadas em
  `America/Sao_Paulo`;
- ordem explícita de juros, custos, principal e arredondamento;
- resultados rotulados como realizado, projetado ou simulado;
- fonte insuficiente produz `partial`/`unavailable` e lista premissas ausentes;
- simulação nunca grava ledger, Sheets ou `plan_movements`.

Gate: simulação e histórico real permanecem separados e reproduzíveis.

## 5C - Movimentos com escrita confiável

- adaptar todos os comandos atuais de meta e dívida, inclusive caminhos
  legados ainda ativos;
- confirmar campos críticos e efeito contábil antes de salvar;
- recibo durável, `operation_key`, retry/restart e reconciliação de falha
  parcial;
- controle de concorrência por plano;
- correção/cancelamento por reversão vinculada, sem apagar fato confirmado;
- classificação determinística de aporte, retirada, principal, juros e taxas;
- dual projection em shadow somente após gate e flag próprios.

Gate: zero renda/despesa duplicada e zero segundo movimento em replay.

## 5D - Gate de saída

GO exige:

- igualdade exata em centavos entre superfícies equivalentes;
- zero duplicação, fato crítico omitido, quebra de comando ou acesso cruzado;
- nenhuma fonte ausente apresentada como zero;
- meta, dívida, financiamento e retirada cobertos;
- retry, restart, concorrência, reversão, fonte parcial e restore cobertos;
- rollback separa leitura e escrita e nunca apaga fatos válidos;
- marcador produtivo removido sem resíduos.

