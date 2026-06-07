const { normalizeText } = require('../utils/helpers');

const VALID_SCOPES = new Set(['personal', 'family', 'member']);
const BROAD_ACCESS_PATTERN = /\b(todos os usuarios|todos usuários|all users|qualquer usuario|qualquer usuário|dados de outros usuarios|dados de outros usuários)\b/;
const PERSONAL_PATTERN = /\b(meu|minha|meus|minhas|eu|so meu|só meu|somente meu|pessoal)\b/;
const FAMILY_PATTERN = /\b(nosso|nossa|nossos|nossas|familia|família|familiar|familiares|casal|gastamos|recebemos|devemos|pagamos|transferimos|temos)\b|\bnos\s+(gastamos|recebemos|devemos|pagamos|transferimos|temos)\b/;
const OTHER_MEMBER_PATTERN = /\b(outra pessoa|outro membro|outra pessoa da familia|outra pessoa da família)\b/;
const CARD_CONTEXT_PATTERN = /\b(cartao|cartão|fatura|nubank|itau|itaú|atacadao|atacadão)\b/;
const PERSON_QUERY_PATTERN = /\bquanto\s+(?:a|o)\s+[a-z][a-z\s]{1,50}\s+(?:gastou|gasta|recebeu|recebe|deve|pagou|paga|transferiu|tem|possui)\b/;

function uniqueIds(values = []) {
    return Array.from(new Set((Array.isArray(values) ? values : [values])
        .map(value => String(value || '').trim())
        .filter(Boolean)));
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPublicUserAliases(user = {}) {
    const aliases = new Set();
    [user.display_name, user.full_name, user.preferred_name].forEach(value => {
        const normalized = normalizeText(value);
        if (!normalized || normalized.length < 3) return;
        aliases.add(normalized);
        normalized.split(/\s+/).filter(part => part.length >= 3).forEach(part => aliases.add(part));
    });
    return Array.from(aliases);
}

function publicMemberLabel(user = {}) {
    return String(user.display_name || user.preferred_name || user.full_name || 'membro autorizado').trim();
}

function aliasAppearsAsPerson(question, alias) {
    const text = normalizeText(question);
    const safeAlias = escapeRegex(normalizeText(alias));
    if (!text || !safeAlias) return false;

    const directPersonPatterns = [
        new RegExp(`\\bquanto\\s+(?:a|o)\\s+${safeAlias}\\b`),
        new RegExp(`\\b${safeAlias}\\s+(?:gastou|gasta|recebeu|recebe|deve|pagou|paga|transferiu|tem|possui)\\b`),
        new RegExp(`\\b(?:gastos?|entradas?|receitas?|dividas?|dívidas?|metas?|contas?|transferencias?|transferências?)\\s+(?:da|do|de)\\s+${safeAlias}\\b`),
        new RegExp(`\\b(?:da|do|de)\\s+${safeAlias}\\b`)
    ];
    if (!directPersonPatterns.some(pattern => pattern.test(text))) return false;

    const aliasIndex = text.indexOf(normalizeText(alias));
    const nearby = aliasIndex >= 0 ? text.slice(Math.max(0, aliasIndex - 35), aliasIndex + normalizeText(alias).length + 10) : '';
    const hasStrongPersonVerb = new RegExp(`\\b${safeAlias}\\s+(?:gastou|gasta|recebeu|recebe|deve|pagou|paga|transferiu|tem|possui)\\b`).test(text) ||
        new RegExp(`\\bquanto\\s+(?:a|o)\\s+${safeAlias}\\b`).test(text);
    return hasStrongPersonVerb || !CARD_CONTEXT_PATTERN.test(nearby);
}

function findAuthorizedMemberMatches({ question = '', requestedMember = '', users = [], authorizedUserIds = [] } = {}) {
    const allowed = new Set(uniqueIds(authorizedUserIds));
    const requested = normalizeText(requestedMember);
    return (Array.isArray(users) ? users : [])
        .filter(user => allowed.has(String(user?.user_id || '').trim()))
        .map(user => {
            const aliases = buildPublicUserAliases(user);
            const matchedAliases = requested
                ? aliases.filter(alias => alias === requested || alias.includes(requested) || requested.includes(alias))
                : aliases.filter(alias => aliasAppearsAsPerson(question, alias));
            return { user, matchedAliases };
        })
        .filter(match => match.matchedAliases.length > 0);
}

function safeResult({ decision, scope = '', userIds = [], reason = '', member = null, matchedAliases = [], explicit = false } = {}) {
    return {
        decision,
        scope,
        userIds: decision === 'allow' ? uniqueIds(userIds) : [],
        reason,
        explicit: Boolean(explicit),
        memberLabel: member ? publicMemberLabel(member) : '',
        matchedUser: decision === 'allow' && member
            ? { display_name: publicMemberLabel(member) }
            : null,
        matchedAliases: decision === 'allow' ? matchedAliases : []
    };
}

function resolveFinancialQueryScope({
    currentUserId = '',
    question = '',
    requestedScope = '',
    requestedMember = '',
    previousScope = '',
    authorizedUserIds = [],
    users = [],
    isAdmin = false,
    allowAdminSupport = false
} = {}) {
    const current = String(currentUserId || '').trim();
    if (!current) return safeResult({ decision: 'block', reason: 'missing_current_user' });

    const text = normalizeText(question);
    const normalizedRequestedScope = normalizeText(requestedScope);
    const normalizedPreviousScope = VALID_SCOPES.has(normalizeText(previousScope)) ? normalizeText(previousScope) : '';
    const authorized = uniqueIds([current, ...uniqueIds(authorizedUserIds)]);
    const explicitPersonal = PERSONAL_PATTERN.test(text);
    const explicitFamily = FAMILY_PATTERN.test(text);
    const explicitOtherMember = OTHER_MEMBER_PATTERN.test(text);

    if (BROAD_ACCESS_PATTERN.test(text) || normalizedRequestedScope === 'admin-support') {
        if (!(isAdmin && allowAdminSupport)) {
            return safeResult({ decision: 'block', reason: 'broad_financial_access_blocked' });
        }
        return safeResult({ decision: 'block', reason: 'admin_support_not_available_in_query_engine' });
    }

    if (explicitPersonal && !explicitFamily) {
        return safeResult({ decision: 'allow', scope: 'personal', userIds: [current], reason: 'explicit_personal', explicit: true });
    }

    const explicitQuestionMemberMatches = findAuthorizedMemberMatches({
        question,
        users,
        authorizedUserIds: authorized
    });
    const memberMatches = findAuthorizedMemberMatches({
        question,
        requestedMember,
        users,
        authorizedUserIds: authorized
    });
    const explicitQuestionMatchedIds = uniqueIds(explicitQuestionMemberMatches.map(match => match.user?.user_id));
    const matchedIds = uniqueIds(memberMatches.map(match => match.user?.user_id));
    const memberRequested = normalizedRequestedScope === 'member' ||
        Boolean(normalizeText(requestedMember)) ||
        explicitOtherMember ||
        (PERSON_QUERY_PATTERN.test(text) && !explicitFamily) ||
        matchedIds.length > 0;

    if (memberRequested) {
        const inheritedMemberEscalation = normalizedPreviousScope === 'personal' &&
            !explicitOtherMember &&
            explicitQuestionMatchedIds.length === 0;
        if (inheritedMemberEscalation) {
            return safeResult({ decision: 'allow', scope: 'personal', userIds: [current], reason: 'follow_up_scope_not_promoted' });
        }
        if (explicitOtherMember && !requestedMember && matchedIds.length === 0) {
            const others = authorized.filter(id => id !== current);
            if (others.length === 1) {
                const member = (Array.isArray(users) ? users : []).find(user => String(user?.user_id || '').trim() === others[0]);
                return safeResult({ decision: 'allow', scope: 'member', userIds: others, reason: 'unique_other_member', member, explicit: true });
            }
        }
        if (matchedIds.length === 1) {
            const selected = memberMatches.find(match => String(match.user?.user_id || '').trim() === matchedIds[0]);
            return safeResult({
                decision: 'allow',
                scope: 'member',
                userIds: matchedIds,
                reason: 'authorized_member',
                member: selected?.user,
                matchedAliases: selected?.matchedAliases,
                explicit: true
            });
        }
        return safeResult({ decision: 'clarify', reason: matchedIds.length > 1 ? 'ambiguous_member' : 'member_not_authorized_or_unknown' });
    }

    const familyRequested = explicitFamily || normalizedRequestedScope === 'family';
    if (familyRequested) {
        const inheritedEscalation = normalizedRequestedScope === 'family' && !explicitFamily && normalizedPreviousScope === 'personal';
        if (inheritedEscalation) {
            return safeResult({ decision: 'allow', scope: 'personal', userIds: [current], reason: 'follow_up_scope_not_promoted' });
        }
        if (authorized.length <= 1) {
            return safeResult({ decision: 'clarify', reason: 'family_scope_unavailable' });
        }
        return safeResult({ decision: 'allow', scope: 'family', userIds: authorized, reason: 'authorized_family', explicit: explicitFamily });
    }

    return safeResult({ decision: 'allow', scope: 'personal', userIds: [current], reason: 'personal_default' });
}

function applyResolvedScopeToClassification(intentClassification = {}, resolvedScope = {}) {
    if (!intentClassification || resolvedScope?.decision !== 'allow') return intentClassification;
    const parameters = { ...(intentClassification.parameters || {}), scope: resolvedScope.scope };
    if (resolvedScope.scope === 'member' && resolvedScope.memberLabel) parameters.member = resolvedScope.memberLabel;

    const plan = intentClassification.financialQueryPlan
        ? {
            ...intentClassification.financialQueryPlan,
            filters: {
                ...(intentClassification.financialQueryPlan.filters || {}),
                scope: resolvedScope.scope
            }
        }
        : null;
    if (plan?.filters && resolvedScope.scope === 'member') delete plan.filters.member;

    return {
        ...intentClassification,
        parameters,
        ...(plan ? { financialQueryPlan: plan } : {})
    };
}

function buildScopeClarificationReply(resolvedScope = {}) {
    if (resolvedScope.reason === 'family_scope_unavailable') {
        return 'Você não tem um vínculo familiar ativo para essa consulta. Posso mostrar apenas seus dados pessoais.';
    }
    if (resolvedScope.reason === 'ambiguous_member') {
        return 'Encontrei mais de um membro autorizado com esse nome. Diga o nome completo de quem você quer consultar.';
    }
    return 'Não consegui confirmar esse membro dentro do seu vínculo familiar ativo. Você quer consultar apenas seus dados pessoais?';
}

module.exports = {
    resolveFinancialQueryScope,
    applyResolvedScopeToClassification,
    buildScopeClarificationReply,
    buildPublicUserAliases,
    __test__: {
        aliasAppearsAsPerson,
        findAuthorizedMemberMatches,
        uniqueIds
    }
};
