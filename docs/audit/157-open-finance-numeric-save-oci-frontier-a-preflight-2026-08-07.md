# OF-NUMERIC-SAVE-OCI-01 - preflight read-only da fronteira A

Data: 2026-08-07

## Alcance autorizado

Somente build/verificacao local do artefato imutavel e redescoberta OCI
sanitizada, estritamente read-only. Nenhum upload, prepare remoto, backup novo,
restart, flag, mensagem, polling, promocao ou smoke foi autorizado ou executado.

## Artefato local

- commit de produto: `ea803c5c29919daa582355046536bd22bf8f88a1`;
- builder e verifier OPS-03 executados com Node explicito;
- manifesto interno confirmou o mesmo hash e 799 arquivos;
- checksum externo do pacote: valido;
- checksum separado do instalador: valido;
- quatro arquivos foram produzidos somente em `release-artifacts`, ignorado pelo
  Git; nenhum deles foi transferido.

Os digests completos permanecem na evidencia local e nos arquivos `.sha256`;
nao sao necessarios para identificar infraestrutura nem foram enviados ao
servidor.

## Redescoberta OCI

- a sessao Oracle confirmou a regiao vigente e duas VMs relacionadas ao bot em
  estado `Running`;
- a VM Ubuntu historicamente usada como producao continua identificavel pela
  imagem e pela chave de host previamente confiada;
- a segunda VM ligada corresponde ao candidato anterior que nao era a producao
  aprovada;
- nenhum endereco DNS conhecido aponta atualmente para qualquer uma das duas
  VMs;
- ambas recusaram por timeout conexoes read-only nas portas 22, 80 e 443;
- a subnet e publica, nao ha NSG associado visivel e a security list possui
  ingress TCP para 22, 80 e 443;
- portanto a indisponibilidade nao pode ser explicada por ausencia dessas regras
  na security list e exige diagnostico operacional separado.

Nenhum IP, OCID, hostname privado, fingerprint, token, telefone ou dado
financeiro foi registrado neste documento.

## Evidencia indisponivel

Como nenhuma VM ficou acessivel, nao foi possivel confirmar factualmente:

- processo PM2 unico, script ativo e `APP_COMMIT_SHA`;
- health local/publico, SQLite e WhatsApp;
- Google, read-model, cron e dashboard;
- seis flags Open Finance seguras;
- existencia/permissoes dos stores e backup/restore v3;
- journal, preview, outbox, retencao e `financial_writes=0` atuais.

Ausencia dessa evidencia e `NAO_DISPONIVEL`, nunca resultado verde ou zero.

## Veredito operacional

`NO-GO` para upload, prepare remoto, promocao, restart e smoke.

O artefato local esta valido, mas o gate nao pode avancar enquanto a identidade
da unica producao nao estiver restabelecida, a segunda VM ligada for explicada
e a VM aprovada nao permitir um preflight autenticado e sanitizado. Qualquer
correcao de rede, reboot, console serial, run-command ou desligamento e mutacao
operacional e exige autorizacao propria.
