# GhostTone Plugin-First Roadmap

This repository is moving toward the plugin path, but the browser body is still an active development surface.

The main long-term asset is the headless musical engine in `src/core/ghosttone-core.js`.

## Current Core Contract

```js
generatePattern(settings, progression, seed)
```

The core is pure and beat-based:

- no DOM
- no Web Audio
- no canvas/grid rendering
- no MIDI file writing
- no BPM-to-seconds conversion

It returns:

```js
{
  seed,
  settings,
  progression,
  loopBeats,
  templateLoopBeats,
  templateSections,
  sections,
  events,
  generatorMode
}
```

Each event uses the plugin-facing schema:

```js
{
  id,
  sectionIndex,
  sectionLabel,
  voiceId,
  noteName,
  midi,
  startBeat,
  durationBeats,
  cents,
  driftAmount,
  driftEnd,
  role,
  degree,
  motionType,
  velocity
}
```

## Next Steps

1. Keep expanding tests around deterministic generation and musical behavior, especially infinite-mode structure and transport continuity.
2. Define the first plugin target clearly: MIDI generator first, instrument first, or a staged path from MIDI to instrument.
3. Expand the host-time adapter and runtime bridge to handle transport edges, loop wrap, and long-running infinite playback inside a host.
4. Define a minimal internal synth spec only if the first plugin body includes audio generation.
5. Decide whether the first prototype is a JUCE/C++ body or another wrapper that can host the current beat-based engine safely.

The important rule: same settings, same progression, same seed, same events.

See `docs/engine-spec.md` for the current engine contract.
