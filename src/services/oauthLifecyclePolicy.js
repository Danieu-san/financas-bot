const OAUTH_CONNECT_ALLOWED_STATUSES = Object.freeze([
    'APPROVED_AWAITING_GOOGLE',
    'ACTIVE'
]);

const OAUTH_CONNECT_ALLOWED_STATUS_SET = new Set(OAUTH_CONNECT_ALLOWED_STATUSES);

function assertOAuthLifecycleAllowed(user) {
    if (!user?.user_id) {
        throw new Error('Usuário OAuth não encontrado.');
    }

    const status = String(user.status || '').trim().toUpperCase();
    if (!OAUTH_CONNECT_ALLOWED_STATUS_SET.has(status)) {
        const error = new Error(`O status ${status || 'DESCONHECIDO'} não permite conexão Google.`);
        error.code = 'OAUTH_LIFECYCLE_NOT_ALLOWED';
        throw error;
    }

    return user;
}

module.exports = {
    OAUTH_CONNECT_ALLOWED_STATUSES,
    assertOAuthLifecycleAllowed
};
