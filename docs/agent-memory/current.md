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
- o HEAD antes do candidato WGL é
  `ecf819d7baad74f85ca4a1ba23982db894863237`;
- arquivos não rastreados alheios já existentes pertencem ao usuário e não
  devem ser adicionados, alterados ou removidos.

## Fase e escopo

- fase: manutenção/operação após a Fase 9, com Fase 8 em observação;
- subplano: remediação adversarial do lifecycle Google;
- dentro: state/claim/generation, saga OAuth, planilha marcada, recovery,
  compensação, resposta HTTP repetível, scheduler de retenção e testes locais;
- fora: deploy, EC2/Oracle, Google/WhatsApp real, mudança funcional de Drive
  membership de `AUTH-03/WGL-07`, Open Finance, escrita financeira e flags;
  a leitura de memberships entrou apenas como trava para impedir que uma
  compensação apague planilha familiar já referenciada.

## Concluído neste gate

- persistência SQLite de tentativas, geração, lease, etapas, backoff e retenção;
- tokens candidatos cifrados até promoção atômica;
- criação/reconciliação de planilha por marcador e prevenção de segunda criação
  cega;
- replay de resposta HTTP sem repetir notificação/efeitos;
- cobertura de concorrência multiprocesso, restart e cortes da saga;
- mapa explícito de transições e conclusão restrita a `lifecycle_active`;
- compensação persistida antes do efeito remoto, com lease, backoff, retenção,
  retry pelo scheduler e destruição de tokens após conclusão/expiração;
- geração nova não abandona compensação antiga pendente;
- compensação não apaga planilha preexistente, conectada ou referenciada por
  membership familiar e bloqueia novos writers enquanto a exclusão está em voo;
- bloco legado comentado do callback foi removido do módulo de produto;
- suíte focal final `tests/googleOAuthConnectionSaga.test.js`: `21/21` após
  correção do corte entre delete remoto e confirmação local;
- bateria diretamente afetada final: `62/62` após o último endurecimento;
- prova do scheduler: `20/20`; prova negativa: `4/4`;
- runner hermético: `1.190` testes, `1.185` aprovados, `0` falhas e `5` skips
  funcionais previstos; rede externa bloqueada, 94 arquivos, 89,41% de linhas e
  71,7% de branches;
- microfix prévio confirmado no commit `94449eea...`.

## Estado do candidato

Implementação e validação local estão concluídas. Falta publicar somente os
arquivos sanitizados do WGL em commit imutável e obter auditoria independente.
Alterações concorrentes do workstream AWS/Oracle e arquivos não rastreados do
usuário não pertencem ao candidato e não devem ser incluídos.

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

- sintaxe dos módulos centrais e teste focal: verde;
- saga WGL: `21/21` verde no estado atual;
- serviço de planilha junto da saga: `38/38`; callback, causalidade e
  idempotência após a correção: `31/31`;
- afetados finais: `62/62` verde;
- runner hermético local: `valid=true`, `external_network_blocked=true`,
  `pass=1185`, `fail=0`, `skipped=5`;
- nenhuma evidência de produção foi produzida ou autorizada.

## Próxima ação exata

1. revisar o conjunto exato de arquivos WGL e `git diff --check`;
2. criar commit sanitizado sem arquivos da migração ou do usuário e publicar;
3. auditar o novo hash imutável com evidência local e GitHub; o hash anterior
   `fe369897ced1b45d886e91e19e6f2ba773e241ba` recebeu NO-GO WGL-04 por não
   convergir após delete remoto efetivado com resposta perdida;
4. corrigir somente achado material; se não houver, consolidar o gate sem deploy.

## Capacidade para retomar

`Codex → Sol → Extra Alto → publicar e auditar o candidato imutável WGL-03/WGL-04.`

## Histórico dirigido

- handoff anterior: `docs/agent-memory/handoff-2026-07-22-wgl03-wgl04.md`;
- histórico cronológico completo: `docs/agent-memory/current-state.md` no commit
  `94449eea355f2c0f796a2ec0bd7b3c253e595715`;
- fila de auditoria: `docs/audit/11-exhaustive-path-independent-review-2026-07-18.md`.
