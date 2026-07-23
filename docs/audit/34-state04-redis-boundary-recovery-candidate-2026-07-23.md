# STATE-04 — recuperação da fronteira Redis

Atualizado em: 2026-07-23

## Parecer independente

O Chat auditou estaticamente o commit imutável
`bdaff2f238ca72fbd2406c2488f2d6a13ae971b5`, confirmou a base
`fd7146c3604fe41bb2ae44de695099254fb30aa4`, a cadeia dos quatro commits e os
18 arquivos do diff integral.

O veredito foi `NO-GO TÉCNICO LOCAL`, sem achado `CRITICAL`, com um `HIGH`
bloqueante: `redis` continuava aceito embora sua inicialização assíncrona não
participasse da barreira de startup. Ausência do cliente, fallback para arquivo,
restore inválido e restore tardio podiam ocorrer depois da asserção síncrona de
configuração. O backend de arquivo foi considerado tecnicamente consistente nos
demais controles.

O parecer foi somente leitura e não reproduziu os testes relatados.

## Decisão mínima

STATE-04 não passa a implementar uma arquitetura Redis nova. O cliente Redis não
é dependência do pacote, a configuração padrão e documentada é `file`, e
shutdown/flush Redis pertence ao gate separado `STATE-03`.

Até esse gate fornecer dependência, prontidão, restore serializado,
confidencialidade, replay e shutdown coerentes, somente `file` permanece como
driver aceito. `STATE_STORE_DRIVER=redis` agora:

- produz `state_store_driver_invalid` na barreira síncrona;
- não carrega o módulo Redis;
- não inicia conexão, fallback ou restore assíncrono;
- não toca snapshot local existente;
- impede o início dos consumidores pelo caminho já presente em `index.js`.

## Evidência executada

- RED dedicado: `redis` concluía a asserção com status zero, em vez de falhar;
- GREEN dedicado: `14/14`;
- bateria causal/afetada: `345/345`;
- runner hermético: `1.238` testes, `1.233` aprovados, zero falhas e cinco skips
  funcionais previstos;
- cobertura: linhas `89,76%`, branches `71,87%`, funções `89,62%`;
- rede externa bloqueada.

## Estado

`QUINTO CANDIDATO LOCAL; NOVA AUDITORIA IMUTÁVEL PENDENTE`.

Não houve acesso a Redis real, snapshot real, produção, Google ou WhatsApp e
não houve deploy.
