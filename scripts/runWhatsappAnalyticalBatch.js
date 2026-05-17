require('dotenv').config();

const path = require('node:path');
const { launchWhatsAppWebDriver } = require('../src/testing/whatsappWebDriver');
const { sendAndWaitForAnyReply } = require('../src/testing/e2eAssertions');

const botPhone = String(process.env.WHATSAPP_E2E_BOT_PHONE || '5521993184657').replace(/\D/g, '');
const timeoutMs = Number(process.env.WHATSAPP_E2E_TIMEOUT_MS || 90000);

function buildConfig({ profileDir, botChatName }) {
    return {
        enabled: true,
        botPhone,
        testUserPhone: botPhone,
        senderKind: 'personal-temporary',
        botChatName: botChatName || process.env.WHATSAPP_E2E_BOT_CHAT_NAME || 'FinançasBot',
        timeoutMs,
        headless: String(process.env.WHATSAPP_E2E_HEADLESS || 'false').toLowerCase() === 'true',
        resetSpreadsheet: false,
        profileDir,
        profilePath: path.resolve(process.cwd(), profileDir)
    };
}

async function visibleTail(driver, size = 900) {
    const text = await driver.getVisibleText();
    return String(text || '').slice(-size);
}

async function runCases(label, config, cases) {
    const driver = await launchWhatsAppWebDriver(config);
    const results = [];

    try {
        await driver.gotoHome();
        await driver.assertLoggedIn();
        await driver.openChat(config.botPhone);

        for (const testCase of cases) {
            const found = await sendAndWaitForAnyReply(driver, testCase.question, testCase.expectAny, {
                timeoutMs: testCase.timeoutMs || timeoutMs,
                settleMs: 1500
            });
            const tail = await visibleTail(driver);
            results.push({
                label,
                question: testCase.question,
                found,
                expected: testCase.expectAny,
                tail
            });
            console.log(`\n[batch:${label}] pergunta: ${testCase.question}`);
            console.log(`[batch:${label}] marcador encontrado: ${found}`);
            console.log(`[batch:${label}] recorte visivel:\n${tail}\n`);
        }
    } finally {
        await driver.close();
    }

    return results;
}

async function main() {
    const suites = [
        {
            label: 'daniel',
            config: buildConfig({ profileDir: '.e2e/whatsapp-sender-profile' }),
            cases: [
                {
                    question: 'em média diária, quanto foram meus gastos em maio de 2026?',
                    expectAny: ['Média diária de gastos', 'Total considerado']
                },
                {
                    question: 'qual foi a soma de mercado, transporte e saúde em maio de 2026?',
                    expectAny: ['Total gasto com mercado + transporte + saude', 'R$ 135,70']
                },
                {
                    question: 'qual foi a participação de mercado no total de gastos em maio de 2026?',
                    expectAny: ['mercado representou', '66,99%']
                },
                {
                    question: 'quanto gastei com mercdo em maio de 2026?',
                    expectAny: ['Total gasto com mercdo', 'R$ 90,90']
                },
                {
                    question: 'quantas ocorrências de mercado eu tive em maio de 2026?',
                    expectAny: ['Ocorrências encontradas']
                },
                {
                    question: 'liste meus gastos com transporte em maio de 2026',
                    expectAny: ['Gastos encontrados', 'metrô']
                },
                {
                    question: 'qual foi meu maior e menor gasto em maio de 2026?',
                    expectAny: ['Maior e menor gasto', 'Maior:', 'Menor:']
                },
                {
                    question: 'qual meu saldo de maio de 2026?',
                    expectAny: ['Saldo em maio/2026', 'R$ -135,70']
                }
            ]
        },
        {
            label: 'amigo',
            config: buildConfig({ profileDir: '.e2e/whatsapp-friend-profile' }),
            cases: [
                {
                    question: 'quanto eu gastei por dia, em média, em maio de 2026?',
                    expectAny: ['Média diária de gastos', 'R$ 2,08']
                },
                {
                    question: 'qual foi o percentual de mercado nos meus gastos de maio de 2026?',
                    expectAny: ['mercado representou', '100,00%']
                },
                {
                    question: 'qual o total de mercado e transporte em maio de 2026?',
                    expectAny: ['Total gasto com mercado + transporte', 'R$ 35,35']
                },
                {
                    question: 'quantas ocorrências de mercado eu tive em maio de 2026?',
                    expectAny: ['Ocorrências encontradas']
                },
                {
                    question: 'qual meu saldo de maio de 2026?',
                    expectAny: ['Saldo em maio/2026', 'R$ -35,35']
                }
            ]
        },
        {
            label: 'daniel-extra',
            config: buildConfig({ profileDir: '.e2e/whatsapp-sender-profile' }),
            cases: [
                {
                    question: 'quanto gastei só com transporte em maio de 2026?',
                    expectAny: ['Total gasto com transporte', 'R$ 44,80']
                },
                {
                    question: 'qual a média dos meus gastos com transporte em maio de 2026?',
                    expectAny: ['Média de gastos com transporte', 'R$ 14,93']
                },
                {
                    question: 'quanto o transporte representou dos meus gastos em maio de 2026?',
                    expectAny: ['transporte representou', '33,01%']
                },
                {
                    question: 'qual foi a soma de ônibus, metrô e uber em maio de 2026?',
                    expectAny: ['Total gasto com onibus + metro + uber', 'R$ 44,80']
                },
                {
                    question: 'liste meus gastos com mercdo em maio de 2026',
                    expectAny: ['Gastos encontrados', 'mercado']
                },
                {
                    question: 'qual foi o total de gastos de maio de 2026?',
                    expectAny: ['Total gasto em maio/2026', 'R$ 135,70']
                },
                {
                    question: 'quanto sobrou em maio de 2026?',
                    expectAny: ['Saldo em maio/2026', 'R$ -135,70', 'Não consegui classificar']
                },
                {
                    question: 'qual foi minha maior compra de mercado em maio de 2026?',
                    expectAny: ['Maior e menor gasto com mercado', 'R$ 46,46']
                },
                {
                    question: 'mercado foi maior que transporte em maio de 2026?',
                    expectAny: ['Diferença: R$ 46,10', 'mercado: R$ 90,90']
                }
            ]
        },
        {
            label: 'amigo-extra',
            config: buildConfig({ profileDir: '.e2e/whatsapp-friend-profile' }),
            cases: [
                {
                    question: 'qual foi o total de gastos em maio de 2026?',
                    expectAny: ['Total gasto em maio/2026', 'R$ 35,35']
                },
                {
                    question: 'quanto gastei só com transporte em maio de 2026?',
                    expectAny: ['Total gasto com transporte', 'R$ 0,00']
                },
                {
                    question: 'qual a média dos gastos com mercado em maio de 2026?',
                    expectAny: ['Média de gastos com mercado', 'R$ 35,35']
                },
                {
                    question: 'liste gastos com mercado em maio de 2026',
                    expectAny: ['Gastos encontrados', 'mercado']
                },
                {
                    question: 'quanto sobrou em maio de 2026?',
                    expectAny: ['Saldo em maio/2026', 'R$ -35,35', 'Não consegui classificar']
                }
            ]
        }
    ];

    const suiteArg = process.argv.find(arg => arg.startsWith('--suite='))?.split('=')[1];
    const startArg = process.argv.find(arg => arg.startsWith('--start='))?.split('=')[1];
    const onlySuite = String(suiteArg || process.env.WHATSAPP_ANALYTICS_SUITE || '').trim().toLowerCase();
    const startAt = Math.max(1, Number.parseInt(startArg || process.env.WHATSAPP_ANALYTICS_START_AT || '1', 10) || 1);

    for (const suite of suites) {
        if (onlySuite && suite.label !== onlySuite) continue;
        const cases = suite.cases.slice(startAt - 1);
        await runCases(suite.label, suite.config, cases);
    }
}

main().catch(error => {
    console.error(`[batch] falhou: ${error.stack || error.message}`);
    process.exit(1);
});
