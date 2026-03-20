# Roadmap: Dusk

## Overview

Four independent capability areas — Globe polish, sky canvas collision, Auth, and push notifications — complete the remaining work toward App Store submission. Each phase delivers a self-contained, verifiable capability. Globe changes land first because they touch the same gesture-heavy canvas as the collision work, and separating them reduces regression risk.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Globe** - Deeper zoom, continent line art, and globe rotation
- [ ] **Phase 2: Sky Canvas** - Guaranteed overlap-free cloud layout + zoom-into-cloud room transition
- [ ] **Phase 3: Auth** - Production-ready email OTP and Google OAuth sign-in
- [ ] **Phase 4: Push Notifications** - Reliable sunset alert and new-photo room notifications

## Phase Details

### Phase 1: Globe
**Goal**: Users can explore a richly interactive globe with visual continent art and responsive rotation
**Depends on**: Nothing (first phase)
**Requirements**: GLOB-01, GLOB-02, GLOB-03
**Success Criteria** (what must be TRUE):
  1. User can pinch further into the sky canvas and the globe stays visible without snapping back to sky view
  2. The globe surface shows continent outlines as SVG line art that rotate together with the globe
  3. Dragging the globe rotates it — continent lines track the drag — while room clouds remain independently positioned above the surface
**Plans**: TBD

### Phase 2: Sky Canvas
**Goal**: All room clouds are visible and non-overlapping on every canvas load and after every new room joins; tapping a cloud transitions into the room with a zoom-into-cloud animation
**Depends on**: Phase 1
**Requirements**: SKY-01, SKY-02, SKY-03
**Success Criteria** (what must be TRUE):
  1. On canvas load with multiple rooms, no two clouds overlap (verified by visual inspection and AABB check)
  2. When a new room cloud is added, it appears in a position that does not overlap any existing cloud
  3. When there is not enough space to place all clouds at full size, all clouds shrink proportionally so every room remains visible
  4. Tapping a cloud zooms the camera into it; the room screen emerges from inside the cloud (no plain navigation push)
**Plans**: TBD

### Phase 3: Auth
**Goal**: Users can securely sign in and link their account via email or Google, with room restoration across devices
**Depends on**: Phase 2
**Requirements**: AUTH-01, AUTH-02
**Success Criteria** (what must be TRUE):
  1. User can enter an email address, receive a one-time code, and complete sign-in end-to-end on a production build
  2. User can tap "Sign in with Google", authenticate in the browser/sheet, and return to the app signed in
  3. After signing in on a new device, the user's previous rooms appear restored in the sky canvas
  4. Profile tab accurately reflects signed-in state and allows signing out
**Plans**: TBD

### Phase 4: Push Notifications
**Goal**: Users are reliably notified before golden hour and when new photos arrive in their rooms
**Depends on**: Phase 3
**Requirements**: PUSH-01, PUSH-02
**Success Criteria** (what must be TRUE):
  1. A push notification arrives on the user's device at the configured lead time before golden hour (not just a local notification scheduled at app open)
  2. When a room member posts a photo, all other members of that room receive a push notification within a reasonable delivery window
  3. Tapping either notification navigates the user to the relevant screen (home countdown or room thread)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Globe | 0/TBD | Not started | - |
| 2. Sky Canvas | 0/TBD | Not started | - |
| 3. Auth | 0/TBD | Not started | - |
| 4. Push Notifications | 0/TBD | Not started | - |
