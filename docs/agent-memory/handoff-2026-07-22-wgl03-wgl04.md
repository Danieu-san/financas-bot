# Handoff 2026-07-22 — WGL-03/WGL-04

## Capacidade para retomar

`Codex -> Sol -> Extra Alto -> implementar WGL-03/WGL-04 com state de uso
unico, conclusao versionada e compensacao recuperavel.`

Nao iniciar essa implementacao em `Alto`. O desenho cruza SQLite, OAuth,
Google Sheets, lifecycle e resposta HTTP.

## Workspace e Git

- workspace canonico:
  `E:\Users\horus\Documents\FinancasBot\financas-bot`;
- HEAD e `origin/main` no fechamento de DATA-02:
  `c3a2b516725a7b6b3dfc97d2a5a29311b67acfdc`;
- commit de produto/testes DATA-02:
  `d8a58c5cb0a3601555029d4582c46fa8bdd65cca`;
- nenhum arquivo rastreado estava pendente;
- arquivos antigos nao rastreados pertencem ao usuario e nao devem ser
  alterados, adicionados ou removidos.

## Ultimo resultado concluido

DATA-02 recebeu `GO local integral`:

- cinco fronteiras genericas/não-template `USER_ENTERED` neutralizam strings
  iniciadas por `=`, `+`, `-` ou `@`, inclusive apos whitespace/controles C0;
- formulas internas do template permanecem intencionais;
- bateria afetada `296/296`;
- runner hermetico: `1164` testes, `1159` pass, cinco skips esperados e zero
  falhas;
- Chat auditou o patch exato, nao encontrou achado material e deu `GO`;
- documentacao de fechamento publicada em `c3a2b516...`.

Backlog vigente: cinco P1 resolvidos; dois P1 parciais (`AUTH-02`, `AUTH-03`),
tres P1 abertos (`FLOW-03`, `STATE-01`, `PRIV-01`) e sete P2. A proxima fila
causal usa os residuos `WGL-03/WGL-04` para completar a parte ainda parcial de
`AUTH-02`.

## Ponto exato interrompido

Somente o mapeamento de `WGL-03/WGL-04` foi feito. Nenhum codigo ou teste dessa
fatia foi alterado.

Defeitos caracterizados pelos harnesses existentes:

1. o mesmo `state` OAuth pode ser reutilizado;
2. duas conclusoes concorrentes podem criar duas planilhas;
3. a ultima metadata vence e a planilha perdedora fica orfa;
4. replay repete token exchange, sobrescreve tokens, reaplica template e
   repete lifecycle;
5. falha entre criacao da planilha, metadata e status deixa a saga parcial;
6. falha na entrega HTTP ocorre depois dos efeitos duraveis e hoje incentiva
   replay do callback inteiro.

Arquivos centrais ja identificados:

- `src/services/googleOAuthService.js`;
- `src/services/oauthTokenStore.js`;
- `src/services/userSpreadsheetService.js`;
- `src/services/userService.js`;
- `src/services/dashboardServer.js`;
- `tests/auditGoogleConnectionIdempotency.test.js`;
- `tests/auditGoogleConnectionCausality.test.js`;
- `tests/googleOAuthService.test.js`;
- `tests/userLifecycle.test.js`.

## Contrato minimo a desenhar

- nonce/state persistido, expiravel e consumido uma unica vez;
- claim atomico por tentativa/conclusao, com identidade e geracao explicitas;
- callbacks concorrentes convergem para uma unica conclusao duravel;
- resultado atrasado nao altera geracao nova;
- recovery distingue etapas token, planilha, template, metadata e lifecycle;
- planilha criada e ainda nao vinculada deve ser reutilizada ou compensada de
  forma segura, nunca ignorada silenciosamente;
- compensacao nao pode apagar uma planilha preexistente ou ja adotada;
- resposta HTTP pode ser repetida sem repetir efeitos externos;
- logs e erros devem permanecer sanitizados;
- retry/backoff e retencao devem ser limitados;
- nenhuma chamada Google real durante implementacao e auditoria local.

O desenho exato ainda nao foi escolhido. Nao implementar apenas um `Set` em
memoria nem marcar o state como usado antes de existir recovery duravel: ambos
falham em restart ou deixam o usuario sem caminho seguro depois de um corte.

## Roadmap e limites

- fase vigente: manutencao/operacao apos a Fase 9, com Fase 8 em observacao;
- subplano ativo: remediacao adversarial do lifecycle Google;
- dentro do escopo: state, callback, saga de conexao, persistencia local,
  recovery/compensacao e testes locais;
- fora do escopo: deploy, EC2, Google real, WhatsApp real, Drive membership de
  `AUTH-03/WGL-07`, Open Finance, escrita financeira e `salvar <referencia>`;
- gate de saida: RED causal, testes focados/afetados verdes, concorrencia e
  restart exercitados, runner hermetico, checks estaticos e auditoria
  independente do commit imutavel pelo Chat.

## Primeira retomada segura

1. confirmar HEAD/status e reler este handoff;
2. rodar somente a caracterizacao atual, em serie:

```powershell
& 'E:\Program Files\nodejs\node.exe' --test --test-concurrency=1 tests/auditGoogleConnectionCausality.test.js tests/auditGoogleConnectionIdempotency.test.js tests/googleOAuthService.test.js tests/userLifecycle.test.js
```

3. transformar primeiro os cenarios de replay, corrida e cortes de saga em
   contrato RED desejado, sem suavizar as assercoes;
4. parar antes de commit, push, deploy ou acesso externo e devolver o desenho
   e a evidencia local para auditoria.

Sempre definir explicitamente o cwd como a raiz do projeto ao executar Node.

