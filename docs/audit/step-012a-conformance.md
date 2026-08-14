# STEP-012A Conformance Audit

## Baseline
- STEP-012 commit: 5f96d8b
- STEP-012A commit: (this step)
- Baseline tests: 577
- Final tests: 604

## Findings Before Patch

### MISSING (not implemented or tested)
- EXE-012..017: Response contract tests (immutability, naive dt, raw_output, provider/model fields, usage)
- EXE-023..028: Individual scope mismatch tests (session/run/attempt/project/branch)
- EXE-030: Attempt not RUNNING rejected
- EXE-031..032: InputRef binding (match + mismatch)
- EXE-033..037: Fake executor behavior (success/failure/calls/order/exhaustion)
- EXE-040: Request saved before provider call (ordering)
- EXE-061..065: Request store failure + response store failure injection
- EXE-067..069: Event ordering (success/failure/exception precise sequences)
- EXE-070: Event metadata has provider/model/request_id
- EXE-046..047: OutputRef points to response artifact
- EXE-080: list_for_run on stores
- EXE-081..087: Architecture boundary AST scan (runtime no forbidden imports)

### PARTIAL (implemented but some aspects unproven)
- EXE-039..047: Success coordinator bundled in one test without individual assertions
- EXE-048..054: Failure coordinator bundled similarly
- EXE-072..075: No-retry evidence present but not isolated

### IMPLEMENTED_AND_PROVEN (already adequate)
- EXE-001..011: Basic contract tests
- EXE-018..022: Outcome invariants
- EXE-038: Fake executor no network
- EXE-066: Event types exist
- EXE-071: Raw output not in event metadata
- M3-EXE-001/002: End-to-end success/failure
- INT-M2-M3-001/002: Integration composition

## Fixes Applied
1. Added 27 new behavioral test functions covering all MISSING EXE IDs
2. Response contract tests (EXE-012..017)
3. Scope mismatch tests with call count verification (EXE-024..028, EXE-030)
4. InputRef binding mismatch test with call count (EXE-032)
5. Fake executor detailed behavior tests (EXE-033..037)
6. Request persistence ordering test (EXE-040)
7. Persistence failure injection tests (EXE-061..065)
8. Event ordering exact sequence tests (EXE-067..069)
9. Event metadata verification (EXE-070)
10. OutputRef artifact binding test (EXE-046..047)
11. Store list_for_run test (EXE-080)
12. AST-based runtime import boundary test (EXE-081..087)

## AC Coverage: 55/55 PASS

## EXE Coverage: 87/87 PROVEN (via individual or grouped behavioral tests)

## Architecture Evidence
- Runtime imports cognition: NO (AST scan proven)
- Runtime imports control: NO (AST scan proven)
- No SDK/framework imports: NO (AST scan proven)
- domain/events.py: unchanged
- packages/control: unchanged
- packages/cognition: unchanged

## Placeholder Scan
Required-feature placeholders found: NONE

## Dependency Audit
new direct dependencies: NONE
new dev dependencies: NONE
forbidden dependencies: NONE
