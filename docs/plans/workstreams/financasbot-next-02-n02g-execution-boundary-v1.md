# N02-G — decisão de implementação da fronteira de execução

Data: 2026-09-12. Estado: DECISÃO DE IMPLEMENTAÇÃO WIP; ENFORCEMENT PENDENTE.
Base técnica: `35839dcd4aedb685a9ce9a881b6c1457ce5118d2`.
Autoridade: charter `financasbot-next-02-n02g-v1.md`, §§4–8, e NEXT-00
ratificado. Este documento não substitui essas autoridades, não ratifica SES
como runner pronto e não abre integração, NEXT-03 ou produção.

## 1. Decisão e limites

Usar SES em processo Node descartável para executar bundles fechados, com um
compartment novo por invocação/fase e somente capabilities instrumentadas.
Reutilizar os passes do compiler, os contratos e a canonicalização existente.
Não construir outro interpretador financeiro nem um sandbox JavaScript próprio.

SES restringe autoridade e intrinsics; o processo separado permite encerramento
externo e separa o heap JavaScript do processo chamador. Nenhum dos dois, sozinho,
prova provenance. Processo separado não é sandbox de SO nem garantia contra
esgotamento de toda a memória da máquina. Limites e timeout compram falha fechada,
não disponibilidade absoluta. O worker do probe permanece apenas experimento.

Modelo de ameaça: código evaluator/operator defeituoso ou adversarial, entradas
malformadas, artefatos trocados e tentativas de reutilização entre invocações.
Node/V8, SO e plataforma de execução pertencem à fronteira externa declarada e
pinada. Não se promete resistência a comprometimento desses componentes nem a
um mantenedor que altere simultaneamente código e autoridade de freeze; este
último caso exige revisão independente do novo delta imutável.

## 2. Identidade executável e bootstrap

O build deve produzir um inventário fechado de bytes UTF-8 exatos após geração
e bundling. Inclui entry, helpers, imports transitivos incorporados, constantes,
tabelas e configuração comportamental. Não normalizar line endings nesta etapa.
Cada root é derivado de manifesto canônico com paths únicos, tipos de artefato,
digests e dependências; inventário extra, faltante, ambíguo ou ciclo inválido falha.
Nenhum root esperado pode ser derivado do próprio candidato durante admissão.

| Fronteira | Conteúdo obrigatório |
|---|---|
| Evaluator artifact root | Bundle funcional fechado e todas as dependências comportamentais declaradas, incluindo o perfil de execução referenciado por conteúdo |
| Proof engine root | Programa de prova gerado, implementações dos operadores e seu closure, sem oracle nem expectativas de trace |
| Validation TCB root | Bootstrap do projeto, loader, SES efetivamente carregado e dependências, configuração de lockdown, host, proxy, recorder, admissão de outputs, protocolo, validadores e verificadores confiados |
| Freeze | Hash do registry de evaluators e roots independentes de prova/TCB e demais autoridades conforme NEXT-00; não uma segunda tabela normativa de roles/hashes de evaluators |

Uma dependência compartilhada pode participar de mais de um closure por
referência ao mesmo conteúdo; isso não cria uma segunda autoridade de registry.
Compiler, geradores e receita/toolchain de build também são congelados nas
fronteiras pertinentes, sem confundir hash da receita com hash do produto gerado.

O loader mede os bytes capturados que serão usados, sem medir um arquivo e
reabri-lo depois para execução. Imports e lookup de filesystem durante execução
guest são proibidos. A resolução de dependências do TCB também deve corresponder
ao closure medido, não ao node_modules ambiente nem a hooks de NODE_OPTIONS.
Um bootstrap mantido pelo projeto nunca fica fora do TCB por ser o primeiro a
rodar. O lançamento externo identifica a cápsula/TCB revisada antes de executá-la;
o bootstrap não autentica a si próprio com um hash que ele mesmo escolheu.

### SES não pode esconder uma transformação

O modo escolhido usa somente evaluate de bundle fechado, sem módulos SES,
transform callbacks, shim transforms, modo sloppy ou opções de evasão. No SES
2.3.0 inspecionado, os transforms obrigatórios e a rejeição de direct eval
preservam a string aceita ou lançam erro. Isso precisa virar teste do perfil
pinado; não é uma propriedade assumida de versões futuras.

SES ainda constrói um wrapper de avaliação. Seu gerador, intrinsics capturados,
opções e configuração dos globals pertencem ao closure/TCB medido; não são
runtime externo implícito. Identificar só o bundle guest seria insuficiente.
O build deve preservar a identidade do bundle final e de todos esses componentes.
Qualquer transformação adicional exige artefato efetivo medido e nova revisão;
não aceitar equivalência nominal source/build. Código de máquina/JIT permanece
na fronteira Node/V8 pinada, não se alega hasheá-lo como artefato do projeto.

## 3. Perfil guest mínimo

Código síncrono, sem imports, eval, construtores de código, async/await ou
capabilities assíncronas. Validar a gramática do bundle e admitir conteúdo
revisado; AST não volta a ser prova de segurança de JavaScript arbitrário.
Não basta remover o identificador Promise: sintaxe async também deve ser recusada.

Não endow APIs Node, filesystem, rede, console, timers, relógio, aleatoriedade,
IPC, Compartment, WeakRef, FinalizationRegistry, SharedArrayBuffer ou WebAssembly.
Timezone/policy necessários são operandos versionados; nada de locale ou relógio
ambiental. Globals e intrinsics ficam congelados, configuração SES explícita,
sem defaults comportamentais vindos do ambiente. Falha de lockdown aborta.

Resta apenas a superfície funcional necessária e os handles. Criar compartments
novos impede estado lexical entre evaluators. A forma de isolamento não autoriza
usar resultados anteriores sem recibo validado da mesma execução.

## 4. Handles, programa e observações

TCB retém snapshots/claims/registries crus. Guest recebe handles endurecidos sem
prototype ou acesso a seu backing store. Valores escalares materiais podem sair
por leitura observada; records/coleções retornam handles, não arrays/objetos crus.
Existência, keys, índice, ordem, membership, cardinalidade, iteração, encerramento
de iterator, seleção e traversal precisam de operações instrumentadas próprias.
Consultar non_material ou usar handle revogado/de outra invocação aborta a
invocação, mesmo se guest capturar a exceção. Nenhum read estrutural é gratuito.

O IR tipado atual não será entregue cru ao guest. O build baixa suas instruções
e literais revisados para o programa de prova fechado; não baixa payloads de
snapshot, R ou oracle para constantes. Os operadores acessam evidências somente
pelos handles. Programa/constantes são código medido; dados runtime são operandos
observados. Os testes devem impedir copiar evidência para uma constante e assim
dispensar uma leitura. Não há branch de prova por métrica ou fact_key.

expected_trace fica exclusivamente no validador de aceitação, nunca no bundle
guest ou no recorder. Seleções reais são observadas na execução; percorrer a
lista esperada e emiti-la não constitui captura externa.

Proxy emite I e loader fornece M pela interface interna. Recorder possui L e
produz as projeções T, preservando multiplicidade/ordem do log. Confronto por
conjunto não apaga essas informações. Guest não recebe evento pré-materializado,
builder, callback de escrita, recorder ou referência mutável a L/T.

## 5. Resultado e encerramento da invocação

Antes de inspecionar o valor retornado, revogar todos os handles da invocação.
Admissão funcional não executa getters, toJSON, coerções ou callbacks guest.
Rejeitar Promise/thenable, funções, accessors, símbolos, proxies, protótipos
exóticos, ciclos, profundidade/tamanho excessivos e valores fora da assinatura.
Detecção de Proxy precisa usar mecanismo confiado que não dispare suas traps;
se isso não for demonstrado na implementação, não admitir objetos guest.

Copiar apenas dados funcionais aprovados para o canal R. R e intermediários
nunca entram em L/T. A comparação com oracle pertence ao harness, fora do
processo guest. Uma quantidade observada no trace deve ter vindo de I, não de R.
Falha de admissão invalida a invocação inteira, mesmo se já houver leituras válidas.

## 6. Processo e protocolo

Host cria execution_id/invocation_id e limites antes do lançamento. Nenhum desses
IDs vem de guest. Launch usa executável e bootstrap pinados, sem shell, ambiente
mínimo explícito, sem hooks herdados, processos auxiliares ou código remoto.
No Windows, lançamento de helper é oculto. Guest não tem acesso ao canal IPC.

Um processo executa uma invocação de grafo, com compartments distintos de
derivação/prova. O recorder fica no host chamador, mantém o único L da execução
e recebe I/M do TCB filho, nunca um trace montado no filho. Transporte de eventos
não autoriza o proxy a agregar ou persistir trace. Sequência, limites e conclusão
do envio devem ser conferidos antes da aceitação; perda de evento falha fechado.
O host pode iniciar o próximo grafo do DAG somente depois de criar o recibo do
pai após término limpo. Assim a dependência não exige aceitar um pai provisório.

Deadline e limites de mensagens/dados são controlados externamente. Timeout,
crash, excesso, mensagem desconhecida, duplicada, fora de ordem ou de outra
execução recusam o resultado. Não aceitar stdout como protocolo nem stderr como
diagnóstico público. Erros públicos são códigos finitos, sem string guest.

Mensagens R e T permanecem distintas, vinculadas pelo host; um transporte não
se torna autoridade de trace. Respostas são provisórias até concluir a validação
e confirmar término limpo do processo. Encerramento forçado não gera recibo.
Recibo de pai fica fora de L/T e só é criado após aceitação de R e da prova;
uso posterior de seu valor é nova leitura instrumentada na execução correspondente.

## 7. Provas antes de qualquer evaluator financeiro

| Fronteira | RED causal obrigatório e controle positivo |
|---|---|
| Closure | Alterar helper, bundle, transformação, perfil SES, bootstrap e dependência; extras/omissões; substituir arquivo após captura; bytes admitidos originais ainda executam |
| Autoridade | APIs ausentes, constructor direto/indireto, callback host, globals/intrinsics, async sintático, imports e codegen; operação pura permitida passa |
| Dados | Leitura escalar/estrutural, coleção vazia, early termination, non_material, handle cruzado/revogado; recorder não recebe expectativas |
| Canais | Guest tenta fabricar reads/roles/hashes, fornecer trace ou alcançar recorder; I/M legítimos materializados somente pelo recorder |
| Saída | Getter, Proxy, thenable, callback e objeto profundo/malformado; nenhuma leitura após revogação; R válido continua separado de T |
| Ciclo de vida | Loop, timeout, rejeição, crash, mensagens duplicadas/cruzadas e término anormal; zero recibo nesses casos |
| Determinismo | Mesmos artefatos/operandos geram mesma computação e observações sem IDs efêmeros; compartments não compartilham estado guest |

Rodar esses testes com fixtures sintéticas mínimas, ainda sem os 39 evaluators.
Não reduzir as invariantes se a tecnologia falhar. Nenhum teste acima é declarado
PASS por estar nesta tabela. Depois da fronteira demonstrada, implementar todos
os operadores/evaluators e witnesses conforme a sequência integral do charter.

## 8. Evidência atual e próximo incremento

### Admissão de bytes — formato inicial implementado em 2026-09-14

`artifactLoader.js` recebe manifesto em Buffer, entries `{path, bytes}` e
expectedRoot fornecido pelo host confiado. Não lê filesystem nem executa source.
Manifesto fechado: `format: financasbot.provenance.artifact`, `version: 1`,
`kind: metric|proof|tcb`, `entry` e `files` ordenados por path; cada arquivo tem
somente `path`, `media_type` e `sha256`. Neste formato inicial são permitidos
JavaScript `.js` e JSON `.json`; entry deve ser JavaScript. Novos tipos exigem
extensão explícita e revisão, não descoberta automática por extensão.

A raiz é `sha256:` dos bytes UTF-8 do manifesto canônico, sem newline. Seus
digests referenciam as folhas de bytes exatos: árvore Merkle plana, sem resolução
recursiva, referências externas ou normalização de source. Reordenar entries
de transporte não muda a admissão; reordenar a lista normativa files é inválido.
Reutiliza canonicalValue somente para esse manifesto, não para normalizar código.

Captura e mede bytes antes de publicar um recibo marcado internamente. Conteúdos
admitidos são strings imutáveis; buffers posteriores do chamador não são relidos.
Medições são dados observados, não writes de trace. Cópia/serialização do recibo
não permite recuperá-lo como admissão local. Limites iniciais: 512 arquivos,
256 KiB de manifesto, 8 MiB por arquivo e 32 MiB totais de payloads. Esses limites
são rejeições de entrada, não quotas de memória do processo.

O retorno permanece `admitted_artifact_bytes_only`, `executable: false`.
Hash coincidente não prova que files contenha toda dependência executada, que
JSON seja um perfil válido ou que JavaScript seja seguro. Build fechado,
enforcement do perfil/runner e revisão da autoridade continuam necessários.
Não atualizar um pin automaticamente para fazer um candidato passar.

Observado no HEAD base: probe SES dev-only em Node 22.17.0/Windows, 12 checks de
autoridade, compartments frescos e interrupção de loop em worker. Não prova
processo, closure, handles financeiros, recorder, protocolo ou saída segura.
103 testes do compiler estavam verdes; não foram repetidos por esta decisão
documental. Compatibilidade Node 20 não foi demonstrada.

Próximo incremento: REDs e implementação delimitada de admissão de artefatos e
perfil fechado, seguida de handles/recorder e lifecycle. Registrar paths concretos
no checkpoint antes de criá-los. SES continua dev-only até a decisão de embalagem
ser materializada e revisada; nenhuma dependência muda neste documento.

Atualização de execução em 2026-09-14: perfil imutável implementado em
`executionProfile.js`, com as 14 opções SES dependentes de ambiente explicitadas,
opções evaluate fechadas e globals negados. Validação build-time com Acorn exige
uma FunctionExpression síncrona de parâmetro único operands; imports e sintaxe
async/generator são recusados inclusive em funções internas. Isso preserva source
e retorna guest_grammar_only/executable=false; não tenta provar ausência de
capability por AST. Teste explícito mostra que constructor computado passa pelo
passe gramatical e precisa ser barrado pela fronteira SES/admissão revisada.

O probe anterior foi substituído, não duplicado: agora usa child Node descartável,
ambiente vazio, janela oculta, heap V8 limitado e perfil compartilhado. Só aceita
resultado após close com status zero; erro posterior ao resultado, mensagem
duplicada e loop posterior ao resultado foram rejeitados. Observados: 13 checks
de autoridade (incluindo todos os globals negados), uma leitura sintética,
compartments independentes e interrupção externa; três recusas de lifecycle.
Os seis testes de perfil passaram; a bateria perfil+admissão passou 19/19.
Não foi repetida a bateria verde de 116 testes do incremento anterior porque
os fontes do compiler/loader não mudaram. Esses números são execuções distintas.

No encerramento daquele incremento de perfil ainda não havia captura externa
I/M/L/T, R admitido contra assinatura, cápsula TCB fechada ou medição de todos
os bytes carregados. O probe usava módulos locais de desenvolvimento; não era
o loader hermético final. A camada de observação seguinte está registrada abaixo.

### Observação inicial implementada — atualização posterior de 2026-09-14

`instrumentedAccess.js` recebe bindings/shape do TCB, captura somente dados
simples limitados e fornece handles com prototype nulo e métodos congelados.
Records/coleções nunca são retornados como payload cru; escalares e respostas
do protocolo de iterator são observados antes da entrega. Os pacotes done/value
do iterator são protocolo constante, não snapshots ou novo canal funcional.

Operações implementadas: get, has, keys, length, at, includes escalar, abertura,
avanço, retorno e reaquisição de iterator. Keys devolve outra sequência de handles;
reestruturar essa projeção com keys novamente é operação não suportada e falha,
em vez de perder a origem da projeção. non_material não aparece na enumeração
e tentativa de get/has é recusada independentemente de sua presença no payload.
Erros de uso ou do sink ficam latentes: capturar a exceção no guest não recupera
a invocação. Revogação afeta handles/iterators já emitidos, inclusive se ocorrer
durante o envio de uma observação. Validação de saída deverá revogar primeiro.

I usa tupla de sete posições: canal, operação, alias, role, path, projeção e
outcome bruto. M usa tupla de três: canal, espécie de medição e digest observado.
`observationContract.js` admite somente formatos finitos, sem getters/proxies ou
coerções. `causalRecorder.js` transforma essas tuplas em L, atribui ordem/fase/
invocação e gera views imutáveis. Preserva leituras repetidas; não recebe
expected_trace ou R. Scopes sobrepostos/repetidos, eventos após seal, canais
malformados e excesso invalidam o recorder. Quotas: eventos configurados pelo
host, até 1 milhão, e bytes totais serializados, padrão 8 MiB/máximo 128 MiB;
uma quota não substitui a outra ou limites do processo.

Focal integrada observada: 142/142 PASS, zero FAIL/SKIP/TODO. REDs adicionais
confirmaram revogação no sink, limite de bytes, projeção de keys repetida,
reaquisição de iterator e índice -0; corrigidos antes da publicação. Probe SES
em processo filho: sete checks de handles, dez eventos I recebidos/materializados
no pai e um early return. Cenário de handles recebe somente operands, sem a
capability read antiga do probe. Preservados os 13 checks de autoridade e as
três recusas de lifecycle. Suíte ampla não iniciada.

Limites: shape ainda não está vinculado mecanicamente aos schemas/registry
admitidos; essa API é interna e não aceita chamadas de produto. Seleções de nós,
traversal de arestas, operações financeiras observadas, pais, nominalidade dos
eventos e confronto integral com os 76 grafos continuam pendentes. O resultado
do recorder é observations_only, não prova de aceitação. Captura sintética de I
via IPC foi demonstrada, mas a cápsula TCB medida e o protocolo final ainda não.

Referências técnicas consultadas, não autoridades de GO do projeto:

- [SES: compartimentos e capabilities](https://github.com/endojs/endo/blob/master/packages/ses/README.md).
- [SES: limitações de isolamento e disponibilidade](https://github.com/endojs/endo/blob/master/docs/lockdown.md#limitations).
- [Node 22.17: limites de recursos dos workers](https://nodejs.org/download/release/v22.17.0/docs/api/worker_threads.html).
- Implementação instalada SES 2.3.0: `src/make-safe-evaluator.js`,
  `src/compartment-evaluate.js`, `src/transforms.js`, `src/make-evaluate.js`.

Essas referências fundamentam a escolha; o gate final precisa provar o closure
efetivamente empacotado e a execução local, não apenas citar a biblioteca.
