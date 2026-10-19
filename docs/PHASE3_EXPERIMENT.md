# Phase 3 assessor consistency experiment

The experiment compares independent scores for the same standardized case evidence under two conditions: **unassisted manual** and **SkillSetu-assisted**. The current case set is synthetic. It does not create ordinary assessment records, candidate reports, pass/fail decisions, or certification decisions.

## Local access

Start the existing app with `npm run dev`, then sign in as a provisioned `ASSESSOR` or an authorized `ADMIN` / `REVIEWER`.

- An assessor sees only their own assigned scoring attempts. An admin/reviewer can create runs and see completion counts and aggregated results, but cannot see individual scores through the overview API.
- A run requires at least two assessor accounts authorized for the dataset occupation. The study records a randomized order of manual and assisted attempts per assessor.
- Submit each assigned score once. Endpoint scores (0 or 4) require a short rationale. Submitted attempts are locked. An admin/reviewer can correct a submitted score only through the audited correction endpoint and must provide a reason; this invalidates cached results and requires recalculation.
- Results include exact agreement, criterion summaries, paired weighted Cohen’s kappa when there are at least two paired case ratings, completion counts, and an explicit evidence sufficiency statement. Synthetic results are marked simulated and cannot establish effectiveness.
- Download the CSV from an authorized admin/reviewer experiment detail view after calculating results. It includes synthetic case IDs and scoring/audit fields, but no candidate names.

## Dataset and storage

The default dataset is [`assessor-consistency-v1.json`](../database/seeds/assessor-consistency-v1.json). It is version `1.0.0`, includes three fictional cases, uses the synthetic Domestic Electrician demo bundle `DEMO-0.1`, and references provisional demo mappings only. Case IDs, task/NOS/criterion links, rubric anchors, and score ranges are validated at API startup against the loaded content bundle. A new content or rubric version requires a new dataset version and a new experiment run.

To load a different compatible versioned JSON file, set `SKILLSETU_EXPERIMENT_DATASET_FILE` to its path before starting the API. The schema follows the fields in the default fixture and requires a `SYNTHETIC_DEMO` classification, fictional candidate identities, standardized evidence, a complete integer anchor scale, and valid task/NOS/criterion references.

Experiment runs persist separately to `data/assessor-experiments.json` by default. Set `SKILLSETU_EXPERIMENT_STORE_FILE` to use another isolated path. The ordinary `SKILLSETU_STORE_FILE` is not used for experiment records. Tests use temporary stores and do not overwrite the development JSON store or its backup.

## Metric interpretation and limits

- Exact agreement is identical scores divided by within-case assessor pairs. The API reports its count and unit.
- Weighted Cohen’s kappa is calculated separately for each assessor pair and condition from their paired ordinal ratings on the shared 0–4 scale. Fewer than two paired cases or zero expected disagreement makes it unavailable with a reason. It is not calculated across unrelated criteria or scale versions.
- A comparison needs at least two assessors and at least two matched cases with comparable ratings in both conditions. Otherwise the result says **Insufficient evidence**. No missing score is converted to zero.
- The included NOS references are provisional. The app reports criterion-level agreement, marks the associated NOS mapping status, and does not present provisional values as authoritative NOS scores.
- The current fixture is small, synthetic, and not counterbalanced across a large population. The observed comparison is descriptive and does not show accuracy, causality, or real-world effectiveness.

The UI and dataset text are currently in English; the surrounding app may be set to Kannada or Hindi, but this experimental content is not fully translated.
