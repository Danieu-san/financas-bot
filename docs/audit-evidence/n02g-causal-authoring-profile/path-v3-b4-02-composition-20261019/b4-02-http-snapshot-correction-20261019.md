# B4-02 — finite HTTP check/use correction, local candidate only

## Causal boundary and no-network reproduction

After the single9d021e1 final5+1 closed INCOMPLETA, the existing localized
question was confronted with Node22.17.0's REAL HTTP/HTTPS normalization.
An injected agent captured native options and stopped before connection;
Socket.prototype.connect was an absolute failing trap. No DNS/socket requested.
Eight request/get × HTTP/HTTPS × options/URL+options cases read a hostname
getter twice: guard127.0.0.1, native-agent-consumed changed.example.invalid.
Diagnostic native exit0; sources unchanged; socket_attempts0. This proves the
guard's checked/consumed-option divergence, NOT real traffic, financial bypass,
all-agent-path behavior or universal SO isolation.

Diagnostic: b4-http-options-check-use-confront-20261019.json. No audit/session
content or private locators included. No guest/bundle/production execution.

## RED and minimal implementation

The new regression in tests/exhaustiveLocalTestCoverageRunner.test.js failed
before the source fix: native1, one test/one FAIL; actual external host instead
of expected127.0.0.1. It uses a native custom-agent boundary with zero sockets,
not a fake classifier mirroring the implementation.

Only the existing two harness files change:

- tests/helpers/exhaustiveNetworkTripwire.js: capture own-enumerable options
  once with Node's built-in urlToHttpOptions for URL forms, preserve callback
  signatures, check the captured hostname/host and forward THAT SAME snapshot.
  No vendor/schema/dependency/runtime/pin/norm/financial code change.
- tests/exhaustiveLocalTestCoverageRunner.test.js: a finite regression for
  HTTP/HTTPS request/get × object/string+options/URL+options. It checks one
  caller-getter read, stable loopback consumption, callback identity and
  rejection when the first observed hostname is external. Static cases preserve
  headers identity, method, path/query, port, auth and protocol. Native argument
  behavior was inspected from the pinned Node's _http_client, https and
  internal/url source; no new model/interpreter/effect engine.

The focal regression passed; three directly affected hostname/HTTP/fetch tests
passed. Final affected invocation below is authoritative for current sources.

## Failure evidence kept separate

1. A direct affected-file run inside the filesystem sandbox passed20 and
   failed2 on EPERM creating existing disposable junction fixtures. Normal
   execution through the approval mechanism passed22/22, native0; no ACL/UAC,
   security-setting change or new global permission was made.
2. An auxiliary runtime-inventory command incorrectly added
   --max-old-space-size=128. It failed after4PASS with heap exhaustion/native
   test child134. This flag is NOT in buildNodeTestArgs. The original128MiB
   contract is maxBuffer, not V8 heap. The command mistake is retained; no
   product failure or resource-limit increase is inferred. Formal affected
   invocation uses the unmodified original runner args/env and maxBuffer.

## Stable affected result, not wide/independent approval

run-b4-http-snapshot-affected-20261019.cjs delegates exact buildNodeTestArgs and
buildHermeticTestEnvironment to the existing runner for two affected test files.
13:46:50.682Z→13:49:59.899Z, Node22.17.0/native0,30tests/30PASS/0FAIL/
0SKIP/cancel-todo0/errorsnull/sourcesbefore-afterequal. Preload, experimental
coverage, serial1 and128MiB maxBuffer unchanged; no extra heap flag.
Report b4-http-snapshot-affected-20261019.json; raw TAP/coverage stay LOCAL.
stdoutSHA26646effebb650ae29582ca63ca0e7f5d594a51a9ca630c17a43fa24cf4a9eb1,
stderr emptySHAe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.

First snapshot-stage source SHAs (superseded by the final prototype stage below):
tripwire d9fad52d28a7b81df9c5ec361815564583b04089e92a106c0a858dd74dc20ad4;
runner test1b6e63ee2cbfea39d2cfa55472dd9c6a7add69652bcf08a928953e2490d9c80e.
The earlier wide GREENd1587842... remains historical for9d021e1, NOT a wide
validation of these changed sources. No new wide, publication or audit sent.

## Next finite block / no scope creep

### Final local adversarial extension of the SAME check/use cause

Before freezing the candidate, Node's native Object.assign path was also
confronted with an own enumerable __proto__ option created by JSON.parse.
The guard's spread did not mutate its prototype, but native HTTP's next copy
could install a prototype carrying an external hostname. A synthetic-agent
RED again observed changed.example.invalid as the consumed host, native1/one
FAIL/zero sockets. This was not a new network API or a claimed live bypass.

captureHttpRequest now rejects that unsafe TOP-LEVEL own option before
forwarding. It is not a native HTTP option; nested header data and ordinary
callback/header/method/path/auth forms are not replaced with a broad allowlist.
The same existing regression exercises object/string+options/URL+options across
HTTP/HTTPS request/get and requires rejection before the original sees it.
Three focal cases passed. The causal change justifies the final affected run,
not a green retry without a delta.

Final affected report b4-http-snapshot-prototype-affected-20261019.json:
14:16:59.053Z→14:20:24.871Z/native0/30PASS/0FAIL/0SKIP/cancel-todo0,
original args/env/preload/coverage/serial/128MiBmaxBuffer, before-after equal.
Current tripwireSHA950df130f23b40e52ff8df32cb6885d82e1b4fc9d71a69e013c63bc46a3f26c7;
testSHAef7605478dd36f9716e5fa8299a14406dad2dc5a0dfb9fb611342b75c1cdef14.
The preceding affected904e344a... remains historical for the first getter
snapshot fix, not overwritten or mixed with this final result.

### Finite body-evidence block completed locally, independent judgment pending

s01-finite-residual-body-argument-20261019.md supplies the exact source-bound
E1–E5 argument. Existing sealed-reference readout binds whole76program/39metric
families: M changes only S01, S restores C. The S01443residual positions are
mapped to13exact helper sources plus normal generated D/P modules. The35char
AST wrapper offset is explicitly reconciled. The mechanical readout is not
discharge; the full136MB raw stays local. Its176066byte443site source projection
and29792byte96sequence-call/five-form projection make the finite bodies
inspectable without a new analyzer. All13helper bodies were read; live handle,
callback/return, primitive/data, loader, trace-owner and acceptance relations
were confronted. This is an executor argument pending independent judgment,
not an independent APTO, runtime witness or external TCB pin/ticket.

The whole local candidate/evidence can now be frozen for ONE final hermetic
wide, expected2788tests with the same88PATHv3+2SCHEMA+two harness additions and
10exactSKIPs. No source/proof/capture/pin edit while it runs. Publish a material
new immutable object and request at most one whole independent review only
after a valid final wide. Do not reopen the closed9d021e1 protocol or count
its319limited observations as approval.

Original pre-extraction plan, now addressed locally by E1–E5 pending review:
return to the final review's actual NORMAL S01 and executable-program/effect
composition gaps. Do not probe new network APIs or rewrite the normative
method; do not repeat an auditor prompt to repair its verdict. Existing
PATH-V3-083 bodies already exercise genuine pre-M C/S admissions and negative
M controls; simply rerunning them cannot supply independent rule semantics.
The snapshot false premises are not to be flipped. Extract the residual
body/receiver/effect obligations from EXISTING sealed reference APIs, without
a new analyzer/solver/helper model, and determine what finite source argument
is missing. Only once the whole candidate/evidence is stable should one final
hermetic wide precede a materially changed immutable publication/audit.

Qualified/credit/exec/finance/receipt/validated_parent/globalGO/NEXT03false0.
Prior final5+1 closedINCOMPLETA/319LIMITED remains unchanged. No running local
executor or auditor. HEAD/branch/index/WIP/9captures/norm/corpus/pins unchanged.
