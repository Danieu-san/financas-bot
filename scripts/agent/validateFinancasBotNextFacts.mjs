const sameValue = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export function validateMaterializedFacts(fixture, oracle) {
  const failures = [];
  const assert = (condition, message) => { if (!condition) failures.push(message); };
  const requiredTurnMetrics = { 'M-15#1': ['calendar_event_count'] };
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
  const ids = items => items.map(item => item.id).sort();
  const sameIds = (left, right) => sameValue([...left].sort(), [...right].sort());
  const eventRefs = fact => ids(referencedEvents(fact));
  const assertExactEventRefs = (fact, expected, label) => assert(
    sameIds(eventRefs(fact), ids(expected)),
    `${label}: evidence_refs do not match the causal event set`,
  );
  const assertClosedWorldCoverage = (fact, label) => assert(
    fixture.synthetic === true && fixture.closed_world === true && fact.coverage === 'complete',
    `${label}: coverage is not substantiated by the closed-world fixture`,
  );
  const assertEventState = (fact, expectedState, label) => {
    for (const event of referencedEvents(fact)) {
      assert(event.state === expectedState, `${label}: event ${event.id} does not substantiate evidence_state ${expectedState}`);
    }
  };
  const periodContainsEvent = (period, date) => {
    if (period.startsWith('through:')) return date <= period.replace('through:', '');
    if (period.startsWith('as_of:')) return date <= period.replace('as_of:', '');
    if (period.startsWith('statement_due:')) return true;
    return period.includes('..') ? inRange(date, period) : date === period || inMonth(date, period);
  };
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

  function validateDimensions(turn, fact) {
    const label = `${turn}/${fact.metric}`;
    const eventsFor = predicate => events.filter(predicate);
    const confirmedFor = predicate => confirmedEvents.filter(predicate);
    const referenced = referencedEvents(fact);
    const sourceRefs = refs(fact, 'source_states');
    const exactIfEvents = expected => {
      if (referenced.length > 0) assertExactEventRefs(fact, expected, label);
      else assert(sourceRefs.some(source => source.coverage === 'complete' && (
        source.period === monthOf(fact.period) || source.entity_id === fact.entity || source.category_id === categoryFromEntity(fact.entity)
      )), `${label}: source evidence does not substantiate entity/period coverage`);
    };

    assertClosedWorldCoverage(fact, label);
    if (fact.evidence_state === 'confirmed') assertEventState(fact, 'confirmed', label);
    if (fact.evidence_state === 'projected') assertEventState(fact, 'projected', label);

    switch (fact.metric) {
      case 'consumption_total':
        exactIfEvents(confirmedFor(event => inMonth(event.date, fact.period) && scopeMatches(fact.entity, event) && consumptionValue(event) !== 0));
        break;
      case 'category_consumption':
      case 'category_spent':
        exactIfEvents(confirmedFor(event => inMonth(event.date, fact.period) && scopeMatches(fact.entity, event)
          && categoryFor(event)?.id === categoryFromEntity(fact.entity) && consumptionValue(event) !== 0));
        break;
      case 'movement_ids':
        assertExactEventRefs(fact, confirmedFor(event => event.account_id === fact.entity && inMonth(event.date, fact.period)), label);
        break;
      case 'statement_total': {
        const card = fixture.cards.find(item => item.id === fact.entity);
        assert(Boolean(card), `${label}: entity is not a known card`);
        const dueDate = fact.period.replace('statement_due:', '');
        assert(dueDate.endsWith(`-${String(card?.due_day).padStart(2, '0')}`), `${label}: statement period does not match card due day`);
        const closeDate = `${dueDate.slice(0, 8)}${String(card?.closing_day).padStart(2, '0')}`;
        const previous = new Date(`${closeDate}T00:00:00Z`); previous.setUTCMonth(previous.getUTCMonth() - 1);
        assertExactEventRefs(fact, confirmedFor(event => event.card_id === fact.entity && event.date > previous.toISOString().slice(0, 10) && event.date <= closeDate), label);
        break;
      }
      case 'account_balance': {
        const account = fixture.accounts.find(item => item.id === fact.entity);
        const asOf = fact.period.replace('as_of:', '');
        assert(Boolean(account) && asOf >= account.opening_balance_as_of, `${label}: account/as-of dimension is invalid`);
        assertExactEventRefs(fact, confirmedFor(event => event.account_id === fact.entity && event.date <= asOf), label);
        break;
      }
      case 'owned_cards':
        assert(sameIds(refs(fact, 'cards').map(item => item.id), fixture.cards.filter(card => card.owner_id === fact.entity).map(card => card.id)), `${label}: cards do not match owner entity`);
        assert(fact.period === `as_of:${fixture.fixed_clock.slice(0, 10)}`, `${label}: registry period does not match fixture clock`);
        break;
      case 'consumption_effect': {
        const expected = fact.entity.startsWith('transfer-')
          ? confirmedFor(event => event.transfer_pair === fact.entity)
          : confirmedFor(event => event.id === fact.entity);
        assert(expected.every(event => periodContainsEvent(fact.period, event.date)), `${label}: period excludes operation events`);
        assertExactEventRefs(fact, expected, label);
        break;
      }
      case 'net_consumption': {
        const baseId = fact.entity.startsWith('evt-') ? fact.entity : referenced.find(event => categories.get(event.category_id)?.kind === 'expense')?.id;
        const expected = confirmedFor(event => event.id === baseId || event.compensates === baseId);
        assert(expected.every(event => periodContainsEvent(fact.period, event.date)), `${label}: period excludes compensation chain`);
        assertExactEventRefs(fact, expected, label);
        break;
      }
      case 'installments_realized':
      case 'installments_realized_amount':
        assertExactEventRefs(fact, eventsFor(event => event.installment_plan === fact.entity && event.state === 'confirmed' && periodContainsEvent(fact.period, event.date)), label);
        break;
      case 'installments_projected':
      case 'installments_projected_amount':
        assertExactEventRefs(fact, eventsFor(event => event.installment_plan === fact.entity && event.state === 'projected' && periodContainsEvent(fact.period, event.date)), label);
        break;
      case 'projected_installments':
        assertExactEventRefs(fact, eventsFor(event => event.state === 'projected' && scopeMatches(fact.entity, event) && periodContainsEvent(fact.period, event.date)), label);
        break;
      case 'eligible_event_count': {
        const source = sourceRefs[0];
        assert(Boolean(source) && source.period === monthOf(fact.period) && source.category_id === categoryFromEntity(fact.entity), `${label}: source does not match category/period`);
        break;
      }
      case 'source_coverage': {
        const source = sourceRefs[0];
        assert(source?.id === fact.entity && source.period === fact.period, `${label}: source entity/period mismatch`);
        break;
      }
      case 'ranking_winner':
        assert(sameIds(refs(fact, 'people').map(item => item.id), [...membersOf(fact.entity)]), `${label}: ranking evidence does not match family members`);
        break;
      case 'consumption_difference': {
        const people = refs(fact, 'people');
        assert(fact.entity === `${people[0]?.id}-minus-${people[1]?.id}`, `${label}: entity does not encode compared people`);
        break;
      }
      case 'consumption_by_instrument':
        assertExactEventRefs(fact, confirmedFor(event => inMonth(event.date, fact.period)
          && (event.account_id === fact.entity || event.card_id === fact.entity) && consumptionValue(event) !== 0), label);
        break;
      case 'budget_class_consumption': {
        const [familyId, budgetClass] = fact.entity.split(':');
        assert(fixture.families.some(family => family.id === familyId), `${label}: unknown family entity`);
        assertExactEventRefs(fact, confirmedFor(event => inMonth(event.date, fact.period) && membersOf(familyId).has(event.person_id)
          && categoryFor(event)?.budget_class === budgetClass && consumptionValue(event) !== 0), label);
        break;
      }
      case 'balance_delta': {
        const expected = confirmedFor(event => event.account_id === fact.entity && event.date === fact.period && referenced.some(ref => ref.id === event.id));
        assert(expected.length === 1, `${label}: account/date do not identify the referenced balance event`);
        break;
      }
      case 'invoice_payment_amount':
      case 'invoice_payment_target_card':
      case 'statement_payment_correspondence':
      case 'invoice_payment_consumption_effect': {
        const payment = confirmedEvents.find(event => event.id === fact.entity && event.category_id === 'neutral.invoice_payment');
        assert(Boolean(payment) && payment.date === fact.period, `${label}: payment entity/period mismatch`);
        assertExactEventRefs(fact, payment ? [payment] : [], label);
        if (fact.metric === 'invoice_payment_target_card' || fact.metric === 'statement_payment_correspondence') {
          assert(refs(fact, 'cards').some(card => card.id === payment?.settles_card_id), `${label}: target card evidence is missing`);
        }
        break;
      }
      case 'gross_consumption': {
        const expected = fact.entity.startsWith('evt-')
          ? confirmedFor(event => event.id === fact.entity)
          : confirmedFor(event => inMonth(event.date, fact.period) && scopeMatches(fact.entity, event) && categoryFor(event)?.id === categoryFromEntity(fact.entity) && consumptionValue(event) > 0);
        assert(expected.every(event => periodContainsEvent(fact.period, event.date)), `${label}: period excludes gross events`);
        assertExactEventRefs(fact, expected, label);
        break;
      }
      case 'refund_amount': {
        const expected = confirmedFor(event => event.id === fact.entity && categories.get(event.category_id)?.kind === 'compensation');
        assert(expected.every(event => periodContainsEvent(fact.period, event.date)), `${label}: period excludes refund`);
        assertExactEventRefs(fact, expected, label);
        break;
      }
      case 'category_budget_remaining':
      case 'safe_daily_pace': {
        const [budgetId, scopedPerson] = fact.entity.split(':');
        const budget = fixture.budgets.find(item => item.id === budgetId);
        assert(Boolean(budget), `${label}: entity is not a budget`);
        const budgetMonth = fact.metric === 'safe_daily_pace' ? monthOf(fact.period) : fact.period;
        assert(budget?.period === budgetMonth, `${label}: period does not match budget cycle`);
        const expected = confirmedFor(event => event.date.startsWith(budget?.period ?? '__invalid__')
          && categoryFor(event)?.id === budget?.category_id && membersOf(budget?.family_id).has(event.person_id)
          && (!scopedPerson || event.person_id === scopedPerson) && consumptionValue(event) !== 0);
        assertExactEventRefs(fact, expected, label);
        if (fact.metric === 'safe_daily_pace') {
          const [start, end] = rangeOf(fact.period);
          const days = Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
          assert(fact.time_basis === `${days}_full_days_after_as_of`, `${label}: time_basis does not match period day count`);
        }
        break;
      }
      case 'income_realized':
        assertExactEventRefs(fact, confirmedFor(event => inMonth(event.date, fact.period) && scopeMatches(fact.entity, event)
          && categories.get(event.category_id)?.kind === 'income'), label);
        break;
      case 'bills_open':
        assert(sameIds(refs(fact, 'bills').map(item => item.id), openBills(fact).map(item => item.id)), `${label}: bill evidence does not match scope/period`);
        break;
      case 'income_minus_open_bills':
        assertExactEventRefs(fact, confirmedFor(event => inMonth(event.date, fact.period) && scopeMatches(fact.entity, event)
          && categories.get(event.category_id)?.kind === 'income'), label);
        assert(sameIds(refs(fact, 'bills').map(item => item.id), openBills(fact).map(item => item.id)), `${label}: bill evidence does not match scope/period`);
        break;
      case 'due_bill_ids':
      case 'due_bills_total': {
        const expected = fixture.bills.filter(bill => bill.person_id === fact.entity && bill.status === 'open' && inRange(bill.due_date, fact.period));
        assert(sameIds(refs(fact, 'bills').map(item => item.id), expected.map(item => item.id)), `${label}: due-bill evidence does not match entity/period`);
        break;
      }
      case 'reminder_count':
      case 'calendar_event_count':
        assert(refs(fact, 'people').some(person => person.id === fact.entity), `${label}: person evidence does not match entity`);
        assert(rangeOf(fact.period).every(date => /^\d{4}-\d{2}-\d{2}$/.test(date)), `${label}: schedule period is not a date range`);
        break;
      case 'merchant_rule_ids':
        assert(sameIds(refs(fact, 'merchant_rules').map(item => item.id), fixture.merchant_rules.filter(rule => rule.merchant_key === fact.entity).map(item => item.id)), `${label}: rule evidence does not match merchant`);
        assert(fact.period === `as_of:${fixture.fixed_clock.slice(0, 10)}`, `${label}: registry period does not match fixture clock`);
        break;
      case 'similar_event_ids':
        assertExactEventRefs(fact, confirmedFor(event => event.merchant_key === fact.entity && inMonth(event.date, fact.period)), label);
        break;
      case 'side_effect_count':
        assert(fact.entity.startsWith('turn:') && fact.period === `as_of:${fixture.fixed_clock.slice(0, 10)}`, `${label}: request entity/period mismatch`);
        break;
    }
  }

  let materializedFacts = 0;
  for (const [turn, metrics] of Object.entries(requiredTurnMetrics)) {
    const actual = new Set((oracle.turns[turn]?.facts ?? []).map(fact => fact.metric));
    for (const metric of metrics) assert(actual.has(metric), `${turn}: required materialized metric ${metric} is missing`);
  }
  for (const [turn, entry] of Object.entries(oracle.turns)) {
    if (entry.disposition !== 'materialized') continue;
    for (const fact of entry.facts) {
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
      validateDimensions(turn, fact);
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

  const usedMetrics = new Set(Object.values(oracle.turns).flatMap(entry => entry.facts.map(fact => fact.metric)));
  assert(Object.keys(specs).every(metric => usedMetrics.has(metric)), 'deterministic metric registry contains unused entries');
  assert([...usedMetrics].every(metric => Object.hasOwn(specs, metric)), 'a materialized metric is not in the deterministic registry');
  return { failures, materializedFacts, metricCount: Object.keys(specs).length };
}
