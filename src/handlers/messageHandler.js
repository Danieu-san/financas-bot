const { userMap, sheetCategoryMap, creditCardConfig, getAdminIds } = require('../config/constants');
const userStateManager = require('../state/userStateManager');
const creationHandler = require('./creationHandler');
const deletionHandler = require('./deletionHandler');
const debtHandler = require('./debtHandler');
const { getStructuredResponseFromLLM, askLLM } = require('../services/gemini');
const googleService = require('../services/google');
const { appendRowToSheet, readDataFromSheet, createCalendarEvent, syncDashboardForUser } = googleService;
const runWithUserSheetContext = googleService.runWithUserSheetContext || ((user, fn) => fn());
const hasUserSpreadsheetContext = googleService.hasUserSpreadsheetContext || (async () => false);
const shareSpreadsheetWithUserEmail = googleService.shareSpreadsheetWithUserEmail || (async () => null);
const revokeSpreadsheetPermission = googleService.revokeSpreadsheetPermission || (async () => false);
const { getFormattedDate, getFormattedDateOnly, normalizeText, parseSheetDate, parseAmount, parseValue } = require('../utils/helpers');
const {
    normalizeCycleStartDay,
    getBudgetCycleForDate,
    dateIsWithinCycle
} = require('../utils/budgetCycle');
const cache = require('../utils/cache');
const rateLimiter = require('../utils/rateLimiter');
const { handleAudio } = require('./audioHandler');
const { classify } = require('../ai/intentClassifier');
const { execute } = require('../services/calculationOrchestrator');
const { generate } = require('../ai/responseGenerator');
const {
    resolveUserAccess,
    USER_STATUS,
    getUserProfileByUserId,
    getUserSettingsByUserId,
    upsertUserProfile,
    upsertUserSettings,
    updateUserStatus,
    updateUserStatusByWhatsAppId,
    approveUserByWhatsAppId,
    denyUserByWhatsAppId,
    getUserById,
    getUserByLookup,
    getConsentLogsByUserId,
    getAllUsers,
    expireOldPendingUsers
} = require('../services/userService');
const { handleOnboarding, POST_ONBOARDING_DEBT_OFFER_ACTION } = require('./onboardingHandler');
const { buildHealthSummary } = require('../services/financialHealthService');
const { buildDebtAvalanchePlan } = require('../services/debtAvalancheService');
const { syncReadModelIfNeeded, executeAnalyticalIntent, markReadModelDirty, getReadModelStats } = require('../services/readModelService');
const {
    annotateImportDuplicates,
    applyAccountClassificationRules,
    applyRecurringIncomeClassification,
    applyFallbackDateToTransactions,
    buildRecurringBillClassificationQuestion,
    buildRecurringBillSuggestionMessage,
    buildRecurringIncomeQuestion,
    buildImportPreviewMessages,
    convertTransactionsForCreditCardStatement,
    detectRecurringBillCandidates,
    detectRecurringIncomeCandidates,
    parseImportMedia,
    parseRecurringBillClassificationReply,
    parseRecurringIncomeClassificationReply,
    transactionsNeedDateInput,
    unsupportedImportMessage
} = require('../services/statementImportService');
const { buildDashboardAccessLink } = require('../utils/dashboardAuth');
const { buildGoogleConnectLink } = require('../services/googleOAuthService');
const { sendWhatsAppMessage } = require('../services/whatsapp');
const {
    GOAL_STATUS,
    applyGoalMovement,
    parseGoalCommand,
    updateGoalStatus
} = require('../services/goalService');
const {
    getOAuthConnection,
    getFinancialScopeUserIds,
    getSharedSpreadsheetMembership,
    revokeSharedSpreadsheetMembership,
    setSharedSpreadsheetMembership
} = require('../services/oauthTokenStore');
const metrics = require('../utils/metrics');
const { isAdminWithContext } = require('../utils/adminCheck');
const logger = require('../utils/logger');
const { sendPlainMessage } = require('../utils/whatsappMessaging');
const { recordQaFailure } = require('../services/qaFailureLogService');
const { recordAdminAction } = require('../services/adminActionLogService');
const { recordDashboardAccessEvent } = require('../services/dashboardAccessLogService');
const {
    buildAdminBotStatusReply,
    scheduleAdminProcessRestart,
    setRestartSchedulerForTests: setAdminMaintenanceRestartSchedulerForTests,
    resetRestartSchedulerForTests: resetAdminMaintenanceRestartSchedulerForTests
} = require('../services/adminMaintenanceService');

// Base de Conhecimento para Gastos
const mapeamentoGastos = {
    "aluguel": { categoria: "Moradia", subcategoria: "ALUGUEL" }, "condomínio": { categoria: "Moradia", subcategoria: "CONDOMÍNIO" },
    "iptu": { categoria: "Moradia", subcategoria: "IPTU" }, "luz": { categoria: "Moradia", subcategoria: "LUZ" },
    "água": { categoria: "Moradia", subcategoria: "ÁGUA" }, "internet": { categoria: "Moradia", subcategoria: "INTERNET" },
    "mercado": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" }, "supermercado": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" },
    "guanabara": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" }, "assaí": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" },
    "assai": { categoria: "Alimentação", subcategoria: "SUPERMERCADO" }, "restaurante": { categoria: "Alimentação", subcategoria: "RESTAURANTE" },
    "ifood": { categoria: "Alimentação", subcategoria: "DELIVERY / IFOOD" }, "delivery": { categoria: "Alimentação", subcategoria: "DELIVERY / IFOOD" },
    "lanche": { categoria: "Alimentação", subcategoria: "PADARIA / LANCHE" }, "padaria": { categoria: "Alimentação", subcategoria: "PADARIA / LANCHE" },
    "gasolina": { categoria: "Transporte", subcategoria: "COMBUSTÍVEL" }, "combustível": { categoria: "Transporte", subcategoria: "COMBUSTÍVEL" },
    "uber": { categoria: "Transporte", subcategoria: "UBER / 99" }, "99": { categoria: "Transporte", subcategoria: "UBER / 99" },
    "trem": { categoria: "Transporte", subcategoria: "TRANSPORTE PÚBLICO" }, "metrô": { categoria: "Transporte", subcategoria: "TRANSPORTE PÚBLICO" },
    "ônibus": { categoria: "Transporte", subcategoria: "TRANSPORTE PÚBLICO" }, "farmácia": { categoria: "Saúde", subcategoria: "FARMÁCIA" },
    "remédio": { categoria: "Saúde", subcategoria: "FARMÁCIA" }, "consulta": { categoria: "Saúde", subcategoria: "CONSULTAS" },
    "exame": { categoria: "Saúde", subcategoria: "EXAMES" },
};

// Base de Conhecimento para Entradas
const mapeamentoEntradas = {
    "salário": { categoria: "Salário" },
    "salario": { categoria: "Salário" },
    "pagamento": { categoria: "Salário" },
    "freela": { categoria: "Renda Extra" },
    "freelance": { categoria: "Renda Extra" },
    "bico": { categoria: "Renda Extra" },
    "venda": { categoria: "Venda" },
    "presente": { categoria: "Presente" },
    "reembolso": { categoria: "Reembolso" },
    "dividendos": { categoria: "Investimentos" },
};
const categoriasEntradaOficiais = ["Salário", "Renda Extra", "Investimentos", "Presente", "Reembolso", "Venda", "Outros"];
const metodosRecebimento = ["Conta Corrente", "Poupança", "Dinheiro", "PIX"];

// Schema Unificado Completo
const MASTER_SCHEMA = {
    type: "OBJECT",
    properties: {
        intent: { type: "STRING", enum: ["gasto", "entrada", "pergunta", "apagar_item", "criar_divida", "criar_meta", "registrar_pagamento", "criar_lembrete", "ajuda", "resumo", "desconhecido"] },
        gastoDetails: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    descricao: { type: "STRING" }, valor: { type: "NUMBER" }, categoria: { type: "STRING" },
                    subcategoria: { type: "STRING" }, pagamento: { type: "STRING", enum: ["Dinheiro", "Débito", "Crédito", "PIX"] },
                    recorrente: { type: "STRING", enum: ["Sim", "Não"] }, observacoes: { type: "STRING" },
                    data: { type: "STRING" }
                }
            }
        },
        entradaDetails: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    descricao: { type: "STRING" },
                    categoria: { type: "STRING", enum: categoriasEntradaOficiais },
                    valor: { type: "NUMBER" },
                    recebimento: { type: "STRING", enum: metodosRecebimento },
                    recorrente: { type: "STRING", enum: ["Sim", "Não"] },
                    observacoes: { type: "STRING" }
                }
            }
        },
        deleteDetails: { type: "OBJECT", properties: { descricao: { type: "STRING" }, categoria: { type: "STRING" } } },
        pagamentoDetails: { type: "OBJECT", properties: { descricao: { type: "STRING" } } },
        lembreteDetails: { type: "OBJECT", properties: { titulo: { type: "STRING" }, dataHora: { type: "STRING" }, recorrencia: { type: "STRING" } } },
        question: { type: "STRING" }
    },
    required: ["intent"]
};

const processedMessages = new Set();
const ANALYTICAL_CONTEXT_TTL_MS = 5 * 60 * 1000;
const analyticalContextBySender = new Map();
const monthNamesLower = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthNamesCapitalized = ["Janeiro", "Fevereiro", "Mar�o", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const PERF_WARN_MS = Number.parseInt(process.env.MESSAGE_SLOW_LOG_MS || '4000', 10);
const SECURITY_BLOCK_REPLY = [
    'Não posso mostrar identificadores internos, tokens, prompts, regras internas ou dados de outros usuários.',
    'Posso ajudar com os seus próprios lançamentos, sua planilha, seu dashboard e orientações financeiras dentro do seu acesso.'
].join('\n');

function sanitizeLogText(value, maxLength = 220) {
    const original = String(value || '');
    if (!original) return '';

    let sanitized = original
        .replace(/([?&](?:token|code|state|access_token|refresh_token|client_secret|secret|api_key|key)=)[^&\s"']+/gi, '$1[REDACTED]')
        .replace(/\bGOCSPX-[A-Za-z0-9_-]+\b/g, '[REDACTED_GOOGLE_SECRET]')
        .replace(/\b(?:ya29|1\/\/)[A-Za-z0-9._/-]{20,}\b/g, '[REDACTED_OAUTH_TOKEN]')
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
        .replace(/(docs\.google\.com\/(?:spreadsheets|document)\/d\/)[A-Za-z0-9_-]+/gi, '$1[REDACTED_DOC_ID]')
        .replace(/(drive\.google\.com\/file\/d\/)[A-Za-z0-9_-]+/gi, '$1[REDACTED_DOC_ID]');

    if (sanitized.length > maxLength) {
        sanitized = `${sanitized.slice(0, maxLength)}...`;
    }
    return sanitized;
}

function hasSecurityPattern(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
}

function detectSecuritySensitiveRequest(messageBody) {
    const text = normalizeText(String(messageBody || '').trim());
    if (!text) return { blocked: false };

    const internalIdentifierPatterns = [
        /\b(?:sheetid|spreadsheetid|tenantid|userid|usuarioid|clienteid)\b/,
        /\b(?:sheet|spreadsheet|tenant|workspace|user|usuario|cliente)\s*id\b/,
        /\bid\s+(?:da|do|de)\s+(?:planilha|spreadsheet|sheet|usuario|usuaria|user|cliente|tenant|workspace)\b/,
        /\bidentificador(?:es)?\s+(?:interno|internos|da planilha|do usuario|do cliente)\b/,
        /\b(?:planilha|spreadsheet|sheet)\s+(?:id|interna|original)\b/
    ];
    if (hasSecurityPattern(text, internalIdentifierPatterns)) {
        return { blocked: true, category: 'internal_identifier' };
    }

    const promptLeakPatterns = [
        /\b(?:prompt|system prompt|mensagem do sistema|instrucoes internas|instrucoes do sistema|regras internas|developer message|schema interno)\b/,
        /\b(?:mostre|mostrar|revele|revelar|copie|copiar|diga|exiba|vaze|vazar).{0,50}\b(?:prompt|instrucoes|regras internas|schema)\b/,
        /\b(?:instrucoes|regras|diretrizes).{0,60}\b(?:antes|conversa|recebeu|recebidas|ocultas|internas)\b/,
        /\b(?:complete|completa|termine|termina).{0,80}\b(?:nao posso responder|não posso responder|nao devo responder|não devo responder)\b/
    ];
    if (hasSecurityPattern(text, promptLeakPatterns)) {
        return { blocked: true, category: 'prompt_leak' };
    }

    const secretPatterns = [
        /\b(?:refresh token|access token|client secret|client_secret|chave secreta|segredo oauth|oauth secret|api key|apikey|token de acesso|token secreto)\b/,
        /\b(?:mostre|mostrar|revele|revelar|diga|exiba|vaze|vazar).{0,50}\b(?:token|segredo|secret|senha|credencial|credenciais|oauth)\b/
    ];
    if (hasSecurityPattern(text, secretPatterns)) {
        return { blocked: true, category: 'secret_extraction' };
    }

    const crossUserPatterns = [
        /\b(?:planilha|dados|gastos|entradas|lancamentos|lançamentos).{0,40}\b(?:de|do|da|dos|das)\s+(?:outro usuario|outra usuaria|outros usuarios|cliente|clientes)\b/,
        /\b(?:todos os usuarios|todos os clientes|todos usuarios|todos clientes)\b/,
        /\b(?:gastos|entradas|lancamentos|lançamentos|dados).{0,30}\b(?:de todos|dos usuarios|dos clientes)\b/,
        /\b(?:acesse|abrir|abra|consulte|consultar|ler|leia).{0,60}\b(?:planilha de outro|dados de outro|cliente|outro usuario|outra usuaria)\b/
    ];
    if (hasSecurityPattern(text, crossUserPatterns)) {
        return { blocked: true, category: 'cross_user_data' };
    }

    const bypassPatterns = [
        /\b(?:ignore|ignora|desconsidere|desconsidera).{0,40}\b(?:instrucoes|regras|politicas|seguranca|segurança|permissoes|permissões)\b/,
        /\b(?:sou|modo)\s+(?:admin|administrador|suporte|desenvolvedor|root|sistema)\b/,
        /\b(?:bypass|jailbreak|contorne|desative|desabilite).{0,40}\b(?:seguranca|segurança|permissao|permissão|regras)\b/
    ];
    if (hasSecurityPattern(text, bypassPatterns)) {
        return { blocked: true, category: 'policy_bypass' };
    }

    return { blocked: false };
}

function formatDashboardTtlForReply(ttlSeconds) {
    const seconds = Number.parseInt(ttlSeconds, 10) || 0;
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.max(1, Math.round(minutes / 60));
    return `${hours}h`;
}

function formatCurrencyBR(value) {
    const numericValue = typeof value === 'number' ? value : parseValue(value);
    return 'R$ ' + Number(numericValue || 0).toFixed(2).replace('.', ',');
}

function formatSheetDateForReply(value) {
    const parsed = parseSheetDate(value);
    return parsed ? getFormattedDateOnly(parsed) : (value || '-');
}

function normalizePaymentMethodLabel(value) {
    const normalized = normalizeText(value || '');
    if (!normalized) return '';
    if (normalized === 'pix' || normalized.includes('pix')) return 'PIX';
    if (normalized === 'debito' || normalized.includes('debito')) return 'Débito';
    if (normalized === 'credito' || normalized.includes('credito')) return 'Crédito';
    if (normalized === 'dinheiro' || normalized.includes('dinheiro')) return 'Dinheiro';
    return String(value || '').trim();
}

function markFinancialReadModelDirty(reason = 'financial_write') {
    try {
        markReadModelDirty(reason);
        if (typeof cache.clearAllCache === 'function') {
            cache.clearAllCache();
        }
    } catch (error) {
        logger.warn(`read-model: falha ao marcar dados financeiros como sujos (${error.message})`);
    }
}

function canSaveTransactionWithoutExtraPayment(item) {
    if (!item || !item.type) return false;
    if (item.type === 'Saídas') {
        const method = normalizePaymentMethodLabel(item.pagamento);
        return Boolean(method) && normalizeText(method) !== 'credito';
    }
    if (item.type === 'Entradas') {
        return Boolean(normalizePaymentMethodLabel(item.recebimento));
    }
    return false;
}

function messageLooksLikeReserveMovement(item = {}, messageBody = '') {
    const text = normalizeText([
        messageBody,
        item.descricao,
        item.categoria,
        item.subcategoria,
        item.recebimento,
        item.pagamento,
        item.observacoes
    ].filter(Boolean).join(' '));

    const hasReserveDestination = /\b(caixinha|reserva|poupanca|investimento|investi|rdb|tesouro|aplicacao|aplicado|apliquei)\b/.test(text);
    const hasMovementVerb = /\b(guardei|guardar|reservei|reservar|apliquei|aplicar|investi|investir|transferi|enviei|mandei|coloquei|poupei)\b/.test(text);
    const hasIncomeSignal = /\b(salario|decimo|13|recebi|renda|bonus|bonificacao|pagamento recebido)\b/.test(text);

    return hasReserveDestination && hasMovementVerb && !hasIncomeSignal;
}

function buildReserveTransfer(item = {}, messageBody = '') {
    if (!messageLooksLikeReserveMovement(item, messageBody)) return null;

    const transferDate = item.data ? parseSheetDate(item.data) : new Date();
    const destination = normalizeText(item.descricao || messageBody).includes('nubank')
        ? 'Caixinha Nubank'
        : 'Reserva/Caixinha';

    return {
        data: getFormattedDateOnly(transferDate),
        descricao: item.descricao || 'Aplicação em reserva/caixinha',
        valor: parseValue(item.valor),
        origem: item.recebimento && normalizeText(item.recebimento) !== 'poupanca' ? normalizePaymentMethodLabel(item.recebimento) : '',
        destino: destination,
        metodo: 'Transferência',
        observacoes: 'Movimentação de reserva/investimento registrada pelo WhatsApp; não conta como gasto nem renda.',
        status: 'Movimentação de reserva/investimento'
    };
}

function buildFamilyMemberAliases(user = {}) {
    return [
        user.display_name,
        user.full_name,
        user.name,
        user.phone_e164,
        user.whatsapp_id
    ]
        .filter(Boolean)
        .map(value => normalizeText(String(value)))
        .filter(value => value && value.length >= 3);
}

async function findMentionedFinancialScopeMember(messageBody = '', currentUserId = '') {
    const text = normalizeText(messageBody);
    if (!/\b(transferi|transferencia|enviei|mandei|passei|pix)\b/.test(text)) return null;

    let scopeIds = [];
    try {
        scopeIds = await Promise.resolve(getFinancialScopeUserIds(currentUserId));
    } catch (error) {
        logger.warn(`familia: falha ao obter escopo financeiro user_id=${currentUserId} error=${error.message}`);
    }

    const uniqueScopeIds = Array.from(new Set((scopeIds || []).filter(Boolean)));
    if (uniqueScopeIds.length <= 1) return null;

    const users = await getAllUsers();
    return users.find((user) => {
        if (!user?.user_id || user.user_id === currentUserId) return false;
        if (!uniqueScopeIds.includes(user.user_id)) return false;
        return buildFamilyMemberAliases(user).some(alias => text.includes(alias));
    }) || null;
}

async function buildFamilyTransfer(item = {}, messageBody = '', currentUserId = '') {
    if (item.type !== 'Saídas') return null;
    const member = await findMentionedFinancialScopeMember(messageBody, currentUserId);
    if (!member) return null;

    const transferDate = item.data ? parseSheetDate(item.data) : new Date();
    return {
        data: getFormattedDateOnly(transferDate),
        descricao: item.descricao || `Transferência para ${member.display_name || 'membro da família'}`,
        valor: parseValue(item.valor),
        origem: '',
        destino: member.display_name || member.full_name || member.phone_e164 || 'Membro da família',
        metodo: normalizePaymentMethodLabel(item.pagamento) || 'PIX',
        observacoes: 'Transferência interna familiar registrada pelo WhatsApp; não conta como gasto nem renda.',
        status: 'Provável transferência interna'
    };
}

async function buildManualTransferFromMessage(item = {}, messageBody = '', currentUserId = '') {
    const originalMessage = [item.originalMessage, messageBody].filter(Boolean).join(' ');
    const reserveTransfer = buildReserveTransfer(item, originalMessage);
    if (reserveTransfer) return reserveTransfer;
    return buildFamilyTransfer(item, originalMessage, currentUserId);
}

async function saveManualTransfer(transfer, userId) {
    const value = parseValue(transfer.valor);
    await appendRowToSheet('Transferências', [
        transfer.data || getFormattedDateOnly(new Date()),
        transfer.descricao || 'Transferência',
        value,
        transfer.origem || '',
        transfer.destino || '',
        transfer.metodo || 'Transferência',
        transfer.observacoes || '',
        transfer.status || 'Transferência interna',
        userId
    ]);
    markFinancialReadModelDirty('transfer_write');
    return { ...transfer, valor: value };
}

async function saveTransactionWithoutExtraPayment(item, { person, userId }) {
    if (item.type === 'Saídas') {
        const dataDoGasto = item.data ? parseSheetDate(item.data) : new Date();
        const dataFinal = getFormattedDateOnly(dataDoGasto);
        const valorNumerico = parseValue(item.valor);
        const pagamentoFinal = normalizePaymentMethodLabel(item.pagamento);
        const rowData = [
            dataFinal,
            item.descricao || 'Não especificado',
            item.categoria || 'Outros',
            item.subcategoria || '',
            valorNumerico,
            person,
            pagamentoFinal,
            item.recorrente || 'Não',
            item.observacoes || '',
            userId
        ];
        await appendRowToSheet('Saídas', rowData);
        markFinancialReadModelDirty('saida_write');
        return { sheetName: 'Saídas', date: dataFinal, value: valorNumerico, method: pagamentoFinal };
    }

    if (item.type === 'Entradas') {
        const dataDaEntrada = item.data ? parseSheetDate(item.data) : new Date();
        const dataFinal = getFormattedDateOnly(dataDaEntrada);
        const valorNumerico = parseValue(item.valor);
        const recebimentoFinal = normalizePaymentMethodLabel(item.recebimento);
        const rowData = [
            dataFinal,
            item.descricao || 'Não especificado',
            item.categoria || 'Outros',
            valorNumerico,
            person,
            recebimentoFinal,
            item.recorrente || 'Não',
            item.observacoes || '',
            userId
        ];
        await appendRowToSheet('Entradas', rowData);
        markFinancialReadModelDirty('entrada_write');
        return { sheetName: 'Entradas', date: dataFinal, value: valorNumerico, method: recebimentoFinal };
    }

    throw new Error(`Tipo de transação inválido: ${item.type}`);
}

async function saveImportedTransactions(transactions = [], { person, userId }) {
    let successCount = 0;
    for (const item of transactions) {
        if (item.duplicate) continue;
        if (item.type === 'Transferências') {
            await appendRowToSheet('Transferências', [
                item.data,
                item.descricao,
                item.valor,
                item.origem || '',
                item.destino || '',
                item.metodo || 'Importação',
                item.observacoes || 'Importado de arquivo',
                item.status || 'Provável transferência interna',
                userId
            ]);
            markFinancialReadModelDirty('transfer_write');
        } else if (item.type === 'Cartão') {
            if (!item.cardInfo) {
                throw new Error('Importação de cartão sem cartão selecionado.');
            }
            await appendRowToSheet(item.cardInfo.sheetName, buildImportedCreditCardRow(item, item.cardInfo, userId));
            markFinancialReadModelDirty('card_write');
        } else {
            await saveTransactionWithoutExtraPayment(item, { person, userId });
        }
        successCount += 1;
    }
    return successCount;
}

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function buildBillingMonthName(purchaseDate, cardInfo = {}) {
    let billingMonth = purchaseDate.getMonth();
    let billingYear = purchaseDate.getFullYear();
    const closingDay = Number.parseInt(cardInfo.closingDay, 10);

    if (Number.isInteger(closingDay) && closingDay >= 1 && closingDay <= 31 && purchaseDate.getDate() > closingDay) {
        billingMonth += 1;
        if (billingMonth > 11) {
            billingMonth = 0;
            billingYear += 1;
        }
    }

    return `${MONTH_NAMES[billingMonth]} de ${billingYear}`;
}

function buildImportedCreditCardRow(item, cardInfo, userId) {
    const purchaseDate = item.data ? parseSheetDate(item.data) : new Date();
    const dataFinal = getFormattedDateOnly(purchaseDate);
    const valorNumerico = parseValue(item.valor);
    return [
        dataFinal,
        item.descricao || 'Não especificado',
        item.categoria || 'Outros',
        valorNumerico,
        item.parcela || '1/1',
        item.mesCobranca || buildBillingMonthName(purchaseDate, cardInfo),
        userId
    ];
}

function getTodaySaoPauloDateString() {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(new Date());
}

function dateStringMatchesToday(value, today = getTodaySaoPauloDateString()) {
    const parsed = parseSheetDate(value);
    return parsed ? getFormattedDateOnly(parsed) === today : String(value || '').trim() === today;
}

function getDailyGoalMilestone(percentUsed) {
    if (percentUsed >= 100) return 100;
    if (percentUsed >= 80) return 80;
    if (percentUsed >= 50) return 50;
    return 0;
}

function normalizeDailyGoalScope(value) {
    const text = normalizeText(value || '');
    if (/\b(familia|familiar|casal|nossa|nosso|compartilhada|compartilhado)\b/.test(text)) return 'family';
    if (/\b(pessoal|individual|minha|meu|propria|proprio)\b/.test(text)) return 'personal';
    return '';
}

function getDailyGoalScopeLabel(scope) {
    return scope === 'family' ? 'da família' : 'pessoal';
}

function normalizeMonthlyBudgetScope(value) {
    return normalizeDailyGoalScope(value);
}

function getMonthlyBudgetScopeLabel(scope) {
    return scope === 'family' ? 'familiar' : 'pessoal';
}

function getMonthlyBudgetCycleStartDay(settings = {}) {
    return normalizeCycleStartDay(settings?.monthly_budget_cycle_start_day || '1');
}

function formatMonthlyBudgetCycle(cycleStartDay, todayParts = getSaoPauloDateParts()) {
    const cycle = getBudgetCycleForDate(todayParts, cycleStartDay);
    return cycle.label;
}

function getMonthlyBudgetScopeUserIds(userId, settings = {}) {
    const userIds = settings.monthly_budget_scope === 'family' ? getFinancialScopeUserIds(userId) : [userId];
    return Array.from(new Set(userIds.map(id => String(id || '').trim()).filter(Boolean)));
}

async function resolveMonthlyBudgetSettingsForUser(userId) {
    const userSettings = await getUserSettingsByUserId(userId);
    const membership = getSharedSpreadsheetMembership(userId);
    if (membership?.owner_user_id) {
        const ownerSettings = await getUserSettingsByUserId(membership.owner_user_id);
        if (normalizeText(ownerSettings?.monthly_budget_enabled || '') === 'sim' && ownerSettings?.monthly_budget_scope === 'family') {
            return { ownerUserId: membership.owner_user_id, settings: ownerSettings };
        }
    }
    return { ownerUserId: userId, settings: userSettings };
}

function buildDailyGoalFamilyScopeReviewMessage(ownerName, memberName, settings) {
    const amount = formatCurrencyBR(settings?.monthly_budget_amount || 0);
    return [
        `${ownerName || 'Você'} acabou de vincular ${memberName || 'outro usuário'} à sua planilha familiar.`,
        `Seu orçamento mensal livre atual é ${amount}. Ele continua pessoal ou passa a ser familiar?`,
        'Responda `orçamento mensal pessoal` ou `orçamento mensal família`.'
    ].join('\n');
}

function dateStringMatchesMonth(value, month, year) {
    const parsed = parseSheetDate(value);
    return Boolean(parsed && parsed.getMonth() === month && parsed.getFullYear() === year);
}

function getSaoPauloDateParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date()).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    return {
        year: Number(parts.year),
        month: Number(parts.month) - 1,
        day: Number(parts.day)
    };
}

function isFreeSpendingRow(row) {
    const category = normalizeText(row?.[2] || '');
    const recurring = normalizeText(row?.[7] || '');
    if (recurring === 'sim') return false;
    return ![
        'transferencia',
        'transferencias',
        'divida',
        'dividas',
        'investimento',
        'investimentos',
        'reserva'
    ].some(term => category.includes(term));
}

async function calculateMonthlyBudgetSpend(userId, today = getTodaySaoPauloDateString(), userIds = [userId], cycleStartDay = 1) {
    const safeReadRows = async (range) => {
        try {
            return await readDataFromSheet(range) || [];
        } catch (error) {
            logger.warn(`[monthly-budget] leitura_ignorada range="${range}" error="${error?.message || error}"`);
            return [];
        }
    };
    const [saidasRows, cardRows] = await Promise.all([
        safeReadRows('Saídas!A:J'),
        safeReadRows('Lançamentos Cartão!A:J')
    ]);
    const allowedUserIds = new Set((Array.isArray(userIds) ? userIds : [userId]).map(id => String(id || '').trim()).filter(Boolean));
    const matchesUser = (row, index) => allowedUserIds.has(String(row?.[index] || '').trim());
    const todayParts = getSaoPauloDateParts();
    const cycle = getBudgetCycleForDate(todayParts, cycleStartDay);
    const sumRows = (rows, userIndex, amountIndex) => rows
        .filter(row => matchesUser(row, userIndex) && isFreeSpendingRow(row))
        .reduce((acc, row) => {
            const amount = parseValue(row[amountIndex]);
            const parsedDate = parseSheetDate(row[0]);
            const isToday = dateStringMatchesToday(row[0], today);
            const isMonth = dateIsWithinCycle(parsedDate, cycle);
            if (isToday) acc.today += amount;
            if (isMonth) acc.month += amount;
            return acc;
        }, { today: 0, month: 0 });

    const saidas = sumRows((saidasRows || []).slice(1), 9, 4);
    const cardDataRows = (cardRows || []).slice(1);
    let cartoes = cardDataRows
        .filter(row => matchesUser(row, 9))
        .reduce((acc, row) => {
            const amount = parseValue(row[3]);
            const parsedDate = parseSheetDate(row[0]);
            if (dateStringMatchesToday(row[0], today)) acc.today += amount;
            if (dateIsWithinCycle(parsedDate, cycle)) acc.month += amount;
            return acc;
        }, { today: 0, month: 0 });

    if (cardDataRows.length === 0) {
        const legacyCardRows = await Promise.all(
            Object.values(creditCardConfig).map(card => safeReadRows(`${card.sheetName}!A:G`))
        );
        cartoes = legacyCardRows.flatMap(rows => (rows || []).slice(1))
            .filter(row => matchesUser(row, 6))
            .reduce((acc, row) => {
                const amount = parseValue(row[3]);
                const parsedDate = parseSheetDate(row[0]);
                if (dateStringMatchesToday(row[0], today)) acc.today += amount;
                if (dateIsWithinCycle(parsedDate, cycle)) acc.month += amount;
                return acc;
            }, { today: 0, month: 0 });
    }

    return {
        today: Math.round((saidas.today + cartoes.today + Number.EPSILON) * 100) / 100,
        month: Math.round((saidas.month + cartoes.month + Number.EPSILON) * 100) / 100,
        todayParts,
        cycle
    };
}

function calculateMonthlyBudgetPace(monthlyBudget, monthSpent, todaySpent, todayParts = getSaoPauloDateParts(), cycleStartDay = 1) {
    const cycle = getBudgetCycleForDate(todayParts, cycleStartDay);
    const daysRemaining = Math.max(1, cycle.daysRemaining || 1);
    const spentBeforeToday = Math.max(0, Number(monthSpent || 0) - Number(todaySpent || 0));
    const budgetBeforeToday = Math.max(0, Number(monthlyBudget || 0) - spentBeforeToday);
    const dailyRecommended = Math.round(((budgetBeforeToday / daysRemaining) + Number.EPSILON) * 100) / 100;
    return { daysInCycle: cycle.daysInCycle, daysRemaining, dailyRecommended, cycle };
}

async function maybeNotifyDailyGoalAfterExpense(msg, userId) {
    const { ownerUserId, settings } = await resolveMonthlyBudgetSettingsForUser(userId);
    if (normalizeText(settings?.monthly_budget_enabled || '') !== 'sim') return null;

    const monthlyBudget = parseValue(settings?.monthly_budget_amount);
    if (!monthlyBudget || monthlyBudget <= 0) return null;

    const today = getTodaySaoPauloDateString();
    const cycleStartDay = getMonthlyBudgetCycleStartDay(settings);
    const scopeUserIds = getMonthlyBudgetScopeUserIds(ownerUserId, settings);
    const spend = await calculateMonthlyBudgetSpend(ownerUserId, today, scopeUserIds, cycleStartDay);
    const pace = calculateMonthlyBudgetPace(monthlyBudget, spend.month, spend.today, spend.todayParts, cycleStartDay);
    if (!pace.dailyRecommended || pace.dailyRecommended <= 0) return null;

    const percentUsed = Math.round((spend.today / pace.dailyRecommended) * 100);
    const milestone = getDailyGoalMilestone(percentUsed);
    if (!milestone) return null;

    const lastDate = String(settings?.monthly_budget_last_alert_date || '');
    const lastLevel = lastDate === today ? Number.parseInt(settings?.monthly_budget_last_alert_level || '0', 10) || 0 : 0;
    if (milestone <= lastLevel) return null;

    const remainingToday = Math.max(0, pace.dailyRecommended - spend.today);
    const remainingMonth = Math.max(0, monthlyBudget - spend.month);
    await upsertUserSettings(ownerUserId, {
        monthly_budget_last_alert_date: today,
        monthly_budget_last_alert_level: String(milestone)
    });

    const scopeLabel = getMonthlyBudgetScopeLabel(settings.monthly_budget_scope);
    const statusLine = spend.today > pace.dailyRecommended
        ? `Hoje vocês passaram ${formatCurrencyBR(spend.today - pace.dailyRecommended)} do ritmo recomendado.`
        : `Ainda restam ${formatCurrencyBR(remainingToday)} para hoje.`;
    const message = [
        `Alerta de orçamento mensal ${scopeLabel}: hoje já foi usado ${percentUsed}% do ritmo diário recomendado.`,
        `Gasto livre de hoje: ${formatCurrencyBR(spend.today)}. Ritmo recomendado: ${formatCurrencyBR(pace.dailyRecommended)}.`,
        `Restante no ciclo: ${formatCurrencyBR(remainingMonth)} em ${pace.daysRemaining} dia(s).`,
        pace.cycle?.label || '',
        statusLine
    ].filter(Boolean).join('\n');
    await sendPlainMessage(msg, message);
    return { spent: spend.today, goalAmount: pace.dailyRecommended, percentUsed, milestone };
}

async function safeMaybeNotifyDailyGoalAfterExpense(msg, userId, context = 'expense') {
    try {
        return await maybeNotifyDailyGoalAfterExpense(msg, userId);
    } catch (error) {
        logger.warn(`[monthly-budget] alert_failed context=${context} user_id=${userId} error=${error.message}`);
        return null;
    }
}

async function calculateDailyGoalSpend(userId, today = getTodaySaoPauloDateString(), userIds = [userId]) {
    const spend = await calculateMonthlyBudgetSpend(userId, today, userIds);
    return spend.today;
}

/*
 * Compatibilidade: o nome da função ainda é usado em vários fluxos após salvar
 * gasto, mas a semântica atual é orçamento mensal com ritmo diário derivado.
 */
async function maybeNotifyLegacyDailyGoalAfterExpense() {
    return null;
}

async function saveCreditCardExpense(gasto, cardInfo, installments, userId) {
    const purchaseDate = gasto.data ? parseSheetDate(gasto.data) : new Date();
    const safeInstallments = Math.max(1, Number.parseInt(installments, 10) || 1);
    const totalValue = parseValue(gasto.valor);
    const installmentValue = totalValue / safeInstallments;

    for (let i = 1; i <= safeInstallments; i++) {
        let billingMonth = purchaseDate.getMonth();
        let billingYear = purchaseDate.getFullYear();
        const closingDay = Number.parseInt(cardInfo.closingDay, 10);

        if (Number.isInteger(closingDay) && closingDay >= 1 && closingDay <= 31 && purchaseDate.getDate() > closingDay) {
            billingMonth += 1;
        }
        billingMonth += (i - 1);

        while (billingMonth > 11) {
            billingMonth -= 12;
            billingYear += 1;
        }

        const billingMonthName = `${MONTH_NAMES[billingMonth]} de ${billingYear}`;
        const value = safeInstallments === 1 ? totalValue : installmentValue;
        await appendRowToSheet(cardInfo.sheetName, [
            getFormattedDateOnly(purchaseDate),
            gasto.descricao || 'Não especificado',
            gasto.categoria || 'Outros',
            Math.round((value + Number.EPSILON) * 100) / 100,
            `${i}/${safeInstallments}`,
            billingMonthName,
            userId
        ]);
    }

    markFinancialReadModelDirty('card_write');
    return {
        installments: safeInstallments,
        installmentValue,
        totalValue,
        sheetName: cardInfo.sheetName
    };
}

function buildStatementImportKindQuestion(filename = '') {
    const fileLine = filename ? `Arquivo recebido: ${filename}\n\n` : '';
    return (
        `${fileLine}Esse extrato é de qual tipo?\n\n` +
        '1. Conta corrente / conta de pagamento\n' +
        '2. Cartão de crédito\n\n' +
        'Responda com `1` ou `2`.'
    );
}

function buildStatementImportDateQuestion(transactions = []) {
    const missingCount = transactions.filter(item => item && item.needsDateInput).length;
    const countLabel = missingCount === 1 ? '1 lançamento' : `${missingCount} lançamentos`;
    return (
        `Não encontrei data em ${countLabel} desse arquivo.\n\n` +
        'Para não lançar no mês errado, me diga qual data ou mês devo usar nessas linhas.\n' +
        'Exemplos: `17/01/2026` ou `janeiro/2026`.\n\n' +
        'Se você informar só mês/ano, vou usar o dia 01 apenas para organizar no mês certo.'
    );
}

function parseStatementImportFallbackDate(text = '') {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const parsedDate = parseSheetDate(raw);
    if (parsedDate) return getFormattedDateOnly(parsedDate);

    const numericMonth = raw.match(/^(0?[1-9]|1[0-2])[\/.-](20\d{2})$/);
    if (numericMonth) {
        return `01/${numericMonth[1].padStart(2, '0')}/${numericMonth[2]}`;
    }

    const normalized = normalizeText(raw);
    const namedMonths = {
        janeiro: '01', jan: '01',
        fevereiro: '02', fev: '02',
        marco: '03', março: '03', mar: '03',
        abril: '04', abr: '04',
        maio: '05', mai: '05',
        junho: '06', jun: '06',
        julho: '07', jul: '07',
        agosto: '08', ago: '08',
        setembro: '09', set: '09',
        outubro: '10', out: '10',
        novembro: '11', nov: '11',
        dezembro: '12', dez: '12'
    };
    const yearMatch = normalized.match(/\b(20\d{2})\b/);
    if (!yearMatch) return null;

    const monthEntry = Object.entries(namedMonths)
        .find(([name]) => new RegExp(`\\b${name}\\b`, 'i').test(normalized));
    if (!monthEntry) return null;

    return `01/${monthEntry[1]}/${yearMatch[1]}`;
}

function parseStatementImportKindReply(text = '') {
    const normalized = normalizeText(text);
    if (['1', 'conta', 'conta corrente', 'corrente', 'debito', 'débito'].includes(normalized)) return 'checking';
    if (['2', 'cartao', 'cartão', 'cartao de credito', 'cartão de crédito', 'credito', 'crédito'].includes(normalized)) return 'credit_card';
    return '';
}

function buildStatementImportOwnerQuestion(filename = '', candidates = []) {
    const suffix = filename ? ` (${filename})` : '';
    const lines = [`Esse extrato${suffix} é de quem?`];
    candidates.forEach((candidate, index) => {
        lines.push(`${index + 1}. ${candidate.label}`);
    });
    lines.push('', 'Responda apenas com o número da pessoa.');
    return lines.join('\n');
}

function parseStatementImportOwnerReply(text = '', candidates = []) {
    const normalized = normalizeText(text);
    const numericSelection = Number.parseInt(normalized, 10);
    if (Number.isInteger(numericSelection) && numericSelection >= 1 && numericSelection <= candidates.length) {
        return candidates[numericSelection - 1];
    }

    return candidates.find(candidate => {
        const label = normalizeText(candidate.label || '');
        const displayName = normalizeText(candidate.displayName || '');
        const fullName = normalizeText(candidate.fullName || '');
        return normalized && [label, displayName, fullName].some(value => value && (value === normalized || value.includes(normalized)));
    }) || null;
}

async function buildStatementImportFamilyContext({ userId, person }) {
    const safeUserId = String(userId || '').trim();
    const scopeIds = safeUserId ? getFinancialScopeUserIds(safeUserId) : [];
    const uniqueIds = Array.from(new Set((scopeIds.length ? scopeIds : [safeUserId]).filter(Boolean)));
    const candidates = [];

    for (const scopeUserId of uniqueIds) {
        const [user, profile] = await Promise.all([
            getUserById(scopeUserId),
            getUserProfileByUserId(scopeUserId)
        ]);
        const displayName = String(user?.display_name || (scopeUserId === safeUserId ? person : '') || '').trim();
        const fullName = String(profile?.full_name || '').trim();
        const label = displayName || fullName || user?.whatsapp_id || scopeUserId;
        candidates.push({
            userId: scopeUserId,
            label,
            person: displayName || fullName || person || 'Usuário',
            displayName,
            fullName
        });
    }

    const ownerAliases = Array.from(new Set(
        candidates.flatMap(candidate => [candidate.fullName, candidate.displayName, candidate.label, candidate.person])
            .map(value => String(value || '').trim())
            .filter(Boolean)
    ));

    return { candidates, ownerAliases };
}

async function askNextStatementImportQuestion(msg, senderId, stateData) {
    const transactions = stateData.parsedTransactions || [];
    if (transactionsNeedDateInput(transactions)) {
        userStateManager.setState(senderId, {
            action: 'awaiting_statement_import_date',
            data: stateData
        });
        await sendPlainMessage(msg, buildStatementImportDateQuestion(transactions));
        return;
    }

    userStateManager.setState(senderId, {
        action: 'awaiting_statement_import_kind',
        data: stateData
    });
    await sendPlainMessage(msg, buildStatementImportKindQuestion(stateData.filename));
}

async function loadExistingImportRows({ userId, includeCards = false } = {}) {
    const options = userId ? { userId } : {};
    const scopeUserIds = userId ? getFinancialScopeUserIds(userId) : [];
    const allowedUserIds = new Set(scopeUserIds.map(id => String(id || '').trim()).filter(Boolean));
    const cardSheetNames = includeCards ? Object.values(creditCardConfig).map(card => card.sheetName) : [];
    const [saidas, entradas, transferencias, lancamentosCartao, ...legacyCards] = await Promise.all([
        readDataFromSheet('Saídas!A:J', options),
        readDataFromSheet('Entradas!A:I', options),
        readDataFromSheet('Transferências!A:I', options),
        includeCards ? readDataFromSheet('Lançamentos Cartão!A:J', options) : Promise.resolve([]),
        ...cardSheetNames.map(sheetName => readDataFromSheet(`${sheetName}!A:G`, options))
    ]);
    const belongsToUser = (row, userIdIndex) => {
        if (!userId) return true;
        const rowUserId = String(row?.[userIdIndex] || '').trim();
        return allowedUserIds.has(rowUserId);
    };
    return {
        'Saídas': (saidas || []).slice(1).filter(row => belongsToUser(row, 9)),
        'Entradas': (entradas || []).slice(1).filter(row => belongsToUser(row, 8)),
        'Transferências': (transferencias || []).slice(1).filter(row => belongsToUser(row, 8)),
        'Lançamentos Cartão': (lancamentosCartao || []).slice(1).filter(row => belongsToUser(row, 9)),
        ...Object.fromEntries(cardSheetNames.map((sheetName, index) => [
            sheetName,
            (legacyCards[index] || []).slice(1).filter(row => belongsToUser(row, 6))
        ]))
    };
}

async function loadRecurringAccountRows({ userId } = {}) {
    const options = userId ? { userId } : {};
    const scopeUserIds = userId ? getFinancialScopeUserIds(userId) : [];
    const allowedUserIds = new Set(scopeUserIds.map(id => String(id || '').trim()).filter(Boolean));
    const contas = await readDataFromSheet('Contas!A:I', options);
    return (contas || []).slice(1).filter(row => {
        if (!userId) return true;
        const rowUserId = String(row?.[3] || '').trim();
        return allowedUserIds.has(rowUserId);
    });
}

function buildRecurringBillAccountRow(candidate = {}, userId = '', classification = {}) {
    const rawName = String(candidate.description || 'Conta recorrente detectada')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90) || 'Conta recorrente detectada';
    const dueDay = Number(candidate.suggestedDueDay || 1);
    const safeDueDay = Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31 ? dueDay : 1;
    return [
        rawName,
        safeDueDay,
        `Detectado automaticamente em ${candidate.monthCount || 3} meses de importações. Revise se o dia de vencimento estiver diferente.`,
        userId,
        classification.friendlyName || '',
        classification.categoria || '',
        classification.subcategoria || '',
        classification.expectedValue || '',
        classification.ruleActive || 'NÃO'
    ];
}

async function handleStatementImportMessage(msg, { senderId, person, userId }) {
    if (!msg.hasMedia || typeof msg.downloadMedia !== 'function') return false;
    if (msg.type === 'ptt' || msg.type === 'audio') return false;

    const media = await msg.downloadMedia();
    const familyContext = await buildStatementImportFamilyContext({ userId, person });
    const parsed = parseImportMedia(media, msg, {
        ownerAliases: familyContext.ownerAliases.length ? familyContext.ownerAliases : [person].filter(Boolean)
    });

    if (!parsed.supported) {
        await sendPlainMessage(msg, unsupportedImportMessage(parsed.reason));
        return true;
    }

    if (!parsed.transactions.length) {
        await sendPlainMessage(msg, parsed.preview);
        return true;
    }

    const baseStateData = {
        parsedTransactions: parsed.transactions,
        filename: parsed.filename,
        type: parsed.type,
        person,
        userId,
        importOwnerCandidates: familyContext.candidates
    };

    if (familyContext.candidates.length > 1) {
        userStateManager.setState(senderId, {
            action: 'awaiting_statement_import_owner',
            data: baseStateData
        });
        await sendPlainMessage(msg, buildStatementImportOwnerQuestion(parsed.filename, familyContext.candidates));
        return true;
    }

    await askNextStatementImportQuestion(msg, senderId, baseStateData);
    return true;
}

function normalizeMetricLabel(value, fallback = 'unknown') {
    const raw = String(value || fallback).toLowerCase();
    const normalized = raw.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return (normalized || fallback).slice(0, 60);
}

function getMonthNamePtBr(monthIndex) {
    const names = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    if (typeof monthIndex !== 'number' || monthIndex < 0 || monthIndex > 11) return null;
    return names[monthIndex];
}

function parseMonthFromText(text) {
    const normalized = normalizeText(String(text || '').trim());
    const monthMap = {
        janeiro: 0, fevereiro: 1, marco: 2, março: 2, abril: 3, maio: 4, junho: 5,
        julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11
    };
    const tokens = normalized.match(/[a-z0-9]+/g) || [];
    for (const [name, index] of Object.entries(monthMap)) {
        if (tokens.includes(name)) return index;
    }
    return new Date().getMonth();
}

function parseYearFromText(text) {
    const normalized = String(text || '');
    const match = normalized.match(/\b(20\d{2})\b/);
    if (match) return Number.parseInt(match[1], 10);
    return new Date().getFullYear();
}

function extractCategoryFromQuestion(text) {
    const normalized = normalizeText(String(text || '').trim());
    const withCom = normalized.match(/\bcom\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+em\s+|\s+no\s+|\s+na\s+|$|\?)/i);
    if (withCom && withCom[1]) return withCom[1].trim();
    const withDe = normalized.match(/\b(?:de|do|da|dos|das)\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+em\s+|\s+no\s+|\s+na\s+|$|\?)/i);
    if (withDe && withDe[1]) return withDe[1].trim();
    const withVezes = normalized.match(/\bvezes\s+(?:que\s+)?(?:eu\s+)?(?:usei|peguei|paguei|comprei|gastei|fui\s+de)?\s*([a-zA-ZÀ-ÿ\s]+?)(?:\s+em\s+|\s+no\s+|\s+na\s+|$|\?)/i);
    if (withVezes && withVezes[1]) return withVezes[1].trim();
    return '';
}

const analyticalStopWords = new Set([
    'a', 'as', 'o', 'os', 'um', 'uma', 'uns', 'umas',
    'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
    'com', 'meu', 'minha', 'meus', 'minhas', 'eu',
    'gasto', 'gastos', 'gastei', 'categoria', 'categorias',
    'total', 'mes', 'ano', 'periodo', 'periodos',
    'quanto', 'quantos', 'quantas', 'qual', 'quais',
    'soma', 'somar', 'somando', 'junto', 'juntos',
    'representou', 'representa', 'participacao', 'participação',
    'percentual', 'porcentagem', 'por', 'cento', 'media', 'média',
    'diaria', 'diária', 'dia', 'dias', 'vezes', 'ocorrencia', 'ocorrencias',
    'ocorrência', 'ocorrências', 'foi', 'foi?', 'foi.',
    'maior', 'menor', 'liste', 'listar', 'mostre', 'mostrar',
    'cartao', 'cartão', 'credito', 'crédito', 'fatura', 'faturas',
    'parcela', 'parcelas', 'parcelamento', 'parcelamentos',
    'aberto', 'ativos', 'ativa', 'ativas',
    'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas',
    'neste', 'nesta', 'nesse', 'nessa', 'deste', 'desta', 'desse', 'dessa',
    'tive', 'incluindo', 'base', 'lancamento', 'lancamentos', 'lançamento', 'lançamentos'
]);

function cleanAnalyticalCategory(value) {
    const normalized = normalizeText(String(value || '').trim())
        .replace(/[?!.,;:]+$/g, '')
        .replace(/\b(?:em|no|na|nos|nas)\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b.*$/i, '')
        .replace(/\b(?:em|no|na|nos|nas)\s+\d{4}\b.*$/i, '')
        .replace(/\b(?:esse|este|essa|esta|desse|deste|dessa|desta|nesse|neste|nessa|nesta|ultimo|último|atual)\s+mes\b.*$/i, '')
        .trim();

    const words = normalized
        .split(/\s+/)
        .filter(Boolean)
        .filter(word => !analyticalStopWords.has(word));

    return words.join(' ').trim();
}

function splitCategoryList(value) {
    return normalizeText(String(value || ''))
        .split(/\s*(?:,|\/|\+|\be\b|\bmais\b|\be também\b|\btambem\b)\s*/i)
        .map(cleanAnalyticalCategory)
        .filter(Boolean)
        .filter((item, index, items) => items.indexOf(item) === index);
}

function extractMultipleCategoriesFromQuestion(text) {
    const normalized = normalizeText(String(text || '').trim());
    const patterns = [
        /\b(?:quanto\s+foi|quanto\s+deu|quanto\s+ficou|some|soma)\s+(.+?)(?:\s+em\s+|\s+no\s+|\s+na\s+|\s+mes\s+|\s+mês\s+|$|\?)/i,
        /\b(?:somando|somar|soma(?:r)?\s+de|soma\s+com|total\s+de)\s+(.+?)(?:\s+em\s+|\s+no\s+|\s+na\s+|$|\?)/i,
        /\b(?:com|de|do|da|dos|das)\s+(.+?)(?:\s+em\s+|\s+no\s+|\s+na\s+|$|\?)/i
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (!match || !match[1]) continue;
        const categories = splitCategoryList(match[1]);
        if (categories.length > 1) return categories;
    }

    return [];
}

function extractPercentageCategoryFromQuestion(text) {
    const normalized = normalizeText(String(text || '').trim());
    const direct = normalized.match(/^(?:o|a|os|as)?\s*([a-zA-ZÀ-ÿ\s]+?)\s+(?:representou|representa)\b/i);
    if (direct && direct[1]) return cleanAnalyticalCategory(direct[1]);
    const byParticipation = normalized.match(/\b(?:participacao|participação|percentual|porcentagem)\s+(?:de|do|da|dos|das)\s+(.+?)(?:\s+(?:no|na|nos|nas|em|do|da)\s+|\?|$)/i);
    if (byParticipation && byParticipation[1]) return cleanAnalyticalCategory(byParticipation[1]);
    return cleanAnalyticalCategory(extractCategoryFromQuestion(normalized));
}

function extractComparisonCategoriesFromQuestion(text) {
    const normalized = normalizeText(String(text || '').trim());
    const direct = normalized.match(/^(.+?)\s+(?:foi|e|eh|é|ficou|esta|está)?\s*(?:maior|menor|mais|menos)\s+(?:que|do que)\s+(.+?)(?:\s+em\s+|\s+no\s+|\s+na\s+|\?|$)/i);
    if (direct && direct[1] && direct[2]) {
        const categories = [cleanAnalyticalCategory(direct[1]), cleanAnalyticalCategory(direct[2])].filter(Boolean);
        if (categories.length === 2) return categories;
    }

    const compare = normalized.match(/\b(?:comparar|compare|comparacao|comparação|diferença|diferenca)\s+(?:entre\s+)?(.+?)(?:\s+em\s+|\s+no\s+|\s+na\s+|\?|$)/i);
    if (compare && compare[1]) {
        const categories = splitCategoryList(compare[1]);
        if (categories.length >= 2) return categories.slice(0, 2);
    }

    return [];
}

function extractCardFromQuestion(text) {
    const normalized = normalizeText(String(text || '').trim());
    const knownCards = ['nubank', 'itau', 'itaú', 'atacadao', 'atacadão', 'inter', 'santander', 'bradesco'];
    const ignoredCardNames = new Set([
        'cada', 'todo', 'todos', 'todas',
        'esse', 'essa', 'este', 'esta', 'neste', 'nesta',
        'mes', 'meses', 'proximo', 'proximos', 'proxima', 'proximas',
        'proximo mes', 'proximos meses', 'proxima fatura', 'este mes', 'esse mes'
    ]);
    const cardTailStopWords = new Set([
        'a', 'as', 'o', 'os', 'de', 'do', 'da', 'dos', 'das', 'cada', 'todo', 'todos', 'todas',
        'em', 'no', 'na', 'nos', 'nas', 'partir', 'quanto', 'qual', 'quais',
        'fatura', 'faturas', 'cartao', 'cartoes', 'cartão', 'cartões',
        'aberto', 'aberta', 'abertos', 'abertas', 'ativo', 'ativa', 'ativos', 'ativas',
        'parcela', 'parcelas', 'parcelamento', 'parcelamentos',
        'esse', 'essa', 'este', 'esta', 'neste', 'nesta', 'mes', 'meses',
        'proximo', 'proximos', 'proxima', 'proximas', 'futuro', 'futuros', 'futura', 'futuras',
        'janeiro', 'fevereiro', 'marco', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ]);

    for (const card of knownCards) {
        const normalizedCard = normalizeText(card);
        const match = normalized.match(new RegExp(`\\b${normalizedCard}\\b(?:\\s+([a-z0-9]+))?(?:\\s+([a-z0-9]+))?`, 'i'));
        if (!match) continue;

        const cardWords = [normalizedCard];
        for (const tailWord of match.slice(1).filter(Boolean)) {
            if (cardTailStopWords.has(tailWord) || /^\d+$/.test(tailWord)) break;
            cardWords.push(tailWord);
        }
        return cardWords.join(' ');
    }

    const explicit = normalized.match(/\b(?:cartao|cartão|fatura)\s+(?:do|da|de)?\s*([a-z0-9À-ÿ\s]+?)(?:\s+em\s+|\s+no\s+|\s+na\s+|\s+a\s+partir\s+|\?|$)/i);
    if (explicit && explicit[1]) {
        const cleaned = cleanAnalyticalCategory(explicit[1]);
        return ignoredCardNames.has(cleaned) ? '' : cleaned;
    }
    return '';
}

function isInvoiceByCardQuestion(text) {
    const normalized = normalizeText(String(text || '').trim());
    if (!normalized.includes('fatura')) return false;
    return (
        /\b(cada|todo|todos|todas)\s+(cartao|cartoes)\b/.test(normalized) ||
        /\bpor\s+(cartao|cartoes)\b/.test(normalized) ||
        /\bfaturas?\s+(dos|das|de|por)\s+(cartao|cartoes)\b/.test(normalized) ||
        /\bvalores?\s+das?\s+faturas?\s+(dos|das|de)\s+(cartao|cartoes)\b/.test(normalized)
    );
}

function sanitizeAnalyticalParametersForContext(parameters = {}) {
    const safe = {};
    ['mes', 'ano', 'categoria', 'cartao', 'origem'].forEach((key) => {
        if (parameters[key] !== undefined) safe[key] = parameters[key];
    });
    if (Array.isArray(parameters.categorias)) safe.categorias = parameters.categorias.slice(0, 5);
    return safe;
}

function storeAnalyticalContext(senderId, intentClassification = {}, meta = {}) {
    const key = String(senderId || '').trim();
    const intent = String(intentClassification.intent || '').trim();
    if (!key || !intent || intent === 'pergunta_geral') return;

    analyticalContextBySender.set(key, {
        intent,
        parameters: sanitizeAnalyticalParametersForContext(intentClassification.parameters || {}),
        metric: meta.metric || '',
        storedAt: Date.now(),
        expiresAt: Date.now() + ANALYTICAL_CONTEXT_TTL_MS
    });
}

function getAnalyticalContext(senderId) {
    const key = String(senderId || '').trim();
    if (!key) return null;
    const context = analyticalContextBySender.get(key);
    if (!context) return null;
    if (Date.now() > Number(context.expiresAt || 0)) {
        analyticalContextBySender.delete(key);
        return null;
    }
    return context;
}

function clearAnalyticalContextForTests() {
    analyticalContextBySender.clear();
}

function hasExplicitMonthSignal(text) {
    return /(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|mes passado|mês passado|este mes|este mês|esse mes|esse mês|mês atual|mes atual)/.test(text);
}

function deriveFollowUpAnalyticalQueryPlan(text, context) {
    if (!context || !context.intent) return null;

    const previousParams = context.parameters || {};
    const mes = hasExplicitMonthSignal(text) ? parseMonthFromText(text) : previousParams.mes;
    const ano = /\b20\d{2}\b/.test(text) ? parseYearFromText(text) : previousParams.ano;
    const inheritedParams = {
        ...previousParams,
        mes,
        ano
    };
    const cardName = extractCardFromQuestion(text) || previousParams.cartao || '';
    const hasCardSignal = text.includes('cartao') || text.includes('cartoes') || text.includes('credito') || text.includes('crédito') || text.includes('fatura') || Boolean(extractCardFromQuestion(text));
    const hasEstablishmentSignal = (
        /\b(estabelecimento|estabelecimentos|loja|lojas|local|locais|lugar|lugares|comercio|comércio|comercios|comércios|fornecedor|fornecedores)\b/.test(text) ||
        text.includes('onde') ||
        text.includes('em quais')
    );
    const hasDetailSignal = (
        /\b(detalh|detalhe|detalhar|explique|explica|abrir|abra|quebra|quebre|compoe|compõe)\b/.test(text) ||
        text.includes('como foi') ||
        text.includes('como ficou')
    );
    const asksCategoryBreakdown = /\b(categoria|categorias|tipo|tipos)\b/.test(text) && /\b(por|quais|qual|distribui|divid)\b/.test(text);
    const followUpShape = (
        /^(e|mas|agora|tambem|também)\b/.test(text) ||
        text.length <= 80 ||
        /\b(desse|desses|dessa|dessas|isso|esse|esses|essa|essas|total|valor)\b/.test(text)
    );
    if (!followUpShape) return null;

    if (hasEstablishmentSignal) {
        return {
            metric: 'expense_establishments_followup',
            intent: 'ranking_estabelecimentos_gastos',
            parameters: { ...inheritedParams, origem: hasCardSignal || context.intent === 'detalhamento_cartao_mes' ? 'cartao' : '', cartao: cardName }
        };
    }
    if (hasCardSignal) {
        return {
            metric: 'card_expense_detail_followup',
            intent: 'detalhamento_cartao_mes',
            parameters: { ...inheritedParams, cartao: cardName }
        };
    }
    if (hasDetailSignal) {
        return {
            metric: 'expense_detail_followup',
            intent: context.intent === 'detalhamento_cartao_mes' ? 'detalhamento_cartao_mes' : 'detalhamento_gastos_mes',
            parameters: { ...inheritedParams, cartao: cardName }
        };
    }
    if (asksCategoryBreakdown) {
        return {
            metric: 'top_expense_categories_followup',
            intent: 'ranking_categorias_gastos',
            parameters: inheritedParams
        };
    }

    return null;
}

function inferAnalyticalQueryPlan(userQuestion, previousContext = null) {
    const text = normalizeText(String(userQuestion || '').trim());
    if (!text) return null;

    const followUpPlan = deriveFollowUpAnalyticalQueryPlan(text, previousContext);
    if (followUpPlan) return followUpPlan;

    const mes = parseMonthFromText(text);
    const ano = parseYearFromText(text);
    const hasExpenseSignal = /\b(gastei|gasto|gastos|saida|saidas|despesa|despesas)\b/.test(text);
    const hasTotalSignal = /\b(quanto|total|soma|somar|somando|deu|ficou|some)\b/.test(text);
    const categories = extractMultipleCategoriesFromQuestion(text);
    const comparisonCategories = extractComparisonCategoriesFromQuestion(text);
    const singleCategory = cleanAnalyticalCategory(extractCategoryFromQuestion(text));
    const cardName = extractCardFromQuestion(text);

    const hasCardSignal = text.includes('cartao') || text.includes('cartoes') || Boolean(cardName);
    const hasDetailSignal = (
        /\b(detalh|detalhe|detalhar|explique|explica|explicar|compoe|compõe|composicao|composição|discrimine|abra|abrir|quebra|quebre)\b/.test(text) ||
        text.includes('de onde veio') ||
        text.includes('como foi gasto') ||
        text.includes('como foram gastos') ||
        text.includes('foram gastos como') ||
        text.includes('o que entrou nesse total')
    );
    const hasEstablishmentSignal = (
        /\b(estabelecimento|estabelecimentos|loja|lojas|local|locais|lugar|lugares|comercio|comércio|comercios|comércios|fornecedor|fornecedores)\b/.test(text) ||
        text.includes('onde foi gasto') ||
        text.includes('onde foram gastos')
    );

    if (hasEstablishmentSignal && (hasExpenseSignal || hasCardSignal || text.includes('gasto') || text.includes('gastos') || text.includes('foram'))) {
        return {
            metric: 'expense_establishments',
            intent: 'ranking_estabelecimentos_gastos',
            parameters: { mes, ano, origem: hasCardSignal ? 'cartao' : '', cartao: cardName }
        };
    }

    if (hasDetailSignal && (hasExpenseSignal || hasCardSignal || text.includes('total') || text.includes('valor'))) {
        return {
            metric: hasCardSignal ? 'card_expense_detail' : 'expense_detail',
            intent: hasCardSignal ? 'detalhamento_cartao_mes' : 'detalhamento_gastos_mes',
            parameters: { mes, ano, cartao: cardName }
        };
    }

    if (/\b(meta|metas|objetivo|objetivos)\b/.test(text)) {
        if (
            text.includes('falta') ||
            text.includes('faltam') ||
            text.includes('bater') ||
            text.includes('atingir') ||
            text.includes('alcancar') ||
            text.includes('alcançar') ||
            text.includes('progresso') ||
            text.includes('andamento')
        ) {
            return { metric: 'goals_progress', intent: 'progresso_metas', parameters: {} };
        }
        if (
            text.includes('minhas metas') ||
            text.includes('liste') ||
            text.includes('listar') ||
            text.includes('quais') ||
            text.includes('mostre') ||
            text.includes('mostrar') ||
            text === 'metas' ||
            text === 'minhas metas'
        ) {
            return { metric: 'goals_summary', intent: 'resumo_metas', parameters: {} };
        }
    }

    if ((text.includes('reserva') || text.includes('caixinha')) && (text.includes('disponivel') || text.includes('disponível') || text.includes('realmente'))) {
        return { metric: 'available_cash', intent: 'saldo_disponivel_estimado', parameters: { mes, ano } };
    }
    if (
        (text.includes('vencendo') || text.includes('vencem') || text.includes('vencimento') || text.includes('compromissos financeiros')) &&
        (text.includes('conta') || text.includes('pagamento') || text.includes('pagamentos') || text.includes('compromissos'))
    ) {
        const amanha = text.includes('amanha') || text.includes('amanhã');
        const dias = amanha ? 1 : (text.includes('semana') || text.includes('7 dias') || text.includes('sete dias') ? 7 : 7);
        return { metric: 'upcoming_bills', intent: 'contas_vencendo', parameters: { dias, amanha } };
    }
    if (text.includes('compare') || text.includes('comparar') || text.includes('comparacao') || text.includes('comparação')) {
        if (text.includes('mes anterior') || text.includes('mês anterior') || text.includes('periodo anterior') || text.includes('período anterior')) {
            return { metric: 'period_comparison', intent: 'comparacao_gastos_periodo', parameters: { mes, ano } };
        }
    }

    if (
        (text.includes('conta recorrente') || text.includes('contas recorrentes') || (text.includes('contas') && text.includes('recorrente'))) &&
        (text.includes('quantas') || text.includes('quais') || text.includes('listar') || text.includes('liste') || text.includes('mostrar') || text.includes('mostre') || text.includes('tenho'))
    ) {
        return { metric: 'recurring_bills_summary', intent: 'resumo_contas_recorrentes', parameters: {} };
    }
    if (isInvoiceByCardQuestion(text)) {
        return { metric: 'card_invoice_by_card', intent: 'total_faturas_por_cartao', parameters: { cartao: '', mes, ano } };
    }
    if (
        text.includes('fatura') &&
        (text.includes('paguei') || text.includes('pagamento') || text.includes('pagamentos') || text.includes('paga') || text.includes('pagas') || text.includes('quitei'))
    ) {
        return { metric: 'paid_card_invoice_total', intent: 'total_pagamentos_fatura_mes', parameters: { mes, ano } };
    }
    if ((text.includes('aberto') || text.includes('futuro') || text.includes('futuros') || text.includes('futura') || text.includes('futuras') || text.includes('proximo') || text.includes('proximos') || text.includes('proxima') || text.includes('proximas')) && (hasCardSignal || text.includes('fatura') || text.includes('parcela'))) {
        if ((text.includes('qual') || text.includes('quais')) && (text.includes('mais') || text.includes('maior')) && (text.includes('parcelas') || text.includes('valor'))) {
            return { metric: 'open_cards_ranking', intent: 'ranking_cartoes_em_aberto', parameters: { mes, ano } };
        }
        return { metric: 'open_card_installments', intent: 'total_cartoes_em_aberto', parameters: { cartao: cardName, mes, ano } };
    }
    if (text.includes('fatura') || (hasCardSignal && text.includes('quanto') && !text.includes('aberto'))) {
        return { metric: 'card_invoice_total', intent: 'total_fatura_cartao', parameters: { cartao: cardName, mes, ano } };
    }
    if (text.includes('parcelamento') || (text.includes('parcelas') && (text.includes('ativas') || text.includes('ativos') || text.includes('quais')))) {
        return { metric: 'card_installment_summary', intent: 'resumo_parcelamentos_cartao', parameters: { cartao: cardName, mes, ano } };
    }

    if (text.includes('saldo') || text.includes('sobrou') || text.includes('restou')) {
        return { metric: 'balance', intent: 'saldo_do_mes', parameters: { mes, ano } };
    }
    if (text.includes('duplicad')) {
        return { metric: 'duplicates', intent: 'gastos_valores_duplicados', parameters: { mes, ano } };
    }
    if (text.includes('categoria') && (text.includes('consumiu') || text.includes('mais dinheiro') || text.includes('maior gasto') || text.includes('mais gast'))) {
        return { metric: 'top_expense_categories', intent: 'ranking_categorias_gastos', parameters: { mes, ano } };
    }
    if ((text.includes('cortar') || text.includes('economizar') || text.includes('onde eu deveria')) && (text.includes('gasto') || text.includes('gastos') || text.includes('lancamento') || text.includes('lançamento'))) {
        return { metric: 'top_expense_categories', intent: 'ranking_categorias_gastos', parameters: { mes, ano, advice: true } };
    }
    if (comparisonCategories.length === 2) {
        return { metric: 'category_comparison', intent: 'comparacao_gastos_categorias', parameters: { categorias: comparisonCategories, mes, ano } };
    }
    if (text.includes('maior') || text.includes('menor')) {
        if (singleCategory) {
            return { metric: 'category_extremes', intent: 'maior_menor_gasto_categoria', parameters: { categoria: singleCategory, mes, ano } };
        }
        return { metric: 'extremes', intent: 'maior_menor_gasto', parameters: { mes, ano } };
    }
    if (text.includes('por cento') || text.includes('percentual') || text.includes('porcentagem') || text.includes('representou') || text.includes('representa') || text.includes('participacao') || text.includes('participação')) {
        return {
            metric: 'percentage_of_expenses',
            intent: 'percentual_categoria_gastos',
            parameters: { categoria: extractPercentageCategoryFromQuestion(text), mes, ano }
        };
    }
    if ((text.includes('quantos') || text.includes('quantas')) && (text.includes('lancamento') || text.includes('lançamento') || text.includes('saidas') || text.includes('saídas'))) {
        return { metric: 'output_count', intent: 'contagem_lancamentos_saida', parameters: { mes, ano } };
    }
    if (text.includes('vezes') || text.includes('ocorrencia') || text.includes('ocorrencias')) {
        return { metric: 'count', intent: 'contagem_ocorrencias', parameters: { categoria: singleCategory, mes, ano } };
    }
    if ((text.includes('media') || text.includes('média')) && (/\bpor\s+dia\b/.test(text) || text.includes('diaria') || text.includes('diária'))) {
        return { metric: 'daily_average', intent: 'media_diaria_gastos_mes', parameters: { mes, ano } };
    }
    if ((text.includes('media') || text.includes('média')) && hasExpenseSignal) {
        return { metric: 'average', intent: 'media_gastos_categoria_mes', parameters: { categoria: singleCategory, mes, ano } };
    }
    if (text.includes('liste') || text.includes('listar') || text.includes('mostre') || text.includes('mostrar')) {
        return { metric: 'list', intent: 'listagem_gastos_categoria', parameters: { categoria: singleCategory, mes, ano } };
    }
    if (categories.length > 1 && (hasTotalSignal || hasExpenseSignal)) {
        return { metric: 'sum_by_categories', intent: 'total_gastos_multiplas_categorias', parameters: { categorias: categories, mes, ano } };
    }
    if ((hasTotalSignal || hasExpenseSignal) && hasExpenseSignal) {
        if (!singleCategory) {
            return { metric: 'sum_expenses', intent: 'total_gastos_mes', parameters: { mes, ano } };
        }
        return { metric: 'sum_by_category', intent: 'total_gastos_categoria_mes', parameters: { categoria: singleCategory, mes, ano } };
    }

    return null;
}

function isGreetingMessage(messageBody) {
    const text = normalizeText(String(messageBody || '').trim());
    return /^(oi|ola|olá|bom dia|boa tarde|boa noite|e ai|e aí|opa|fala|alo|alô)[!.?\s]*$/.test(text);
}

function buildGreetingReply(name = '') {
    const firstName = String(name || '').trim().split(/\s+/)[0] || 'por aqui';
    return [
        `Oi, ${firstName}!`,
        'Posso registrar gastos e entradas, responder perguntas financeiras ou abrir seu dashboard.',
        'Exemplos: "gastei 25 no mercado no pix", "quanto gastei em fevereiro?", "dashboard" ou "ajuda".'
    ].join('\n');
}

function normalizeInvitePhoneToWhatsAppId(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 10) return '';
    return `${digits}@c.us`;
}

function buildPreOnboardingInviteMessage() {
    return [
        'Oi! Eu sou o FinançasBot, seu novo assistente financeiro no WhatsApp.',
        '',
        'Salve este número como FinançasBot para encontrar a conversa com facilidade.',
        'Quando estiver pronto, responda aqui com `oi` para iniciar seu cadastro.',
        '',
        'Depois do cadastro, você poderá registrar gastos, entradas, metas, dívidas, lembretes e acompanhar tudo pelo dashboard.'
    ].join('\n');
}

function detectFastPerguntaIntent(messageBody) {
    const text = normalizeText(String(messageBody || '').trim());
    if (!text) return null;

    const isQuestionShape = /^(qual|quais|quanto|quantos|quantas|conte|contar|media|média|liste|listar|mostre|mostrar|me mostre|me mostra|me diga|me explique|me explica|como ficou|como esta|como estão|detalhe|detalhar|explique|explica)/.test(text) || text.includes('?');
    if (!isQuestionShape) return null;

    const looksAnalytical = /(saldo|gastei|gasto|gastos|entrada|entradas|divida|dividas|categoria|mes|ano|vezes|ocorrencia|ocorrencias|duplicad|maior|menor|onibus|ônibus|uber|transporte|cartao|cartão|credito|crédito|fatura|parcelamento|parcelas|aberto|conta|contas|recorrente|recorrentes|nubank|itau|itaú|atacadao|atacadão|detalh|explica|explique|estabelecimento|estabelecimentos|loja|lojas|comercio|comércio|comercios|comércios|total|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/.test(text);
    if (!looksAnalytical) return null;

    return {
        intent: 'pergunta',
        question: messageBody
    };
}

function detectLocalCommandIntent(messageBody) {
    const text = normalizeText(String(messageBody || '').trim());
    if (!text) return null;

    if (['ajuda', 'help', 'menu', 'comandos', 'o que voce faz', 'o que você faz'].includes(text)) {
        return { intent: 'ajuda' };
    }

    if (
        ['resumo', 'balanco', 'balanço', 'saude financeira', 'saúde financeira'].includes(text) ||
        /^(resumo|balanco|balanço|relatorio|relatório)\b/.test(text)
    ) {
        return { intent: 'resumo' };
    }

    return null;
}

function shouldSkipAiForUnknownMessage(messageBody) {
    const text = normalizeText(String(messageBody || '').trim());
    if (!text) return true;
    if (/\d/.test(text)) return false;

    const lowSignalMessages = new Set([
        'teste',
        'test',
        'ok',
        'okay',
        'obrigado',
        'obrigada',
        'valeu',
        'vlw',
        'show',
        'beleza'
    ]);
    if (lowSignalMessages.has(text)) return true;

    const knownSignals = [
        'gastei', 'gasto', 'paguei', 'comprei', 'recebi', 'ganhei', 'entrada',
        'criar', 'meta', 'divida', 'dívida', 'apagar', 'delete', 'registrar',
        'pagamento', 'lembrete', 'lembre', 'quanto', 'qual', 'quais', 'liste',
        'listar', 'mostre', 'mostrar', 'saldo', 'resumo', 'dashboard', 'painel',
        'termos', 'privacidade', 'admin', 'ajuda', 'relatorio', 'relatório',
        'checkin', 'reserva', 'cartao', 'cartão', 'credito', 'crédito', 'pix',
        'dinheiro', 'debito', 'débito', 'conta', 'contas', 'recorrente',
        'detalhe', 'detalhar', 'estabelecimento', 'estabelecimentos'
    ];

    return !knownSignals.some(signal => text.includes(normalizeText(signal))) && text.length <= 80;
}

function shouldInterruptStatementImportConfirmation(messageBody) {
    const text = normalizeText(String(messageBody || '').trim());
    if (!text) return false;
    if (['sim', 's', 'ss', 'confirmo', 'importar', 'nao', 'não', 'n', 'cancelar', 'cancela'].includes(text)) {
        return false;
    }

    return /^(gastei|gasto|paguei|comprei|recebi|ganhei|entrada|quanto|qual|quais|liste|listar|mostre|mostrar|dashboard|painel|ajuda|criar|apagar|registrar|me lembre|lembre|resumo)\b/.test(text);
}

function classifyPerguntaLocally(userQuestion, previousContext = null) {
    const plan = inferAnalyticalQueryPlan(userQuestion, previousContext);
    if (!plan) return null;
    return { intent: plan.intent, parameters: plan.parameters };
}

function buildLocalPerguntaResponse({ userQuestion, intent, analyzedData }) {
    const results = analyzedData?.results;
    const details = analyzedData?.details || {};
    const mes = getMonthNamePtBr(details?.mes);
    const ano = details?.ano;
    const periodLabel = mes && ano ? `${mes}/${ano}` : (ano ? String(ano) : 'período informado');

    if (intent === 'saldo_do_mes') {
        return [
            `Saldo em ${periodLabel}: ${formatCurrencyBR(results)}`,
            `Entradas: ${formatCurrencyBR(details.totalEntradas)}`,
            `Saídas: ${formatCurrencyBR(details.totalSaidas)}`
        ].join('\n');
    }

    if (intent === 'saldo_disponivel_estimado') {
        return [
            `Disponível estimado em ${periodLabel}: ${formatCurrencyBR(results)}`,
            `Saldo econômico: ${formatCurrencyBR(details.saldo)}`,
            `Reserva/caixinha líquida: ${formatCurrencyBR(details.reservaLiquida || 0)}`,
            `Aplicado: ${formatCurrencyBR(details.reservaAplicada || 0)} | Resgatado: ${formatCurrencyBR(details.reservaResgatada || 0)}`
        ].join('\n');
    }

    if (intent === 'total_gastos_mes') {
        const lines = [`Total gasto em ${periodLabel}: ${formatCurrencyBR(results)}`];
        if (details.totalSaidas !== undefined || details.totalCartoes !== undefined) {
            lines.push(`Saídas: ${formatCurrencyBR(details.totalSaidas)}`);
            lines.push(`Cartões: ${formatCurrencyBR(details.totalCartoes)}`);
        }
        return lines.join('\n');
    }

    if (intent === 'total_gastos_categoria_mes') {
        const cat = details.categoria || 'categoria informada';
        return `Total gasto com ${cat} em ${periodLabel}: ${formatCurrencyBR(results)}`;
    }

    if (intent === 'media_gastos_categoria_mes') {
        const cat = details.categoria || 'categoria informada';
        return `Média de gastos com ${cat} em ${periodLabel}: ${formatCurrencyBR(results)}`;
    }

    if (intent === 'media_diaria_gastos_mes') {
        const dias = details.diasConsiderados || details.dias || 0;
        const total = details.totalGastos !== undefined ? `\nTotal considerado: ${formatCurrencyBR(details.totalGastos)}` : '';
        const suffix = dias ? ` (${dias} dia(s) considerados)` : '';
        return `Média diária de gastos em ${periodLabel}: ${formatCurrencyBR(results)}${suffix}${total}`;
    }

    if (intent === 'total_gastos_multiplas_categorias') {
        const cats = Array.isArray(details.categorias) ? details.categorias.join(' + ') : 'categorias informadas';
        return `Total gasto com ${cats} em ${periodLabel}: ${formatCurrencyBR(results)}`;
    }

    if (intent === 'percentual_categoria_gastos') {
        const cat = details.categoria || 'categoria informada';
        const pct = Number(results || 0).toFixed(2).replace('.', ',');
        return `${cat} representou ${pct}% dos seus gastos em ${periodLabel}.\n${cat}: ${formatCurrencyBR(details.totalCategoria || 0)}\nTotal de gastos: ${formatCurrencyBR(details.totalGastos || 0)}`;
    }

    if (intent === 'comparacao_gastos_categorias') {
        const categorias = Array.isArray(results?.categorias) ? results.categorias : [];
        if (categorias.length < 2) return `Não consegui comparar as categorias em ${periodLabel}.`;
        const [first, second] = categorias;
        const diff = Number(first.total || 0) - Number(second.total || 0);
        const firstLine = `${first.categoria}: ${formatCurrencyBR(first.total || 0)}`;
        const secondLine = `${second.categoria}: ${formatCurrencyBR(second.total || 0)}`;
        if (Math.abs(diff) < 0.005) {
            return `As categorias empataram em ${periodLabel}.\n${firstLine}\n${secondLine}`;
        }
        const higher = diff > 0 ? first : second;
        const lower = diff > 0 ? second : first;
        return [
            `${higher.categoria} foi maior que ${lower.categoria} em ${periodLabel}.`,
            firstLine,
            secondLine,
            `Diferença: ${formatCurrencyBR(Math.abs(diff))}`
        ].join('\n');
    }

    if (intent === 'listagem_gastos_categoria') {
        if (!Array.isArray(results) || results.length === 0) {
            return `Não encontrei gastos para esse filtro em ${periodLabel}.`;
        }
        const lines = results.slice(0, 15).map((row, idx) => {
            const data = formatSheetDateForReply(row[0]);
            const desc = row[1] || 'sem descrição';
            const val = formatCurrencyBR(row[4] || 0);
            return `${idx + 1}. ${data} | ${desc} | ${val}`;
        });
        const truncated = results.length > 15 ? `\n... e mais ${results.length - 15} item(ns).` : '';
        return `Gastos encontrados (${results.length}) em ${periodLabel}:\n${lines.join('\n')}${truncated}`;
    }

    if (intent === 'contagem_ocorrencias') {
        return `Ocorrências encontradas em ${periodLabel}: ${results}`;
    }

    if (intent === 'contagem_lancamentos_saida') {
        return `${results} lançamento(s) de saída em ${periodLabel}.`;
    }

    if (intent === 'gastos_valores_duplicados') {
        if (!Array.isArray(results) || results.length === 0) {
            return `Não encontrei valores duplicados em ${periodLabel}.`;
        }
        const lines = results.slice(0, 10).map((item, idx) => `${idx + 1}. ${formatCurrencyBR(item.valor)} (${item.count}x)`);
        return `Valores duplicados em ${periodLabel}:\n${lines.join('\n')}`;
    }

    if (intent === 'maior_menor_gasto' || intent === 'maior_menor_gasto_categoria') {
        const min = results?.min;
        const max = results?.max;
        if (!min && !max) return `Não encontrei gastos para esse período (${periodLabel}).`;
        const categoryLabel = intent === 'maior_menor_gasto_categoria' && details.categoria ? ` com ${details.categoria}` : '';
        return [
            `Maior e menor gasto${categoryLabel} em ${periodLabel}:`,
            `- Maior: ${max ? `${max[1] || '-'} (${formatCurrencyBR(max[4] || 0)})` : '-'}`,
            `- Menor: ${min ? `${min[1] || '-'} (${formatCurrencyBR(min[4] || 0)})` : '-'}`
        ].join('\n');
    }

    if (intent === 'total_fatura_cartao') {
        const cardLabel = details.cartao ? ` do ${details.cartao}` : '';
        const parcelas = details.parcelas ? `\n${details.parcelas} parcela(s) lançadas` : '';
        return `Fatura${cardLabel} em ${periodLabel}: ${formatCurrencyBR(results)}${parcelas}`;
    }

    if (intent === 'total_faturas_por_cartao') {
        const rows = Array.isArray(results) ? results : [];
        if (rows.length === 0) return `Não encontrei faturas de cartão em ${periodLabel}.`;
        const lines = rows.slice(0, 12).map((item, idx) => {
            const parcelas = Number(item.parcelas || 0);
            const parcelasLabel = parcelas === 1 ? '1 parcela' : `${parcelas} parcelas`;
            return `${idx + 1}. ${item.cartao || 'Cartão'}: ${formatCurrencyBR(item.total || 0)} (${parcelasLabel})`;
        });
        const truncated = rows.length > 12 ? `\n... e mais ${rows.length - 12} cartão(ões).` : '';
        const total = details.total !== undefined
            ? Number(details.total || 0)
            : rows.reduce((sum, item) => sum + Number(item.total || 0), 0);
        return `Faturas por cartão em ${periodLabel}:\n${lines.join('\n')}${truncated}\nTotal: ${formatCurrencyBR(total)}`;
    }

    if (intent === 'total_pagamentos_fatura_mes') {
        const pagamentos = Number(details.pagamentos || 0);
        const countLabel = pagamentos === 1 ? '1 pagamento encontrado' : `${pagamentos} pagamentos encontrados`;
        const note = details.canGroupByCard === false
            ? '\nNão consegui separar por cartão porque o extrato não trouxe essa identificação no pagamento.'
            : '';
        return `Pagamentos de fatura em ${periodLabel}: ${formatCurrencyBR(results)}\n${countLabel}${note}`;
    }

    if (intent === 'resumo_contas_recorrentes') {
        const contas = Array.isArray(results) ? results : [];
        if (contas.length === 0) return 'Não encontrei contas recorrentes cadastradas.';
        const total = Number(details.total || contas.length);
        const regrasAtivas = Number(details.regrasAtivas || 0);
        const lembretes = Number(details.lembretes || total);
        const lines = contas.slice(0, 15).map((item, idx) => {
            const dia = item.dia ? `dia ${item.dia}` : 'sem dia';
            const categoria = [item.categoria, item.subcategoria].filter(Boolean).join(' / ');
            const suffix = categoria ? ` (${categoria})` : '';
            const rule = item.ativa ? ' - classificação automática ativa' : '';
            return `${idx + 1}. ${dia} - ${item.nome || 'Conta recorrente'}${suffix}${rule}`;
        });
        const truncated = contas.length > 15 ? `\n... e mais ${contas.length - 15} conta(s).` : '';
        return [
            `${total} conta(s) recorrente(s) cadastrada(s).`,
            `${regrasAtivas} com classificação automática; ${lembretes} com lembrete/vencimento.`,
            lines.join('\n') + truncated
        ].join('\n');
    }

    if (intent === 'contas_vencendo') {
        const contas = Array.isArray(results) ? results : [];
        const dias = Number(details.dias || 7);
        const title = details.amanha ? 'Vencimentos de amanhã' : `Vencimentos nos próximos ${dias} dias`;
        if (contas.length === 0) return `${title}: não encontrei pagamento ou vencimento cadastrado.`;
        const lines = contas.slice(0, 15).map((item, idx) => {
            const valor = item.valorEsperado ? ` | ${formatCurrencyBR(item.valorEsperado)}` : '';
            const prazo = item.diasAteVencimento === 0 ? 'hoje' : `em ${item.diasAteVencimento} dia(s)`;
            return `${idx + 1}. ${item.data} - ${item.nome || 'Conta'} (${prazo})${valor}`;
        });
        const truncated = contas.length > 15 ? `\n... e mais ${contas.length - 15} vencimento(s).` : '';
        return `${title}:\n${lines.join('\n')}${truncated}`;
    }

    if (intent === 'total_cartoes_em_aberto') {
        const cardLabel = details.cartao ? ` no ${details.cartao}` : ' nos cartões';
        const parcelas = details.parcelas ? `\n${details.parcelas} parcela(s) em aberto` : '';
        const meses = details.meses ? `\nMeses com cobrança: ${details.meses}` : '';
        return `Em aberto${cardLabel} a partir de ${periodLabel}: ${formatCurrencyBR(results)}${parcelas}${meses}`;
    }

    if (intent === 'ranking_cartoes_em_aberto') {
        const rows = Array.isArray(results) ? results : [];
        if (rows.length === 0) return `Não encontrei parcelas em aberto a partir de ${periodLabel}.`;
        const lines = rows.slice(0, 10).map((item, idx) => {
            const parcelas = Number(item.parcelas || 0);
            const parcelasLabel = parcelas === 1 ? '1 parcela' : `${parcelas} parcelas`;
            return `${idx + 1}. ${item.cartao || 'Cartão'}: ${formatCurrencyBR(item.total || 0)} (${parcelasLabel})`;
        });
        return `Cartões com mais parcelas em aberto a partir de ${periodLabel}:\n${lines.join('\n')}`;
    }

    if (intent === 'resumo_parcelamentos_cartao') {
        if (!Array.isArray(results) || results.length === 0) {
            return `Não encontrei parcelamentos ativos a partir de ${periodLabel}.`;
        }
        const lines = results.slice(0, 10).map((item, idx) => [
            `${idx + 1}. ${item.descricao || 'sem descrição'}`,
            item.cartao ? ` | ${item.cartao}` : '',
            ` | ${formatCurrencyBR(item.totalPrevisto || 0)}`,
            ` | ${item.parcelasLancadas || 0} parcela(s)`,
            item.ultimaParcela ? ` | até ${formatSheetDateForReply(item.ultimaParcela)}` : ''
        ].join(''));
        const truncated = results.length > 10 ? `\n... e mais ${results.length - 10} parcelamento(s).` : '';
        return `Parcelamentos ativos a partir de ${periodLabel}:\n${lines.join('\n')}${truncated}`;
    }

    if (intent === 'ranking_categorias_gastos') {
        const rows = Array.isArray(results) ? results : [];
        if (rows.length === 0) return `Não encontrei gastos em ${periodLabel}.`;
        const totalGastos = Number(details.totalGastos || rows.reduce((sum, item) => sum + Number(item.total || 0), 0));
        const lines = rows.slice(0, 8).map((item, idx) => {
            const pct = totalGastos > 0 ? ` (${((Number(item.total || 0) / totalGastos) * 100).toFixed(1).replace('.', ',')}%)` : '';
            const count = item.count ? `, ${item.count} lançamento(s)` : '';
            return `${idx + 1}. ${item.categoria || 'Outros'}: ${formatCurrencyBR(item.total || 0)}${pct}${count}`;
        });
        const advice = details.advice
            ? '\nComece revisando as 2 primeiras categorias: são onde um ajuste pequeno costuma gerar maior impacto.'
            : '';
        return `Categorias que mais consumiram em ${periodLabel}:\n${lines.join('\n')}${advice}`;
    }

    if (intent === 'detalhamento_gastos_mes' || intent === 'detalhamento_cartao_mes') {
        const payload = results || {};
        const lancamentos = Array.isArray(payload.lancamentos) ? payload.lancamentos : [];
        if (lancamentos.length === 0) {
            return `Não encontrei gastos para detalhar em ${periodLabel}.`;
        }
        const title = intent === 'detalhamento_cartao_mes'
            ? `Detalhamento dos gastos no cartão em ${periodLabel}:`
            : `Detalhamento dos gastos em ${periodLabel}:`;
        const lines = [
            title,
            `Total: ${formatCurrencyBR(payload.total || 0)}`
        ];
        if (intent !== 'detalhamento_cartao_mes') {
            lines.push(`Saídas: ${formatCurrencyBR(payload.totalSaidas || 0)}`);
            lines.push(`Cartões: ${formatCurrencyBR(payload.totalCartoes || 0)}`);
        }

        const categories = Array.isArray(payload.categorias) ? payload.categorias.slice(0, 5) : [];
        if (categories.length > 0) {
            lines.push('');
            lines.push('Por categoria:');
            categories.forEach((item, idx) => {
                const count = item.count ? ` (${item.count} lançamento(s))` : '';
                lines.push(`${idx + 1}. ${item.label || 'Outros'}: ${formatCurrencyBR(item.total || 0)}${count}`);
            });
        }

        const establishments = Array.isArray(payload.estabelecimentos) ? payload.estabelecimentos.slice(0, 5) : [];
        if (establishments.length > 0) {
            lines.push('');
            lines.push('Principais estabelecimentos:');
            establishments.forEach((item, idx) => {
                const count = item.count ? ` (${item.count} lançamento(s))` : '';
                lines.push(`${idx + 1}. ${item.label || 'Sem descrição'}: ${formatCurrencyBR(item.total || 0)}${count}`);
            });
        }

        lines.push('');
        lines.push('Lançamentos que compõem:');
        lancamentos.slice(0, 8).forEach((item, idx) => {
            const date = formatSheetDateForReply(item.data);
            const source = item.tipo === 'cartao'
                ? `Cartão${item.cartao ? ` - ${item.cartao}` : ''}`
                : (item.pagamento || item.origem || 'Saída');
            lines.push(`${idx + 1}. ${date} | ${item.descricao || 'sem descrição'} | ${item.categoria || 'Outros'} | ${formatCurrencyBR(item.valor || 0)} | ${source}`);
        });
        if (lancamentos.length > 8) {
            lines.push(`... e mais ${lancamentos.length - 8} lançamento(s).`);
        }
        if (details.criterioCartao === 'mes_cobranca' && Number(payload.totalCartoes || 0) > 0) {
            lines.push('');
            lines.push('Obs.: cartões entram pelo mês de cobrança/fatura, não necessariamente pela data da compra.');
        }
        return lines.join('\n');
    }

    if (intent === 'ranking_estabelecimentos_gastos') {
        const rows = Array.isArray(results) ? results : [];
        const scope = details.somenteCartao ? ' no cartão' : '';
        if (rows.length === 0) return `Não encontrei estabelecimentos com gastos${scope} em ${periodLabel}.`;
        const total = Number(details.total || rows.reduce((sum, item) => sum + Number(item.total || 0), 0));
        const lines = rows.slice(0, 12).map((item, idx) => {
            const count = item.count ? ` (${item.count} lançamento(s))` : '';
            return `${idx + 1}. ${item.label || 'Sem descrição'}: ${formatCurrencyBR(item.total || 0)}${count}`;
        });
        const truncated = rows.length > 12 ? `\n... e mais ${rows.length - 12} estabelecimento(s).` : '';
        return `Estabelecimentos com gastos${scope} em ${periodLabel}:\n${lines.join('\n')}${truncated}\nTotal detalhado: ${formatCurrencyBR(total)}`;
    }

    if (intent === 'comparacao_gastos_periodo') {
        const atualMes = getMonthNamePtBr(details?.mes);
        const anteriorMes = getMonthNamePtBr(details?.mesAnterior);
        const atualLabel = atualMes && details?.ano ? `${atualMes}/${details.ano}` : periodLabel;
        const anteriorLabel = anteriorMes && details?.anoAnterior ? `${anteriorMes}/${details.anoAnterior}` : 'período anterior';
        const diferenca = Number(results?.diferenca || 0);
        const pct = Math.abs(Number(results?.percentual || 0)).toFixed(2).replace('.', ',');
        const direction = Math.abs(diferenca) < 0.005 ? 'ficaram praticamente iguais' : (diferenca > 0 ? `aumentaram ${pct}%` : `diminuíram ${pct}%`);
        return [
            `Comparação de gastos: ${atualLabel} vs ${anteriorLabel}`,
            `${atualLabel}: ${formatCurrencyBR(results?.atual || 0)}`,
            `${anteriorLabel}: ${formatCurrencyBR(results?.anterior || 0)}`,
            `Diferença: ${formatCurrencyBR(Math.abs(diferenca))} (${direction})`
        ].join('\n');
    }

    if (intent === 'resumo_metas') {
        const metas = Array.isArray(results) ? results : [];
        if (metas.length === 0) return 'Não encontrei metas cadastradas.';
        const total = Number(details.total || metas.length);
        const ativas = Number(details.ativas || 0);
        const lines = metas.slice(0, 10).map((item, idx) => {
            const pct = Number(item.progressoPct || 0).toFixed(1).replace('.', ',');
            const status = item.status ? ` | ${item.status}` : '';
            const prioridade = item.prioridade ? ` | prioridade: ${item.prioridade}` : '';
            const prazo = item.dataFim ? ` | prazo: ${item.dataFim}` : '';
            return `${idx + 1}. ${item.nome || 'Meta'}: ${formatCurrencyBR(item.atual || 0)} / ${formatCurrencyBR(item.alvo || 0)} (${pct}%)${status}${prioridade}${prazo}`;
        });
        const truncated = metas.length > 10 ? `\n... e mais ${metas.length - 10} meta(s).` : '';
        return [
            `${total} meta(s) cadastrada(s); ${ativas} em andamento.`,
            lines.join('\n') + truncated,
            `Falta total: ${formatCurrencyBR(details.totalFalta || 0)}`
        ].join('\n');
    }

    if (intent === 'progresso_metas') {
        const metas = Array.isArray(results) ? results : [];
        if (metas.length === 0) return 'Não encontrei metas em andamento.';
        const lines = metas.slice(0, 10).map((item, idx) => {
            const pct = Number(item.progressoPct || 0).toFixed(1).replace('.', ',');
            const monthly = Number(item.valorMensal || 0) > 0 ? ` | mensal sugerido: ${formatCurrencyBR(item.valorMensal)}` : '';
            return `${idx + 1}. ${item.nome || 'Meta'}: faltam ${formatCurrencyBR(item.falta || 0)} (${pct}% concluído)${monthly}`;
        });
        const monthlyTotal = Number(details.totalValorMensal || 0) > 0
            ? `\nValor mensal sugerido total: ${formatCurrencyBR(details.totalValorMensal)}`
            : '';
        return `Falta para suas metas: ${formatCurrencyBR(details.totalFalta || 0)}\n${lines.join('\n')}${monthlyTotal}`;
    }

    return null;
}

function filterSheetRowsByUserId(rows, userIdIndex, userId) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const [header, ...dataRows] = rows;
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) return [header];

    return [
        header,
        ...dataRows.filter(row => String(row?.[userIdIndex] || '').trim() === safeUserId)
    ];
}

function filterSheetRowsByUserIds(rows, userIdIndex, userIds) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const [header, ...dataRows] = rows;
    const allowed = new Set((Array.isArray(userIds) ? userIds : [userIds])
        .map(id => String(id || '').trim())
        .filter(Boolean));
    if (allowed.size === 0) return [header];

    return [
        header,
        ...dataRows.filter(row => allowed.has(String(row?.[userIdIndex] || '').trim()))
    ];
}

function buildUserQuestionAliases(user = {}) {
    const aliases = new Set();
    const addAlias = (value) => {
        const normalized = normalizeText(value);
        if (normalized && normalized.length >= 3) aliases.add(normalized);
    };

    addAlias(user.display_name);
    addAlias(user.full_name);
    addAlias(user.preferred_name);

    for (const alias of Array.from(aliases)) {
        alias
            .split(/\s+/)
            .map(part => part.trim())
            .filter(part => part.length >= 3)
            .forEach(part => aliases.add(part));
    }

    return Array.from(aliases);
}

function resolveQuestionUserScope(userQuestion, users = [], defaultUserIds = []) {
    return resolveQuestionUserScopeMatch(userQuestion, users, defaultUserIds).userIds;
}

function resolveQuestionUserScopeMatch(userQuestion, users = [], defaultUserIds = []) {
    const fallback = (Array.isArray(defaultUserIds) ? defaultUserIds : [defaultUserIds])
        .map(id => String(id || '').trim())
        .filter(Boolean);
    const fallbackResult = { userIds: fallback, matchedUser: null, matchedAliases: [] };
    if (fallback.length <= 1) return fallbackResult;

    const allowed = new Set(fallback);
    const text = normalizeText(userQuestion);
    if (!text) return fallbackResult;

    const matches = (Array.isArray(users) ? users : [])
        .filter(user => allowed.has(String(user?.user_id || '').trim()))
        .map(user => {
            const matchedAliases = buildUserQuestionAliases(user).filter(alias => text.includes(alias));
            return { user, matchedAliases };
        })
        .filter(match => match.matchedAliases.length > 0);

    const uniqueMatches = Array.from(new Set(matches
        .map(match => String(match.user?.user_id || '').trim())
        .filter(Boolean)));
    if (uniqueMatches.length !== 1) return fallbackResult;

    const selected = matches.find(match => String(match.user?.user_id || '').trim() === uniqueMatches[0]);
    return {
        userIds: uniqueMatches,
        matchedUser: selected?.user || null,
        matchedAliases: selected?.matchedAliases || []
    };
}

function categoryMatchesQuestionUser(category, userScopeMatch = {}) {
    const normalizedCategory = normalizeText(category);
    if (!normalizedCategory || !userScopeMatch?.matchedUser) return false;
    return (userScopeMatch.matchedAliases || []).some(alias =>
        normalizedCategory === alias ||
        normalizedCategory.includes(alias) ||
        alias.includes(normalizedCategory)
    );
}

function normalizeIntentForQuestionUserScope(intentClassification, userScopeMatch = {}) {
    if (!intentClassification || !categoryMatchesQuestionUser(intentClassification.parameters?.categoria, userScopeMatch)) {
        return intentClassification;
    }

    const parameters = { ...(intentClassification.parameters || {}) };
    delete parameters.categoria;
    const intentByCategoryIntent = {
        total_gastos_categoria_mes: 'total_gastos_mes',
        maior_menor_gasto_categoria: 'maior_menor_gasto'
    };
    return {
        ...intentClassification,
        intent: intentByCategoryIntent[intentClassification.intent] || intentClassification.intent,
        parameters
    };
}

function shouldRouteResumoToPergunta(messageBody) {
    const text = normalizeText(String(messageBody || '').trim());
    if (!text) return false;

    const startsAsQuestion = /^(qual|quais|quanto|quantos|liste|listar|mostre|mostrar|me diga|como ficou|como esta|como estão)/.test(text);
    const hasQuestionMark = String(messageBody || '').includes('?');
    if (!startsAsQuestion && !hasQuestionMark) return false;

    const analyticalKeywords = [
        'saldo',
        'gasto',
        'gastei',
        'entrada',
        'recebi',
        'divida',
        'meta',
        'categoria',
        'mes',
        'ano',
        'janeiro',
        'fevereiro',
        'marco',
        'abril',
        'maio',
        'junho',
        'julho',
        'agosto',
        'setembro',
        'outubro',
        'novembro',
        'dezembro'
    ];

    const hasAnalyticalKeyword = analyticalKeywords.some((kw) => text.includes(kw));
    const hasYear = /\b20\d{2}\b/.test(text);
    return hasAnalyticalKeyword || hasYear;
}

function isCurrentMonthYear(date, month, year) {
    return date && date.getMonth() === month && date.getFullYear() === year;
}

async function timeStep(label, fn, context = '') {
    const startedAt = Date.now();
    try {
        return await fn();
    } finally {
        const elapsedMs = Date.now() - startedAt;
        metrics.observeDuration(`message.step.${label}.ms`, elapsedMs);
        if (elapsedMs >= PERF_WARN_MS) {
            metrics.increment(`message.step.${label}.slow`);
            console.warn(`[perf] ${label} levou ${elapsedMs}ms${context ? ` (${context})` : ''}`);
        }
    }
}

async function handleLegalCommands(msg) {
    const body = normalizeText(String(msg.body || '').trim());
    if (!body) return false;

    const termsVersion = process.env.TERMS_VERSION || 'v1.0';
    const termsUrl = process.env.TERMS_URL || '';
    const privacyUrl = process.env.PRIVACY_URL || '';

    if (body === 'termos' || body === 'politica de privacidade' || body === 'privacidade') {
        const termsLine = termsUrl
            ? `Termos (${termsVersion}): ${termsUrl}`
            : `Termos (${termsVersion}): resumo enviado abaixo.`;
        const privacyLine = privacyUrl
            ? `Privacidade: ${privacyUrl}`
            : 'Privacidade: resumo enviado abaixo.';
        const summary = [
            'Resumo legal:',
            '- Uso condicionado ao consentimento por ACEITO.',
            '- Dados tratados: identificação do WhatsApp e lançamentos financeiros enviados por você.',
            '- Finalidade: operação do bot, relatórios e auditoria.',
            '- Ciclo de vida: PENDING, PENDING_APPROVAL, APPROVED_AWAITING_GOOGLE, ACTIVE, INACTIVE, BLOCKED, DELETED, EXPIRED.',
            '- Mudança de termos exige novo consentimento.'
        ].join('\n');
        await sendPlainMessage(msg, `${termsLine}\n${privacyLine}\n\n${summary}`);
        return true;
    }

    return false;
}

function getLegalCommandName(body) {
    const normalized = normalizeText(String(body || '').trim());
    if (normalized === 'termos') return 'termos';
    if (normalized === 'politica de privacidade' || normalized === 'privacidade') return 'privacidade';
    return null;
}

function buildLegalCommandLogContext(msg, user) {
    const command = getLegalCommandName(msg?.body);
    if (!command) return null;
    return {
        command,
        sender_id: msg?.author || msg?.from || '',
        user_id: user?.user_id || '',
        display_name: user?.display_name || '',
        terms_version: process.env.TERMS_VERSION || 'v1.1'
    };
}

function senderIdFromMessage(msg) {
    return msg?.author || msg?.from || '';
}

function normalizeSettingsCommandText(text) {
    return normalizeText(String(text || ''))
        .replace(/[`*_~]/g, ' ')
        .replace(/[-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isCheckinSettingsCommand(body, action) {
    return new RegExp(`^${action}\\s+(?:o\\s+)?check\\s*in(?:\\s+semanal)?$`).test(body);
}

function isReserveDisableCommand(body) {
    return /^desativar\s+(?:a\s+)?reserva(?:\s+automatica)?$/.test(body);
}

function isMonthlyBudgetCommandLike(body) {
    const text = normalizeSettingsCommandText(body);
    return /\borcamento\b/.test(text) && (
        /\bmensal\b/.test(text) ||
        /\blivre\b/.test(text) ||
        /\bgastos?\b/.test(text)
    );
}

function parseMonthlyBudgetCommand(body) {
    const text = normalizeSettingsCommandText(body);
    if (!/^(?:definir|ativar|configurar|criar)\s+/.test(text) || !isMonthlyBudgetCommandLike(text)) return null;
    const amountMatch = text.match(/\b\d+(?:[.,]\d{1,2})?\b/);
    const amount = amountMatch ? parseValue(amountMatch[0]) : 0;
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return {
        amount,
        scope: normalizeMonthlyBudgetScope(text),
        cycleStartDay: extractMonthlyBudgetCycleStartDay(text)
    };
}

function isLegacyDailyGoalCommandLike(body) {
    const text = normalizeSettingsCommandText(body);
    return /\bmeta\b/.test(text) && /\bdiaria\b/.test(text);
}

function extractMonthlyBudgetCycleStartDay(body) {
    const text = normalizeSettingsCommandText(body);
    const match = text.match(/(?:comec(?:a|ando)|inicio|iniciar|a partir do|ciclo|dia)\s+(?:no\s+)?(?:dia\s+)?(\d{1,2})\b/);
    if (!match) return null;
    const day = Number.parseInt(match[1], 10);
    return day >= 1 && day <= 31 ? day : null;
}

function parseMonthlyBudgetCycleStartDayReply(body) {
    const match = String(body || '').match(/\b(\d{1,2})\b/);
    if (!match) return null;
    const day = Number.parseInt(match[1], 10);
    return day >= 1 && day <= 31 ? day : null;
}

function extractFullNameSettingsCommand(text) {
    const fullNameMatch = String(text || '').trim().match(/^(?:definir\s+nome\s+completo|meu\s+nome\s+completo\s+(?:e|é))\s+(.+)$/i);
    if (!fullNameMatch) return '';
    return String(fullNameMatch[1] || '').replace(/\s+/g, ' ').trim();
}

async function saveMonthlyBudgetSettings(userId, amount, scope = 'personal', cycleStartDay = 1) {
    const normalizedScope = scope === 'family' ? 'family' : 'personal';
    const normalizedCycleStartDay = normalizeCycleStartDay(cycleStartDay);
    await upsertUserSettings(userId, {
        monthly_budget_enabled: 'SIM',
        monthly_budget_amount: String(amount),
        monthly_budget_scope: normalizedScope,
        monthly_budget_cycle_start_day: String(normalizedCycleStartDay),
        monthly_budget_last_alert_date: '',
        monthly_budget_last_alert_level: '',
        daily_goal_enabled: 'NÃO'
    });
}

async function saveMonthlyBudgetSettingsWithFeedback(msg, userId, amount, scope = 'personal', cycleStartDay = 1) {
    try {
        await saveMonthlyBudgetSettings(userId, amount, scope, cycleStartDay);
        return true;
    } catch (error) {
        logger.error(`[settings] monthly_budget_save_failed user_id=${userId} error=${error.message}`);
        await msg.reply('Não consegui salvar o orçamento mensal agora. O bot continua online; tente novamente em alguns instantes.');
        return false;
    }
}

async function handleSettingsCommands(msg, user) {
    const rawBody = String(msg.body || '').trim();
    const body = normalizeSettingsCommandText(msg.body);
    if (!body) return false;

    const fullName = extractFullNameSettingsCommand(rawBody);
    if (fullName) {
        if (fullName.length < 5 || normalizeSettingsCommandText(fullName).split(' ').length < 2) {
            await msg.reply('Me envie nome e sobrenome. Exemplo: definir nome completo Daniel Ferreira dos Santos');
            return true;
        }
        await upsertUserProfile(user.user_id, { full_name: fullName });
        await msg.reply(`Nome completo salvo: ${fullName}. Vou usar isso para reconhecer transferências internas nos extratos.`);
        return true;
    }

    if (isCheckinSettingsCommand(body, 'ativar')) {
        await upsertUserSettings(user.user_id, { weekly_checkin_opt_in: 'SIM' });
        await msg.reply('Check-in semanal ativado. Enviarei 1 pergunta curta no domingo.');
        return true;
    }
    if (isCheckinSettingsCommand(body, 'desativar')) {
        await upsertUserSettings(user.user_id, { weekly_checkin_opt_in: 'NÃO' });
        await msg.reply('Check-in semanal desativado.');
        return true;
    }
    if (body === 'ativar relatorio mensal') {
        await upsertUserSettings(user.user_id, { monthly_report_opt_in: 'SIM' });
        await msg.reply('Relatório mensal ativado.');
        return true;
    }
    if (body === 'desativar relatorio mensal') {
        await upsertUserSettings(user.user_id, { monthly_report_opt_in: 'NÃO' });
        await msg.reply('Relatório mensal desativado.');
        return true;
    }
    if (isReserveDisableCommand(body)) {
        await upsertUserSettings(user.user_id, { defaults_enabled: 'NÃO' });
        await msg.reply('Regra automática de reserva desativada.');
        return true;
    }

    if (/^desativar\s+(?:o\s+)?orcamento(?:\s+(?:mensal|livre))?$/.test(body) || /^desativar\s+(?:a\s+)?meta\s+diaria$/.test(body)) {
        await upsertUserSettings(user.user_id, {
            monthly_budget_enabled: 'NÃO',
            monthly_budget_last_alert_date: '',
            monthly_budget_last_alert_level: '',
            daily_goal_enabled: 'NÃO',
            daily_goal_last_alert_date: '',
            daily_goal_last_alert_level: ''
        });
        await msg.reply('Orçamento mensal livre desativado.');
        return true;
    }

    const monthlyBudgetCommand = parseMonthlyBudgetCommand(body);
    if (monthlyBudgetCommand) {
        if (!monthlyBudgetCommand.cycleStartDay) {
            userStateManager.setState(senderIdFromMessage(msg), {
                action: 'awaiting_monthly_budget_cycle_start_day',
                data: {
                    amount: monthlyBudgetCommand.amount,
                    scope: monthlyBudgetCommand.scope
                }
            });
            await msg.reply('Em qual dia do mês seu ciclo de orçamento começa? Responda um número de 1 a 31. Exemplo: `5`.');
            return true;
        }
        const familyScopeAvailable = getFinancialScopeUserIds(user.user_id).length > 1;
        if (monthlyBudgetCommand.scope === 'family' && !familyScopeAvailable) {
            if (!await saveMonthlyBudgetSettingsWithFeedback(msg, user.user_id, monthlyBudgetCommand.amount, 'personal', monthlyBudgetCommand.cycleStartDay)) return true;
            await msg.reply(`Você ainda não tem vínculo familiar ativo. Configurei o orçamento mensal livre pessoal em ${formatCurrencyBR(monthlyBudgetCommand.amount)}. ${formatMonthlyBudgetCycle(monthlyBudgetCommand.cycleStartDay)}.`);
            return true;
        }
        if (!monthlyBudgetCommand.scope && familyScopeAvailable) {
            userStateManager.setState(senderIdFromMessage(msg), {
                action: 'awaiting_monthly_budget_scope',
                data: { amount: monthlyBudgetCommand.amount, cycleStartDay: monthlyBudgetCommand.cycleStartDay }
            });
            await msg.reply(
                `Esse orçamento mensal livre de ${formatCurrencyBR(monthlyBudgetCommand.amount)} é pessoal ou da família?\n` +
                'Responda `pessoal` ou `família`.'
            );
            return true;
        }
        const scope = monthlyBudgetCommand.scope || 'personal';
        if (!await saveMonthlyBudgetSettingsWithFeedback(msg, user.user_id, monthlyBudgetCommand.amount, scope, monthlyBudgetCommand.cycleStartDay)) return true;
        await msg.reply(`Orçamento mensal livre ${getMonthlyBudgetScopeLabel(scope)} configurado em ${formatCurrencyBR(monthlyBudgetCommand.amount)}. ${formatMonthlyBudgetCycle(monthlyBudgetCommand.cycleStartDay)}. Vou calcular um ritmo diário recomendado e avisar quando o gasto livre do dia atingir 50%, 80% e 100% desse ritmo.`);
        return true;
    }
    const monthlyBudgetScopeOnly = body.match(/^orcamento\s+(?:mensal\s+|livre\s+)?(.+)$/);
    if (monthlyBudgetScopeOnly) {
        const scope = normalizeMonthlyBudgetScope(monthlyBudgetScopeOnly[1]);
        if (scope) {
            const settings = await getUserSettingsByUserId(user.user_id);
            const amount = parseValue(settings?.monthly_budget_amount);
            if (!settings || normalizeText(settings.monthly_budget_enabled || '') !== 'sim' || !amount) {
                await msg.reply('Você ainda não tem orçamento mensal livre ativo. Exemplo: `definir orçamento mensal 3000 dia 5`.');
                return true;
            }
            if (scope === 'family' && getFinancialScopeUserIds(user.user_id).length <= 1) {
                await msg.reply('Você ainda não tem vínculo familiar ativo para transformar o orçamento mensal em familiar.');
                return true;
            }
            const cycleStartDay = getMonthlyBudgetCycleStartDay(settings);
            if (!await saveMonthlyBudgetSettingsWithFeedback(msg, user.user_id, amount, scope, cycleStartDay)) return true;
            await msg.reply(`Orçamento mensal livre alterado para ${getMonthlyBudgetScopeLabel(scope)}. ${formatMonthlyBudgetCycle(cycleStartDay)}.`);
            return true;
        }
    }

    if (isLegacyDailyGoalCommandLike(body)) {
        await msg.reply(
            'A meta diária fixa foi substituída pelo orçamento mensal livre, que calcula automaticamente um ritmo diário.\n' +
            'Exemplos:\n' +
            '- `definir orçamento mensal 3000 dia 5`\n' +
            '- `definir orçamento mensal 3000 família dia 5`'
        );
        return true;
    }

    if (isMonthlyBudgetCommandLike(body)) {
        if (/^(?:definir|ativar|configurar|criar)\s+/.test(body)) {
            userStateManager.setState(senderIdFromMessage(msg), {
                action: 'awaiting_monthly_budget_amount',
                data: {
                    scope: normalizeMonthlyBudgetScope(body),
                    cycleStartDay: extractMonthlyBudgetCycleStartDay(body)
                }
            });
            await msg.reply('Qual é o valor do orçamento mensal livre? Exemplo: `3000`.');
            return true;
        }
        await msg.reply(
            'Para criar um orçamento mensal livre, inclua o valor. Exemplos:\n' +
            '- `definir orçamento mensal 3000 dia 5`\n' +
            '- `definir orçamento mensal 3000 família dia 5`'
        );
        return true;
    }

    const reserveMatch = body.match(/definir reserva\s+(\d{1,2})\s*%?/);
    if (reserveMatch) {
        const percent = parseInt(reserveMatch[1], 10);
        if (isNaN(percent) || percent < 1 || percent > 50) {
            await msg.reply('Use um percentual entre 1% e 50%. Exemplo: definir reserva 10%');
            return true;
        }
        await upsertUserSettings(user.user_id, {
            defaults_enabled: 'SIM',
            default_reserve_percent: String(percent)
        });
        await msg.reply(`Regra de reserva automática configurada em ${percent}% das entradas.`);
        return true;
    }

    return false;
}

async function handleDashboardCommand(msg, user, senderId) {
    const body = normalizeText(String(msg.body || '').trim());
    if (!body) return false;
    if (!['dashboard', 'painel', 'painel financeiro'].includes(body)) return false;

    let linkData = null;
    try {
        linkData = buildDashboardAccessLink({
            userId: user.user_id,
            isAdmin: isAdminWithContext(senderId, user)
        });
    } catch (error) {
        await sendPlainMessage(msg, 'Dashboard indisponível no momento. O administrador precisa configurar DASHBOARD_TOKEN_SECRET.');
        logger.warn(`[dashboard] token_secret_ausente sender=${senderId} user_id=${user.user_id}`);
        return true;
    }

    if (!linkData) {
        await sendPlainMessage(msg, 'Dashboard indisponível no momento. O administrador precisa configurar DASHBOARD_BASE_URL.');
        logger.warn(`[dashboard] base_url_ausente sender=${senderId} user_id=${user.user_id}`);
        return true;
    }

    await sendPlainMessage(
        msg,
        `Seu painel financeiro está pronto.\n\n` +
        `Link válido por ${formatDashboardTtlForReply(linkData.ttlSeconds)}:\n${linkData.url}\n\n` +
        `Não compartilhe esse link: ele dá acesso ao seu painel.`
    );
    await recordDashboardAccessEvent({
        event: 'link_issued',
        result: 'success',
        tokenRef: linkData.tokenRef,
        userId: user.user_id,
        dataUserId: user.user_id,
        isAdmin: isAdminWithContext(senderId, user),
        scope: 'own',
        path: '/dashboard',
        metadata: { ttl_seconds: linkData.ttlSeconds }
    });
    logger.info(`[dashboard] link_emitido sender=${senderId} user_id=${user.user_id}`);
    return true;
}

async function handleGoalManagementCommand(msg, user, senderId, person) {
    const parsed = parseGoalCommand(msg.body || '');
    if (!parsed) return false;

    const financialScopeUserIds = getFinancialScopeUserIds(user.user_id);
    const base = {
        actorUserId: user.user_id,
        actorName: person || user.display_name || 'Usuário',
        financialScopeUserIds
    };

    let result = null;
    if (parsed.action === 'movement') {
        result = await applyGoalMovement({
            ...base,
            goalQuery: parsed.goalQuery,
            type: parsed.type,
            amount: parsed.amount,
            note: msg.body || ''
        });
    } else if (parsed.action === 'status') {
        result = await updateGoalStatus({
            ...base,
            goalQuery: parsed.goalQuery,
            status: parsed.status || GOAL_STATUS.ACTIVE,
            note: msg.body || ''
        });
    }

    if (!result) return false;
    await msg.reply(result.message);
    if (result.ok) {
        markFinancialReadModelDirty('goal_write');
    }
    return true;
}

function buildGoogleConnectReply(user) {
    const link = buildGoogleConnectLink({ userId: user.user_id });
    return [
        'Seu cadastro foi aprovado. Para ativar o bot, conecte sua conta Google neste link:',
        link,
        '',
        'O bot criará sua planilha financeira no seu Drive e usará o Calendar apenas para seus lembretes.'
    ].join('\n');
}

function buildLegacyCreditCardOptions() {
    return Object.keys(creditCardConfig).map((key) => ({
        key,
        label: key,
        cardInfo: {
            ...creditCardConfig[key],
            key,
            cardId: key
        }
    }));
}

function buildPersonalCreditCardOptionsFromRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice(1)
        .filter((row) => {
            const cardId = String(row[0] || '').trim();
            const name = String(row[1] || '').trim();
            const active = normalizeText(row[5] || 'SIM') !== 'nao';
            return active && (cardId || name);
        })
        .map((row) => {
            const label = String(row[1] || row[0]).trim();
            const closingDay = Number.parseInt(row[3], 10);
            return {
                key: String(row[0] || label).trim(),
                label,
                cardInfo: {
                    key: String(row[0] || label).trim(),
                    cardId: String(row[0] || label).trim(),
                    label,
                    sheetName: `Cartão ${label}`,
                    closingDay: Number.isInteger(closingDay) && closingDay >= 1 && closingDay <= 31 ? closingDay : 1
                }
            };
        });
}

async function buildCreditCardOptionsForUser(userId) {
    const usesPersonalSpreadsheet = await hasUserSpreadsheetContext({ userId });
    if (usesPersonalSpreadsheet) {
        const rows = await readDataFromSheet('Cartões!A:G');
        return buildPersonalCreditCardOptionsFromRows(rows);
    }
    return buildLegacyCreditCardOptions();
}

async function replyNoCreditCardsConfigured(msg) {
    await msg.reply(
        'Você ainda não tem cartão ativo cadastrado na aba "Cartões" da sua planilha. ' +
        'Cadastre pelo menos um cartão com Ativo = SIM e tente registrar a compra no crédito novamente.'
    );
}

function formatCreditCardOptionsQuestion(intro, cardOptions) {
    let question = `${intro}\n\n`;
    cardOptions.forEach((card, index) => {
        question += `${index + 1}. ${card.label || card.key}\n`;
    });
    return question;
}

function getSelectedCardInfo(cardOptions, selection) {
    if (selection < 0 || selection >= cardOptions.length) return null;
    const option = cardOptions[selection];
    return option.cardInfo || creditCardConfig[option.key || option];
}

function hasExplicitDebitPaymentSignal(messageBody = '') {
    const text = normalizeText(messageBody);
    return /\b(debito|cartao de debito|no debito|em debito|deb)\b/.test(text);
}

function detectInstallmentsFromMessage(messageBody = '') {
    const text = normalizeText(messageBody);
    if (/\b(a vista|avista|1x|1 x|uma vez)\b/.test(text)) return 1;
    const match = text.match(/\b(?:em\s*)?(\d{1,2})\s*(?:x|vezes|parcelas)\b/);
    if (!match) return null;
    const value = Number.parseInt(match[1], 10);
    return Number.isInteger(value) && value >= 1 ? value : null;
}

function findExplicitCardOption(messageBody = '', cardOptions = []) {
    const text = normalizeText(messageBody);
    const matches = cardOptions.filter((option) => {
        const parts = [
            option.key,
            option.label,
            option.cardInfo?.key,
            option.cardInfo?.cardId,
            option.cardInfo?.label,
            option.cardInfo?.sheetName
        ].map(value => normalizeText(value || '')).filter(Boolean);

        return parts.some((part) => part.length >= 3 && text.includes(part));
    });
    return matches.length === 1 ? matches[0] : null;
}

async function notifyAdminsAboutPendingApproval(msg, user) {
    if (!msg?.client || typeof msg.client.sendMessage !== 'function') return;
    const targetUser = user?.whatsapp_id || '';
    const displayName = user?.display_name || 'sem nome';
    const text = [
        'Novo usuário aguardando aprovação:',
        `- nome: ${displayName}`,
        `- whatsapp_id: ${targetUser}`,
        `- user_id: ${user?.user_id || '-'}`,
        '',
        `Para liberar a conexão Google, envie: admin aprovar ${targetUser}`,
        `Para negar e bloquear propaganda/bot, envie: admin negar ${targetUser}`
    ].join('\n');

    for (const adminId of getAdminIds()) {
        if (!adminId || adminId === targetUser) continue;
        try {
            await msg.client.sendMessage(adminId, text);
        } catch (error) {
            logger.warn(`[admin] falha_notificar_aprovacao admin_id=${adminId} target=${targetUser} error=${error.message}`);
        }
    }
}

async function handleAccountLifecycleCommands(msg, user) {
    const body = normalizeText(String(msg.body || '').trim());
    if (!body) return false;

    if (body === 'aceito') {
        await msg.reply('Seu consentimento já está ativo. Você já pode usar o bot normalmente.');
        return true;
    }

    if (body === 'inativar conta') {
        await updateUserStatus(user.user_id, 'INACTIVE');
        await msg.reply('Sua conta foi inativada com sucesso. Para reativar, fale com o administrador.');
        return true;
    }

    if (body === 'excluir conta') {
        await updateUserStatus(user.user_id, 'DELETED');
        await msg.reply('Sua conta foi marcada como DELETED (soft delete). Seus dados históricos foram preservados.');
        return true;
    }

    return false;
}

const ADMIN_CONFIRMATION_TTL_SECONDS = 5 * 60;
const ADMIN_CONFIRMATION_ACTION = 'awaiting_admin_command_confirmation';
const ADMIN_CONFIRMATION_REPLY = 'confirmar admin';
const pendingAdminConfirmations = new Map();

function getAdminConfirmationKey(senderId) {
    return `admin-confirmation:${senderId}`;
}

function setPendingAdminConfirmation(senderId, data) {
    pendingAdminConfirmations.set(getAdminConfirmationKey(senderId), {
        ...data,
        expiresAt: Date.now() + ADMIN_CONFIRMATION_TTL_SECONDS * 1000
    });
}

function getPendingAdminConfirmation(senderId) {
    const key = getAdminConfirmationKey(senderId);
    const pending = pendingAdminConfirmations.get(key);
    if (!pending) return null;
    if (pending.expiresAt && pending.expiresAt <= Date.now()) {
        pendingAdminConfirmations.delete(key);
        return null;
    }
    return pending;
}

function clearPendingAdminConfirmation(senderId) {
    pendingAdminConfirmations.delete(getAdminConfirmationKey(senderId));
}

function isAdminConfirmationReply(text) {
    const body = normalizeText(String(text || '').trim());
    return body === ADMIN_CONFIRMATION_REPLY || body === 'confirmo admin';
}

function summarizeAdminCommandForConfirmation(rawBody, body) {
    const normalizedBody = body || normalizeText(rawBody);
    const normalizedRules = [
        { pattern: /^admin\s+(?:convidar|convite)\s+(.+)$/, action: 'enviar convite de pré-onboarding', targetIndex: 1, risk: 'mensagem enviada ao usuário' },
        { pattern: /^admin\s+compartilhar\s+planilha\s+(\S+)\s+(\S+)$/, action: 'compartilhar planilha familiar', targetIndex: 0, risk: 'altera acesso a dados financeiros e Drive' },
        { pattern: /^admin\s+remover\s+compartilhamento\s+(\S+)$/, action: 'remover compartilhamento de planilha', targetIndex: 1, risk: 'altera acesso familiar e Drive' },
        { pattern: /^admin\s+aprovar\s+(.+)$/, action: 'aprovar usuário', targetIndex: 1, risk: 'libera o fluxo de conexão Google' },
        { pattern: /^admin\s+(negar|rejeitar|recusar)\s+(.+)$/, action: 'negar/bloquear usuário', targetIndex: 2, risk: 'bloqueia o acesso do usuário' },
        { pattern: /^admin\s+resetar onboarding\s+(.+)$/, action: 'resetar onboarding', targetIndex: 1, risk: 'reinicia a experiência de cadastro' },
        { pattern: /^admin\s+mensagem\s+(\S+)\s+([\s\S]+)$/i, action: 'enviar mensagem manual', targetIndex: 1, risk: 'envia comunicação direta ao usuário', raw: true },
        { pattern: /^admin\s+reiniciar\s+(bot)$/, action: 'reiniciar o bot', targetIndex: 1, risk: 'interrompe o atendimento por alguns segundos e depende do PM2 para subir novamente' },
        { pattern: /^admin\s+(ativar|inativar|bloquear|deletar)\s+(.+)$/, action: 'alterar status de usuário', targetIndex: 2, risk: 'altera permissão de acesso' }
    ];

    for (const rule of normalizedRules) {
        const source = rule.raw ? String(rawBody || '').trim() : normalizedBody;
        const match = source.match(rule.pattern);
        if (!match) continue;
        const target = rule.targetIndex === 0
            ? `${match[1] || '-'} -> ${match[2] || '-'}`
            : match[rule.targetIndex] || '-';
        return {
            required: true,
            action: rule.action,
            target: String(target).trim(),
            risk: rule.risk
        };
    }

    if (normalizedBody === 'admin expirar pendentes') {
        return {
            required: true,
            action: 'expirar usuários pendentes',
            target: 'todos os pendentes antigos',
            risk: 'altera status em lote'
        };
    }

    return { required: false };
}

async function auditAdminAction(adminContext, action, {
    target = '',
    result = 'success',
    metadata = {},
    error = null
} = {}) {
    await recordAdminAction({
        action,
        result,
        actor: {
            senderId: adminContext?.sender_id || '',
            userId: adminContext?.actor_user_id || '',
            name: adminContext?.actor_name || ''
        },
        target,
        metadata,
        error
    });
}

async function sendAdminDirectMessage(msg, to, text, options = {}) {
    if (typeof options.directMessageSender === 'function') {
        return options.directMessageSender(to, text);
    }
    if (msg?.client && typeof msg.client.sendMessage === 'function') {
        return msg.client.sendMessage(to, text);
    }
    return sendWhatsAppMessage(to, text);
}

async function handleAdminCommands(msg, senderId, activeUser, options = {}) {
    const originalMsg = msg;
    if (typeof msg?.reply !== 'function') {
        msg = {
            ...msg,
            reply: async (text) => sendAdminDirectMessage(originalMsg, senderId, text, options)
        };
    }

    const rawBody = String(msg.body || '').trim();
    const body = normalizeText(rawBody);
    const isConfirmationReply = isAdminConfirmationReply(body);
    if (!body.startsWith('admin') && !isConfirmationReply) return false;

    const adminContext = {
        sender_id: senderId,
        actor_user_id: activeUser?.user_id || '',
        actor_name: activeUser?.display_name || ''
    };

    if (!isAdminWithContext(senderId, activeUser)) {
        logger.warn(`[admin] acesso_negado command="${sanitizeLogText(body)}" context=${JSON.stringify(adminContext)}`);
        await auditAdminAction(adminContext, 'access_denied', {
            result: 'denied',
            metadata: { command_prefix: body.split(/\s+/).slice(0, 2).join(' ') }
        });
        await msg.reply('Comando restrito a administradores.');
        return true;
    }

    if (isConfirmationReply) {
        const pending = getPendingAdminConfirmation(senderId);
        if (!pending || pending.action !== ADMIN_CONFIRMATION_ACTION || !pending.rawCommand) {
            await msg.reply('Nenhum comando admin está aguardando confirmação.');
            return true;
        }
        clearPendingAdminConfirmation(senderId);
        logger.info(`[admin] confirmacao_recebida context=${JSON.stringify({
            ...adminContext,
            action: pending.summary?.action || '',
            target: pending.summary?.target || ''
        })}`);
        await auditAdminAction(adminContext, 'confirmation_received', {
            target: pending.summary?.target || '',
            result: 'confirmed',
            metadata: { requested_action: pending.summary?.action || '' }
        });
        return handleAdminCommands({ ...msg, body: pending.rawCommand }, senderId, activeUser, { ...options, skipConfirmation: true });
    }

    if (!options.skipConfirmation) {
        const confirmation = summarizeAdminCommandForConfirmation(rawBody, body);
        if (confirmation.required) {
            setPendingAdminConfirmation(senderId, {
                action: ADMIN_CONFIRMATION_ACTION,
                rawCommand: rawBody,
                normalizedCommand: body,
                requestedAt: new Date().toISOString(),
                summary: confirmation
            });
            logger.warn(`[admin] confirmacao_pendente context=${JSON.stringify({
                ...adminContext,
                action: confirmation.action,
                target: confirmation.target,
                risk: confirmation.risk
            })}`);
            await auditAdminAction(adminContext, 'confirmation_pending', {
                target: confirmation.target,
                result: 'pending',
                metadata: {
                    requested_action: confirmation.action,
                    risk: confirmation.risk
                }
            });
            await msg.reply(
                `Confirmação necessária para ${confirmation.action}.\n` +
                `Alvo: ${confirmation.target}\n` +
                `Risco: ${confirmation.risk}\n\n` +
                `Para executar, responda exatamente: ${ADMIN_CONFIRMATION_REPLY}\n` +
                'Se não quiser executar, ignore esta mensagem. A confirmação expira em 5 minutos.'
            );
            return true;
        }
    }

    if (body === 'admin ajuda') {
        logger.info(`[admin] ajuda context=${JSON.stringify(adminContext)}`);
        await msg.reply(
            'Comandos admin:\n' +
            '- admin listar usuarios\n' +
            '- admin status bot\n' +
            '- admin reiniciar bot\n' +
            '- admin status <telefone>\n' +
            '- admin log <telefone>\n' +
            '- admin aprovar <telefone>\n' +
            '- admin negar <telefone>\n' +
            '- admin convidar <telefone>\n' +
            '- admin compartilhar planilha <dono> <membro>\n' +
            '- admin remover compartilhamento <membro>\n' +
            '- admin ativar <telefone>\n' +
            '- admin inativar <telefone>\n' +
            '- admin bloquear <telefone>\n' +
            '- admin deletar <telefone>\n' +
            '- admin expirar pendentes\n' +
            '- admin resetar onboarding <telefone>\n' +
            '- admin mensagem <telefone> <texto>\n' +
            '- admin stats\n\n' +
            'Comandos que aprovam, bloqueiam, reiniciam, convidam, enviam mensagem ou alteram compartilhamento exigem confirmação com: confirmar admin'
        );
        return true;
    }

    if (body === 'admin listar usuarios') {
        const users = await getAllUsers();
        logger.info(`[admin] listar_usuarios context=${JSON.stringify({ ...adminContext, total_users: users.length })}`);
        if (!users.length) {
            await msg.reply('Nenhum usuário encontrado.');
            return true;
        }

        const counters = users.reduce((acc, u) => {
            const key = u.status || 'DESCONHECIDO';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const statusSummary = Object.entries(counters)
            .map(([status, total]) => `${status}: ${total}`)
            .join(' | ');

        const list = users
            .slice(0, 30)
            .map(u => `- ${u.whatsapp_id} | ${u.display_name || 'sem_nome'} | ${u.status}`)
            .join('\n');

        await msg.reply(`Usuários (${users.length})\n${statusSummary}\n${list}`);
        return true;
    }

    if (body === 'admin expirar pendentes') {
        const expired = await expireOldPendingUsers();
        logger.info(`[admin] expirar_pendentes context=${JSON.stringify({ ...adminContext, expired_count: expired })}`);
        await auditAdminAction(adminContext, 'expire_pending_users', {
            target: 'pending_users',
            result: 'success',
            metadata: { expired_count: expired }
        });
        await msg.reply(`Pendentes expirados agora: ${expired}`);
        return true;
    }

    if (body === 'admin stats') {
        const users = await getAllUsers();
        const counters = users.reduce((acc, u) => {
            const key = u.status || 'DESCONHECIDO';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        logger.info(`[admin] stats context=${JSON.stringify({ ...adminContext, total_users: users.length, counters })}`);
        const statusSummary = Object.entries(counters)
            .map(([status, total]) => `${status}: ${total}`)
            .join(' | ');
        await msg.reply(`Stats usuários\nTotal: ${users.length}\n${statusSummary || 'sem dados'}`);
        return true;
    }

    if (body === 'admin status bot' || body === 'admin health' || body === 'admin saude bot') {
        let stats = null;
        try {
            stats = getReadModelStats();
        } catch (error) {
            logger.warn(`[admin] status_bot_read_model_falhou context=${JSON.stringify({ ...adminContext, error: error.message })}`);
        }
        logger.info(`[admin] status_bot context=${JSON.stringify(adminContext)}`);
        await auditAdminAction(adminContext, 'bot_status', {
            target: 'bot',
            result: 'success',
            metadata: {
                read_model_available: Boolean(stats),
                sqlite_ready: stats?.sqlite?.ready !== false
            }
        });
        await msg.reply(buildAdminBotStatusReply({ readModelStats: stats }));
        return true;
    }

    if (body === 'admin reiniciar bot') {
        logger.warn(`[admin] reiniciar_bot context=${JSON.stringify(adminContext)}`);
        const scheduled = scheduleAdminProcessRestart({ reason: 'admin_whatsapp_command' });
        await auditAdminAction(adminContext, 'restart_bot', {
            target: 'bot',
            result: 'scheduled',
            metadata: { delay_ms: scheduled.delayMs }
        });
        await msg.reply(
            'Reinício agendado. Vou encerrar o processo em alguns segundos e ele será reiniciado pelo PM2 automaticamente.\n' +
            'Se o WhatsApp demorar a responder, aguarde a inicialização terminar.'
        );
        return true;
    }

    const inviteMatch = body.match(/^admin\s+(?:convidar|convite)\s+(.+)$/);
    if (inviteMatch) {
        const target = inviteMatch[1];
        const targetWhatsAppId = normalizeInvitePhoneToWhatsAppId(target);
        if (!targetWhatsAppId) {
            await auditAdminAction(adminContext, 'invite_user', {
                target,
                result: 'validation_error',
                metadata: { reason: 'invalid_phone' }
            });
            await msg.reply('Telefone inválido. Use DDI + DDD + número. Ex.: admin convidar 5521999999999');
            return true;
        }
        try {
            await sendAdminDirectMessage(msg, targetWhatsAppId, buildPreOnboardingInviteMessage(), options);
        } catch (error) {
            logger.warn(`[admin] convidar_falhou context=${JSON.stringify({ ...adminContext, target_whatsapp_id: targetWhatsAppId, error: error.message })}`);
            await auditAdminAction(adminContext, 'invite_user', {
                target: targetWhatsAppId,
                result: 'failed',
                error
            });
            await msg.reply(
                `Não consegui enviar o convite para ${targetWhatsAppId}. ` +
                'Confirme se o número tem WhatsApp e tente enviar uma mensagem manual primeiro para abrir o contato.'
            );
            return true;
        }
        logger.info(`[admin] convidar context=${JSON.stringify({ ...adminContext, target, target_whatsapp_id: targetWhatsAppId })}`);
        await auditAdminAction(adminContext, 'invite_user', {
            target: targetWhatsAppId,
            result: 'success'
        });
        await msg.reply(`Convite enviado para ${targetWhatsAppId}.`);
        return true;
    }

    const shareSheetMatch = body.match(/^admin\s+compartilhar\s+planilha\s+(\S+)\s+(\S+)$/);
    if (shareSheetMatch) {
        const ownerLookup = shareSheetMatch[1];
        const memberLookup = shareSheetMatch[2];
        const owner = await getUserByLookup(ownerLookup);
        const member = await getUserByLookup(memberLookup);
        if (!owner || !member) {
            logger.warn(`[admin] compartilhar_planilha_usuario_nao_encontrado context=${JSON.stringify({ ...adminContext, ownerLookup, memberLookup })}`);
            await auditAdminAction(adminContext, 'share_spreadsheet', {
                target: `${ownerLookup} -> ${memberLookup}`,
                result: 'not_found'
            });
            await msg.reply('Dono ou membro não encontrado. Use: admin compartilhar planilha <telefone_dono> <telefone_membro>');
            return true;
        }
        if (owner.user_id === member.user_id) {
            await auditAdminAction(adminContext, 'share_spreadsheet', {
                target: `${owner.whatsapp_id} -> ${member.whatsapp_id}`,
                result: 'validation_error',
                metadata: { reason: 'same_user' }
            });
            await msg.reply('O dono e o membro precisam ser usuários diferentes.');
            return true;
        }
        if (owner.status !== USER_STATUS.ACTIVE || member.status !== USER_STATUS.ACTIVE) {
            await auditAdminAction(adminContext, 'share_spreadsheet', {
                target: `${owner.whatsapp_id} -> ${member.whatsapp_id}`,
                result: 'validation_error',
                metadata: { owner_status: owner.status, member_status: member.status }
            });
            await msg.reply('Para compartilhar planilha, dono e membro precisam estar ACTIVE e com cadastro concluído.');
            return true;
        }

        const ownerConnection = getOAuthConnection(owner.user_id);
        const spreadsheetId = String(ownerConnection?.spreadsheet_id || '').trim();
        if (!spreadsheetId) {
            await auditAdminAction(adminContext, 'share_spreadsheet', {
                target: `${owner.whatsapp_id} -> ${member.whatsapp_id}`,
                result: 'validation_error',
                metadata: { reason: 'owner_missing_spreadsheet' }
            });
            await msg.reply('O dono ainda não tem planilha Google conectada. Conclua o OAuth do dono antes de compartilhar.');
            return true;
        }
        const memberConnection = getOAuthConnection(member.user_id);
        const memberGoogleEmail = String(memberConnection?.google_email || '').trim().toLowerCase();
        if (!memberGoogleEmail) {
            await auditAdminAction(adminContext, 'share_spreadsheet', {
                target: `${owner.whatsapp_id} -> ${member.whatsapp_id}`,
                result: 'validation_error',
                metadata: { reason: 'member_missing_google_email' }
            });
            await msg.reply(
                'O membro ainda não tem e-mail Google salvo no OAuth. Peça para ele reconectar o Google pelo link do bot e tente novamente.'
            );
            return true;
        }

        let driveShare;
        try {
            driveShare = await shareSpreadsheetWithUserEmail({
                ownerUserId: owner.user_id,
                spreadsheetId,
                email: memberGoogleEmail
            });
        } catch (error) {
            logger.warn(`[admin] compartilhar_planilha_drive_falhou context=${JSON.stringify({
                ...adminContext,
                owner_user_id: owner.user_id,
                member_user_id: member.user_id,
                error: error.message
            })}`);
            await auditAdminAction(adminContext, 'share_spreadsheet', {
                target: `${owner.whatsapp_id} -> ${member.whatsapp_id}`,
                result: 'failed',
                metadata: { stage: 'drive_permission' },
                error
            });
            await msg.reply(`Não consegui compartilhar a planilha no Google Drive: ${error.message}`);
            return true;
        }

        setSharedSpreadsheetMembership({
            ownerUserId: owner.user_id,
            memberUserId: member.user_id,
            spreadsheetId,
            memberGoogleEmail,
            drivePermissionId: driveShare?.permissionId || ''
        });
        const scopeIds = getFinancialScopeUserIds(member.user_id);
        logger.info(`[admin] compartilhar_planilha context=${JSON.stringify({
            ...adminContext,
            owner_user_id: owner.user_id,
            member_user_id: member.user_id,
            spreadsheet_id: spreadsheetId,
            drive_permission_id: driveShare?.permissionId || '',
            scope_user_ids: scopeIds
        })}`);
        await auditAdminAction(adminContext, 'share_spreadsheet', {
            target: `${owner.whatsapp_id} -> ${member.whatsapp_id}`,
            result: 'success',
            metadata: {
                owner_user_id: owner.user_id,
                member_user_id: member.user_id,
                drive_permission_saved: Boolean(driveShare?.permissionId),
                scope_user_count: scopeIds.length
            }
        });
        await msg.reply(
            `Planilha compartilhada ativada.\n` +
            `- dono: ${owner.display_name || owner.whatsapp_id}\n` +
            `- membro: ${member.display_name || member.whatsapp_id}\n` +
            `- acesso ao Drive: concedido\n` +
            `- membros no escopo financeiro: ${scopeIds.length}\n\n` +
            `A partir de agora, os lançamentos dos dois entram na mesma planilha. Cada linha continua registrando quem lançou pelo campo Responsável e pelo user_id.`
        );
        const ownerSettings = await getUserSettingsByUserId(owner.user_id);
        if (normalizeText(ownerSettings?.monthly_budget_enabled || '') === 'sim') {
            const reviewMessage = buildDailyGoalFamilyScopeReviewMessage(
                owner.display_name || 'Você',
                member.display_name || member.whatsapp_id,
                ownerSettings
            );
            if (owner.whatsapp_id === senderId) {
                await msg.reply(reviewMessage);
            } else if (msg.client && typeof msg.client.sendMessage === 'function') {
                try {
                    await msg.client.sendMessage(owner.whatsapp_id, reviewMessage);
                } catch (error) {
                    logger.warn(`[admin] compartilhar_planilha_orcamento_mensal_notificacao_falhou context=${JSON.stringify({
                        ...adminContext,
                        owner_user_id: owner.user_id,
                        member_user_id: member.user_id,
                        error: error.message
                    })}`);
                }
            }
        }
        if (msg.client && typeof msg.client.sendMessage === 'function') {
            try {
                await msg.client.sendMessage(
                    member.whatsapp_id,
                    `Você foi vinculado à planilha compartilhada de ${owner.display_name || 'outro membro'}.\n` +
                    'Seus próximos lançamentos serão salvos nessa planilha, identificados com seu nome. Você também verá o dashboard com os dados do casal.'
                );
            } catch (error) {
                logger.warn(`[admin] compartilhar_planilha_notificacao_falhou context=${JSON.stringify({
                    ...adminContext,
                    member_user_id: member.user_id,
                    error: error.message
                })}`);
            }
        }
        return true;
    }

    const removeShareMatch = body.match(/^admin\s+remover\s+compartilhamento\s+(\S+)$/);
    if (removeShareMatch) {
        const memberLookup = removeShareMatch[1];
        const member = await getUserByLookup(memberLookup);
        if (!member) {
            logger.warn(`[admin] remover_compartilhamento_usuario_nao_encontrado context=${JSON.stringify({ ...adminContext, memberLookup })}`);
            await auditAdminAction(adminContext, 'remove_spreadsheet_share', {
                target: memberLookup,
                result: 'not_found'
            });
            await msg.reply('Membro não encontrado. Use: admin remover compartilhamento <telefone_membro>');
            return true;
        }

        const activeMembership = getSharedSpreadsheetMembership(member.user_id);
        if (!activeMembership) {
            await auditAdminAction(adminContext, 'remove_spreadsheet_share', {
                target: member.whatsapp_id,
                result: 'validation_error',
                metadata: { reason: 'no_active_membership' }
            });
            await msg.reply('Esse usuário não tem vínculo ativo de planilha compartilhada.');
            return true;
        }
        if (activeMembership.drive_permission_id) {
            try {
                await revokeSpreadsheetPermission({
                    ownerUserId: activeMembership.owner_user_id,
                    spreadsheetId: activeMembership.spreadsheet_id,
                    permissionId: activeMembership.drive_permission_id
                });
            } catch (error) {
                logger.warn(`[admin] remover_compartilhamento_drive_falhou context=${JSON.stringify({
                    ...adminContext,
                    member_user_id: member.user_id,
                    owner_user_id: activeMembership.owner_user_id,
                    drive_permission_id: activeMembership.drive_permission_id,
                    error: error.message
                })}`);
                await auditAdminAction(adminContext, 'remove_spreadsheet_share', {
                    target: member.whatsapp_id,
                    result: 'failed',
                    metadata: { stage: 'drive_permission_revoke' },
                    error
                });
                await msg.reply(`Não consegui remover o acesso no Google Drive: ${error.message}`);
                return true;
            }
        } else {
            logger.warn(`[admin] remover_compartilhamento_sem_permission_id context=${JSON.stringify({
                ...adminContext,
                member_user_id: member.user_id,
                owner_user_id: activeMembership.owner_user_id
            })}`);
        }

        const revoked = revokeSharedSpreadsheetMembership(member.user_id);

        logger.info(`[admin] remover_compartilhamento context=${JSON.stringify({
            ...adminContext,
            member_user_id: member.user_id,
            previous_owner_user_id: revoked.owner_user_id,
            spreadsheet_id: revoked.spreadsheet_id
        })}`);
        await auditAdminAction(adminContext, 'remove_spreadsheet_share', {
            target: member.whatsapp_id,
            result: 'success',
            metadata: {
                member_user_id: member.user_id,
                previous_owner_user_id: revoked.owner_user_id,
                drive_permission_present: Boolean(activeMembership.drive_permission_id)
            }
        });
        await msg.reply(
            `Compartilhamento removido para ${member.display_name || member.whatsapp_id}.\n` +
            'Os próximos lançamentos desse usuário voltarão para a planilha própria dele, se houver Google conectado.' +
            (!activeMembership.drive_permission_id ? '\n\nAtenção: esse vínculo não tinha permissionId salvo; se a planilha foi compartilhada manualmente no Drive, revise o acesso manualmente.' : '')
        );
        return true;
    }

    const statusQueryMatch = body.match(/^admin\s+status\s+(.+)$/);
    if (statusQueryMatch) {
        const target = statusQueryMatch[1];
        const user = await getUserByLookup(target);
        if (!user) {
            logger.warn(`[admin] status_nao_encontrado context=${JSON.stringify({ ...adminContext, target })}`);
            await msg.reply('Usuário não encontrado para esse telefone/WhatsApp ID.');
            return true;
        }
        const profile = await getUserProfileByUserId(user.user_id);
        const settings = await getUserSettingsByUserId(user.user_id);
        const sharedMembership = getSharedSpreadsheetMembership(user.user_id);
        const financialScopeUserIds = getFinancialScopeUserIds(user.user_id);
        logger.info(`[admin] status context=${JSON.stringify({ ...adminContext, target, target_user_id: user.user_id, target_status: user.status })}`);
        await msg.reply(
            `Status do usuário\n` +
            `- whatsapp_id: ${user.whatsapp_id}\n` +
            `- nome: ${user.display_name || 'sem_nome'}\n` +
            `- status: ${user.status}\n` +
            `- user_id: ${user.user_id}\n` +
            `- planilha_compartilhada: ${sharedMembership ? `SIM (dono=${sharedMembership.owner_user_id})` : 'NÃO'}\n` +
            `- escopo_financeiro: ${financialScopeUserIds.length} usuário(s)\n` +
            `- onboarding_concluido: ${profile?.onboarding_completed_at ? 'SIM' : 'NÃO'}\n` +
            `- checkin_semanal: ${settings?.weekly_checkin_opt_in || 'NÃO'}\n` +
            `- relatorio_mensal: ${settings?.monthly_report_opt_in || 'NÃO'}`
        );
        return true;
    }

    const approveMatch = body.match(/^admin\s+aprovar\s+(.+)$/);
    if (approveMatch) {
        const target = approveMatch[1];
        const updated = await approveUserByWhatsAppId(target);
        if (!updated) {
            logger.warn(`[admin] aprovar_nao_encontrado context=${JSON.stringify({ ...adminContext, target })}`);
            await auditAdminAction(adminContext, 'approve_user', {
                target,
                result: 'not_found'
            });
            await msg.reply('Usuário não encontrado para esse telefone/WhatsApp ID.');
            return true;
        }
        logger.info(`[admin] aprovar context=${JSON.stringify({ ...adminContext, target, target_user_id: updated.user_id, updated_whatsapp_id: updated.whatsapp_id, updated_status: updated.status })}`);
        let connectReply = '';
        try {
            connectReply = buildGoogleConnectReply(updated);
        } catch (error) {
            logger.warn(`[admin] aprovar_sem_link_google context=${JSON.stringify({ ...adminContext, target, target_user_id: updated.user_id, error: error.message })}`);
        }
        await auditAdminAction(adminContext, 'approve_user', {
            target: updated.whatsapp_id,
            result: 'success',
            metadata: {
                target_user_id: updated.user_id,
                updated_status: updated.status,
                google_link_built: Boolean(connectReply)
            }
        });
        await msg.reply(
            `Usuário aprovado: ${updated.whatsapp_id} -> ${updated.status}\n` +
            (connectReply ? 'Link de conexão Google enviado ao usuário.' : 'Configure OAuth Google para enviar o link de conexão.')
        );
        if (msg.client && typeof msg.client.sendMessage === 'function') {
            await msg.client.sendMessage(
                updated.whatsapp_id,
                connectReply || 'Seu cadastro foi aprovado. Agora falta conectar sua conta Google para criar sua planilha no seu Drive e ativar o bot.'
            );
        }
        return true;
    }

    const denyMatch = body.match(/^admin\s+(negar|rejeitar|recusar)\s+(.+)$/);
    if (denyMatch) {
        const action = denyMatch[1];
        const target = denyMatch[2];
        const updated = await denyUserByWhatsAppId(target);
        if (!updated) {
            logger.warn(`[admin] negar_nao_encontrado context=${JSON.stringify({ ...adminContext, action, target })}`);
            await auditAdminAction(adminContext, 'deny_user', {
                target,
                result: 'not_found',
                metadata: { requested_action: action }
            });
            await msg.reply('Usuário não encontrado para esse telefone/WhatsApp ID.');
            return true;
        }
        logger.info(`[admin] negar context=${JSON.stringify({ ...adminContext, action, target, target_user_id: updated.user_id, updated_whatsapp_id: updated.whatsapp_id, updated_status: updated.status })}`);
        await auditAdminAction(adminContext, 'deny_user', {
            target: updated.whatsapp_id,
            result: 'success',
            metadata: {
                requested_action: action,
                target_user_id: updated.user_id,
                updated_status: updated.status
            }
        });
        await msg.reply(`Usuário negado e bloqueado: ${updated.whatsapp_id} -> ${updated.status}`);
        if (msg.client && typeof msg.client.sendMessage === 'function') {
            await msg.client.sendMessage(
                updated.whatsapp_id,
                'Seu acesso ao FinançasBot não foi aprovado. Se isso foi um engano, fale com o administrador.'
            );
        }
        return true;
    }

    const consentLogMatch = body.match(/^admin\s+log\s+(.+)$/);
    if (consentLogMatch) {
        const target = consentLogMatch[1];
        const user = await getUserByLookup(target);
        if (!user) {
            logger.warn(`[admin] log_nao_encontrado context=${JSON.stringify({ ...adminContext, target })}`);
            await msg.reply('Usuário não encontrado para esse telefone/WhatsApp ID.');
            return true;
        }
        const logs = await getConsentLogsByUserId(user.user_id, 5);
        logger.info(`[admin] log context=${JSON.stringify({ ...adminContext, target, target_user_id: user.user_id, consent_events: logs.length })}`);
        if (!logs.length) {
            await msg.reply('Nenhum evento de consentimento encontrado para este usuário.');
            return true;
        }
        const formatted = logs.map((entry, idx) => {
            let msgId = '';
            try {
                const evidence = JSON.parse(entry.evidence || '{}');
                msgId = evidence.message_id || '';
            } catch (error) {
                msgId = '';
            }
            return `${idx + 1}. ${entry.accepted_at} | ${entry.terms_version || '-'} | msg_id: ${msgId || '-'}`;
        }).join('\n');
        await msg.reply(`Últimos consentimentos (${logs.length})\n${formatted}`);
        return true;
    }

    const resetOnboardingMatch = body.match(/^admin\s+resetar onboarding\s+(.+)$/);
    if (resetOnboardingMatch) {
        const target = resetOnboardingMatch[1];
        const user = await getUserByLookup(target);
        if (!user) {
            logger.warn(`[admin] resetar_onboarding_nao_encontrado context=${JSON.stringify({ ...adminContext, target })}`);
            await auditAdminAction(adminContext, 'reset_onboarding', {
                target,
                result: 'not_found'
            });
            await msg.reply('Usuário não encontrado para esse telefone/WhatsApp ID.');
            return true;
        }
        await upsertUserProfile(user.user_id, { onboarding_completed_at: '' });
        userStateManager.deleteState(user.whatsapp_id);
        const digits = String(user.whatsapp_id || '').replace('@c.us', '').replace('@lid', '').replace(/\D/g, '');
        if (digits) {
            userStateManager.deleteState(`${digits}@c.us`);
            userStateManager.deleteState(`${digits}@lid`);
        }
        logger.info(`[admin] resetar_onboarding context=${JSON.stringify({ ...adminContext, target, target_user_id: user.user_id })}`);
        await auditAdminAction(adminContext, 'reset_onboarding', {
            target: user.whatsapp_id,
            result: 'success',
            metadata: { target_user_id: user.user_id }
        });
        await msg.reply(`Onboarding resetado para ${user.whatsapp_id}.`);
        return true;
    }

    const manualMessageMatch = rawBody.match(/^admin\s+mensagem\s+(\S+)\s+([\s\S]+)$/i);
    if (manualMessageMatch) {
        const target = manualMessageMatch[1];
        const manualText = String(manualMessageMatch[2] || '').trim();
        if (!manualText) {
            await msg.reply('Texto vazio. Use: admin mensagem <telefone> <texto>');
            return true;
        }
        const user = await getUserByLookup(target);
        if (!user) {
            logger.warn(`[admin] mensagem_nao_encontrado context=${JSON.stringify({ ...adminContext, target })}`);
            await auditAdminAction(adminContext, 'manual_message', {
                target,
                result: 'not_found',
                metadata: { message_length: manualText.length }
            });
            await msg.reply('Usuário não encontrado para esse telefone/WhatsApp ID.');
            return true;
        }
        try {
            await sendAdminDirectMessage(msg, user.whatsapp_id, manualText, options);
            logger.info(`[admin] mensagem context=${JSON.stringify({ ...adminContext, target, target_user_id: user.user_id, target_whatsapp_id: user.whatsapp_id, message_length: manualText.length })}`);
            await auditAdminAction(adminContext, 'manual_message', {
                target: user.whatsapp_id,
                result: 'success',
                metadata: {
                    target_user_id: user.user_id,
                    message_length: manualText.length
                }
            });
            await msg.reply(`Mensagem enviada para ${user.whatsapp_id}.`);
        } catch (error) {
            logger.warn(`[admin] mensagem_falhou context=${JSON.stringify({ ...adminContext, target_whatsapp_id: user.whatsapp_id, error: error.message })}`);
            await auditAdminAction(adminContext, 'manual_message', {
                target: user.whatsapp_id,
                result: 'failed',
                metadata: { target_user_id: user.user_id, message_length: manualText.length },
                error
            });
            await msg.reply(`Não consegui enviar a mensagem para ${user.whatsapp_id}. Erro: ${error.message}`);
        }
        return true;
    }

    const statusMatch = body.match(/^admin\s+(ativar|inativar|bloquear|deletar)\s+(.+)$/);
    if (statusMatch) {
        const action = statusMatch[1];
        const target = statusMatch[2];
        const statusMap = {
            ativar: USER_STATUS.ACTIVE,
            inativar: USER_STATUS.INACTIVE,
            bloquear: USER_STATUS.BLOCKED,
            deletar: USER_STATUS.DELETED
        };
        const status = statusMap[action];
        const updated = await updateUserStatusByWhatsAppId(target, status);
        if (!updated) {
            logger.warn(`[admin] alterar_status_nao_encontrado context=${JSON.stringify({ ...adminContext, action, target })}`);
            await auditAdminAction(adminContext, 'change_user_status', {
                target,
                result: 'not_found',
                metadata: { requested_action: action, requested_status: status }
            });
            await msg.reply('Usuário não encontrado para esse telefone/WhatsApp ID.');
            return true;
        }
        logger.info(`[admin] alterar_status context=${JSON.stringify({ ...adminContext, action, target, updated_whatsapp_id: updated.whatsapp_id, updated_status: updated.status })}`);
        await auditAdminAction(adminContext, 'change_user_status', {
            target: updated.whatsapp_id,
            result: 'success',
            metadata: {
                requested_action: action,
                updated_status: updated.status
            }
        });
        await msg.reply(`Status atualizado: ${updated.whatsapp_id} -> ${updated.status}`);
        return true;
    }

    logger.warn(`[admin] comando_desconhecido command="${sanitizeLogText(body)}" context=${JSON.stringify(adminContext)}`);
    await msg.reply('Comando admin não reconhecido. Use: admin ajuda');
    return true;
}

async function handleAdminCommandBeforeAccess(msg, senderId, access, options = {}) {
    const body = normalizeText(String(msg.body || '').trim());
    if (!body.startsWith('admin') && !isAdminConfirmationReply(body)) return false;

    // Admin precisa conseguir liberar/diagnosticar usuários mesmo se o próprio
    // identificador @lid estiver preso no gate de consentimento/onboarding.
    return handleAdminCommands(msg, senderId, access?.user, options);
}

async function handleMessage(msg) {
    metrics.increment('message.received');
    const messageId = msg.id.id;
    if (processedMessages.has(messageId)) {
        metrics.increment('message.duplicate');
        console.log(`Mensagem duplicada ignorada: ${messageId}`);
        return;
    }

    // Se a mensagem for de áudio, processa primeiro.
    // Se não for, o processamento normal continua com o corpo original.
    if (msg.type === 'ptt' || msg.type === 'audio') {
        const transcribedText = await handleAudio(msg);
        if (!transcribedText) return; // Se a transcrição falhar, para aqui.
        
        msg.body = transcribedText; // Atualiza o corpo da mensagem com o texto!
    }

    processedMessages.add(messageId);
    setTimeout(() => processedMessages.delete(messageId), 300000); // 5 minutos

    if (msg.isStatus || msg.fromMe) return;

    const messageBody = msg.body.trim();
    const senderId = msg.author || msg.from;
    const perfContext = `sender=${senderId} msg=${messageId}`;
    const messageStartedAt = Date.now();

    const access = await timeStep('resolveUserAccess', () => resolveUserAccess(msg), perfContext);
    const handledAdminBeforeAccess = await handleAdminCommandBeforeAccess(msg, senderId, access);
    if (handledAdminBeforeAccess) {
        return;
    }

    if (!access.allowed) {
        if (access.notifyAdmins && access.user) {
            await notifyAdminsAboutPendingApproval(msg, access.user);
        }
        if (access.googleConnectRequired && access.user) {
            try {
                await sendPlainMessage(msg, buildGoogleConnectReply(access.user));
                return;
            } catch (error) {
                logger.warn(`[oauth] link_google_indisponivel sender=${senderId} user_id=${access.user.user_id} error=${error.message}`);
            }
        }
        if (access.reply) {
            await sendPlainMessage(msg, access.reply);
        }
        return;
    }

    const activeUser = access.user;

    return runWithUserSheetContext(activeUser, async () => {
    const userId = activeUser.user_id;
    const pessoa = activeUser.display_name || userMap[senderId] || 'Usuário';

    if (access.justActivated) {
        await sendPlainMessage(msg, 'Cadastro confirmado com sucesso. Seu acesso foi ativado.');
    }
    if (access.justReconsented) {
        await sendPlainMessage(msg, 'Termos atualizados e consentimento renovado com sucesso. Obrigado.');
    }

    const legalLogContext = buildLegalCommandLogContext(msg, activeUser);
    const handledLegal = await handleLegalCommands(msg);
    if (handledLegal) {
        if (legalLogContext) {
            logger.info(`[legal] ${legalLogContext.command} context=${JSON.stringify(legalLogContext)}`);
        }
        return;
    }

    const onboarding = await timeStep('handleOnboarding', () => handleOnboarding(msg, activeUser), perfContext);
    if (onboarding.handled) {
        return;
    }

    const handledLifecycle = await handleAccountLifecycleCommands(msg, activeUser);
    if (handledLifecycle) {
        userStateManager.deleteState(senderId);
        return;
    }

    const handledSettings = await handleSettingsCommands(msg, activeUser);
    if (handledSettings) {
        return;
    }

    const handledDashboard = await handleDashboardCommand(msg, activeUser, senderId);
    if (handledDashboard) {
        return;
    }

    const handledAdmin = await handleAdminCommands(msg, senderId, activeUser);
    if (handledAdmin) {
        return;
    }

    const handledImport = await handleStatementImportMessage(msg, { senderId, person: pessoa, userId });
    if (handledImport) {
        return;
    }

    const handledGoalManagement = await handleGoalManagementCommand(msg, activeUser, senderId, pessoa);
    if (handledGoalManagement) {
        return;
    }

    if (!rateLimiter.isAllowed(senderId)) {
        metrics.increment('message.rate_limited');
        console.log(`Usuário ${senderId} bloqueado pelo rate limit.`);
        return;
    }

    const securityCheck = detectSecuritySensitiveRequest(messageBody);
    if (securityCheck.blocked) {
        metrics.increment('message.security.blocked');
        logger.warn(`[security] sensitive_request_blocked category=${securityCheck.category} sender=${senderId} msg="${sanitizeLogText(messageBody)}"`);
        await sendPlainMessage(msg, SECURITY_BLOCK_REPLY);
        return;
    }

    const cacheKey = `${senderId}:${messageBody}`;
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
        metrics.increment('message.cache_hit');
        await msg.reply(cachedResponse);
        return;
    }

    let currentState = userStateManager.getState(senderId);
    if (currentState?.action === 'confirming_statement_import' && shouldInterruptStatementImportConfirmation(messageBody)) {
        logger.info(`[state] import_confirmation_interrupted sender=${senderId} msg="${sanitizeLogText(messageBody)}"`);
        userStateManager.deleteState(senderId);
        currentState = null;
    }
    if (currentState) {
        // --- INÍCIO DA MÁQUINA DE ESTADOS (CONVERSAS EM ANDAMENTO) ---
        // Se existe uma conversa em andamento, o bot lida com ela e PARA AQUI.
        switch (currentState.action) {
            case POST_ONBOARDING_DEBT_OFFER_ACTION: {
                const answer = normalizeText(msg.body || '');
                if (['sim', 's', 'ss', 'quero', 'cadastrar'].includes(answer)) {
                    await creationHandler.startDebtCreation(msg);
                    return;
                }
                if (['nao', 'não', 'n', 'depois', 'agora nao', 'agora não'].includes(answer)) {
                    userStateManager.deleteState(senderId);
                    await sendPlainMessage(msg, 'Sem problema. Quando quiser, envie `criar dívida`.');
                    return;
                }
                userStateManager.deleteState(senderId);
                // Se o usuário ignorou a oferta e enviou outro comando, não bloqueia o uso normal do bot.
                break;
            }

            case 'awaiting_monthly_budget_amount': {
                const amount = parseValue(msg.body || '');
                if (!Number.isFinite(amount) || amount <= 0) {
                    await msg.reply('Me envie um valor válido para o orçamento mensal livre. Exemplo: `3000`.');
                    return;
                }
                const requestedScope = currentState.data?.scope || '';
                const requestedCycleStartDay = currentState.data?.cycleStartDay || null;
                if (!requestedCycleStartDay) {
                    userStateManager.setState(senderId, {
                        action: 'awaiting_monthly_budget_cycle_start_day',
                        data: { amount, scope: requestedScope }
                    });
                    await msg.reply('Em qual dia do mês seu ciclo de orçamento começa? Responda um número de 1 a 31. Exemplo: `5`.');
                    return;
                }
                const familyScopeAvailable = getFinancialScopeUserIds(userId).length > 1;
                if (requestedScope === 'family' && !familyScopeAvailable) {
                    if (!await saveMonthlyBudgetSettingsWithFeedback(msg, userId, amount, 'personal', requestedCycleStartDay)) return;
                    userStateManager.deleteState(senderId);
                    await msg.reply(`Você ainda não tem vínculo familiar ativo. Configurei o orçamento mensal livre pessoal em ${formatCurrencyBR(amount)}. ${formatMonthlyBudgetCycle(requestedCycleStartDay)}.`);
                    return;
                }
                if (!requestedScope && familyScopeAvailable) {
                    userStateManager.setState(senderId, {
                        action: 'awaiting_monthly_budget_scope',
                        data: { amount, cycleStartDay: requestedCycleStartDay }
                    });
                    await msg.reply(
                        `Esse orçamento mensal livre de ${formatCurrencyBR(amount)} é pessoal ou da família?\n` +
                        'Responda `pessoal` ou `família`.'
                    );
                    return;
                }
                const scope = requestedScope || 'personal';
                if (!await saveMonthlyBudgetSettingsWithFeedback(msg, userId, amount, scope, requestedCycleStartDay)) return;
                userStateManager.deleteState(senderId);
                await msg.reply(`Orçamento mensal livre ${getMonthlyBudgetScopeLabel(scope)} configurado em ${formatCurrencyBR(amount)}. ${formatMonthlyBudgetCycle(requestedCycleStartDay)}. Vou calcular o ritmo diário recomendado automaticamente.`);
                return;
            }

            case 'awaiting_monthly_budget_cycle_start_day': {
                const cycleStartDay = parseMonthlyBudgetCycleStartDayReply(msg.body);
                if (!Number.isInteger(cycleStartDay) || cycleStartDay < 1 || cycleStartDay > 31) {
                    await msg.reply('Responda com um dia válido de 1 a 31. Exemplo: `5`.');
                    return;
                }
                const amount = currentState.data?.amount;
                const requestedScope = currentState.data?.scope || '';
                const familyScopeAvailable = getFinancialScopeUserIds(userId).length > 1;
                if (requestedScope === 'family' && !familyScopeAvailable) {
                    if (!await saveMonthlyBudgetSettingsWithFeedback(msg, userId, amount, 'personal', cycleStartDay)) return;
                    userStateManager.deleteState(senderId);
                    await msg.reply(`Você ainda não tem vínculo familiar ativo. Configurei o orçamento mensal livre pessoal em ${formatCurrencyBR(amount)}. ${formatMonthlyBudgetCycle(cycleStartDay)}.`);
                    return;
                }
                if (!requestedScope && familyScopeAvailable) {
                    userStateManager.setState(senderId, {
                        action: 'awaiting_monthly_budget_scope',
                        data: { amount, cycleStartDay }
                    });
                    await msg.reply(
                        `Esse orçamento mensal livre de ${formatCurrencyBR(amount)} é pessoal ou da família?\n` +
                        'Responda `pessoal` ou `família`.'
                    );
                    return;
                }
                const scope = requestedScope || 'personal';
                if (!await saveMonthlyBudgetSettingsWithFeedback(msg, userId, amount, scope, cycleStartDay)) return;
                userStateManager.deleteState(senderId);
                await msg.reply(`Orçamento mensal livre ${getMonthlyBudgetScopeLabel(scope)} configurado em ${formatCurrencyBR(amount)}. ${formatMonthlyBudgetCycle(cycleStartDay)}. Vou calcular o ritmo diário recomendado automaticamente.`);
                return;
            }

            case 'awaiting_monthly_budget_scope':
            case 'awaiting_daily_goal_scope': {
                const scope = normalizeMonthlyBudgetScope(msg.body || '');
                if (!scope) {
                    await msg.reply('Responda apenas `pessoal` ou `família` para configurar o escopo do orçamento mensal livre.');
                    return;
                }
                if (scope === 'family' && getFinancialScopeUserIds(userId).length <= 1) {
                    await msg.reply('Você ainda não tem vínculo familiar ativo. Vou manter esse orçamento como pessoal.');
                    if (!await saveMonthlyBudgetSettingsWithFeedback(msg, userId, currentState.data?.amount, 'personal', currentState.data?.cycleStartDay || 1)) return;
                } else {
                    if (!await saveMonthlyBudgetSettingsWithFeedback(msg, userId, currentState.data?.amount, scope, currentState.data?.cycleStartDay || 1)) return;
                    await msg.reply(`Orçamento mensal livre ${getMonthlyBudgetScopeLabel(scope)} configurado em ${formatCurrencyBR(currentState.data?.amount)}. ${formatMonthlyBudgetCycle(currentState.data?.cycleStartDay || 1)}.`);
                }
                userStateManager.deleteState(senderId);
                return;
            }

            case 'awaiting_credit_card_selection': {
                const { gasto, cardOptions } = currentState.data;
                const selection = parseInt(msg.body.trim(), 10) - 1;

                if (selection >= 0 && selection < cardOptions.length) {
                    const cardInfo = getSelectedCardInfo(cardOptions, selection);
                    if (gasto.installments) {
                        try {
                            const saved = await saveCreditCardExpense(gasto, cardInfo, gasto.installments, userId);
                            if (saved.installments === 1) {
                                await msg.reply(`✅ Gasto de R$${gasto.valor} lançado no *${saved.sheetName}*.`);
                            } else {
                                await msg.reply(`✅ Gasto de R$${gasto.valor} lançado em ${saved.installments}x de R$${saved.installmentValue.toFixed(2)} no *${saved.sheetName}*.`);
                            }
                            await safeMaybeNotifyDailyGoalAfterExpense(msg, userId, 'credit_card_selection');
                        } catch (error) {
                            console.error("Erro ao salvar gasto no cartão:", error);
                            await msg.reply("Ocorreu um erro ao salvar o gasto.");
                        } finally {
                            userStateManager.deleteState(senderId);
                        }
                        return;
                    }

                    userStateManager.setState(senderId, {
                        action: 'awaiting_installment_number',
                        data: { gasto, cardInfo }
                    });
                    await msg.reply("Em quantas parcelas? (digite `1` se for à vista)");
                } else {
                    await msg.reply("Opção inválida. Por favor, responda apenas com um dos números da lista.");
                }
                return;
            }

            case 'awaiting_installment_number': {
                const { gasto, cardInfo } = currentState.data;
                const installments = await parseAmount(msg.body.trim());

                if (isNaN(installments) || installments < 1) {
                    await msg.reply("Número inválido. Por favor, digite um número a partir de 1.");
                    return;
                }

                try {
                    const saved = await saveCreditCardExpense(gasto, cardInfo, installments, userId);
                    if (saved.installments === 1) {
                        await msg.reply(`✅ Gasto de R$${gasto.valor} lançado no *${saved.sheetName}*.`);
                    } else {
                        await msg.reply(`✅ Gasto de R$${gasto.valor} lançado em ${saved.installments}x de R$${saved.installmentValue.toFixed(2)} no *${saved.sheetName}*.`);
                    }
                    await safeMaybeNotifyDailyGoalAfterExpense(msg, userId, 'installment_number');
                } catch (error) {
                    console.error("Erro ao salvar parcelamento:", error);
                    await msg.reply("Ocorreu um erro ao salvar o gasto.");
                } finally {
                    userStateManager.deleteState(senderId);
                }
                return;
            }

            // Outros estados de conversa que você já tinha
            case 'awaiting_payment_method': {
                const { gasto } = currentState.data; // A data já está dentro do objeto 'gasto'
                const respostaPagamento = messageBody;
                const dataFinal = gasto.data || getFormattedDateOnly(); // Usar a data do gasto, ou a de hoje como fallback

                // Se a resposta for crédito, inicia o fluxo do cartão
                if (normalizeText(respostaPagamento) === 'credito') {
                    const cardOptions = await buildCreditCardOptionsForUser(userId);
                    if (!cardOptions.length) {
                        await replyNoCreditCardsConfigured(msg);
                        return;
                    }
                    const installments = detectInstallmentsFromMessage(respostaPagamento);
                    const question = formatCreditCardOptionsQuestion('Ok, crédito. Em qual cartão? Responda com o número:', cardOptions);
                    userStateManager.setState(senderId, {
                        action: 'awaiting_credit_card_selection',
                        data: { gasto: { ...gasto, pagamento: 'Crédito', installments }, cardOptions }
                    });
                    await msg.reply(question);
                    return;
                }

                // Se for outro método, salva direto
                const promptCorrecaoPagamento = `
                Sua tarefa é normalizar a forma de pagamento informada pelo usuário.
                A resposta DEVE ser uma das seguintes opções: 'Débito', 'Crédito', 'PIX', 'Dinheiro'.

                Analise a resposta do usuário e faça a correspondência:
                - Se for 'd', 'deb', 'cartao de debito', a resposta é 'Débito'.
                - Se for 'c', 'cred', 'cartao de credito', a resposta é 'Crédito'.
                - Se for 'p', 'px', 'pics', a resposta é 'PIX'.
                - Se for 'din', 'vivo', 'especie', a resposta é 'Dinheiro'.

                Se não for possível determinar, retorne 'PIX' como padrão.

                NÃO forneça nenhuma explicação. Retorne APENAS a palavra final.

                Resposta do usuário: "${respostaPagamento}"
                `;
                const pagamentoCorrigido = await askLLM(promptCorrecaoPagamento);
                gasto.pagamento = pagamentoCorrigido.trim();

                const manualTransfer = await buildManualTransferFromMessage(gasto, `${gasto.descricao || ''} ${gasto.observacoes || ''}`, userId);
                if (manualTransfer) {
                    const saved = await saveManualTransfer(manualTransfer, userId);
                    await msg.reply(`✅ Transferência de ${formatCurrencyBR(saved.valor)} (${saved.descricao}) registrada como *${saved.status}* para a data de *${saved.data}*.`);
                    userStateManager.deleteState(senderId);
                    return;
                }

                const valorNumerico = parseValue(gasto.valor);
                const rowData = [
                    dataFinal, gasto.descricao || 'Não especificado', gasto.categoria || 'Outros',
                    gasto.subcategoria || '', valorNumerico, pessoa, gasto.pagamento,
                    gasto.recorrente || 'Não', gasto.observacoes || '', userId
                ];
                await appendRowToSheet('Saídas', rowData);
                markFinancialReadModelDirty('saida_write');

                // MENSAGEM DE SUCESSO MELHORADA
                await msg.reply(`✅ Gasto de R$${valorNumerico.toFixed(2)} (${gasto.descricao}) registrado como *${gasto.pagamento}* para a data de *${dataFinal}*!`);
                await safeMaybeNotifyDailyGoalAfterExpense(msg, userId, 'payment_method');
                userStateManager.deleteState(senderId);
                return;
            }

            case 'awaiting_receipt_method': {
                const entrada = currentState.data;
                const metodoRecebimento = msg.body.trim();
                const pessoa = userMap[senderId] || 'Ambos';

                // Usamos a IA para normalizar a resposta do usuário
                const promptCorrecaoRecebimento = `Analise a resposta: "${metodoRecebimento}" e normalize-a para 'Conta Corrente', 'Poupança', 'PIX' ou 'Dinheiro'. Se impossível, retorne 'PIX'. Retorne APENAS a palavra correta.`;
                const recebimentoCorrigido = await askLLM(promptCorrecaoRecebimento);
                entrada.recebimento = recebimentoCorrigido.trim();

                const dataDaEntrada = entrada.data || getFormattedDateOnly();
                const manualTransfer = await buildManualTransferFromMessage(entrada, `${entrada.descricao || ''} ${entrada.observacoes || ''}`, userId);
                if (manualTransfer) {
                    const saved = await saveManualTransfer(manualTransfer, userId);
                    await msg.reply(`✅ Transferência de ${formatCurrencyBR(saved.valor)} (${saved.descricao}) registrada como *${saved.status}* para a data de *${saved.data}*.`);
                    userStateManager.deleteState(senderId);
                    return;
                }

                const valorNumerico = parseValue(entrada.valor);

                const rowData = [
                    dataDaEntrada, entrada.descricao || 'Não especificado',
                    entrada.categoria || 'Outros', valorNumerico, pessoa,
                    entrada.recebimento, entrada.recorrente || 'Não', entrada.observacoes || '', userId
                ];

                await appendRowToSheet('Entradas', rowData);
                markFinancialReadModelDirty('entrada_write');
                await msg.reply(`✅ Entrada de R$${valorNumerico.toFixed(2)} (${entrada.descricao}) registrada como *${entrada.recebimento}* para a data de *${dataDaEntrada}*!`);

                const settings = await getUserSettingsByUserId(userId);
                if (settings && normalizeText(settings.defaults_enabled) === 'sim') {
                    const percent = Math.max(1, Math.min(50, parseInt(settings.default_reserve_percent, 10) || 10));
                    const reserveSuggestion = (valorNumerico * percent) / 100;
                    await msg.reply(`Sugestão automática: separar ${formatCurrencyBR(reserveSuggestion)} (${percent}%) para sua reserva.`);
                }
                userStateManager.deleteState(senderId);
                return;
            }

            case 'creating_goal': {
                await creationHandler.handleGoalCreation(msg);
                return;
            }

            case 'creating_debt': {
                await creationHandler.handleDebtCreation(msg);
                return;
            }

            case 'awaiting_payment_amount': {
                await debtHandler.finalizePaymentRegistration(msg);
                return;
            }

            case 'confirming_delete': {
                await deletionHandler.confirmDeletion(msg);
                return;
            }

            case 'confirming_recurring_bill_suggestion': {
                const cleanReply = normalizeText(msg.body);
                const { recurringBillCandidate, userId: importUserId } = currentState.data || {};

                if (['sim', 's', 'ss', 'confirmo', 'cadastrar'].includes(cleanReply)) {
                    userStateManager.setState(senderId, {
                        action: 'awaiting_recurring_bill_classification',
                        data: {
                            recurringBillCandidate,
                            userId: importUserId || userId
                        }
                    });
                    await sendPlainMessage(msg, buildRecurringBillClassificationQuestion(recurringBillCandidate));
                    return;
                }

                if (['nao', 'não', 'n', 'ignorar', 'cancelar'].includes(cleanReply)) {
                    userStateManager.deleteState(senderId);
                    await sendPlainMessage(msg, 'Sem problema. Não cadastrei essa conta recorrente.');
                    return;
                }

                await sendPlainMessage(msg, 'Responda `sim` para cadastrar essa conta recorrente ou `não` para ignorar.');
                return;
            }

            case 'awaiting_recurring_bill_classification': {
                const { recurringBillCandidate, userId: importUserId } = currentState.data || {};
                const classification = parseRecurringBillClassificationReply(msg.body);

                if (!classification) {
                    await sendPlainMessage(msg, buildRecurringBillClassificationQuestion(recurringBillCandidate));
                    return;
                }

                await appendRowToSheet('Contas', buildRecurringBillAccountRow(recurringBillCandidate, importUserId || userId, classification));
                userStateManager.deleteState(senderId);

                if (classification.ruleActive === 'SIM') {
                    await sendPlainMessage(
                        msg,
                        `Conta recorrente cadastrada. Vou lembrar o vencimento e classificar futuros lançamentos parecidos como ${classification.categoria} / ${classification.subcategoria}.`
                    );
                    return;
                }

                await sendPlainMessage(msg, 'Conta recorrente cadastrada. Vou considerar esse vencimento nos próximos lembretes, sem alterar a classificação automática.');
                return;
            }

            case 'awaiting_statement_import_owner': {
                const { importOwnerCandidates = [] } = currentState.data || {};
                const selectedOwner = parseStatementImportOwnerReply(msg.body, importOwnerCandidates);

                if (!selectedOwner) {
                    await sendPlainMessage(msg, buildStatementImportOwnerQuestion(currentState.data?.filename, importOwnerCandidates));
                    return;
                }

                await askNextStatementImportQuestion(msg, senderId, {
                    ...(currentState.data || {}),
                    person: selectedOwner.person || selectedOwner.label || pessoa,
                    userId: selectedOwner.userId || userId
                });
                return;
            }

            case 'awaiting_statement_recurring_income_classification': {
                const classification = parseRecurringIncomeClassificationReply(msg.body);
                const {
                    transactions = [],
                    filename,
                    person: importPerson,
                    userId: importUserId,
                    recurringIncomeCandidate,
                    recurringBillCandidate
                } = currentState.data || {};

                if (!classification) {
                    await sendPlainMessage(msg, buildRecurringIncomeQuestion(recurringIncomeCandidate));
                    return;
                }

                let classifiedTransactions = applyRecurringIncomeClassification(transactions, recurringIncomeCandidate, classification);
                if (['salary', 'extra_income'].includes(classification)) {
                    const existingRowsByType = await loadExistingImportRows({ userId: importUserId || userId });
                    classifiedTransactions = annotateImportDuplicates(classifiedTransactions, existingRowsByType);
                }
                const previewMessages = buildImportPreviewMessages(classifiedTransactions);

                userStateManager.setState(senderId, {
                    action: 'confirming_statement_import',
                    data: {
                        transactions: classifiedTransactions,
                        filename,
                        importKind: 'checking',
                        person: importPerson || pessoa,
                        userId: importUserId || userId,
                        recurringBillCandidate
                    }
                });
                for (const previewMessage of previewMessages) {
                    await sendPlainMessage(msg, previewMessage);
                }
                return;
            }

            case 'awaiting_statement_import_date': {
                const fallbackDate = parseStatementImportFallbackDate(msg.body);
                const { parsedTransactions = [], person: importPerson, userId: importUserId, filename, type } = currentState.data || {};

                if (!fallbackDate) {
                    await sendPlainMessage(
                        msg,
                        'Não consegui entender essa data. Responda com uma data completa, como `17/01/2026`, ou com mês/ano, como `janeiro/2026`.'
                    );
                    return;
                }

                const transactions = applyFallbackDateToTransactions(parsedTransactions, fallbackDate);
                userStateManager.setState(senderId, {
                    action: 'awaiting_statement_import_kind',
                    data: {
                        parsedTransactions: transactions,
                        filename,
                        type,
                        person: importPerson || pessoa,
                        userId: importUserId || userId
                    }
                });
                await sendPlainMessage(msg, buildStatementImportKindQuestion(filename));
                return;
            }

            case 'awaiting_statement_import_kind': {
                const selectedKind = parseStatementImportKindReply(msg.body);
                const { parsedTransactions = [], person: importPerson, userId: importUserId, filename } = currentState.data || {};

                if (selectedKind === 'checking') {
                    const existingRowsByType = await loadExistingImportRows({ userId: importUserId || userId });
                    const targetUserId = importUserId || userId;
                    const recurringAccountRows = await loadRecurringAccountRows({ userId: targetUserId });
                    const classifiedByAccounts = applyAccountClassificationRules(
                        parsedTransactions.map(item => ({ ...item, userId: targetUserId })),
                        recurringAccountRows
                    );
                    const transactions = annotateImportDuplicates(
                        classifiedByAccounts,
                        existingRowsByType
                    );
                    const recurringIncomeCandidate = detectRecurringIncomeCandidates(transactions, existingRowsByType)[0] || null;
                    const recurringBillCandidate = detectRecurringBillCandidates(transactions, existingRowsByType)[0] || null;

                    if (recurringIncomeCandidate) {
                        userStateManager.setState(senderId, {
                            action: 'awaiting_statement_recurring_income_classification',
                            data: {
                                transactions,
                                filename,
                                importKind: 'checking',
                                person: importPerson || pessoa,
                                userId: targetUserId,
                                recurringIncomeCandidate,
                                recurringBillCandidate
                            }
                        });
                        await sendPlainMessage(msg, buildRecurringIncomeQuestion(recurringIncomeCandidate));
                        return;
                    }

                    const previewMessages = buildImportPreviewMessages(transactions);

                    userStateManager.setState(senderId, {
                        action: 'confirming_statement_import',
                        data: {
                            transactions,
                            filename,
                            importKind: 'checking',
                            person: importPerson || pessoa,
                            userId: targetUserId,
                            recurringBillCandidate
                        }
                    });
                    for (const previewMessage of previewMessages) {
                        await sendPlainMessage(msg, previewMessage);
                    }
                    return;
                }

                if (selectedKind === 'credit_card') {
                    const cardTransactions = convertTransactionsForCreditCardStatement(parsedTransactions);
                    if (!cardTransactions.length) {
                        userStateManager.deleteState(senderId);
                        await sendPlainMessage(
                            msg,
                            'Não encontrei compras de cartão para importar nesse arquivo. ' +
                            'Créditos/estornos do cartão não são tratados como renda para evitar distorcer seu dashboard.'
                        );
                        return;
                    }

                    const cardOptions = await buildCreditCardOptionsForUser(importUserId || userId);
                    if (!cardOptions.length) {
                        await replyNoCreditCardsConfigured(msg);
                        return;
                    }

                    userStateManager.setState(senderId, {
                        action: 'awaiting_statement_import_card_selection',
                        data: {
                            cardTransactions,
                            filename,
                            person: importPerson || pessoa,
                            userId: importUserId || userId,
                            cardOptions
                        }
                    });
                    await sendPlainMessage(msg, formatCreditCardOptionsQuestion('Em qual cartão devo lançar esse extrato?', cardOptions));
                    return;
                }

                await sendPlainMessage(msg, 'Responda `1` para conta corrente ou `2` para cartão de crédito.');
                return;
            }

            case 'awaiting_statement_import_card_selection': {
                const { cardTransactions = [], cardOptions = [], person: importPerson, userId: importUserId, filename } = currentState.data || {};
                const selection = parseInt(msg.body.trim(), 10) - 1;

                if (selection < 0 || selection >= cardOptions.length) {
                    await sendPlainMessage(msg, 'Opção inválida. Responda apenas com um dos números da lista de cartões.');
                    return;
                }

                const cardInfo = getSelectedCardInfo(cardOptions, selection);
                const existingRowsByType = await loadExistingImportRows({ userId: importUserId || userId, includeCards: true });
                const transactions = annotateImportDuplicates(
                    cardTransactions.map(item => {
                        const parsedPurchaseDate = item.data ? parseSheetDate(item.data) : null;
                        const purchaseDate = parsedPurchaseDate || new Date();
                        return {
                            ...item,
                            userId: importUserId || userId,
                            cardId: cardInfo.cardId || cardInfo.key || cardInfo.sheetName,
                            cartao: cardInfo.label || cardInfo.sheetName,
                            cardInfo,
                            mesCobranca: item.mesCobranca || buildBillingMonthName(purchaseDate, cardInfo)
                        };
                    }),
                    existingRowsByType
                );
                const previewMessages = buildImportPreviewMessages(transactions);

                userStateManager.setState(senderId, {
                    action: 'confirming_statement_import',
                    data: {
                        transactions,
                        filename,
                        importKind: 'credit_card',
                        person: importPerson || pessoa,
                        userId: importUserId || userId
                    }
                });
                for (const previewMessage of previewMessages) {
                    await sendPlainMessage(msg, previewMessage);
                }
                return;
            }

            case 'confirming_statement_import': {
                const cleanReply = normalizeText(msg.body);
                if (['sim', 's', 'ss', 'confirmo', 'importar'].includes(cleanReply)) {
                    const {
                        transactions,
                        person: importPerson,
                        userId: importUserId,
                        importKind,
                        recurringBillCandidate
                    } = currentState.data || {};
                    try {
                        const successCount = await saveImportedTransactions(transactions || [], {
                            person: importPerson || pessoa,
                            userId: importUserId || userId
                        });
                        const doneMessage = `Importação concluída. ${successCount} lançamento(s) foram salvos na sua planilha.`;
                        if (successCount > 0 && importKind === 'checking' && recurringBillCandidate) {
                            userStateManager.setState(senderId, {
                                action: 'confirming_recurring_bill_suggestion',
                                data: {
                                    recurringBillCandidate,
                                    userId: importUserId || userId
                                }
                            });
                            await sendPlainMessage(msg, `${doneMessage}\n\n${buildRecurringBillSuggestionMessage(recurringBillCandidate)}`);
                            return;
                        }

                        userStateManager.deleteState(senderId);
                        await sendPlainMessage(msg, doneMessage);
                    } catch (error) {
                        logger.error(`importacao: falha ao salvar lançamentos user_id=${userId} error=${error.message}`);
                        userStateManager.deleteState(senderId);
                        await sendPlainMessage(msg, 'Não consegui concluir a importação agora. Nenhum novo arquivo ficou armazenado; tente novamente em instantes.');
                    }
                    return;
                }

                if (['nao', 'não', 'n', 'cancelar', 'cancela'].includes(cleanReply)) {
                    userStateManager.deleteState(senderId);
                    await sendPlainMessage(msg, 'Importação cancelada. Nenhum lançamento foi salvo.');
                    return;
                }

                await sendPlainMessage(msg, 'Responda `sim` para importar os lançamentos ou `não` para cancelar.');
                return;
            }

            case 'confirming_transactions': {
                const cleanReply = normalizeText(msg.body);
                if (cleanReply === 'sim') {
                    const { transactions, person } = currentState.data;
                    const canSaveNow = transactions.every(canSaveTransactionWithoutExtraPayment);

                    if (canSaveNow) {
                        let successCount = 0;
                        for (const item of transactions) {
                            try {
                                const manualTransfer = await buildManualTransferFromMessage(item, messageBody, userId);
                                if (manualTransfer) {
                                    await saveManualTransfer(manualTransfer, userId);
                                } else {
                                    await saveTransactionWithoutExtraPayment(item, { person: person || userMap[senderId] || 'Ambos', userId });
                                }
                                successCount++;
                            } catch (e) {
                                console.error("Erro CRÍTICO ao salvar item confirmado:", item, e);
                                await msg.reply(`Houve um erro ao tentar salvar o item "${item.descricao}".`);
                            }
                        }
                        await msg.reply(`Registro finalizado. ${successCount} de ${transactions.length} itens foram salvos com sucesso.`);
                        userStateManager.deleteState(senderId);
                        return;
                    }

                    userStateManager.setState(senderId, {
                        action: 'awaiting_batch_payment_method',
                        data: { transactions }
                    });
                    await msg.reply("Ótimo! E como esses itens foram pagos? (Crédito, Débito, PIX ou Dinheiro)");
                } else {
                    await msg.reply("Ok, registro cancelado.");
                    userStateManager.deleteState(senderId);
                }
                return; // Importante para esperar a próxima resposta do usuário
            }

            case 'awaiting_batch_payment_method': {
                const { transactions } = currentState.data;
                const respostaPagamento = msg.body.trim();
                const person = userMap[senderId] || 'Ambos';

                // Reutilizamos nosso prompt inteligente para normalizar a resposta de pagamento
                const promptCorrecaoPagamento = `
                Sua tarefa é normalizar a forma de pagamento informada pelo usuário.
                A resposta DEVE ser uma das seguintes opções: 'Débito', 'Crédito', 'PIX', 'Dinheiro'.

                Analise a resposta do usuário e faça a correspondência:
                - Se for 'd', 'deb', 'cartao de debito', a resposta é 'Débito'.
                - Se for 'c', 'cred', 'cartao de credito', a resposta é 'Crédito'.
                - Se for 'p', 'px', 'pics', a resposta é 'PIX'.
                - Se for 'din', 'vivo', 'especie', a resposta é 'Dinheiro'.

                Se não for possível determinar, retorne 'PIX' como padrão.

                NÃO forneça nenhuma explicação. Retorne APENAS a palavra final.

                Resposta do usuário: "${respostaPagamento}"
                `;
                const pagamentoCorrigido = await askLLM(promptCorrecaoPagamento);
                const pagamentoFinal = pagamentoCorrigido.trim();

                // Uma verificação de segurança: o fluxo de crédito é complexo (pede cartão, parcelas, etc.).
                // Por isso, é melhor tratar múltiplos itens no crédito de forma individual.
                if (normalizeText(pagamentoFinal) === 'credito') {
                    const cardOptions = await buildCreditCardOptionsForUser(userId);
                    if (!cardOptions.length) {
                        await replyNoCreditCardsConfigured(msg);
                        return;
                    }
                    const question = formatCreditCardOptionsQuestion('Ok, crédito. Em qual cartão? Responda com o número:', cardOptions);

                    userStateManager.setState(senderId, {
                        action: 'awaiting_credit_card_selection_batch', // Novo estado!
                        data: { transactions, cardOptions }
                    });
                    await msg.reply(question);
                    return;
                }

                await msg.reply(`✅ Entendido, ${pagamentoFinal}! Registrando ${transactions.length} itens...`);
                let successCount = 0;
                for (const item of transactions) {
                    try {
                        const sheetName = item.type; // 'Saídas' ou 'Entradas'
                        let rowData = [];

                        // Adiciona a forma de pagamento que acabamos de receber
                        item.pagamento = pagamentoFinal;
                        item.recebimento = pagamentoFinal;

                        const manualTransfer = await buildManualTransferFromMessage(item, `${item.descricao || ''} ${item.observacoes || ''}`, userId);
                        if (manualTransfer) {
                            await saveManualTransfer(manualTransfer, userId);
                            successCount++;
                            continue;
                        }

                        if (sheetName === 'Saídas') {
                            const dataDoGasto = item.data ? parseSheetDate(item.data) : new Date();
                            rowData = [
                                getFormattedDateOnly(dataDoGasto), item.descricao || 'Não especificado', item.categoria || 'Outros',
                                item.subcategoria || '', parseValue(item.valor), person, item.pagamento || '',
                                item.recorrente || 'Não', item.observacoes || '', userId
                            ];
                        } else if (sheetName === 'Entradas') {
                            const dataDaEntrada = item.data ? parseSheetDate(item.data) : new Date();
                            rowData = [
                                getFormattedDateOnly(dataDaEntrada), item.descricao || 'Não especificado',
                                item.categoria || 'Outros', parseValue(item.valor), person,
                                item.recebimento || '', item.recorrente || 'Não', item.observacoes || '', userId
                            ];
                        }
                        
                        if (rowData.length > 0) {
                            await appendRowToSheet(sheetName, rowData);
                            markFinancialReadModelDirty(sheetName === 'Saídas' ? 'saida_write' : 'entrada_write');
                            successCount++;
                        }
                    } catch (e) {
                        console.error("Erro CRÍTICO ao salvar item da lista (batch):", item, e);
                        await msg.reply(`Houve um erro ao tentar salvar o item "${item.descricao}".`);
                    }
                }

                await msg.reply(`Registro finalizado. ${successCount} de ${transactions.length} itens foram salvos com sucesso.`);
                userStateManager.deleteState(senderId);
                return;
            }

            case 'awaiting_credit_card_selection_batch': {
                const { transactions, cardOptions = buildLegacyCreditCardOptions() } = currentState.data;
                const selection = parseInt(msg.body.trim(), 10) - 1;

                if (selection >= 0 && selection < cardOptions.length) {
                    const cardInfo = getSelectedCardInfo(cardOptions, selection);

                    userStateManager.setState(senderId, {
                        action: 'awaiting_installments_batch', // Próximo novo estado!
                        data: { transactions, cardInfo }
                    });

                    let question = `Entendido, no cartão *${cardInfo.sheetName}*. E as parcelas?\n\n`;
                    question += `*1.* Se foi tudo à vista (ou 1x), digite \`1\`.\n`;
                    question += `*2.* Se todos tiveram o mesmo nº de parcelas, digite o número (ex: \`3\`)\n`;
                    question += `*3.* Se foram parcelas diferentes, me diga quais (ex: \`${transactions[0].descricao} em 3x, o resto à vista\`).`;
                    await msg.reply(question);

                } else {
                    await msg.reply("Opção inválida. Por favor, responda apenas com um dos números da lista.");
                }
                return;
            }

            case 'awaiting_installments_batch': {
                const { transactions, cardInfo } = currentState.data;
                const userReply = msg.body.trim();
                const installments = parseInt(userReply, 10);

                let installmentMap = {};

                // Se a resposta for um número simples, cria um mapa com esse número para todos.
                if (!isNaN(installments) && installments > 0) {
                    transactions.forEach(t => installmentMap[normalizeText(t.descricao)] = installments);
                } else {
                    // Se for texto, pedimos ajuda para a IA mapear
                    await msg.reply("Ok, entendi que são parcelas diferentes. Estou analisando sua resposta para aplicar corretamente...");
                    const descricoes = transactions.map(t => t.descricao);
                    const promptMapeamento = `
                        Sua tarefa é analisar a resposta do usuário e mapear o número de parcelas para cada item de uma lista.
                        Itens disponíveis: ${JSON.stringify(descricoes)}.
                        Resposta do usuário: "${userReply}".

                        Regras:
                        - "à vista", "1x", "uma vez" significa 1 parcela.
                        - "o resto", "os outros" se aplica a todos os itens que não foram explicitamente mencionados. Se nada mais for mencionado, aplica-se a todos.
                        - Retorne APENAS um objeto JSON no formato {"nome do item": numero_de_parcelas}.

                        Exemplo:
                        - Itens: ["ifood", "farmacia"]
                        - Resposta: "ifood em 2x, o resto a vista"
                        - Saída JSON: {"ifood": 2, "farmacia": 1}
                    `;
                    const mappedInstallments = await getStructuredResponseFromLLM(promptMapeamento);
                    // Normalizamos as chaves do objeto retornado pela IA para garantir a correspondência
                    if (mappedInstallments) {
                        for (const key in mappedInstallments) {
                            installmentMap[normalizeText(key)] = mappedInstallments[key];
                        }
                    }
                }

                if (Object.keys(installmentMap).length === 0) {
                    await msg.reply("Não consegui entender a divisão das parcelas. Vamos cancelar e você pode tentar de novo, ok?");
                    userStateManager.deleteState(senderId);
                    return;
                }

                await msg.reply(`Perfeito! Registrando ${transactions.length} gastos no cartão *${cardInfo.sheetName}*...`);

                // A partir daqui, a lógica de salvar é a mesma, mas dentro de um loop
                for (const gasto of transactions) {
                    const descNormalizada = normalizeText(gasto.descricao);
                    const numParcelas = installmentMap[descNormalizada] || 1; // Se a IA não mapear um, assume 1x

                    const installmentValue = parseValue(gasto.valor) / numParcelas;
                    const purchaseDate = gasto.data ? parseSheetDate(gasto.data) : new Date();

                    for (let i = 1; i <= numParcelas; i++) {
                        let billingMonth = purchaseDate.getMonth();
                        let billingYear = purchaseDate.getFullYear();

                        if (purchaseDate.getDate() > cardInfo.closingDay) {
                            billingMonth += 1;
                        }
                        
                        billingMonth += (i - 1);

                        while (billingMonth > 11) {
                            billingMonth -= 12;
                            billingYear += 1;
                        }

                        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                        const billingMonthName = `${monthNames[billingMonth]} de ${billingYear}`;

                        const rowData = [
                            getFormattedDateOnly(purchaseDate), gasto.descricao, gasto.categoria || 'Outros',
                            Math.round((installmentValue + Number.EPSILON) * 100) / 100, `${i}/${numParcelas}`, billingMonthName, userId
                        ];
                        
                        await appendRowToSheet(cardInfo.sheetName, rowData);
                    }
                }

                markFinancialReadModelDirty('card_write');
                await msg.reply(`✅ Lançamentos no crédito finalizados com sucesso!`);
                userStateManager.deleteState(senderId);
                return;
            }
        }
    } else {
        // --- INÍCIO DA ANÁLISE DE NOVOS COMANDOS ---
        console.log(`Mensagem de ${pessoa} (${senderId}): "${sanitizeLogText(messageBody)}"`);
        try {
            // CÓDIGO PARA SUBSTITUIR (APENAS A CONSTANTE masterPrompt)

            let structuredResponse = null;
            if (isGreetingMessage(messageBody)) {
                metrics.increment('message.greeting.fast_path');
                logger.info(`[routing] fast_path intent=greeting sender=${senderId}`);
                await msg.reply(buildGreetingReply(pessoa));
                return;
            }

            structuredResponse = detectFastPerguntaIntent(messageBody);
            if (structuredResponse) {
                metrics.increment('message.pergunta.fast_path');
                logger.info(`[routing] fast_path intent=pergunta sender=${senderId} msg="${sanitizeLogText(messageBody)}"`);
            }

            if (!structuredResponse) {
                structuredResponse = detectLocalCommandIntent(messageBody);
                if (structuredResponse) {
                    metrics.increment('message.command.fast_path');
                    logger.info(`[routing] fast_path intent=${structuredResponse.intent} sender=${senderId}`);
                }
            }

            if (!structuredResponse && shouldSkipAiForUnknownMessage(messageBody)) {
                structuredResponse = { intent: 'desconhecido' };
                metrics.increment('message.unknown.fast_path');
                logger.info(`[routing] fast_path intent=desconhecido sender=${senderId}`);
            }

            if (!structuredResponse) {
                metrics.increment('message.ai.master_prompt.called');
                const masterPrompt = `Sua tarefa é analisar a mensagem e extrair a intenção e detalhes em um JSON. A data e hora atual é ${new Date().toISOString()}.

            ### ORDEM DE ANÁLISE OBRIGATÓRIA:
            1.  **É UM PEDIDO DE RESUMO OU BALANÇO GERAL?** Se o usuário pedir um panorama geral (ex: "resumo", "como estão minhas finanças"), a intenção é OBRIGATORIAMENTE 'resumo'.
                - Se a mensagem for pergunta específica com mês/ano/categoria/valor (ex: "qual meu saldo de março?", "quanto gastei com alimentação?"), a intenção correta é 'pergunta', NÃO 'resumo'.
            2.  **É UM PEDIDO DE AJUDA?** Se o usuário perguntar o que você faz, quais são seus comandos, ou pedir ajuda, a intenção é OBRIGATORIAMENTE 'ajuda'.
            2.  **É UM PAGAMENTO DE DÍVIDA?** Se a mensagem indicar o pagamento de uma conta ou dívida existente (ex: "paguei o financiamento", "registre o pagamento da fatura", "paguei a parcela do carro"), a intenção é OBRIGATORIAMENTE 'registrar_pagamento'.
            3.  **É UM PEDIDO DE EXCLUSÃO?** Se a mensagem for para apagar algo, a intenção é 'apagar_item'.
            4.  **É UMA PERGUNTA DE ANÁLISE?** Se a mensagem for uma pergunta sobre dados (iniciar com "Qual", "Quanto", "Liste", etc.), a intenção é OBRIGATORIAMENTE 'pergunta'.
            5.  **É UM REGISTRO DE TRANSAÇÃO GERAL?** Se não for nenhum dos acima, verifique se é um 'gasto' ou 'entrada' novo.
            6.  **OUTRAS INTENÇÕES:** Se não for nenhum dos acima, verifique as outras intenções (criar meta, etc).

            ### REGRAS PARA A INTENÇÃO 'apagar_item':
            - O campo 'deleteDetails.descricao' deve ser o texto do item a ser apagado (ex: "uber", "pão").
            - Se o usuário disser "último" (ex: "apagar último gasto"), a 'descricao' DEVE ser a palavra "ultimo".
            - O campo 'deleteDetails.categoria' DEVE ser o TIPO do item a ser apagado (ex: "gasto", "saida", "entrada", "divida", "meta"). NÃO use categorias financeiras como "Alimentação".

            ### REGRAS GERAIS:
            - **DATAS:** Se o usuário mencionar uma data, converta para DD/MM/AAAA. Hoje é ${new Date().toLocaleDateString('pt-BR')}.
            - **CORREÇÃO E PADRONIZAÇÃO:** Para gastos/entradas, use as bases de conhecimento para encontrar a categoria correta e corrija erros de digitação.
            - **NÃO FAÇA SUPOSIÇÕES:** Não presuma informações que não estejam EXPLICITAMENTE na mensagem.

            ### Mensagem do usuário ("${pessoa}"): "${messageBody}"
            ### Bases de Conhecimento:
            - Mapa de Gastos: ${JSON.stringify(mapeamentoGastos)}
            - Mapa de Entradas: ${JSON.stringify(mapeamentoEntradas)}
            ### Formato de Saída:
            Retorne APENAS o objeto JSON, seguindo este schema: ${JSON.stringify(MASTER_SCHEMA)}`;
            
                structuredResponse = await timeStep(
                    'getStructuredResponseFromLLM',
                    () => getStructuredResponseFromLLM(masterPrompt),
                    perfContext
                );
                console.log("--- RESPOSTA BRUTA DA IA ---");
                console.log(JSON.stringify(structuredResponse, null, 2));
                console.log("--------------------------");
            }

            if (structuredResponse && structuredResponse.error) {
            await msg.reply("A conexão com a IA está instável no momento. Por favor, tente novamente em alguns instantes.");
            return;
        }

            if (!structuredResponse || !structuredResponse.intent) {
            await msg.reply("Desculpe, não entendi o que você quis dizer.");
            return;
        };

            if (structuredResponse.intent === 'resumo' && shouldRouteResumoToPergunta(messageBody)) {
                logger.info(`[routing] override_intent resumo->pergunta sender=${senderId} msg="${sanitizeLogText(messageBody)}"`);
                structuredResponse.intent = 'pergunta';
                if (!structuredResponse.question) {
                    structuredResponse.question = messageBody;
                }
            }

            switch (structuredResponse.intent) {
                case 'resumo': {
                    await msg.reply('Gerando seu resumo financeiro com saúde de caixa...');
                    try {
                        const usePersonalSpreadsheet = await hasUserSpreadsheetContext({ userId });
                        const sheetReads = [
                            readDataFromSheet('Saídas!A:J'),
                            readDataFromSheet('Entradas!A:I'),
                            readDataFromSheet('Dívidas!A:R'),
                            readDataFromSheet('Metas!A:I')
                        ];

                        if (usePersonalSpreadsheet) {
                            sheetReads.push(readDataFromSheet('Lançamentos Cartão!A:J'));
                        } else {
                            const cardSheetNames = Object.values(creditCardConfig).map(card => card.sheetName);
                            cardSheetNames.forEach(sheetName => {
                                sheetReads.push(readDataFromSheet(sheetName + '!A:G'));
                            });
                        }

                        const allSheetData = await timeStep(
                            'resumo.Promise.all(sheetReads)',
                            () => Promise.all(sheetReads),
                            perfContext
                        );
                        const [saidasData, entradasData, dividasData, metasData] = allSheetData;
                        const creditCardData = allSheetData.slice(4);
                        const userProfile = await getUserProfileByUserId(userId);

                        const health = buildHealthSummary({
                            user: activeUser,
                            aliases: [pessoa, activeUser.display_name],
                            profile: userProfile,
                            saidasData,
                            entradasData,
                            dividasData,
                            metasData,
                            creditCardData
                        });

                        const extraBudgetForAvalanche = health.saldoMes > 0 ? health.saldoMes * 0.5 : 0;
                        const avalanchePlan = buildDebtAvalanchePlan({
                            debts: health.debtsForPlanning,
                            extraBudget: extraBudgetForAvalanche
                        });

                        const riscoTexto = health.daysToNegative === null
                            ? 'Sem dados suficientes para estimar dias até caixa negativo.'
                            : 'Risco de caixa em ' + health.daysToNegative + ' dia(s) (nível ' + health.riskLevel + ').';

                        const summaryMessage = [
                            'Resumo inteligente de ' + health.periodLabel + ':',
                            '- Entradas do mês: ' + formatCurrencyBR(health.currentMonthEntradas),
                            '- Saídas do mês (exceto cartão): ' + formatCurrencyBR(health.currentMonthSaidas),
                            '- Fatura no mês: ' + formatCurrencyBR(health.currentMonthCard),
                            '- Saldo do mês: ' + formatCurrencyBR(health.saldoMes),
                            '',
                            'Radar de caixa (30 dias):',
                            '- ' + riscoTexto,
                            '- Por quê: ' + health.riskExplanation,
                            '',
                            'Reserva de emergência:',
                            '- Alvo (3 meses): ' + formatCurrencyBR(health.reserveTarget3),
                            '- Valor atual mapeado: ' + formatCurrencyBR(health.reserveCurrent),
                            '- Progresso: ' + health.reserveProgressPct.toFixed(1) + '%',
                            '- Como calculei: ' + health.reserveExplanation
                        ].join('\n');

                        let avalancheMessage = '';
                        let dashboardMetrics = [
                            { label: 'Entradas do mês', value: formatCurrencyBR(health.currentMonthEntradas) },
                            { label: 'Saídas do mês (exceto cartão)', value: formatCurrencyBR(health.currentMonthSaidas) },
                            { label: 'Fatura no mês', value: formatCurrencyBR(health.currentMonthCard) },
                            { label: 'Saldo do mês', value: formatCurrencyBR(health.saldoMes) },
                            { label: 'Radar de caixa (30 dias)', value: riscoTexto },
                            { label: 'Radar de caixa - contexto', value: health.riskExplanation },
                            { label: 'Reserva de emergência - alvo (3 meses)', value: formatCurrencyBR(health.reserveTarget3) },
                            { label: 'Reserva de emergência - valor atual', value: formatCurrencyBR(health.reserveCurrent) },
                            { label: 'Reserva de emergência - progresso', value: health.reserveProgressPct.toFixed(1) + '%' },
                            { label: 'Reserva de emergência - cálculo', value: health.reserveExplanation }
                        ];
                        if (avalanchePlan) {
                            const ordem = avalanchePlan.avalanche.order.length > 0
                                ? avalanchePlan.avalanche.order.join(' -> ')
                                : health.debtsForPlanning
                                    .slice()
                                    .sort((a, b) => b.monthlyRatePct - a.monthlyRatePct)
                                    .map(d => d.name)
                                    .join(' -> ');

                            avalancheMessage = [
                                '',
                                'Plano de dívidas (estratégia avalanche):',
                                '- Extra sugerido/mês: ' + formatCurrencyBR(avalanchePlan.recommendedExtraBudget),
                                '- Ordem sugerida: ' + ordem,
                                '- Prazo estimado (base): ' + avalanchePlan.baseline.months + ' mês(es)',
                                '- Prazo estimado (avalanche): ' + avalanchePlan.avalanche.months + ' mês(es)',
                                '- Economia estimada de juros: ' + formatCurrencyBR(avalanchePlan.interestSaved),
                                '- Por quê: ' + avalanchePlan.explanation
                            ].join('\n');

                            dashboardMetrics = dashboardMetrics.concat([
                                { label: 'Plano de dívidas - extra sugerido/mês', value: formatCurrencyBR(avalanchePlan.recommendedExtraBudget) },
                                { label: 'Plano de dívidas - ordem sugerida', value: ordem },
                                { label: 'Plano de dívidas - prazo base', value: avalanchePlan.baseline.months + ' mês(es)' },
                                { label: 'Plano de dívidas - prazo avalanche', value: avalanchePlan.avalanche.months + ' mês(es)' },
                                { label: 'Plano de dívidas - economia de juros', value: formatCurrencyBR(avalanchePlan.interestSaved) },
                                { label: 'Plano de dívidas - contexto', value: avalanchePlan.explanation }
                            ]);
                        }

                        await timeStep(
                            'resumo.syncDashboardForUser',
                            () => syncDashboardForUser({
                                userId,
                                periodLabel: health.periodLabel,
                                metrics: dashboardMetrics
                            }),
                            perfContext
                        );

                        cache.set(cacheKey, summaryMessage);
                        await msg.reply(summaryMessage + avalancheMessage);
                    } catch (err) {
                        console.error('Erro ao gerar resumo financeiro:', err);
                        await msg.reply('Não consegui gerar o resumo inteligente agora. Tente novamente em instantes.');
                    }
                    break;
                }
                case 'gasto':
                case 'entrada': {
                    const gastos = structuredResponse.gastoDetails || [];
                    const entradas = structuredResponse.entradaDetails || [];
                    const allTransactions = [];

                    // --- NOVA BARREIRA DE VALIDAÇÃO ---
                    for (const item of [...gastos, ...entradas]) {
                        if (item.valor === null || typeof item.valor !== 'number') {
                            await msg.reply(`Opa! Entendi que você quer registrar algo sobre "${item.descricao}", mas não consegui identificar um valor numérico válido na sua mensagem. Pode tentar de novo, por favor?`);
                            return; // Para a execução imediatamente
                        }
                    }
                    // --- FIM DA VALIDAÇÃO ---

                    if (gastos.length > 0) gastos.forEach(g => allTransactions.push({ ...g, type: 'Saídas' }));
                    if (entradas.length > 0) entradas.forEach(e => allTransactions.push({ ...e, type: 'Entradas' }));

                    if (allTransactions.length === 0) {
                        await msg.reply(`Entendi a intenção, mas não identifiquei os detalhes (valor, descrição).`);
                        break;
                    }

                    if (allTransactions.length === 1) {
                        const item = allTransactions[0];
                        const manualTransfer = await buildManualTransferFromMessage(item, messageBody, userId);
                        if (manualTransfer) {
                            const saved = await saveManualTransfer(manualTransfer, userId);
                            await msg.reply(`✅ Transferência de ${formatCurrencyBR(saved.valor)} (${saved.descricao}) registrada como *${saved.status}* para a data de *${saved.data}*.`);
                            return;
                        }

                        const pagamento = normalizeText(item.pagamento || '');

                        const messageMentionsCard = normalizeText(messageBody).includes('cartao');
                        if (item.type === 'Saídas' && (pagamento === 'credito' || messageMentionsCard)) {
                            const cardOptions = await buildCreditCardOptionsForUser(userId);
                            if (pagamento === 'credito' && !cardOptions.length) {
                                await replyNoCreditCardsConfigured(msg);
                                return;
                            }
                            const explicitCard = findExplicitCardOption(messageBody, cardOptions);
                            const shouldUseCreditCardFlow = pagamento === 'credito' || (explicitCard && !hasExplicitDebitPaymentSignal(messageBody));
                            if (shouldUseCreditCardFlow) {
                                if (!cardOptions.length) {
                                    await replyNoCreditCardsConfigured(msg);
                                    return;
                                }
                                const creditCardItem = { ...item, pagamento: 'Crédito' };
                                const explicitInstallments = detectInstallmentsFromMessage(messageBody);
                                if (explicitCard && explicitInstallments) {
                                    const cardInfo = getSelectedCardInfo(cardOptions, cardOptions.indexOf(explicitCard));
                                    const saved = await saveCreditCardExpense(creditCardItem, cardInfo, explicitInstallments, userId);
                                    if (saved.installments === 1) {
                                        await msg.reply(`✅ Gasto de R$${creditCardItem.valor} lançado no *${saved.sheetName}*.`);
                                    } else {
                                        await msg.reply(`✅ Gasto de R$${creditCardItem.valor} lançado em ${saved.installments}x de R$${saved.installmentValue.toFixed(2)} no *${saved.sheetName}*.`);
                                    }
                                    await safeMaybeNotifyDailyGoalAfterExpense(msg, userId, 'single_expense');
                                    return;
                                }
                                if (explicitCard) {
                                    const cardInfo = getSelectedCardInfo(cardOptions, cardOptions.indexOf(explicitCard));
                                    userStateManager.setState(senderId, {
                                        action: 'awaiting_installment_number',
                                        data: { gasto: creditCardItem, cardInfo }
                                    });
                                    await msg.reply(`Entendi, o gasto foi no *${cardInfo.sheetName}*. Em quantas parcelas? (digite \`1\` se for à vista)`);
                                    return;
                                }
                                const question = formatCreditCardOptionsQuestion('Entendi, o gasto foi no crédito. Em qual cartão? Responda com o número:', cardOptions);
                                userStateManager.setState(senderId, {
                                    action: 'awaiting_credit_card_selection',
                                    data: { gasto: { ...creditCardItem, installments: explicitInstallments }, cardOptions }
                                });
                                await msg.reply(question);
                                return;
                            }
                        }
                        if (canSaveTransactionWithoutExtraPayment(item)) {
                            const saved = await saveTransactionWithoutExtraPayment(item, { person: pessoa, userId });
                            const typeLabel = item.type === 'Saídas' ? 'Gasto' : 'Entrada';
                            await msg.reply(`✅ ${typeLabel} de R$${saved.value.toFixed(2)} (${item.descricao || 'Não especificado'}) registrado como *${saved.method}* para a data de *${saved.date}*!`);
                            if (item.type === 'Saídas') {
                                await safeMaybeNotifyDailyGoalAfterExpense(msg, userId, 'structured_expense');
                            }
                            return;
                        }

                        if (item.type === 'Saídas' && !item.pagamento) {
                            const dataDoGasto = item.data ? parseSheetDate(item.data) : new Date();
                            userStateManager.setState(senderId, {
                                action: 'awaiting_payment_method',
                                // A estrutura de dados correta é um objeto com a propriedade 'gasto'
                                data: {
                                    gasto: { ...item, originalMessage: messageBody },
                                    dataFinal: getFormattedDateOnly(dataDoGasto)
                                }
                            });
                            await msg.reply('Entendido! E qual foi a forma de pagamento? (Crédito, Débito, PIX ou Dinheiro)');
                            return;
                        }

                        if (item.type === 'Entradas' && !item.recebimento) {
                            userStateManager.setState(senderId, { action: 'awaiting_receipt_method', data: { ...item, originalMessage: messageBody } });
                            await msg.reply('Entendido! E onde você recebeu esse valor? (Conta Corrente, Poupança, PIX ou Dinheiro)');
                            return;
                        }
                    }
                    
                    let confirmationMessage = `Encontrei ${allTransactions.length} transaç(ão|ões) para registrar:\n\n`;
                    allTransactions.forEach((item, index) => {
                        const typeLabel = item.type === 'Saídas' ? 'Gasto' : 'Entrada';
                        const dataInfo = item.data ? ` (Data: ${item.data})` : '';
                        confirmationMessage += `*${index + 1}.* [${typeLabel}] ${item.descricao} - *R$${item.valor}* (${item.categoria || 'N/A'})${dataInfo}\n`;
                    });
                    confirmationMessage += "\nVocê confirma o registro de todos os itens? Responda com *'sim'* ou *'não'*.";

                    userStateManager.setState(senderId, {
                        action: 'confirming_transactions',
                        data: { transactions: allTransactions.map(item => ({ ...item, originalMessage: messageBody })), person: pessoa }
                    });
                    await msg.reply(confirmationMessage);
                    break;
                }

                case 'pergunta': {
                    try {
                        const userQuestion = structuredResponse.question || messageBody;
                        const previousAnalyticalContext = getAnalyticalContext(senderId);
                        const localClassification = classifyPerguntaLocally(userQuestion, previousAnalyticalContext);
                        const intentClassification = localClassification || await timeStep(
                            'classify(userQuestion)',
                            () => classify(userQuestion),
                            perfContext
                        );
                        if (localClassification) {
                            metrics.increment('message.pergunta.local_classification');
                            logger.info(`[routing] local_classification intent=${localClassification.intent} sender=${senderId}`);
                        } else {
                            metrics.increment('message.ai.classify.called');
                        }

                        let analyzedData = null;
                        let usedReadModel = false;
                        let analysisSource = 'unknown';
                        const usePersonalSpreadsheet = await hasUserSpreadsheetContext({ userId });
                        const financialScopeUserIds = usePersonalSpreadsheet ? getFinancialScopeUserIds(userId) : [userId];
                        let analyticalUserIds = financialScopeUserIds;
                        let effectiveIntentClassification = intentClassification;
                        if (usePersonalSpreadsheet && financialScopeUserIds.length > 1) {
                            const usersForScope = await getAllUsers();
                            const userScopeMatch = resolveQuestionUserScopeMatch(userQuestion, usersForScope, financialScopeUserIds);
                            analyticalUserIds = userScopeMatch.userIds;
                            effectiveIntentClassification = normalizeIntentForQuestionUserScope(intentClassification, userScopeMatch);
                            if (analyticalUserIds.length !== financialScopeUserIds.length) {
                                logger.info(`[routing] question_user_scope sender=${senderId} selected=${analyticalUserIds.length}/${financialScopeUserIds.length}`);
                            }
                        }
                        const sheetOnlyIntents = new Set(['total_pagamentos_fatura_mes', 'resumo_contas_recorrentes', 'contas_vencendo', 'saldo_disponivel_estimado']);
                        if (!usePersonalSpreadsheet && !sheetOnlyIntents.has(effectiveIntentClassification.intent)) {
                            try {
                                await timeStep(
                                    'readModel.sync',
                                    () => syncReadModelIfNeeded(),
                                    perfContext
                                );
                                analyzedData = await timeStep(
                                    'readModel.execute',
                                    () => executeAnalyticalIntent(
                                        effectiveIntentClassification.intent,
                                        effectiveIntentClassification.parameters,
                                        { userId }
                                    ),
                                    perfContext
                                );
                                usedReadModel = true;
                                analysisSource = analyzedData?.source || 'read_model_unknown';
                                metrics.increment(`message.pergunta.analysis.${normalizeMetricLabel(analysisSource)}`);
                                logger.info(`[routing] analysis_source=${analysisSource} intent=${effectiveIntentClassification.intent} sender=${senderId}`);
                            } catch (readModelError) {
                                metrics.increment('message.pergunta.analysis.read_model_error');
                                logger.warn(`[read-model] fallback legacy execute. motivo=${readModelError.message}`);
                                await recordQaFailure({
                                    kind: 'analysis_fallback',
                                    reason: 'read_model_error',
                                    userId,
                                    whatsappId: senderId,
                                    message: userQuestion,
                                    intent: effectiveIntentClassification.intent,
                                    parameters: effectiveIntentClassification.parameters,
                                    analysisSource: 'read_model_error',
                                    error: readModelError
                                });
                            }
                        } else {
                            metrics.increment('message.pergunta.analysis.personal_sheet');
                            logger.info(`[routing] analysis_source=personal_sheet intent=${effectiveIntentClassification.intent} sender=${senderId}`);
                        }

                        if (!analyzedData) {
                            metrics.increment('message.pergunta.analysis.sheets_fallback');
                            analysisSource = 'sheets_fallback';
                            logger.info(`[routing] analysis_source=${analysisSource} intent=${effectiveIntentClassification.intent} sender=${senderId}`);
                            const sheetReads = [
                                readDataFromSheet('Saídas!A:J'),
                                readDataFromSheet('Entradas!A:I'),
                                readDataFromSheet('Metas!A:I'),
                                readDataFromSheet('Dívidas!A:R')
                            ];
                            const needsTransfers = effectiveIntentClassification.intent === 'total_pagamentos_fatura_mes' || effectiveIntentClassification.intent === 'saldo_disponivel_estimado';
                            const needsAccounts = effectiveIntentClassification.intent === 'resumo_contas_recorrentes' || effectiveIntentClassification.intent === 'contas_vencendo';
                            if (needsTransfers) sheetReads.push(readDataFromSheet('Transferências!A:I'));
                            if (needsAccounts) sheetReads.push(readDataFromSheet('Contas!A:I'));
                            if (usePersonalSpreadsheet) {
                                sheetReads.push(readDataFromSheet('Lançamentos Cartão!A:J'));
                            } else {
                                const cardSheetNames = Object.values(creditCardConfig).map(card => card.sheetName);
                                cardSheetNames.forEach(sheetName => {
                                    sheetReads.push(readDataFromSheet(`${sheetName}!A:G`));
                                });
                            }
                            const allSheetData = await timeStep(
                                'pergunta.Promise.all(sheetReads)',
                                () => Promise.all(sheetReads),
                                perfContext
                            );

                            const [saidasData, entradasData, metasData, dividasData] = allSheetData;
                            let nextSheetIndex = 4;
                            const transferenciasData = needsTransfers
                                ? allSheetData[nextSheetIndex++]
                                : [['Data', 'Descrição', 'Valor', 'Conta Origem', 'Conta Destino', 'Método', 'Observações', 'Status', 'user_id']];
                            const contasData = needsAccounts
                                ? allSheetData[nextSheetIndex++]
                                : [['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa']];
                            const creditCardData = allSheetData.slice(nextSheetIndex);
                            const cardUserIdIndex = usePersonalSpreadsheet ? 9 : 6;
                            const filteredCreditCardData = creditCardData.map(sheetRows => filterSheetRowsByUserIds(sheetRows, cardUserIdIndex, analyticalUserIds));
                            analyzedData = await timeStep(
                                'execute(intent)',
                                () => execute(
                                    effectiveIntentClassification.intent,
                                    effectiveIntentClassification.parameters,
                                    {
                                        saidas: filterSheetRowsByUserIds(saidasData, 9, analyticalUserIds),
                                        entradas: filterSheetRowsByUserIds(entradasData, 8, analyticalUserIds),
                                        metas: filterSheetRowsByUserIds(metasData, 8, analyticalUserIds),
                                        dividas: filterSheetRowsByUserIds(dividasData, 17, analyticalUserIds),
                                        transferencias: filterSheetRowsByUserIds(transferenciasData, 8, analyticalUserIds),
                                        contas: filterSheetRowsByUserIds(contasData, 3, analyticalUserIds),
                                        cartoes: filteredCreditCardData
                                    }
                                ),
                                perfContext
                            );
                        }

                        let respostaFinal = buildLocalPerguntaResponse({
                            userQuestion,
                            intent: effectiveIntentClassification.intent,
                            analyzedData
                        });
                        if (!respostaFinal) {
                            if (effectiveIntentClassification.intent === 'pergunta_geral') {
                                await recordQaFailure({
                                    kind: 'question_needs_review',
                                    reason: 'generic_question_intent',
                                    userId,
                                    whatsappId: senderId,
                                    message: userQuestion,
                                    intent: effectiveIntentClassification.intent,
                                    parameters: effectiveIntentClassification.parameters,
                                    analysisSource,
                                    responseMode: 'ai_generation'
                                });
                            }
                            metrics.increment('message.ai.generate.called');
                            metrics.increment('message.pergunta.response.ai_generate');
                            respostaFinal = await timeStep(
                                'generate(response)',
                                () => generate({
                                    userQuestion,
                                    intent: effectiveIntentClassification.intent,
                                    rawResults: analyzedData.results,
                                    details: analyzedData.details,
                                    dateContext: {
                                        currentMonth: new Date().getMonth(),
                                        currentYear: new Date().getFullYear()
                                    },
                                    source: usedReadModel ? analysisSource : 'legacy_sheets'
                                }),
                                perfContext
                            );
                        } else {
                            metrics.increment('message.pergunta.local_response');
                            metrics.increment('message.pergunta.response.local');
                            logger.info(`[routing] local_response intent=${effectiveIntentClassification.intent} sender=${senderId}`);
                        }
                    
                        cache.set(cacheKey, respostaFinal);
                        await msg.reply(respostaFinal);
                        storeAnalyticalContext(senderId, effectiveIntentClassification);

                    } catch (err) {
                        console.error("Erro no novo sistema de perguntas:", err);
                        await recordQaFailure({
                            kind: 'question_error',
                            reason: 'pergunta_processing_error',
                            userId,
                            whatsappId: senderId,
                            message: structuredResponse?.question || messageBody,
                            intent: structuredResponse?.intent || 'pergunta',
                            error: err
                        });
                        await msg.reply("Desculpe, não consegui processar essa análise. Tente reformular a pergunta.");
                    }
                    break;
                }

                case 'criar_lembrete': {
                    const lembrete = structuredResponse.lembreteDetails;
                    if (!lembrete || !lembrete.titulo || !lembrete.dataHora) {
                        await recordQaFailure({
                            kind: 'command_missing_details',
                            reason: 'incomplete_reminder',
                            userId,
                            whatsappId: senderId,
                            message: messageBody,
                            intent: 'criar_lembrete',
                            parameters: lembrete || {}
                        });
                        await msg.reply("Não entendi os detalhes do lembrete. Por favor, inclua o que e quando (ex: 'me lembre de pagar a luz amanhã às 10h').");
                        break;
                    }
                    try {
                        await createCalendarEvent(lembrete.titulo, lembrete.dataHora, lembrete.recorrencia, {
                            userId,
                            whatsappId: senderId
                        });
                        await msg.reply(`✅ Lembrete criado: "${lembrete.titulo}"`);
                    } catch (error) {
                        await msg.reply("Houve um erro ao tentar salvar o evento na sua Agenda Google.");
                    }
                    break;
                }

                case 'registrar_pagamento': {
                    await debtHandler.startPaymentRegistration(msg, structuredResponse.pagamentoDetails);
                    break;
                }
            
                case 'apagar_item': {
                    await deletionHandler.handleDeletionRequest(msg, structuredResponse.deleteDetails);
                    break;
                }

                case 'criar_divida': {
                    await creationHandler.startDebtCreation(msg);
                    break;
                }

                case 'criar_meta': {
                    await creationHandler.startGoalCreation(msg);
                    break;
                }

                case 'desconhecido':
                default: {
                    logger.info(`[routing] unknown_intent sender=${senderId} msg="${sanitizeLogText(messageBody)}"`);
                    await recordQaFailure({
                        kind: 'unknown_intent',
                        reason: 'routing_unknown_intent',
                        userId,
                        whatsappId: senderId,
                        message: messageBody,
                        intent: structuredResponse?.intent || 'desconhecido'
                    });
                    await msg.reply('Não entendi esse pedido ainda. Envie "ajuda" para ver exemplos do que posso fazer.');
                    break;
                }

                case 'ajuda': {
                    const helpMessage = `Olá! Eu sou seu assistente financeiro. Veja como posso te ajudar:\n\n*PARA REGISTRAR:*\n- *Gasto:* \`gastei 50 no mercado ontem no pix\`\n- *Entrada:* \`recebi 1200 do freela na conta\`\n- *Múltiplos:* \`hoje paguei 100 de luz e 50 de internet\`\n\n*PARA CONSULTAR:*\n- *Saldo:* \`qual o saldo de agosto?\`\n- *Gastos:* \`quanto gastei com transporte este mês?\`\n- *Listar:* \`liste meus gastos com mercado\`\n\n*OUTROS COMANDOS:*\n- \`dashboard\` (link do seu painel web)\n- \`criar meta\`\n- \`criar dívida\`\n- \`apagar último gasto\`\n- \`me lembre de pagar a fatura amanhã às 10h\`\n- \`termos\` (termos e privacidade)\n\nÉ só me dizer o que precisa! 😉`;
                    await msg.reply(helpMessage);
                    break;
                }
            }
        } catch (error) {
            metrics.increment('message.error.fatal');
            console.error('❌ Erro fatal ao processar mensagem:', error);
            await msg.reply('Ocorreu um erro interno e a equipe de TI (o Daniel) foi notificada.');
        } finally {
            const totalMs = Date.now() - messageStartedAt;
            metrics.observeDuration('message.total.ms', totalMs);
            if (totalMs >= PERF_WARN_MS) {
                metrics.increment('message.total.slow');
                console.warn(`[perf] handleMessage total ${totalMs}ms (${perfContext})`);
            }
        }
    }
    });
}

module.exports = {
    handleMessage,
    __test__: {
        classifyPerguntaLocally,
        detectFastPerguntaIntent,
        detectLocalCommandIntent,
        shouldSkipAiForUnknownMessage,
        buildLocalPerguntaResponse,
        filterSheetRowsByUserId,
        filterSheetRowsByUserIds,
        buildUserQuestionAliases,
        resolveQuestionUserScope,
        resolveQuestionUserScopeMatch,
        normalizeIntentForQuestionUserScope,
        isGreetingMessage,
        buildGreetingReply,
        buildPreOnboardingInviteMessage,
        inferAnalyticalQueryPlan,
        deriveFollowUpAnalyticalQueryPlan,
        storeAnalyticalContext,
        getAnalyticalContext,
        clearAnalyticalContextForTests,
        buildPersonalCreditCardOptionsFromRows,
        extractMultipleCategoriesFromQuestion,
        extractComparisonCategoriesFromQuestion,
        normalizeInvitePhoneToWhatsAppId,
        normalizeMetricLabel,
        normalizeSettingsCommandText,
        isCheckinSettingsCommand,
        isReserveDisableCommand,
        sanitizeLogText,
        detectSecuritySensitiveRequest,
        summarizeAdminCommandForConfirmation,
        isAdminConfirmationReply,
        getAdminConfirmationKey,
        getPendingAdminConfirmation,
        clearPendingAdminConfirmation,
        setAdminMaintenanceRestartSchedulerForTests,
        resetAdminMaintenanceRestartSchedulerForTests,
        extractFullNameSettingsCommand,
        markFinancialReadModelDirty,
        saveImportedTransactions,
        handleAccountLifecycleCommands,
        handleAdminCommandBeforeAccess,
        buildLegalCommandLogContext
    }
};



