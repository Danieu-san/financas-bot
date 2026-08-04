# Plano - RX historico segmentado Open Finance

Status: `RX-HIST-TIME-INV-01 candidato local; auditoria independente pendente`.

## Objetivo

Gerar um preview privado e agregado da vida financeira observavel pelo Pluggy a
partir de `2025-07-01`, preservando semantica, origem, tipo de produto e
titularidade, sem misturar esse inicio historico com o corte de alertas de
`2026-07-28`.

## Escopo

- segmentador puro sobre snapshot normalizado;
- CLI read-only para vault cifrado copiado;
- lifecycle por conta e cartao;
- inventario externo exato de quatro fontes e oito segmentos;
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
6. [em andamento] Publicar candidato sanitizado e obter auditoria independente.
7. [pendente] Depois de GO, preparar a execucao privada read-only.

## Criterios de GO

- `history_start_date=2025-07-01` sem campo de cutoff de alertas no RX;
- exatamente quatro fontes, quatro contas bancarias e quatro cartoes;
- exatamente dois segmentos Daniel e seis segmentos no escopo Thais;
- conta Itau Thais disponivel no inicio e cartao Itau Thais nao aplicavel;
- inventario ausente falha no builder; fonte, tipo, quantidade ou titular
  divergente falha antes da leitura do vault;
- conta, cartao, fatura e limite permanecem semanticamente separados;
- `financial_writes=0` em todos os caminhos;
- testes, workflow e auditoria independente verdes.

## Condicoes de parada

- qualquer mistura entre conta e cartao ou entre os escopos Daniel e Thais;
- uso de `2026-07-28` como inicio do historico;
- fonte incompleta tratada como completa;
- qualquer escrita financeira, chamada real ou exposicao de dado privado;
- NO-GO independente.

## Proxima acao

Criar o hash imutavel do candidato e submete-lo a auditoria independente antes
de qualquer preview com dados reais.
