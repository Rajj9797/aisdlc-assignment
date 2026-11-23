# Harness Log: Part 1B (Natural-Language Reminder Agent)

## 1. Model and configuration (no secrets)
**Which model, temperature and timeout were used, and how was the key supplied?**
ANSWER: The live evaluator used `gemini-3.5-flash-lite` at temperature `0`. The implementation gives each model attempt a 30-second timeout and allows at most one retry. `GEMINI_API_KEY` and `GEMINI_MODEL` were supplied through a local `.env` file, loaded by `run-eval.js`; `.env` and `.env.*` are git-ignored. `env.example` contains placeholders only.

## 2. Threshold and scoring method (declared before final evaluation)
**What was the pass threshold and how is the score calculated? When was it frozen, and did it ever change?**
(Hint: the 0.85 mean, the hard gates, the intent-match revision in commit fd50935 made before any model output.)
ANSWER: The pass threshold was `0.85` mean case score, subject to hard gates of 100% schema/invariant/structural pass and all guardrail cases passing. The threshold was declared in the specification and evaluator before model evaluation and was frozen at commit `fd50935`/`a52dcbf` (before implementation and the first model output). Commit `fd50935` revised the specification so the behavioral property gate requires an exact intent match before semantic or keyword scoring; it did not change the threshold. The threshold never changed.

## 3. Harness runs and results
**Deterministic gates: one line per run (lint, sast, audit, tests).**
- first-run: `FAIL` overall — lint PASS; sast FAIL (two warnings: object-injection warning in `src/cli.js:17`, unsafe-regex warning in `src/time.js:9`); audit PASS; tests PASS.
- repair-1: `PASS` overall — lint PASS; sast PASS; audit PASS; tests PASS.

**Evaluation runs: structural, property/invariant and semantic outcomes.**
- first-run: `PASS` — 19/19 cases, mean score `1.000`, structural pass rate `1.000`, guardrail pass `true`, 0 service errors.
- final-run: `PASS` — 19/19 cases, mean score `1.000`, structural pass rate `1.000`, guardrail pass `true`, 0 service errors.

## 4. Failures and repair
**What failed, and what evidence did you give the agent?**
ANSWER: The only deterministic gate failure was SAST on the first run. The evidence was the saved `sast.log`: `security/detect-object-injection` at `src/cli.js:17` and `security/detect-unsafe-regex` at `src/time.js:9`. The repaired run also has an explicit all-gates `results.json` with the first-run status for comparison.

**What changed, and did the same gates pass on re-execution?**
ANSWER: Repair commit `81177d6` changed `src/cli.js` and `src/time.js` to remove the object-injection warning and replace the unsafe-regex/date handling; it did not change tests, evaluation cases, or harness configuration. The repair-1 re-run passed lint, SAST, npm audit, and Jest coverage, with overall `PASS`.

**Did the evaluation need a repair? If it passed first time, say so.**
ANSWER: No evaluation repair was needed. The first live evaluation already passed all 19 cases at mean score `1.000`, structural rate `1.000`, and guardrail pass `true`; the later final-run re-execution passed the same 19 cases with the same result.

## 5. Ordering and integrity
**What was committed before the first generated code, and how did you check the agent never touched tests, evals or the harness?**
(Hint: commits 560a7f1, 3b9bea5, fd50935, a52dcbf, and the git diff checks you ran.)
ANSWER: Before the first implementation commit (`92b10a2`), the worktree contained commits `560a7f1` (19-case dataset and independent result schema), `3b9bea5` (deterministic unit tests and fixtures), `fd50935` (intent-match revision; threshold unchanged), and `a52dcbf` (independent gates, evaluator, and runners). Project setup commit `97f817a` was also already present. `git diff` checks for `92b10a2` and later repair commit `81177d6` showed zero changed lines under `tests/`, `evals/`, `.harness/`, or `specs/`; thus the implementation and repair did not touch tests, evaluation cases, thresholds, or harness gates. The SAST repair commit likewise contained only source changes plus its saved evidence.

## 6. Final human decision
**Decision (ACCEPT or REJECT):**
ACCEPT

**Why?**
ANSWER: The first and final live evaluation runs passed all 19/19 cases with mean score `1.000`, 100% structural/invariant pass rate, all guardrail cases passing, and zero service errors. Repair-1 made the full deterministic gate suite pass. Evidence, source generations, dataset integrity, and the human decision are preserved in commits.

**Known limitations and residual risks:**
(Think about: only 19 cases and one run each at temperature 0; model non-determinism; free-tier provider data handling; synthetic text only; the extra `src/time.js` file not named in the plan.)
ANSWER: Residual limitations are: the live benchmark has only 19 synthetic cases and was run once in both phases, even with temperature 0 so provider/model non-determinism or free-tier availability is not fully characterized; provider standard data handling and retention are accepted only by the specification, not independently audited; request text is synthetic and therefore not representative of real user phrasing; the live provider may change beneath the pinned model name; and `src/time.js` is present in both initial and final source snapshots but is not explicitly named as a separate file in the implementation plan. The 30-second timeout, one retry, and no-persistence/no-retention requirements remain implemented boundaries rather than production guarantees beyond the tested environment.
