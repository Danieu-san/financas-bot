# NEXT-02 — Vertical de gastos por categoria

Atualizado em: 2026-09-05
Estado: `OPEN — N02-A APROVÁVEL; N02-B EM VALIDAÇÃO LOCAL`
Base: `29791be6ba3f80fc8033bd6cb715484e7275a3c5`
Branch: `codex/financasbot-next-02`
Predecessor: NEXT-01 aprovado e ratificado por Daniel em 2026-09-03.

## Objetivo e autoridade

Implementar o vertical definido no roadmap
`financasbot-next-roadmap-draft-v2.md`: observações → eventos → claims →
tools para despesas por categoria, pessoa, conta/cartão e período.
Transferência e pagamento de fatura permanecem neutros para consumo.
A autorização humana abre este gate; não declara sua implementação aprovada.

## Escopo

- Kernel determinístico, isolado e read-only, com entradas sintéticas.
- Reutilização seletiva do v1: avaliar AST-04 (ledger projector) e os
  comportamentos já identificados no inventário NEXT-00 e manifesto NEXT-01.
- Claims tipados e integração com as boundaries existentes, sem recriá-las.
- Propriedades causais e Golden Set aplicáveis ao vertical; justificar
  explicitamente casos fora do domínio, sem reduzir invariantes críticos.
- Gate próprio de validação NEXT-02. Preservar o inventário congelado do
  NEXT-01 como evidência histórica, sem ampliar silenciosamente sua prova.

## Não escopo

Modelo remoto/agente NEXT-03, adapters reais/shadow NEXT-04, canal real,
writers, persistência financeira real, deploy, produção e dados privados.
Não migrar nem remover runtime v1. Não alterar o bot/canal de auditoria.

## Invariantes e riscos

Valores monetários e arredondamento seguem os contratos existentes.
Identidade, período, origem, coverage e estado devem sustentar cada claim;
igualdade de total não substitui identidade econômica.
Transferências e pagamentos de fatura não duplicam despesa.
Contexto confiável não pode ser substituído por argumentos não confiáveis.
Reaproveitar comportamento não significa importar dependências do runtime v1.
Não generalizar provas além do domínio implementado.

## Sequência e validação

1. Ler inventário AST-04, contratos de autoridade e fixtures relevantes;
   comparar o projector v1 e seus testes com as exigências do vertical.
2. Registrar mapeamento de reutilização e propriedades críticas antes do
   primeiro patch funcional; preferir extração/adaptação comprovada.
3. Escrever RED causal, implementar o mínimo e executar testes focais e
   bateria afetada. Revisar adversarialmente antes da suíte ampla.
4. Executar uma suíte hermética ampla no candidato estável, validar workflow,
   publicar commit sanitizado e pedir auditoria independente por hash.
5. Confrontar parecer com evidência local; fechamento e próxima fase dependem
   de ratificação humana, sem autorização operacional implícita.

## GO / NO-GO

GO exige kernel properties e Golden Set com 100% dos invariantes críticos
do vertical, ausência de efeitos reais, rastreabilidade factual e parecer
independente sem pendência bloqueante. Contagens isoladas não bastam.
Parar por ambiguidade normativa material, necessidade de dados reais ou
expansão além do gate; falha de teste não autoriza relaxar contrato.

## Próxima ação exata

Escopo estabilizado de N02-B: agenda interna derivada de observações sintéticas,
com opt-in next02-import-v2, vínculo installment_of, valores explícitos,
histórico e provenance de campos/versões. Não inclui consulta pública
billing_period, coverage dessa lente nem estornos por competência. A agenda
completa não promove parcelas projetadas a consumo confirmado.
Gate `--slice N02-B`: 15 fontes, 31 propriedades; parent final esperado
`4a6396000d15d98969b8291d6c162e5aafcd04b9`. Bateria afetada: 104/104 PASS.
Suíte ampla única concluída: 1.960 testes, 1.950 PASS, zero falhas,
10 SKIP previstos e runner válido. Próxima ação: publicar candidato para
auditoria independente. O restante do NEXT-02 segue pendente.

### Retorno N02-A e planejamento precedente

Retorno recebido em 2026-09-05: N02-A APROVÁVEL no SHA
`4a6396000d15d98969b8291d6c162e5aafcd04b9`, parent
`5d4339f46a9ec412d6c86894853435c7238dbcf1`. O parecer e o recebimento
estão no canal de orquestração; recebimento publicado em
`be77a942e36970010e2a7548f63dd21cb45e7548`.
Não reenviar esse objeto para auditoria. A próxima ação é mapear parcelas e
lentes temporais nos contratos/Golden Set e no v1, delimitar a próxima fatia
e seus REDs antes de implementar. Motor de provenance e conclusão integral
do gate continuam pendentes. Nenhuma autorização de NEXT-03 ou operação real.

### Histórico da fatia N02-A antes do retorno

Publicar e reauditar o delta corretivo da fatia N02-A descrita em
`financasbot-next-02-kernel-reuse-v1.md`. O primeiro núcleo implementa
observações/versionamento, compras/receitas/transferências/pagamentos/estornos,
consumo transaction_date, coverage e expenses.sum pelo gateway existente.
Reaproveitamento AST-04 é por comportamento e serialização adaptada, não import
do módulo legado. O NEXT-01 permanece congelado em seu hash aprovado; a
análise compartilhada agora aceita contratos explícitos por gate, mantendo
os defaults NEXT-01. O gate N02-A declara seu inventário de 14 fontes.

O parecer de 2026-09-05 sobre o primeiro candidato bloqueou IDs internos na
boundary pública, coverage completa antes do fim do intervalo e perda de
`settles_card_id`. As três classes foram corrigidas localmente sem alterar o
gateway compartilhado, importar runtime v1 ou ampliar a fatia. O novo hash
continua dependendo de auditoria independente antes de qualquer ratificação.

Ainda não concluídos: parcelas, demais lentes temporais, Golden Set completo
e o motor de provenance. A conclusão de N02-A não fecha NEXT-02.
