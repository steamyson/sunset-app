---
phase: quick
plan: 260409-h5b
subsystem: docs
tags: [privacy-policy, app-store, gdpr, location]
one_liner: "Privacy policy updated: location required, in-app account deletion, GDPR section, author name fix, April 9 date"
key_decisions:
  - "Location permission described as required for photo posting (not optional)"
  - "Section 8 now explicitly documents in-app account deletion flow"
  - "Section 10 replaced placeholder with substantive GDPR/international transfer text"
key_files:
  modified:
    - docs/index.html
metrics:
  duration: "~5 minutes"
  completed: "2026-04-09"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260409-h5b: Update Privacy Policy for Location Requirement

## Summary

Updated `docs/index.html` (Dusk privacy policy) with five targeted changes required before App Store submission:

1. **Date** — "April 5, 2026" → "April 9, 2026"
2. **Section 1** — Removed square brackets around `Akiva Groener`
3. **Section 3 (Location)** — Replaced vague optional-sounding bullet with explicit "required for posting" language explaining sunset-expiry dependency and what happens if permission is revoked
4. **Section 8 (Your choices)** — Added in-app account deletion paragraph describing what data is permanently removed
5. **Section 10 (International users)** — Replaced placeholder text with substantive GDPR paragraph covering data transfer consent and EEA/UK rights

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | 83e3d76 | chore(quick-260409-h5b): update privacy policy for location, deletion, GDPR |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all placeholder text has been replaced with substantive content.

## Self-Check: PASSED

- `docs/index.html` exists and contains all five required strings
- Commit 83e3d76 verified in git log
- `[Akiva` bracket pattern: 0 matches (brackets removed)
