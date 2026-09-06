# Correção do preenchimento do notificador — 2026-09-06

## Estado

CANDIDATO LOCAL; prévia real sem envio aprovada; auditoria independente pendente.
Base: be77a942e36970010e2a7548f63dd21cb45e7548.
Branch isolada: codex/chat-notifier-composer.

## Objetivo e escopo

Corrigir a verificação do texto no editor do Chat, sem mudar destino, transporte,
watcher, retorno, runtime financeiro ou configurações. Os dois scripts versionados
não contêm configuração local, mensagem de auditoria, perfil ou autenticação.

## Evidência causal

O bot anterior comparava imediatamente innerText.trim() com a string enviada.
A mesma comparação já existia no backup anterior à confirmação persistida.
Teste isolado reproduziu divergência CRLF/LF, mas normalização e espera sozinhas
continuaram falhando na prévia real. A leitura do editor mostrou 13 parágrafos,
30 quebras em innerText e nenhuma em textContent. São representações diferentes
do texto lógico: não basta remover todas as quebras ou relaxar a igualdade.

O candidato lê parágrafos e conteúdo inline, preserva linhas vazias e rejeita
estruturas não modeladas; normaliza CRLF/CR e whitespace externo; aguarda até
10 segundos, sem repetir inserção. Divergência interrompe antes do envio.

## Validação observada

- parser PowerShell sem erros;
- nove assertions do leitor estrutural em Node, inclusive elementos desconhecidos;
- regressões de CRLF, conteúdo alterado, linha vazia removida, atraso do editor,
  duplicidade, mismatch permanente e mensagem vazia aprovadas;
- prévia real aprovada, preservando integralmente 2.543 caracteres do rascunho;
- botão de envio não acionado; nenhuma auditoria nova enviada;
- não executada suíte financeira ampla: esta alteração não toca seu código;
- entrega, persistência e retorno ponta a ponta ainda NÃO comprovados.

## Próxima ação

Revisar e publicar somente este candidato sanitizado para auditoria independente.
Antes de uso automático pelo watcher, reconciliar o hash pinado da instalação;
não alterar a pinagem sem verificar qual instalação está ativa. Não declarar o
canal inteiro corrigido a partir do teste de preenchimento. O próximo envio deve
verificar ausência de duplicidade e confirmar persistência, sem retry cego.

Capacidade: Codex → Astra → Médio → validar instalação e entrega do notificador.
