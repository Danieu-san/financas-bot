# Gate ativo - Gate 38.1 escrita gradual de compras Open Finance

Atualizado em: 2026-08-10

## Estado

`RECOVERY PROBATORIO LOCAL VERDE; AGUARDA REAUDITORIA INDEPENDENTE`.

Producao permanece com `OPEN_FINANCE_WRITE_MODE=off`, aprovacao falsa e zero
escrita. Nenhum deploy ou mudanca de flag faz parte do candidato local.

## Objetivo

Revalidar no HEAD atual a escrita de uma compra Open Finance depois de revisao
guiada e segunda confirmacao explicita. O gate nao reimplementa o nucleo que ja
recebeu GO; verifica sua composicao com a fila numerica adicionada depois.

O primeiro auditor concluiu `ACESSO INSUFICIENTE`, sem GO. A prova publica
acrescentada atravessa duas compras e exige escrita unica do primeiro item,
recuperacao do recibo, abertura da revisao seguinte e ausencia de consentimento
herdado. O codigo de produto nao mudou.

## Escopo

- somente proposta `purchase`, `POSTED`, `new`, nao parcelada e autorizada;
- primeira aceitacao abre revisao e permanece read-only;
- revalidacao nova da fonte, do ledger e do catalogo antes do segundo prompt;
- segunda confirmacao explicita como unica entrada para o writer;
- operation key, recibo, concorrencia, replay, restart e reconciliacao incerta;
- revogacao, expiracao, fonte/catalogo alterados e correspondencia nova;
- fila numerica preservada durante a finalizacao e avancada somente apos recibo;
- rollback imediato para `write-off` pelo controlador transacional.

## Não escopo

- escrita de entrada, estorno, transferencia, reserva ou rendimento;
- escrita automatica na deteccao ou no primeiro aceite;
- parcelamentos;
- mudanca de flags, deploy, restart, Pluggy, Sheets ou WhatsApp reais;
- uso da AWS;
- smoke sem Daniel presente.

## Invariantes

1. Deteccao e alerta nunca escrevem.
2. O primeiro aceite nunca escreve.
3. Somente compra revalidada chega ao writer.
4. O segundo `sim` e explicito e vinculado a uma finalizacao duravel.
5. Concorrencia/replay/restart produzem no maximo um append.
6. Resultado ambiguo permanece `uncertain` e so reconcilia pela mesma chave.
7. O item seguinte do lote exige sua propria revisao e segunda confirmacao.
8. `write=off` remove imediatamente a capacidade de escrita.

## Evidencia local

- modulos causais: `94/94`;
- nova prova focal publica: `1/1`;
- par publico afetado: `2/2`;
- arquivo completo do handler financeiro publico: `130/130`;
- suite hermetica no mesmo codigo de produto: `1592/1582/0/10`, zero falhas;
- writer/store/politica sem diff desde os GOs independentes anteriores;
- apenas documentos foram alterados depois da suite ampla.

Recovery:
`docs/audit/197-open-finance-purchase-write-public-batch-proof-candidate-2026-08-10.md`.

## Critérios de GO

Commit sanitizado e imutavel, auditoria independente dos arquivos atuais e
nenhuma lacuna causal indispensavel. O resultado maximo e `GO TECNICO LOCAL`.

## Condições de parada

Parar diante de `NO-GO`, regressao causal, escrita anterior ao segundo `sim`,
Daniel ausente, identidade de producao divergente ou health/rollback incertos.

Depois do GO local, a ativacao ainda exige Daniel presente, commit OCI exato,
backup/rollback do `.env`, health verde, proposta real nova, verificacao de zero
efeito antes do segundo `sim`, escrita unica, recibo, planilha/ledger coerentes e
retorno imediato a `write-off` diante de qualquer incerteza.

## Proxima acao

Publicar o recovery e reauditar o novo hash. Nao ativar producao nesta ausencia de
Daniel.

## Referencias

- plano da fatia: `docs/plans/workstreams/open-finance-purchase-write.md`;
- roadmap: `docs/plans/workstreams/open-finance-historical-rx.md`;
- finalizacao: `docs/audit/66-open-finance-finalization-independent-close-2026-07-30.md`;
- fail-closed: `docs/audit/78-open-finance-write-activation-independent-close-2026-07-30.md`;
- release: `docs/runbooks/release-checklist.md`;
- health: `docs/runbooks/production-health.md`.
