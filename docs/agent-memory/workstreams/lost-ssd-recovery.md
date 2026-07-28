# Estado — recuperação após perda do SSD

Atualizado em: 2026-07-28

## Objetivo

Reconstruir o workspace e preservar em armazenamento cifrado o estado
operacional que não estava no GitHub, sem reiniciar, implantar ou alterar o
comportamento do FinançasBot.

## Estado factual

- o SSD portátil canônico foi perdido, mas estava protegido por BitLocker;
- a branch `codex/open-finance-save-proposal` foi restaurada do GitHub em disco
  interno no HEAD
  `255c824cc2f69080cd0f08702c1e25e827877c4b`;
- a árvore estava limpa antes da criação deste checkpoint;
- não foram encontradas cópias locais das chaves antigas, do cofre portátil, de
  bundles ou dos relatórios que existiam somente no SSD;
- a conversa que Daniel tentou enviar para a raiz do repositório não apareceu
  como arquivo normal, não rastreado ou ignorado;
- a produção vigente foi confirmada na OCI, região `sa-saopaulo-1`, instância
  Ubuntu `financas-bot-oci-ubuntu`, IP `163.176.147.94`, usuário `ubuntu`;
- o fingerprint Ed25519 do host foi confirmado por dois caminhos independentes
  e coincide com o registro histórico;
- uma chave SSH permanente distinta foi instalada e continuou autenticando
  diretamente após a exclusão completa das sessões Bastion;
- as referências privadas de chave e backup estão no manifesto EFS externo ao
  Git: `C:\Users\Administrador\Documents\FinancasBot\private-recovery\RECOVERY-MANIFEST.txt`;
- um backup completo do volume de boot produtivo está `AVAILABLE` na OCI, com
  47 GB lógicos e 9 GB únicos;
- uma réplica restaurada desse backup foi montada explicitamente como
  `ro,norecovery`; dela foi criada uma cópia local EFS com 637 entradas e
  SHA-256 verificado;
- o certificado EFS foi exportado com senha definida por Daniel e incluído em
  um pacote WinZip AES-256 testado integralmente, com 9 entradas e
  SHA-256 `ED6FEF331727838CFB682995C0A700C0F74EC333925306EA2EDC6514623C31C7`;
- o pacote `FinancasBot-Recovery-20260728-AES256.zip` e seu arquivo de
  verificação `.sha256.txt` foram enviados à pasta do Google Drive escolhida
  por Daniel; a senha não foi armazenada nem enviada;
- o Drive foi conferido depois da mudança: o acesso geral está `Restrito` e
  somente o proprietário e Daniel constam na lista de pessoas com acesso;
- a tentativa de copiar o perfil vivo do WhatsApp foi descartada porque o
  arquivo mudou durante a leitura; ela não foi aceita como backup;
- a réplica, anexos, sessões Bastion, Bastion, regra de rede e IAM temporários
  foram removidos; os plugins Bastion voltaram a `DISABLED`;
- a verificação final mostrou somente o disco de produção, PM2 e Caddy ativos,
  processo `financas-bot` único, zero reinícios e health
  `{"ok":true,"sqlite":true}`;
- não houve restart, deploy, escrita financeira, ativação da AWS nem mudança
  funcional.

## Resíduo conhecido

- `authorized_keys` pode conter linhas antigas inválidas e inertes produzidas
  durante a recuperação; a chave permanente válida funciona;
- a limpeza dessas linhas não é necessária para o acesso e exige autorização
  administrativa explícita, pois removeria entradas;
- o indicador visual `Compartilhado` permanece porque há dois participantes
  autorizados, mas não existe acesso geral por link.

## Autorização vigente

Daniel autorizou recuperar o acesso SSH da Oracle e copiar seu estado para
backup cifrado. A autorização não inclui restart, deploy, mudança de flags,
escrita financeira, alteração de DNS ou ativação da AWS.

## Invariantes

1. nunca publicar chave privada, segredo ou conteúdo do backup;
2. usar a referência privada do manifesto EFS, não duplicar caminhos de chave
   em documentos públicos;
3. manter o backup OCI até uma decisão separada de retenção e custo;
4. não reiniciar PM2, Caddy, WhatsApp ou a instância;
5. não ligar a AWS enquanto a Oracle estiver executando a sessão WhatsApp;
6. não tratar histórico de conversa como substituto de Git, checkpoint e
   evidência operacional.

## Próxima ação exata

Workstream concluído. A próxima ação pertence ao workstream de infraestrutura:
parar a EC2 legada da AWS, preservando seu volume e sem afetar a produção
Oracle. Depois, retomar o workstream funcional apontado pelo Git e pelos
checkpoints, não pelo histórico privado da conversa.
