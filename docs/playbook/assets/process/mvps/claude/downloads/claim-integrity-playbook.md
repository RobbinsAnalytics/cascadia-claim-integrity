# Can the evidence support the decision?

CASCADIA / CLAIM INTEGRITY · Claim Integrity Playbook v2.0 · Research reviewed October 21, 2026

A successful sync is not enough. This playbook shows how to assess incoming evidence, contain uncertainty, and establish a defensible path back to reliable decisions.

> Fictional playbook. No operational data. Examples describe decisions and evidence to request; they do not represent executed checks or real incidents.

**Five decisions:** Trust · Diagnosis · Containment · Recovery · Release

**Scope.** For operations and data-platform leads working across source systems, claim readiness and encounter reporting. Start with the decision that is uncertain, then follow the relevant scenario and template. This guide explains a process; it does not operate a claims platform.

**Principle.** Technical success is context. Business supportability requires evidence relevant to the decision.

## Decision guides

### Evidence states

- **Supported:** Current evidence meets the agreed requirements for the stated use and scope.
- **Unsupported:** Available evidence demonstrates a breach of those requirements.
- **Unknown:** Required evidence is missing, inconclusive or no longer current.
- **Restricted use:** A separately authorized, limited use with a named owner, caveat and expiry. Permission does not turn unknown evidence into supported evidence.

Freshness asks whether evidence is current enough. Completeness asks whether the expected evidence is accounted for. Recent arrivals can hide an earlier gap; a genuinely quiet source can remain trustworthy when its lack of change is independently established. Thresholds belong to the organization's agreed contract, not this example. [R1, R5]

### Trust

- **Question:** Can this evidence support this business use now?
- **Trigger:** A readiness decision, reporting task or review needs evidence whose coverage or currency is uncertain.
- **Evidence to request:** The dataset/use agreement; the health-plan or partition scope; a bounded source observation; arrival and coverage information; relevant missing or invalid facts; and the time that evidence was evaluated.
- **Decision rule:** Call the evidence supported only within its demonstrated scope and lifetime. Treat a proven breach as unsupported and a missing observation as unknown. Do not infer completeness from a recent timestamp or connector status.
- **Action:** Permit supported work; place targeted holds on unsupported or unknown dependencies. Record any restricted use separately with its caveat and expiry.
- **Accountable owner:** Owner of the business use; engineering supplies the evaluation evidence.
- **Exit condition:** A scoped decision is recorded with its evidence, owner and next review or expiry.
- **Read next:** Scenario 1 and the Trust contract template.

### Diagnosis

- **Question:** At which boundary did the evidence first become missing or altered?
- **Trigger:** An unexpected missing fact or an unsupported/unknown input.
- **Evidence to request:** A key-specific source observation, extraction manifest, staging acceptance/rejection details and downstream consumption evidence, all referring to a comparable source interval or version.
- **Decision rule:** Locate the first demonstrated divergence. If the source never contained the fact, record a source/business gap. If an extract contained it but staging did not, inspect landing/rejection. If staging preserved it but the output did not, inspect downstream use. When a boundary cannot be observed, state that diagnosis remains indeterminate.
- **Action:** Assign the next investigation to the relevant owner. Keep provisional containment in place while diagnosis continues. Matching counts cannot rule out a changed field value.
- **Accountable owner:** Data-platform lead; the source owner confirms a specific source omission.
- **Exit condition:** The inspected scope, known cause or bounded uncertainty, and next responsible owner are recorded.
- **Read next:** Scenario 1 and the Incident decision record.

### Containment

- **Question:** Which decisions could depend on the missing evidence, and what can safely continue?
- **Trigger:** Trust breaks; root-cause confirmation is not required first.
- **Evidence to request:** Dependency scope, prior decisions, claim/target uses, reporting obligations and deadlines, affected measures, and registered consumers. Include conclusions based on absence, such as “no authorization found”.
- **Decision rule:** Separate potential exposure known during the incident from the smaller impact that may be confirmed after recovery. A claim can be exposed for one target while another use remains supportable. Already-submitted or published outcomes require later review even when future actions are held.
- **Action:** Hold unsupported actions, continue independently supported work, notify affected consumers and register past actions at risk. Keep obligation clocks running; escalate deadline risk internally rather than claiming the deadline paused.
- **Accountable owner:** Incident lead, supported by operations, reporting and metric owners.
- **Exit condition:** Exposed decisions have a response, owner and deadline; unaffected uses have a recorded basis for continuation.
- **Read next:** Scenario 1 and the Incident or Communication template. [R2]

### Recovery

- **Question:** What establishes that recovered evidence is incorporated correctly and consequences are addressed?
- **Trigger:** Missing or corrected evidence becomes available, or a repair is proposed.
- **Evidence to request:** Preserved prior state; bounded source-to-output comparison; versions and actual arrival/knowledge times; a replay/effect review; independent expected outcomes; and dispositions for decisions already acted on.
- **Decision rule:** Accept only the scope that can be proven. Preserve what was known at earlier decision times. A correction can be effective in the past without pretending it arrived earlier. Agreement between an incremental repair and a full rebuild is a consistency check, not independent proof that both are correct.
- **Action:** Retain legitimate versions, prevent duplicate effects, revisit prior actions, obtain domain sign-off, and release holds per supported conclusion. An uncertain acknowledgement requires reconciliation and a safe recipient contract, not a blind resend.
- **Accountable owner:** Data-platform lead; operations and finance attest their respective consequences.
- **Exit condition:** Proven scope and remaining uncertainty are explicit. Incident closure additionally requires past-action, consumer and obligation follow-up.
- **Read next:** Scenario 2 and the Recovery review template. [R3]

### Release

- **Question:** Is there enough evidence to accept this specific pipeline change?
- **Trigger:** A new or changed implementation, including AI-generated code, is proposed.
- **Evidence to request:** Intended behavior; identified candidate/version; independent expected results; relevant regression and ordering checks; known limitations; reviewer; and rollback/observation plan.
- **Decision rule:** Require explained differences and independently assessed behavior. Generated tests alone are insufficient. Keep the authoring side separate from independent approval. Software-security guidance is useful context but does not establish claim-data correctness.
- **Action:** Accept, reject or return for clarification with reasons. Record the intended operating boundaries and a rollback path; do not infer release readiness from this fictional walkthrough.
- **Accountable owner:** Engineering lead, with mandatory independent approval outside the authoring side.
- **Exit condition:** A candidate-specific decision, evidence limits, owner and next action are recorded.
- **Read next:** Scenario 3 and the Release decision template. [R4]

## Scenarios

Each scenario is a fictional walkthrough, not an executed test or a real incident.

### Scenario 1: The connector is green; authorization evidence is stale

*Fictional walkthrough*

**Setup.** One fictional plan requires authorization support for an audit target. The encounter target has a different requirement. A connector reports success while authorization changes for that plan fail to arrive. Other inputs continue updating. This is an illustrative policy, not a statement about a real plan.

1. **Recognize the uncertainty.** A source-side observation indicates changes inside a stated interval. Staging cannot account for them. The connector's green status does not settle supportability.
2. **Contain before diagnosing.** Operations holds exposed audit decisions, including conclusions based on “no authorization found”. The independently supported encounter use continues. Reporting deadlines remain visible.
3. **Locate the gap.** The team compares the same source interval through extraction and staging. The missing changes are already absent in the extract, so extraction is the first demonstrated break. A source record that never existed would require a different follow-up.
4. **Register prior consequences.** An audit package already sent needs review; a readiness summary needs possible restatement; a prior escalation may need withdrawal. Record owners rather than silently replacing history.
5. **Review recovery.** Request source-to-output reconciliation, version/arrival evidence, independent expected outcomes and duplicate-effect precautions. Do not declare recovery merely because a backfill finishes.
6. **Close deliberately.** Operations revisits prior actions, reporting follows obligations, and the incident lead closes only after the remaining uncertainty and communications are dispositioned.

**Decision lesson.** Exposure is what could depend on the gap at detection time. Realized impact is what later evidence confirms changed. Hindsight cannot justify a smaller initial hold.

**Evidence needed.** Bounded source observation, extract/landing comparison, exposed-decision register, preserved prior state and recovery review.

**Limit.** No record set, reconciliation or backfill was executed in this example.

**Related.** Trust, Diagnosis, Containment, Recovery; Incident decision record.

### Scenario 2: The acknowledgement is missing

*Fictional walkthrough*

**Setup.** A recovery redelivers a legitimate correction. Separately, an action may have reached its recipient, but the sender did not retain acknowledgement. These are different identity problems.

1. Keep the correction's entity and immutable version separate from its delivery attempt. Repeated delivery of the same version is different from a valid new correction.
2. Preserve the correction's actual arrival time and earlier business-effective date. Keep the original decision view available.
3. For the uncertain action, identify the original action and inspect the recipient's acceptance evidence under its documented idempotency contract.
4. If acceptance is confirmed, record that result rather than sending a duplicate. If the probe is unavailable or ambiguous, keep the action unresolved. A lookup by itself cannot remove race conditions or guarantee safe retries.
5. Operations or finance reviews the proposed disposition. A recorded replacement decision is separate from authorization to execute it.

**Decision lesson.** Correct final tables do not prove that an external action happened only once.

**Evidence needed.** Version chain, knowledge times, stable action identity, recipient contract and acceptance evidence, and authorized disposition.

**Limit.** This narrative describes a review; it does not send, reconcile or simulate a payment or submission. [R3]

**Related.** Recovery; Recovery review and Communication templates.

### Scenario 3: The faster AI-assisted change

*Fictional walkthrough*

**Setup.** An AI-assisted rewrite proposes choosing whichever conflicting revision arrives last. Its own tests pass. The intended business rule instead requires incompatible parallel versions to remain an explicit conflict.

1. State the required conflict behavior before reviewing the candidate.
2. Ask for an independently specified conflicting-version example, input-order variations and comparison with intended outputs.
3. Reject the proposed behavior when it silently chooses a winner. A second check should confirm that connector success cannot suppress the missing-evidence warning.
4. A corrected proposal would retain conflicts and preserve existing checks. Acceptance still requires candidate-specific evidence and independent approval.
5. Record limitations and a rollback plan. Do not represent the fictional corrected proposal as a tested release.

**Decision lesson.** Faster implementation and self-authored tests do not replace a behavior specification and independent review.

**Evidence needed.** Change specification, candidate identifier, independent expectations, check results, reviewer and rollback plan.

**Limit.** No candidate code, benchmark or test execution is supplied by this playbook.

**Related.** Release; Release decision template.

## Blank templates

These templates are prompts for a real team's records. They are intentionally blank and do not submit or store information here.

### Trust contract

- Dataset and business use: [complete]
- Plan/partition and source interval: [complete]
- Evidence required and independent source: [complete]
- Currency/completeness criteria and expiry: [complete]
- Supported/unsupported/unknown decision and basis: [complete]
- Restricted-use authorization, caveat and expiry, if any: [complete]
- Accountable owner and next review: [complete]

### Incident decision record

- Incident reference and detection time: [complete]
- Observation boundary and current uncertainty: [complete]
- Exposed decisions, including absence-based conclusions: [complete]
- Supported work continuing and justification: [complete]
- Prior actions at risk and proposed dispositions: [complete]
- Holds, owners and unchanged deadlines: [complete]
- Diagnosis, evidence gaps and next action: [complete]
- Communication owner and next update: [complete]

### Recovery review

- Recovery scope and retained prior state: [complete]
- Source versions, payload comparison and unresolved scope: [complete]
- Effective times versus actual knowledge times: [complete]
- Independent expected results and rebuild consistency: [complete]
- Duplicate-effect and uncertain-acknowledgement review: [complete]
- Past-action dispositions and domain sign-off: [complete]
- Hold releases, remaining obligations and closure decision: [complete]

### Release decision

- Candidate/version and intended behavior: [complete]
- Independent expectations and relevant checks: [complete]
- Explained differences and unresolved limitations: [complete]
- Authoring side and independent approver: [complete]
- Observation/rollback plan: [complete]
- Accept/reject/clarify decision and reason: [complete]
- Accountable engineering owner and next action: [complete]

### Communication note

- Audience and incident reference: [complete]
- What is known, uncertain and affected: [complete]
- What continues and what is held: [complete]
- Deadlines and required recipient action: [complete]
- Owner and next update: [complete]
- Recovery/disposition status without overstating proof: [complete]

## Sources and limits

Research reviewed: October 21, 2026. Sources inform general engineering practice. The Claim Integrity-specific decisions and fictional policies are original adaptations, not verified production facts or regulatory requirements.

- R1. Google SRE, Monitoring Distributed Systems: <https://sre.google/sre-book/monitoring-distributed-systems/>
- R2. Google SRE Workbook, Incident Response: <https://sre.google/workbook/incident-response/>
- R3. Amazon Builders' Library, Making retries safe with idempotent APIs: <https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/>
- R4. NIST SP 800-218, SSDF 1.1: <https://csrc.nist.gov/pubs/sp/800/218/final>
- R5. dbt documentation, Source freshness: <https://docs.getdbt.com/docs/deploy/source-freshness>

General guidance only. Actual contracts, deadlines and authority must be set by the organization. This site contains no operational data, computes no claim outcome and makes no production or compliance assurance claim.

---

Playbook v2.0 · Research reviewed October 21, 2026 · Fictional examples · No operational data
