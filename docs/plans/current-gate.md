# Gate encerrado — STATE-03

Atualizado em: 2026-07-23

Base: `7f619a0b0b15734a836b3288c281d21f5a270290`.

## Estado

`GO TÉCNICO LOCAL` independente no candidato final
`e341d4feae5b6ecba8990a226f386e11cb18d027`.

O achado original apontava que o shutdown Redis disparava o último flush sem
aguardá-lo. Desde STATE-04, somente o backend de arquivo é aceito e Redis falha
fechado antes de qualquer efeito. Este gate não reintroduz Redis: elimina o
caminho legado inalcançável e torna explícita e testável a conclusão do flush do
único backend suportado antes da saída do processo.

O primeiro candidato recebeu `NO-GO` por usar `process.once`: um segundo sinal
do mesmo tipo poderia restaurar a ação padrão antes do término do flush. A
recuperação mantém ambos os listeners instalados e coalesce sinais iguais ou
mistos na mesma conclusão.

A reauditoria confirmou a cadeia linear, fechou explicitamente o `MEDIUM` e o
`LOW` anteriores e não encontrou novo achado bloqueante.

## Objetivo

Garantir que o encerramento do backend de estado conclua o último flush durável
antes da saída do processo.

## Escopo

- backend de estado em arquivo já suportado;
- fechamento explícito, idempotente e aguardável;
- handlers de `SIGINT`/`SIGTERM` que só encerram após o fechamento;
- remoção do código Redis legado e das variáveis de exemplo sem suporte;
- testes locais sem snapshot real ou integração externa.

## Não escopo

- reintrodução ou implantação de Redis;
- mudança no formato, criptografia, retenção ou replay do snapshot protegido;
- produção, deploy, Google, WhatsApp ou dados reais;
- melhorias posteriores de Pluggy/Open Finance ou UX familiar.

## Contrato

1. `closeStateStore()` retorna uma conclusão aguardável e idempotente;
2. o último estado sujo está no snapshot durável quando a conclusão resolve;
3. `SIGINT` e `SIGTERM` aguardam essa conclusão antes de sair;
4. falha de flush produz saída não zero e log sanitizado;
5. `redis` continua rejeitado antes de qualquer efeito e não existe código
   legado capaz de conectá-lo;
6. o backend de arquivo preserva criptografia, replay, retenção e arquivos
   privados já aprovados em STATE-04.

## Critérios de GO

- teste adversarial reproduz a ausência de conclusão aguardável;
- fechamento, sinais, falha e idempotência passam;
- bateria do snapshot protegido e consumidores diretamente afetados passa;
- controles estáticos e gate exaustivo ficam verdes;
- candidato sanitizado é publicado por hash imutável;
- auditoria independente no Chat não encontra severidade bloqueante.

## Evidência local

- RED causal: `0/4`;
- primeira prova causal verde: `4/4`;
- recuperação de sinais repetidos: `5/5`;
- estado protegido + onboarding: `26/26`;
- máquina financeira: `121/121`;
- recorte unitário do gerenciador: `4/4`;
- contrato de ambiente: `5/5`;
- gate exaustivo final: `1.261/1.266`, zero falhas e cinco skips previstos;
- sintaxe, diff e workflow: verdes.

## Condições de parada

- necessidade de reativar Redis ou adicionar dependência;
- saída do processo anterior ao flush;
- dado privado persistido em claro ou emitido em log;
- mudança necessária de produção ou integração real;
- regressão causal fora do escopo.

## Próxima ação exata

Publicar este fechamento documental e reconciliar o roadmap pós-auditoria para
abrir a próxima melhoria já registrada, sem produção.

## Capacidade

`Codex → Sol → Alto → reconciliar e executar continuamente as próximas
melhorias já registradas, conforme autorização expressa do usuário.`
