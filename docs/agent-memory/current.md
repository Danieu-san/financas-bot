# Estado atual portátil do FinancasBot

Atualizado em: 2026-07-22

## Objetivo ativo

Concluir localmente `WGL-03/WGL-04`: state OAuth de uso único, callback
concorrente convergente, checkpoints duráveis e compensação segura da saga de
conexão Google.

Plano ativo: `docs/plans/current-gate.md`.

## Git e workspace

- raiz canônica: repositório `financas-bot` no SSD portátil;
- branch: `main`;
- commit de partida do WGL: `94449eea355f2c0f796a2ec0bd7b3c253e595715`;
- o HEAD de cada retomada deve ser confirmado pelo Git e pode conter um commit
  operacional posterior a essa base;
- a árvore portátil está suja com a implementação WGL ainda não publicada;
- arquivos não rastreados alheios já existentes pertencem ao usuário e não
  devem ser adicionados, alterados ou removidos.

## Fase e escopo

- fase: manutenção/operação após a Fase 9, com Fase 8 em observação;
- subplano: remediação adversarial do lifecycle Google;
- dentro: state/claim/generation, saga OAuth, planilha marcada, recovery,
  compensação, resposta HTTP repetível, scheduler de retenção e testes locais;
- fora: deploy, EC2, Google/WhatsApp real, Drive membership de `AUTH-03/WGL-07`,
  Open Finance, escrita financeira e mudanças de flags.

## Concluído neste gate

- persistência SQLite de tentativas, geração, lease, etapas, backoff e retenção;
- tokens candidatos cifrados até promoção atômica;
- criação/reconciliação de planilha por marcador e prevenção de segunda criação
  cega;
- replay de resposta HTTP sem repetir notificação/efeitos;
- cobertura de concorrência multiprocesso, restart e cortes da saga;
- suíte `tests/googleOAuthConnectionSaga.test.js` passou `17/17` antes do último
  reforço de invariantes;
- microfix prévio confirmado no commit `94449eea...`.

## Ponto parcial preservado

Depois do `17/17`, foi iniciado um endurecimento adicional:

- `oauthTokenStore.js` agora possui mapa explícito de transições permitidas;
- conclusão exige `stage = lifecycle_active` e geração mais recente;
- os testes de recibo durável e retenção foram adaptados para etapas sequenciais;
- o teste de lease/promoção ainda precisa ser adaptado completamente;
- nenhuma suíte foi executada depois desse patch parcial.

Portanto, o `17/17` anterior não valida o estado exato atual da árvore.

## Decisões vigentes

- manter `Codex → Sol → Extra Alto` para WGL-03/WGL-04;
- se reduzir capacidade, parar e avisar Daniel antes;
- não considerar compensação “recuperável” apenas porque o erro ficou gravado:
  o caminho de retry/limpeza deve ser demonstrável;
- não aceitar `Set`, mutex ou nonce apenas em memória;
- não repetir code OAuth após corte ambíguo do token exchange;
- planilha preexistente/adotada nunca pode ser apagada por compensação;
- auditoria final deve usar commit sanitizado e imutável, além dos testes locais.

## Última evidência confiável

- sintaxe dos cinco módulos centrais: verde antes do último patch;
- saga WGL: `17/17` verde antes do endurecimento parcial;
- nenhuma evidência de produção foi produzida ou autorizada.

## Próxima ação exata

1. adaptar o teste de lease/promoção às transições sequenciais permitidas;
2. executar `node --check` nos módulos e no teste da saga;
3. executar somente `tests/googleOAuthConnectionSaga.test.js`;
4. corrigir falhas causais e então rodar as baterias afetadas definidas no gate;
5. fechar compensação recuperável antes do runner hermético e da auditoria.

## Capacidade para retomar

`Codex → Sol → Extra Alto → terminar as invariantes e revalidar WGL-03/WGL-04.`

## Histórico dirigido

- handoff anterior: `docs/agent-memory/handoff-2026-07-22-wgl03-wgl04.md`;
- histórico cronológico completo: `docs/agent-memory/current-state.md` no commit
  `94449eea355f2c0f796a2ec0bd7b3c253e595715`;
- fila de auditoria: `docs/audit/11-exhaustive-path-independent-review-2026-07-18.md`.
