# Transfer scope — revisão de código e fechamento da lacuna de acesso

Recebida em 2026-09-24, na conversa:
https://chatgpt.com/g/g-p-6aae7fa3ad5c8191a8ace5a6d799fab4-financasbot/c/6ab56e95-f6d0-83e9-ac1c-2f60625dc0fc

Candidato: `98de8ef46ab2e0c3ee58a326a073322367cedbdf`.
Pai único: `e7b78e3e94f540ed685d4d35d82aac9b6de8246a`.

## Primeiro parecer externo preservado — histórico

Veredito NO-GO focal por revisão incompleta. Nenhum defeito causal de código
CRITICAL/HIGH/MEDIUM encontrado. Auditor confirmou SHA/parent, sete arquivos,
testes, helper, evidência e fontes causais. Confirmou que transfer_pair é
observado antes da decisão final de exclusão por estado/período; date/state
podem ser lidos antes. A autoria decorre de evaluator/subject/role/presença,
com expected congelado antes da execução. Não encontrou falso verde nessa cadeia.

Bloqueador: limite de leitura do graphs-v2.json impediu confrontar diretamente
os três objetos completos antes/depois. Hunks, proposta e helper acessíveis
não foram aceitos como substitutos dessa leitura. O APTO documental anterior
não foi promovido a aprovação desta aplicação.

LOW relatado: --check não autentica independentemente os summaries salvos
das execuções. Números internamente consistentes poderiam ser falsificados.
O parecer reconhece que a evidência já declara execução local salva e que o
helper não reexecuta a suíte. Sem finding causal adicional no evaluator.

## Confronto local

O helper confirma a limitação: no modo --check recebe summaries do JSON salvo
e valida consistência, corpus e hashes. Não oferece atestação criptográfica de
execução e não deve ser descrito dessa forma. Essa propriedade nunca foi
critério implementado de autenticação independente; o limite foi mantido.
O stdout amplo local existente também registra valid=true, candidate_unchanged
e 2.402/2.392/0/10, sem constituir nova execução independente.

Não há correção de runtime justificada por esse parecer. O gate permanece
aberto até a leitura externa suficiente das fontes decisivas. Ampla verde não
repetida. Para resolver o acesso, preparar pacote de seis objetos completos
em worktree/branch auxiliar, ligado por verificador aos dois blobs originais
e aos hashes dos três arquivos testados. Não integrar a branch auxiliar.

Sem GO global N02-G, NEXT-03, deploy, produção ou dados reais.

## Continuação independente recebida — 2026-09-24

Veredito final: **APROVÁVEL**, exclusivamente para o candidato de código
`98de8ef46ab2e0c3ee58a326a073322367cedbdf`, pai
`e7b78e3e94f540ed685d4d35d82aac9b6de8246a`.
CRITICAL/HIGH/MEDIUM: zero. LOW anterior preservado, não bloqueante.

Evidência auxiliar efetivamente lida pelo auditor:
`07445669841a1526809d2c95df8913a7516bb66e`, pai único igual ao candidato.
Nove arquivos adicionados sob `docs/audit-evidence/n02g-transfer-scope-source-access/`,
em branch auxiliar isolada, sem mudança de runtime, corpus ou testes. Não integrar.

O auditor leu README, manifesto e verificador integral; abriu os seis objetos
before/after completos e examinou diretamente a região causal de cada par.
Confirmou +2 reads/+2 has por grafo e a preservação da fronteira derivation/proof.
Confrontou a reconstrução fixa do corpus inteiro do pai, identidade dos blobs,
76 fact_keys únicos e hashes dos três arquivos testados. A expectativa deriva
do delta autorado fixo, nunca de runtime/trace/oracle. O primeiro NO-GO não foi
apagado: a mudança de veredito decorre do acesso posterior à fonte decisiva.

Não houve execução independente do verificador ou das suítes pelo Chat:
github.com não resolveu em seu ambiente executável. `valid=true`, quatro
negativos do bundle e números das suítes continuam evidência local relatada.
`execution_authentication: false` permanece limite explícito; não se inventa
atestação de execução a partir de hash de conteúdo.

Confronto local posterior: remoto confirmou os dois SHAs; HEAD/parent do produto
continuam exatos; `prepare-transfer-scope-validation.cjs --check` PASS,
confirmando 3 grafos alterados, 73 preservados e exatamente +6 reads/+6 has.
Ampla verde não repetida. Nenhum finding causal justifica alteração adicional
do código aprovado. Recorte transfer scope encerrado focalmente; retomar a
sonda residual do N02-G sob o charter vigente, sem GO global antecipado.
