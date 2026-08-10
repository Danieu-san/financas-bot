# Gate ativo - Gate 38.2 escrita de entrada genuina Open Finance

Atualizado em: 2026-08-10

## Estado

`RECOVERY PROBATORIO LOCAL VERDE; AGUARDA REAUDITORIA; SEM DEPLOY`.

## Objetivo

Estender, para entrada genuina, a finalizacao duravel ja aprovada para compra,
sem misturar estorno, transferencia, reserva ou rendimento e sem alterar
producao.

## Escopo

Promocao da decisao duravel `income`, proposta cifrada, conferencia guiada,
revalidacao final e append unico em `Entradas`, somente em testes locais.

## Invariantes

1. Somente revisao Gate 36 decidida como `income` pode originar proposta.
2. Classificar a entrada nao constitui consentimento para salvar.
3. Primeiro aceite e conferencia guiada mantem zero escrita.
4. Cartao nunca participa do plano de entrada.
5. Fonte, ledger, catalogo e decisao proativa sao revalidados antes do prompt
   final.
6. Somente o segundo `sim` chama o writer.
7. Operation key, recibo, replay, restart e reconciliacao incerta preservam no
   maximo um append.
8. `OPEN_FINANCE_WRITE_MODE=off` permanece default e producao nao muda.

## Não escopo

- estorno/reembolso, transferencia, reserva, rendimento, compra ou saida;
- flags, deploy, restart ou smoke real;
- qualquer acesso AWS.

## Critérios de GO

Teste causal, regressao da compra, suite ampla unica, hash imutavel e auditoria
independente. Estado maximo: `GO TECNICO LOCAL; SEM DEPLOY`.

## Condições de parada

- qualquer escrita antes do segundo `sim`;
- mistura com estorno, transferencia, reserva ou rendimento;
- fonte, decisao, ledger ou catalogo alterado aceito silenciosamente;
- regressao da classe compra, falha de teste ou NO-GO independente;
- qualquer mutacao de producao enquanto Daniel estiver ausente.

## Evidencia

Focais e regressao de compra `46/46`; handler publico `1/1`; suite hermetica
ampla unica `1599/1589/0/10`, zero falhas. Manifesto em
`docs/audit/199-open-finance-income-write-candidate-2026-08-10.md`.

A auditoria do hash `9a7f20d6f106a8c9dda311d371faa1e87bc5563b`
emitiu NO-GO probatorio: o double de Google deduplicava por `operationKey` e
nao deixava visivel uma eventual segunda chamada do writer; faltava tambem um
replay explicito apos reabertura. O recovery registra tentativas antes da
deduplicacao e recarrega a finalizacao antes do replay. Focais do recovery:
handler `1/1` e finalizacao relacionada `28/28`.

Suite hermetica ampla final do recovery: `1599/1589/0/10`, zero falhas;
cobertura de linhas `91,04%`.

## Proxima acao

Publicar o recovery sanitizado e submeter o novo hash a uma unica reauditoria.
Sem GO independente, o Gate 38.3 nao inicia.
