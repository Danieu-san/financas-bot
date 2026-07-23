# Handoff portátil — AUTH-04 com RED causal confirmado

Atualizado em: 2026-07-23

## Objetivo e estado

Fechar `AUTH-04`: revogar imediatamente o acesso financeiro do dashboard quando
o usuário deixa de estar ativo, sem aguardar o TTL do token.

Estado no handoff: `RED CAUSAL CONFIRMADO; IMPLEMENTAÇÃO NÃO INICIADA`. `PRIV-01`
já está encerrado com `GO TÉCNICO LOCAL` independente. Não houve deploy, acesso
a produção ou alteração de dados reais neste gate.

## Git

- raiz: `E:\Users\horus\Documents\FinancasBot\financas-bot`;
- branch: `main`;
- HEAD portátil que contém o RED e este handoff:
  `af3d2300cefe2124f6da8dcfb0a0405e9f6b4a04`;
- commit de produto de partida:
  `6e360782ce98e45673b7fae9554d84c13478c23d`;
- o repositório está no SSD portátil e `main` estava alinhada a `origin/main`
  antes das mudanças deste handoff.

## Trabalho concluído nesta etapa

- caracterização de `AUTH-04` consolidada em `docs/plans/current-gate.md`;
- fronteira causal localizada: a assinatura/expiração do token é verificada,
  mas as APIs não reconsultam o cadastro fresco antes das leituras financeiras;
- `src/services/userService.js` já exporta `getUserByIdFresh(userId)`;
- RED criado em `tests/dashboardApiContracts.test.js` usando o servidor e as
  rotas de produto;
- o mesmo token é aceito em v1/v2 enquanto o usuário está `ACTIVE`; após mudança
  para `BLOCKED`, o teste exige `403`, resposta segura e zero leitura financeira.

## Última evidência confiável

Comando:

`node --test --test-name-pattern='AUTH-04' tests/dashboardApiContracts.test.js`

Resultado esperado e observado no código-base: RED. A primeira requisição após o
bloqueio ainda respondeu `200`, enquanto o teste exigia `403`
(`Expected values to be strictly equal: 200 !== 403`). A falha confirma o
problema causal; não é regressão acidental do harness.

Não houve mudança de produto nem nova execução depois desse RED.

## Trabalho parcial preservado

Arquivo do objetivo preservado no commit portátil
`af3d2300cefe2124f6da8dcfb0a0405e9f6b4a04`:

- `tests/dashboardApiContracts.test.js`.

O teste adiciona uma leitora fresca injetável ao mock e o cenário causal
antes/depois para v1/v2. Não alterar a expectativa para fazê-lo passar.

## Inventário local de continuidade

A rotina segura encontrou stores do Codex nos perfis atuais de `C:` e em um
perfil histórico sob `E:`. Registrou somente caminho, nome, tamanho e data dos
stores em `Trabalho Codex no outro PC\last-safe-handoff.json`; nenhum conteúdo
foi lido ou copiado.

Esses stores não são fonte portável de retomada e não devem ser copiados. O
outro Codex deve usar este checkpoint, o Git e a autenticação normal da própria
máquina.

## Próxima ação exata

Centralizar em `src/services/dashboardServer.js` uma decisão assíncrona por
requisição que:

1. valide criptograficamente o token;
2. consulte `getUserByIdFresh(uid)`;
3. negue usuário ausente, deletado ou com status diferente de `ACTIVE`;
4. falhe fechado e de forma distinta quando a fonte de status estiver
   indisponível;
5. execute antes de qualquer leitura financeira em v1, v2 e wrappers
   autenticados.

Depois, completar REDs de usuário ausente/deletado e indisponibilidade, executar
somente os testes proporcionais, criar commit sanitizado, publicar o hash e
submeter à auditoria independente obrigatória no Chat.

## Riscos e limites

- não usar cache de usuário na decisão fresca;
- não autenticar uma rota antes e outra depois da leitura;
- não registrar token nem `uid` cru;
- não misturar `STATE-04`, membership familiar, Google/Drive ou admin;
- não acessar produção nem fazer deploy em `AUTH-04`.

Arquivos concorrentes da migração OCI e todos os não rastreados alheios devem ser
preservados e excluídos de staging.

## Produção vigente

A produção vigente é Oracle/OCI. Antes de qualquer ação futura em servidor, ler
o workstream e os runbooks atuais; nunca reutilizar caminhos AWS. Este handoff
não autoriza ação remota.

## Retomada

Capacidade:

`Codex → Sol → Alto → retomar AUTH-04 pelo RED confirmado, sem deploy.`

Prompt:

`Use $execute-financasbot-gate e retome o objetivo ativo pelo handoff de AUTH-04.`
