# Recibo — auditoria focal de compatibilidade de trace N02-G

## Identidade conferida

- candidato: `9ffaa60669904c2a7d5af547a529e60f09c5e36b`;
- parent único: `8a4e0ead9c59e5999fa69b4211b5a9e5d14b34a3`;
- evidence commit: `77d894b705f58c1e76d7333c5330ae4a1dc714b0`;
- parent único do evidence commit: o candidato acima.

## Validação do parecer

O parecer `FIN-NEXT02-N02G-TRACE-COMPAT-AUDIT-B-20260915.md` é coerente com a
evidência focal e com a implementação lida pelo workstream:

- `S-01#1#1` exige `e0023` em `derivation.required_edges`;
- `person_b` não pertence a `derivation.required_nodes` e não possui
  `derivation.required_reads`;
- os reads de `person_b.id` e `person_b.family_id` pertencem a `proof`;
- `required_edges` e `required_reads` são dimensões exatas independentes;
- o `traverse` atual reentra em reads instrumentados para confirmar origem e
  identidade do alvo, criando reads derivacionais adicionais.

Confirmado o finding **HIGH**: a incompatibilidade está na estratégia atual de
`traverse`, não no contrato. A correção deve usar o vínculo estrutural já
compilado para observar a aresta sem executar `get` incidental. Leitura realmente
solicitada pelo evaluator continua visível no trace. É proibido copiar `actual`
para `expected` ou filtrar leitura real.

## Estado

Recibo validado. O fechamento focal permanece bloqueado até correção e
revalidação causal. Este manifesto termina aqui; a correção pertence ao
workstream de produto e é uma ação separada sob a autorização vigente.

Não há GO global do N02-G nem autorização de NEXT-03, deploy, produção ou dados
reais.
