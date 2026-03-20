# Requirements: Dusk

**Defined:** 2026-03-20
**Core Value:** Photos tied to the daily sunset — rooms that bloom at golden hour and fade by the next one

## v1 Requirements

### Globe

- [ ] **GLOB-01**: User can zoom into globe deeper without it snapping back to sky canvas
- [ ] **GLOB-02**: Globe surface displays continent outline line art (SVG, rotates with globe)
- [ ] **GLOB-03**: Dragging globe rotates it (continent lines move with it); room clouds drift independently on top

### Sky Canvas

- [ ] **SKY-01**: On canvas load, all room clouds are arranged without overlapping; all clouds shrink proportionally if needed to fit
- [ ] **SKY-02**: When a new cloud is added, it is placed without overlapping existing clouds; all clouds shrink proportionally if space is tight

### Auth

- [ ] **AUTH-01**: User can sign in / link account via email OTP (production-ready, end-to-end)
- [ ] **AUTH-02**: User can sign in / link account via Google OAuth (production-ready, end-to-end)

### Push Notifications

- [ ] **PUSH-01**: User receives a push notification before golden hour starts (configurable lead time)
- [ ] **PUSH-02**: User receives a push notification when a new photo is posted in any of their rooms

## v2 Requirements

### Push Notifications

- **PUSH-03**: User receives a push notification when a new member joins their room
- **PUSH-04**: User receives a push notification when a room's photos are about to expire

### Moderation

- **MOD-01**: User can report a message (local block + flag for review)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time typing indicators | Adds complexity, not core to sunset ritual |
| Video sharing | Storage/bandwidth cost — defer post-launch |
| Web client | Native-only for v1; camera/notifications unavailable on web |
| Rate limiting / abuse prevention | Address post-launch based on real usage |
| Room expiry warning notifications | Defer to v2 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GLOB-01 | Phase ? | Pending |
| GLOB-02 | Phase ? | Pending |
| GLOB-03 | Phase ? | Pending |
| SKY-01 | Phase ? | Pending |
| SKY-02 | Phase ? | Pending |
| AUTH-01 | Phase ? | Pending |
| AUTH-02 | Phase ? | Pending |
| PUSH-01 | Phase ? | Pending |
| PUSH-02 | Phase ? | Pending |

**Coverage:**
- v1 requirements: 9 total
- Mapped to phases: 0
- Unmapped: 9 ⚠️ (roadmap pending)

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after initial definition*
