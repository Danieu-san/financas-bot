const sameValue = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export function validateMaterializedFacts(fixture, oracle, factContracts) {
  const failures = [];
  const assert = (condition, message) => { if (!condition) failures.push(message); };
  const categories = new Map(fixture.categories.map(item => [item.id, item]));
  const events = fixture.events;
  const confirmedEvents = events.filter(event => event.state === 'confirmed');
  const byId = new Map();
  const kindById = new Map();
  for (const [kind, items] of Object.entries(fixture)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item.id !== 'string') continue;
      byId.set(item.id, item);
      kindById.set(item.id, kind);
    }
  }

  const membersOf = familyId => new Set(fixture.families.find(item => item.id === familyId)?.members ?? []);
  const monthOf = period => period.match(/\d{4}-\d{2}/)?.[0];
  const inMonth = (date, period) => date?.startsWith(monthOf(period) ?? '__invalid__');
  const rangeOf = period => period.includes('..') ? period.split('..') : [period, period];
  const inRange = (date, period) => {
    const [start, end] = rangeOf(period);
    if (typeof date !== 'string') return false;
    if (start.length === 7 && end.length === 7) return date.slice(0, 7) >= start && date.slice(0, 7) <= end;
    return date >= start && date <= end;
  };
  const categoryFor = event => {
    if (categories.get(event.category_id)?.kind !== 'compensation') return categories.get(event.category_id);
    return categories.get(events.find(candidate => candidate.id === event.compensates)?.category_id);
  };
  const consumptionValue = event => {
    const kind = categories.get(event.category_id)?.kind;
    return kind === 'expense' || kind === 'compensation' ? -event.amount_minor : 0;
  };
  const scopeMatches = (entity, event) => {
    if (entity.startsWith('person-')) return event.person_id === entity.split(':')[0];
    const familyId = entity.startsWith('family-') ? entity.split(':')[0] : 'family-example';
    return membersOf(familyId).has(event.person_id);
  };
  const categoryFromEntity = entity => entity.includes(':') ? entity.slice(entity.indexOf(':') + 1) : entity;
  const refs = (fact, kind) => fact.evidence_refs.filter(ref => kindById.get(ref) === kind).map(ref => byId.get(ref));
  const referencedEvents = fact => refs(fact, 'events');
  const sum = values => values.reduce((total, value) => total + value, 0);
  const scopedConsumption = fact => sum(confirmedEvents
    .filter(event => inMonth(event.date, fact.period) && scopeMatches(fact.entity, event))
    .map(consumptionValue));
  const categoryConsumption = fact => {
    const categoryId = categoryFromEntity(fact.entity);
    return sum(confirmedEvents
      .filter(event => inMonth(event.date, fact.period) && scopeMatches(fact.entity, event) && categoryFor(event)?.id === categoryId)
      .map(consumptionValue));
  };
  const instrumentConsumption = fact => sum(confirmedEvents
    .filter(event => inMonth(event.date, fact.period) && (event.account_id === fact.entity || event.card_id === fact.entity))
    .map(consumptionValue));
  const budgetRemaining = fact => {
    const budgetId = fact.entity.split(':')[0];
    const budget = fixture.budgets.find(item => item.id === budgetId);
    return budget.limit_minor - sum(referencedEvents(fact).map(consumptionValue));
  };
  const openBills = fact => fixture.bills.filter(bill => bill.status === 'open' && inMonth(bill.due_date, fact.period) && (
    fact.entity.startsWith('person-') ? bill.person_id === fact.entity : membersOf(fact.entity).has(bill.person_id)
  ));
  const income = fact => sum(confirmedEvents.filter(event => inMonth(event.date, fact.period) && scopeMatches(fact.entity, event)
    && categories.get(event.category_id)?.kind === 'income').map(event => event.amount_minor));

  const derive = {
    consumption_total: fact => scopedConsumption(fact),
    category_consumption: fact => categoryConsumption(fact),
    category_spent: fact => categoryConsumption(fact),
    movement_ids: fact => confirmedEvents.filter(event => event.account_id === fact.entity && inMonth(event.date, fact.period)).map(event => event.id),
    statement_total: fact => {
      const card = fixture.cards.find(item => item.id === fact.entity);
      const dueDate = fact.period.replace('statement_due:', '');
      const closeDate = `${dueDate.slice(0, 8)}${String(card.closing_day).padStart(2, '0')}`;
      const previous = new Date(`${closeDate}T00:00:00Z`);
      previous.setUTCMonth(previous.getUTCMonth() - 1);
      const previousClose = previous.toISOString().slice(0, 10);
      return sum(confirmedEvents.filter(event => event.card_id === fact.entity && event.date > previousClose && event.date <= closeDate)
        .map(consumptionValue));
    },
    account_balance: fact => {
      const account = fixture.accounts.find(item => item.id === fact.entity);
      const asOf = fact.period.replace('as_of:', '');
      return account.opening_balance_minor + sum(confirmedEvents.filter(event => event.account_id === fact.entity && event.date <= asOf)
        .map(event => event.amount_minor));
    },
    owned_cards: fact => fixture.cards.filter(card => card.owner_id === fact.entity).map(card => card.id),
    consumption_effect: fact => sum(referencedEvents(fact).map(consumptionValue)),
    net_consumption: fact => sum(referencedEvents(fact).map(consumptionValue)),
    installments_realized: fact => referencedEvents(fact).filter(event => event.state === 'confirmed').length,
    installments_projected: fact => referencedEvents(fact).filter(event => event.state === 'projected').length,
    installments_realized_amount: fact => sum(referencedEvents(fact).filter(event => event.state === 'confirmed').map(event => -event.amount_minor)),
    installments_projected_amount: fact => sum(referencedEvents(fact).filter(event => event.state === 'projected').map(event => -event.amount_minor)),
    projected_installments: fact => sum(referencedEvents(fact).filter(event => event.state === 'projected').map(event => -event.amount_minor)),
    eligible_event_count: fact => refs(fact, 'source_states')[0]?.event_count ?? confirmedEvents.filter(event =>
      inMonth(event.date, fact.period) && categoryFor(event)?.id === categoryFromEntity(fact.entity)).length,
    source_coverage: fact => refs(fact, 'source_states')[0]?.coverage,
    ranking_winner: fact => {
      const people = refs(fact, 'people');
      return people.map(person => ({ id: person.id, total: sum(confirmedEvents.filter(event => event.person_id === person.id && inMonth(event.date, fact.period)).map(consumptionValue)) }))
        .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))[0]?.id;
    },
    consumption_difference: fact => {
      const [left, right] = refs(fact, 'people');
      const personValue = person => sum(confirmedEvents.filter(event => event.person_id === person.id && inMonth(event.date, fact.period)).map(consumptionValue));
      return personValue(left) - personValue(right);
    },
    consumption_by_instrument: fact => instrumentConsumption(fact),
    budget_class_consumption: fact => {
      const budgetClass = fact.entity.slice(fact.entity.lastIndexOf(':') + 1);
      return sum(confirmedEvents.filter(event => inMonth(event.date, fact.period) && categoryFor(event)?.budget_class === budgetClass).map(consumptionValue));
    },
    balance_delta: fact => referencedEvents(fact)[0]?.amount_minor,
    invoice_payment_amount: fact => Math.abs(referencedEvents(fact)[0]?.amount_minor),
    invoice_payment_target_card: fact => referencedEvents(fact)[0]?.settles_card_id,
    statement_payment_correspondence: fact => {
      const payment = referencedEvents(fact)[0];
      return payment?.settles_statement_id || payment?.settles_statement_period ? 'proven' : 'unproven';
    },
    invoice_payment_consumption_effect: fact => sum(referencedEvents(fact).map(consumptionValue)),
    gross_consumption: fact => sum(referencedEvents(fact).map(event => Math.max(0, consumptionValue(event)))),
    refund_amount: fact => sum(referencedEvents(fact).map(event => Math.max(0, event.amount_minor))),
    category_budget_remaining: fact => budgetRemaining(fact),
    safe_daily_pace: fact => Math.floor(budgetRemaining(fact) / Number(fact.time_basis.match(/^\d+/)?.[0])),
    income_realized: fact => income(fact),
    bills_open: fact => sum(openBills(fact).map(bill => bill.amount_minor)),
    income_minus_open_bills: fact => income(fact) - sum(openBills(fact).map(bill => bill.amount_minor)),
    due_bill_ids: fact => fixture.bills.filter(bill => bill.person_id === fact.entity && bill.status === 'open' && inRange(bill.due_date, fact.period)).map(bill => bill.id),
    due_bills_total: fact => sum(fixture.bills.filter(bill => bill.person_id === fact.entity && bill.status === 'open' && inRange(bill.due_date, fact.period)).map(bill => bill.amount_minor)),
    reminder_count: fact => fixture.reminders.filter(item => item.person_id === fact.entity && inRange(item.scheduled_at, fact.period)).length,
    calendar_event_count: fact => fixture.calendar_events.filter(item => item.person_id === fact.entity && inRange(item.scheduled_at, fact.period)).length,
    merchant_rule_ids: fact => fixture.merchant_rules.filter(rule => rule.merchant_key === fact.entity).map(rule => rule.id),
    similar_event_ids: fact => confirmedEvents.filter(event => event.merchant_key === fact.entity && inMonth(event.date, fact.period)).map(event => event.id),
    side_effect_count: fact => fixture.side_effects.filter(item => item.turn_id === fact.entity.replace('turn:', '')).length,
  };

  const specs = {
    account_balance: ['BRL_minor',['event_date'],['confirmed'],['accounts','events']],
    balance_delta: ['BRL_minor',['event_date'],['confirmed'],['events']],
    bills_open: ['BRL_minor',['due_date'],['confirmed'],['bills']],
    budget_class_consumption: ['BRL_minor',['event_date'],['confirmed'],['events']],
    calendar_event_count: ['count',['scheduled_at'],['confirmed'],['people']],
    category_budget_remaining: ['BRL_minor',['budget_cycle'],['confirmed'],['budgets','events']],
    category_consumption: ['BRL_minor',['event_date'],['confirmed'],['events','people','source_states']],
    category_spent: ['BRL_minor',['event_date','budget_cycle'],['confirmed'],['events','people','source_states']],
    consumption_by_instrument: ['BRL_minor',['event_date'],['confirmed'],['events']],
    consumption_difference: ['BRL_minor',['event_date'],['confirmed'],['people']],
    consumption_effect: ['BRL_minor',['event_date'],['confirmed'],['events']],
    consumption_total: ['BRL_minor',['event_date'],['confirmed'],['events','source_states']],
    due_bill_ids: ['entity_ids',['due_date'],['confirmed'],['bills']],
    due_bills_total: ['BRL_minor',['due_date'],['confirmed'],['bills']],
    eligible_event_count: ['count',['event_date'],['confirmed'],['source_states']],
    gross_consumption: ['BRL_minor',['event_date'],['confirmed'],['events']],
    income_minus_open_bills: ['BRL_minor',['mixed_declared'],['estimated'],['events','bills']],
    income_realized: ['BRL_minor',['event_date'],['confirmed'],['events']],
    installments_projected: ['count',['installment_competence'],['projected'],['events']],
    installments_projected_amount: ['BRL_minor',['installment_competence'],['projected'],['events']],
    installments_realized: ['count',['installment_competence'],['confirmed'],['events']],
    installments_realized_amount: ['BRL_minor',['installment_competence'],['confirmed'],['events']],
    invoice_payment_amount: ['BRL_minor',['event_date'],['confirmed'],['events']],
    invoice_payment_consumption_effect: ['BRL_minor',['event_date'],['confirmed'],['events']],
    invoice_payment_target_card: ['entity_ids',['event_date'],['confirmed'],['events','cards']],
    merchant_rule_ids: ['entity_ids',['registry_current'],['confirmed'],['merchant_rules']],
    movement_ids: ['entity_ids',['event_date'],['confirmed'],['events']],
    net_consumption: ['BRL_minor',['event_date'],['confirmed'],['events']],
    owned_cards: ['entity_ids',['registry_current'],['confirmed'],['people','cards']],
    projected_installments: ['BRL_minor',['installment_competence'],['projected'],['events']],
    ranking_winner: ['entity_ids',['event_date'],['confirmed'],['people']],
    refund_amount: ['BRL_minor',['event_date'],['confirmed'],['events']],
    reminder_count: ['count',['scheduled_at'],['confirmed'],['people']],
    safe_daily_pace: ['BRL_minor',['15_full_days_after_as_of'],['estimated'],['budgets','events']],
    side_effect_count: ['count',['request_execution'],['confirmed'],['merchant_rules','events']],
    similar_event_ids: ['entity_ids',['event_date'],['confirmed'],['events']],
    source_coverage: ['state',['source_period'],['confirmed'],['source_states']],
    statement_payment_correspondence: ['state',['event_date'],['confirmed'],['events','cards']],
    statement_total: ['BRL_minor',['statement_due_date','statement_competence'],['confirmed'],['events']],
  };

  const expectedDimensions = [
    'metric', 'unit', 'entity', 'period', 'time_basis', 'coverage', 'evidence_state', 'evidence_refs',
  ];
  assert(fixture.synthetic === true && fixture.closed_world === true,
    'financial fixture must explicitly declare a synthetic closed world');
  assert(factContracts?.schema_version === 1, 'fact contract schema_version must be 1');
  assert(factContracts?.authority === 'reviewed_conversation_semantics',
    'fact contract authority must be reviewed_conversation_semantics');
  assert(sameValue(factContracts?.dimensions, expectedDimensions),
    'fact contract dimensions must equal the independent dimension contract');

  const relationOps = {
    member_of_budget_family: relation => {
      const person = fixture.people.find(item => item.id === relation.person_id);
      const budget = fixture.budgets.find(item => item.id === relation.budget_id);
      assert(Boolean(person), `relation member_of_budget_family: unknown person ${relation.person_id}`);
      assert(Boolean(budget), `relation member_of_budget_family: unknown budget ${relation.budget_id}`);
      assert(person?.family_id === budget?.family_id,
        `relation member_of_budget_family: ${relation.person_id} is outside ${relation.budget_id}`);
    },
  };

  const materializedEntries = Object.entries(oracle.turns)
    .filter(([, entry]) => entry.disposition === 'materialized');
  const contractTurns = new Set(Object.keys(factContracts?.turns ?? {}));
  assert(contractTurns.size === materializedEntries.length,
    'fact contract turn count does not match materialized oracle turns');

  let materializedFacts = 0;
  for (const [turn, entry] of Object.entries(oracle.turns)) {
    if (entry.disposition !== 'materialized') continue;
    const contracts = factContracts.turns[turn] ?? [];
    assert(contracts.length === entry.facts.length, `${turn}: fact contract cardinality mismatch`);
    contractTurns.delete(turn);
    for (const [factIndex, fact] of entry.facts.entries()) {
      const contract = contracts[factIndex];
      const factKey = `${turn}#${factIndex + 1}`;
      assert(contract?.fact_key === factKey, `${factKey}: missing or reordered fact contract`);
      for (const dimension of expectedDimensions) {
        assert(sameValue(fact[dimension], contract?.[dimension]),
          `${factKey}: ${dimension} diverges from reviewed fact contract`);
      }
      for (const relation of contract?.relations ?? []) {
        const evaluate = relationOps[relation.op];
        assert(Boolean(evaluate), `${factKey}: unknown relation operator ${relation.op}`);
        evaluate?.(relation);
      }
      materializedFacts += 1;
      const spec = specs[fact.metric];
      assert(Boolean(spec), `${turn}/${fact.metric}: metric lacks deterministic evaluator`);
      if (!spec) continue;
      const [unit, timeBases, evidenceStates, evidenceKinds] = spec;
      assert(fact.unit === unit, `${turn}/${fact.metric}: unit ${fact.unit} is not ${unit}`);
      assert(fact.coverage === 'complete', `${turn}/${fact.metric}: materialized coverage must be complete, found ${fact.coverage}`);
      assert(timeBases.includes(fact.time_basis), `${turn}/${fact.metric}: unsupported time_basis ${fact.time_basis}`);
      assert(evidenceStates.includes(fact.evidence_state), `${turn}/${fact.metric}: incompatible evidence_state ${fact.evidence_state}`);
      for (const ref of fact.evidence_refs) {
        assert(evidenceKinds.includes(kindById.get(ref)), `${turn}/${fact.metric}: evidence ref ${ref} has incompatible type ${kindById.get(ref)}`);
      }
      const expectedEventState = { confirmed: 'confirmed', projected: 'projected' }[fact.evidence_state];
      if (expectedEventState) {
        for (const event of referencedEvents(fact)) {
          assert(event.state === expectedEventState,
            `${factKey}: event ${event.id} does not substantiate evidence_state ${fact.evidence_state}`);
        }
      }
      for (const ref of fact.evidence_refs) {
        const source = byId.get(ref);
        if (fact.evidence_state === 'confirmed' && ['budgets','bills','merchant_rules'].includes(kindById.get(ref))) {
          assert(source.evidence_state === fact.evidence_state,
            `${turn}/${fact.metric}: source ${ref} does not substantiate evidence_state ${fact.evidence_state}`);
        }
      }
      let expected;
      try { expected = derive[fact.metric](fact); }
      catch (error) { failures.push(`${turn}/${fact.metric}: derivation failed: ${error.message}`); continue; }
      assert(sameValue(fact.value, expected),
        `${turn}/${fact.metric}: factual oracle diverges; expected ${JSON.stringify(expected)}, found ${JSON.stringify(fact.value)}`);
    }
  }

  assert(contractTurns.size === 0, `fact contracts contain non-materialized turns: ${[...contractTurns].join(',')}`);
  const usedMetrics = new Set(Object.values(oracle.turns).flatMap(entry => entry.facts.map(fact => fact.metric)));
  assert(Object.keys(specs).every(metric => usedMetrics.has(metric)), 'deterministic metric registry contains unused entries');
  assert([...usedMetrics].every(metric => Object.hasOwn(specs, metric)), 'a materialized metric is not in the deterministic registry');
  return { failures, materializedFacts, metricCount: Object.keys(specs).length };
}
