# NEXT-00 — Redesenho declarativo após a quarta reauditoria

Atualizado em: 2026-08-31
Objeto reavaliado: `831d0c35c1d12ad60f96989e19133c5b4630ec44`
Veredito externo: `APROVÁVEL APÓS AJUSTES`

## Decisão

Não foi criado um quarto conjunto de casos especiais. O bloco imperativo
`validateDimensions()` e seu `switch` por métrica foram removidos.

O projeto passa a obedecer a uma trava anti-remendo permanente em `AGENTS.md` e
na skill `execute-financasbot-gate`: dois ciclos com novas exceções da mesma
classe obrigam reavaliação da abstração; um terceiro remendo é proibido.

## Novo desenho

`golden-fact-contracts-v1.json` é a fonte declarativa e revisável das oito
dimensões de cada fato materializado:

- métrica;
- unidade;
- entidade;
- período;
- base temporal;
- cobertura;
- estado da evidência;
- referências de evidência.

O oracle continua contendo o valor apresentado. O validador combina os dois:

1. compara genericamente todas as dimensões do oracle com o contrato;
2. executa o avaliador determinístico de valor da métrica;
3. valida tipos e estados das fontes por regras genéricas;
4. executa relações declarativas, como `member_of_budget_family`;
5. rejeita cardinalidade, ordem, dimensão, relação ou valor divergente.

O contrato declarativo é pinado integralmente por SHA-256. Alterações
intencionais continuam possíveis, mas ficam explícitas no diff e exigem novo
hash e nova auditoria.

## Propriedades geradas

O teste não escolhe mais exemplos favoráveis. Ele percorre os 76 fatos e gera:

- `608/608` mutações de dimensão (`76 x 8`);
- `76/76` mutações de valor;
- `1/1` mutação da relação pessoa–família–orçamento;
- `11/11` mutações estruturais independentes.

Assim, referências do mesmo tipo, drift de período, pessoa externa, cobertura,
estado e demais dimensões não dependem de novos `if` por métrica.

## Escopo

Somente instruções permanentes do projeto, documentação, fixtures sintéticas e
validadores foram alterados. Não houve runtime, produção, integração, writer,
credencial ou dado financeiro real. NEXT-01 permanece fechado.

## Estado

Testes focais verdes. A mudança causal invalida a suíte ampla anterior; falta
uma única execução ampla no staged estável, novo hash e reauditoria
independente.
