# Roadmap

This roadmap reflects the phased plan from the original technical design
document. The MVP (v0.1.0) validates the core "state injection" concept;
subsequent phases build on it without changing the underlying architecture.

## v0.1.0 — Core MVP (current)

- Core extension framework (enable/disable, settings persistence)
- Per-character persistence
- Time Awareness
- Activity Simulation (hardcoded schedule templates)
- Location Simulation
- Activity Duration
- Prompt Injection
- Live State Preview Panel

## Planned: Phase 2 — Schedule Editor & Custom Templates

- In-UI schedule editor (day/time/activity/location grid)
- Ability to create, edit, and save custom schedule templates per character
- Import/export of schedules

## Planned: Phase 3 — Sleep & Energy Systems

- Dedicated Sleep System: tracks `sleepHours` and `sleepQuality` (Good / Average / Poor)
- Energy System (0–100), decaying/recovering based on activity and sleep
- Sleep quality influences energy recovery rate

## Planned: Phase 4 — Social Battery & Financial State

- Social Battery (0–100), drained/recharged based on activity type
- Financial State (manual dropdown initially: Comfortable / Average / Tight Budget)

## Planned: Phase 5 — Persistent Life Events

- CRUD UI for life events (e.g. "Saving for a new PC", "Birthday next week")
- Automatic event progression via time-delta (e.g. "Birthday Next Week" → "Birthday Tomorrow" → "Birthday Today" → expired)
- Injection of active events as a compact list

## Planned: Phase 6 — Probability & Variance Framework

- `ProbabilityEngine` for schedule time variance (e.g. ±15 minutes)
- Architectural support for future random events (working late, calling in sick, unexpected encounters)
- No new user-facing events in this phase — framework only

## Future / Exploratory (not scheduled)

- Weather module (requires external API)
- Relationship state / sentiment tracking
- Outfit persistence
- Household simulation (roommates, pets)
- Automatic financial progression
- Rich probability-driven life events

## Out of Scope for Now

Per the original design review, the following remain deliberately
deferred until the core concept and token-budget assumptions are
validated by real usage:

- Weather
- Relationship State
- Outfit Persistence
- Household Simulation

Feedback from MVP usage will determine prioritization of the phases above.
