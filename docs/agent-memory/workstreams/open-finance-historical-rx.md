# Estado - RX historico segmentado Open Finance

Atualizado em: 2026-08-03

## Objetivo

Produzir um RX historico deterministico a partir do snapshot normalizado do
Pluggy, com data de corte configuravel e sem escrita financeira.

## Estado

`RX-HIST-SEG-01 CANDIDATO LOCAL; AUDITORIA INDEPENDENTE PENDENTE`.

O objetivo esta sendo medido pelo coletor local sanitizado. O segmentador puro e
a CLI read-only estao implementados. A primeira fonte real sera uma copia
isolada do backup OCI de 2026-07-28; o arquivo original nao sera alterado.
Nenhum segredo, payload privado ou resultado financeiro entra no Git.

## Evidencia local

- syntax checks do segmentador e da CLI: verdes;
- bateria causal ampliada: 58/58;
- suite hermetica final: 1.458 testes, 1.448 aprovados, 0 falhas e 10 skips
  conhecidos;
- cinco integracoes PowerShell, incompatíveis com a trava de subprocessos da
  suite hermetica, foram executadas fora dela e passaram 5/5;
- cobertura final: linhas 90,56%, branches 72,79%, funcoes 90,18%;
- nenhuma chamada Pluggy nova, producao, WhatsApp ou escrita financeira.

## Invariantes

- conta bancaria, cartao, fatura e investimento nunca sao fundidos;
- `account.balance` de cartao nao e rotulado como fatura;
- reconstrucao de saldo no corte usa somente movimentos `POSTED` de conta
  bancaria e permanece explicitamente condicional a historia completa;
- fonte que ainda nao existia no corte fica `not_applicable`, nunca zero;
- parcelas usam numero e competencia fornecidos pelo provedor; lacuna nao e
  preenchida por inferencia;
- IDs e descricoes de transacao nao aparecem no resumo;
- resultado declara `financial_writes=0`.

## Fora do escopo

- apagar testes ou ajustar planilha;
- importar ou salvar lancamentos;
- fluxo numerico de selecao e salvamento;
- chamada Pluggy nova, deploy, OCI ou WhatsApp;
- escolher silenciosamente a data final do corte.

## Proxima acao

Publicar o commit sanitizado e submeter o hash imutavel a auditoria independente.
Somente apos GO tecnico local, executar o preview privado sobre copia isolada,
com data de corte e lifecycle das fontes explicitamente fornecidos.

## Capacidade

`Codex -> Sol -> Alto -> publicar e auditar o candidato RX-HIST-SEG-01.`
