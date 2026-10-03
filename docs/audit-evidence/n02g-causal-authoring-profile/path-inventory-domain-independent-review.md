# Revisão independente — domínio do inventário de paths

Candidato revisado: `0b2fa642bda2737381d74b9e4baa205ea333a5e3`.
Parent único: `dbe72aa94894b7c4abf70c31fab8902f5e9236dc`.
Fonte: parecer focal fornecido por Daniel nesta conversa em 2026-10-03.
Natureza: revisão estática documental; não execução independente dos testes.

Resultado: **DECISÃO NORMATIVA NECESSÁRIA / domínio atual não ratificado**.

O revisor declara leitura integral dos três artefatos do candidato, §§10.0–10.6,
gramática relevante e registry de operadores. A identidade/parent/delta de três
arquivos foram confrontados localmente com Git; a declaração de leitura do
revisor não é convertida em execução independente do verifier ou WIP.

Achados confirmados:

- §10.2 fala por predicado, não por todo operando; o WIP sobre-enumera.
- Literais/period_literal não possuem path; trocar seu ramo não realiza a
  classe de path original. Os 6.179 IDs continuam pendentes no WIP vigente.
- A cardinalidade substituta não pode ser presumida. É necessário decidir
  aplicabilidade, granularidade, referências e bindings internos explicitamente.
- A migração deve preservar todos os IDs anteriores e sua disposição versionada;
  supersessão normativa não é SKIP nem execução PASS.
- Wrong-path schema-valid é semântico; unknown-path/operator é admissão.
  Referências não podem ser chamadas de path sem definição normativa.

Nenhuma aprovação de código, G11/N02-G/NEXT-02, deploy, NEXT-03 ou dados reais.
Próximo passo: proposta explícita com projeção reconstruível de migração,
auditoria documental antes de alterar inventário/runtime do produto.
