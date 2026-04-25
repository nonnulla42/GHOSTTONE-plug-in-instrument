# GhostTone

GhostTone is a small chord-aware microtonal companion prototype.

Open `index.html` in a browser, press `Play`, then move:

- `Ghost Amount` for microtonal intensity.
- `Drift` for slow pitch movement.
- `Harmony Lock` for safer chord-following behavior.
- `Ghost preview` to A/B normal tuning against the microtonal version.
- `BPM` to set the loop tempo.
- `Split` on a bar to add a second chord in the same bar.
- `Voice` on a chord slot to randomize voicing inside the current voicing constraints.
- `Arp` on a chord slot to randomize arpeggio order inside the current arp constraints.
- `Voicing Style`, `Variation`, and `Continuity` control chord layout and voice-leading.
- `Arp Direction`, `Feel`, `Density`, `Variation`, and `Continuity` control arpeggio contour and rhythm.

The main display is now a MIDI-style grid:

- horizontal position is time over four bars.
- vertical position is pitch.
- note blocks show note name and cents offset.
- connection lines show voice-leading between generated events.
- heavier/dashed connection lines and brighter note borders indicate more drift.

The MIDI export writes a standard `.mid` file with pitch bend messages spread across channels, so microtonal notes can survive the trip into a DAW. Set the receiving instrument pitch bend range to `+/-2 semitones` for the closest result.
