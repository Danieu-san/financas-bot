const { userMap, sheetCategoryMap, creditCardConfig } = require('../config/constants');
const userStateManager = require('../state/userStateManager');
const creationHandler = require('./creationHandler');
const deletionHandler = require('./deletionHandler');
const debtHandler = require('./debtHandler');
const { getStructuredResponseFromLLM, askLLM } = require('../services/gemini');
const { appendRowToSheet, readDataFromSheet, createCalendarEvent } = require('../services/google');
const { getFormattedDate, getFormattedDateOnly, normalizeText, parseSheetDate, parseAmount, parseValue } = require('../utils/helpers');
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
    getUserByLookup,
    getConsentLogsByUserId,
    getAllUsers,
    expireOldPendingUsers
} = require('../services/userService');
const { handleOnboarding } = require('./onboardingHandler');
const { buildHealthSummary } = require('../services/financialHealthService');
const { buildDebtAvalanchePlan } = require('../services/debtAvalancheService');
const { syncReadModelIfNeeded, executeAnalyticalIntent } = require('../services/readModelService');
const metrics = require('../utils/metrics');
const { isAdminWithContext } = require('../utils/adminCheck');
const logger = require('../utils/logger');

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
const monthNamesLower = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthNamesCapitalized = ["Janeiro", "Fevereiro", "Mar�o", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const PERF_WARN_MS = Number.parseInt(process.env.MESSAGE_SLOW_LOG_MS || '4000', 10);

function formatCurrencyBR(value) {
    return 'R$ ' + Number(value || 0).toFixed(2).replace('.', ',');
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
    for (const [name, index] of Object.entries(monthMap)) {
        if (normalized.includes(name)) return index;
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
    const withDe = normalized.match(/\bde\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+em\s+|\s+no\s+|\s+na\s+|$|\?)/i);
    if (withDe && withDe[1]) return withDe[1].trim();
    return '';
}

function detectFastPerguntaIntent(messageBody) {
    const text = normalizeText(String(messageBody || '').trim());
    if (!text) return null;

    const isQuestionShape = /^(qual|quais|quanto|quantos|liste|listar|mostre|mostrar|me diga|como ficou|como esta|como estão)/.test(text) || text.includes('?');
    if (!isQuestionShape) return null;

    const looksAnalytical = /(saldo|gastei|gasto|gastos|entrada|entradas|divida|dividas|categoria|mes|ano|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/.test(text);
    if (!looksAnalytical) return null;

    return {
        intent: 'pergunta',
        question: messageBody
    };
}

function classifyPerguntaLocally(userQuestion) {
    const text = normalizeText(String(userQuestion || '').trim());
    if (!text) return null;

    const mes = parseMonthFromText(text);
    const ano = parseYearFromText(text);

    if (text.includes('saldo')) {
        return { intent: 'saldo_do_mes', parameters: { mes, ano } };
    }
    if (text.includes('media') && (text.includes('gasto') || text.includes('gastos'))) {
        return { intent: 'media_gastos_categoria_mes', parameters: { categoria: extractCategoryFromQuestion(text), mes, ano } };
    }
    if (text.includes('liste') || text.includes('listar') || text.includes('mostre')) {
        return { intent: 'listagem_gastos_categoria', parameters: { categoria: extractCategoryFromQuestion(text), mes, ano } };
    }
    if ((text.includes('quanto') || text.includes('total')) && (text.includes('gastei') || text.includes('gasto') || text.includes('gastos'))) {
        return { intent: 'total_gastos_categoria_mes', parameters: { categoria: extractCategoryFromQuestion(text), mes, ano } };
    }

    return null;
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

    if (intent === 'total_gastos_categoria_mes') {
        const cat = details.categoria || 'categoria informada';
        return `Total gasto com ${cat} em ${periodLabel}: ${formatCurrencyBR(results)}`;
    }

    if (intent === 'media_gastos_categoria_mes') {
        const cat = details.categoria || 'categoria informada';
        return `Média de gastos com ${cat} em ${periodLabel}: ${formatCurrencyBR(results)}`;
    }

    if (intent === 'listagem_gastos_categoria') {
        if (!Array.isArray(results) || results.length === 0) {
            return `Não encontrei gastos para esse filtro em ${periodLabel}.`;
        }
        const lines = results.slice(0, 15).map((row, idx) => {
            const data = row[0] || '-';
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

    if (intent === 'gastos_valores_duplicados') {
        if (!Array.isArray(results) || results.length === 0) {
            return `Não encontrei valores duplicados em ${periodLabel}.`;
        }
        const lines = results.slice(0, 10).map((item, idx) => `${idx + 1}. ${formatCurrencyBR(item.valor)} (${item.count}x)`);
        return `Valores duplicados em ${periodLabel}:\n${lines.join('\n')}`;
    }

    if (intent === 'maior_menor_gasto') {
        const min = results?.min;
        const max = results?.max;
        if (!min && !max) return `Não encontrei gastos para esse período (${periodLabel}).`;
        return [
            `Maior e menor gasto em ${periodLabel}:`,
            `- Maior: ${max ? `${max[1] || '-'} (${formatCurrencyBR(max[4] || 0)})` : '-'}`,
            `- Menor: ${min ? `${min[1] || '-'} (${formatCurrencyBR(min[4] || 0)})` : '-'}`
        ].join('\n');
    }

    return null;
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
            '- Uso condicionado a consentimento por ACEITO.',
            '- Dados tratados: identificacao WhatsApp e lancamentos financeiros enviados.',
            '- Finalidade: operacao do bot, relatorios e auditoria.',
            '- Ciclo de vida: PENDING, ACTIVE, INACTIVE, BLOCKED, DELETED, EXPIRED.',
            '- Mudanca de termos exige novo consentimento.'
        ].join('\n');
        await msg.reply(`${termsLine}\n${privacyLine}\n\n${summary}`);
        return true;
    }

    return false;
}

async function handleSettingsCommands(msg, user) {
    const body = normalizeText(String(msg.body || '').trim());
    if (!body) return false;

    if (body === 'ativar checkin semanal') {
        await upsertUserSettings(user.user_id, { weekly_checkin_opt_in: 'SIM' });
        await msg.reply('Check-in semanal ativado. Enviarei 1 pergunta curta no domingo.');
        return true;
    }
    if (body === 'desativar checkin semanal') {
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
    if (body === 'desativar reserva automatica') {
        await upsertUserSettings(user.user_id, { defaults_enabled: 'NÃO' });
        await msg.reply('Regra automática de reserva desativada.');
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

async function handleAccountLifecycleCommands(msg, user) {
    const body = normalizeText(String(msg.body || '').trim());
    if (!body) return false;

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

async function handleAdminCommands(msg, senderId, activeUser) {
    const rawBody = String(msg.body || '').trim();
    const body = normalizeText(rawBody);
    if (!body.startsWith('admin')) return false;

    const adminContext = {
        sender_id: senderId,
        actor_user_id: activeUser?.user_id || '',
        actor_name: activeUser?.display_name || ''
    };

    if (!isAdminWithContext(senderId, activeUser)) {
        logger.warn(`[admin] acesso_negado command="${body}" context=${JSON.stringify(adminContext)}`);
        await msg.reply('Comando restrito a administradores.');
        return true;
    }

    if (body === 'admin ajuda') {
        logger.info(`[admin] ajuda context=${JSON.stringify(adminContext)}`);
        await msg.reply(
            'Comandos admin:\n' +
            '- admin listar usuarios\n' +
            '- admin status <telefone>\n' +
            '- admin log <telefone>\n' +
            '- admin ativar <telefone>\n' +
            '- admin inativar <telefone>\n' +
            '- admin bloquear <telefone>\n' +
            '- admin deletar <telefone>\n' +
            '- admin expirar pendentes\n' +
            '- admin resetar onboarding <telefone>\n' +
            '- admin mensagem <telefone> <texto>\n' +
            '- admin stats'
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
        logger.info(`[admin] status context=${JSON.stringify({ ...adminContext, target, target_user_id: user.user_id, target_status: user.status })}`);
        await msg.reply(
            `Status do usuário\n` +
            `- whatsapp_id: ${user.whatsapp_id}\n` +
            `- nome: ${user.display_name || 'sem_nome'}\n` +
            `- status: ${user.status}\n` +
            `- user_id: ${user.user_id}\n` +
            `- onboarding_concluido: ${profile?.onboarding_completed_at ? 'SIM' : 'NÃO'}\n` +
            `- checkin_semanal: ${settings?.weekly_checkin_opt_in || 'NÃO'}\n` +
            `- relatorio_mensal: ${settings?.monthly_report_opt_in || 'NÃO'}`
        );
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
            await msg.reply('Usuário não encontrado para esse telefone/WhatsApp ID.');
            return true;
        }
        if (!msg.client || typeof msg.client.sendMessage !== 'function') {
            logger.error(`[admin] mensagem_cliente_indisponivel context=${JSON.stringify({ ...adminContext, target, target_user_id: user.user_id })}`);
            await msg.reply('Cliente WhatsApp indisponível para envio manual.');
            return true;
        }
        await msg.client.sendMessage(user.whatsapp_id, manualText);
        logger.info(`[admin] mensagem context=${JSON.stringify({ ...adminContext, target, target_user_id: user.user_id, target_whatsapp_id: user.whatsapp_id, message_length: manualText.length })}`);
        await msg.reply(`Mensagem enviada para ${user.whatsapp_id}.`);
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
            await msg.reply('Usuário não encontrado para esse telefone/WhatsApp ID.');
            return true;
        }
        logger.info(`[admin] alterar_status context=${JSON.stringify({ ...adminContext, action, target, updated_whatsapp_id: updated.whatsapp_id, updated_status: updated.status })}`);
        await msg.reply(`Status atualizado: ${updated.whatsapp_id} -> ${updated.status}`);
        return true;
    }

    logger.warn(`[admin] comando_desconhecido command="${body}" context=${JSON.stringify(adminContext)}`);
    await msg.reply('Comando admin não reconhecido. Use: admin ajuda');
    return true;
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
    if (!access.allowed) {
        if (access.reply) {
            await msg.reply(access.reply);
        }
        return;
    }

    const activeUser = access.user;
    const userId = activeUser.user_id;
    const pessoa = activeUser.display_name || userMap[senderId] || 'Usuário';

    if (access.justActivated) {
        await msg.reply('Cadastro confirmado com sucesso! Seu acesso foi ativado.');
    }
    if (access.justReconsented) {
        await msg.reply('Termos atualizados e consentimento renovado com sucesso. Obrigado.');
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

    const handledLegal = await handleLegalCommands(msg);
    if (handledLegal) {
        return;
    }

    const handledAdmin = await handleAdminCommands(msg, senderId, activeUser);
    if (handledAdmin) {
        return;
    }

    if (!rateLimiter.isAllowed(senderId)) {
        metrics.increment('message.rate_limited');
        console.log(`Usuário ${senderId} bloqueado pelo rate limit.`);
        return;
    }

    const cacheKey = `${senderId}:${messageBody}`;
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
        metrics.increment('message.cache_hit');
        await msg.reply(cachedResponse);
        return;
    }

    const currentState = userStateManager.getState(senderId);
    if (currentState) {
        // --- INÍCIO DA MÁQUINA DE ESTADOS (CONVERSAS EM ANDAMENTO) ---
        // Se existe uma conversa em andamento, o bot lida com ela e PARA AQUI.
        switch (currentState.action) {
            case 'awaiting_credit_card_selection': {
                const { gasto, cardOptions } = currentState.data;
                const selection = parseInt(msg.body.trim(), 10) - 1;

                if (selection >= 0 && selection < cardOptions.length) {
                    const cardKey = cardOptions[selection];
                    const cardInfo = creditCardConfig[cardKey];

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
                    const purchaseDate = gasto.data ? parseSheetDate(gasto.data) : new Date();
                    if (installments === 1) {
                        let billingMonth = purchaseDate.getMonth();
                        let billingYear = purchaseDate.getFullYear();

                        if (purchaseDate.getDate() > cardInfo.closingDay) {
                            billingMonth += 1;
                            if (billingMonth > 11) {
                                billingMonth = 0;
                                billingYear += 1;
                            }
                        }
                        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                        const billingMonthName = `${monthNames[billingMonth]} de ${billingYear}`;

                        const rowData = [
                            getFormattedDateOnly(purchaseDate), gasto.descricao, gasto.categoria || 'Outros',
                            parseFloat(gasto.valor), '1/1', billingMonthName, userId
                        ];
                        
                        await appendRowToSheet(cardInfo.sheetName, rowData);
                        await msg.reply(`✅ Gasto de R$${gasto.valor} lançado no *${cardInfo.sheetName}* (fatura de ${billingMonthName}).`);
                    } else {
                        const installmentValue = parseFloat(gasto.valor) / installments;
                        for (let i = 1; i <= installments; i++) {
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
                                 String(installmentValue.toFixed(2)).replace('.',','), `${i}/${installments}`, billingMonthName, userId
                             ];
                             
                             await appendRowToSheet(cardInfo.sheetName, rowData);
                        }
                        await msg.reply(`✅ Gasto de R$${gasto.valor} lançado em ${installments}x de R$${installmentValue.toFixed(2)} no *${cardInfo.sheetName}*.`);
                    }
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
                    const cardOptions = Object.keys(creditCardConfig);
                    let question = `Ok, crédito. Em qual cartão? Responda com o número:\n\n`;
                    cardOptions.forEach((cardName, index) => {
                        question += `${index + 1}. ${cardName}\n`;
                    });
                    userStateManager.setState(senderId, {
                        action: 'awaiting_credit_card_selection',
                        data: { gasto: { ...gasto, pagamento: 'Crédito' }, cardOptions }
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

                const valorNumerico = parseFloat(gasto.valor);
                const rowData = [
                    dataFinal, gasto.descricao || 'Não especificado', gasto.categoria || 'Outros',
                    gasto.subcategoria || '', valorNumerico, pessoa, gasto.pagamento,
                    gasto.recorrente || 'Não', gasto.observacoes || '', userId
                ];
                await appendRowToSheet('Saídas', rowData);

                // MENSAGEM DE SUCESSO MELHORADA
                await msg.reply(`✅ Gasto de R$${valorNumerico.toFixed(2)} (${gasto.descricao}) registrado como *${gasto.pagamento}* para a data de *${dataFinal}*!`);
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
                const valorNumerico = parseFloat(entrada.valor);

                const rowData = [
                    dataDaEntrada, entrada.descricao || 'Não especificado',
                    entrada.categoria || 'Outros', valorNumerico, pessoa,
                    entrada.recebimento, entrada.recorrente || 'Não', entrada.observacoes || '', userId
                ];

                await appendRowToSheet('Entradas', rowData);
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

            case 'confirming_transactions': {
                const cleanReply = normalizeText(msg.body);
                if (cleanReply === 'sim') {
                    // Agora, em vez de registrar, vamos para a próxima etapa
                    const { transactions } = currentState.data;
                    userStateManager.setState(senderId, {
                        action: 'awaiting_batch_payment_method',
                        data: { transactions } // Passamos as transações para o próximo estado
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
                    const cardOptions = Object.keys(creditCardConfig);
                    let question = `Ok, crédito. Em qual cartão? Responda com o número:\n\n`;
                    cardOptions.forEach((cardName, index) => {
                        question += `${index + 1}. ${cardName}\n`;
                    });

                    userStateManager.setState(senderId, {
                        action: 'awaiting_credit_card_selection_batch', // Novo estado!
                        data: { transactions }
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

                        if (sheetName === 'Saídas') {
                            const dataDoGasto = item.data ? parseSheetDate(item.data) : new Date();
                            rowData = [
                                getFormattedDateOnly(dataDoGasto), item.descricao || 'Não especificado', item.categoria || 'Outros',
                                item.subcategoria || '', parseFloat(item.valor), person, item.pagamento || '',
                                item.recorrente || 'Não', item.observacoes || '', userId
                            ];
                        } else if (sheetName === 'Entradas') {
                            const dataDaEntrada = item.data ? parseSheetDate(item.data) : new Date();
                            rowData = [
                                getFormattedDateOnly(dataDaEntrada), item.descricao || 'Não especificado',
                                item.categoria || 'Outros', parseFloat(item.valor), person,
                                item.recebimento || '', item.recorrente || 'Não', item.observacoes || '', userId
                            ];
                        }
                        
                        if (rowData.length > 0) {
                            await appendRowToSheet(sheetName, rowData);
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
                const { transactions } = currentState.data;
                const cardOptions = Object.keys(creditCardConfig);
                const selection = parseInt(msg.body.trim(), 10) - 1;

                if (selection >= 0 && selection < cardOptions.length) {
                    const cardKey = cardOptions[selection];
                    const cardInfo = creditCardConfig[cardKey];

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

                    const installmentValue = parseFloat(gasto.valor) / numParcelas;
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
                            installmentValue.toFixed(2), `${i}/${numParcelas}`, billingMonthName, userId
                        ];
                        
                        await appendRowToSheet(cardInfo.sheetName, rowData);
                    }
                }

                await msg.reply(`✅ Lançamentos no crédito finalizados com sucesso!`);
                userStateManager.deleteState(senderId);
                return;
            }
        }
    } else {
        // --- INÍCIO DA ANÁLISE DE NOVOS COMANDOS ---
        console.log(`Mensagem de ${pessoa} (${senderId}): "${messageBody}"`);
        try {
            // CÓDIGO PARA SUBSTITUIR (APENAS A CONSTANTE masterPrompt)

            let structuredResponse = detectFastPerguntaIntent(messageBody);
            if (structuredResponse) {
                logger.info(`[routing] fast_path intent=pergunta sender=${senderId} msg="${messageBody}"`);
            }

            if (!structuredResponse) {
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
                logger.info(`[routing] override_intent resumo->pergunta sender=${senderId} msg="${messageBody}"`);
                structuredResponse.intent = 'pergunta';
                if (!structuredResponse.question) {
                    structuredResponse.question = messageBody;
                }
            }

            switch (structuredResponse.intent) {
                case 'resumo': {
                    await msg.reply('Gerando seu resumo financeiro com saúde de caixa...');
                    try {
                        const sheetReads = [
                            readDataFromSheet('Saídas!A:J'),
                            readDataFromSheet('Entradas!A:I'),
                            readDataFromSheet('Dívidas!A:R'),
                            readDataFromSheet('Metas!A:I')
                        ];

                        const cardSheetNames = Object.values(creditCardConfig).map(card => card.sheetName);
                        cardSheetNames.forEach(sheetName => {
                            sheetReads.push(readDataFromSheet(sheetName + '!A:G'));
                        });

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
                            '- Progresso: ' + health.reserveProgressPct.toFixed(1) + '%'
                        ].join('\n');

                        let avalancheMessage = '';
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
                                '- Economia estimada de juros: ' + formatCurrencyBR(avalanchePlan.interestSaved)
                            ].join('\n');
                        }

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
                        const pagamento = normalizeText(item.pagamento || '');

                        if (item.type === 'Saídas' && pagamento === 'credito') {
                            const cardOptions = Object.keys(creditCardConfig);
                            let question = `Entendi, o gasto foi no crédito. Em qual cartão? Responda com o número:\n\n`;
                            cardOptions.forEach((cardName, index) => {
                                question += `${index + 1}. ${cardName}\n`;
                            });
                            userStateManager.setState(senderId, {
                                action: 'awaiting_credit_card_selection',
                                data: { gasto: item, cardOptions: cardOptions }
                            });
                            await msg.reply(question);
                            return; 
                        }
                    if (item.type === 'Saídas' && !item.pagamento) {
                        const dataDoGasto = item.data ? parseSheetDate(item.data) : new Date();
                        userStateManager.setState(senderId, {
                            action: 'awaiting_payment_method',
                            // A estrutura de dados correta é um objeto com a propriedade 'gasto'
                            data: {
                                gasto: item,
                                dataFinal: getFormattedDateOnly(dataDoGasto)
                            }
                        });
                        await msg.reply('Entendido! E qual foi a forma de pagamento? (Crédito, Débito, PIX ou Dinheiro)');
                        return;
                    }

                        if (item.type === 'Entradas' && !item.recebimento) {
                            userStateManager.setState(senderId, { action: 'awaiting_receipt_method', data: item });
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
                        data: { transactions: allTransactions, person: pessoa }
                    });
                    await msg.reply(confirmationMessage);
                    break;
                }

                case 'pergunta': {
                    await msg.reply("Analisando seus dados para responder, um momento...");
                    try {
                        const userQuestion = structuredResponse.question || messageBody;
                        const localClassification = classifyPerguntaLocally(userQuestion);
                        const intentClassification = localClassification || await timeStep(
                            'classify(userQuestion)',
                            () => classify(userQuestion),
                            perfContext
                        );
                        if (localClassification) {
                            logger.info(`[routing] local_classification intent=${localClassification.intent} sender=${senderId}`);
                        }

                        let analyzedData = null;
                        let usedReadModel = false;
                        try {
                            await timeStep(
                                'readModel.sync',
                                () => syncReadModelIfNeeded(),
                                perfContext
                            );
                            analyzedData = await timeStep(
                                'readModel.execute',
                                () => executeAnalyticalIntent(
                                    intentClassification.intent,
                                    intentClassification.parameters,
                                    { userId }
                                ),
                                perfContext
                            );
                            usedReadModel = true;
                        } catch (readModelError) {
                            logger.warn(`[read-model] fallback legacy execute. motivo=${readModelError.message}`);
                        }

                        if (!analyzedData) {
                            const sheetReads = [
                                readDataFromSheet('Saídas!A:I'),
                                readDataFromSheet('Entradas!A:H'),
                                readDataFromSheet('Metas!A:L'),
                                readDataFromSheet('Dívidas!A:N')
                            ];
                            const cardSheetNames = Object.values(creditCardConfig).map(card => card.sheetName);
                            cardSheetNames.forEach(sheetName => {
                                sheetReads.push(readDataFromSheet(`${sheetName}!A:F`));
                            });
                            const allSheetData = await timeStep(
                                'pergunta.Promise.all(sheetReads)',
                                () => Promise.all(sheetReads),
                                perfContext
                            );

                            const [saidasData, entradasData, metasData, dividasData] = allSheetData;
                            const creditCardData = allSheetData.slice(4);
                            analyzedData = await timeStep(
                                'execute(intent)',
                                () => execute(
                                    intentClassification.intent,
                                    intentClassification.parameters,
                                    {
                                        saidas: saidasData,
                                        entradas: entradasData,
                                        metas: metasData,
                                        dividas: dividasData,
                                        cartoes: creditCardData
                                    }
                                ),
                                perfContext
                            );
                        }

                        let respostaFinal = buildLocalPerguntaResponse({
                            userQuestion,
                            intent: intentClassification.intent,
                            analyzedData
                        });
                        if (!respostaFinal) {
                            respostaFinal = await timeStep(
                                'generate(response)',
                                () => generate({
                                    userQuestion,
                                    intent: intentClassification.intent,
                                    rawResults: analyzedData.results,
                                    details: analyzedData.details,
                                    dateContext: {
                                        currentMonth: new Date().getMonth(),
                                        currentYear: new Date().getFullYear()
                                    },
                                    source: usedReadModel ? 'read_model' : 'legacy'
                                }),
                                perfContext
                            );
                        } else {
                            logger.info(`[routing] local_response intent=${intentClassification.intent} sender=${senderId}`);
                        }
                    
                        cache.set(cacheKey, respostaFinal);
                        await msg.reply(respostaFinal);

                    } catch (err) {
                        console.error("Erro no novo sistema de perguntas:", err);
                        await msg.reply("Desculpe, não consegui processar essa análise. Tente reformular a pergunta.");
                    }
                    break;
                }

                case 'criar_lembrete': {
                    const lembrete = structuredResponse.lembreteDetails;
                    if (!lembrete || !lembrete.titulo || !lembrete.dataHora) {
                        await msg.reply("Não entendi os detalhes do lembrete. Por favor, inclua o que e quando (ex: 'me lembre de pagar a luz amanhã às 10h').");
                        break;
                    }
                    try {
                        await createCalendarEvent(lembrete.titulo, lembrete.dataHora, lembrete.recorrencia);
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
                    console.log(`Intenção desconhecida para a mensagem: "${messageBody}". Nenhuma resposta enviada.`);
                    break;
                }

                case 'ajuda': {
                    const helpMessage = `Olá! Eu sou seu assistente financeiro. Veja como posso te ajudar:\n\n*PARA REGISTRAR:*\n- *Gasto:* \`gastei 50 no mercado ontem no pix\`\n- *Entrada:* \`recebi 1200 do freela na conta\`\n- *Múltiplos:* \`hoje paguei 100 de luz e 50 de internet\`\n\n*PARA CONSULTAR:*\n- *Saldo:* \`qual o saldo de agosto?\`\n- *Gastos:* \`quanto gastei com transporte este mês?\`\n- *Listar:* \`liste meus gastos com mercado\`\n\n*OUTROS COMANDOS:*\n- \`criar meta\`\n- \`criar dívida\`\n- \`apagar último gasto\`\n- \`me lembre de pagar a fatura amanhã às 10h\`\n- \`termos\` (termos e privacidade)\n\nÉ só me dizer o que precisa! 😉`;
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
}

module.exports = { handleMessage };



