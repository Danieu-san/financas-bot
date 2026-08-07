# OF-NUMERIC-SAVE-OCI-01 - recuperacao da chave e preflight autenticado

Data: 2026-08-07

## Alcance

Recuperar o acesso SSH da VM Ubuntu e concluir descoberta OCI sanitizada em
modo read-only. Nenhum upload, backup novo, prepare, restart, flag, mensagem,
polling, promocao, smoke ou acesso a dados financeiros foi executado.

## Recuperacao da chave

- o pacote de recuperacao foi extraido manualmente por Daniel fora do
  repositorio;
- o inventario leu somente nomes, metadados e fingerprints publicos;
- a configuracao recuperada de producao aponta para uma chave permanente
  distinta da chave historica recusada;
- o `known_hosts` recuperado coincide com a chave de host ja confiada da VM
  Ubuntu;
- o ZIP havia aplicado ACL herdada ampla ao arquivo privado; a ACL foi reduzida
  a Thais, Administradores e Sistema, sem ler nem copiar o conteudo da chave;
- a chave permanente autenticou com sucesso no usuario e host esperados;
- todas as regras SSH `/32` temporarias usadas na recuperacao e no preflight
  foram removidas, e a ausencia foi confirmada na security list.

Nenhum IP, fingerprint, chave, token, OCID, telefone, referencia, descricao ou
valor financeiro foi registrado.

## Preflight read-only autenticado

- SSH e Caddy estao `active`;
- ha listeners em 22, 80, 443 e 8787;
- existe exatamente um processo PM2 `financas-bot`, `online`, sem restart;
- o processo aponta para um release versionado e declara seu hash de produto;
- o health local retornou `ok=true`, `sqlite=true` e WhatsApp pronto;
- as seis flags estao exatamente em
  `canary/canary/canary/prompt/off/false`;
- `.env`, credenciais, mapping, policy e os stores principais existem em
  `0600`, pertencem ao usuario operacional e ficam em diretorios `0700`;
- staging, baseline, outbox, journal e preview existem; nenhum possui WAL, SHM
  ou rollback journal residual;
- os arquivos de estado, mapping e replay especificos do novo numeric release
  ainda nao estao declarados, como esperado antes do prepare do artefato;
- o recorte recente dos logs nao contem marcador de segredo, telefone ou
  `financial_writes` diferente de zero;
- o log de erro nao recebe nova linha desde 2026-08-03; sua cauda mais recente
  nao possui erro severo, e os marcadores anteriores sao historicos.

## Evidencia deliberadamente nao coletada

- nenhum SQLite real foi aberto, para evitar criacao ou alteracao de sidecar;
- contagens internas atuais de outbox, journal, preview e retencao continuam
  `NAO_DISPONIVEL`, nunca zero por inferencia;
- Pluggy e Google nao foram chamados;
- backup/restore v3, upload e prepare nao foram executados;
- a segunda VM relacionada ao bot continua `Running` e ainda precisa ser
  explicada antes de promocao.

## Veredito

`GO` somente para a recuperacao da identidade SSH e para o preflight read-only
autenticado. O bloqueio de chave esta encerrado.

O gate 34 completo permanece `NO-GO` antes de upload. Faltam autorizacao e
execucao do backup/restore v3 isolado, confirmacao sanitizada dos stores pelo
gate operacional, explicacao da segunda VM e depois autorizacoes proprias para
upload/prepare e promocao/smoke.

Como o acesso foi recuperado e nenhuma mutacao ficou ativa, o trabalho local
pode seguir sem manter a OCI aberta. O proximo gate local nao herda permissao
para deploy.
