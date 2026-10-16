# AC-08.1 — correção local e confronto causal, 15out2026

Daniel autorizou ampliações necessárias ao N02-G. Escopo causal fixado antes
de editar: BUILD normal existente + schemaBuild.cases,17paths; pin já permitido
em pathQualificationV3 atualizado ao RAW novo. HEAD04eb954/branch/WIP/índice
136staged preservados. Nenhum vendor patch, install, schema, norma ou engine novo.

## Causa e correção

Ajv8.17.1 uniqueItems usa índice{} no fast path string; __proto__ duplicado
escapa. O BUILD remove/reinstala a MESMA definição do keyword, preserva metadata
e erros, chama o codegen genérico original somente para string-only. Contexto
parentSchema temporário restaurado em finally, schema original intacto.
Outros tipos conservam caminho original. Custo O(n²) explícito; corpus validado,
não certificado universal de desempenho. Dois builders convergem nessa função.

BUILD RAW novo d01f9f3b7f00275dc61c41d48cd3d9f1ead7c472a7f8d04a7f0f4295f15ad16e;
regressões RAW 9824ed5c1273a129d7781c3764dec3f71b30220e59a0a722eefd5f33e0e0a761.
Pin é identidade, não revisão ou descarga. Schemas6 byte-exatos preservados.

## Execuções realmente observadas

- RED SCHEMA005:1FAIL em normal/compiled __proto__ duplicado:true!=false,
 1754ms/zeroSKIPcancel-todo/tool e native1. Nenhum SHA de stdout inventado.
- Focal005/006:2PASS/native0/2022ms/zero demais. Normal/admitido × compiled/
 standalone em memória, duplicatas especiais/ordinárias/tipos/nonmutation.
- SCHEMA001–006:6PASS/native0/6651ms/zero demais. Corpus normal completo,
 emissão standalone e regressões tipadas/uniqueItemsfalse/nonstrings.
- PATH079 com pin antigo:1FAIL em assertchanged>0, NÃO RED exato da guarda;
 baseline BUILD mudou e rejeitou antes da mutação. Shell0 por hash posterior,
 nativeexit não retido: não childPASS. Registro preservado, não apagado.
- PATH079 com pin novo:1PASS/nativechild0/runner0/248530ms/zero demais.
 Mutação in-memory do BUILD/schema/opções é recusada antes do selo.
- Integração9:13:02:18.374Z→13:05:02.649Z/164275ms/child0/runner0/exact9/
 9PASS/zeroFAILcancelSKIPtodo/errors[]. AUTHORING001/003/004/005,
 VALIDATION-TCB001/002,FINANCIAL-HOST001/002/003. Fluxo financeiro SINTÉTICO,
 não dados reais/witnessPATHv3 ou crédito. Report/log/err locais com prefixo
 .codex-temp/ac08-schema-integration-affected-20261015 e ponto nos sufixos.

Report8ccef0f6a1551a6d9c0286211057e6c948cf38602f1e689c272a542dc508c88d;
stdoutb247a6b0029732d69f393e1f3c5c9dcac26ee9c539987364aa3a217276ef0596;
stderr vazio/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
202fontes SHA154371599ae24abff2d9776937ea4e89378c67559a3cf0ee5adc9efa6db1a7ff
antes/depois/ATUAIS iguais, escopo causal NÃO closure BUILD/TCB completa.
Títulos/TAP/hashes atuais confrontados, sessão fechada. Nenhum teste pendente.

## Alcance e sequência

Regressões sustentam a correção da camada schema; não auditoria independente,
ausência universal de falhas ou qualificação. AC08 histórico não apagado por
controles posteriores. Ampla r4 agora histórica, não repetir isoladamente.
Preparar argumento S01/12passes source-bound no plano existente, manter premissas
externas false, recapturar candidato completo e uma ampla final estável antes
NOVO hash/UMA auditoria inteira. Protocolo C9/9+1 anterior permanece encerrado
INCOMPLETA; não retry cosmético, autoaprovação ou promoção de recibos ABC.

Criação de temporário recusada pela revisão automática por risco de duplicação;
não contornada/repetida. Acompanhamento ocorreu no turno aberto. Recuperação5h
ACTIVE/âncora2026-10-07T13:40Z preservada. Nenhum executor/auditoria ativo.
qualified/credit/exec/TCBoperacional/finance/receipt/parent/globalGO/NEXT03false0.
