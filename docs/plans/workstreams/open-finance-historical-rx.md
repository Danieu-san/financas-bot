# Plano - RX historico segmentado Open Finance

Status: `RX-HIST-SEG-01 candidato local; auditoria independente pendente`.

## Base

`98913fb3098e6b6017ba61401fbc8c638a1a3586`.

## Objetivo

Gerar preview privado e agregado da vida financeira observavel pelo Pluggy a
partir de um corte temporal explicito, preservando semantica e origem.

## Escopo

- segmentador puro sobre snapshot normalizado;
- CLI read-only para vault cifrado copiado;
- cobertura temporal por fonte e produto;
- saldo bancario reconstruido de forma condicional;
- faturas, limites, parcelas e investimentos em blocos distintos;
- relatorio fora do repositorio e zero escrita financeira.

## Nao escopo

- mutacao de Sheets, ledger, Pluggy ou producao;
- exclusao de dados de teste;
- salvamento numerico de movimentacoes;
- reconciliacao definitiva sem conferencia humana;
- sintetizar saldo, parcela, fatura ou existencia ausente.

## Etapas

1. [concluida] Ativar objetivo de telemetria sanitizada.
2. [concluida] Fixar contrato e invariantes.
3. [concluida] Implementar RED e segmentador puro.
4. [concluida] Implementar CLI read-only e saida privada.
5. [concluida] Executar bateria causal e suite ampla final.
6. [em andamento] Publicar candidato sanitizado e obter auditoria independente.
7. [pendente] Executar preview na copia isolada e apresentar o RX.

## Criterios de GO

- nenhum ID ou descricao bruta no resumo;
- conta e cartao do mesmo item permanecem segmentos distintos;
- saldo de corte nunca e derivado de cartao;
- bills nao sao confundidas com limite usado;
- fonte posterior ao corte e nao aplicavel, nunca zero;
- parcelas faltantes sao declaradas e nao sintetizadas;
- `financial_writes=0` em todos os caminhos;
- testes, workflow e auditoria independente verdes.

## Condicoes de parada

- fonte incompleta tratada como completa;
- qualquer escrita financeira ou chamada de producao;
- necessidade de expor segredo ou payload real;
- NO-GO independente.

## Proxima acao

Publicar o candidato sanitizado e obter parecer independente por hash imutavel.
