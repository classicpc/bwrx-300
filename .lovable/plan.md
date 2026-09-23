# Academic Lab Simulator Restyle

## Goal
Make the existing simulator feel like a university engineering instrument console rather than a generic software dashboard, while preserving every working simulation control and calculated value.

## Visual direction
- Use the selected **Academic Technical Interface** composition: rigid framed console, dense technical hierarchy, large process workspace, compact controls, and a terminal-style event area.
- Replace the current uniform blue-black card treatment with matte charcoal instrument faces, layered steel-gray panels, cyan live readings, amber cautions, green status lamps, and a clearly isolated red SCRAM control.
- Use square instrument bays, stronger divider rails, calibration ticks, channel identifiers, indicator lamps, and engraved-style labels; remove glossy, floating, or decorative dashboard cues.
- Keep compact technical typography with monospaced measurements and restrained sans-serif supporting text.

## Main simulator screen
- Recompose the overview into a dominant process mimic and trend recorder with a dedicated control rack and diagnostics column.
- Make the current reactor-to-grid schematic read like a laboratory mimic panel using equipment tags, pipe-state legends, directional flow, and integrated live values.
- Turn measurement cards into fixed instrument modules with unit labels, safe-range marks, and clear alarm states.
- Restyle control rods, pumps, valve, turbine, scenarios, timing, and demo controls as grouped bench controls while keeping their current behavior unchanged.
- Present alarms and recent events as a proper annunciator/terminal section, with a guarded, unmistakable SCRAM control.

## Remaining sections
Apply the same lab-console language to Alarms, Sensors, Faults, Training, Model, Validation, and Events so navigation does not fall back to the current generic card style.

## Safety and accuracy
- Retain the persistent “Educational simulation — not for operational use” notice.
- Keep the existing simplified BWR-inspired terminology and simulated units; do not introduce the prototype’s TRIGA label, radiation-zone language, invented operational procedures, or fake measurements.
- Preserve beginner and engineering modes, accessibility, responsive behavior, reduced-motion support, and all existing simulator logic.

## Verification
- Check the complete desktop layout at the selected 1440×900 reference size and a narrow mobile viewport.
- Exercise rod, pump, valve, speed, pause/reset, scenario, alarm acknowledgment, fault, demo, navigation, and CSV controls.
- Confirm no clipped labels, overlapping controls, broken charts, console errors, or inaccessible focus states.
