# Gate ativo — AUTH-04

Atualizado em: 2026-07-22

Commit de partida: `6e360782ce98e45673b7fae9554d84c13478c23d`.

## Estado

`CARACTERIZADO, AGUARDANDO RED CAUSAL`. Este gate não autoriza deploy.

## Objetivo

Fechar `AUTH-04`: um token de dashboard emitido para um usuário ativo deve
perder acesso financeiro imediatamente quando o cadastro for bloqueado,
inativado, excluído ou deixar de existir, sem aguardar o TTL do token.

## Escopo

- validação de acesso das APIs v1 e v2 do dashboard;
- consulta fresca ao cadastro pelo `uid` depois da validação criptográfica;
- negação antes de qualquer leitura de planilha, read-model ou snapshot;
- auditoria/telemetria sanitizada de token inválido, usuário revogado e fonte de
  status indisponível;
- testes causais com o mesmo token antes e depois da mudança de status.

## Não escopo

- blacklist geral de tokens, logout no navegador ou token de uso único;
- mudança de TTL, algoritmo de assinatura, fragmento da URL ou sessão web;
- alteração de autorização Google/Drive, membership familiar ou `ADMIN_IDS`;
- dashboard administrativo amplo, produção, deploy ou dados reais;
- `STATE-04` e os demais P2 da auditoria.

## Invariantes

1. assinatura, estrutura e expiração continuam verificadas antes do cadastro;
2. usuário ausente, deletado ou com status diferente de `ACTIVE` não acessa
   dados financeiros com token ainda temporalmente válido;
3. falha ao obter o status atual fecha o acesso sem fingir token inválido e sem
   converter indisponibilidade em usuário ausente;
4. nenhuma rota lê Sheets financeiros, SQLite/read-model ou snapshot antes do
   gate de status atual;
5. v1, v2 e wrappers autenticados compartilham a mesma decisão;
6. logs e auditoria não expõem token ou identificador cru.

## Riscos

- validar somente uma rota e deixar outra superfície com autorização tardia;
- reutilizar cache de usuário e preservar a janela que o gate deve eliminar;
- tratar indisponibilidade do cadastro como ausência definitiva ou permitir
  acesso por fallback;
- registrar o token ou o `uid` cru ao negar;
- mover leitura financeira antes do novo gate por engano.

## Etapas

1. criar RED causal para token válido de usuário que muda de `ACTIVE` para
   estado impeditivo antes da segunda requisição;
2. provar REDs de usuário ausente/deletado e de fonte de cadastro indisponível;
3. centralizar a decisão assíncrona de token + cadastro atual e aplicá-la a
   todas as APIs do dashboard;
4. executar sintaxe, testes focais, bateria afetada e uma suíte ampla final;
5. publicar commit sanitizado e pedir auditoria independente por hash.

## Testes previstos

- `tests/dashboardAuthSecurity.test.js` para preservar assinatura e TTL;
- `tests/dashboardApiContracts.test.js` para revogação causal em v1/v2 e para
  provar zero leitura financeira após revogação/indisponibilidade;
- testes adicionais de serviço somente se a fronteira central exigir;
- `npm test` uma vez quando o candidato estiver estável.

## Critérios de GO

1. RED causal reproduz o token ainda aceito depois do bloqueio no código-base;
2. o mesmo token passa enquanto `ACTIVE` e é negado após mudança impeditiva;
3. todas as APIs falham antes de qualquer leitura financeira;
4. indisponibilidade do cadastro falha fechada com resposta distinta e segura;
5. sintaxe, focal, afetada, runner amplo, workflow, diff e segredos verdes;
6. commit imutável recebe parecer independente sem achado bloqueante ou lacuna
   indispensável dentro de `AUTH-04`.

## Condições de parada

- necessidade de mudar membership, Google/Drive, privilégio admin ou produção;
- conflito com os arquivos concorrentes da migração Oracle;
- evidência de segredo real ou dado pessoal no pacote;
- constatação de que `Alto` deixou de ser suficiente.

## Capacidade

`Codex → Sol → Alto → implementar e auditar AUTH-04 sem deploy.`

## Próxima ação exata

Construir o RED causal nas APIs v1 e v2 com token temporalmente válido, usuário
inicialmente ativo e status fresco depois impeditivo, exigindo zero leitura
financeira na segunda requisição.
