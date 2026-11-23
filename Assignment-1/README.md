# Assignment 1: Spec-Driven Development and Harness Engineering (SEZG534)

Two small applications built with GitHub Spec Kit, each with an independent validation harness.

| Part | Application | Folder |
|---|---|---|
| 1A | Tiered Rate Limiter (deterministic) | `Part-1A/` |
| 1B | Natural-Language Reminder Agent (non-deterministic, Gemini) | `Part-1B/` |

Each part contains its Spec Kit artifacts (`.specify/`, `specs/`), source (`src/`), tests (`tests/`), harness (`.harness/`) and evidence (`evidence/`, including `harness-log.md`).

Requirements: Node.js 20 or later.

## Part 1A: Tiered Rate Limiter

    cd Part-1A
    npm install
    npm start                                  # runs with committed demo keys (config/demo.json)
    curl -i -H "X-API-Key: demo-free-not-a-secret" localhost:3000/api/resource
    node .harness/run-harness.js my-run        # lint, SAST, npm audit, tests with coverage

Results are saved under `evidence/harness-results/`.

## Part 1B: Natural-Language Reminder Agent

    cd Part-1B
    npm install
    cp env.example .env                        # then set GEMINI_API_KEY and GEMINI_MODEL (never commit .env)
    npm run gates my-run                       # deterministic gates (no network needed for tests)
    npm run eval my-run                        # live evaluation of evals/dataset.json (needs the key)
    npm start -- --text "Remind me to call the dentist tomorrow at 6pm" --now 2026-11-23T10:00:00+05:30 --timezone Asia/Kolkata

Evaluation results are saved to `evidence/eval-results.json` and `evidence/eval-runs/`. The threshold (mean case score at least 0.85, plus the schema, invariant and guardrail hard gates) is declared in the specification. All test and evaluation text is synthetic.

## Evidence order

The specification, tests, dataset and harness were committed before the first generated implementation in each part. See each `evidence/harness-log.md` and the git history.
