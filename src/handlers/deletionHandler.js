// src/handlers/deletionHandler.js

const { readDataFromSheet, deleteRowsByIndices } = require('../services/google');
const userStateManager = require('../state/userStateManager');
const { sheetCategoryMap } = require('../config/constants');
const { normalizeText } = require('../utils/helpers');
const stringSimilarity = require('string-similarity');

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
  const colValor = getColIndex(headerMap, ['valor'], 4);
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

async function handleDeletionRequest(msg, deleteDetails) {
  const senderId = msg.author || msg.from;

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

  const sheetName = sheetCategoryMap[categoriaCanonica];
  if (!sheetName) {
    userStateManager.clearState(senderId);
    await msg.reply(`Não entendi se você quer apagar um 'gasto', 'entrada', etc.`);
    return;
  }

  const allData = await readDataFromSheet(sheetName);
  if (!allData || allData.length <= 1) {
    userStateManager.clearState(senderId);
    await msg.reply(`A aba "${sheetName}" já está vazia.`);
    return;
  }

  const termoBuscaNorm = normalizeText(termoBusca);
  const tokens = tokenizeQuery(termoBusca);
  const amount = extractAmount(termoBusca); // pode ser null
  const date = extractDate(termoBusca);     // pode ser null
  const headerMap = getHeaderMap(allData);

  let rowsToDelete = [];

  // ✅ "último/ultima/ultimo" em qualquer forma
  if (termoBuscaNorm.includes('ultimo') || termoBuscaNorm.includes('ultima')) {
    const lastRowIndex = allData.length - 1;
    if (lastRowIndex > 0) {
      rowsToDelete.push({ index: lastRowIndex, data: allData[lastRowIndex] });
    }
  } else {
    // score em todas as linhas (exceto header)
    const scored = allData
        .map((row, index) => ({ row, index }))
        .filter(x => x.index !== 0 && Array.isArray(x.row)) // ✅ evita row undefined => crash
        .map(x => {
            const s = scoreRow({
            row: x.row,
            headerMap,
            sheetName,
            queryNorm: termoBuscaNorm,
            tokens,
            amount,
            date
            });

            return { index: x.index, row: x.row, score: s.score, matchedTokens: s.matchedTokens };
        })
        .filter(x => {
            // ✅ Regra de segurança: se o usuário digitou 2+ tokens relevantes,
            // exige pelo menos 2 tokens batendo (não apaga "aluguel" quando pediu "aluguel filme").
            if (tokens.length >= 2) return x.matchedTokens >= 2 && x.score >= 3.0;

            // ✅ Caso simples (1 token): mantém limiar
            return x.score >= 2.5;
        })
        .sort((a, b) => b.score - a.score);

        rowsToDelete = scored.map(x => ({ index: x.index, data: x.row }));

        // ✅ fallback: se nada passou no score, tenta contains bruto do termo normalizado
        if (rowsToDelete.length === 0 && tokens.length > 0) {
            const minTokenMatches = tokens.length >= 2 ? 2 : 1;

                const fallback = allData
                .map((row, index) => ({ row, index }))
                .filter(x => x.index !== 0 && Array.isArray(x.row))
                .filter(x => {
                const joined = normalizeText(x.row.join(' '));
                const matches = tokens.filter(t => t.length >= 3 && joined.includes(t)).length;
                return matches >= minTokenMatches;
                });

                rowsToDelete = fallback.map(x => ({ index: x.index, data: x.row }));
        }
    }

  if (rowsToDelete.length === 0) {
    userStateManager.clearState(senderId);

    let helpMessage = `Não encontrei nenhum item contendo "${termoBusca}" na aba "${sheetName}".\n\n`;
    helpMessage += `*Dica:* tente incluir o tipo, valor e/ou data. Exemplos:\n`;
    helpMessage += `- "apagar *gasto* com uber"\n`;
    helpMessage += `- "apagar *saida* de 250 do assai"\n`;
    helpMessage += `- "apagar *entrada* de 50 (07/01/2026)"`;

    await msg.reply(helpMessage);
    return;
  }

  // ✅ não deixa o usuário preso com estados antigos
  userStateManager.clearState(senderId);
  userStateManager.setState(senderId, {
    action: 'confirming_delete',
    sheetName,
    foundItems: rowsToDelete
  });

  let confirmationMessage = `Encontrei ${rowsToDelete.length} item(ns) para apagar na aba "${sheetName}":\n\n`;
  const safeCell = (v) =>
    String(v ?? '')
        .replace(/\s+/g, ' ')
        .trim();

        rowsToDelete.forEach((item, idx) => {
            const line = item.data
                .slice(0, 5)
                .map(safeCell)
                .join(' | ');

            confirmationMessage += `*${idx + 1}.* ${line}\n`;
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
    await msg.reply('Ok, a exclusão foi cancelada.');
    userStateManager.clearState(senderId);
    return;
    }
  let finalRowsToDelete = [];

  // ✅ aceita variações: "sim", "s", "ss", "sm", "claro", "pode", etc.
  const yesWords = ['sim','s','ss','sm','claro','pode','confirmo','confirmar','ok','pode sim','isso','apaga','apagar'];
  const isYes = yesWords.some(w => stringSimilarity.compareTwoStrings(userReply, w) > 0.72);

  if (isYes) {
    finalRowsToDelete = state.foundItems.map(item => item.index);
  } else {
    const indicesToSelect = (msg.body || '').match(/\d+/g)?.map(n => parseInt(n, 10) - 1) || [];
    const validItems = indicesToSelect.map(idx => state.foundItems[idx]).filter(Boolean);

    if (validItems.length > 0) {
      finalRowsToDelete = validItems.map(item => item.index);
    } else {
      await msg.reply("Não entendi sua seleção. A exclusão foi cancelada.");
      userStateManager.clearState(senderId);
      return;
    }
  }

  // ✅ dedupe + ordena DESC (mais seguro ao deletar várias linhas)
  finalRowsToDelete = Array.from(new Set(finalRowsToDelete)).sort((a, b) => b - a);

  if (finalRowsToDelete.length > 0) {
    await msg.reply(`Confirmado. Apagando ${finalRowsToDelete.length} item(ns)...`);
    const result = await deleteRowsByIndices(state.sheetName, finalRowsToDelete);

    if (result.success) {
      await msg.reply(`✅ Item(ns) apagado(s) com sucesso!`);
    } else {
      await msg.reply(result.message || "Ocorreu um erro ao apagar.");
    }
  } else {
    await msg.reply("Nenhum item selecionado. A exclusão foi cancelada.");
  }

  userStateManager.clearState(senderId);
}

module.exports = {
  handleDeletionRequest,
  confirmDeletion,
};
