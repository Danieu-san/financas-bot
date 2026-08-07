# OF-NUMERIC-SAVE-OCI-01 - fronteira A e plano de promocao

Data: 2026-08-07

## Artefato e prepare

- recovery de permissao auditado no hash imutavel
  `2af482094cd325f2e6c7f543020c07babcfd5d57`;
- fechamento exclusivamente documental em
  `2219590411fbea993bc8baa608e6a86c372dea27`;
- pacote e instalador reconstruidos, checksums externo e interno verdes;
- manifesto verificado localmente e na OCI, com 805 arquivos;
- os quatro arquivos de entrada ficaram em `0600` sob diretorio `0700`;
- slot `2219590411fbea993bc8baa608e6a86c372dea27` preparado sem alterar o
  processo ativo.

## Backup/restore v3 no codigo novo

O gate operacional executado pela release preparada concluiu `GO`:

- quatro bancos no pacote;
- paridade integral entre origem e restore isolado;
- segredo ausente no backup;
- retencao de 30 dias;
- revogacao testada somente na copia restaurada, com modo canary e preview
  encaminhados;
- journal isolado registrou a prova e o journal real nao foi usado pela
  revogacao;
- `financial_writes=0`;
- raiz e diretorio real do pacote em `0700`;
- cinco arquivos do pacote em `0600`;
- zero WAL/SHM e zero diretorio temporario de restore residual.

Nenhuma conexao real foi revogada e nenhum dado privado foi registrado.

## Infraestrutura concorrente

A console autenticada confirmou que a segunda VM OCI era o candidato antigo,
nao a producao Ubuntu aprovada. SSH e portas do bot estavam inacessiveis; um
run-command read-only foi aceito, mas nao entregue por ausencia da politica do
agente. Para eliminar o risco sem inferir estado interno, a VM candidata foi
parada graciosamente, sem force stop, exclusao ou alteracao de disco. O estado
final confirmado foi `Stopped`.

Depois da parada, a producao permaneceu com exatamente um PM2 online, zero
restarts, release anterior inalterada, health/SQLite/WhatsApp verdes e as seis
flags seguras. Todas as regras SSH temporarias foram removidas e sua ausencia
foi confirmada.

O host AWS historico nao respondeu ao SSH com chave e host key previamente
conhecidos. A console AWS abriu sem sessao autenticada; portanto
`aws_pm2_stopped` permanece `NAO_CONFIRMADO`, e nao pode ser inferido apenas da
indisponibilidade de rede.

## Plano OPS-03

- provider: `oracle_oci`;
- processo: `financas-bot`;
- cwd preservado;
- release atual/rollback:
  `1a1630949cf6acb301a2a054e61987d1cf516fb4`;
- release preparada:
  `2219590411fbea993bc8baa608e6a86c372dea27`;
- rollback automatico para o script anterior em falha de health ou smoke;
- nenhuma flag sera alterada: `canary/canary/canary/prompt/off/false`.

## Estado

`NO-GO PARA PROMOCAO` enquanto a AWS antiga nao tiver estado factual
confirmado e Daniel nao estiver presente para a autorizacao final e o smoke
familiar. Nenhum restart, promocao, mensagem ou polling foi executado.
