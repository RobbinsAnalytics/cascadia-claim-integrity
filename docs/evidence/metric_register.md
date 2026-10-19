# Metric register

Version 1.1.0, 2026-10-18. Surface 12 (`metric_register`). Every published measure, its
population, numerator, denominator, exclusions, milestone, time semantics, rule version, lineage
and limits. The machine-readable companion is `governance/published-measures.json`, which
enumerates every supported cell; the drift check (`metric_register_drift` in `src/validate.py`) compares the two.

The package contract text for each measure is
`foundation/.../contracts/metric-contracts.json`; this register is its implementation binding
and does not change any definition there. Owner roles are synthetic role names.

**1.0.1 (same day).** The separately authored re-derivation (`governance/rederivation.json`,
first run against 1.0.0) found places where 1.0.0's wording was looser than, or different from,
the implemented rule. Each is pinned below and marked *1.0.1*; the reason and the alternative
reading are in `governance/decision-record.md` (2026-10-18, register 1.0.1). One finding was a
builder defect, not a wording gap: M19 now uses the earliest established ready instant across
versions. Nothing here was changed to make a value match; every amended clause states the rule
the build already applied, or (M19) the rule the register already stated.

**1.0.2 (wording only, same day).** The drift check found that M17's published identifiers
`<type>:<state>` named no type: the seven slot types appeared only in prose in population F.
M17 now names them. The 1.0.1 note also cited a drift-check script that does not exist; the
check is `metric_register_drift` in `src/validate.py`. No definition, rule or value changed.

**1.1.0 (wording only, same day).** Codex R1 finding R1-12: the register promised owner role,
grain, population, numerator, denominator, exclusions, milestone, clocks, submeasures, lineage
and limits for every measure, but most entries stated only some of them. Every measure M01 to
M19 now states all eleven as labeled clauses, completed from the implementation (`src/cci/` and
the scripts named under Lineage), the existing register text and the package contracts. Where a
clause does not apply, the clause says why. Each added or relabeled clause is marked *1.1.0*.
No definition, rule or value changed.

## Shared rules

- **Position** Q(population version, T, K, rule version). Positions: `known_then`
  (T = K = 2026-07-14T23:59:59Z), `restated_then` (T = 2026-07-14T23:59:59Z,
  K = 2026-07-21T23:59:59Z), `current_later` (T = K = 2026-07-21T23:59:59Z). Population version
  `CCI-COHORT-1`; rule version `CCI-SYNTHETIC-CONTRACT-1/1.0.0`; definition version 1.0.0.
- **Availability.** A row is available when `received_at <= K`; its business effect qualifies
  when `effective_at` is known and `<= T`. A null effective time never qualifies.
- **Counts** are exact integers over identities at the declared grain. **Rates** are never
  stored: consumers compute numerator / denominator and round only for display. A zero
  denominator is undefined and displays `Not applicable`, never 0 percent. Client rates pool by
  summing numerators and denominators, never by averaging percentages.
- **Cell key** `measure|submeasure|position|client_filter|period|stage`.
- **Client filter**: `ALL`; a profile (`P-A` = SYN-C01 and SYN-C02, `P-B` = SYN-C03 and SYN-C04,
  `P-C` = SYN-C05 and SYN-C06); or one client.
- **Period**: `FULL` (service dates 2026-04-01 to 2026-06-29) or `SP1` (2026-04-01 to
  2026-04-30), `SP2` (2026-05-01 to 2026-05-30), `SP3` (2026-05-31 to 2026-06-29). A record's
  period is its request's `service_date` (for a completed leg, the request named by its census
  row; for a claim version, its first source item). **First-submission (S) measures M03, M05,
  M06, M11, M12 and M13 support `FULL` only**: their cohort is the first-submission cohort and the
  service-date filter is never applied to it invisibly. **M08 supports `ALL`/`FULL` only**:
  unmatched and too-broad raw rows have no certain client binding.
- **Stage** applies to M15 and M19 only: `initial_preparation`, `encounter_submission`,
  `audit_submission`. Everything else uses `-`.
- **Hours** are elapsed hours rounded to 6 decimal places; medians and 90th percentiles use the
  nearest-rank method (k = ceil(q * n), the k-th smallest); empty populations give null.
- **Money** is a decimal string with two places.

## Populations

| Symbol | Members | Grain |
|---|---|---|
| C | completed legs whose census applicability is `reportable` and whose request is completed | leg (service key) |
| C_unresolved | completed legs whose applicability is `unknown`, or whose request is not completed | leg |
| P | one preparation unit per component per client target for every completed census leg (reportable or unresolved), plus one `cancelled_disposition` unit per target for every P-C documented-cancelled request | P unit |
| U | identical keys to P under this contract (one reporting unit per preparation unit) | U unit |
| F | expected financial slots per completed leg (supplier cost, submitted charge, then allowed amount, payer paid, member responsibility, member collection, vendor payment after the 336-hour window) and per P-C documented-cancelled request. *1.0.1:* refund adjustment is a source event type, not an expected slot (`profiles.json` `financial_slot_policy`) | slot |
| S | encounter families whose first business submission was made by T and is known by K | family |

## Measures

### M01 Source-evidenced accepted completed-leg coverage
- **Owner role** encounter reporting operations. **Grain** completed leg. **Population** C.
- **Numerator** legs every one of whose U units has current qualifying acceptance: a final
  encounter decision `accepted`, basis `originating` or `forwarded_originating`, effective by T,
  received by K, bound to the unit's exact scoped submission, with no incompatible decision.
- **Denominator** all C legs, including legs with no claim or no submission.
- **Exclusions** none from C. `C_unresolved` (submeasure) is shown separately and is in neither
  numerator nor denominator.
- **Label** "source-evidenced accepted completed-leg coverage". It is evidenced coverage, not an
  estimate of unseen business outcomes. Client assertions never count.
- **Submeasures** `numerator`, `denominator`, `C_unresolved`.
- **Lineage** `src/cci/evidence.py` (unit outcomes, leg coverage) via `src/cci/cells.py`.
- **Milestone** *1.1.0* the final encounter decision (stage `encounter_decision`) for each U unit
  of the leg, bound to that unit's submission. Transport and syntax receipts are not the milestone.
- **Clocks** *1.1.0* T and K only: the submission was made by T (`submitted_at` <= T) and is known
  by K; the decision's `effective_at` <= T and its `received_at` <= K. Completion and due times
  are not used (M04 and M07 use them).
- **Limits** *1.1.0* evidenced coverage, never prevalence or an estimate of unseen outcomes; a
  leg whose unit is covered by more than one incompatible family is `conflicted`, not covered.
  Replacement, void and retraction lineage (`src/cci/coverage.py`) is exercised by the public
  goldens only; none occurs in the v1 bulk population.

### M02 Uncovered completed legs by explanation
- **Grain** leg. **Population** C. Mutually exclusive states, *1.0.1* assigned in this order
  over the leg's U units: `conflicted` (any unit conflicted), `missing_claim` (any unit missing
  construction), `not_submitted` (any unit with no submission by T), `voided` (every unit accepted
  or voided, at least one voided), `rejected` (any unit with a source-evidenced rejection),
  `partial_required_components` (some units accepted, none rejected), `client_asserted_only` (any
  unit whose only evidence is a record-specific client assertion), `no_evidence` (every unit's
  evidence basis is `no_usable_evidence`), `unresolved` (the rest, including legs whose only
  context is an aggregate note). A rejected component explains the leg before a partial
  acceptance does. `uncovered` = C minus M01 numerator; the states sum to `uncovered`.
- **Submeasures** each state and `uncovered`.
- **Owner role** *1.1.0* encounter reporting operations (the M01 owner; M02 partitions the
  complement of the M01 numerator).
- **Numerator** *1.1.0* not a ratio: `uncovered` is C minus the M01 numerator, partitioned into
  the nine mutually exclusive states above; each state is a count of legs.
- **Denominator** *1.1.0* not a ratio: the states sum to `uncovered`; the M01 denominator (all C
  legs) is the comparison base.
- **Exclusions** *1.1.0* legs counted in the M01 numerator, which are not uncovered.
  `C_unresolved` legs are outside C and are an M01 submeasure. Counts at line, response or
  attempt grain are not part of this partition.
- **Milestone** *1.1.0* as M01, the final encounter decision per U unit; `missing_claim` is
  decided by the unit's initial-preparation readiness at T and `not_submitted` by the absence of
  a submission made by T.
- **Clocks** *1.1.0* as M01 (submission by T and known by K; decision `effective_at` <= T and
  `received_at` <= K); `missing_claim` uses claim version `available_at` <= T.
- **Lineage** *1.1.0* `src/cci/evidence.py` `resolve` (leg state assignment over unit outcomes,
  `leg-coverage.json`) via `src/cci/cells.py`.
- **Limits** *1.1.0* a leg is counted once, under the first state in the order above that it
  meets, so a state's count is not the number of legs with that condition.

### M03 First-pass acceptance
- **Owner role** encounter reporting operations. **Grain** encounter family. **Population** S.
- **Numerator** families whose fixed first business attempt has qualifying acceptance for every
  required component. **Denominator** all S families. Rejected, unresolved and conflicted are
  separate. Retransmission is not a new attempt.
- **Submeasures** `families`, `accepted`, `rejected`, `unresolved`, `conflicted`. FULL only.
- **Exclusions** *1.1.0* none from S. Later business attempts of a family neither enter the
  cohort nor change its first attempt's outcome; families first submitted after T, or not known
  by K, are outside S.
- **Milestone** *1.1.0* the first business submission made by T (fixes the cohort) and the final
  encounter decision on that attempt; a source-evidenced terminal syntax rejection at component,
  record, batch or transaction grain is a terminal prerequisite rejection of the attempt.
- **Clocks** *1.1.0* `submitted_at` <= T and known by K for the attempt; decision `effective_at`
  <= T and `received_at` <= K. Due times are not used.
- **Lineage** *1.1.0* `src/cci/evidence.py` `resolve` (first-attempt family outcomes,
  `first-attempt-families.json`) via `src/cci/cells.py`.
- **Limits** *1.1.0* FULL period only. Acceptance requires every required component. A different
  population from M01 and M16, never presented as one funnel with them.

### M04 Coverage at each component's own deadline
- **Grain** leg. **Population** C legs that are fully due: every U unit's acceptance deadline
  (unit `acceptance_due_at` = trigger + 168 h) is at or before T.
- **Numerator** fully due legs where every unit was covered at its own deadline, from
  acceptance effective by its deadline and received by K. A later ordinary void does not erase
  earlier coverage. **Denominator** fully due legs.
- **Submeasures** `numerator`, `denominator`, `partly_due`, `not_yet_due`, `timing_undetermined`,
  `coverage_timing_unassessable` (fully due, accepted only by evidence whose effective time is
  unknown).
- **Owner role** *1.1.0* encounter reporting operations.
- **Exclusions** *1.1.0* `partly_due`, `not_yet_due` and `timing_undetermined` legs are outside
  the denominator and published separately; `C_unresolved` legs are outside C.
- **Milestone** *1.1.0* each U unit's own acceptance deadline (`acceptance_due_at`, completion +
  168 h); a leg is assessed only when every unit's deadline has been reached by T.
- **Clocks** *1.1.0* census `completed_at` (the unit trigger), `acceptance_due_at`, T (deadline
  <= T; decision `effective_at` <= T and at or before the unit's deadline) and K (decision
  `received_at` <= K).
- **Lineage** *1.1.0* `src/cci/evidence.py` `resolve` with `src/cci/coverage.py` (`intervals`,
  `deadline_status`, `covered_at`; `leg-deadline.json`) via `src/cci/cells.py`; due times from
  `src/cci/expectations.py` `derive`.
- **Limits** *1.1.0* the latest component deadline is never substituted for earlier ones; an
  authoritative retraction may restate earlier coverage, an ordinary void cannot. Component-level
  results are kept in `measures-evidence.json` (`component_results`) and are not published cells.

### M05 Expected timed response obligations
- **Owner role** encounter reporting operations. **Grain** obligation (delivery and stage).
  **Population** receipt obligations of S deliveries whose policy stage expectation is
  `expected`. Due: transport 1 h, syntax 4 h, encounter decision 72 h from first delivery.
- **States** `satisfied_on_time` (first receipt received by T and K at or before due),
  `satisfied_late`, `pending` (none yet and T at or before due), `overdue` (none and T after due),
  `justifiably_cancelled` (a terminal syntax rejection cancels the final decision obligation).
  Timeliness uses received time only; a restated business acceptance never backdates receipt.
  `later_resolution` counts obligations unresolved at T with a receipt in (T, K].
- **Untimed**: `no_return_promise` (route structurally unavailable) and `not_established`
  create no receipt promise. *1.0.1:* they are counted once per delivery at the final-decision
  stage, where the business outcome would arrive; a non-final stage that is not established
  creates no obligation row. Follow-up obligations (120 h, SYN-C04 to SYN-C06) are separate.
  Per-stage and follow-up states include `justifiably_cancelled`.
- **Submeasures** `expected_timed_receipts`, `receipt:<state>`, `receipt:<stage>:<state>`,
  `untimed:no_return_promise`, `untimed:not_established`, `follow_up:expected`,
  `follow_up:<state>`, `receipt:later_resolution`. FULL only.
- **Numerator** *1.1.0* not a ratio: timed receipt obligations are counted by state, and the
  states partition `expected_timed_receipts`; no single on-time rate is defined.
- **Denominator** *1.1.0* not a ratio: `expected_timed_receipts` (receipt obligations with a due
  time) is the partitioned total, overall and per stage.
- **Exclusions** *1.1.0* untimed obligations (`no_return_promise`, `not_established`) and
  follow-up obligations are outside `expected_timed_receipts` and counted separately; a delivery
  made after T, or not known by K, creates no obligation.
- **Milestone** *1.1.0* the first delivery of the business attempt (the trigger) and each
  expected response stage: transport receipt, syntax acknowledgment, encounter decision; the
  follow-up obligation runs from submission.
- **Clocks** *1.1.0* delivery `submitted_at` (trigger, <= T and <= K); due time = trigger + the
  stage's hours (follow-up + 120 h); receipt `received_at` <= T and <= K for the state at T, and
  `received_at` in (T, K] for `later_resolution`. A receipt at the due instant is on time; an
  obligation is overdue only when T is strictly after its due time. `effective_at` is not used
  for timeliness.
- **Lineage** *1.1.0* `src/cci/evidence.py` `resolve` (obligations, `obligations.jsonl`) with
  `src/cci/deadlines.py` (`bind_rule`, `due_time`, `state_at`) via `src/cci/cells.py`.
- **Limits** *1.1.0* FULL only. Response outcome is M16, not this measure. Every v1 receipt rule
  is the pinned contract's elapsed window; the calendar-rule, conditional-final and
  transaction-result paths in `src/cci/evidence.py` are used by no v1 policy.

### M06 Open actionable issues and their age
- **Owner role** *1.1.0 (label made singular; per kind added)* claims operations
  (`preparation_blocked`, `preparation_conflict`), encounter operations (`receipt_overdue`,
  `encounter_rejection`), client operations (`follow_up_overdue`). **Grain** work item.
- **Population** work items at T: `preparation_blocked` and `preparation_conflict` (one per
  blocked or conflicting readiness row at encounter, audit or initial stage), `receipt_overdue`,
  `follow_up_overdue`, `encounter_rejection` (*1.0.1:* one per rejected U unit, because the
  correction decision is taken per component and target).
- *1.0.1:* `timing_undetermined` counts items whose timing basis is `not_established` (no
  deadline exists for them: every rejection item), whether or not their onset is known.
- **Age** a preparation item ages from its onset (the later of its trigger and its claim
  version's availability) against its governed stage deadline (initial 24 h, submission 48 h);
  an overdue receipt or follow-up ages from its contractual due time; a rejection ages from its
  observed onset (earliest received rejecting evidence) with no deadline established.
- **Submeasures** `open`, `<kind>:open`, `<kind>:median_age_hours`, `timing_undetermined`,
  `governed_overdue`. FULL only.
- **Numerator** *1.1.0* not a ratio: a count of open work items at T, by kind, with their ages.
- **Denominator** *1.1.0* not a ratio; no rate is computed.
- **Exclusions** *1.1.0* a condition that is not open and actionable at T creates no item: a
  receipt or follow-up obligation that is satisfied, pending or justifiably cancelled, a ready
  readiness row, a U unit whose outcome is not `rejected`. Closing an item changes no claim,
  financial or coverage fact.
- **Milestone** *1.1.0* T: an item is open when its condition holds at T. The governing event is
  the governed stage deadline for a preparation item, the obligation's contractual due time for
  a receipt or follow-up item, and the source-evidenced rejection for a rejection item.
- **Clocks** *1.1.0* T (open at T; `governed_overdue` when T is strictly after the due time), K
  (obligations and rejections use evidence received by K), the unit trigger (completion, or the
  documented cancellation's `effective_at`), claim version `available_at`, `preparation_due_at`
  (trigger + 24 h), `reporting_due_at` (trigger + 48 h), receipt and follow-up due times, and the
  `received_at` of the earliest rejecting evidence.
- **Lineage** *1.1.0* `src/cci/workitems.py` (`build`, `attach_rejection_onsets`;
  `work-items.jsonl`) over readiness rows from `src/cci/claims.py` `readiness` and obligations
  and unit outcomes from `src/cci/evidence.py` `resolve`, via `src/cci/cells.py`.
- **Limits** *1.1.0* FULL only. A rejection item carries no SLA conclusion. `<kind>:median_age_hours`
  uses the shared nearest-rank rule over items with a known age. Owner roles are synthetic role
  names, not people.

### M07 First valid acceptance elapsed time
- **Grain** leg. **Population** C. Elapsed hours from the leg's completion to the earliest
  instant at which every U unit was simultaneously covered (effective by T, received by K).
- **Submeasures** `population`, `accepted`, `never_yet_accepted`, `median_hours`, `p90_hours`.
  The never-yet-accepted count always sits beside the quantiles.
- **Owner role** *1.1.0* encounter reporting operations.
- **Numerator** *1.1.0* not a ratio: a duration distribution. `accepted` counts legs with a first
  simultaneous coverage instant; the quantiles are over their elapsed hours.
- **Denominator** *1.1.0* not a ratio: `population` is every C leg and equals `accepted` plus
  `never_yet_accepted`.
- **Exclusions** *1.1.0* none from C: never-yet-accepted legs are counted, not dropped.
  `C_unresolved` legs are outside C.
- **Milestone** *1.1.0* from service completion to the earliest instant at which every U unit of
  the leg was covered by final encounter acceptance at the same time.
- **Clocks** *1.1.0* census `completed_at` (start); decision `effective_at` (end, <= T) and
  `received_at` <= K.
- **Lineage** *1.1.0* `src/cci/evidence.py` `resolve` with `src/cci/coverage.py` (`intervals`,
  `first_simultaneous`; `leg-first-acceptance.json`) via `src/cci/cells.py`.
- **Limits** *1.1.0* an accepted-then-voided leg keeps its first acceptance unless an
  authoritative retraction invalidates it; currently uncovered legs are M02, not this measure.
  Quantiles use the shared nearest-rank rule.

### M08 Duplicate, orphan and conflicting evidence
- **Grain** raw response row. **Population** every raw operational response row.
- **Submeasures** `raw_rows`, `raw_duplicate_deliveries`, `duplicate_effects_prevented`,
  `unmatched_responses`, `too_broad`, `contradictory_rows`, `conflict_episodes`,
  `lineage_conflicts`, `incompatible_family_conflicts`, `received_after_K`,
  `bound_to_submission_after_T`. ALL and FULL only.
- **Owner role** *1.1.0* encounter reporting operations (owner of the response evidence that M01,
  M03, M05 and M16 consume).
- **Numerator** *1.1.0* not a ratio: each submeasure is a count. `raw_rows` is the complete raw
  population; the disposition submeasures count raw rows by their one disposition, and
  `conflict_episodes`, `lineage_conflicts` and `incompatible_family_conflicts` count conflict
  episodes.
- **Denominator** *1.1.0* not a ratio; no rate is computed.
- **Exclusions** *1.1.0* none: every raw operational response row gets exactly one disposition,
  including rows received after K and rows bound to a submission made after T. Legitimate
  grouping and multiple destinations are not duplicates.
- **Milestone** *1.1.0* response receipt: each raw row's binding, at the position, to an actual
  submission made by T.
- **Clocks** *1.1.0* response `received_at` (after K gives `received_after_K`), submission
  `submitted_at` (after T gives `bound_to_submission_after_T`), and decision `effective_at` <= T
  for the decisions whose incompatibility makes a conflict.
- **Lineage** *1.1.0* `src/cci/evidence.py` `resolve` (row dispositions,
  `evidence-dispositions.jsonl`; the M08 block of `measures-evidence.json`) with
  `src/cci/coverage.py` lineage exceptions, via `src/cci/cells.py`.
- **Limits** *1.1.0* ALL and FULL only. `raw_duplicate_deliveries` and
  `duplicate_effects_prevented` are both counted from rows whose disposition is `duplicate`
  (same originating artifact, digest and bound deliveries). Transport duplicates stay distinct
  from incompatible coverage (`incompatible_family_conflicts`). No replacement or void lineage
  occurs in the v1 bulk population.

### M09 Detector performance
- *1.1.0* Published from the current held-out attempt's results, named by
  `governance/evaluation-custody.json` (`current_attempt.attempt_record`; attempt 1 is
  `governance/detection-results.json`, development evidence, and attempt 2 is
  `governance/detection-results-2.json`, unblinded), and
  `governance/negative-controls.json` (public diagnostics). Not position-filtered. Per class:
  mature targets, caught on time, detected late, missed, immature, clean opportunities, false
  alarms, duplicate and unmatched alerts.
- **Owner role** *1.1.0* not an operations role: `governance/evidence-index.json` records the
  accountable role for `governance/detection-results.json` as Separately controlled evaluator,
  and for `governance/negative-controls.json` as Claude, integrated injection execution.
- **Grain** *1.1.0* target or clean opportunity, per fault class (SF01 to SF36).
- **Population** *1.1.0* the evaluator's committed roster of targets (mature and immature) and
  clean opportunities, and the 82 public diagnostic instances with their 82 clean pairs.
- **Numerator** *1.1.0* not a single ratio: per class, mature targets reconcile as caught on time
  plus detected late plus missed, and false alarms count mature clean opportunities with any
  observed alert, once each.
- **Denominator** *1.1.0* per class, mature targets (for detection) and mature clean
  opportunities (for false alarms); no pooled success percentage is published.
- **Exclusions** *1.1.0* none: misses, late detections, immature targets, duplicate and unmatched
  alerts are all published; an alert after the observation cutoff is a future alert and never
  detects or alarms. A missing invocation or output is a failure, never an empty success.
- **Milestone** *1.1.0* each target's onset and detection window end: the earliest qualifying
  alert is on time when it is at or before the window end, late when after it but observed.
- **Clocks** *1.1.0* scenario hours (target onset, window end, inclusive observation cutoff, alert
  hour), not the T and K of the analytical positions.
- **Submeasures** *1.1.0* per class: mature targets, caught on time, detected late, missed,
  immature, clean opportunities, false alarms, duplicate alerts, unmatched alerts. Not part of
  the static cell set.
- **Lineage** *1.1.0* controls in `src/controls.py`, run by `src/run_controls.py`; held-out
  scoring by the separately controlled evaluator into the current attempt's results file;
  public diagnostics by `src/run_diagnostics.py`, scored with `src/score.py`, into
  `governance/negative-controls.json`.
- **Limits** *1.1.0* not position-filtered. Blindness is not certified, and no class-wide
  effectiveness is claimed for a class without represented targets.

### M10 Real execution health
- Published from `governance/health.json`: last attempted and successful real run, outcome,
  expected next run, observer time, expiry, stale or unknown status. Simulation day is separate.
  Dynamic field; not part of the static analytical bundle.
- **Owner role** *1.1.0* not an operations role: `governance/evidence-index.json` records the
  accountable role for `governance/health.json` as Claude, worker/observer configuration.
- **Grain** *1.1.0* scheduled-run attempt (one run-history row) and the served health record.
- **Population** *1.1.0* every real run attempt recorded in `governance/run_history.jsonl`; a run
  triggered by anything other than the scheduler is recorded with its event and never counts as
  a timer run.
- **Numerator** *1.1.0* not a ratio: a status record (last attempted and last successful run,
  outcome, expected next run, observer time, expiry, stale or unknown status).
- **Denominator** *1.1.0* not a ratio; no rate is computed.
- **Exclusions** *1.1.0* simulated rehearsal hours (`governance/observer-receipt.json`,
  `rehearsal`) and the simulation day are not real runs and are shown separately.
- **Milestone** *1.1.0* each scheduled run's expected execution window, and the served health's
  expiry.
- **Clocks** *1.1.0* real UTC wall-clock times only (run start, observer check, expected next
  run, expiry), never T or K; after its expiry, served health reads stale or unknown whatever the
  last receipt said.
- **Submeasures** *1.1.0* no cells: the fields of `governance/health.json` (`genuine_runs`,
  `last_success`, `last_failure`, `next_expected_execution`, `expires_at`, `served_status`,
  `surface_status`).
- **Lineage** *1.1.0* `src/record_run.py` (appends the run-history row and rewrites health from
  the history alone), `src/observe.py` (progress-watermark and freshness rules) and
  `src/observe_now.py` (the separate observer's real-clock check).
- **Limits** *1.1.0* a successful process exit alone never certifies a run whose progress
  stalled; while no genuine run is recorded, the served status is unknown and no fresh
  certification is claimed.

### M11 Accepted-payload content conformance
- **Grain** payload version of a first-submitted family. **Population** S families with
  qualifying acceptance, classified by active status (all definitively active in v1).
  *1.0.1:* a family is a candidate when at least one required component has qualifying final
  acceptance, so partially accepted payloads are compared too; the M03 accepted state (every
  component accepted) is narrower and is not the M11 population.
- **Numerator** definitively active candidates whose payload conforms to the bound claim
  version and whose claim version conforms to source (`payload_to_source` conforming).
  **Denominator** definitively active candidates. Mismatch and unassessable are separate.
- **Submeasures** `accepted_candidates`, `definitively_active`, `conforming`, `mismatch`,
  `unassessable`, `payload_to_claim_mismatch`, `claim_to_source_mismatch`, `indeterminate`.
- **Owner role** *1.1.0* encounter reporting operations.
- **Exclusions** *1.1.0* a candidate whose active status is not definitively active is outside
  the denominator and retained (`indeterminate` for uncertain status); an S family with no
  qualifying final acceptance is not a candidate. No payload-date or reportable-only filter
  removes a candidate.
- **Milestone** *1.1.0* the first business submission made by T (cohort S) and qualifying final
  encounter acceptance on that attempt.
- **Clocks** *1.1.0* `submitted_at` <= T and known by K; acceptance `effective_at` <= T and
  `received_at` <= K; the payload is compared with the claim version named by its submission,
  and that version with source truth at the position (rows received by K, effect by T).
- **Lineage** *1.1.0* `src/cci/evidence.py` `resolve` (candidates and their `payload_to_claim`,
  `claim_to_source` and `payload_to_source` folds) over `src/cci/compare.py` (`claim_to_payload`,
  `source_to_claim`; `comparisons.jsonl`), via `src/cci/cells.py`; active status from the unit's
  coverage lineage (`src/cci/coverage.py`).
- **Limits** *1.1.0* FULL only. Missing or disputed source truth stays unassessable and is never
  repaired from withheld truth. Both comparison layers are reported; neither replaces the other.
  While any candidate's active status is indeterminate, the package contract withholds an
  unqualified overall rate.

### M12 Accepted out-of-scope families
- **Grain** family. **Population** the same accepted candidates. `explicitly_nonreportable_families`
  are those whose every source item is explicitly nonreportable; `unknown_scope_families`
  have unresolved scope. Required cancelled reports are in U and are never over-reporting.
- **Submeasures** `active_accepted_families`, `explicitly_nonreportable_families`,
  `unknown_scope_families`.
- **Owner role** *1.1.0* encounter reporting operations.
- **Numerator** *1.1.0* `explicitly_nonreportable_families`: accepted families whose every source
  item is explicitly nonreportable.
- **Denominator** *1.1.0* `active_accepted_families` (definitively active accepted families,
  family grain); a rate is formed only when active membership is resolved.
- **Exclusions** *1.1.0* nothing is dropped: unknown-scope families are published separately and
  never treated as excluded; required cancelled reports are U members and never over-reporting.
- **Milestone** *1.1.0* as M11: the first business submission made by T and qualifying final
  encounter acceptance on that attempt.
- **Clocks** *1.1.0* as M11; reporting scope from request and census revisions received by K.
- **Lineage** *1.1.0* `src/cci/evidence.py` `resolve` (each candidate's `reporting_scope`, from
  its claim version's source items against the populations of `src/cci/expectations.py`
  `derive`) via `src/cci/cells.py`.
- **Limits** *1.1.0* FULL only. The residual outside M01 and M02 is the candidate list in
  `measures-evidence.json`; `distinct_excluded_sources` and `unmatched_source_families` are kept
  there and are not published cells.

### M13 First-attempt rejection share by primary reason
- **Grain** family. **Population** S. Primary reason from the versioned precedence list; with
  no reason text the reason is `other_terminal_rejection` with its actual stage preserved.
  Labeled encounter first-attempt rejection share, never payer adjudication.
- **Submeasures** `denominator`, `reason:<reason>`, `stage:<stage>`. *1.0.1:* reasons are the
  contract's closed precedence list and stages its two terminal rejection stages, published
  zero-filled.
- **Owner role** *1.1.0* encounter reporting operations.
- **Numerator** *1.1.0* for each primary reason, S families whose fixed first attempt is
  `rejected` (as in M03) with that primary reason; `stage:<stage>` partitions the same rejected
  families by rejection stage.
- **Denominator** *1.1.0* `denominator`: all S families (the M03 `families`), not only the
  rejected ones.
- **Exclusions** *1.1.0* none from S: accepted, unresolved and conflicted first attempts are in
  the denominator and under no reason.
- **Milestone** *1.1.0* as M03: the final encounter decision on the first business attempt, or a
  terminal syntax rejection as the prerequisite.
- **Clocks** *1.1.0* as M03: `submitted_at` <= T and known by K; decision `effective_at` <= T and
  `received_at` <= K.
- **Lineage** *1.1.0* `src/cci/evidence.py` `resolve` (`primary_reason`, `rejection_stage` and
  retained `raw_reasons` per family, `first-attempt-families.json`) via `src/cci/cells.py`; the
  precedence list is `evidence-policies.json` `first_attempt_outcome.reason_precedence`.
- **Limits** *1.1.0* FULL only. Every raw reason is retained beside the primary one.

### M14 Claim preparation coverage
- **Owner role** claims operations. **Grain** P unit. **Population** P.
- **Numerator** units with exactly one latest claim version at T allocating them with supported
  quantities. **Denominator** all P units, including units with no claim. *1.0.1:* a unit whose
  census applicability is unknown is counted only in `applicability_unresolved`, never in the
  numerator, whatever its allocation; the five states partition P.
- **Submeasures** `numerator`, `denominator`, `missing`, `partially_allocated`, `conflicting`,
  `applicability_unresolved`, `claim_headers` (distinct families, not units), and, FULL only,
  `explicitly_excluded_requests` and `unresolved_requests_outside_P` (request keys).
- **Exclusions** *1.1.0* none from P: a unit with no claim stays in the denominator as `missing`.
  Requests outside P (no-shows and cancellations the profile does not report; unknown
  dispositions and cancellations without documentation) are published as
  `explicitly_excluded_requests` and `unresolved_requests_outside_P`, FULL only.
- **Milestone** *1.1.0* claim construction: the latest claim version of each family available by
  T.
- **Clocks** *1.1.0* claim version `available_at` <= T; P from request and census revisions
  received by K.
- **Lineage** *1.1.0* `src/cci/expectations.py` `derive` (P), `src/cci/claims.py`
  `build_versions` and `flatten` (versions and allocations), `src/cci/measures.py` `compute`
  (unit construction states, `construction.jsonl`), via `src/cci/cells.py`.
- **Limits** *1.1.0* a constructed unit can still be blocked in M15; grouping never shrinks P, and
  `claim_headers` counts distinct families, not units.

### M15 Target-specific claim readiness
- **Owner role** claims operations. **Grain** P unit per stage. **Population** P for that stage
  (initial preparation for every unit; encounter submission for every encounter target; audit
  submission for SYN-C02's audit target).
- **States** `ready`, `blocked`, `missing_construction`, `conflicting`, `unassessable`. Readiness
  uses facts received by T. A grouped transmission is blocked until every component is ready.
  Unknown payment blocks only stages whose contract requires it (P-C encounter submission
  requires a known vendor payment; initial preparation does not).
- **Explanatory submeasures** `units_missing_field:<field>` (distinct blocked or conflicting
  units missing or conflicting that field; a unit can count under several fields, so these are
  not additive) and `distinct_blocked_units` (*1.0.1:* blocked plus conflicting units).
  *1.0.1:* the field family at a stage is every field that blocks at least one unit at that
  stage at any position, published zero-filled for every filter. `denominator` is published for
  every stage.
- **Numerator** *1.1.0* `ready`: units at that stage whose every relevant required header, line
  and component check passes under the bound claim version and the target contract.
- **Denominator** *1.1.0* `denominator`: every P unit for that stage; the five states partition
  it.
- **Exclusions** *1.1.0* none: a unit with no claim version is `missing_construction` and a unit
  with unknown census applicability is `unassessable`, both inside the denominator.
- **Milestone** *1.1.0* the readiness stage at T: initial preparation, encounter submission or
  audit submission.
- **Clocks** *1.1.0* T: the claim version current at T (`available_at` <= T) and supporting facts
  received by T (a vendor payment also effective by T); the P-B grouping window holds a grouped
  transmission until the end of its UTC service date. Stage due times are not used here (they
  govern M06).
- **Submeasures** *1.1.0* `denominator`, `ready`, `blocked`, `missing_construction`,
  `conflicting`, `unassessable`, and the explanatory `units_missing_field:<field>` and
  `distinct_blocked_units`, per stage.
- **Lineage** *1.1.0* `src/cci/claims.py` `readiness` (`readiness.jsonl`) with
  `src/cci/contracts.py` `stage_required_fields`, via `src/cci/cells.py` (field family from
  `_collect_missing_fields`).
- **Limits** *1.1.0* readiness at Q is for the version current at T, so a later revision can
  change a unit's state between positions. Readiness proves neither conformance (M18) nor
  acceptance.

### M16 Reporting disposition and outcome-evidence coverage
- **Owner role** encounter reporting operations. **Grain** U unit. **Population** U.
- Three separate dimensions per unit: business outcome (`accepted`, `rejected`, `unresolved`,
  `conflicted`, `voided`), evidence basis (`originating_structured`, `forwarded_originating`,
  `record_specific_client_assertion`, `aggregate_only_assertion`, `no_usable_evidence`) and
  return expectation (`expected`, `structurally_unavailable`, `not_established`).
- *1.0.1:* the evidence basis is the basis of the unit's **outcome** evidence: the final
  decision that supplies its outcome, or the assertion or aggregate note bound to it. Transport
  and syntax receipts without a final decision supply no outcome, so such a unit's basis is
  `no_usable_evidence`. The receipts themselves are accounted in M05.
- `source_evidenced_outcomes` counts units with an originating or forwarded accepted **or
  rejected** outcome: supported rejection is outcome evidence. It is not an acceptance rate.
- **Submeasures** `required_units`, `outcome:<k>`, `basis:<k>`, `return:<k>`,
  `source_evidenced_outcomes`.
- **Numerator** *1.1.0* `source_evidenced_outcomes`: U units whose outcome is `accepted` or
  `rejected` on originating or forwarded originating evidence.
- **Denominator** *1.1.0* `required_units`: every U unit; each of the three dimensions partitions
  it.
- **Exclusions** *1.1.0* none from U: a unit with no submission is `unresolved` with basis
  `no_usable_evidence`, and a unit on a structurally unavailable return route remains a reporting
  requirement.
- **Milestone** *1.1.0* the final encounter decision per unit; the return expectation is the
  evidence policy's encounter-decision stage expectation.
- **Clocks** *1.1.0* submission `submitted_at` <= T and known by K; decision `effective_at` <= T
  and `received_at` <= K. A decision effective after T is not a historical outcome.
- **Lineage** *1.1.0* `src/cci/evidence.py` `resolve` (unit outcomes, `unit-outcomes.jsonl`) via
  `src/cci/cells.py`; return expectations from `evidence-policies.json`.
- **Limits** *1.1.0* absence of evidence is neither acceptance nor rejection. A different
  population from M01 and M03, never one funnel with them.

### M17 Typed financial evidence and allocation
- **Owner role** financial reconciliation. **Grain** financial slot; settlement event.
- Per event type: expected slots and their states (`known`, `evidenced_derived_zero`,
  `unknown`, `not_yet_expected`, `not_applicable`, `conflicting`). After the 336-hour window a
  missing follow-up fact is `unknown`; the original source observation is retained beside it.
  Settlements: count, balanced, event total, allocated total and unapplied total in USD.
  No universal charge-minus-payment balance is claimed; unlike amounts are never pooled.
- **Submeasures** `<type>:expected_slots`, `<type>:<state>`, where *1.0.2* `<type>` is one of
  `supplier_cost`, `submitted_charge`, `allowed_amount`, `payer_paid`, `member_responsibility`,
  `member_collection`, `vendor_payment`; `settlements:count`,
  `settlements:balanced`, `settlements:event_total`, `settlements:allocated_total`,
  `settlements:unapplied_total`.
- **Population** *1.1.0* F (expected slots per completed leg and per P-C documented-cancelled
  request) and the settlement events known by K and effective by T.
- **Numerator** *1.1.0* not a single ratio: per slot type each state is a part of
  `<type>:expected_slots`; per settlement, applied plus unapplied amounts are compared with its
  signed amount.
- **Denominator** *1.1.0* `<type>:expected_slots` for each slot type, and `settlements:count`
  for settlement allocation. Unlike types and currencies are never pooled.
- **Exclusions** *1.1.0* none from F. Refund adjustments are source events, not expected slots
  (1.0.1), and are not in `settlements:*`; an event whose value is not known is not reconciled.
- **Milestone** *1.1.0* service completion: initial slots are expected at completion and
  follow-up slots after the 336-hour observation window from completion; for P-C, the documented
  cancellation.
- **Clocks** *1.1.0* financial event `effective_at` <= T and `received_at` <= K; the window
  boundary (census `completed_at` + 336 h) against T; claim version `available_at` <= T for the
  constructed submitted charge; allocation rows qualifying at T and K.
- **Lineage** *1.1.0* `src/cci/financial.py` (`facts`, `slots`, `reconcile`;
  `financial-slots.jsonl`, `allocation-reconciliation.json`) over F from
  `src/cci/expectations.py` `derive`, via `src/cci/cells.py`; slot policy `profiles.json`
  `financial_slot_policy`, meanings `financial-semantics.md`.
- **Limits** *1.1.0* unknown is never zero. A settlement balances only when applied plus
  unapplied equals its signed amount in one currency with every applied target existing, and a
  zero residual does not prove completeness when source coverage is unknown.

### M18 Claim-to-source conformance
- **Grain** claim version (latest per family at T) and claim field. **Population** active
  constructed claim versions. A version conforms only when every required comparison is
  assessable and passes.
- **Submeasures** `versions`, `conforming`, `mismatch`, `unassessable`, `fields_compared`,
  `fields_conforming`, `fields_mismatch`, `fields_unassessable`.
- **Owner role** *1.1.0* claims operations.
- **Numerator** *1.1.0* `conforming` versions; at field grain, `fields_conforming`.
- **Denominator** *1.1.0* `versions`; at field grain, `fields_compared`. Each grain is
  partitioned into conforming, mismatch and unassessable.
- **Exclusions** *1.1.0* versions that are not the latest of their family at T are outside the
  population; a version whose every source item has unknown census applicability is
  `unassessable`, not excluded.
- **Milestone** *1.1.0* claim construction: the latest claim version per family available by T.
- **Clocks** *1.1.0* claim version `available_at` <= T; source and reference truth from rows
  received by K whose effect is by T.
- **Lineage** *1.1.0* `src/cci/compare.py` (`source_to_claim`, `subject_dispositions`;
  `comparisons.jsonl`) and `src/cci/measures.py` `compute` (`claim-conformance.jsonl`), via
  `src/cci/cells.py`.
- **Limits** *1.1.0* a readiness result or receiver response does not prove this measure. While
  any version's active status is uncertain, the package contract withholds an unqualified
  overall rate.

### M19 Time to target-specific readiness
- **Grain** P unit per stage. Elapsed hours from the unit's governed trigger to the earliest
  established ready instant at that stage (*1.0.1, builder correction:* across the unit's claim
  versions, each counting only while it was the newest version; `first-ready.jsonl`) (the claim version and every supporting fact received
  by then). Never-ready and censored units sit beside the quantiles.
- **Submeasures** `ready`, `never_ready_or_censored`, `median_hours`, `p90_hours`.
- **Owner role** *1.1.0* claims operations.
- **Population** *1.1.0* P for that stage, the same units as the M15 `denominator`.
- **Numerator** *1.1.0* not a ratio: a duration distribution. `ready` counts units with an
  established ready instant; the quantiles are over their elapsed hours.
- **Denominator** *1.1.0* not a ratio: the stage's P units equal `ready` plus
  `never_ready_or_censored`.
- **Exclusions** *1.1.0* none: units never ready by T, including units with no claim version and
  unassessable units, are counted in `never_ready_or_censored`.
- **Milestone** *1.1.0* from the governed preparation trigger (completion, or a P-C documented
  cancellation's `effective_at`) to the earliest established ready state at that stage.
- **Clocks** *1.1.0* unit `trigger_at`; the ready instant is the latest of the claim version's
  `available_at` and every supporting fact's `received_at` (and the P-B grouping window), at or
  before T and before the next version's `available_at`. A backdated `effective_at` cannot make
  readiness earlier.
- **Lineage** *1.1.0* `src/cci/firstready.py` `compute` (`first-ready.jsonl`) over
  `src/cci/claims.py` `readiness`, via `src/cci/cells.py`.
- **Limits** *1.1.0* compare like triggers, targets and cohorts only. An authoritative retraction
  may invalidate historical readiness. Quantiles use the shared nearest-rank rule.

## Interpretation notes carried from the decision record (2026-10-18)

- M01, M03 and M16 are different populations (completed legs, first-submitted families,
  independently required reporting units) and are never presented as one funnel.
- The four equal hash buckets in the response policy are a disclosed synthetic coverage device,
  not prevalence. Client and profile differences are not rankings or causal findings.
- The 1,334 P-C vendor-payment blocks are distinguished from the 1,336 never-ready P-C families
  (decision record 2026-10-18).
