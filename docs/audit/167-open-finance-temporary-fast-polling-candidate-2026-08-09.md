# OF-FAST-POLL-01 - janela temporaria de polling

Data: 2026-08-09

## Objetivo

Permitir ciclos Open Finance mais frequentes durante o smoke do Gate 34 sem
remover o padrao de seis horas, sem sobrepor ciclos e sem habilitar escrita.

## Contrato implementado

- seis horas continuam sendo o intervalo padrao e o fallback;
- intervalo temporario abaixo de seis horas exige no minimo cinco minutos;
- a janela exige expiracao futura explicita de no maximo duas horas;
- somente `canary/canary/canary/prompt/off/false` aceita a janela rapida;
- configuracao ausente, expirada, longa demais ou insegura volta a seis horas;
- depois da expiracao, os ticks curtos deixam de executar ciclos ate completar
  a cadencia natural de seis horas desde a ultima tentativa;
- o single-flight impede que um tick novo sobreponha ciclo ainda em andamento;
- todas as recusas e skips sao sanitizados e declaram `financial_writes=0`;
- o atualizador allowlisted aceita somente intervalo numerico entre cinco
  minutos e sete dias e expiracao vazia ou temporalmente valida.

## Arquivos de produto e teste

- `.env.example`;
- `src/openFinance/openFinanceCanaryRuntime.js`;
- `scripts/applyRuntimeEnvOverrides.js`;
- `tests/openFinanceCanaryRuntime.test.js`;
- `tests/applyRuntimeEnvOverrides.test.js`.

## Evidencia local

- syntax check dos quatro arquivos JavaScript alterados: verde;
- testes focados: `20/20`;
- bateria causal Open Finance/runtime/env: `71/71`;
- `git diff --check`: verde;
- suite hermetica unica: 1.553 testes, 1.543 aprovados, zero falhas e 10
  skips esperados;
- cobertura: linhas 90,87%, branches 73,55% e funcoes 90,50%.

Nenhuma rede, Pluggy, WhatsApp, Google, OCI, flag ou dado real foi usado na
implementacao e nos testes locais.

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE POR HASH IMUTAVEL`.

Um GO tecnico autoriza somente a promocao controlada na Oracle/OCI e a abertura
de uma janela de 15 minutos por no maximo duas horas. A promocao deve manter
escrita `off`, aprovacao falsa, rollback para o release vigente e regra SSH
temporaria removida ao terminar.
