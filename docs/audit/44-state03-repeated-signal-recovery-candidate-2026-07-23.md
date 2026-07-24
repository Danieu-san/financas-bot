# STATE-03 — recuperação de sinais repetidos

Atualizado em: 2026-07-23

Primeiro candidato:
`15087a7bae6f7b7b1e6fab45961934097a2c69e2`.

## Parecer independente

O Chat confirmou o hash, a base, os nove arquivos alterados e a décima leitura
de referência. O veredito foi `NO-GO TÉCNICO LOCAL`, sem achado `CRITICAL` ou
`HIGH`, com um `MEDIUM` bloqueante:

- `process.once()` removia o listener antes de executar o handler;
- um segundo sinal do mesmo tipo durante o flush podia restaurar a ação padrão
  do sistema e interromper a persistência;
- o teste chamava o handler diretamente e não exercitava a instalação real.

O auditor considerou correta a eliminação do Redis legado, a conclusão única de
`closeStateStore()`, a persistência em arquivo e a remoção das variáveis sem
consumidor. O parecer foi estático e não reproduziu a bateria relatada.

## Correção mínima

- os handlers usam `on`, não `once`, e permanecem instalados até `process.exit`;
- sinais `SIGTERM` repetidos e a combinação `SIGTERM`/`SIGINT` atravessam um
  `EventEmitter` real no teste;
- todas as ocorrências compartilham a mesma `signalPromise`;
- durante o fechamento há um único `close`, nenhum `exit` antecipado e um
  listener instalado para cada sinal;
- o registro retorna uma função de remoção apenas para isolamento de teste.

## Evidência após a recuperação

- prova causal de shutdown: `5/5`;
- shutdown + snapshot protegido: `19/19`;
- gate local exaustivo: `1.266` testes, `1.261` aprovados, zero falhas, cinco
  skips previstos e zero TODO;
- cobertura exaustiva: linhas `89,91%`, branches `71,99%`, funções `89,71%`;
- nenhuma integração real, rede externa, produção, deploy ou dado privado.

## Próxima decisão

Publicar esta recuperação em novo hash imutável e solicitar reauditoria
independente, confrontando explicitamente o `MEDIUM` anterior.
