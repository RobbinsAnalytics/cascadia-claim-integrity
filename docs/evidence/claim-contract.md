# Claim contract (surface 3 companion)

How the claim engine (`src/cci/`) binds every logical claim field to its source and rule. The
specification is the accepted package's `contracts/field-mapping.md` (field-by-field mapping,
reference applicability, normalization) and `contracts/profiles.json` (required fields per
profile, `permitted_derivations`, `forbidden_derivations`, components, quantity and money
policy). This file does not restate or change either; it records how the build honors them and
where the evidence is.

## Every field carries its provenance

Each claim version in `governance/claim-lineage.jsonl` (12,041 versions, all positions) records,
for every field and source item, a support class (`source`, `reference`, `derivation`,
`missing`, or `conflicting`) and the exact supporting source row ids and revisions; and, per
version, every bound source id, the rule version (`CCI-SYNTHETIC-CONTRACT-1/1.0.0`), the source
item keys, the line ids with their explicit allocations, `available_at` (when every supporting
fact was received), the predecessor version and the content SHA-256. A field with no permitted
support is `missing`; one with conflicting support keeps every candidate and selects none.
Neither is ever filled. Line codes and charges are `derivation` under the governed synthetic
code system and rate table.

## Permitted and forbidden derivations

Only the seven derivations in `profiles.json` `permitted_derivations` are applied (UTC service
date from the sourced start time; line code from profile and component; base and cancellation
quantity 1.00; mileage quantity from supported `distance_miles` with no estimate; line charge
from quantity and the versioned synthetic rate; header charge from distinct line charges;
internal identities from scoped keys). Each forbidden derivation is a control:

| Forbidden derivation | Where it is checked |
|---|---|
| member id copied into subscriber id | `claim_field_support_complete` (reference-role fields with derivation support alert), SF25 |
| driver or destination as billing provider | `claim_field_support_complete`, role-specific reference binding |
| unknown amount coerced to zero | `financial_amount_semantics_valid`, M17 slot states (unknown is never zero) |
| supplier cost used as payer paid, collection or settlement | `responsibility_collection_distinct`, `financial_amount_semantics_valid` |
| authorization, clinical code, signature or receiver outcome inferred from completion | `claim_field_support_complete`, `stage_namespace_valid` |
| expected membership derived from claims, submissions or responses | `preparation_population_complete`, `service_universe_accounted` (independent P from census, requests and profiles) |

## Verification

- Source to claim: M18 compares every field of every latest version with the independently
  re-read source (312,441 fields at current later; 0 mismatched, 21 unassessable and kept
  apart). Claim to payload is a separate layer (M11); neither replaces the other.
- The verifier (`src/verify_small_paths.py`) and the re-derivation (`src/validate_measures.py`)
  re-derive from raw sources and contracts without importing `src/cci`.
- The independent controls (`src/controls.py`) re-check field support, allocation balance,
  readiness binding and the submitted-snapshot identity at every position.
- Results: `governance/claim-validation.json`, `governance/reconciliation.md` (claims and
  payloads section), `governance/check-results.json`.

## Known limits

- One completed SYN-C03 service has no landed ride (the disclosed withheld ride): its trip
  facts are missing, it stays in every denominator and forms its own P-B family.
- Line codes and charges are governed synthetic derivations (`CCI-DEMO:1.0.0`), not real
  billing codes or rates.
