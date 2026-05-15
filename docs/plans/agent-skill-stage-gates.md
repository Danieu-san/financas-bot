# Agent Skill Stage Gates

## Direction Marker
Destination: personal finance operating system.

Path: reliable data-driven core first, then expand surfaces and automation.

Sources:

- `docs/decisions/ADR-001-product-direction-personal-finance-os.md`
- `docs/specs/financas-bot-general-product-spec.md`
- `docs/plans/financas-bot-general-implementation-plan.md`
- `docs/audits/general-project-audit.md`

## Purpose
These gates prevent the project from advancing through agent skills by momentum alone. Each stage must leave evidence before the next stage begins. The goal is to avoid the previous failure mode: completing a narrow slice while missing project-wide gaps.

## Universal Rules
- Every stage must preserve the direction marker.
- Every stage must consider the whole project: WhatsApp, users/consent, onboarding, financial records, Sheets, SQLite, AI, dashboard, admin, tests, logs, deploy, security, and cost.
- Every stage must classify findings as Core foundation, Product surface, or Future expansion.
- Any skipped area must be explicitly named with a reason.
- Implementation must not start from a stage that only produced an informal chat summary when a repo artifact is required.
- Secrets and local runtime files must never be committed.

## Gate 1: Idea Refine Complete
**May move to:** `spec-driven-development`

**Required evidence:**
- [ ] Problem statement exists.
- [ ] Recommended direction exists.
- [ ] Key assumptions are listed.
- [ ] MVP scope and Not Doing list exist.
- [ ] Direction marker is visible.
- [ ] Artifact is saved in `docs/ideas/` or a deliberate reason is recorded.

**Current evidence:**
- `docs/ideas/financas-bot-product-direction.md`
- `docs/decisions/ADR-001-product-direction-personal-finance-os.md`

**Blocks next stage if:**
- The destination is vague.
- The path conflicts with ADR-001.
- Product ambition expands without a Not Doing list.

## Gate 2: Spec Complete
**May move to:** `planning-and-task-breakdown`

**Required evidence:**
- [ ] Objective and target users are defined.
- [ ] Commands are explicit and executable.
- [ ] Project structure is mapped.
- [ ] Code style and boundaries are defined.
- [ ] Testing strategy is defined.
- [ ] Success criteria are specific and testable.
- [ ] Open questions are listed.
- [ ] Whole-project scope is covered.

**Current evidence:**
- `docs/specs/financas-bot-general-product-spec.md`

**Blocks next stage if:**
- Spec only covers one subsystem.
- Success criteria are not testable.
- Boundaries do not mention secrets, `user_id`, AI usage, or destructive data operations.

## Gate 3: Plan Complete
**May move to:** `incremental-implementation`

**Required evidence:**
- [ ] Dependency graph exists.
- [ ] Tasks are ordered by dependency.
- [ ] Each task has acceptance criteria.
- [ ] Each task has verification steps.
- [ ] Checkpoints exist between major phases.
- [ ] No task is too broad to implement in one focused session.
- [ ] Tasks are classified as Core foundation, Product surface, or Future expansion.

**Current evidence:**
- `docs/plans/financas-bot-general-implementation-plan.md`

**Blocks next stage if:**
- Tasks say only "implement X" without acceptance criteria.
- A task spans unrelated subsystems without a checkpoint.
- The plan starts with product expansion before testing/data integrity.

## Gate 4: Baseline Control Complete
**May move to:** Phase 1 implementation tasks

**Required evidence:**
- [ ] Project-wide baseline audit exists.
- [ ] Stage gates exist.
- [ ] `npm test` has passed after audit creation.
- [ ] Known gaps are listed and prioritized.
- [ ] Direction Control checkpoint is satisfied.

**Current evidence:**
- `docs/audits/general-project-audit.md`
- `docs/plans/agent-skill-stage-gates.md`

**Blocks next stage if:**
- The audit omits major subsystems.
- There is no test evidence.
- Known gaps are not classified.

## Gate 5: Increment Complete
**May move to:** next implementation slice or TDD/review for that slice

**Required evidence per increment:**
- [ ] Change does one logical thing.
- [ ] Relevant tests/checks were run.
- [ ] Result is committed separately.
- [ ] No unrelated files were staged.
- [ ] Any skipped verification is explained.

**Recommended verification:**
- Code changes: `npm test`
- Syntax-sensitive JS changes: `node --check <file>`
- Real WhatsApp path changes: `npm run test:whatsapp:e2e:check` and, when safe, `npm run test:whatsapp:e2e`
- Docs-only changes: manual review plus tests only when plan requires it

**Blocks next stage if:**
- Work remains uncommitted.
- Tests are failing.
- A commit mixes unrelated concerns.
- Runtime or secret files are staged.

## Gate 6: TDD Complete
**May move to:** `code-review-and-quality`

**Required evidence:**
- [ ] New behavior has tests.
- [ ] Bug fixes have regression tests where practical.
- [ ] Tests are named by behavior.
- [ ] Full automated suite passes: `npm test`.
- [ ] Any skipped tests are documented with reason and follow-up task.

**Blocks next stage if:**
- A behavior change has no test and no written reason.
- `functional.test.js` remains a blind spot without a plan.
- Tests depend on order or untracked local state.

## Gate 7: Code Review Complete
**May move to:** `security-and-hardening`

**Required evidence:**
- [ ] Findings are listed by severity.
- [ ] File/line references are included for actionable issues.
- [ ] Behavioral regressions and missing tests are prioritized over style.
- [ ] Residual risks are documented.
- [ ] Any fix made during review has tests/checks.

**Blocks next stage if:**
- Review is only a summary with no findings/risk statement.
- Critical or high findings remain untriaged.
- Security-sensitive code changes were made without tests.

## Gate 8: Security And Hardening Complete
**May move to:** `shipping-and-launch`

**Required evidence:**
- [ ] Threat model or security review exists.
- [ ] Dashboard token boundaries are tested/reviewed.
- [ ] Admin boundaries are tested/reviewed.
- [ ] User data isolation is explicitly checked.
- [ ] Secrets are not in git status/diff.
- [ ] Privacy/retention gaps are listed.

**Recommended verification:**
- `npm test`
- `npm audit --audit-level=high`
- Token invalid/expired smoke where applicable

**Blocks next stage if:**
- Any known data-leak path remains open.
- Admin spoofing risk is unresolved.
- Secrets appear in staged or committed files.

## Gate 9: Shipping Complete
**May move to:** beta expansion or next product phase

**Required evidence:**
- [ ] Release checklist exists.
- [ ] Rollback plan exists.
- [ ] Deploy commands are explicit.
- [ ] PM2/dashboard health checks are defined.
- [ ] WhatsApp smoke is defined.
- [ ] Decision to proceed/pause is recorded.

**Recommended production checks:**
```bash
pm2 status
pm2 logs financas-bot --lines 120 --nostream
curl http://localhost:8787/dashboard/health
```

**Blocks beta expansion if:**
- Dashboard health fails.
- WhatsApp is not ready.
- Logs show current fatal errors.
- Privacy/retention posture is not approved for outside users.

## Current Gate Status
| Gate | Status | Evidence |
|---|---|---|
| Idea Refine | Complete | `docs/ideas/financas-bot-product-direction.md` |
| Spec | Complete | `docs/specs/financas-bot-general-product-spec.md` |
| Plan | Complete | `docs/plans/financas-bot-general-implementation-plan.md` |
| Baseline Control | Complete after this file is committed | `docs/audits/general-project-audit.md`, this file |
| Increment | Active | Task 0.1 and Task 0.2 in progress/completed |
| TDD | Pending for general plan | Some regressions exist; broader TDD remains planned |
| Code Review | Pending | Not yet run generally after new plan |
| Security | Pending | Not yet run generally after new plan |
| Shipping | Pending | Not yet run generally after new plan |

## Next Allowed Work
After this file is committed, the next allowed work is Phase 1 from the general implementation plan:

1. Task 1.1: split/stabilize functional tests.
2. Task 1.2: add user lifecycle regression tests.

Do not start dashboard expansion, automation expansion, Postgres migration, or new product features before the Testing Foundation checkpoint is satisfied or explicitly re-approved.
