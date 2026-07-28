# Plano — recuperação após perda do SSD

Status: concluído.

## Escopo

- restaurar e validar o checkout versionado;
- recuperar acesso administrativo à produção Oracle sem reinício;
- inventariar arquivos de estado e configuração sem expor conteúdo;
- criar cópia cifrada e verificável do estado necessário;
- reconstruir documentação operacional perdida;
- definir redundância para código, checkpoint, chaves e estado privado.

## Não escopo

- deploy ou atualização funcional;
- restart de processo, proxy, WhatsApp ou instância;
- mudança de flags ou segredos produtivos;
- ativação da AWS;
- escrita em Sheets, ledger, Pluggy ou dados financeiros;
- encerramento ou promoção do gate funcional em andamento.

## Etapas

1. [concluído] Validar workspace, branch, HEAD e árvore.
2. [concluído] Procurar cópias locais sem abrir conteúdo sensível.
3. [concluído] Criar armazenamento local EFS fora do Git.
4. [concluído] Gerar chave SSH permanente e validar fingerprint e acesso.
5. [concluído] Criar backup cifrado do volume produtivo na OCI.
6. [concluído] Restaurar o backup em réplica temporária sem outro runtime.
7. [concluído] Montar a réplica `ro,norecovery` na instância autenticada.
8. [concluído] Inventariar presença e tamanho das fontes essenciais.
9. [concluído] Criar cópia consistente no EFS local.
10. [concluído] Validar estrutura, raízes, tamanho, entradas, EFS e SHA-256.
11. [concluído] Desmontar e remover anexo e réplica temporários.
12. [concluído] Remover Bastion, sessões, regra de rede, plugins e IAM
    transitórios.
13. [concluído] Verificar novamente SSH, host, disco, PM2, Caddy e health.
14. [concluído] Criar manifesto privado EFS e checkpoint sanitizado.
15. [concluído] Exportar o certificado EFS com proteção por senha.
16. [concluído] Criar pacote WinZip AES-256, testar sua leitura integral e
    enviar o pacote e seu SHA-256 a um destino separado no Google Drive.
17. [concluído] Confirmar no Drive acesso geral `Restrito`, limitado ao
    proprietário e a Daniel.
18. [transferido] Retomar o workstream funcional a partir do Git e checkpoints
    depois da ação separada de infraestrutura solicitada por Daniel.

## Critérios de conclusão

- [atendido] checkout reproduz o commit publicado;
- [atendido] chave permanente acessa a instância correta sem Bastion;
- [atendido] nenhum serviço foi reiniciado;
- [atendido] backup OCI e cópia EFS possuem evidência verificável;
- [atendido] o pacote pode ser lido pelo usuário Windows local autorizado;
- [atendido] documentação permite retomar sem depender desta conversa;
- [atendido] certificado EFS e segunda cópia cifrada sobrevivem à perda desta
  máquina;
- [atendido] pasta do Drive não possui acesso geral por link e está restrita aos
  dois participantes autorizados.

## Condições de parada

- instância, região, usuário ou fingerprint divergente;
- qualquer etapa exigir restart, deploy ou indisponibilidade;
- falta de espaço ou impossibilidade de confirmar criptografia do destino;
- destino redundante sem proteção por senha ou sem validação de restauração;
- tentativa de colocar segredos, chaves ou conteúdo privado no Git.
