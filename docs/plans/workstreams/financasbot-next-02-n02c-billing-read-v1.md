# NEXT-02 / N02-C — Consulta de consumo por competência

Estado: CANDIDATO LOCAL N02-C VALIDADO; auditoria independente pendente.
Base funcional aprovada: `8d987dab960e0ad8f9b112326464b69caa5dfe58`.

## Dependência no roadmap

O roadmap ratificado exige categoria/subcategoria, pessoa/família, conta/cartão,
período/time basis, realizado/projetado e neutralidade de transferências e
pagamentos. NEXT-02 só fecha com propriedades e Golden Set cobrindo 100% dos
invariantes críticos. N02-C preenche a lacuna entre a agenda interna aprovada
em N02-B e claims/tools por competência; não abre NEXT-03.

## Escopo implementado e decisões da policy sintética

- Reutilizar agenda N02-B, eventos versionados e boundary pública N02-A.
- Consulta billing_period seleciona parcelas explicitamente observadas; não
  soma também a compra total. transaction_date mantém sua semântica aprovada.
- Coverage deve identificar explicitamente a lente e seu intervalo. Cobertura
  por transaction_date não demonstra cobertura por billing_period.
- Realizado e projetado precisam de seleção e claim coerentes. Uma agenda
  completa pode conter estados diferentes; sua completude não confirma parcelas.
- Estorno deve possuir competência observada e vínculo econômico suficiente.
  Caracterizar primeiro o comportamento v1 e definir a policy sintética. Se
  faltar evidência temporal, a consulta afetada não pode retornar total conclusivo.
- Não gerar parcelas, distribuir estornos, deduzir competência da data nem
  alterar fixtures/contratos congelados para acomodar a implementação.
- Preservar labels públicas e handles de evidência locais; nenhuma exposição
  dos IDs internos pela tool.

### Contrato delimitado v3

Opt-in explícito `next02-import-v3`; v1 continua default, v2 conserva a agenda
interna aprovada. Nenhum módulo de runtime v1 é importado. Reaproveitado o
comportamento de estorno com competência explícita e compensação da compra do
`canonicalLedgerProjector.js`; não foram copiadas heurísticas de data/clamping.

Os campos v2 permanecem, mas v3 aceita `billing_period` em compra não parcelada
no cartão e em estorno de cartão. A compra parcelada total não tem competência
única e continua com esse campo nulo. Conta, transferência e pagamento não
adquirem competência por inferência. Um período nulo em evidência relevante
impede conclusão por competência; não é convertido em zero.

O read model v3 exige lista de provas de cobertura, com chave única
`(time_basis, evidence_state)`, entre transaction_date/billing_period e
confirmed/projected. No máximo quatro provas; ausência da combinação pedida
retorna incompleto. Cada prova conserva start/end/as_of/completeness. Cobertura
confirmada completa precisa terminar até as_of; projected pode declarar horizonte
futuro explicitamente, sem afirmar que esse horizonte já foi realizado.
Todos os registros do snapshot precisam já ser observados até cada as_of.

A consulta v3 exige `evidenceState`; claim e evidence preservam esse estado.
Não mistura realizado/projetado. billing_period seleciona parcelas, compras
não parceladas e estornos de cartão; transaction_date seleciona compra/estorno,
nunca parcelas. Filtro account é inválido na lente billing_period. O gateway
existente traduz labels públicas e fornece handles efêmeros de evidência.
Não há wiring adicional no ConversationGateway nem promoção de projected a
confirmed no verifier do NEXT-01.

Antes de aceitar competência, cada agenda relevante ao escopo/filtros deve
estar completa e seus eventos/compra devem ter cobertura completa e estado
confirmed/projected. A regra é conservadora: agenda incompleta bloqueia todos
os meses daquele escopo, pois a competência das parcelas ausentes é desconhecida.
O resultado inclui referências versionadas de toda a agenda usada como prova,
mesmo quando só uma parcela participa do total. Targets de estorno também
precisam de evidência completa. Não existe distribuição automática de estorno.
`claim.evidenceState` e `evidence.state` identificam o estado dos eventos
somados, não promovem o estado de todos os eventos referenciados como prova
da agenda. Uma parcela projetada pode provar a completude da agenda sem
participar do total confirmado; seu evento continua explicitamente projetado.

São referências de proveniência do kernel desta fatia, não implementação nem
certificação do motor completo de grafos/traces projetado no NEXT-00.

## Evidência já consultada

Roadmap v2, seções 9.2, 11 e 12; Data Authority, seções 6/7;
plano de reutilização NEXT-02; expenseReadModel; installmentSchedule;
referências do canonicalLedgerProjector e testes de compensações do v1.
O Golden Set tem uma parcela confirmada em junho e duas projetadas em julho
e agosto. Ele não autoriza tratar a agenda inteira como consumo confirmado.

## REDs necessários

1. Compra em maio, parcelas em junho/julho: total da compra somente em maio na
   lente transaction_date; parcelas somente nas competências respectivas.
2. Coverage da lente errada, parcial ou ausente não produz zero/empty conclusivo.
3. Confirmado e projetado não se misturam; projected preservado no claim/evidence.
4. Pagamento e transferência neutros; estorno sem competência não é omitido
   silenciosamente nem atribuído a um mês por heurística.
5. Lacunas, versões, tombstones e vínculos entre compra/parcela/estorno continuam
   causais; valores coincidentes não substituem identidade/provenance.
6. Escopo pessoal/familiar e filtros públicos permanecem corretos no gateway.
7. Gate usa inventário e IDs da nova fatia; testes N02-A/N02-B são regressões.

## Saída e pendências do NEXT-02

Executar REDs, bateria afetada e uma suíte ampla no candidato estável. Publicar
SHA imutável, enviar pelo bot uma vez e ativar acompanhamento até o parecer.
Auditoria focal não equivale ao GO global: ainda é necessário mapear e cobrir
subcategorias, demais lentes exigidas, Golden Set aplicável e prova de provenance
prevista pelo charter. Não acrescentar novas fatias sem relacioná-las a essas
lacunas. Sem runtime real, adapters reais, writers, deploy ou dados privados.
