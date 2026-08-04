# Estado - RX historico segmentado Open Finance

Atualizado em: 2026-08-04

## Objetivo

Produzir um RX historico deterministico a partir do snapshot normalizado do
Pluggy, com inicio historico explicito, inventario familiar exato e zero escrita
financeira.

## Estado

`RX-HIST-TIME-INV-01 RECOVERY CANDIDATO LOCAL; AGUARDANDO REAUDITORIA INDEPENDENTE`.

O `GO TECNICO LOCAL` anterior de `RX-HIST-SEG-01`, no hash
`62ec19532f1e4d288efa7c3fb75291540358fdd5`, continua valido para o contrato
antigo, mas foi superado para qualquer preview real. O usuario esclareceu duas
fronteiras temporais diferentes e o inventario familiar completo; o candidato
atual incorpora essas condicoes antes de abrir dados reais.

O primeiro candidato temporal/inventarial, no hash
`3103677231897f6a64b9bcd89c8cd2c16d2835e1`, recebeu `NO-GO` independente:
o arquivo esperado ainda podia descrever um inventario menor autoconsistente,
a CLI so confrontava forma/titularidade/contagem depois de abrir o vault e o
identificador publico ainda era o gate anterior. O recovery fixa o inventario
canonico no produto, valida inventario e aliases antes do snapshot/vault e usa
`RX-HIST-TIME-INV-01` em builder, stdout e erro da CLI.

## Contrato temporal

- inicio do RX historico: `2025-07-01`;
- corte de elegibilidade de novos alertas: `2026-07-28`;
- o corte de alertas pertence ao fluxo operacional de notificacao e nao entra
  na CLI nem no relatorio do RX;
- transacoes anteriores ao inicio historico nao participam da reconstrucao;
- nenhuma data ausente e inferida.

## Inventario familiar obrigatorio

| Fonte | Conta bancaria | Cartao | Escopo titular |
|---|---:|---:|---|
| Daniel Nubank | 1 | 1 | Daniel |
| Thais Nubank | 1 | 1 | Thais |
| Thais Itau | 1 | 1 | Thais |
| Cristina Nubank | 1 | 1 | Thais |

Total: quatro contas bancarias, quatro cartoes, dois segmentos de Daniel e seis
segmentos vinculados a Thais. A conta Itau de Thais existia em `2025-07-01`; o
cartao Itau de Thais nao existia nessa data. A data exata de criacao desse
cartao nao e inventada.

## Evidencia local atual

- o builder confronta o inventario recebido com o contrato familiar canonico;
- a CLI valida forma, quatro aliases, titularidade e contagens do arquivo antes
  de criar a copia ou abrir o vault;
- fonte ausente ou extra, tipo/quantidade divergente e titular incorreto falham
  fechado;
- lifecycle pode ser declarado por conta, sem aplicar a existencia da conta ao
  cartao do mesmo banco;
- teste focal: 14/14;
- bateria causal Open Finance: 339/339;
- suite hermetica final: 1.468 testes, 1.458 aprovados, 0 falhas e 10 skips
  conhecidos;
- cobertura: linhas 90,61%, branches 72,93%, funcoes 90,24%;
- nenhuma chamada Pluggy nova, dado real, planilha, deploy, OCI, WhatsApp ou
  escrita financeira.

## Invariantes

- conta bancaria e cartao nunca sao fundidos, mesmo quando pertencem ao mesmo
  banco ou pessoa;
- o escopo de Cristina permanece Thais; somente os dois segmentos Nubank de
  Daniel ficam no escopo Daniel;
- `account.balance` de cartao nao e rotulado como fatura;
- conta ou cartao inexistente no inicio historico fica `not_applicable`, nunca
  zero;
- parcelas usam numero e competencia fornecidos pelo provedor;
- IDs e descricoes de transacao nao aparecem no resumo;
- resultado declara `financial_writes=0`.

## Proxima acao

Publicar o recovery sanitizado e obter reauditoria independente por hash imutavel.
Somente depois de novo `GO TECNICO LOCAL` podera ser preparada uma execucao
privada read-only; isso ainda nao autoriza abrir o backup, alterar planilha ou
usar producao.

## Capacidade

`Codex -> Sol -> Alto -> publicar e auditar o contrato temporal e inventarial.`
