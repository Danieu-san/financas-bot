# STATE-04 — recuperação após auditoria independente

Data: 2026-07-23

Estado: `CANDIDATO LOCAL CORRIGIDO; NOVA AUDITORIA INDEPENDENTE PENDENTE`.

Base funcional:
`fd7146c3604fe41bb2ae44de695099254fb30aa4`.

Primeiro candidato imutável:
`d4c7016204a8877869d24abea8e02b007e8dcfaf`.

## Parecer do primeiro candidato

O Chat confirmou o hash, a base e os 13 arquivos do diff e emitiu `NO-GO
TÉCNICO LOCAL`. A revisão foi estática e não reproduziu os testes locais.

Não houve achado `CRITICAL`. Os bloqueios foram:

- o snapshot cifrado ainda recebia a versão sanitizada do estado e, portanto,
  perdia campos necessários no round-trip;
- entradas expiradas eram ignoradas em memória, mas permaneciam fisicamente no
  ciphertext;
- um snapshot antigo íntegro podia ser reapresentado dentro do TTL;
- o envelope não fixava explicitamente IV e tag nem exigia Base64 canônico;
- falhas na carga inicial podiam escapar do limite de erro sanitizado;
- faltavam `fsync` do arquivo/diretório e provas adversariais correspondentes.

## Correção incremental

O candidato corrigido:

- cifra o estado completo necessário ao restore; a sanitização continua
  preservada apenas para o backend Redis, fora deste gate;
- valida o conjunto exato de campos do envelope, Base64 canônico, IV de 12
  bytes e tag GCM de 16 bytes;
- restaura primeiro em mapa isolado e só substitui o estado residente após
  decrypt e parse completos;
- regrava imediatamente o snapshot quando remove entradas expiradas ou reduz
  TTL excessivo;
- mantém journal privado e autenticado de digests revogados e rejeita rollback
  do arquivo de snapshot dentro do limite de retenção;
- confirma a revogação do snapshot anterior antes de promover o novo. Uma
  interrupção nesse intervalo falha fechada; uma falha síncrona de promoção
  restaura o journal anterior;
- executa `fsync` nos temporários e, fora do Windows, no diretório após
  substituições;
- converte falhas de configuração/restore na inicialização em códigos
  constantes e bloqueia o uso subsequente do state store;
- inclui snapshot, temporário, journal e temporário do journal no isolamento do
  runner e no inventário de arquivos runtime ignorados pelo Git.

## Evidência executada

- teste dedicado: `9/9`;
- bateria causal/afetada: `340/340`;
- runner hermético: `1.233` testes, `1.228` aprovados, zero falhas, cinco skips
  funcionais previstos e rede externa bloqueada;
- cobertura ampla: linhas `89,73%`, branches `71,87%`, funções `89,59%`;
- sintaxe de produto e teste e `git diff --check`: verdes;
- falha sintética na promoção preserva snapshot e journal anteriores;
- replay de snapshot substituído, envelope não canônico, plaintext legado,
  chave errada e adulteração falham fechado;
- subprocessos de startup retornam somente códigos constantes, sem `stderr` ou
  caminho privado;
- restore expirado remove fisicamente o registro do novo ciphertext.

## Limite explícito

O journal impede rollback isolado de `state_store.json`. A restauração conjunta
e coerente de todo o diretório e do journal por um operador com controle do
armazenamento permanece ameaça operacional, a ser tratada por backup,
permissões e rollout; não existe contador monotônico externo neste gate local.

Nenhuma produção, Oracle, AWS, Google, WhatsApp, snapshot real, segredo real,
deploy, restart ou alteração de flag foi acessado.

## Pergunta para a nova auditoria

Comparar o candidato corrigido com a base funcional e confirmar se cada achado
do primeiro `NO-GO` foi fechado sem criar bypass de confidencialidade,
integridade, retenção, replay, atomicidade ou startup. O parecer solicitado é
`GO/NO-GO TÉCNICO LOCAL`; rollout Linux e migração do snapshot legado continuam
condições operacionais separadas e não autorizam deploy.
