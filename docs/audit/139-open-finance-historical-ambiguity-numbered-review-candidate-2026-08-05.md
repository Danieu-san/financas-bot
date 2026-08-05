# RX-HIST-AMBIGUITY-REVIEW-01 - candidato de revisao numerada

Data: 2026-08-05

## Alcance

Este candidato fecha somente o nucleo local, cifrado e persistente da revisao
familiar das ambiguidades produzidas pelo RX historico. Ele nao envia mensagens,
nao integra ainda a entrada publica do WhatsApp, nao habilita salvamento e nao
altera planilha, ledger, Pluggy, flags ou producao.

## Contrato implementado

- somente os dois WhatsApps familiares autorizados podem abrir a revisao;
- as decisoes sao compartilhadas pelo casal, mas a navegacao e a selecao do
  item sao independentes por telefone;
- a caixa mostra no maximo quatro ambiguidades por pagina, sem duplicar o limite
  por destinatario;
- `sim` nunca resolve uma ambiguidade; item e resolucao exigem escolhas
  numeradas explicitas;
- colisao de parcela oferece separar os registros, manter exatamente um ou
  descartar todos; nenhuma opcao salva o lancamento;
- semantica de investimento oferece aplicacao, resgate, rendimento ou movimento
  nao relacionado a investimento, sem inferencia por descricao ou valor;
- o catalogo confronta os blockers do RX com as linhas privadas observadas e
  falha fechado se a evidencia nao coincidir;
- estado e payload privado usam AES-256-GCM; SQLite guarda somente o envelope
  cifrado e metadados opacos autenticados;
- uma revisao pendente e unica por familia, sobrevive a reinicio, usa revisao
  otimista e expira sem bloquear permanentemente a proxima revisao;
- todos os retornos declaram `financial_writes=0`.

## Evidencia executada

- RED: modulo ausente e, depois, selecao compartilhada indevidamente entre os
  telefones;
- focal RX + revisao: 29/29;
- bateria causal Open Finance: 365/365;
- suite hermetica de release: 1.490 testes, 1.480 aprovados, zero falhas e 10
  skips conhecidos;
- cobertura: linhas 90,65%, branches 73,16%, funcoes 90,39%;
- `node --check` e `git diff --check` verdes;
- nenhuma rede real, mensagem, escrita financeira ou alteracao de producao.

## Arquivos para auditoria

- `src/openFinance/openFinanceHistoricalAmbiguityReview.js`
- `src/openFinance/openFinanceHistoricalRx.js`
- `tests/openFinanceHistoricalAmbiguityReview.test.js`
- `tests/openFinanceHistoricalRx.test.js`
- este manifesto.

## Estado solicitado

Avaliar apenas o `GO TECNICO LOCAL` do nucleo de revisao. Mesmo com GO, envio
proativo, entrada publica, consumo das decisoes pelo reconciliador, salvamento
numerado, deploy e producao continuam nao autorizados e exigem gates proprios.
