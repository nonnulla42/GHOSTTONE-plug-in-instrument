# GhostTone

GhostTone is a generative harmonic instrument in active development.

Right now it exists as:

- a browser app for editing, listening, and exporting
- a deterministic musical core
- a set of timing/audio/render adapters
- an early foundation for a future DAW plugin

This README is a checkpoint, not a final spec. It reflects the project as it works now.

## What It Is

GhostTone is built around a simple idea:

- start from a chord progression or a seed harmonic state
- generate voiced harmonic events in beats
- keep the result deterministic
- let harmony, voicing, memory, register, and microtonal drift interact in musical ways

It is not a static chord-player anymore. It is closer to a small musical system with a few competing forces:

- global harmonic constraint
- local harmonic direction
- minimum voice movement
- voicing continuity
- voicing openness
- memory/recall
- register gravity
- microtonal color and drift

## Current Modes

There are three meaningful generator modes in the codebase:

### `classic`

Uses the written progression directly.

- chords are parsed from the progression
- voicing is applied section by section
- events are emitted in a simpler way
- useful as a direct, predictable baseline

### `roleBased`

Still uses the written progression directly, but each note behaves according to harmonic role.

- notes are treated as `anchor`, `color`, or `tension`
- role affects motion type, drift, offset, duration, and event behavior
- feels more hierarchical and "musical" than `classic`

### `infinite`

This is the most ambitious mode.

- starts from a seed progression skeleton
- evolves the harmonic state forward
- keeps a memory window
- chooses the next chord from candidate vocabulary
- balances local-scale direction against minimum displacement
- applies register gravity and voicing rules afterward

This is the part of the project where most of the current complexity lives.

## Harmonic Model In Infinite

The current infinite system roughly works like this:

1. a candidate pool of valid four-note chords is generated
2. the global scale acts first, shaping or filtering that pool
3. the local scale and target degree influence similarity scoring
4. `harmonicMotion` decides the balance between:
   - local harmonic direction
   - minimum movement / voice continuity
5. voicing and register rules decide how the chosen chord is actually realized
6. memory can recall or mutate earlier material to create local structure

Important current design intent:

- `global scale` is the outer harmonic fence
- `local scale` is a directional force inside that fence
- low `harmonicMotion` favors local-scale behavior more
- high `harmonicMotion` favors minimum displacement more

## Voicing Parameters

Two voicing controls matter a lot now:

### `voicingContinuity`

Controls how strongly voices try to stay near their previous position.

- low: more reconfiguration between chords
- high: more stable line-by-line continuity

### `voicingVariation`

Controls how much vertical freedom the voicing gets.

- low: tighter, more centered, more compact
- high: wider, more open, more permissive vertically

These now affect voicing behavior more clearly without changing the harmonic candidate logic itself.

## Register And Gravity

`registerCenter` is not a cosmetic parameter.

It acts as a real center of gravity:

- discourages long-term drift upward or downward
- constrains voice lanes softly
- still allows motion, but tries to keep the harmonic body in a usable range

This was originally introduced to control drift in the old evolve path, and it remains important in infinite mode.

## Browser App Status

The browser app is still an active working body, not just a demo shell.

It currently supports:

- patch editing
- compare slots
- preset loading
- deterministic playback
- infinite playback extension
- MIDI export
- WAV export
- live parameter updates during playback

Recent work improved live editing behavior:

- sound-only changes update faster
- generative changes are throttled during playback
- final control values flush immediately on release

So it is more usable live than before, though it is still not "finished".

## Plugin Status

The project is moving toward a plugin, but it is not a DAW plugin yet.

What already exists:

- deterministic core event generation
- host-like timing adapter
- Web Audio scheduling body
- voice lifecycle management
- offline render path
- patch-state serialization

What is still missing for a real MIDI/audio plugin:

- plugin wrapper and processor/editor split
- host automation and transport integration
- parameter synchronization for real-time plugin use
- DAW validation

So the core is credible; the plugin body still needs to be built.

## Project Structure

Main areas:

- [src/core/ghosttone-core.js](src/core/ghosttone-core.js)
  deterministic generation entrypoint
- [src/core/harmonic-chord-evolution.js](src/core/harmonic-chord-evolution.js)
  candidate generation, scoring, voice-leading, register logic
- [src/core/harmonic-infinite.js](src/core/harmonic-infinite.js)
  evolving harmonic state and memory logic
- [src/core/infinite-stream-runtime.js](src/core/infinite-stream-runtime.js)
  infinite extension runtime
- [src/state/patch-state.js](src/state/patch-state.js)
  patch serialization and normalization
- [src/web](src/web)
  browser app adapters, presets, UI helpers, audio wrapper
- [src/render](src/render)
  offline audio and WAV export path
- [tests](tests)
  deterministic and behavioral coverage

## Core Contract

The core entrypoint is:

```js
generatePattern(settings, progression, seed)
```

It returns a deterministic beat-based pattern object:

```js
{
  seed,
  settings,
  progression,
  loopBeats,
  templateLoopBeats,
  templateSections,
  sections,
  events
}
```

The important rule is still:

same settings + same progression + same seed = same result

## Presets

The preset set has been refreshed as a practical listening map, not just a cosmetic list.

Current presets include:

- Dreamy Pad
- Warm Bed
- Nocturne Current
- Broken Arp
- Local Weave
- Open Canopy
- Tight Orbit
- Wide Orbit

They are meant to expose different relationships between:

- harmonic motion
- local/global scale behavior
- voicing continuity
- voicing variation
- memory
- pad vs arp use

## Running

Install nothing special, then run the test suite:

```txt
npm test
```

Open the browser app through the local HTML/JS body used in this repo.

## Docs

Longer reference docs live in `docs/`:

- `docs/engine-spec.md`
- `docs/parameter-map.md`
- `docs/plugin-first-roadmap.md`
- `docs/plugin-body-spec.md`
- `docs/offline-render-spec.md`
- `docs/offline-audio-renderer-spec.md`
- `docs/wav-export-spec.md`

Some of those docs are older than the current checkpoint and will need refreshes too.

## Current Truth

GhostTone is at an interesting stage:

- not a toy anymore
- not a finished instrument yet
- already musically opinionated
- still internally evolving

If you open this repo later and feel slightly attacked by the number of interacting parameters, that is normal. The system is becoming more coherent, but it is still very much alive.
