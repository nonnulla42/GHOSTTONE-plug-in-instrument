# GhostTone Plugin-First Roadmap

This repository is now focused on the plugin path.

The browser prototype can remain useful as reference material, but the main asset is the headless musical engine in `src/core/ghosttone-core.js`.

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
  sections,
  events
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

1. Keep expanding tests around deterministic generation and musical behavior.
2. Define a minimal internal synth spec for the plugin: oscillator, envelope, filter, gain, moderate width.
3. Expand the host-time adapter to handle loop wrap and host transport edge cases.
4. Decide whether the first plugin prototype is a JUCE/C++ port or an intermediate host wrapper.

The important rule: same settings, same progression, same seed, same events.

See `docs/engine-spec.md` for the current engine contract.
