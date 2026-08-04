# Plano - RX historico segmentado Open Finance

Status: `recovery do filtro candidato; reauditoria independente pendente`.

## Objetivo

Gerar um preview privado e agregado da vida financeira observavel pelo Pluggy a
partir de `2025-07-01`, preservando semantica, origem, tipo de produto e
titularidade, sem misturar esse inicio historico com o corte de alertas de
`2026-07-28`.

## Escopo

- segmentador puro sobre snapshot normalizado;
- CLI read-only para vault cifrado copiado;
- lifecycle por conta e cartao;
- inventario externo exato de quatro fontes e nove segmentos;
- saldo bancario reconstruido de forma condicional;
- faturas, limites, parcelas e investimentos em blocos distintos;
- relatorio fora do repositorio e zero escrita financeira.

## Nao escopo

- mutacao de Sheets, ledger, Pluggy ou producao;
- exclusao de dados de teste;
- salvamento numerico de movimentacoes;
- reconciliacao definitiva sem conferencia humana;
- sintetizar saldo, parcela, fatura, titularidade ou existencia ausente;
- alterar o corte operacional de alertas neste gate.

## Etapas

1. [concluida] Separar inicio historico de corte de alertas.
2. [concluida] Implementar lifecycle por conta.
3. [concluida] Fixar inventario familiar de quatro contas e quatro cartoes.
4. [concluida] Exigir inventario no builder e arquivo externo na CLI, falhando
   fechado em divergencia.
5. [concluida] Executar teste focal, bateria causal e uma suite hermetica final.
6. [concluida] Publicar primeiro candidato e obter NO-GO independente.
7. [concluida] Fixar contrato canonico, validacao pre-vault e identificador do gate.
8. [concluida] Publicar recovery e obter NO-GO probatorio independente.
9. [concluida] Provar JSON invalido, zero snapshot/copia/vault e stderr real.
10. [concluida] Publicar recovery probatorio e obter GO tecnico local independente.
11. [concluida] Executar preflight privado read-only; falha fechada antes do
    relatorio por inventario real maior que o contrato canonico.
12. [concluida] Corrigir o contrato para cinco contas bancarias e quatro cartoes,
    mantendo corrente, poupanca e cartao Itau separados.
13. [em andamento] Testar, publicar e reauditar o contrato sucessor.
14. [pendente] Reexecutar uma unica previa privada read-only.

## Criterios de GO

- `history_start_date=2025-07-01` sem campo de cutoff de alertas no RX;
- exatamente quatro fontes, cinco contas bancarias e quatro cartoes;
- exatamente dois segmentos Daniel e sete segmentos no escopo Thais;
- conta Itau Thais disponivel no inicio e cartao Itau Thais nao aplicavel;
- poupanca Itau separada, com inicio desconhecido ate fonte confirmada;
- subtipos canonicos falham fechado mesmo quando as contagens coincidem;
- inventario ausente ou nao canonico falha no builder;
- arquivo com forma, fonte, quantidade ou titular divergente e mapa incompleto
  falham na CLI antes de snapshot, copia ou abertura do vault;
- conta, cartao, fatura e limite permanecem semanticamente separados;
- investimentos permanecem fora do inventario de contas e cartoes;
- movimentos de investimento usam somente `operation_type` do provedor,
  declaram cobertura parcial e nunca inferem por descricao;
- posicao sem historico ligado impede `ready_for_reconciliation`;
- `financial_writes=0` em todos os caminhos;
- testes, workflow e auditoria independente verdes.

## Condicoes de parada

- qualquer mistura entre conta e cartao ou entre os escopos Daniel e Thais;
- uso de `2026-07-28` como inicio do historico;
- fonte incompleta tratada como completa;
- qualquer escrita financeira, chamada real ou exposicao de dado privado;
- NO-GO independente.

## Proxima acao

Publicar o recovery sanitizado e obter reauditoria independente antes de reabrir
a copia privada. O inicio da poupanca e o historico individual das Caixinhas
permanecem desconhecidos ate existir fonte confirmada.
