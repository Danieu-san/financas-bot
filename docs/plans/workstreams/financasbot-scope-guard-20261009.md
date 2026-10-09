# DOMESTIC-SCOPE-01 — trava operacional contra expansão silenciosa

Estado: d09df34 NO-GO FOCAL por SG-01; correção local em validação, sem GO. Autorização humana:
Daniel pediu prevenção de scope creep, respondeu “faça” e “corrija o erro e siga”.
Não ratifica roadmap total nem altera a norma PATHv3 congelada.

## Recibo2026-10-09 — auditoria d09df34 e correção SG-01

Auditoria independente concluída na conversa NEXT
https://chatgpt.com/g/g-p-6aa305ab1f8c8191a3f89baff00cc701-next/c/6ac90eb3-41f0-83e9-ac01-5b9eb4acabe0
Alta3de3 confirmada no envio; modelo efetivo não exposto. Confirmou commit
d09df34c913cbe967c3a7f58b3a227522d0bfcca/pai72fc5a5b707909687da9b5cec892be2dcc892a62/
tree8a289670694aa7f5f55e4991143694aff764f17c/9paths integrais e dependências.
Veredito NO-GO FOCAL por SG-01 ALTA, único bloqueante: paths obtidos por diff
HEAD eram medidos somente no disco; conteúdo/exclusão staged ocultos pelos bytes
do baseline escapavam. Auditor reproduziu mecanismo Git em fixture isolada,
NÃO executou suíte original ou WIP local. Benefício/necessidade/menor delta e
demais controles adequados no domínio declarado. Baseline267/hash877c71bc...
conferidos independentemente, histórico611→267 não reexecutado. Nenhum GO global.

Confronto local: SG-01 confirmado por RED2FAIL causais (true indevido) depois de
uma tentativa sem evidência causal por bloqueio de escrita .git da fixture no
sandbox. Execução aprovada isolada reproduziu a causa sem ACL/UAC/config global.
Original-first reconfirmado: main/e00f6ebc/54WIP e hash do validador b958180a...
inalterados. Índice desta worktree contém136paths staged preexistentes; não
remover/resetar nem rejeitar indiscriminadamente esse WIP para mascarar SG-01.

Menor delta: digest SHA-256 de JSON ordenado dos registros REAIS do índice
(path/mode/object/stage), exceto nove paths autorizados e .codex-temp, ligado
explicitamente ao contrato. Pin medido readonly durante correção, não alegado
como prova histórica do índice8d37249 nem de necessidade humana:
f47e118282695768c5c0068e223f57d95d3b13dacc207dd7b35af5ae06675add.
Baseline físico267 e SHA877c71bc... permanecem EXATOS, sem recaptura.
Drift fora do recorte bloqueia independentemente do disco; staged autorizado
conta no mesmo orçamento; exclusões/merge não resolvido nos paths autorizados
recusados. Metadados/objects Git são identidade do índice, não SHA raw do disco.
Mesmo limite contra adulteração deliberada do próprio contrato, sem segurança
geral ou autenticação nova. Novos casos Git real preservam staged anterior e
recusam alteração/exclusão/add/mode hidden; allowed staging positivo+orçamento.
Focal3PASS19146.7962ms/afetados11PASS34813.5955ms/zero demais/exit0.
UMA final proporcional corrigida:63tests/63PASS/zero demais/exit0/37406.7038ms,
sessão39976 concluída. Não repetir esse verde sem delta causal. Próximo candidato
completo herda d09df34 e altera cinco paths deste mesmo recorte, sem exclusões;
baseline267/hash877c71bc e demais quatro paths publicados permanecem iguais.
Só guard/teste/contrato/recibo/checkpoint dentro dos MESMOS nove paths; nenhum
incremento PATHv3 ou novo requisito lateral. Auditoria nova exige novo hash.

## Necessidade, original primeiro e menor delta suficiente

Falha observada: normas escritas impediam GO indevido, mas não impediam uma
sequência de referências BUILD crescentes. “Unresolved” foi usado como fonte
recorrente de trabalho; nenhuma porcentagem/ETA global honesta resultou disso.
Precisão, compreensão e follow-ups do Next continuam objetivos integrais.

Original atual consultado em2026-10-09: main/e00f6ebcf97e6bfdb2b7791939c22e879917f3f0,
54WIP preservados, sem produção/dados privados. Reutilizar e adaptar
scripts/agent/validateAgentWorkflow.js: já verifica memória, contratos, segredos
e Git, mas não compara delta com escopo finito. SHA original b958180a92f3b26cd8e65a12307e7e4e58fefcff5d255bac30bfdd69de4cc2a0;
SHA candidato anterior5c2280630f7cb5b5a6d46828354ff97cfa49f069dfc323f24746dabbb3d336a4.
Não substituir o validador, runtime, kernel ou controles financeiros.

## Recorte finito e saída

Três entregas, nove paths exatos declarados em docs/agent-workflow/active-scope.json:

1. Reconciliação residual abaixo, sem implementar a fila PATHv3.
2. Comparador pequeno de Git+bytes atuais versus baseline de WIP, contrato
   explícito com causa/controle/reuso/evidência/delta suficiente/custo/saída.
3. Testes negativos, workflow integrado e revisão independente do candidato
   completo antes de declarar a trava pronta. Uma ampla final proporcional ao
   recorte de workflow estável, não uma ampla do produto por inércia.

Não escopo: solver/interpretador geral JS, novos helpers PATHv3, runtime,
compilers/checkers/oracle/trace/schema/IDs/quotas/norma/perfis, produção, deploy,
auth/UAC/ACL, crédito financeiro ou integração do WIP. Causal106 não iniciar.
Nenhum achado deste recorte cria automaticamente outro requisito.

## Reconciliação residual PATHv3 — não é autorização de implementação

Autoridade: método72fc e ratificação já existentes; critérios não dispensados.
Evidência: plano financasbot-pathv3-implementation-20261008.md e checkpoint
doméstico. Não repetir o censo2032pendentes/29grupos, suites verdes ou históricos.

| Frente | Estado demonstrado | Controle necessário / reuso | Destino finito |
| --- | --- | --- | --- |
| Migração1:1/L e seleção | Inventários e diagnósticos locais; causal67/71 verdes | Inventário autoral/guardas normais existentes; sem renomear crédito antigo | Manter candidato/evidência; fechar lacunas de L/A contra contrato, sem inferir por erro observado |
| IR/programas/funcional | Baseline/C-M-S,76grafos/39assets e bytes ligados; causais73–104 verdes | Autoria privada e receitas normais já reutilizadas | Manter; conformance não é execução, efeito, equivalência ou auditoria |
| Origens/retornos | Modelos condicionais;056/057+0553PASS; causal106 NÃO iniciada | ABI/handles e sementes normais genuínas, sem expected de output | Congelar incremento. Gaps primeiro classificados por causa e relevância no bundle real; nenhum helper novo automático |
| Closure/capacidades/efeitos/consumers | Censo lexical/links não provam totalidade; unknowns explícitos | Closure finita do programa real e controles/observação existentes | Necessário à alegação composicional quando aplicável; se exigir modelo geral JS, parar/reconciliar, não ampliar por inércia |
| BUILD/TCB/ticket/referência | Sem qualificação/auditoria da implementação inteira | Captura hermética e admissão existentes; fechamento auditável | Obrigação do método, não melhoria opcional. Evidência inteira antes de alegar aprovação |
| A/W/partição e qualificação | Ainda incompletos; crédito PATHv3 zero | Regras ratificadas, witness independente pré-M, controles normais e fresh invocation | Blocked até provas exigidas; igualdade necessária não concede crédito; nenhuma requalificação histórica |
| Generalidade futura/otimizações laterais | Benefício não demonstrado para saída atual | Alternativa mais simples e reuso primeiro | Backlog; sem implementation por “robustez” nominal ou ausência de arquivo |

Essa tabela não equivale a percentual global nem cronograma. N02-G e roadmap
global continuam incompletos. Fatia selected-day histórica continua crédito1
somente one_fresh_profile_invocation_not_a_consolidated_ledger; não somar.

## Regra de inclusão e revisão

Antes de cada próxima etapa: confirmar original/versão-WIP e comportamento
reutilizável; descrever falha doméstica ou critério ratificado ameaçado; ligar
controle/evidência/delta suficiente/saída. Correção necessária bloqueia o recorte;
melhoria não bloqueante exige impacto/frequência/confiança, alternativa simples,
custo inicial+manutenção e benefício verificável antes de decisão humana.
Sem esses elementos, registrar/adiar, não implementar. Qualidade não é opcional.

Lista de arquivos e orçamento não se ampliam automaticamente. Novo path, causa,
autoridade normativa ou capacidade geral exige reconciliação explícita e
autorização correspondente antes de alterar active-scope/baseline. A trava
anti-remendo existente continua valendo. Não responder a orçamento excedido
removendo controle necessário, escondendo arquivo ou recapturando WIP.

## Limites honestos da trava

O comparador cobre paths Git tracked/untracked não ignorados FORA de
`.codex-temp/` e bytes atuais,
branch/HEAD, integridade do baseline, causas declaradas e invariantes obrigatórias.
Preserva WIP anterior fora do recorte; rejeita inclusão/modificação/remoção nova
não declarada, exclusões permitidas por nome mas não autorizadas e ausência de
contrato. Não lê conteúdo privado do WIP; mede bytes apenas dos paths Git.
Artefatos locais ignorados e `.codex-temp/` (brutos/execução local, não publicação)
não estão cobertos; não são autorizados por esta omissão. O diretório temporário
é excluído explicitamente, inclusive quando não ignorado pelo Git. Não importar
dele código/autoridade novos para contornar a trava. Baseline inicial corrigido
por remoção APENAS das344entradas temporárias;267paths públicos anteriores e
seus hashes preservados, sem recaptura de bytes de código/doc para esconder drift.

Não prova semântica/necessidade, não autentica uma decisão humana, não impede
um agente malicioso de editar simultaneamente o contrato e o comparador, nem
impede fisicamente a primeira edição fora do escopo. É uma barreira de workflow
antes de testes amplos/commit/handoff/continuação, complementada por diff e
auditoria independente. A auditoria deve avaliar também necessidade e escopo,
não só correção interna. Teste verde não torna reviewed/release nem GO.

## Próxima ação exata

RED2FAIL→focal2PASS; bateria adversarial8PASS; UMA final ampla do recorte de
workflow60PASS/zero demais/exit0/21027.3879ms. Syntax/workflow/active-scope OK.
Preparar candidato sanitizado completo e auditoria independente. Até isso: candidato,
nenhum novo executor PATHv3, sem GO global e sem simplificação das garantias.
Atualização após SG-01: a final63PASS acima substitui somente o estado do NOVO
candidato corretivo, não retifica a evidência60PASS ou NO-GO do hash d09df34.
