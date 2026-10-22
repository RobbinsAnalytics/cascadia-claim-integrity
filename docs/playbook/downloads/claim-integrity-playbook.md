# Claim Integrity Playbook: v2 front-end draft

## Business problem

Claim Integrity has expanded across more health plans, contract rules, claim workflows and reporting obligations. Roughly a dozen upstream sources provide ride activity, eligibility, authorizations, billing references, vendor payments and recipient responses.

- **False confidence:** connectors can report success while required tables remain stale for days. Reports continue without all required source changes.
- **Unclear cause:** a missing fact may reflect a source gap, extraction delay or ingestion loss. The team cannot readily distinguish them.
- **Change pressure:** established, certified downstream transformations depend on an unreliable source-to-staging handoff. A redesign and AI-assisted pipeline changes still require defensible evidence; engineering remains accountable.

**Problem statement:** How can Claim Integrity determine which decisions its incoming evidence supports—and prove that recovery or a pipeline change restores reliable results?

### Business case for the playbook

1. Protect claim decisions: make readiness depend on evidence, not just a green pipeline run.
2. Manage reporting exposure: identify holds, owners and obligations while gaps are resolved.
3. Restore confidence deliberately: require recovery evidence and independent release approval.

The playbook responds through five decisions: trust, diagnosis, containment, recovery and release.


Five decisions for the moment a successful sync stops being enough.

Technical success is context. Business supportability needs evidence.

Illustrative examples; no operational data.

## Evidence states

### Supported
The agreed evidence is current and sufficient.

### Unsupported
Evidence shows a requirement is not met.

### Unknown
Evidence is missing, expired or inconclusive.

### Restricted use
A scoped, approved exception. It does not change the evidence.

Freshness: current enough for this use?

Completeness: everything expected accounted for?

Recent does not mean complete. A quiet source needs evidence too.

## Five decision paths

### Trust: Can this evidence support this use?

1. **Define the use:** Name the plan, purpose and time window.

2. **Check the evidence:** Compare freshness, coverage and required facts.

3. **Choose the boundary:** State what is supported, missing or unknown.

- **Supported:** Continue within the verified scope.

- **Unknown or unsupported:** Hold dependent actions; record exceptions separately.

Evidence to request:
- An agreed dataset/use contract and scope.
- A bounded source observation, not just a sync status.
- Arrival, coverage and validity checks with an expiry.

Accountable: Business-use owner

Done when: A scoped decision, evidence and next review are recorded.

### Diagnosis: Where did the evidence go missing?

1. **Trace one fact:** Start with a source observation for the same key or version.

2. **Compare each handoff:** Source → extract → staging → downstream use.

3. **Locate the first gap:** Name the earliest proven absence or alteration.

- **Break located:** Assign the relevant owner and next investigation.

- **Boundary unobservable:** Keep the diagnosis indeterminate; retain containment.

Evidence to request:
- A key-specific source observation.
- Extract and landing receipts for the same interval.
- Rejected, altered or unconsumed facts and their reasons.

Accountable: Data-platform lead

Done when: The cause or bounded uncertainty has an owner and next action.

### Containment: What depends on the gap?

1. **Map potential exposure:** Include decisions based on absent records.

2. **Separate the actions:** Distinguish future work from outcomes already sent.

3. **Protect what matters:** Hold exposed actions; keep independent work moving.

- **Exposed:** Hold, revisit or restate with a named owner.

- **Independently supported:** Continue with an explicit evidence basis.

Evidence to request:
- Dependency scope, targets, measures and consumers.
- Past submissions, publications and escalations at risk.
- Obligations and deadlines, which never pause.

Accountable: Incident lead

Done when: Every exposed conclusion has a response, owner and deadline.

### Recovery: What establishes reliable results again?

1. **Preserve the past:** Retain prior state and actual knowledge times.

2. **Check the repair:** Compare recovered facts and independent expectations.

3. **Revisit the effects:** Reconcile retries, prior actions and remaining holds.

- **Scope proven:** Obtain sign-off; release holds for that scope.

- **Evidence unresolved:** Keep it unrecovered; do not imply full closure.

Evidence to request:
- Bounded source-to-output reconciliation and version history.
- Independent expectations; rebuild agreement is a consistency check.
- Stable action identity, recipient contract and domain sign-off.

Accountable: Data-platform lead

Done when: Proven scope and past-action dispositions are explicit.

### Release: Should this specific change proceed?

1. **State the behavior:** Describe intended differences before judging the code.

2. **Challenge the candidate:** Use independent expectations and relevant regressions.

3. **Record the decision:** Explain acceptance, rejection or remaining uncertainty.

- **Evidence sufficient:** Engineering authorizes with independent approval.

- **A gap remains:** Return the candidate; keep a rollback path.

Evidence to request:
- An identified candidate and change specification.
- Independent expected results and ordering/check-retention evidence.
- Reviewer, limitations and observation/rollback plan.

Accountable: Engineering lead + independent approver

Done when: A candidate-specific decision and next action are recorded.

## Walkthroughs

### A green connector. A missing handoff.

**Situation:** Authorization changes stop arriving for one plan’s audit target.

**Risk:** “No authorization found” may be an evidence gap, not a source fact.

**First move:** Contain the exposed audit decisions. Keep supported encounter work moving.

1. **Notice the mismatch:** A bounded source observation shows changes the staging layer cannot account for.

2. **Contain before diagnosis:** Hold exposed audit decisions, including absence-based conclusions. Reporting deadlines keep running.

3. **Find the first gap:** The changes are already missing from the extract. Extraction is the first demonstrated break.

4. **Register past consequences:** Review the audit package already sent, the readiness summary and any prior escalation. Assign owners.

5. **Review the recovery:** Request reconciliation, actual arrival times, independent expectations and duplicate-effect precautions.

6. **Close deliberately:** Revisit prior actions and obligations; close only after uncertainty and communication are dispositioned.

Decision lesson: Potential exposure comes first. Confirmed impact comes later. Hindsight cannot justify a smaller initial hold.

### The action may have landed. The acknowledgement did not.

**Situation:** Recovery redelivers a correction while a separate action lacks acknowledgement.

**Risk:** A correct final record does not prove an external action happened once.

**First move:** Separate version identity, delivery attempts and the external action.

1. **Keep the right identity:** The same version arriving again is a duplicate delivery. A valid new correction must be retained.

2. **Preserve knowledge time:** Keep the correction’s actual arrival time and its earlier business-effective date.

3. **Check the recipient contract:** Reconcile the original action’s identity and the recipient’s acceptance evidence.

4. **Avoid the blind retry:** If accepted, record that fact. If lookup is ambiguous or unavailable, keep the outcome unresolved. A lookup alone cannot remove races.

5. **Authorize the disposition:** Operations or finance reviews the result. A replacement decision is separate from permission to send it.

Decision lesson: Safe recovery covers effects as well as records. No acknowledgement is not proof that nothing happened.

### A faster rewrite. A weaker decision rule.

**Situation:** An AI-assisted rewrite selects whichever conflicting revision arrives last.

**Risk:** Its own tests pass, but the contract requires incompatible revisions to remain a conflict.

**First move:** Write the expected behavior before reviewing the candidate.

1. **Name the required result:** Incompatible parallel versions remain an explicit conflict, not an arbitrary winner.

2. **Challenge independently:** Request a conflicting-version example, input-order variations and comparison with expected results.

3. **Reject the weaker rule:** Silent winner selection fails the stated behavior. Also confirm a green connector cannot suppress missing-evidence detection.

4. **Review the correction:** A revised proposal must preserve conflict handling and existing checks, with independent approval.

5. **Keep the boundary visible:** Record limitations and rollback. This walkthrough is not an executed release or benchmark.

Decision lesson: Generated code and self-authored tests do not replace a behavior specification and independent review.

## Guided templates

### Trust contract

- **Dataset + use:** Which decision needs this evidence?
  - Example: Authorization references · audit readiness
  - Your record: [complete]

- **Scope + interval:** Which plan, partition and source window are covered?
  - Example: Audit use for one plan; agreed change window
  - Your record: [complete]

- **Evidence:** What independent observation could challenge the sync status?
  - Example: Source observation plus accepted/rejected changes
  - Your record: [complete]

- **Criteria + expiry:** What makes evidence current and complete enough?
  - Example: Coverage reconciled; refresh before the next decision
  - Your record: [complete]

- **Decision + basis:** What is supported, unsupported or still unknown?
  - Example: Unknown: source coverage has not been established
  - Your record: [complete]

- **Restricted use:** Who can authorize an exception, for what use and until when?
  - Example: Internal exploration only; no external submission
  - Your record: [complete]

- **Owner + review:** Who is accountable and when is the next check?
  - Example: Business-use owner; review before hold release
  - Your record: [complete]

### Incident decision record

- **Reference + detection:** What identifies the incident and when did uncertainty begin?
  - Example: Authorization handoff gap; detected during readiness review
  - Your record: [complete]

- **Boundary + uncertainty:** What interval was inspected and what remains unproven?
  - Example: Source changes observed; extraction coverage unresolved
  - Your record: [complete]

- **Potential exposure:** Which conclusions rely on this scope being complete?
  - Example: Audit readiness, including “no authorization” outcomes
  - Your record: [complete]

- **Work continuing:** What remains independently supportable, and why?
  - Example: Encounter use continues under its own requirements
  - Your record: [complete]

- **Prior actions:** What has already been sent, published or escalated?
  - Example: Review an earlier audit package and readiness summary
  - Your record: [complete]

- **Holds + deadlines:** Who owns each action and which due times still apply?
  - Example: Operations owns the hold; reporting retains the deadline
  - Your record: [complete]

- **Diagnosis + next step:** What is the first proven divergence or missing observation?
  - Example: Inspect the extract against the same source interval
  - Your record: [complete]

- **Communication:** Who needs an update, from whom, and at what checkpoint?
  - Example: Incident lead updates affected consumers after diagnosis
  - Your record: [complete]

### Recovery review

- **Scope + prior state:** What is being recovered, and what historical view was retained?
  - Example: Affected authorization interval; preserve prior readiness
  - Your record: [complete]

- **Versions + comparison:** Which source versions match, differ or remain unresolved?
  - Example: Account for source changes and rejected versions
  - Your record: [complete]

- **Effective + knowledge time:** Was an old fact learned late rather than known earlier?
  - Example: Keep the historical effective date and actual arrival
  - Your record: [complete]

- **Expected results:** What independent expectation challenges the repair?
  - Example: Compare agreed outcomes; rebuild equality is supplementary
  - Your record: [complete]

- **Duplicate effects:** Could a retry repeat an action already accepted?
  - Example: Reconcile stable action ID under the recipient contract
  - Your record: [complete]

- **Past actions + sign-off:** What must be confirmed, replaced, restated or withdrawn?
  - Example: Operations reviews the prior package; finance attests effects
  - Your record: [complete]

- **Release + closure:** Which holds can end, and what prevents full closure?
  - Example: Release proven scope only; retain unresolved obligations
  - Your record: [complete]

### Release decision

- **Candidate + intent:** Which version changes which behavior?
  - Example: Staging rewrite; preserve explicit conflict handling
  - Your record: [complete]

- **Independent checks:** What results would reveal the candidate is wrong?
  - Example: Conflicting revisions, order variations and detection retention
  - Your record: [complete]

- **Differences + limits:** Are all changes intended and every gap visible?
  - Example: Explain each changed result; disclose untested behavior
  - Your record: [complete]

- **Author + approver:** Is the approver outside the authoring and integration side?
  - Example: Engineering owns release; an independent reviewer approves
  - Your record: [complete]

- **Observe + roll back:** How will an unexpected result be noticed and reversed?
  - Example: Named observation points and a retained baseline
  - Your record: [complete]

- **Decision + reason:** Accept, reject or clarify: what evidence supports the choice?
  - Example: Reject: input order changes the selected revision
  - Your record: [complete]

- **Owner + next action:** Who is accountable for the decision and follow-up?
  - Example: Engineering lead requests a corrected candidate
  - Your record: [complete]

### Communication note

- **Audience + reference:** Who needs this message and which incident does it concern?
  - Example: Operations, reporting and affected metric consumers
  - Your record: [complete]

- **Known + uncertain:** What is established, missing and potentially affected?
  - Example: Source changes exist; audit readiness is not yet supported
  - Your record: [complete]

- **Continue + hold:** What can proceed and what must wait?
  - Example: Supported encounter work continues; exposed audit use held
  - Your record: [complete]

- **Deadlines + action:** Which clock still runs, and what should the recipient do?
  - Example: Reporting keeps the due time; avoid unsupported resubmission
  - Your record: [complete]

- **Owner + next update:** Who will communicate again and after which event?
  - Example: Incident lead updates after the source/extract comparison
  - Your record: [complete]

- **Recovery status:** Does the wording distinguish proven scope from uncertainty?
  - Example: One scope reconciled; remaining scope stays under review
  - Your record: [complete]

## Sources and limits
Research reviewed October 21, 2026. Primary references inform general practice; claim-specific decisions are adaptations.

- [R1] [Google SRE: Monitoring distributed systems](https://sre.google/sre-book/monitoring-distributed-systems/)

- [R2] [Google SRE Workbook: Incident response](https://sre.google/workbook/incident-response/)

- [R3] [Amazon Builders’ Library: Safe retries and idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)

- [R4] [NIST SP 800-218: Secure Software Development Framework 1.1](https://csrc.nist.gov/pubs/sp/800/218/final)

- [R5] [dbt documentation: Source freshness](https://docs.getdbt.com/docs/deploy/source-freshness)

No operational data or outcomes are computed. No production or compliance assurance is claimed. Actual contracts, deadlines and authority belong to the organization.

Frozen v1: https://claim-integrity-playbook-mobile.tender-bard-1885.chatgpt.site

## Selected worksheet fields: why they matter

### Trust · Evidence

A successful sync reports transport activity. Independent evidence is needed to establish whether the intended source changes arrived.

### Trust · Criteria + expiry

Agree the threshold and expiry before reviewing the result. Otherwise a convenient observation can quietly become the acceptance rule.

### Incident · Potential exposure

Start with everything that could depend on the gap, including decisions based on absence. Narrow the boundary only when evidence supports doing so.

### Incident · Holds + deadlines

A hold stops an exposed action; it does not pause an external obligation. Record the deadline owner and escalation while the hold is active.

### Recovery · Effective + knowledge time

Keep when a fact was effective separate from when it actually became known. A backfill must not make past decisions appear better informed than they were.

### Recovery · Duplicate effects

Repeating a request can repeat its effect. Check the recipient’s identity and acceptance rules before treating a retry as safe.

### Release · Independent checks

Define the expected behavior separately from the candidate implementation. Otherwise a check may simply repeat the same mistaken assumption.

### Release · Author + approver

Name an independent approver so implementation confidence is challenged before permission to release is granted.

### Communication · Known + uncertain

Give uncertainty its own explicit statement. Silence can otherwise be mistaken for confirmation that a result is safe to use.

### Communication · Deadlines + action

Pair every deadline with a concrete action and accountable owner. An update without an action can leave the obligation unattended.

## Scenario sequencing

- Stale authorizations: notice the mismatch → contain exposed actions → [find the first gap AND register past consequences, in parallel] → review recovery → close deliberately. The hold remains active during parallel work.
- Uncertain retry: [preserve identity AND knowledge time, in parallel] → check recipient contract → avoid blind retry → authorize disposition. Complete both fact-preservation tasks before the next stage.
- AI-assisted change: name the required result → challenge independently → reject the weaker rule → review the correction → keep the boundary visible.

Arrows describe the sequence. Parallel tasks must both complete before continuing to the next stage.
