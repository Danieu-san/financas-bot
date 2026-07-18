# Relatório de domínio — identidade, privacidade e segurança

Objeto: tree `363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.

## Veredito

`NO-GO` para expansão multiusuário. O beta familiar atual pode permanecer em
observação sem ampliar usuários, desde que não se interprete o resultado como
aprovação do modelo de identidade.

## Achados confirmados

### AUTH-01 — P1 — admin por nome controlável

O fallback de `src/utils/adminCheck.js:43-52` compara o nome do cadastro com o
nome associado a um ID admin. O cadastro inicial copia `notifyName`/`pushname`
e o onboarding aceita novo nome. O handler admin roda antes do gate de acesso.
Os testes atuais codificam esse fallback como comportamento esperado.

Impacto: um identificador não incluído em `ADMIN_IDS` pode ser tratado como
admin. A confirmação em duas mensagens confirma a ação, não autentica o ator.

### AUTH-02 — P1 — OAuth reutilizável e desacoplado do status

O state é assinado e expira, mas não tem nonce consumível. O callback troca o
código e salva tokens antes de buscar o usuário; a conclusão sempre grava
`ACTIVE`. Um link anterior ao bloqueio/inativação/exclusão pode reativar o
cadastro enquanto ainda estiver válido.

### AUTH-03 — P1 — lifecycle não revoga acessos

Inativação, bloqueio e exclusão só mudam o status. Não há revogação de token
Google no store nem cascata de remoção de permissões Drive. O comando separado
de remover compartilhamento faz a ordem correta, mas não participa do
lifecycle do usuário.

### AUTH-04 — P2 — sessão do dashboard tem revogação tardia

O token é curto e assinado, porém as APIs não reconsultam o status. O acesso
pré-existente continua até o TTL, normalmente 15 minutos.

### FLOW-01 — P1 — áudio atravessa consentimento e acesso

`handleMessage` chama `handleAudio` antes de marcar deduplicação, rejeitar
status/fromMe, resolver cadastro, modo familiar, rate limit e security gate.
`handleAudio` responde, baixa, grava temporário, converte e envia ao Gemini.

Impacto: mídia de remetente desconhecido, pendente ou bloqueado pode sair para
o provedor de IA antes da decisão de acesso, além de consumir recursos e poder
ser transcrita duas vezes em entrega concorrente.

### FLOW-02 — P2 — handlers caros antecedem rate limit global

Comprovante, OCR, exportação, importação e gerenciamento de meta são avaliados
antes de `rateLimiter.isAllowed`. Há limites locais em parte desses serviços,
mas não existe um gate global anterior ao download, Drive, parser ou Gemini.

### PRIV-01 — P1 — caminhos de log ignoram o sanitizador

O logger estruturado possui redatores, mas há `console.error` com objetos de
erro e `response.data` brutos no entrypoint, Google/Calendar, handlers e falha
de autenticação WhatsApp. Objetos de SDK podem carregar URLs, configuração de
request, identificadores e dados da resposta.

Não foi afirmado que segredo já apareceu em produção; o achado é o caminho de
exposição plausível e a ausência de prova negativa abrangente.

## Controles positivos

- token do dashboard assinado, curto e sem aceitar `user` no v2;
- Query Engine sem atalho `admin-support` para dados financeiros;
- escopo familiar falha fechado em ausência/ambiguidade;
- tokens Google cifrados em repouso;
- exportação neutraliza fórmulas;
- preview Open Finance cifra payload e exige viewer explícito;
- nenhum endpoint remoto de review ou save Open Finance.

## Menor ordem futura de correção

1. eliminar admin por nome e vincular `@lid` por identidade explícita;
2. mover dedup/access/rate antes de áudio e demais efeitos caros;
3. tornar OAuth state consumível e revalidar lifecycle antes de tokens;
4. unificar revogação de status, OAuth, dashboard e Drive;
5. remover `console.error` bruto e testar sanitização negativa.

Essa ordem é recomendação pós-auditoria; a trava exige fechar antes o polling
natural Open Finance.
