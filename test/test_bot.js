// test/test_bot.js

require('dotenv').config(); // Carrega as variáveis de ambiente do seu arquivo .env

// Importa as funções essenciais do seu bot
const { handleMessage } = require('../src/handlers/messageHandler');
const { authorizeGoogle, getSheetIds } = require('../src/services/google');
 const userStateManager = require('../src/state/userStateManager');
    console.log('Conteúdo de userStateManager:', userStateManager); // Adicione esta linha
    const { resetAllStates } = userStateManager;

// --- Mocks e Utilitários de Teste ---

// Variável para capturar a resposta do bot
let botResponse = null;

// Mock para o método message.reply() que captura a resposta
const createMockMessage = (body, from = '1234567890@c.us', type = 'chat', isGroupMsg = false) => {
    const mockMsg = {
        body: body,
        from: from,
        to: 'bot_number@c.us', // Assumindo que o bot tem um número
        id: {
            fromMe: false,
            remote: from,
            id: `test-msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // ID único para cada mensagem
            _serialized: `test-msg-${Date.now()}`
        },
        type: type,
        hasMedia: false, // Assumimos que não há mídia para mensagens de texto
        isGroupMsg: isGroupMsg,
        async reply(text) {
            botResponse = text; // Captura a resposta do bot
            console.log(`[BOT RESPONDEU]: ${text}`); // Exibe a resposta no console para acompanhamento
        },
        // Mocks para getChat e getContact, se handleMessage os utilizar
        async getChat() {
            return {
                id: { _serialized: mockMsg.from },
                isGroup: mockMsg.isGroupMsg,
                // Adicione outras propriedades do Chat se necessário
            };
        },
        async getContact() {
            return {
                id: { _serialized: mockMsg.from },
                isMe: false,
                // Adicione outras propriedades do Contact se necessário
            };
        },
        // Mock para downloadMedia para testes de áudio (fora do escopo deste script)
        async downloadMedia() {
            return null; // Retorna null para simular que não há mídia
        }
    };
    return mockMsg;
};

// --- Casos de Teste ---

// Obtenha o primeiro ID de administrador do .env, se existir
const adminId = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',')[0] : '1234567890@c.us';
const nonAdminId = 'outro_usuario@c.us'; // ID de um usuário comum

const testCases = [
    // --- Testes de Comandos Administrativos ---
    {
        name: 'Comando de Admin (Admin)',
        type: 'single-step',
        input: '!admin',
        expected: /Você é um administrador./,
        sender: adminId
    },
    {
        name: 'Comando de Admin (Não Admin)',
        type: 'single-step',
        input: '!admin',
        expected: /Você não tem permissão para usar comandos administrativos./,
        sender: nonAdminId
    },

    // --- Seção 1: Saídas (Gastos) ---
    {
        name: 'Cenário 1.1: Gasto Interativo com Correção de Erro',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'gastei 25 reais de lanche',
                expected: /Entendido! E qual foi a forma de pagamento\? \(Crédito, Débito, PIX ou Dinheiro\)/
            },
            {
                input: 'foi no pixi', // Typos aqui
                expected: /✅ Gasto de R\$25,00 registrado em Alimentação \/ PADARIA \/ LANCHE!/
            }
        ]
    },
    {
        name: 'Parte 1.1 - Teste de Mapeamento Básico (Palavra-Chave)',
        type: 'single-step',
        input: 'paguei 25 reais no metrô',
        expected: /Gasto de R\$25,00 registrado em Transporte \/ TRANSPORTE PÚBLICO!/,
        sender: adminId
    },
    {
        name: 'Parte 1.2 - Teste de Mapeamento Específico',
        type: 'single-step',
        input: 'gastei 250 de compras no Assaí',
        expected: /Gasto de R\$250,00 registrado em Alimentação \/ SUPERMERCADO!/,
        sender: adminId
    },
    {
        name: 'Parte 1.3 - Teste de Extração de Observações',
        type: 'single-step',
        input: 'gastei 80 de gasolina para a viagem, o posto estava cheio',
        expected: /Gasto de R\$80,00 registrado em Transporte \/ COMBUSTÍVEL! Observações: o posto estava cheio/,
        sender: adminId
    },
    {
        name: 'Parte 1.4 - Teste de Pagamento Informado',
        type: 'single-step',
        input: 'comprei um remédio de 35 reais na farmácia no crédito',
        expected: /Gasto de R\$35,00 registrado em Saúde \/ FARMÁCIA!/, // A resposta não menciona o pagamento, mas a planilha deve ter
        sender: adminId
    },
    {
        name: 'Parte 1.5 - Teste de Recorrência',
        type: 'single-step',
        input: 'paguei a assinatura mensal de 50 reais do streaming',
        expected: /Gasto de R\$50,00 registrado em Assinaturas \/ STREAMING!/, // A resposta não menciona recorrência, mas a planilha deve ter
        sender: adminId
    },
    {
        name: 'Parte 3.1 - Teste de Pergunta de Pagamento (com erro de digitação)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'gastei 60 reais de uber',
                expected: /Entendido! E qual foi a forma de pagamento\? \(Crédito, Débito, PIX ou Dinheiro\)/
            },
            {
                input: 'crdito', // Typos aqui
                expected: /Gasto de R\$60,00 registrado em Transporte \/ TRANSPORTE PARTICULAR!/
            }
        ]
    },
    {
        name: 'Apagar Última Saída (Admin)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'apagar última saída',
                expected: /Última saída de R\$.* da categoria .* apagada com sucesso!/ // Espera que o bot confirme o item apagado
            }
        ]
    },
    {
        name: 'Apagar Saída Específica (Admin)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'apagar saída de 250 reais do Assaí',
                expected: /Saída de R\$250,00 da categoria Alimentação apagada com sucesso!/
            }
        ]
    },


    // --- Seção 2: Entradas (Recebimentos) ---
    {
        name: 'Cenário 2.1: Entrada Interativa com Mapeamento sem Acento',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'recebi 5000 do salario', // Sem acento
                expected: /Entendido! E onde você recebeu esse valor\? \(Conta Corrente, Poupança, PIX ou Dinheiro\)/
            },
            {
                input: 'conta corrente',
                expected: /✅ Entrada de R\$5000,00 registrada na categoria Salário!/
            }
        ]
    },
    {
        name: 'Parte 2.1 - Teste de Categoria de Entrada',
        type: 'single-step',
        input: 'recebi 5000 do meu salário de julho',
        expected: /Entrada de R\$5000,00 registrada na categoria Salário!/,
        sender: adminId
    },
    {
        name: 'Parte 2.2 - Teste de Recebimento Informado',
        type: 'single-step',
        input: 'vendi o videogame por 1500 reais no pix, finalmente!',
        expected: /Entrada de R\$1500,00 registrada na categoria Venda! Observações: finalmente!/,
        sender: adminId
    },
    {
        name: 'Parte 3.2 - Teste de Pergunta de Recebimento (com erro de digitação)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'recebi 100 reais de presente da minha mãe',
                expected: /Entendido! E onde você recebeu esse valor\? \(Conta Corrente, Poupança, PIX ou Dinheiro\)/
            },
            {
                input: 'conta corente', // Typos aqui
                expected: /Entrada de R\$100,00 registrada na categoria Presente!/
            }
        ]
    },
    {
        name: 'Apagar Última Entrada (Admin)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'apagar última entrada',
                expected: /Última entrada de R\$.* da categoria .* apagada com sucesso!/
            }
        ]
    },
    {
        name: 'Apagar Entrada Específica (Admin)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'apagar entrada de 5000 reais de salário',
                expected: /Entrada de R\$5000,00 da categoria Salário apagada com sucesso!/
            }
        ]
    },

    // --- Seção 3: Dívidas (Criação e Pagamento) ---
    {
        name: 'Cenário 3.1: Criação de uma Nova Dívida (Fluxo Completo)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            { input: 'quero criar uma dívida', expected: /Qual o nome da dívida\?/ },
            { input: 'Financiamento Apartamento', expected: /Para quem você deve\?/ },
            { input: 'Caixa', expected: /Qual o tipo da dívida\?/ },
            { input: 'financiamneto', expected: /Qual foi o valor original\?/ }, // Typos aqui
            { input: '200000', expected: /O saldo devedor atual ainda é...\?/ },
            { input: '195000', expected: /Qual o valor da parcela\?/ },
            { input: '1800', expected: /Qual a taxa de juros\?/ },
            { input: '10aa', expected: /Qual o dia do vencimento\?/ }, // Typos aqui
            { input: '15', expected: /Qual a data de início\?/ },
            { input: '01/01/2024', expected: /Qual o total de parcelas\?/ },
            { input: '360', expected: /Alguma observação\?/ },
            { input: 'não', expected: /Dívida "Financiamento Apartamento" registrada com sucesso!/ }
        ]
    },
    {
        name: 'Cenário 3.2: Registro de Pagamento de Dívida',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'paguei a dívida do apartamento',
                expected: /Encontrei a dívida "Financiamento Apartamento" com uma parcela de R\$1800\. Qual foi o valor que você pagou\?/
            },
            {
                input: '1800',
                expected: /✅ Pagamento de R\$1800,00 registrado! O novo saldo devedor.* é R\$.*\./
            }
        ]
    },
    {
        name: 'Adicionar Dívida Simples (Admin)',
        type: 'single-step',
        input: 'Devo 100 para o Pedro',
        expected: /Dívida de R\$100,00 para Pedro registrada com sucesso!/,
        sender: adminId
    },
    {
        name: 'Atualizar Dívida (Admin)',
        type: 'single-step',
        input: 'Atualizar dívida do Pedro para 70 reais',
        expected: /Dívida de Pedro atualizada para R\$70,00 com sucesso!/,
        sender: adminId
    },
    {
        name: 'Apagar Dívida Específica (Admin)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'apagar dívida do Pedro',
                expected: /Dívida de Pedro apagada com sucesso!/
            }
        ]
    },
    {
        name: 'Apagar Última Dívida (Admin)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'apagar última dívida',
                expected: /Última dívida de R\$.* para .* apagada com sucesso!/
            }
        ]
    },

    // --- Testes de Gerenciamento de Compras no Cartão ---
    {
        name: 'Adicionar Compra no Cartão (Admin)',
        type: 'single-step',
        input: 'Comprei 80 no cartão Nubank - Daniel: restaurante',
        expected: /Compra de R\$80,00 no Cartão Nubank - Daniel para Restaurante registrada com sucesso!/,
        sender: adminId
    },
    {
        name: 'Adicionar Compra no Cartão com Data (Admin)',
        type: 'single-step',
        input: 'Gastei 120 no cartão Nubank - Thais no dia 20: roupas',
        expected: /Compra de R\$120,00 no Cartão Nubank - Thais para Roupas registrada com sucesso!/,
        sender: adminId
    },
    {
        name: 'Apagar Compra no Cartão (Admin)',
        type: 'single-step',
        input: 'Apagar compra de 80 reais no Nubank - Daniel',
        expected: /Compra de R\$80,00 no Cartão Nubank - Daniel apagada com sucesso!/,
        sender: adminId
    },

    // --- Seção 4: Exclusão de Itens (Apagar) ---
    {
        name: 'Cenário 4.1: Exclusão Seletiva (Entrada)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'apagar entrada com presente', // Assumindo que há uma entrada de presente
                expected: /Mostrando uma lista numerada de todas as entradas da categoria "Presente"\./
            },
            {
                input: '1', // Seleciona o primeiro item da lista
                expected: /Confirmado\. Apagando 1 item\(ns\)\.\.\. Entrada de R\$.* da categoria Presente apagada com sucesso!/
            }
        ]
    },
    {
        name: 'Cenário 1: Exclusão do Último Item (Gasto)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'apagar ultimo gasto',
                expected: /Mostrando apenas o último gasto da sua planilha \(no nosso exemplo, ".*"\) e pedindo confirmação\./
            },
            {
                input: 'sim',
                expected: /Confirmado\. Apagando 1 item\(ns\)\.\.\. Saída de R\$.* da categoria .* apagada com sucesso!/
            }
        ]
    },
    {
        name: 'Cenário 2: Busca com Múltiplos Resultados e Exclusão Seletiva (Entrada)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'apagar entrada com salario', // Sem acento
                expected: /Mostrando uma lista numerada com os dois itens: 1\. Salário de Junho e 2\. Salario de Julho\./
            },
            {
                input: '2', // Para apagar apenas o segundo item
                expected: /Confirmado\. Apagando 1 item\(ns\)\.\.\. Entrada de R\$.* da categoria Salário apagada com sucesso!/
            }
        ]
    },
    {
        name: 'Cenário 3: Busca Inteligente da IA e Cancelamento (Saída)',
        type: 'multi-step',
        sender: adminId,
        steps: [
            {
                input: 'excluir saida restaurante', // Usando sinônimos
                expected: /Mostrando o item Almoço no restaurante e pedindo confirmação\./
            },
            {
                input: 'não', // Cancelamento
                expected: /Ok, a exclusão foi cancelada\./
            }
        ]
    },
    {
        name: 'Cenário 4: Busca por Item Inexistente (Gasto)',
        type: 'single-step',
        input: 'apagar gasto com aluguel de filme',
        expected: /Não encontrei nenhum item correspondente a "aluguel de filme" na aba "Saídas"\./,
        sender: adminId
    },

    // --- Seção 5: Consultas e Geral ---
    {
        name: 'Cenário 5.1: Pergunta vs. Conversa - Saudação',
        type: 'single-step',
        input: 'bom dia, como você está?',
        expected: /Estou bem, obrigado por perguntar! Como posso ajudar você hoje\?/, // Resposta do Gemini
        sender: adminId
    },
    {
        name: 'Cenário 5.1: Pergunta vs. Conversa - Saldo Devedor',
        type: 'single-step',
        input: 'qual meu saldo devedor total?',
        expected: /Analisando seus dados para responder, um momento\.\.\. Seu saldo devedor total é de R\$.*\./, // Gemini + dados
        sender: adminId
    },
    {
        name: 'Parte 4.1 - Teste de Pergunta (Transporte)',
        type: 'single-step',
        input: 'quanto gastei com transporte?',
        expected: /Você gastou um total de R\$.* com Transporte neste mês\./,
        sender: adminId
    },
    {
        name: 'Consulta de Saldo (Admin)',
        type: 'single-step',
        input: 'Qual meu saldo?',
        expected: /Seu saldo atual é de R\$.*\./,
        sender: adminId
    },
    {
        name: 'Consulta de Dívidas (Admin)',
        type: 'single-step',
        input: 'Resumo das dívidas',
        expected: /Você tem dívidas pendentes com: Financiamento Apartamento \(R\$.*\)/, // Pode listar mais de uma
        sender: adminId
    },
    {
        name: 'Consulta de Gastos no Mês (Admin)',
        type: 'single-step',
        input: 'Quanto gastei este mês?',
        expected: /Você gastou um total de R\$.* neste mês\./,
        sender: adminId
    },
    {
        name: 'Consulta de Orçamento (Admin)',
        type: 'single-step',
        input: 'Meu orçamento para alimentação',
        expected: /Seu orçamento para alimentação é de R\$.* e você já gastou R\$.*\./,
        sender: adminId
    },
    {
        name: 'Consulta de Metas (Admin)',
        type: 'single-step',
        input: 'Quais são minhas metas?',
        expected: /Suas metas registradas são:/, // Pode listar várias
        sender: adminId
    },
    {
        name: 'Consulta de Patrimônio (Admin)',
        type: 'single-step',
        input: 'Qual meu patrimônio?',
        expected: /Seu patrimônio atual é de R\$.*\./,
        sender: adminId
    },
    {
        name: 'Perguntar sobre Categorias de Dívidas (Admin)',
        type: 'single-step',
        input: 'Quais categorias de dívidas eu tenho?',
        expected: /As categorias de dívidas que você tem são: Financiamento/, // Pode listar mais de uma
        sender: adminId
    },
    {
        name: 'Perguntar sobre Limite de Cartão (Admin)',
        type: 'single-step',
        input: 'Qual o limite do meu cartão Nubank - Daniel?',
        expected: /O limite do seu cartão Nubank - Daniel é de R\$.*\./,
        sender: adminId
    },
    {
        name: 'Extrato de Conta (Admin)',
        type: 'single-step',
        input: 'Extrato da conta Bradesco',
        expected: /Extrato da conta Bradesco: Saldo atual R\$.*\./, // Pode ser um resumo ou lista
        sender: adminId
    },

    // --- Testes de Agendamento (se implementado via texto) ---
    {
        name: 'Agendar Lembrete (Admin)',
        type: 'single-step',
        input: 'Me lembre de pagar a conta de água dia 10 de janeiro',
        expected: /Lembrete "Pagar conta de água" agendado para 10 de janeiro com sucesso!/,
        sender: adminId
    },
    {
        name: 'Adicionar Tarefa (Admin)',
        type: 'single-step',
        input: 'Adicionar tarefa: comprar mantimentos',
        expected: /Tarefa "Comprar mantimentos" adicionada com sucesso!/,
        sender: adminId
    },

    // --- Testes de Mensagens Genéricas (IA Gemini) ---
    {
        name: 'Parte 5.1 - Teste de Conversa Normal',
        type: 'single-step',
        input: 'oi, tudo bem por aí?',
        expected: /Estou bem, obrigado por perguntar! Como posso ajudar você hoje\?/, // Gemini pode variar
        sender: adminId
    },
    {
        name: 'Mensagem Genérica Complexa (Admin)',
        type: 'single-step',
        input: 'Me explique sobre investimentos de baixo risco.',
        expected: /Investimentos de baixo risco são aqueles que oferecem menor volatilidade/, // Gemini pode variar
        sender: adminId
    },
    {
        name: 'Mensagem Genérica Simples (Com Contexto do Usuário)',
        type: 'single-step',
        input: 'Olá bot, você me conhece?',
        expected: /Sim, eu me lembro que você é Daniel da Silva, um Bombeiro Militar e Cantor lírico que trabalha na CBMERJ\./, // Gemini pode variar
        sender: adminId // Usando adminId para testar o user-global-context
    },
];

// --- Executor de Testes ---

async function runTests() {
    console.log('--- Iniciando Configuração do Bot para Testes ---');
    try {
        // Autoriza as APIs do Google e carrega os IDs das abas uma vez
        await authorizeGoogle();
        await getSheetIds();
        console.log('✅ Google APIs configuradas para testes.');
    } catch (error) {
        console.error('❌ Erro na configuração das Google APIs:', error);
        process.exit(1); // Sai se a configuração inicial falhar
    }
    console.log('--- Configuração Concluída. Iniciando Testes Funcionais ---');

    for (const testCase of testCases) {

         resetAllStates(); 
        botResponse = null;

        console.log(`\n--- Teste: ${testCase.name} ---`);
        
        if (testCase.type === 'multi-step') {
            console.log(`Tipo: Multi-passos`);
            let allStepsPassed = true;
            for (let i = 0; i<testCase.steps.length; i++) {
                const step = testCase.steps[i];
                console.log(`  Passo ${i + 1} - Entrada: "${step.input}"`);
                botResponse = null; // Reseta a resposta capturada para cada passo

                const mockMessage = createMockMessage(step.input, testCase.sender);
                
                try {
                    await handleMessage(mockMessage);
                    // Pequeno atraso para garantir que todas as operações assíncronas (Gemini, Google Sheets) sejam concluídas
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Aumentado para 3 segundos

                    if (botResponse) {
                        if (step.expected instanceof RegExp) {
                            if (step.expected.test(botResponse)) {
                                console.log(`  ✅ SUCESSO! Resposta esperada (${step.expected}) encontrada.`);
                            } else {
                                console.error(`  ❌ FALHA! Resposta inesperada no Passo ${i + 1} para "${testCase.name}".`);
                                console.error(`    Esperado: ${step.expected}`);
                                console.error(`    Recebido: "${botResponse}"`);
                                allStepsPassed = false;
                                break; // Para o teste multi-passos no primeiro erro
                            }
                        } else { // Se a expectativa for uma string simples
                            if (botResponse.includes(step.expected)) {
                                console.log(`  ✅ SUCESSO! Resposta esperada ("${step.expected}") encontrada.`);
                            } else {
                                console.error(`  ❌ FALHA! Resposta inesperada no Passo ${i + 1} para "${testCase.name}".`);
                                console.error(`    Esperado: "${step.expected}"`);
                                console.error(`    Recebido: "${botResponse}"`);
                                allStepsPassed = false;
                                break;
                            }
                        }
                    } else {
                        console.error(`  ❌ FALHA! Nenhuma resposta do bot no Passo ${i + 1} para "${testCase.name}".`);
                        allStepsPassed = false;
                        break;
                    }
                } catch (error) {
                    console.error(`  ❌ ERRO durante o Passo ${i + 1} do teste "${testCase.name}":`, error);
                    allStepsPassed = false;
                    break;
                }
            }
            if (allStepsPassed) {
                console.log(`✅ TESTE MULTI-PASSOS "${testCase.name}" CONCLUÍDO COM SUCESSO!`);
            } else {
                console.error(`❌ TESTE MULTI-PASSOS "${testCase.name}" FALHOU.`);
            }

        } else { // Single-step test
            console.log(`Mensagem de Entrada: "${testCase.input}"`);
            botResponse = null; // Reseta a resposta capturada

            const mockMessage = createMockMessage(testCase.input, testCase.sender);
            
            try {
                await handleMessage(mockMessage);
                await new Promise(resolve => setTimeout(resolve, 3000)); // Atraso para processamento

                if (botResponse) {
                    if (testCase.expected instanceof RegExp) {
                        if (testCase.expected.test(botResponse)) {
                            console.log(`✅ SUCESSO! Resposta esperada (${testCase.expected}) encontrada.`);
                        } else {
                            console.error(`❌ FALHA! Resposta inesperada para "${testCase.name}".`);
                            console.error(`  Esperado: ${testCase.expected}`);
                            console.error(`  Recebido: "${botResponse}"`);
                        }
                    } else { // Se a expectativa for uma string simples
                        if (botResponse.includes(testCase.expected)) {
                            console.log(`✅ SUCESSO! Resposta esperada ("${testCase.expected}") encontrada.`);
                        } else {
                            console.error(`❌ FALHA! Resposta inesperada para "${testCase.name}".`);
                            console.error(`  Esperado: "${testCase.expected}"`);
                            console.error(`  Recebido: "${botResponse}"`);
                        }
                    }
                } else {
                    console.error(`❌ FALHA! Nenhuma resposta do bot para "${testCase.name}".`);
                }
            } catch (error) {
                console.error(`❌ ERRO durante o teste "${testCase.name}":`, error);
            }
        }
    }
    console.log('\n--- Testes Funcionais Concluídos ---');
}

// Inicia a execução dos testes
runTests();