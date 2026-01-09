// test/suites/date_time_normalizer_tests.js
const assert = require('assert');
const { buildCalendarStartEnd, normalizeRecurrenceToRrule } = require('../../src/utils/dateTimeNormalizer');

async function runDateTimeNormalizerTests() {
  console.log('\n--- SUÍTE DE TESTES: DateTimeNormalizer (Unit) ---');

  // date-only válido
  assert.ok(buildCalendarStartEnd('10/01/2026'));
  assert.deepStrictEqual(buildCalendarStartEnd('10/01/2026').start, { date: '2026-01-10' });

  // date-only inválido
  assert.strictEqual(buildCalendarStartEnd('32/01/2026'), null);

  // dateTime pt-BR
  assert.ok(buildCalendarStartEnd('10/01/2026 10:00'));

  // dateTime com "às/as"
  assert.ok(buildCalendarStartEnd('10/01/2026 às 10:00'));
  assert.ok(buildCalendarStartEnd('10/01/2026 as 10:00'));

  // ISO com ms e Z
  assert.ok(buildCalendarStartEnd('2026-01-07T09:00:00.000Z'));

  // RRULE
  assert.strictEqual(normalizeRecurrenceToRrule('FREQ=DAILY'), 'RRULE:FREQ=DAILY');
  assert.strictEqual(normalizeRecurrenceToRrule('Diariamente'), 'RRULE:FREQ=DAILY');

  console.log('✅ DateTimeNormalizer (Unit) OK');
  console.log('\n--- FIM DA SUÍTE: DateTimeNormalizer (Unit) ---');
}

module.exports = { runDateTimeNormalizerTests };