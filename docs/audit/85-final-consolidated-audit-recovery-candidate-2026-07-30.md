# AUDIT-FINAL-01 — recovery após NO-GO independente

Data: 2026-07-30

Candidato anterior:
`60c1421272887b46f26fdb06091b74ed71c37d8b`.

Escopo: recuperação estritamente local e estática do gate consolidado.
Produção, integrações reais, flags, preparação, restart e deploy permanecem
fora do escopo.

## Veredito do candidato

`CANDIDATO A GO TÉCNICO LOCAL, AGUARDANDO REAUDITORIA INDEPENDENTE`.

O executor não concede o próprio `GO`.

## NO-GO recebido

O Chat leu o hash completo anterior, os 12 arquivos obrigatórios e os 26
documentos únicos apontados pelos 29 fechamentos. O parecer foi `NO-GO`, com:

- `CRITICAL 0`;
- `HIGH 2`;
- `MEDIUM 0`;
- `LOW 1`.

Os dois `HIGH` foram reproduzidos localmente:

1. o sinal textual `NO-GO TÉCNICO LOCAL` continha a substring
   `GO TECNICO LOCAL`, e qualquer linha do manifesto podia criar uma nova
   exceção ao trocar `hash_documented` para `false`;
2. `git init/add/commit` também eram aceitos na raiz auditada, enquanto saídas
   Git/Tar usavam apenas confinamento lexical amplo sob o temporário do
   sistema.

O `LOW` registrou que as provas negativas ainda não exercitavam esses bypasses.

## Recuperação da matriz

`scripts/runFinalAuditClosureMatrix.js` agora:

- remove sinais explícitos `NO-GO` antes de procurar um sinal positivo;
- exige `hash_documented` booleano em todas as entradas;
- fixa exatamente duas exceções legadas por ID, hash e documento:
  `AUTH-01` e `C-02_WGL-01`;
- rejeita terceira exceção, remoção de exceção ou mudança de identidade;
- preserva as verificações de conjunto exato, documento, hash imutável,
  existência do commit e ancestralidade.

As exceções continuam expostas como legado sem vínculo literal antigo. Este
novo parecer independente, se positivo, será o vínculo consolidado atual; ele
não reescreve o conteúdo histórico.

## Recuperação do isolamento Git/Tar

O runner cria uma raiz temporária privada por execução e a propaga como
`EXHAUSTIVE_AUDIT_TEMP_ROOT`. O tripwire captura no carregamento os caminhos
reais dos executáveis e das raízes autorizadas e os reaplica aos descendentes,
impedindo ampliação por alteração posterior do ambiente.

Na raiz auditada, Git aceita somente as leituras exatas necessárias. Os
comandos mutáveis `init/add/commit` são aceitos apenas em um fixture direto e
controlado. `git archive` somente pode gerar `source.tar` no scratch de build
controlado. Tar somente pode ler `tree` desse scratch e gerar
`financas-bot-<sha40>.tar.gz` em um diretório de saída controlado.

Diretórios e executáveis são comparados por `realpath`. Pais e destinos
existentes também são resolvidos antes da autorização, de modo que junctions,
symlinks, diretórios imitadores e escapes para outro temporário falham fechado.
Shell, executáveis e formas de argumento não listados continuam bloqueados.

Loopback local permanece deliberadamente permitido para testes que criam
servidores no próprio processo. HTTP, HTTPS, fetch e sockets externos continuam
bloqueados; essa permissão local não autoriza integração ou rede de produção.

## Evidência executada pelo Codex

- reprodução do candidato anterior:
  - `NO-GO` aceito como `GO`: reproduzido;
  - terceira exceção de hash: reproduzida;
  - `git init` na raiz auditada: reproduzido;
- sintaxe dos sete arquivos afetados: verde;
- matriz, runner e release OCI focais: `30/30`;
- prova do runner dentro do isolamento herdado: `12/12`;
- suíte hermética final:
  - arquivos descobertos: `129`;
  - raízes de teste: `111`;
  - testes: `1.377`;
  - aprovados: `1.372`;
  - falhas: `0`;
  - skips esperados: `5`;
  - cobertura: `90,51%` linhas, `72,59%` branches e `90,03%` funções.

Uma execução ampla intermediária detectou uma falha na própria nova prova:
ela tentava substituir a raiz temporária em um descendente, ação que o
isolamento corretamente neutralizou. A prova passou a usar a raiz herdada,
passou `12/12` dentro do isolamento e a suíte ampla final ficou verde.

## Limites preservados

- as contagens acima são execução local do Codex, não execução do Chat;
- somente `whatsapp-real-e2e.test.js` permanece fora do caminho local;
- os cinco skips funcionais nominais continuam esperados;
- Google, Pluggy, Sheets, WhatsApp e OCI reais não foram acessados;
- nenhuma escrita financeira, flag, preparação, restart ou publicação em
  produção foi autorizada ou executada.

## Perguntas para a reauditoria

1. A detecção de veredito agora rejeita `NO-GO` sem perder documentos que
   registram um candidato negativo seguido de `GO` independente?
2. O contrato fixa incontornavelmente as duas e somente duas exceções legadas?
3. A separação entre Git somente leitura na raiz e Git mutável no fixture,
   junto de `realpath` e formatos exatos de Git/Tar, fecha os escapes apontados?
4. Permanece alguma lacuna causal indispensável para um
   `GO TÉCNICO LOCAL`, mantendo produção e deploy fora do alcance?
