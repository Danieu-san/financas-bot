# OPS-03 — recovery do release OCI por artefato

Atualizado em: 2026-07-30

Primeiro candidato:
`a82930becd65a2d5aebfa376dd07945c2935713f`.

## Estado

`RECOVERY LOCAL VERDE; REAUDITORIA INDEPENDENTE PENDENTE`.

Nenhuma ação remota, instalação, promoção, reinício ou alteração de produção
foi executada.

## NO-GO independente

O Chat leu integralmente os sete arquivos do primeiro candidato no hash
imutável e emitiu `NO-GO` por três lacunas indispensáveis:

1. o builder resolvia `HEAD` e refs, em vez de exigir o SHA completo literal;
2. links do tar eram recusados somente depois da extração;
3. uma falha ao remover o candidato durante rollback era ignorada antes de
   iniciar o processo anterior.

O parecer autorizou somente recovery local e nova auditoria, sem deploy ou
restart.

## Recovery implementado

### SHA literal

`buildArtifact` agora rejeita qualquer referência que não corresponda
literalmente a 40 caracteres hexadecimais minúsculos. O SHA resolvido pelo Git
também precisa ser idêntico ao valor solicitado. `HEAD`, branches, tags e hashes
abreviados falham antes da criação do artefato.

### Extração segura

O instalador deixou de delegar a extração recebida ao `tar`. Ele:

- descompacta gzip com biblioteca nativa;
- valida checksum de cada header tar;
- interpreta headers USTAR, PAX e GNU long name;
- aceita somente arquivo regular e diretório;
- rejeita symlink, hardlink, device, FIFO, tipo desconhecido, duplicata,
  traversal, caminho absoluto, estado e segredo antes de criar o destino;
- materializa cada arquivo em um diretório inicialmente vazio com criação
  exclusiva.

O tar intermediário produzido por `git archive` passa pela mesma extração
restritiva.

### Rollback fail-closed

Qualquer tentativa de start do candidato passa a exigir sua remoção antes do
start anterior. Se `pm2 delete` falhar durante rollback, a rotina interrompe o
recovery e não inicia o processo anterior, evitando criar duas instâncias sob
incerteza.

## Evidência executada pelo Codex

- suíte focal sequencial: `13/13`;
- referência `HEAD` recusada pelo builder real em repositório Git temporário;
- tar sintético com symlink recusado antes de criar o diretório de extração;
- falha sintética ao deletar o candidato impede o start anterior;
- cenário nominal e rollback saudável continuam verdes;
- checksum externo, manifesto interno, preservação de estado, preflight e
  confirmação literal continuam cobertos.

Essas contagens são evidência local e não execução do auditor independente.

## Limites

- o preflight real do Chrome Linux continua reservado à preparação OCI
  autorizada;
- nenhum artefato deste recovery foi instalado no host;
- a correção não autoriza upload, PM2, WhatsApp, restart ou deploy;
- o estado máximo permanece candidato até nova auditoria por hash imutável.
