# BWRX-300 Educational HIL Simulator

- [x] Establish industrial cockpit design system
- [x] Build deterministic causal simulation model
- [x] Build operator dashboard and animated process schematic
- [x] Add alarms, SCRAM, faults, scenarios, training, and demo controls
- [x] Add sensors, HIL diagnostics, event log, trends, and CSV export
- [ ] Two-mode upgrade (uploaded brief)
  - [ ] Mode selection landing screen
  - [ ] Shared simulation store above all routes (state survives mode switching)
  - [x] Recalibrate engine to a true steady state; add cooling demand, feedwater setpoint, sensor noise, NaN guard
  - [ ] Kids Mode: illustrated plant, clickable parts, bounded controls, status, activities, quiz, achievements
  - [ ] Engineering Mode: all existing sections + systems detail, HIL (Web Serial), configuration, real validation
  - [x] Unit tests for engine rules
- [ ] Add persistent authenticated session storage (requires a user account flow)
- [ ] Python FastAPI/WebSocket backend (not part of this web build)
