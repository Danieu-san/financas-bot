const analysisService = require('./analysisService');
const { parseSheetDate, normalizeText, parseValue } = require('../utils/helpers');
const { matchesAnyField } = require('../utils/textMatcher');
const { creditCardConfig } = require('../config/constants');
const { legacyIntentToQueryPlan } = require('../query/financialQueryPlan');
const { executeFinancialQuery } = require('../query/financialQueryEngine');

const FINANCIAL_QUERY_ENGINE_PRIMARY_INTENTS = new Set([
    'total_gastos_mes',
    'total_gastos_categoria_mes',
    'media_gastos_categoria_mes',
    'total_gastos_multiplas_categorias',
    'percentual_categoria_gastos',
    'comparacao_gastos_categorias',
    'listagem_gastos_mes',
    'listagem_gastos_categoria',
    'contagem_ocorrencias',
    'maior_menor_gasto',
    'maior_menor_gasto_categoria',
    'ranking_categorias_gastos',
    'tendencia_gastos_mensal',
    'comparacao_gastos_periodo',
    'detalhamento_gastos_mes',
    'ranking_estabelecimentos_gastos',
    'total_entradas_mes',
    'total_entradas_categoria_mes',
    'listagem_entradas_mes',
    'detalhamento_entradas_mes',
    'ranking_fontes_entradas',
    'ranking_formas_recebimento',
    'maior_menor_entrada',
    'contagem_entradas_mes',
    'media_entradas_mes',
    'percentual_categoria_entradas',
    'comparacao_entradas_periodo',
    'tendencia_entradas_mensal',
    'total_fatura_cartao',
    'total_faturas_por_cartao',
    'detalhamento_cartao_mes',
    'total_cartoes_em_aberto',
    'ranking_cartoes_em_aberto',
    'resumo_parcelamentos_cartao',
    'maior_menor_compra_cartao',
    'saldo_compra_parcelada_cartao',
    'total_transferencias_mes',
    'listagem_transferencias_mes',
    'total_reserva_aplicada_mes',
    'total_reserva_resgatada_mes',
    'total_reserva_liquida_mes',
    'total_transferencias_contas_mes',
    'total_transferencias_familia_mes',
    'transferencia_familiar_eh_gasto',
    'total_pagamentos_fatura_mes',
    'saldo_disponivel_estimado',
    'dashboard_explicacao',
    'dashboard_detalhe',
    'dashboard_comparacao',
    'dashboard_ranking',
    'dashboard_detectar',
    'orcamento_disponivel_hoje',
    'orcamento_usado_ciclo',
    'orcamento_explicacao',
    'orcamento_ritmo_diario',
    'orcamento_restante_ciclo',
    'orcamento_escopo',
    'resumo_metas',
    'progresso_metas',
    'historico_meta',
    'total_aportes_meta',
    'total_retiradas_meta',
    'metas_por_status',
    'ranking_metas',
    'media_progresso_metas',
    'percentual_meta',
    'comparacao_metas',
    'explicacao_meta',
    'total_dividas',
    'saldo_divida',
    'parcelas_dividas_mes',
    'dividas_vencendo',
    'dividas_atrasadas',
    'dividas_quitadas',
    'ranking_dividas_juros',
    'ranking_dividas_vencimento',
    'ranking_dividas_saldo',
    'prioridade_dividas',
    'explicacao_dividas',
    'resumo_contas_recorrentes',
    'contas_vencendo',
    'status_conta_recorrente',
    'total_contas_recorrentes',
    'comparacao_contas_realizado',
    'contas_pendentes',
    'explicacao_conta_recorrente'
]);

const getMonthIndex = (monthInput) => {
    if (monthInput === null || monthInput === undefined) return null;
    if (typeof monthInput === 'number' && monthInput >= 0 && monthInput <= 11) return monthInput;
    const numericMonth = parseInt(monthInput, 10);
    if (!isNaN(numericMonth) && numericMonth >= 0 && numericMonth <= 11) return numericMonth;
    const months = { 'janeiro': 0, 'fevereiro': 1, 'março': 2, 'marco': 2, 'abril': 3, 'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11 };
    const normalizedStr = normalizeText(String(monthInput).toLowerCase().trim());
    return months[normalizedStr] !== undefined ? months[normalizedStr] : null;
};

const getUnifiedExpenses = (dataSources, mes, ano) => {
    const saidasLimpo = dataSources.saidas.slice(1);
    let unifiedList = saidasLimpo.map(row => ({
        data: row[0],
        descricao: row[1],
        categoria: row[2],
        subcategoria: row[3],
        valor: row[4],
        origem: 'Saídas',
        tipo: 'saida',
        pagamento: row[6] || '',
        cartao: '',
        parcela: '',
        mesCobranca: ''
    }));

    if (dataSources.cartoes) {
        dataSources.cartoes.forEach(cardSheetData => {
            if (!cardSheetData || cardSheetData.length <= 1) return;
            const cardExpenses = cardSheetData.slice(1).map(row => ({
                data: row[0],
                descricao: row[1],
                categoria: row[2],
                subcategoria: 'Cartão de Crédito',
                valor: row[3],
                origem: 'Cartão',
                tipo: 'cartao',
                pagamento: 'Crédito',
                parcela: row[4] || '',
                mesCobranca: row[5] || '',
                cardId: row.length >= 10 ? row[6] || '' : '',
                cartao: row.length >= 10 ? row[7] || row[6] || '' : ''
            }));
            unifiedList.push(...cardExpenses);
        });
    }

    return unifiedList.filter(item => {
        const itemDate = parseSheetDate(item.data);
        if (!itemDate) return false;
        
        const isMonthMatch = (mes !== null) ? itemDate.getMonth() === mes : true;
        const isYearMatch = itemDate.getFullYear() === ano;
        
        return isMonthMatch && isYearMatch;
    });
};

async function executeLegacyExpenseQueryIntent(intent, params = {}, dataSources = {}) {
    const mapped = params.financialQueryPlan
        ? { ok: true, plan: params.financialQueryPlan }
        : legacyIntentToQueryPlan(intent, params);
    if (!mapped.ok) return null;

    const execution = await executeFinancialQuery(mapped.plan, dataSources);
    if (!execution.ok) return null;

    const value = execution.result?.value;
    const mes = getMonthIndex(params.mes);
    const ano = parseInt(params.ano, 10);
    const { financialQueryPlan: _ignoredPlan, ...safeParams } = params || {};

    const publicItemToLegacyRow = (item = {}) => ([
        item.date || '',
        item.description || '',
        item.category || 'Outros',
        item.subcategory || '',
        Number(item.value || 0),
        '',
        item.paymentMethod || '',
        '',
        ''
    ]);

    const publicIncomeItem = (item = {}) => ({
        data: item.date || '',
        descricao: item.description || '',
        categoria: item.category || 'Entrada',
        valor: Number(item.value || 0),
        recebimento: item.paymentMethod || '',
        recorrente: item.recurrence || ''
    });

    const publicTransferItem = (item = {}) => ({
        data: item.date || '',
        descricao: item.description || '',
        valor: Number(item.value || 0),
        origem: item.from || '',
        destino: item.to || '',
        metodo: item.paymentMethod || '',
        status: item.status || item.transferType || ''
    });

    const incomeDetails = {
        ...safeParams,
        mes,
        ano,
        totalEntradas: Number(execution.result?.details?.total || 0),
        totalLancamentos: execution.result?.details?.count || 0,
        criterioEntrada: execution.plan?.timeBasis || 'transaction_date',
        timeBasis: execution.plan?.timeBasis || 'transaction_date'
    };

    const incomeIntents = new Set([
        'total_entradas_mes',
        'total_entradas_categoria_mes',
        'listagem_entradas_mes',
        'detalhamento_entradas_mes',
        'ranking_fontes_entradas',
        'ranking_formas_recebimento',
        'maior_menor_entrada',
        'contagem_entradas_mes',
        'media_entradas_mes',
        'percentual_categoria_entradas',
        'comparacao_entradas_periodo',
        'tendencia_entradas_mensal'
    ]);

    if (incomeIntents.has(intent)) {
        if (intent === 'total_entradas_mes') {
            return { results: Number(value || 0), details: { ...incomeDetails, totalEntradas: Number(value || 0) } };
        }
        if (intent === 'total_entradas_categoria_mes') {
            const denominatorMapped = legacyIntentToQueryPlan('total_entradas_mes', params);
            const denominatorExecution = denominatorMapped.ok ? await executeFinancialQuery(denominatorMapped.plan, dataSources) : null;
            return {
                results: Number(value || 0),
                details: {
                    ...incomeDetails,
                    totalCategoria: Number(value || 0),
                    totalEntradas: Number(denominatorExecution?.result?.value ?? value ?? 0)
                }
            };
        }
        if (intent === 'listagem_entradas_mes') {
            return {
                results: Array.isArray(value) ? value.map(publicIncomeItem) : [],
                details: incomeDetails
            };
        }
        if (intent === 'detalhamento_entradas_mes') {
            const payload = value || {};
            return {
                results: {
                    total: Number(payload.total || 0),
                    count: Number(payload.count || 0),
                    categorias: payload.groups?.category || [],
                    formas: payload.groups?.paymentMethod || [],
                    lancamentos: Array.isArray(payload.items) ? payload.items.map(publicIncomeItem) : []
                },
                details: { ...incomeDetails, totalEntradas: Number(payload.total || 0), totalLancamentos: Number(payload.count || 0) }
            };
        }
        if (intent === 'ranking_fontes_entradas' || intent === 'ranking_formas_recebimento') {
            const rows = Array.isArray(value) ? value : [];
            return {
                results: rows.map(item => ({
                    label: item.label || 'Entrada',
                    categoria: item.label || 'Entrada',
                    total: Number(item.total || 0),
                    count: Number(item.count || 0)
                })),
                details: incomeDetails
            };
        }
        if (intent === 'maior_menor_entrada') {
            return {
                results: {
                    min: value?.min ? publicIncomeItem(value.min) : null,
                    max: value?.max ? publicIncomeItem(value.max) : null
                },
                details: incomeDetails
            };
        }
        if (intent === 'contagem_entradas_mes' || intent === 'media_entradas_mes') {
            return { results: Number(value || 0), details: incomeDetails };
        }
        if (intent === 'percentual_categoria_entradas') {
            const result = value || {};
            return {
                results: Number(result.percent || 0),
                details: {
                    ...incomeDetails,
                    totalCategoria: Number(result.part || 0),
                    totalEntradas: Number(result.total || 0)
                }
            };
        }
        if (intent === 'comparacao_entradas_periodo') {
            return {
                results: {
                    atual: Number(value?.current || 0),
                    anterior: Number(value?.previous || 0),
                    diferenca: Number(value?.difference || 0),
                    percentual: Number(value?.percent || 0)
                },
                details: {
                    ...incomeDetails,
                    mesAnterior: mapped.plan?.filters?.period?.month === 0 ? 11 : Number(mapped.plan?.filters?.period?.month || 0) - 1,
                    anoAnterior: mapped.plan?.filters?.period?.month === 0 ? ano - 1 : ano
                }
            };
        }
        if (intent === 'tendencia_entradas_mensal') {
            const rows = Array.isArray(value) ? value : [];
            return {
                results: rows,
                details: {
                    ...incomeDetails,
                    totalEntradas: execution.result?.details?.total || 0
                }
            };
        }
    }

    const transferDetails = {
        ...safeParams,
        mes,
        ano,
        totalTransferencias: Number(execution.result?.details?.total || 0),
        totalLancamentos: execution.result?.details?.count || 0,
        criterioTransferencia: execution.plan?.timeBasis || 'transaction_date',
        timeBasis: execution.plan?.timeBasis || 'transaction_date'
    };

    const transferIntents = new Set([
        'total_transferencias_mes',
        'listagem_transferencias_mes',
        'total_reserva_aplicada_mes',
        'total_reserva_resgatada_mes',
        'total_reserva_liquida_mes',
        'total_transferencias_contas_mes',
        'total_transferencias_familia_mes',
        'transferencia_familiar_eh_gasto',
        'total_pagamentos_fatura_mes',
        'saldo_disponivel_estimado'
    ]);

    if (transferIntents.has(intent)) {
        if (intent === 'listagem_transferencias_mes') {
            return {
                results: Array.isArray(value) ? value.map(publicTransferItem) : [],
                details: transferDetails
            };
        }
        if (intent === 'saldo_disponivel_estimado') {
            const summary = value || {};
            return {
                results: Number(summary.availableEstimate || 0),
                details: {
                    ...transferDetails,
                    saldo: Number(summary.balance || 0),
                    totalEntradas: Number(summary.income || 0),
                    totalSaidas: Number(summary.spending || 0),
                    reservaAplicada: Number(summary.reserveApplied || 0),
                    reservaResgatada: Number(summary.reserveRedeemed || 0),
                    reservaLiquida: Number(summary.reserveNet || 0),
                    pagamentosFatura: Number(summary.invoicePayments || 0),
                    transferenciasInternas: Number(summary.internalTransfers || 0),
                    explicacao: summary.explanation || ''
                }
            };
        }
        if (intent === 'transferencia_familiar_eh_gasto') {
            return {
                results: value || { total: 0, isExpense: false, explanation: '' },
                details: transferDetails
            };
        }
        if (intent === 'total_pagamentos_fatura_mes') {
            return {
                results: Number(value || 0),
                details: {
                    ...transferDetails,
                    pagamentos: execution.result?.details?.count || 0,
                    canGroupByCard: false
                }
            };
        }
        return {
            results: Number(value || 0),
            details: transferDetails
        };
    }

    const dashboardIntents = new Set([
        'dashboard_explicacao',
        'dashboard_detalhe',
        'dashboard_comparacao',
        'dashboard_ranking',
        'dashboard_detectar'
    ]);

    if (dashboardIntents.has(intent)) {
        const summary = value || {};
        return {
            results: summary,
            details: {
                ...safeParams,
                mes,
                ano,
                timeBasis: execution.plan?.timeBasis || 'transaction_date',
                criterioDashboard: execution.result?.details?.timeBasis || execution.plan?.timeBasis || 'transaction_date',
                total: Number(execution.result?.details?.total || summary.balance || 0),
                totalEntradas: Number(summary.income || summary.totalEntradas || 0),
                totalSaidas: Number(summary.outputs || summary.spending || summary.totalSaidas || 0),
                totalCartoes: Number(summary.cards || summary.totalCartoes || 0),
                saldo: Number(summary.balance || 0),
                disponivel: Number(summary.availableEstimate || summary.available || 0),
                reservaLiquida: Number(summary.reserveNet || 0),
                transferenciasInternas: Number(summary.internalTransfers || 0)
            }
        };
    }

    const budgetIntents = new Set([
        'orcamento_disponivel_hoje',
        'orcamento_usado_ciclo',
        'orcamento_explicacao',
        'orcamento_ritmo_diario',
        'orcamento_restante_ciclo',
        'orcamento_escopo'
    ]);

    if (budgetIntents.has(intent)) {
        return {
            results: value || {},
            details: {
                ...safeParams,
                timeBasis: execution.plan?.timeBasis || 'budget_cycle',
                criterioOrcamento: execution.plan?.timeBasis || 'budget_cycle',
                totalGastoLivre: Number(value?.cycleSpent || 0),
                gastoHoje: Number(value?.todaySpent || 0),
                restanteCiclo: Number(value?.remainingInCycle || 0),
                ritmoDiario: Number(value?.dailyRecommendedAmount || 0),
                escopo: value?.scope || execution.plan?.filters?.scope || ''
            }
        };
    }

    const goalIntents = new Set([
        'resumo_metas',
        'progresso_metas',
        'historico_meta',
        'total_aportes_meta',
        'total_retiradas_meta',
        'metas_por_status',
        'ranking_metas',
        'media_progresso_metas',
        'percentual_meta',
        'comparacao_metas',
        'explicacao_meta'
    ]);
    if (goalIntents.has(intent)) {
        const publicGoal = (item = {}) => ({
            nome: item.description || '',
            alvo: Number(item.target || 0),
            atual: Number(item.current ?? item.value ?? 0),
            falta: Number(item.missing || 0),
            progressoPct: Number(item.progressPercent || 0),
            valorMensal: Number(item.monthlyRequired || 0),
            status: item.status || '',
            escopo: item.scope || '',
            data: item.date || '',
            tipo: item.movementType || '',
            valor: Number(item.value || 0),
            valorAntes: Number(item.valueBefore || 0),
            valorDepois: Number(item.valueAfter || 0),
            observacao: item.subcategory || ''
        });
        const summary = value && !Array.isArray(value) ? value : {};
        const goalItems = Array.isArray(value) ? value : (summary.items || []);
        const publicValue = Array.isArray(value)
            ? value.map(publicGoal)
            : (summary.items && ['progresso_metas', 'explicacao_meta'].includes(intent)
                ? summary.items.map(publicGoal)
                : (summary.items ? { ...summary, items: summary.items.map(publicGoal), movements: (summary.movements || []).map(publicGoal) } : value));
        return {
            results: publicValue,
            details: {
                ...safeParams,
                timeBasis: execution.plan?.timeBasis,
                criterioMetas: execution.result?.details?.criteria || summary.criteria || '',
                total: Number(summary.count || execution.result?.details?.count || goalItems.length),
                ativas: Number(summary.activeCount ?? goalItems.filter(item => item.active).length),
                totalAlvo: Number(summary.totals?.target ?? goalItems.reduce((sum, item) => sum + Number(item.target || 0), 0)),
                totalAtual: Number(summary.totals?.current ?? goalItems.reduce((sum, item) => sum + Number(item.current || 0), 0)),
                totalFalta: Number(summary.totals?.missing ?? goalItems.filter(item => item.active).reduce((sum, item) => sum + Number(item.missing || 0), 0)),
                totalValorMensal: Number(summary.totals?.monthlyRequired ?? goalItems.filter(item => item.active).reduce((sum, item) => sum + Number(item.monthlyRequired || 0), 0)),
                movements: (summary.movements || []).map(publicGoal),
                movementTotals: summary.movementTotals || {}
            }
        };
    }

    const debtIntents = new Set([
        'total_dividas',
        'saldo_divida',
        'parcelas_dividas_mes',
        'dividas_vencendo',
        'dividas_atrasadas',
        'dividas_quitadas',
        'ranking_dividas_juros',
        'ranking_dividas_vencimento',
        'ranking_dividas_saldo',
        'prioridade_dividas',
        'explicacao_dividas'
    ]);
    if (debtIntents.has(intent)) {
        const publicDebt = (item = {}) => ({
            nome: item.description || '',
            credor: item.subcategory || '',
            tipo: item.category || '',
            saldoAtual: Number(item.value || 0),
            valorOriginal: Number(item.originalValue || 0),
            valorPago: Number(item.paidAmount || 0),
            progressoPct: Number(item.progressPercent || 0),
            parcela: Number(item.installmentValue || 0),
            jurosPct: Number(item.interestRatePct || 0),
            vencimentoDia: item.dueDay || '',
            proximoVencimento: item.nextDueDate || item.date || '',
            atrasoDias: Number(item.overdueDays || 0),
            status: item.status || ''
        });
        const summary = value && !Array.isArray(value) ? value : {};
        const publicValue = Array.isArray(value)
            ? value.map(publicDebt)
            : (summary.items ? { ...summary, items: summary.items.map(publicDebt), ranking: (summary.ranking || []).map(publicDebt), item: summary.item ? publicDebt(summary.item) : null } : value);
        return {
            results: publicValue,
            details: {
                ...safeParams,
                timeBasis: execution.plan?.timeBasis || 'due_date',
                criterioDividas: execution.result?.details?.criteria || summary.criteria || '',
                total: Number(summary.totalBalance ?? execution.result?.details?.total ?? 0),
                activeCount: Number(summary.activeCount ?? execution.result?.details?.activeCount ?? 0),
                paidCount: Number(summary.paidCount ?? execution.result?.details?.paidCount ?? 0),
                overdueCount: Number(summary.overdueCount ?? execution.result?.details?.overdueCount ?? 0),
                paidAmount: Number(summary.paidAmount ?? execution.result?.details?.paidAmount ?? 0)
            }
        };
    }

    const billIntents = new Set([
        'resumo_contas_recorrentes',
        'contas_vencendo',
        'status_conta_recorrente',
        'total_contas_recorrentes',
        'comparacao_contas_realizado',
        'contas_pendentes',
        'explicacao_conta_recorrente'
    ]);
    if (billIntents.has(intent)) {
        const publicBill = (item = {}) => ({
            data: item.date || '',
            nome: item.description || '',
            categoria: item.category || '',
            subcategoria: item.subcategory || '',
            valorEsperado: Number(item.expectedValue ?? item.value ?? 0),
            valorRealizado: Number(item.realizedValue || 0),
            valorPendente: Number(item.pendingValue || 0),
            status: item.status || '',
            dia: item.dueDay || '',
            ativa: normalizeText(item.ruleActive || '') === 'sim'
        });
        const summary = value && !Array.isArray(value) ? value : {};
        const publicValue = Array.isArray(value)
            ? value.map(publicBill)
            : (summary.items ? { ...summary, items: summary.items.map(publicBill) } : value);
        return {
            results: publicValue,
            details: {
                ...safeParams,
                timeBasis: execution.plan?.timeBasis || 'due_date',
                criterioContas: execution.result?.details?.criteria || summary.criteria || '',
                totals: execution.result?.details?.totals || summary.totals || {},
                total: intent === 'resumo_contas_recorrentes'
                    ? Number(execution.result?.details?.count || 0)
                    : Number(execution.result?.details?.total || 0),
                count: Number(execution.result?.details?.count || 0),
                regrasAtivas: Number(execution.result?.details?.rulesActive || 0),
                lembretes: Number(execution.result?.details?.count || 0)
            }
        };
    }

    if (intent === 'total_gastos_mes' || intent === 'total_gastos_categoria_mes' || intent === 'total_gastos_multiplas_categorias') {
        return {
            results: Number(value || 0),
            details: {
                ...safeParams,
                mes,
                ano,
                totalSaidas: Number(execution.result?.details?.totals?.outputs || 0),
                totalCartoes: Number(execution.result?.details?.totals?.cards || 0),
                totalGastos: Number(value || 0),
                criterioCartao: execution.plan?.timeBasis || 'billing_month'
            }
        };
    }

    if (intent === 'media_gastos_categoria_mes') {
        return {
            results: Number(value || 0),
            details: {
                ...safeParams,
                mes,
                ano,
                totalGastos: execution.result?.details?.total || 0,
                totalLancamentos: execution.result?.details?.count || 0
            }
        };
    }

    if (intent === 'listagem_gastos_categoria' || intent === 'listagem_gastos_mes') {
        return {
            results: Array.isArray(value) ? value.map(publicItemToLegacyRow) : [],
            details: { ...safeParams, mes, ano }
        };
    }

    if (intent === 'comparacao_gastos_categorias') {
        const rows = Array.isArray(value?.items) ? value.items : [];
        return {
            results: {
                categorias: rows.map(item => ({
                    categoria: item.label || 'Outros',
                    total: Number(item.total || 0)
                }))
            },
            details: { ...safeParams, mes, ano }
        };
    }

    if (intent === 'comparacao_gastos_periodo') {
        return {
            results: {
                atual: Number(value?.current || 0),
                anterior: Number(value?.previous || 0),
                diferenca: Number(value?.difference || 0),
                percentual: Number(value?.percent || 0)
            },
            details: {
                ...safeParams,
                mes,
                ano,
                mesAnterior: mapped.plan?.filters?.period?.month === 0 ? 11 : Number(mapped.plan?.filters?.period?.month || 0) - 1,
                anoAnterior: mapped.plan?.filters?.period?.month === 0 ? ano - 1 : ano
            }
        };
    }

    if (intent === 'gastos_valores_duplicados') {
        return {
            results: Array.isArray(value) ? value.map(item => ({
                valor: item.total,
                count: item.count,
                itens: [item.label]
            })) : [],
            details: { ...safeParams, mes, ano }
        };
    }

    if (intent === 'percentual_categoria_gastos') {
        const result = value || {};
        return {
            results: Number(result.percent || 0),
            details: {
                ...safeParams,
                mes,
                ano,
                totalCategoria: Number(result.part || 0),
                totalGastos: Number(result.total || 0),
                totalCartoes: Number(execution.result?.details?.denominatorTotals?.cards || 0),
                criterioCartao: execution.plan?.timeBasis || 'billing_month'
            }
        };
    }

    if (intent === 'contagem_ocorrencias') {
        return {
            results: Number(value || 0),
            details: {
                ...safeParams,
                mes,
                ano,
                totalGastos: execution.result?.details?.total || 0
            }
        };
    }

    if (intent === 'maior_menor_gasto' || intent === 'maior_menor_gasto_categoria') {
        return {
            results: {
                min: value?.min ? publicItemToLegacyRow(value.min) : null,
                max: value?.max ? publicItemToLegacyRow(value.max) : null
            },
            details: {
                ...safeParams,
                mes,
                ano,
                totalGastos: execution.result?.details?.total || 0
            }
        };
    }

    if (intent === 'ranking_estabelecimentos_gastos') {
        return {
            results: Array.isArray(value) ? value : [],
            details: {
                ...safeParams,
                mes,
                ano,
                total: execution.result?.details?.total || 0,
                totalCartoes: Number(execution.result?.details?.totals?.cards || 0),
                criterioCartao: execution.plan?.timeBasis || 'billing_month',
                totalLancamentos: execution.result?.details?.count || 0,
                somenteCartao: mapped.plan.domain === 'cards' || normalizeText(params.origem || '') === 'cartao'
            }
        };
    }

    if (intent === 'ranking_categorias_gastos') {
        const rows = Array.isArray(value) ? value : [];
        return {
            results: rows.map(item => ({
                categoria: item.label || item.categoria || 'Outros',
                label: item.label || item.categoria || 'Outros',
                total: Number(item.total || 0),
                count: Number(item.count || 0)
            })),
            details: {
                ...safeParams,
                mes,
                ano,
                totalGastos: execution.result?.details?.total || rows.reduce((sum, item) => sum + Number(item.total || 0), 0),
                totalCartoes: Number(execution.result?.details?.totals?.cards || 0),
                criterioCartao: execution.plan?.timeBasis || 'billing_month',
                somenteCartao: mapped.plan.domain === 'cards' || normalizeText(params.origem || '') === 'cartao'
            }
        };
    }

    if (intent === 'tendencia_gastos_mensal') {
        const rows = Array.isArray(value) ? value : [];
        return {
            results: rows,
            details: {
                ...safeParams,
                mes,
                ano,
                totalGastos: execution.result?.details?.total || rows.reduce((sum, item) => sum + Number(item.total || 0), 0),
                totalCartoes: Number(execution.result?.details?.totals?.cards || 0),
                criterioCartao: execution.plan?.timeBasis || 'billing_month'
            }
        };
    }

    const cardTemporalDetails = {
        ...safeParams,
        mes,
        ano,
        totalLancamentos: execution.result?.details?.count || 0,
        criterioCartao: execution.plan?.timeBasis || 'billing_month'
    };

    if (intent === 'total_fatura_cartao') {
        return {
            results: Number(value || 0),
            details: {
                ...cardTemporalDetails,
                parcelas: execution.result?.details?.count || 0,
                cartao: params.cartao || execution.plan?.filters?.card || ''
            }
        };
    }

    if (intent === 'total_faturas_por_cartao' || intent === 'ranking_cartoes_em_aberto') {
        const rows = Array.isArray(value) ? value : [];
        return {
            results: rows.map(item => ({
                cartao: item.label || 'Cartão',
                total: Number(item.total || 0),
                parcelas: Number(item.count || 0)
            })),
            details: {
                ...cardTemporalDetails,
                total: execution.result?.details?.total || rows.reduce((sum, item) => sum + Number(item.total || 0), 0),
                cartoes: rows.length,
                parcelas: rows.reduce((sum, item) => sum + Number(item.count || 0), 0)
            }
        };
    }

    if (intent === 'total_cartoes_em_aberto' || intent === 'saldo_compra_parcelada_cartao') {
        const payload = value || {};
        return {
            results: Number(payload.total || 0),
            details: {
                ...cardTemporalDetails,
                parcelas: execution.result?.details?.count || 0,
                meses: Array.isArray(payload.groups) ? payload.groups.length : 0,
                grupos: Array.isArray(payload.groups) ? payload.groups : [],
                compras: Array.isArray(payload.purchases) ? payload.purchases : []
            }
        };
    }

    if (intent === 'resumo_parcelamentos_cartao') {
        const rows = Array.isArray(value) ? value : [];
        return {
            results: rows.map(item => ({
                descricao: item.description || 'sem descrição',
                cartao: item.card || '',
                categoria: item.category || 'Cartão',
                parcelasLancadas: Number(item.paidOrScheduledInstallments || 0),
                parcelasRestantes: Number(item.remainingInstallments || 0),
                totalPrevisto: Number(item.totalPlanned || 0),
                totalRestante: Number(item.remainingTotal || 0),
                valorParcela: Number(item.installmentValue || 0),
                primeiraParcela: item.firstPurchaseDate || '',
                ultimaParcela: item.lastBillingMonth || ''
            })),
            details: cardTemporalDetails
        };
    }

    if (intent === 'maior_menor_compra_cartao') {
        return {
            results: {
                min: value?.min || null,
                max: value?.max || null
            },
            details: cardTemporalDetails
        };
    }

    const detail = value || {};
    const onlyCards = intent === 'detalhamento_cartao_mes';
    const items = Array.isArray(detail.items) ? detail.items : [];
    const legacyItems = items.map(item => ({
        data: item.date || '',
        descricao: item.description || '',
        categoria: item.category || 'Outros',
        subcategoria: item.subcategory || '',
        valor: Number(item.value || 0),
        origem: item.source || '',
        tipo: String(item.source || '').toLowerCase().includes('cart') ? 'cartao' : 'saida',
        pagamento: item.paymentMethod || '',
        cartao: item.card || '',
        parcela: item.installment || '',
        mesCobranca: item.billingMonth || ''
    }));

    return {
        results: {
            total: Number(detail.total || 0),
            totalSaidas: Number(detail.totals?.outputs || 0),
            totalCartoes: Number(detail.totals?.cards || 0),
            categorias: detail.groups?.category || [],
            estabelecimentos: detail.groups?.merchant || [],
            formas: onlyCards ? (detail.groups?.card || []) : (detail.groups?.paymentMethod || []),
            lancamentos: legacyItems,
            filtroCartao: params.cartao || ''
        },
        details: {
            ...safeParams,
            mes,
            ano,
            totalLancamentos: execution.result?.details?.count || 0,
            criterioCartao: execution.plan?.timeBasis || 'billing_month',
            somenteCartao: onlyCards
        }
    };
}

function titleCaseLabel(value) {
    return String(value || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .trim();
}

function normalizeEstablishmentLabel(description) {
    const original = String(description || '').trim();
    const normalized = normalizeText(original);
    if (!normalized) return 'Sem descrição';
    if (normalized.includes('ifood') || normalized.includes('i food')) return 'iFood';
    if (normalized.includes('uber')) return 'Uber';
    if (normalized.includes('mercadolivre') || normalized.includes('mercado livre')) return 'Mercado Livre';
    if (normalized.includes('google')) return 'Google';

    const cleaned = original
        .replace(/\s*[-–—]?\s*(?:parcela\s*)?\d+\s*\/\s*\d+\s*$/i, '')
        .replace(/\b(?:compra|pagamento|pix|debito|débito|credito|crédito|nu\s*pay|nupay)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return titleCaseLabel(cleaned || original).slice(0, 60);
}

function sortRowsByValueThenDate(a, b) {
    const valueDiff = Number(b.valor || 0) - Number(a.valor || 0);
    if (Math.abs(valueDiff) > 0.005) return valueDiff;
    const dateA = parseSheetDate(a.data)?.getTime() || 0;
    const dateB = parseSheetDate(b.data)?.getTime() || 0;
    return dateB - dateA;
}

function groupExpenseRows(rows, keyFn) {
    const grouped = new Map();
    rows.forEach((row) => {
        const label = String(keyFn(row) || 'Outros').trim() || 'Outros';
        const key = normalizeText(label) || label;
        const existing = grouped.get(key) || { label, total: 0, count: 0 };
        existing.total += parseValue(row.valor);
        existing.count += 1;
        grouped.set(key, existing);
    });
    return Array.from(grouped.values())
        .sort((a, b) => b.total - a.total || b.count - a.count || String(a.label).localeCompare(String(b.label), 'pt-BR'));
}

function getDetailedExpenseRows(dataSources = {}, params = {}, { onlyCards = false } = {}) {
    const mes = getMonthIndex(params.mes);
    const ano = parseInt(params.ano, 10);
    const hasValidYear = Number.isInteger(ano);
    const rows = [];

    if (!onlyCards && Array.isArray(dataSources.saidas) && dataSources.saidas.length > 1) {
        dataSources.saidas.slice(1).forEach((row) => {
            const rowDate = parseSheetDate(row[0]);
            if (!rowDate) return;
            if (hasValidYear && rowDate.getFullYear() !== ano) return;
            if (mes !== null && rowDate.getMonth() !== mes) return;
            rows.push({
                data: row[0] || '',
                descricao: row[1] || '',
                categoria: row[2] || 'Outros',
                subcategoria: row[3] || '',
                valor: parseValue(row[4]),
                origem: 'Saídas',
                tipo: 'saida',
                pagamento: row[6] || '',
                cartao: '',
                parcela: '',
                mesCobranca: ''
            });
        });
    }

    getCreditCardRows(dataSources)
        .filter(row => cardMatches(row, params.cartao))
        .filter(row => {
            if (!hasValidYear || mes === null) return true;
            return billingMatches(row, mes, ano);
        })
        .forEach((row) => {
            rows.push({
                data: row.date || '',
                descricao: row.descricao || '',
                categoria: row.categoria || 'Cartão',
                subcategoria: 'Cartão de Crédito',
                valor: Number(row.valor || 0),
                origem: 'Cartão',
                tipo: 'cartao',
                pagamento: 'Crédito',
                cartao: row.cartao || row.cardId || '',
                parcela: row.parcela || '',
                mesCobranca: row.mesCobranca || ''
            });
        });

    return rows
        .filter(row => Number(row.valor || 0) > 0)
        .sort(sortRowsByValueThenDate);
}

function buildExpenseDetailResult(rows, params = {}) {
    const totalSaidas = rows
        .filter(row => row.tipo === 'saida')
        .reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const totalCartoes = rows
        .filter(row => row.tipo === 'cartao')
        .reduce((sum, row) => sum + Number(row.valor || 0), 0);
    return {
        total: totalSaidas + totalCartoes,
        totalSaidas,
        totalCartoes,
        categorias: groupExpenseRows(rows, row => row.categoria || 'Outros').slice(0, 8),
        estabelecimentos: groupExpenseRows(rows, row => normalizeEstablishmentLabel(row.descricao)).slice(0, 10),
        formas: groupExpenseRows(rows, row => row.tipo === 'cartao' ? (row.cartao || 'Cartão de Crédito') : (row.pagamento || 'Saídas')).slice(0, 8),
        lancamentos: rows.slice(0, 12),
        filtroCartao: params.cartao || ''
    };
}

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function daysConsideredForAverage(mes, ano, now = new Date()) {
    if (mes === null || mes === undefined) return 365;
    if (ano === now.getFullYear() && mes === now.getMonth()) {
        return Math.max(1, now.getDate());
    }
    return new Date(ano, mes + 1, 0).getDate();
}

function expenseMatchesCategory(item, category) {
    return matchesAnyField(
        [item.categoria || '', item.subcategoria || '', item.descricao || ''],
        category
    );
}

function parseBillingMonth(value) {
    const match = String(value || '').trim().match(/^([A-Za-zÀ-ÿ]+)\s+de\s+(20\d{2})$/i);
    if (!match) return null;
    const month = getMonthIndex(match[1]);
    const year = Number.parseInt(match[2], 10);
    if (month === null || !Number.isInteger(year)) return null;
    return { month, year, key: year * 12 + month };
}

function targetBillingLabel(mes, ano) {
    const month = getMonthIndex(mes);
    const year = Number.parseInt(ano, 10);
    if (month === null || !Number.isInteger(year)) return '';
    return `${MONTH_NAMES[month]} de ${year}`;
}

function getCreditCardRows(dataSources = {}) {
    const cardSheets = Array.isArray(dataSources.cartoes) ? dataSources.cartoes : [];
    return cardSheets.flatMap((sheetRows) => {
        if (!Array.isArray(sheetRows) || sheetRows.length <= 1) return [];
        return sheetRows.slice(1).map(row => ({
            date: row[0] || '',
            descricao: row[1] || '',
            categoria: row[2] || 'Cartão',
            valor: parseValue(row[3]),
            parcela: row[4] || '',
            mesCobranca: row[5] || '',
            cardId: row.length >= 10 ? row[6] || '' : '',
            cartao: row.length >= 10 ? row[7] || row[6] || '' : '',
            raw: row
        }));
    });
}

function normalizeCardSearchText(value) {
    return normalizeText(value)
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cardMatches(row, cardName) {
    const needle = normalizeCardSearchText(cardName);
    if (!needle) return true;
    return [row.cardId, row.cartao]
        .map(value => normalizeCardSearchText(value))
        .some(value => value.includes(needle));
}

function billingMatches(row, mes, ano) {
    const expected = targetBillingLabel(mes, ano);
    return expected && String(row.mesCobranca || '').trim() === expected;
}

function filterCardRowsFromPeriod(rows, mes, ano) {
    const month = getMonthIndex(mes);
    const year = Number.parseInt(ano, 10);
    if (month === null || !Number.isInteger(year)) return rows;
    const targetKey = year * 12 + month;
    return rows.filter(row => {
        const parsed = parseBillingMonth(row.mesCobranca);
        return parsed && parsed.key >= targetKey;
    });
}

function summarizeInstallments(rows) {
    const grouped = new Map();
    rows.forEach((row) => {
        const key = [normalizeText(row.descricao), normalizeText(row.cartao), normalizeText(row.categoria)].join('|');
        const existing = grouped.get(key) || {
            descricao: row.descricao || 'sem descrição',
            cartao: row.cartao || '',
            categoria: row.categoria || '',
            parcelasLancadas: 0,
            totalPrevisto: 0,
            primeiraParcela: row.date || '',
            ultimaParcela: row.date || ''
        };
        existing.parcelasLancadas += 1;
        existing.totalPrevisto += Number(row.valor || 0);
        if (row.date && (!existing.primeiraParcela || String(row.date).localeCompare(String(existing.primeiraParcela)) < 0)) {
            existing.primeiraParcela = row.date;
        }
        if (row.date && (!existing.ultimaParcela || String(row.date).localeCompare(String(existing.ultimaParcela)) > 0)) {
            existing.ultimaParcela = row.date;
        }
        grouped.set(key, existing);
    });
    return Array.from(grouped.values())
        .filter(item => item.parcelasLancadas > 1 || /\/[2-9]\d*$/.test(String(rows.find(row => row.descricao === item.descricao)?.parcela || '')))
        .sort((a, b) => b.totalPrevisto - a.totalPrevisto);
}

function summarizeInvoicesByCard(rows) {
    const grouped = new Map();
    rows.forEach((row) => {
        const cardName = String(row.cartao || row.cardId || 'Cartão').trim() || 'Cartão';
        const key = normalizeCardSearchText(cardName) || cardName;
        const existing = grouped.get(key) || {
            cartao: cardName,
            total: 0,
            parcelas: 0
        };
        existing.total += Number(row.valor || 0);
        existing.parcelas += 1;
        grouped.set(key, existing);
    });
    return Array.from(grouped.values())
        .sort((a, b) => b.total - a.total || String(a.cartao).localeCompare(String(b.cartao), 'pt-BR'));
}

function transferRowMatchesMonth(row, mes, ano) {
    const month = getMonthIndex(mes);
    const year = Number.parseInt(ano, 10);
    const rowDate = parseSheetDate(row?.[0]);
    if (!rowDate) return false;
    if (month !== null && rowDate.getMonth() !== month) return false;
    return Number.isInteger(year) && rowDate.getFullYear() === year;
}

function isInvoicePaymentTransfer(row) {
    const status = normalizeText(row?.[7] || '');
    const description = normalizeText(row?.[1] || '');
    return status.includes('pagamento de fatura') ||
        (/fatura/.test(description) && /\b(pagamento|paguei|pag)\b/.test(description)) ||
        description.includes('qrs nu pagament');
}

function summarizeRecurringAccounts(dataSources = {}) {
    const rows = Array.isArray(dataSources.contas) ? dataSources.contas.slice(1) : [];
    const accounts = rows
        .filter(row => String(row?.[0] || row?.[4] || '').trim())
        .map(row => {
            const active = normalizeText(row?.[8] || '') === 'sim';
            const rawDay = Number.parseInt(row?.[1], 10);
            return {
                nome: String(row?.[4] || row?.[0] || 'Conta recorrente').trim(),
                dia: Number.isInteger(rawDay) && rawDay >= 1 && rawDay <= 31 ? rawDay : null,
                categoria: String(row?.[5] || '').trim(),
                subcategoria: String(row?.[6] || '').trim(),
                valorEsperado: row?.[7] || '',
                ativa: active
            };
        })
        .sort((a, b) => {
            const dayA = a.dia || 99;
            const dayB = b.dia || 99;
            if (dayA !== dayB) return dayA - dayB;
            return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
        });

    return {
        results: accounts,
        details: {
            total: accounts.length,
            regrasAtivas: accounts.filter(account => account.ativa).length,
            lembretes: accounts.filter(account => account.dia).length
        }
    };
}

function findHeaderIndex(headers, aliases, fallbackIndex) {
    if (!Array.isArray(headers)) return fallbackIndex;
    const normalizedAliases = aliases.map(alias => normalizeText(alias));
    const found = headers.findIndex(header => normalizedAliases.includes(normalizeText(header)));
    return found >= 0 ? found : fallbackIndex;
}

function isGoalActive(status) {
    const normalized = normalizeText(status || '');
    return !/(concluid|finalizad|atingid|quitad|cancelad|pausad)/.test(normalized);
}

function summarizeGoals(dataSources = {}, { onlyActive = false } = {}) {
    const rows = Array.isArray(dataSources.metas) ? dataSources.metas : [];
    if (rows.length <= 1) {
        return {
            results: [],
            details: { total: 0, ativas: 0, totalAlvo: 0, totalAtual: 0, totalFalta: 0, totalValorMensal: 0 }
        };
    }

    const headers = rows[0] || [];
    const idx = {
        nome: findHeaderIndex(headers, ['Nome', 'Nome da Meta'], 0),
        alvo: findHeaderIndex(headers, ['Valor Alvo', 'Alvo'], 1),
        atual: findHeaderIndex(headers, ['Valor Atual', 'Atual'], 2),
        valorMensal: findHeaderIndex(headers, ['Valor Mensal', 'Valor Mensal Necessário', 'Valor Mensal Sugerido'], 4),
        dataFim: findHeaderIndex(headers, ['Data Fim', 'Data Final', 'Data Alvo', 'Prazo'], 5),
        status: findHeaderIndex(headers, ['Status'], 6),
        prioridade: findHeaderIndex(headers, ['Prioridade'], 7)
    };

    const allGoals = rows.slice(1)
        .filter(row => String(row?.[idx.nome] || '').trim())
        .map(row => {
            const alvo = parseValue(row[idx.alvo]);
            const atual = parseValue(row[idx.atual]);
            const falta = Math.max(0, alvo - atual);
            const progressoPct = alvo > 0 ? Math.min(100, (atual / alvo) * 100) : parseValue(row[3]);
            return {
                nome: String(row[idx.nome] || 'Meta').trim(),
                alvo,
                atual,
                progressoPct,
                falta,
                valorMensal: parseValue(row[idx.valorMensal]),
                dataFim: row[idx.dataFim] || '',
                status: row[idx.status] || '',
                prioridade: row[idx.prioridade] || '',
                ativa: isGoalActive(row[idx.status]) && falta > 0
            };
        })
        .sort((a, b) => Number(b.ativa) - Number(a.ativa) || b.falta - a.falta || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    const goals = onlyActive ? allGoals.filter(goal => goal.ativa) : allGoals;
    return {
        results: goals,
        details: {
            total: allGoals.length,
            ativas: allGoals.filter(goal => goal.ativa).length,
            totalAlvo: allGoals.reduce((sum, goal) => sum + goal.alvo, 0),
            totalAtual: allGoals.reduce((sum, goal) => sum + goal.atual, 0),
            totalFalta: goals.reduce((sum, goal) => sum + goal.falta, 0),
            totalValorMensal: goals.reduce((sum, goal) => sum + Number(goal.valorMensal || 0), 0)
        }
    };
}

function isReserveTransfer(row) {
    const text = normalizeText(`${row?.[1] || ''} ${row?.[6] || ''} ${row?.[7] || ''}`);
    return ['rdb', 'caixinha', 'nu reserva', 'reserva', 'investimento', 'aplicacao', 'aplicação']
        .some(term => text.includes(normalizeText(term)));
}

function isReserveApplication(row) {
    const description = normalizeText(row?.[1] || '');
    return isReserveTransfer(row) && (
        description.includes('aplicacao') ||
        description.includes('aplicação') ||
        description.includes('guardar') ||
        description.includes('guardado')
    );
}

function isReserveRedemption(row) {
    const description = normalizeText(row?.[1] || '');
    return isReserveTransfer(row) && (
        description.includes('resgate') ||
        description.includes('retirada')
    );
}

function getPeriodExpenseTotal(dataSources, mes, ano) {
    return getUnifiedExpenses(dataSources, mes, ano)
        .reduce((sum, item) => sum + parseValue(item.valor), 0);
}

function previousMonthPeriod(mes, ano) {
    const month = getMonthIndex(mes);
    const year = Number.parseInt(ano, 10);
    if (month === null || !Number.isInteger(year)) return { mes: month, ano: year };
    if (month === 0) return { mes: 11, ano: year - 1 };
    return { mes: month - 1, ano: year };
}

function getSaoPauloToday() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const [year, month, day] = formatter.format(new Date()).split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function buildDueDateForDay(day, baseDate = getSaoPauloToday()) {
    const dueDay = Number.parseInt(day, 10);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return null;
    const buildCandidate = (year, month) => {
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        return new Date(year, month, Math.min(dueDay, lastDayOfMonth), 12, 0, 0, 0);
    };
    let candidate = buildCandidate(baseDate.getFullYear(), baseDate.getMonth());
    if (candidate < baseDate) {
        candidate = buildCandidate(baseDate.getFullYear(), baseDate.getMonth() + 1);
    }
    return candidate;
}

function formatDateBR(date) {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

const operationRegistry = {
    total_gastos_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const saidasLimpo = dataSources.saidas.slice(1);
        const saidasFiltradas = saidasLimpo.filter(row => {
            const rowDate = parseSheetDate(row[0]);
            return rowDate && rowDate.getMonth() === mes && rowDate.getFullYear() === ano;
        });
        const totalSaidas = analysisService.calculateTotal(saidasFiltradas, 4);
        let totalCartoes = 0;
        if (dataSources.cartoes && mes !== null) {
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            const targetBillingMonth = `${monthNames[mes]} de ${ano}`;
            dataSources.cartoes.forEach(cardSheetData => {
                if (!cardSheetData || cardSheetData.length <= 1) return;
                cardSheetData.slice(1).forEach(row => {
                    if ((row[5] || '') === targetBillingMonth) {
                        totalCartoes += parseValue(row[3]);
                    }
                });
            });
        }
        return { results: totalSaidas + totalCartoes, details: { totalSaidas, totalCartoes, mes, ano } };
    },
    total_gastos_categoria_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const saidasLimpo = dataSources.saidas.slice(1);
        const saidasFiltradas = saidasLimpo.filter(row => {
            const rowDate = parseSheetDate(row[0]);
            if (!rowDate) return false;
            if (rowDate.getMonth() !== mes || rowDate.getFullYear() !== ano) return false;
            return matchesAnyField([row[2] || '', row[3] || '', row[1] || ''], params.categoria);
        });
        const totalSaidas = analysisService.calculateTotal(saidasFiltradas);
        let totalCartoes = 0;
        if (dataSources.cartoes && mes !== null) {
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            const targetBillingMonth = `${monthNames[mes]} de ${ano}`;
            dataSources.cartoes.forEach(cardSheetData => {
                if (!cardSheetData || cardSheetData.length <= 1) return;
                cardSheetData.slice(1).forEach(row => {
                    const billingMonth = row[5] || '';
                    if (billingMonth === targetBillingMonth && matchesAnyField([row[2] || '', row[1] || ''], params.categoria)) {
                        totalCartoes += parseValue(row[3]);
                    }
                });
            });
        }
        const totalFinal = totalSaidas + totalCartoes;
        return { results: totalFinal, details: { categoria: params.categoria, mes, ano } };
    },
    media_gastos_categoria_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const saidasLimpo = dataSources.saidas.slice(1);
        const filteredData = analysisService.getExpensesByMonthAndCategory(saidasLimpo, mes, ano, params.categoria);
        const media = analysisService.calculateAverage(filteredData);
        return { results: media, details: { ...params, mes, ano } };
    },
    media_diaria_gastos_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano);
        const total = gastosUnificados.reduce((sum, item) => sum + parseValue(item.valor), 0);
        const days = daysConsideredForAverage(mes, ano);
        return { results: days > 0 ? total / days : 0, details: { ...params, mes, ano, diasConsiderados: days, totalGastos: total } };
    },
    total_gastos_multiplas_categorias: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const categorias = Array.isArray(params.categorias) ? params.categorias.filter(Boolean) : [];
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano);
        const total = gastosUnificados
            .filter(item => categorias.some(category => expenseMatchesCategory(item, category)))
            .reduce((sum, item) => sum + parseValue(item.valor), 0);
        return { results: total, details: { ...params, categorias, mes, ano } };
    },
    percentual_categoria_gastos: async function(params, dataSources) {
        const queryEngineResult = await executeLegacyExpenseQueryIntent('percentual_categoria_gastos', params, dataSources);
        if (queryEngineResult) return queryEngineResult;

        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano);
        const totalGastos = gastosUnificados.reduce((sum, item) => sum + parseValue(item.valor), 0);
        const totalCategoria = gastosUnificados
            .filter(item => expenseMatchesCategory(item, params.categoria))
            .reduce((sum, item) => sum + parseValue(item.valor), 0);
        const percentual = totalGastos > 0 ? (totalCategoria / totalGastos) * 100 : 0;
        return { results: percentual, details: { ...params, mes, ano, totalCategoria, totalGastos } };
    },
    comparacao_gastos_categorias: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const categorias = Array.isArray(params.categorias) ? params.categorias.filter(Boolean).slice(0, 2) : [];
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano);
        return {
            results: {
                categorias: categorias.map(category => ({
                    categoria: category,
                    total: gastosUnificados
                        .filter(item => expenseMatchesCategory(item, category))
                        .reduce((sum, item) => sum + parseValue(item.valor), 0)
                }))
            },
            details: { ...params, categorias, mes, ano }
        };
    },
    listagem_gastos_categoria: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const saidasLimpo = dataSources.saidas.slice(1);
        const filteredData = analysisService.getExpensesByMonthAndCategory(saidasLimpo, mes, ano, params.categoria);
        return { results: filteredData, details: { ...params, mes, ano } };
    },
    contagem_ocorrencias: async function(params, dataSources) {
        const ano = parseInt(params.ano, 10);
        const mes = getMonthIndex(params.mes);
        const rows = getDetailedExpenseRows(dataSources, { ...params, mes, ano });
        const filteredItems = rows.filter(row => matchesAnyField([row.descricao || '', row.categoria || '', row.subcategoria || ''], params.categoria));
        return { results: filteredItems.length, details: { ...params, mes, ano, totalGastos: rows.reduce((sum, row) => sum + parseValue(row.valor), 0) } };
    },
    gastos_valores_duplicados: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const valoresContados = new Map();
        if (dataSources.saidas && dataSources.saidas.length > 1) {
            const saidasLimpo = dataSources.saidas.slice(1);
            const saidasDoMes = saidasLimpo.filter(row => {
                const rowDate = parseSheetDate(row[0]);
                return rowDate && rowDate.getMonth() === mes && rowDate.getFullYear() === ano;
            });
            for (const row of saidasDoMes) {
                const valorNumerico = parseValue(row[4]);
                const descricao = row[1];
                const valorArredondado = Math.round(valorNumerico * 100) / 100;
                if (!valoresContados.has(valorArredondado)) { valoresContados.set(valorArredondado, []); }
                valoresContados.get(valorArredondado).push(descricao);
            }
        }
        const duplicatasEncontradas = [];
        for (let [valor, descricoes] of valoresContados.entries()) {
            if (descricoes.length > 1) {
                duplicatasEncontradas.push({ valor, count: descricoes.length, itens: descricoes });
            }
        }
        return { results: duplicatasEncontradas, details: { ...params, mes, ano } };
    },
    maior_menor_gasto: async function(params, dataSources) {
        const queryEngineResult = await executeLegacyExpenseQueryIntent('maior_menor_gasto', params, dataSources);
        if (queryEngineResult) return queryEngineResult;

        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano);
        const dataParaAnalise = gastosUnificados.map(g => [g.data, g.descricao, g.categoria, g.subcategoria, g.valor]);
        const minMax = analysisService.findMinMax(dataParaAnalise);
        return { results: { min: minMax.min, max: minMax.max }, details: { ...params, mes, ano } };
    },
    maior_menor_gasto_categoria: async function(params, dataSources) {
        const queryEngineResult = await executeLegacyExpenseQueryIntent('maior_menor_gasto_categoria', params, dataSources);
        if (queryEngineResult) return queryEngineResult;

        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const gastosUnificados = getUnifiedExpenses(dataSources, mes, ano)
            .filter(item => expenseMatchesCategory(item, params.categoria));
        const dataParaAnalise = gastosUnificados.map(g => [g.data, g.descricao, g.categoria, g.subcategoria, g.valor]);
        const minMax = analysisService.findMinMax(dataParaAnalise);
        return { results: { min: minMax.min, max: minMax.max }, details: { ...params, mes, ano } };
    },
    saldo_do_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const entradasLimpo = dataSources.entradas.slice(1);
        const saidasLimpo = dataSources.saidas.slice(1);
        const entradasFiltradas = entradasLimpo.filter(row => {
            const rowDate = parseSheetDate(row[0]);
            return rowDate && rowDate.getMonth() === mes && rowDate.getFullYear() === ano;
        });
        const totalEntradas = analysisService.calculateTotal(entradasFiltradas, 3);
        const saidasFiltradas = saidasLimpo.filter(row => {
            const rowDate = parseSheetDate(row[0]);
            return rowDate && rowDate.getMonth() === mes && rowDate.getFullYear() === ano;
        });
        const totalSaidas = analysisService.calculateTotal(saidasFiltradas, 4);
        let totalCartoes = 0;
        if (dataSources.cartoes && mes !== null) {
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            const targetBillingMonth = `${monthNames[mes]} de ${ano}`;
            dataSources.cartoes.forEach(cardSheetData => {
                if (!cardSheetData || cardSheetData.length <= 1) return;
                cardSheetData.slice(1).forEach(row => {
                    if ((row[5] || '') === targetBillingMonth) {
                        totalCartoes += parseValue(row[3]);
                    }
                });
            });
        }
        const saldo = totalEntradas - (totalSaidas + totalCartoes);
        return { results: saldo, details: { totalSaidas: totalSaidas + totalCartoes, totalEntradas, mes, ano } };
    },
    saldo_disponivel_estimado: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const saldoData = await operationRegistry.saldo_do_mes(params, dataSources);
        const transferRows = Array.isArray(dataSources.transferencias) ? dataSources.transferencias.slice(1) : [];
        const monthTransfers = transferRows.filter(row => transferRowMatchesMonth(row, mes, ano));
        const reservaAplicada = monthTransfers
            .filter(isReserveApplication)
            .reduce((sum, row) => sum + parseValue(row[2]), 0);
        const reservaResgatada = monthTransfers
            .filter(isReserveRedemption)
            .reduce((sum, row) => sum + parseValue(row[2]), 0);
        const reservaLiquida = reservaAplicada - reservaResgatada;
        const saldo = Number(saldoData.results || 0);
        return {
            results: saldo - reservaLiquida,
            details: {
                ...saldoData.details,
                saldo,
                reservaAplicada,
                reservaResgatada,
                reservaLiquida
            }
        };
    },
    total_fatura_cartao: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = getCreditCardRows(dataSources)
            .filter(row => cardMatches(row, params.cartao))
            .filter(row => billingMatches(row, mes, ano));
        const total = rows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
        return {
            results: total,
            details: {
                cartao: params.cartao || '',
                mes,
                ano,
                parcelas: rows.length
            }
        };
    },
    total_faturas_por_cartao: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = getCreditCardRows(dataSources)
            .filter(row => cardMatches(row, params.cartao))
            .filter(row => billingMatches(row, mes, ano));
        const results = summarizeInvoicesByCard(rows);
        return {
            results,
            details: {
                cartao: params.cartao || '',
                mes,
                ano,
                total: results.reduce((sum, item) => sum + Number(item.total || 0), 0),
                cartoes: results.length,
                parcelas: rows.length
            }
        };
    },
    total_pagamentos_fatura_mes: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = (Array.isArray(dataSources.transferencias) ? dataSources.transferencias.slice(1) : [])
            .filter(row => transferRowMatchesMonth(row, mes, ano))
            .filter(isInvoicePaymentTransfer);
        return {
            results: rows.reduce((sum, row) => sum + parseValue(row[2]), 0),
            details: {
                mes,
                ano,
                pagamentos: rows.length,
                canGroupByCard: false
            }
        };
    },
    resumo_contas_recorrentes: async function(params, dataSources) {
        return summarizeRecurringAccounts(dataSources);
    },
    contas_vencendo: async function(params, dataSources) {
        const days = Math.max(1, Number.parseInt(params.dias || '7', 10) || 7);
        const today = getSaoPauloToday();
        const start = params.amanha ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12, 0, 0, 0) : today;
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (params.amanha ? 0 : days - 1), 23, 59, 59, 999);
        const accounts = summarizeRecurringAccounts(dataSources).results;
        const results = accounts
            .map(account => {
                const dueDate = buildDueDateForDay(account.dia, today);
                if (!dueDate) return null;
                const daysUntil = Math.round((dueDate - today) / (24 * 60 * 60 * 1000));
                return {
                    ...account,
                    data: formatDateBR(dueDate),
                    diasAteVencimento: daysUntil
                };
            })
            .filter(Boolean)
            .filter(account => account.dia && account.diasAteVencimento >= 0 && account.data)
            .filter(account => {
                const dueDate = buildDueDateForDay(account.dia, today);
                return dueDate >= start && dueDate <= end;
            })
            .sort((a, b) => a.diasAteVencimento - b.diasAteVencimento || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
        return { results, details: { dias: days, amanha: Boolean(params.amanha) } };
    },
    resumo_metas: async function(params, dataSources) {
        return summarizeGoals(dataSources);
    },
    progresso_metas: async function(params, dataSources) {
        return summarizeGoals(dataSources, { onlyActive: true });
    },
    total_cartoes_em_aberto: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = filterCardRowsFromPeriod(
            getCreditCardRows(dataSources).filter(row => cardMatches(row, params.cartao)),
            mes,
            ano
        );
        const total = rows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
        const billingMonths = new Set(rows.map(row => row.mesCobranca).filter(Boolean));
        return {
            results: total,
            details: {
                cartao: params.cartao || '',
                mes,
                ano,
                parcelas: rows.length,
                meses: billingMonths.size
            }
        };
    },
    ranking_cartoes_em_aberto: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = filterCardRowsFromPeriod(getCreditCardRows(dataSources), mes, ano);
        const grouped = new Map();
        rows.forEach((row) => {
            const cardName = String(row.cartao || row.cardId || 'Cartão').trim() || 'Cartão';
            const key = normalizeCardSearchText(cardName) || cardName;
            const existing = grouped.get(key) || { cartao: cardName, total: 0, parcelas: 0 };
            existing.total += Number(row.valor || 0);
            existing.parcelas += 1;
            grouped.set(key, existing);
        });
        return {
            results: Array.from(grouped.values()).sort((a, b) => b.parcelas - a.parcelas || b.total - a.total),
            details: { mes, ano }
        };
    },
    resumo_parcelamentos_cartao: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = filterCardRowsFromPeriod(
            getCreditCardRows(dataSources).filter(row => cardMatches(row, params.cartao)),
            mes,
            ano
        );
        return {
            results: summarizeInstallments(rows),
            details: { cartao: params.cartao || '', mes, ano }
        };
    },
    ranking_categorias_gastos: async function(params, dataSources) {
        const queryEngineResult = await executeLegacyExpenseQueryIntent('ranking_categorias_gastos', params, dataSources);
        if (queryEngineResult) return queryEngineResult;

        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const grouped = new Map();
        getUnifiedExpenses(dataSources, mes, ano).forEach((item) => {
            const categoria = String(item.categoria || 'Outros').trim() || 'Outros';
            const existing = grouped.get(categoria) || { categoria, total: 0, count: 0 };
            existing.total += parseValue(item.valor);
            existing.count += 1;
            grouped.set(categoria, existing);
        });
        const results = Array.from(grouped.values()).sort((a, b) => b.total - a.total || b.count - a.count);
        return {
            results,
            details: {
                ...params,
                mes,
                ano,
                totalGastos: results.reduce((sum, item) => sum + Number(item.total || 0), 0)
            }
        };
    },
    detalhamento_gastos_mes: async function(params, dataSources) {
        const queryEngineResult = await executeLegacyExpenseQueryIntent('detalhamento_gastos_mes', params, dataSources);
        if (queryEngineResult) return queryEngineResult;

        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = getDetailedExpenseRows(dataSources, { ...params, mes, ano });
        return {
            results: buildExpenseDetailResult(rows, params),
            details: {
                ...params,
                mes,
                ano,
                totalLancamentos: rows.length,
                criterioCartao: 'mes_cobranca'
            }
        };
    },
    detalhamento_cartao_mes: async function(params, dataSources) {
        const queryEngineResult = await executeLegacyExpenseQueryIntent('detalhamento_cartao_mes', params, dataSources);
        if (queryEngineResult) return queryEngineResult;

        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const rows = getDetailedExpenseRows(dataSources, { ...params, mes, ano }, { onlyCards: true });
        return {
            results: buildExpenseDetailResult(rows, params),
            details: {
                ...params,
                mes,
                ano,
                totalLancamentos: rows.length,
                criterioCartao: 'mes_cobranca',
                somenteCartao: true
            }
        };
    },
    ranking_estabelecimentos_gastos: async function(params, dataSources) {
        const queryEngineResult = await executeLegacyExpenseQueryIntent('ranking_estabelecimentos_gastos', params, dataSources);
        if (queryEngineResult) return queryEngineResult;

        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const onlyCards = normalizeText(params.origem || '') === 'cartao';
        const rows = getDetailedExpenseRows(dataSources, { ...params, mes, ano }, { onlyCards });
        const results = groupExpenseRows(rows, row => normalizeEstablishmentLabel(row.descricao)).slice(0, 15);
        return {
            results,
            details: {
                ...params,
                mes,
                ano,
                total: results.reduce((sum, item) => sum + Number(item.total || 0), 0),
                totalLancamentos: rows.length,
                somenteCartao: onlyCards
            }
        };
    },
    contagem_lancamentos_saida: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        return { results: getUnifiedExpenses(dataSources, mes, ano).length, details: { ...params, mes, ano } };
    },
    comparacao_gastos_periodo: async function(params, dataSources) {
        const mes = getMonthIndex(params.mes);
        const ano = parseInt(params.ano, 10);
        const previous = previousMonthPeriod(mes, ano);
        const atual = getPeriodExpenseTotal(dataSources, mes, ano);
        const anterior = getPeriodExpenseTotal(dataSources, previous.mes, previous.ano);
        const diferenca = atual - anterior;
        const percentual = anterior > 0 ? (diferenca / anterior) * 100 : 0;
        return {
            results: { atual, anterior, diferenca, percentual },
            details: { ...params, mes, ano, mesAnterior: previous.mes, anoAnterior: previous.ano }
        };
    },
    pergunta_geral: async function(params, dataSources) {
        return { results: 'Pergunta genérica', details: null };
    }
};

async function execute(intent, parameters, dataSources) {
    if (FINANCIAL_QUERY_ENGINE_PRIMARY_INTENTS.has(intent)) {
        const queryEngineResult = await executeLegacyExpenseQueryIntent(intent, parameters, dataSources);
        if (queryEngineResult) return queryEngineResult;
        return {
            results: null,
            details: {
                ...(parameters || {}),
                engineGap: true,
                gapReason: 'financial_query_engine_gap'
            }
        };
    }
    const calculator = operationRegistry[intent] || operationRegistry.pergunta_geral;
    return await calculator(parameters, dataSources);
}

module.exports = {
    execute,
    executeFinancialQueryPlanForLegacyIntent: executeLegacyExpenseQueryIntent,
    __test__: {
        parseBillingMonth,
        getCreditCardRows,
        summarizeInstallments,
        normalizeCardSearchText,
        cardMatches,
        normalizeEstablishmentLabel,
        getDetailedExpenseRows,
        buildExpenseDetailResult
    }
};
