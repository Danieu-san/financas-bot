# Contextual Financial Analyst

## Objective

Make read-only financial answers conversational without asking Gemini to calculate
or access the full spreadsheet.

## Flow

```text
User question
-> Security Gate
-> Financial Agent planner
-> deterministic read-only tool
-> deterministic fallback answer
-> contextual Gemini composer
-> result verifier
-> contextual answer or deterministic fallback
```

## Data boundary

Gemini receives only a compact packet built from the public tool result. Internal
identifiers, spreadsheet references, credentials, URLs, prompts and raw private
fields are removed recursively. Lists and strings are capped before the request.

Gemini may:

- explain the verified result naturally;
- connect the result to the original question;
- summarize patterns already present in the tool result.

Gemini may not:

- calculate financial values;
- query Sheets or SQLite directly;
- write, update or delete financial data;
- invent values, dates, counts, rankings or entities;
- expose internal fields.

## Verification and fallback

Every contextual answer passes through the existing result verifier. Unsupported
amounts, percentages, counts, ordering, latest-item claims or internal fields cause
an automatic fallback to the deterministic answer.

Gemini errors, timeouts and quota failures also use the deterministic fallback.

## Activation

```env
FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer
FINANCIAL_CONTEXTUAL_ANALYST_MAX_PROMPT_CHARS=12000
```

The layer applies to successful read-only Financial Agent answers. It does not
change financial write flows.

## Rollback

Set the following value and restart the application:

```env
FINANCIAL_CONTEXTUAL_ANALYST_MODE=off
```

Rollback does not require a database migration and does not alter stored data.
