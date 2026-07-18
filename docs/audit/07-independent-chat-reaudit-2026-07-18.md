# Reauditoria independente Chat/Codex - 2026-07-18

## Motivo e escopo

Esta reauditoria foi aberta porque a auditoria anterior foi executada quase
inteiramente no Codex, apesar de o método aprovado exigir alternância entre:

- Chat independente: contratos, challenge, caminhos omitidos e decisão de
  suficiência;
- Codex: leitura do repositório, testes, execução reproduzível e evidência
  operacional sanitizada.

O objeto original permanece congelado na tree
`363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`. A correção posterior `AUTH-01`
fica em uma trilha separada, no HEAD local `3bdb6999f7819ccbf2b48ea7e9dde4498a434573`.
Achados e resultados da auditoria anterior são tratados como alegações a
revalidar, não como veredito herdado.

Não implementar correções, mudar flags, acessar produção ou enviar mensagens
durante esta reauditoria. Ao concluir, registrar os gates independentes e só
então voltar à fila de correções, com autorização específica do usuário.

## Limitação do revisor independente

O Chat foi acessado pelo navegador público em `chatgpt.com`, sem login. A
interface ofereceu apenas o seletor genérico `ChatGPT`; portanto não é possível
afirmar que o revisor foi o GPT-5.6 Thinking recomendado no relatório de
método. A conversa serviu como challenge independente, sem acesso ao
repositório, terminal, produção ou segredos. O Codex forneceu somente pacotes
sanitizados.

## Correção de rastreabilidade dos vereditos

Em 2026-07-18 foi confirmado que `origin/main` e a tree local apontavam para
`3bdb6999f7819ccbf2b48ea7e9dde4498a434573`, mas os quatro harnesses criados
por esta reauditoria e este relatório ainda não estavam rastreados no GitHub
durante os challenges do Chat. Assim, o Chat podia desafiar a lógica dos
pacotes relatados, mas não inspecionar diretamente a implementação das novas
provas.

Os resumos enviados foram comparados novamente com os artefatos e uma nova
execução local: OAuth/status passou `14/14`; causalidade, idempotência e
revogação/recuperação passaram `5/5` cada; os quatro hashes SHA-256
permaneceram iguais aos registrados. Não foi encontrada divergência material
entre os resumos e as saídas reproduzidas.

Reclassificação obrigatória:

- os `GO` anteriores continuam sustentados como caracterização técnica
  interna e como revisão lógica de evidência relatada;
- eles ainda não constituem verificação independente dos arquivos pelo Chat e
  ficam provisórios até revisão do commit imutável no GitHub;
- os `NO-GO` de conformidade permanecem: são conclusões conservadoras
  sustentadas pelo código e pelos ensaios locais, não aprovações dependentes
  da autoridade do Chat;
- P5 e a reauditoria geral não podem ser fechados como independentes antes da
  revalidação remota dos arquivos publicados.

A partir deste ponto, cada gate enviado ao Chat deve referenciar um commit
sanitizado no GitHub, com hash imutável e caminhos exatos. Resumo sem acesso
aos arquivos deve ser identificado explicitamente como `summary-only`.

## Revalidação independente pelo GitHub

O pacote sanitizado foi publicado no commit
`2b6d1b6ba12292fc744a21bec764d3ba0f0117a1` e confirmado em `origin/main`.
O Chat, em conversa limpa, confirmou explicitamente esse hash e abriu o
relatório, os quatro harnesses e as implementações de produto referenciadas
por URLs imutáveis do GitHub. A revisão foi de arquivos e asserções; o Chat
não reexecutou as baterias locais.

Veredito independente por subgate:

- OAuth/status: caracterização `GO`; conformidade `NO-GO`; nenhuma lacuna
  indispensável para a caracterização local. O revisor confirmou que o
  callback e o SQLite são reais, registrou os doubles de OAuth, user lookup e
  conclusão e verificou a ordem equivalente na implementação real.
- causalidade: caracterização `GO`; conformidade `NO-GO`; nenhuma lacuna
  indispensável local. O revisor confirmou a conclusão Google real, store
  OAuth real, lifecycle real sobre backing sintético e rota/callback reais no
  corte HTTP.
- concorrência/idempotência: caracterização `GO`; conformidade `NO-GO`;
  nenhuma lacuna indispensável da aplicação. O revisor preservou fora do
  escopo qualquer afirmação de que o Google real aceitaria o mesmo `code` em
  replay.
- revogação/recuperação: caracterização dinâmica `GO`, mas conclusão
  tree-wide `GO CONDICIONAL`; conformidade predominantemente `NO-GO`. A
  condição restante é o mapa estático completo de entry points e sinks da
  prova negativa.

Assim, os três primeiros `GO` provisórios foram convertidos em verificação
independente dos arquivos. Revogação/recuperação permanece qualificada até
a prova negativa. P5 precisa somente do pacote de prova negativa já definido;
a conformidade geral continuará `NO-GO` mesmo que os controles localizados
passem.

Observação operacional: a conversa antiga conseguiu pesquisar o GitHub, mas
teve duas respostas truncadas. Uma conversa limpa, com prompt curto e links
imutáveis de `github.com`/`raw.githubusercontent.com`, entregou o parecer
completo sem intersticial de segurança. Esse formato passa a ser o padrão da
auditoria; não é garantia contra filtros futuros, portanto o fallback manual
registrado em `AGENTS.md` permanece.

## Prova negativa final - execução candidata

Foram criados:

- `docs/audit/08-google-entrypoint-sink-negative-proof-2026-07-18.md`;
- `tests/auditGoogleNegativeProof.test.js`.

A primeira execução confirmou os dois controles dinâmicos, mas rejeitou o
manifesto porque o texto descrevia a remoção de permissão Drive sem escrever
literalmente o símbolo `revokeSpreadsheetPermission`. O rótulo foi corrigido,
sem alterar produto ou asserções. O temporário sintético foi validado pelo
prefixo e removido antes da repetição.

Repetição exclusiva final:

- sintaxe: aprovada;
- bateria: `4/4`, falhas zero;
- temporários: `0 -> 1 -> 0`;
- manifesto: 146 arquivos JS de `src` classificados, zero writers que marquem
  revogação OAuth individual, um writer de revogação de membership familiar
  e zero caminhos Google/OAuth de recovery, journal, claim ou resume;
- state com identidade alterada: rota HTTP, callback, verificação e erro
  reais; HTTP `400`; token exchange, lookup Google, save/update OAuth,
  conclusão, lifecycle, membership, Drive, WhatsApp e métrica de sucesso
  permaneceram zero; snapshots A/B idênticos;
- usuário não admin: resolução de acesso real e dispatcher real anterior ao
  gate; auditoria `access_denied/denied`; zero auditoria de sucesso; zero
  mutação de lifecycle, OAuth, membership, Drive ou planilha; snapshots
  idênticos.

Hashes antes do commit:

- harness: `2B18F5929FF5DCDA75AC55BC59B5071A539E5E7427437B36D7DB366F4DA0C931`;
- manifesto: `947E7299BE729A17C2BEE95007D2A79867859C391DFECEF070B352A823A81902`.

Veredito Codex candidato: caracterização da prova negativa `GO` e conformidade
geral `NO-GO`. O P5 continua aberto até o Chat inspecionar diretamente o commit
que publicará estes artefatos.

### Limitação da revisão independente deste pacote

O commit `04199b94544ffe61b2eac6458fe8e75196b8ab00` foi aberto pelo Chat e os
links do manifesto, harness e arquivos citados foram consultados. Não apareceu
o intersticial no DOM lido pela automação; Daniel informou que ele apareceu na
interface visível. Portanto o gate é tratado como bloqueado. Além disso, três respostas automáticas foram
truncadas logo após o início do parecer, inclusive em conversa limpa e com
limite de sete linhas. Apenas a confirmação parcial do hash e as citações
foram renderizadas.

Essa confirmação de acesso não equivale a veredito. P5 permanece aberto e o
fallback manual deve ser usado: Daniel envia o prompt curto com os dois links
imutáveis e devolve a resposta integral. Nenhum `GO` independente da prova
negativa foi registrado a partir das saídas truncadas.

Rotina reajustada: uma única tentativa automática por gate/commit; o relato do
usuário vale como confirmação de bloqueio; depois disso, somente prompt manual
minimalista, sem repetir no texto os detalhes técnicos que já estão nos arquivos.

### Fechamento independente após o fallback manual

Daniel devolveu duas respostas manuais completas do Chat para os arquivos do
commit `04199b94544ffe61b2eac6458fe8e75196b8ab00`. Ambas confirmaram o hash
integral, reconheceram correspondência entre o manifesto e o código e
aceitaram que o harness atravessa as decisões reais declaradas, usando os
componentes sintéticos apenas como backing stores e tripwires.

As respostas convergiram também na única lacuna residual indispensável: os
arquivos publicados demonstravam desenho e asserções, mas não constituíam, por
si sós, comprovante de uma execução verde dos três subtestes naquele código.

O Codex resolveu exatamente essa condição, sem ampliar o escopo:

- `git diff --exit-code` confirmou que manifesto e harness da execução são
  idênticos aos do hash revisado;
- os blob IDs também coincidiram entre o commit e a tree executada;
- a checagem de sintaxe passou;
- a bateria exclusiva passou `4/4`, com os três subtestes internos `3/3` e
  falhas, cancelamentos, ignorados e pendentes iguais a zero;
- snapshots finais permaneceram idênticos e todos os contadores proibidos
  ficaram zerados;
- o temporário sintético foi validado, removido e recontado com resíduo zero.

O registro reproduzível está em
`docs/audit/09-p5-negative-proof-execution-2026-07-18.md`.

Veredito final do P5:

- caracterização da prova negativa: `GO`;
- conformidade geral: `NO-GO` preservado;
- lacuna indispensável residual do P5: nenhuma;
- próximo estado permitido: consolidação final da reauditoria;
- correção, deploy, produção e serviços reais: não autorizados por este gate.

## Pacotes documentais concluídos

### P0 - capacidades e contratos

O Chat aceitou o inventário apenas como hipóteses documentais. Exigiu definir:

- identidade canônica por decisão;
- significado de escrita por classe de persistência;
- separação entre persistência financeira, autorização, operação, derivação,
  auditoria e backup;
- lifecycle global;
- revogação completa;
- integridade/imutabilidade da auditoria.

### P1 - autorização e efeito

Foram separados contratos aprovados de taxonomias inferidas pelo auditor. O
Chat exigiu precedência explícita quando identidade, status, OAuth, sessão,
membership e viewer entram em conflito. Também exigiu registrar, para cada
evidência, se ela é normativa ou apenas inferida.

### P2 - máquinas de estado

O Chat identificou máquinas fracamente acopladas de usuário, OAuth,
membership/Drive, dashboard, conversa, escrita, scheduler e Open Finance. O
próximo nível de prova passou a exigir evento, máquinas afetadas, ordem,
atomicidade e estados intermediários permitidos.

### P3 - falhas, concorrência e atomicidade

O Chat definiu como unidade de auditoria a cadeia:

`entrada -> decisão -> persistência A -> persistência B -> efeito externo -> resposta -> auditoria`

Também exigiu separar commit/resposta, dono da convergência, rollback,
compensação, reconciliação, undo, retry e replay.

### P4 - rastreabilidade e cobertura

Foi enviada uma matriz com 17 grupos de promessas e 27 capacidades, usando:

- `N`: contrato normativo;
- `D`: documento descritivo;
- `C`: código localizado, ainda não revalidado;
- `T`: teste/resultado histórico;
- `E`: execução local reproduzida;
- `P`: produção sanitizada histórica;
- `I`: inferência.

O Chat aceitou a matriz como mapa de disponibilidade, não de força probatória.
A ordem técnica definida foi:

1. identidade, autorização e precedência;
2. causalidade entre decisão, efeitos e resposta;
3. concorrência e idempotência;
4. revogação e recuperação;
5. prova negativa das capacidades proibidas.

## P5 - identidade, autorização e precedência

### Linha A - tree congelada

Inspeção de `src/utils/adminCheck.js` e
`src/handlers/messageHandler.js` demonstrou que:

- `isAdminWithContext` aceitava um `@lid` não listado quando o
  `display_name` coincidia com o nome de um admin;
- comandos admin eram encaminhados antes de `access.allowed`, portanto o
  bypass do onboarding dependia integralmente dessa decisão de identidade.

A tree congelada foi extraída em ZIP temporário. Foram executados somente os
testes existentes `adminCheck.isAdminWithContext` e
`messageHandler lets admin commands bypass access gate for admin LID`:

- testes: `2`;
- aprovados: `2`;
- falhas: `0`.

O primeiro teste antigo esperava explicitamente `true` para um LID não listado
com nome `Daniel`. O Chat classificou essa cadeia como N -> C -> T -> E
completa para a capacidade específica: havia divergência reproduzida entre o
contrato normativo e a implementação da Linha A.

### Linha B - AUTH-01 posterior

O diff removeu a autorização por nome; `isAdminWithContext` passou a delegar
somente a `isAdmin`. A execução atual focada comprovou:

- colisão de nome negada;
- LID explicitamente listado aceito;
- bypass pré-onboarding negado para LID não listado;
- testes: `3/3`.

O Chat classificou isso somente como correção localizada reproduzida, sem
inferir conformidade sistêmica.

### Lifecycle normal

`resolveUserAccess` bloqueia os estados não ativos e permite fluxo normal
somente para `ACTIVE` com termos atuais. A bateria
`tests/userLifecycle.test.js` passou `11/11`. O Chat ressaltou que isso prova o
comportamento da função, não que todas as entradas e efeitos passem por ela.

### OAuth versus status atual

Inspeção estática encontrou:

- state assinado por HMAC, com `provider`, `userId`, `iat` e `exp`, mas sem
  nonce/JTI consumido;
- o callback troca o code e salva a conexão/token antes de buscar o usuário;
- não há exigência de status atual `APPROVED_AWAITING_GOOGLE`;
- `completeGoogleConnectionForUser` promove o usuário para `ACTIVE` sem
  conferir o status anterior.

Os testes OAuth existentes passaram `6/6`, mas cobrem apenas criptografia,
identidades separadas, chave forte, scopes/state assinado, adulteração e o
callback feliz. Não cobrem expiração, reuso, status revogado, falha parcial ou
concorrência.

O Chat manteve as consequências como inferências até haver execução
adversarial e definiu o contrato esperado:

- somente `APPROVED_AWAITING_GOOGLE` pode concluir a primeira conexão;
- `BLOCKED`, `INACTIVE`, `DELETED`, `PENDING`, `PENDING_APPROVAL` e `EXPIRED`
  devem falhar antes de qualquer efeito;
- a política de reconexão para `ACTIVE` deve ser explícita;
- validação, persistência de credencial, vínculo, promoção de estado, efeitos
  derivados, resposta e auditoria são commits distintos.

## Harness adversarial OAuth em andamento

Arquivo temporário de auditoria criado:

`tests/auditOAuthStatusPrecedence.test.js`

Ele contém cenários isolados, sem rede e com SQLite temporário:

1. state expirado;
2. callback para `BLOCKED`, `INACTIVE`, `DELETED`, `PENDING`,
   `PENDING_APPROVAL` e `EXPIRED`;
3. usuário inexistente depois da emissão do link;
4. falha depois de persistir credencial e antes de concluir conexão;
5. reuso sequencial do mesmo state;
6. callbacks concorrentes com o mesmo state.

A checagem sintática passou. Na primeira execução, as asserções de
comportamento chegaram aos efeitos esperados pelo harness, incluindo doze
registros sanitizados de conexão, mas o processo terminou `1/12`: o primeiro
teste passou e os demais foram marcados como falha de hook porque o Windows
recusou apagar os bancos SQLite ainda abertos (`EBUSY`). Portanto a bateria
ainda não pode ser declarada validada.

O hook de remoção dentro do processo foi retirado. A repetição planejada faria
a limpeza somente depois do encerramento do Node. Essa repetição **não chegou a
executar**: a aprovação automática da interface expirou. Não havia processo de
teste preso; o comando foi interrompido.

Dez diretórios temporários falsos, sem dados reais, permaneceram em:

`C:\Users\Thais\AppData\Local\Temp\financas-oauth-audit-*`

O próximo Codex deve:

1. confirmar que não há Node de auditoria ativo;
2. apagar apenas esses diretórios, validando que cada caminho resolvido está
   sob o diretório temporário e tem o prefixo exato;
3. executar `node --check tests/auditOAuthStatusPrecedence.test.js`;
4. executar somente esse teste com cwd na raiz do projeto e timeout curto;
5. resumir nomes de cenários e contagens, sem imprimir payloads;
6. submeter o resultado ao Chat independente antes de avançar para dashboard,
   causalidade ou correções.

## Travas preservadas

- Não acessar ou alterar produção durante a reauditoria.
- Não enviar mensagem WhatsApp, não forçar polling e não executar revogação
  real.
- `OPEN_FINANCE_WRITE_MODE=off` permanece obrigatório.
- `salvar <referência>`, revisão remota e escrita financeira Open Finance
  continuam proibidos.
- Não tocar nos arquivos antigos não rastreados.
- Não transformar o harness que registra comportamento inseguro em teste
  permanente antes de decidir como documentá-lo; ele pode ser removido depois
  de a evidência ser registrada.

## Próximo pacote independente

Após uma execução limpa do harness OAuth, enviar ao Chat a tabela:

`cenário | contrato esperado | código observado | teste | execução | resultado | efeitos persistidos | recuperação`

Somente depois do challenge independente decidir se o bloco OAuth/status tem
evidência suficiente e qual é o próximo pacote técnico.

## Fechamento da caracterização OAuth/status

A repetição limpa do harness passou `12/12`. O resultado verde documentou o
comportamento observado, não conformidade: state expirado falhou fechado, mas
seis status impeditivos alcançaram a conclusão e persistiram credenciais;
usuário inexistente e falha posterior deixaram a conexão comprometida; o mesmo
state avançou sequencialmente e em concorrência.

O Chat independente pediu dois controles adicionais. O harness foi ampliado
somente com:

1. `APPROVED_AWAITING_GOOGLE` sem conexão anterior;
2. `ACTIVE` com conexão preexistente.

A segunda execução passou `14/14`, com falhas zero. O controle positivo chamou
uma vez a troca de code, o lookup Google e a fronteira de conclusão, persistiu
uma conexão para o mesmo usuário e retornou `ACTIVE`. O caso `ACTIVE` percorreu
o mesmo callback genérico, trocou code, consultou a conta, sobrescreveu token e
identidade Google da conexão existente e chamou a fronteira de conclusão sem
política explícita de reconexão.

O arquivo temporário tem SHA-256
`2B41BB0E8EA3DAB2C34E8F579D9B05A43D301A79FBC3130E7BB594DC5468FA6B`.
Nas duas execuções, os diretórios SQLite falsos foram removidos apenas depois
do encerramento do Node, com validação de caminho e prefixo; resíduos finais
zero. Nenhuma rede, conta Google real, WhatsApp, produção ou segredo foi usado.

Limitação preservada: os efeitos internos de
`completeGoogleConnectionForUser` foram identificados estaticamente, mas a
criação/aplicação de planilha e a atualização real de lifecycle não foram
executadas nos dois controles adicionais. O revisor concluiu que isso pertence
ao pacote de causalidade e não impede caracterizar a precedência tardia.

O escopo familiar foi explicitado ao revisor: Daniel e Thaís formam um casal
com compartilhamento financeiro mútuo e uso consentido dos cartões. Visibilidade
intrafamiliar não é achado. O risco fica limitado à autoridade individual sobre
identidade, lifecycle, conexão Google e revogação. A severidade foi recalibrada
para `MÉDIA-ALTA`, circunscrita ao produto familiar, sem exploração real ou
impacto de produção demonstrados.

Veredito do subbloco:

- caracterização: encerrada;
- conformidade com o contrato de precedência: reprovada;
- correção: não avaliada nem autorizada;
- produção: não avaliada nem autorizada;
- challenge adicional: nenhum;
- próximo pacote permitido: `P5 - causalidade`.

A reauditoria geral continua aberta. O próximo pacote deve percorrer:

`state -> troca de code -> lookup Google -> persistência de credencial -> lookup do usuário -> conclusão -> planilha -> lifecycle -> resposta -> auditoria`

e classificar, em cada ponto de falha, efeitos comprometidos, rollback,
compensação, retomada e reconciliação. Nenhuma correção ou produção é autorizada
por este gate.

## Fechamento da caracterização causal Google

O segundo harness temporário de auditoria,
`tests/auditGoogleConnectionCausality.test.js`, executou a implementação real de
`completeGoogleConnectionForUser` em quatro cortes. No cenário final também
atravessou o callback OAuth e a rota HTTP reais. As fronteiras externas Google,
WhatsApp e resposta foram sintéticas; não houve rede, conta, planilha, token ou
dado financeiro real.

A arquitetura observada difere de uma premissa inicial do challenge: metadados
OAuth são persistidos em SQLite, enquanto o lifecycle é persistido na aba
`Users`. O ensaio usou o repositório OAuth real sobre SQLite temporário e
`updateUserStatus` real sobre um backing store sintético da aba `Users`, com
nova leitura do estado depois de cada erro.

Execução exclusiva:

- testes totais: `5`;
- cenários causais: `4`;
- aprovados: `5`;
- falhas: `0`;
- SHA-256:
  `1914D9388A1A18056F3EF7231221B5640F23303366470DC57EACBFC57B13EA7F`;
- temporários prefixados: `1 -> 0`;
- sintaxe e diff check: aprovados.

Efeitos confirmados por trace monotônico, ledger externo e snapshots novos:

1. falha antes da criação externa: zero commits novos, metadados e status
   preservados;
2. criação e template confirmados, seguida de falha antes dos metadados:
   planilha sintética órfã, sem compensação;
3. criação, template e `spreadsheet_id` confirmados, seguida de falha antes do
   commit de status: vínculo existente com usuário ainda
   `APPROVED_AWAITING_GOOGLE`, sem compensação;
4. OAuth, planilha, metadados e `ACTIVE` confirmados, seguida de falha de
   entrega HTTP: a rota tentou primeiro a página de sucesso e depois a página
   de erro; ambas falharam, os efeitos duráveis permaneceram e nenhuma resposta
   foi entregue.

O Chat independente aceitou a adaptação arquitetural e concluiu:

- qualidade da caracterização causal: `GO`, força alta;
- conformidade do comportamento: `NO-GO`;
- microcenário causal restante: nenhum;
- produção e correção: não autorizadas;
- severidade dos estados parciais: `MÉDIA`;
- falha de confirmação e ausência sistêmica de compensação: `MÉDIA-ALTA` no
  produto familiar fechado.

O ramo de aplicação de planilha existente não reabre causalidade: ele omite o
update de metadados porque o vínculo já existe e será exercitado no retry do
pacote seguinte. Visibilidade financeira entre Daniel e Thaís permanece fora
dos achados por consentimento mútuo.

Próximo pacote autorizado: `P5 - concorrência/idempotência`, somente local e
sintético, cobrindo retry após planilha órfã, retry após vínculo sem ativação,
duas conclusões simultâneas com barreiras determinísticas e replay após sucesso
durável com falha HTTP. O pacote deve caracterizar, não corrigir.

## Fechamento de concorrência e idempotência

O harness separado `tests/auditGoogleConnectionIdempotency.test.js` executou
quatro classes com as implementações reais da conclusão Google, persistência
OAuth e lifecycle. A concorrência usou barreiras determinísticas: ambas as
execuções leram `spreadsheet_id` vazio antes de as criações serem liberadas.

Integridade:

- execução exclusiva: `5/5`, falhas zero;
- SHA-256:
  `385B84BC607081B5A8F68939DE406A8FE14996EA8428644A7B0976AA56B0EB7C`;
- sintaxe e diff check: aprovados;
- temporários prefixados: `1 -> 0`;
- rede, Google/WhatsApp reais, produção, dados e correções: zero.

Resultados:

1. retry após planilha órfã criou uma segunda planilha, vinculou a nova e
   deixou a anterior sem referência ou compensação;
2. retry após vínculo sem ativação não criou nova planilha, mas reaplicou o
   template e promoveu `ACTIVE`;
3. duas conclusões simultâneas criaram duas planilhas, escreveram metadados em
   sequência `A -> B`, promoveram `ACTIVE` duas vezes e reportaram dois sucessos;
   o estado final apontou para `B`, enquanto `A` ficou órfã e o retorno da
   execução A deixou de representar o estado durável;
4. replay exato após falha de confirmação repetiu troca, lookup, salvamento
   OAuth, aplicação de template e promoção. Preservou o mesmo `spreadsheet_id`,
   mas sobrescreveu fingerprint de token e identidade Google sintéticos. O mock
   aceitar o mesmo code não foi extrapolado para o Google real.

Veredito independente:

- caracterização de concorrência/idempotência: `GO`;
- conformidade: `NO-GO`;
- severidade sistêmica: `MÉDIA-ALTA` no produto familiar fechado;
- microcenário restante: nenhum;
- correção e produção: não avaliadas nem autorizadas.

Não há evidência de exposição financeira intrafamiliar indevida. Os achados
são de confiabilidade, consistência e autoridade individual sobre OAuth e
lifecycle.

Próximo pacote autorizado: `P5 - revogação e recuperação`. Ele deve usar apenas
mecanismos já existentes para caracterizar autoridade individual, revogação
durante conclusão em andamento, tratamento dos estados parciais e replay após
falha de confirmação. Se não existir mecanismo de recuperação, a ausência deve
ser registrada; nenhum reconciliador pode ser criado durante a auditoria.

## Fechamento de revogação e recuperação

A inspeção confirmou que `oauth_connections.revoked_at` existe no esquema, mas
não há serviço, export, rota ou comando que grave esse campo ou revogue a
conexão Google individual. A capacidade de armazenamento é dormente; a
capacidade operacional de revogação está ausente na tree auditada.

O challenge foi recalibrado para não inventar produto. O harness
`tests/auditGoogleRevocationRecovery.test.js` usou somente caminhos reais e
passou `5/5`, hash
`DE21132676B00574E932A248475CA81944C695772B4D0DAECF4D04DEA3E2D742`.
Sintaxe e diff check passaram; temporários prefixados: `1 -> 0`.

Resultados:

- `INACTIVE` e `DELETED` pelo comando próprio real alteraram somente lifecycle;
  conexão, fingerprint de token sintético, `spreadsheet_id` e membership
  permaneceram, com `revoked_at` vazio e zero cascata OAuth/Drive;
- uma conclusão Google foi pausada depois de ler a conexão. A inativação real
  comprometeu `INACTIVE` e foi confirmada por nova leitura; ao liberar a
  conclusão, ela criou planilha, gravou metadados, promoveu `ACTIVE` e reportou
  sucesso, sem rollback ou compensação;
- a remoção administrativa de compartilhamento marcou o membership como
  revogado, confirmou uma remoção Drive sintética e preservou OAuth/lifecycle
  de ambos os membros e a planilha familiar.

Veredito independente:

- caracterização revogação/recuperação: `GO`;
- conformidade: `NO-GO`;
- revogação individual: ausente na tree auditada;
- falha/replay de revogação: dinamicamente inaplicável e funcionalmente
  `NO-GO` por ausência da capacidade;
- severidade: `MÉDIA-ALTA`, com a ressurreição no limite superior;
- separação compartilhamento/OAuth: sem achado adverso;
- microcenário restante: nenhum.

Os estados parciais e retries não foram repetidos porque já estavam fechados nos
pacotes anteriores. Não se afirmou validade de token no Google real.

Próximo e último pacote técnico do P5: `prova negativa`. Ele deve fechar o mapa
estático de entry points e sinks e executar somente dois controles fail-closed:
state válido com identidade adulterada sem nova assinatura e terceiro sintético
sem admin tentando um comando administrativo sensível. A conformidade geral do
P5 permanece `NO-GO` mesmo que esses controles localizados passem.
