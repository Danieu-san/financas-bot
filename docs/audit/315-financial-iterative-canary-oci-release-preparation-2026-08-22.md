# ARQ-06 — preparação do release OCI com canário desligado

Data: 2026-08-22

## Estado

`ARTEFATO LOCAL VERIFICADO — PROMOÇÃO OCI BLOQUEADA POR ACESSO`.

## Candidato

- release: `ccafb858c44a4303a108f9dce83a8221160fe7b9`;
- código reauditado: `889d6b97b1ec061a261baa074702ca41702b84cf`;
- o release acrescenta somente o fechamento documental 314 ao código
  reauditado;
- modo do canário permanece desligado e nenhum segredo foi incluído.

## Evidência local

- árvore Git limpa no branch `codex/financial-agent-arq01-20260822`;
- workflow portátil: `OK`;
- artefato OCI verificado: `1.027` arquivos;
- SHA-256:
  `aee853f611c47893ea98bad14bfe04a67601354dce9cc2b327a1511a7e4c38b9`;
- o build preserva os caminhos protegidos e o instalador força
  `PUPPETEER_SKIP_DOWNLOAD=true`.

## Dependência transitiva

Em 2026-08-22, `npm audit --audit-level=high --omit=dev` passou a relatar
`GHSA-jmr9-qjv8-65gv` em `extract-zip`, transitivo de Puppeteer, sem versão
corrigida disponível. O caminho vulnerável é a extração de arquivo de
navegador; o procedimento OCI não baixa navegador durante a instalação e
reutiliza o runtime já validado. A ocorrência permanece registrada para
acompanhamento e precisa ser confrontada com o preflight remoto antes da
promoção; não foi silenciosamente tratada como auditoria verde.

## Acesso e saúde

- o handshake confirmou o host OCI `163.176.147.94` pelo fingerprint
  `SHA256:y6ZvDiDR09BKnJ+Aa3Th3R5PDJ5HeSfdJqHIO46BUGA`;
- a chave cliente no caminho portátil documentado existe, mas não é mais
  aceita pelo usuário `ubuntu` da instância;
- a sessão OCI preservada chegou à tela de login e não pode ser completada sem
  intervenção humana;
- a validação HTTPS pública local foi impedida por interceptação TLS Fortinet,
  cuja cadeia não é confiada pelo ambiente; nenhum aviso TLS foi ignorado.

## Limite e retomada

Não houve upload, prepare, restart, deploy, alteração de flag, chamada ao
OpenRouter, mensagem WhatsApp ou escrita financeira. A retomada deve:

1. restabelecer acesso SSH normal à OCI sem procurar credenciais alternativas;
2. validar PM2, release vigente, ambiente e health no próprio host;
3. confrontar o alerta transitivo com o install plan que mantém download de
   navegador desligado;
4. transferir e promover este artefato somente com o canário ainda `off`;
5. ativar um único domínio read-only apenas se houver segredo novo, válido e
   armazenado fora do Git; a chave exposta em conversa não pode ser usada.

