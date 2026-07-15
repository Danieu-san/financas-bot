# ADR-008: retirada acelerada e controlada de legado

## Status

Aceito em 2026-07-15.

## Contexto

A auditoria adversarial definiu 45 dias e um ciclo completo como baseline geral,
e dois fechamentos ou 60 dias para cartoes. Essa janela e adequada para exclusao
fisica baseada em ausencia de uso, mas nao precisa bloquear migracao, canario ou
desativacao reversivel.

O FinancasBot possui apenas dois usuarios familiares, corpus deterministico,
fixtures, E2Es read-only, telemetria duravel e flags de rollback. Esses controles
permitem reduzir o tempo em que o runtime continua escolhendo um caminho antigo,
sem afirmar prematuramente que o codigo pode ser apagado.

## Decisao

Separar dois relogios:

1. `soft-disable`: o runtime deixa de escolher o caminho por flag/canario, mas o
   codigo, schema e rollback permanecem disponiveis;
2. `physical-delete`: codigo/schema sao removidos somente depois de estabilidade
   do soft-disable e evidencia adicional.

Perfis:

| Perfil | Soft-disable minimo | Exclusao padrao | Caminho acelerado de exclusao |
| --- | ---: | ---: | ---: |
| test-only sem consumidor | imediato apos prova | 7 dias desligado | 7 dias |
| read-only | 7 dias + provas ativas | 60 dias | 30 dias, apenas com auditoria independente |
| read-only periodico | 14 dias + 2 ciclos simulados | 60 dias | 30 dias, apenas com auditoria independente |
| mutavel | 14 dias + fixture/limpeza/idempotencia | 60 dias | nao reduzido |
| fallback de fonte/rollback | nao desligar antes do cutover | 60 dias apos estabilidade | nao reduzido |

Todo soft-disable exige:

- heartbeat e zero linha invalida;
- todos os entrypoints instrumentados;
- auditoria estatica e dinamica;
- exercicio ativo do caminho novo e do rollback;
- paridade shadow;
- zero divergencia inexplicada;
- zero fallback critico durante o canario relevante.

Ausencia passiva de evento, sozinha, nunca atende o gate. O avaliador executavel
fica em `src/reliability/legacyRetirementPolicy.js`.

## Sequenciamento com a Fase 9

A pesquisa 9A e a POC 9B em sandbox podem ocorrer enquanto a Fase 8 observa os
caminhos desativados. Elas nao alteram a fonte de verdade nem criam fatos reais.

Continuam bloqueados ate o gate final da Fase 8:

- consentimento bancario real;
- importacao de dados reais do provedor;
- reconciliacao automatica;
- escrita no ledger/Sheets;
- remocao de fallback necessario ao cutover.

## Consequencias

- O projeto nao fica ocioso por 60 dias.
- O runtime pode ser simplificado de forma reversivel antes da exclusao fisica.
- Caminhos mutaveis e de recuperacao continuam conservadores.
- Qualquer reducao de 60 para 30 dias em codigo read-only exige nova auditoria
  adversarial independente com evidencia do soft-disable.
