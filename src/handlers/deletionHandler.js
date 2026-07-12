// src/handlers/deletionHandler.js

const { readDataFromSheet, deleteRowsByIndices } = require('../services/google');
const userStateManager = require('../state/userStateManager');
const { sheetCategoryMap, creditCardConfig } = require('../config/constants');
const { normalizeText, parseSheetDate } = require('../utils/helpers');
const { getUserByWhatsAppId } = require('../services/userService');
const stringSimilarity = require('string-similarity');

const USER_ID_FALLBACK_INDEX_BY_SHEET = {
  'Saídas': 9,
  'Entradas': 8,
  'Metas': 8,
  'Dívidas': 17,
  'Lançamentos Cartão': 9,
};

const CREDIT_CARD_SHEET_NAMES = Array.from(new Set(
  Object.values(creditCardConfig || {})
    .map(config => config?.sheetName)
    .filter(Boolean)
));

for (const sheetName of CREDIT_CARD_SHEET_NAMES) {
  USER_ID_FALLBACK_INDEX_BY_SHEET[sheetName] = 6;
}

function canonicalizeCategory(raw) {
  const c = normalizeText(raw || '');

  // Canonização ampla (usuário + IA)
  // normalizeText já remove acentos, então "saída" vira "saida".
  const alias = {
    // gastos/saídas
    saida: 'gasto',
    saidas: 'gasto',
    gasto: 'gasto',
    gastos: 'gasto',
    despesa: 'gasto',
    despesas: 'gasto',
    compra: 'gasto',
    compras: 'gasto',
    pagamento: 'gasto',
    pagamentos: 'gasto',
    transacao: 'gasto',
    transacoes: 'gasto',
    lancamento: 'gasto',
    lancamentos: 'gasto',

    // entradas
    entrada: 'entrada',
    entradas: 'entrada',
    receber: 'entrada',
    recebimento: 'entrada',
    recebimentos: 'entrada',
    receita: 'entrada',
    receitas: 'entrada',

    // dívidas
    divida: 'divida',
    dividas: 'divida',
    emprestimo: 'divida',
    emprestimos: 'divida',
    financiamento: 'divida',
    financiamentos: 'divida',
  };

  if (alias[c]) return alias[c];

  // fallback heurístico (se a IA mandar algo tipo "última saída")
  if (c.includes('saida') || c.includes('despesa') || c.includes('gasto')) return 'gasto';
  if (c.includes('entrada') || c.includes('receb')) return 'entrada';
  if (c.includes('divid') || c.includes('emprest') || c.includes('financi')) return 'divida';

  return c;
}

function getHeaderMap(allData) {
  const header = Array.isArray(allData?.[0]) ? allData[0] : [];
  const map = {};
  header.forEach((h, idx) => {
    const key = normalizeText(h || '');
    if (key) map[key] = idx;
  });
  return map;
}

function getColIndex(headerMap, candidates, fallbackIndex) {
  for (const c of candidates) {
    const key = normalizeText(c);
    if (headerMap[key] !== undefined) return headerMap[key];
  }
  return fallbackIndex;
}

function getUserIdIndex(headerMap, sheetName) {
  return getColIndex(
    headerMap,
    ['user_id', 'usuario_id', 'id_usuario'],
    USER_ID_FALLBACK_INDEX_BY_SHEET[sheetName]
  );
}

function getValueFallbackIndex(sheetName) {
  if (sheetName === 'Lançamentos Cartão' || CREDIT_CARD_SHEET_NAMES.includes(sheetName)) return 3;
  return 4;
}

function getDeletionSheetNames(canonicalCategory) {
  const primary = sheetCategoryMap[canonicalCategory];
  if (canonicalCategory !== 'gasto') return primary ? [primary] : [];

  return [
    'Saídas',
    'Lançamentos Cartão',
    ...CREDIT_CARD_SHEET_NAMES
  ];
}

function filterCandidateRowsByUserId(allData, headerMap, sheetName, userId) {
  const userIdIndex = getUserIdIndex(headerMap, sheetName);
  if (!Number.isInteger(userIdIndex) || !userId) return [];

  return (allData || [])
    .map((row, index) => ({ row, index }))
    .filter(item => item.index !== 0 && Array.isArray(item.row))
    .filter(item => String(item.row[userIdIndex] || '').trim() === String(userId).trim());
}

function extractAmount(query) {
  // captura números com milhar e decimal pt-br e também "250" simples
  // exemplos: "R$ 250,00", "250 reais", "250"
  const q = (query || '').replace(/\s+/g, ' ');
  const m = q.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2})?)/i);
  if (!m) return null;

  const raw = m[1];
  // pt-br: 1.234,56 => 1234.56
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;

  const v = Number(normalized);
  return Number.isFinite(v) ? v : null;
}

function extractDate(query) {
  const m = (query || '').match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  return m ? m[1] : null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readSheetWithRetry(range, { minRows = 1, retries = 3, delayMs = 500 } = {}) {
  let rows = [];
  for (let attempt = 0; attempt < retries; attempt += 1) {
    rows = await readDataFromSheet(range);
    if (rows && rows.length >= minRows) return rows;
    if (attempt < retries - 1) await sleep(delayMs);
  }
  return rows || [];
}

function tokenizeQuery(query) {
  const stop = new Set([
    'de','do','da','dos','das','com','no','na','nos','nas','em','a','o','e','para','pra','por',
    'reais','real','r','rs','r$','ultima','ultimo','ultimos','ultimas',
    'gasto','gastos','saida','saidas','entrada','entradas','divida','dividas'
  ]);

  return normalizeText(query || '')
    .split(' ')
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => !stop.has(t));
}

function getRowTimestamp(row, headerMap) {
  const colData = getColIndex(headerMap, ['data'], 0);
  const raw = Array.isArray(row) ? row[colData] : '';
  const parsed = parseSheetDate(String(raw || '').trim());
  return parsed ? parsed.getTime() : 0;
}

function scoreRow({ row, headerMap, sheetName, queryNorm, tokens, amount, date }) {
     // ✅ Nunca quebra se row vier undefined/null/valor estranho
  if (!Array.isArray(row)) {
    return { score: 0, matchedTokens: 0 };
  }

  const safe = (i) => (Number.isInteger(i) && i >= 0 && i < row.length ? row[i] : '');

  const colData = getColIndex(headerMap, ['data'], 0);
  const colDescricao = getColIndex(headerMap, ['descricao', 'descrição', 'nome'], 1);
  const colCategoria = getColIndex(headerMap, ['categoria'], 2);
  const colSubcategoria = getColIndex(headerMap, ['subcategoria'], 3);
  const colValor = getColIndex(headerMap, ['valor', 'valor parcela', 'valor_parcela'], getValueFallbackIndex(sheetName));
  const colObservacoes = getColIndex(headerMap, ['observacoes', 'observações', 'obs'], 8);
  const colCredor = getColIndex(headerMap, ['credor'], 1);

  const fields = [
    safe(colDescricao),
    safe(colCategoria),
    safe(colSubcategoria),
    safe(colObservacoes),
  ];

  if (sheetName === 'Dívidas') fields.push(safe(colCredor));

  const text = normalizeText(fields.filter(Boolean).join(' '));
  if (!text) return { score: 0, matchedTokens: 0 };

  let score = 0;
  let matchedTokens = 0;

  // tokens + tolerância a erro
  for (const t of tokens) {
    let matchedThis = false;

    if (t.length >= 3 && text.includes(t)) {
      score += 2.5;
      matchedThis = true;
    } else {
      const words = text.split(' ').filter(Boolean);
      const best = words.reduce((acc, w) => Math.max(acc, stringSimilarity.compareTwoStrings(w, t)), 0);
      if (best > 0.82) { score += 2.0; matchedThis = true; }
      else if (best > 0.72) { score += 1.0; matchedThis = true; }
    }

    if (matchedThis) matchedTokens += 1;
  }

  // similaridade global (fallback)
  const sim = stringSimilarity.compareTwoStrings(text, queryNorm);
  if (sim > 0.70) score += 2.0;
  else if (sim > 0.60) score += 1.0;

  // reforço por valor (se o usuário citou)
  if (amount !== null) {
    const parsed = extractAmount(String(safe(colValor) || ''));
    if (parsed !== null) {
      if (Math.abs(parsed - amount) < 0.01) score += 3.5;
      else if (Math.abs(parsed - amount) <= 1) score += 1.0;
      else score -= 1.0;
    }
  }

  // reforço por data (se o usuário citou)
  if (date) {
    const rawDate = String(safe(colData) || '');
    if (rawDate.includes(date)) score += 2.0;
    else score -= 0.5;
  }

  return { score, matchedTokens };
}

async function collectDeletionCandidates(sheetName, userId, readOptions = {}) {
  const allData = await readSheetWithRetry(sheetName, { minRows: 2, ...readOptions });
  if (!allData || allData.length <= 1) {
    return {
      sheetName,
      empty: true,
      headerMap: {},
      candidateRows: []
    };
  }

  const headerMap = getHeaderMap(allData);
  const candidateRows = filterCandidateRowsByUserId(allData, headerMap, sheetName, userId)
    .map(item => ({
      ...item,
      sheetName,
      headerMap
    }));

  return {
    sheetName,
    empty: false,
    headerMap,
    candidateRows
  };
}

function pickLatestCandidate(candidates = []) {
  return candidates
    .map((item, order) => ({
      ...item,
      order,
      timestamp: getRowTimestamp(item.row, item.headerMap)
    }))
    .sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      if (b.index !== a.index && a.sheetName === b.sheetName) return b.index - a.index;
      return b.order - a.order;
    })[0] || null;
}

async function handleDeletionRequest(msg, deleteDetails) {
  const senderId = msg.author || msg.from;
  const user = await getUserByWhatsAppId(senderId);
  if (!user || !user.user_id) {
    userStateManager.clearState(senderId);
    await msg.reply('Não consegui identificar seu usuário para apagar esse item.');
    return;
  }

  // ✅ se tinha exclusão pendente, zera para não prender o usuário
  const previousState = userStateManager.getState(senderId);
  if (previousState && previousState.action === 'confirming_delete') {
    userStateManager.clearState(senderId);
  }

  if (!deleteDetails || !deleteDetails.descricao || !deleteDetails.categoria) {
    userStateManager.clearState(senderId);
    await msg.reply("Não consegui entender os detalhes do que apagar. Tente novamente, por exemplo: 'apagar gasto com uber'.");
    return;
  }

  const termoBusca = String(deleteDetails.descricao || '');
  const categoriaCanonica = canonicalizeCategory(deleteDetails.categoria);

  const sheetNames = getDeletionSheetNames(categoriaCanonica);
  if (!sheetNames.length) {
    userStateManager.clearState(senderId);
    await msg.reply(`Não entendi se você quer apagar um 'gasto', 'entrada', etc.`);
    return;
  }

  const sheetResults = [];
  const readOptions = sheetNames.length > 1 ? { retries: 1 } : {};
  for (const sheetName of sheetNames) {
    const result = await collectDeletionCandidates(sheetName, user.user_id, readOptions);
    sheetResults.push(result);

    // Em planilhas novas, Lançamentos Cartão substitui as abas legadas de cartão.
    // Se ela já trouxe candidatos, evitar ler as abas legadas que mapeiam para a mesma aba.
    if (categoriaCanonica === 'gasto' && sheetName === 'Lançamentos Cartão' && result.candidateRows.length > 0) {
      break;
    }
  }

  const candidateRows = sheetResults.flatMap(result => result.candidateRows);
  const allSheetsEmpty = sheetResults.every(result => result.empty);
  const singleSheetName = sheetNames.length === 1 ? sheetNames[0] : null;

  if (singleSheetName && allSheetsEmpty) {
    userStateManager.clearState(senderId);
    await msg.reply(`A aba "${singleSheetName}" já está vazia.`);
    return;
  }

  const termoBuscaNorm = normalizeText(termoBusca);
  const tokens = tokenizeQuery(termoBusca);
  const amount = extractAmount(termoBusca); // pode ser null
  const date = extractDate(termoBusca);     // pode ser null

  let rowsToDelete = [];

  // ✅ "último/ultima/ultimo" em qualquer forma
  if (termoBuscaNorm.includes('ultimo') || termoBuscaNorm.includes('ultima')) {
    const lastOwnedRow = pickLatestCandidate(candidateRows);
    if (lastOwnedRow) {
      rowsToDelete.push({ sheetName: lastOwnedRow.sheetName, index: lastOwnedRow.index, data: lastOwnedRow.row });
    }
  } else {
    // score em todas as linhas (exceto header)
    const scored = candidateRows
        .map(x => {
            const s = scoreRow({
            row: x.row,
            headerMap: x.headerMap,
            sheetName: x.sheetName,
            queryNorm: termoBuscaNorm,
            tokens,
            amount,
            date
            });

            return { sheetName: x.sheetName, index: x.index, row: x.row, score: s.score, matchedTokens: s.matchedTokens };
        })
        .filter(x => {
            // ✅ Regra de segurança: se o usuário digitou 2+ tokens relevantes,
            // exige pelo menos 2 tokens batendo (não apaga "aluguel" quando pediu "aluguel filme").
            if (tokens.length >= 2) return x.matchedTokens >= 2 && x.score >= 3.0;

            // ✅ Caso simples (1 token): mantém limiar
            return x.score >= 2.5;
        })
        .sort((a, b) => b.score - a.score);

        rowsToDelete = scored.map(x => ({ sheetName: x.sheetName, index: x.index, data: x.row }));

        // ✅ fallback: se nada passou no score, tenta contains bruto do termo normalizado
        if (rowsToDelete.length === 0 && tokens.length > 0) {
            const minTokenMatches = tokens.length >= 2 ? 2 : 1;

                const fallback = candidateRows
                .filter(x => {
                const joined = normalizeText(x.row.join(' '));
                const matches = tokens.filter(t => t.length >= 3 && joined.includes(t)).length;
                return matches >= minTokenMatches;
                });

                rowsToDelete = fallback.map(x => ({ sheetName: x.sheetName, index: x.index, data: x.row }));
        }
    }

  if (rowsToDelete.length === 0) {
    userStateManager.clearState(senderId);

    const scopeLabel = singleSheetName ? `na aba "${singleSheetName}"` : 'nas abas de gastos e cartões';
    let helpMessage = `Não encontrei nenhum item contendo "${termoBusca}" ${scopeLabel}.\n\n`;
    helpMessage += `*Dica:* tente incluir o tipo, valor e/ou data. Exemplos:\n`;
    helpMessage += `- "apagar *gasto* com uber"\n`;
    helpMessage += `- "apagar *saida* de 250 do assai"\n`;
    helpMessage += `- "apagar *entrada* de 50 (07/01/2026)"`;

    await msg.reply(helpMessage);
    return;
  }

  // ✅ não deixa o usuário preso com estados antigos
  userStateManager.clearState(senderId);
  const stateSheetName = rowsToDelete.every(item => item.sheetName === rowsToDelete[0]?.sheetName)
    ? rowsToDelete[0]?.sheetName
    : '';
  userStateManager.setState(senderId, {
    action: 'confirming_delete',
    sheetName: stateSheetName,
    user_id: user.user_id,
    foundItems: rowsToDelete
  });

  let confirmationMessage = stateSheetName
    ? `Encontrei ${rowsToDelete.length} item(ns) para apagar na aba "${stateSheetName}":\n\n`
    : `Encontrei ${rowsToDelete.length} item(ns) para apagar:\n\n`;
  const safeCell = (v) =>
    String(v ?? '')
        .replace(/\s+/g, ' ')
        .trim();

        rowsToDelete.forEach((item, idx) => {
            const line = item.data
                .slice(0, 5)
                .map(safeCell)
                .join(' | ');

            const sheetPrefix = stateSheetName ? '' : `[${item.sheetName}] `;
            confirmationMessage += `*${idx + 1}.* ${sheetPrefix}${line}\n`;
        });
  confirmationMessage += "\nVocê tem certeza? Responda com *'sim'* para apagar tudo, ou os números dos itens que quer apagar (ex: *1* ou *1, 2*).";

  await msg.reply(confirmationMessage);
}

async function confirmDeletion(msg) {
  const senderId = msg.author || msg.from;
  const state = userStateManager.getState(senderId);
  if (!state || state.action !== 'confirming_delete') return;

  const userReply = normalizeText(msg.body || '');
    // ✅ trata cancelamento explícito (usuário + IA)
    // normalizeText transforma "não" -> "nao"
    const noWords = ['nao', 'n', 'negativo', 'cancela', 'cancelar', 'pare', 'parar'];
    const isNo = noWords.some(w => stringSimilarity.compareTwoStrings(userReply, w) > 0.78);

    if (isNo) {
    userStateManager.clearState(senderId);
    await msg.reply('Ok, a exclusão foi cancelada.');
    return;
    }
  let finalRowsToDelete = [];
  let finalItemsToDelete = [];

  // ✅ aceita variações: "sim", "s", "ss", "sm", "claro", "pode", etc.
  const yesWords = ['sim','s','ss','sm','claro','pode','confirmo','confirmar','ok','pode sim','isso','apaga','apagar'];
  const isYes = yesWords.some(w => stringSimilarity.compareTwoStrings(userReply, w) > 0.72);

  if (isYes) {
    finalItemsToDelete = state.foundItems;
  } else {
    const indicesToSelect = (msg.body || '').match(/\d+/g)?.map(n => parseInt(n, 10) - 1) || [];
    const validItems = indicesToSelect.map(idx => state.foundItems[idx]).filter(Boolean);

    if (validItems.length > 0) {
      finalItemsToDelete = validItems;
    } else {
      userStateManager.clearState(senderId);
      await msg.reply("Não entendi sua seleção. A exclusão foi cancelada.");
      return;
    }
  }

  const groupedBySheet = finalItemsToDelete.reduce((acc, item) => {
    const sheetName = item.sheetName || state.sheetName;
    if (!sheetName) return acc;
    if (!acc[sheetName]) acc[sheetName] = [];
    acc[sheetName].push(item.index);
    return acc;
  }, {});

  if (Object.keys(groupedBySheet).length > 0) {
    const total = Object.values(groupedBySheet).reduce((sum, rows) => sum + rows.length, 0);
    await msg.reply(`Confirmado. Apagando ${total} item(ns)...`);

    const results = [];
    for (const [sheetName, rows] of Object.entries(groupedBySheet)) {
      const finalRowsToDelete = Array.from(new Set(rows)).sort((a, b) => b - a);
      results.push(await deleteRowsByIndices(sheetName, finalRowsToDelete));
    }

    userStateManager.clearState(senderId);
    if (results.every(result => result.success)) {
      await msg.reply(`✅ Item(ns) apagado(s) com sucesso!`);
    } else {
      await msg.reply(results.find(result => !result.success)?.message || "Ocorreu um erro ao apagar.");
    }
  } else {
    userStateManager.clearState(senderId);
    await msg.reply("Nenhum item selecionado. A exclusão foi cancelada.");
  }
}

module.exports = {
  handleDeletionRequest,
  confirmDeletion,
  __test__: {
    canonicalizeCategory,
    filterCandidateRowsByUserId,
    getDeletionSheetNames,
    pickLatestCandidate,
  },
};
