---
phase: 1
slug: globe
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript type-checker (npx tsc --noEmit) |
| **Config file** | tsconfig.json |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx tsc --noEmit` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | GLOB-03 | type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | GLOB-01 | type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 1-02-01 | 02 | 2 | GLOB-02 | type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 1-02-02 | 02 | 2 | GLOB-02 | manual | visual inspection on device | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test framework installation needed — TypeScript strict mode is the primary automated verification tool.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Continent art matches star-atlas aesthetic | GLOB-02 | Visual quality judgement | Launch app, zoom into globe, confirm continent outlines are visible, non-cartographic, and feel atmospheric |
| Globe stays visible at min zoom 0.18 without snap-back | GLOB-01 | Gesture interaction | Pinch to max zoom-in, confirm globe does not snap back to sky canvas |
| Drag-to-rotate feels responsive | GLOB-03 | Gesture feel | Drag globe, confirm continent lines track drag without lag or jitter |
| Room clouds hide cleanly behind globe | GLOB-03 | Visual correctness | Position a cloud behind globe, confirm opacity is 0 (not 35%) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
