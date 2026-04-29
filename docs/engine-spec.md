# GhostTone Engine Spec

This document describes the current headless GhostTone engine contract.

It is a checkpoint spec. It should match the code as it behaves now, not an older product idea.

## API

```js
generatePattern(settings, progression, seed)
```

The engine is a pure musical generator. It does not read UI controls, schedule audio, export MIDI, or know the host BPM.

## Input

### `settings`

Core musical controls:

- `generatorMode`: `classic`, `roleBased`, `infinite`, or `infinitePhrase`
- `mode`: `pad` or `arp`
- `ghostAmount`: microtonal intensity, normalized `0..1`
- `drift`: pitch movement amount, normalized `0..1`
- `harmonyLock`: how strongly offsets stay close to harmonic context, normalized `0..1`
- `colorMode`: `warm`, `dreamy`, `dark`, or `alien`
- `stayMusical`: constrains more unstable offset choices
- `ghostEnabled`: bypasses micro offsets when false
- `voicingStyle`: chord layout strategy
- `voicingVariation`: vertical voicing freedom, normalized `0..1`
- `voicingContinuity`: strength of voice-leading continuity, normalized `0..1`
- `arpDirection`: arp ordering strategy
- `arpFeel`: rhythmic feel strategy
- `arpDensity`: event count density, normalized `0..1`
- `arpContinuity`: strength of arp contour continuity, normalized `0..1`

Additional harmonic controls used mainly by `infinite` and `infinitePhrase`:

- `harmonicMotion`: balance between local harmonic direction and minimum displacement, normalized `0..1`
- `harmonicDistanceTarget`: preferred root distance target in semitones or equivalent class distance
- `harmonicDistanceFalloff`: tolerance around that target
- `localScaleType`: `chromatic`, `major`, `minor`, `dorian`, `mixolydian`, `phrygian`, or `harmonicMinor`
- `localTargetDegree`: local scale degree emphasis
- `localDegreeFalloff`: on/off neighborhood around the target degree
- `globalRoot`: pitch-class root for the outer scale fence, or `none`
- `scaleName`: `none`, `major`, `minor`, `dorian`, `mixolydian`, `phrygian`, or `harmonicMinor`
- `scaleInfluence`: how strongly the global scale shapes candidate harmony, normalized `0..1`
- `memoryStrength`: how strongly infinite mode recalls and reuses recent harmonic material, normalized `0..1`
- `registerCenter`: MIDI note used as harmonic center of gravity

Legacy note:

- older code paths may still accept `mode: "evolve"` internally for compatibility, but the active patch schema and UI normalize user-facing mode to `pad` or `arp`

### `progression`

Array of bars:

```js
[
  {
    split: false,
    slots: [
      { chord: "Am9", voicingSeed: 0, arpSeed: 0 }
    ]
  }
]
```

When `split` is true, the first two slots divide the bar equally.

In `classic` and `roleBased`, this progression is the direct harmonic source.

In `infinite` and `infinitePhrase`, it acts more like a seed skeleton and launch point for later harmonic state generation.

### `seed`

Positive integer seed. Same settings, same progression, and same seed must produce the same result.

## Output

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

`templateLoopBeats` and `templateSections` are especially relevant when `generatorMode` is an infinite-mode variant, where the initial template can later be extended by the streaming runtime.

### Sections

A section is one chord slot placed on the beat grid:

```js
{
  label,
  rootPc,
  notes,
  baseNotes,
  barIndex,
  slotIndex,
  startBeat,
  durationBeats,
  slotState
}
```

In infinite-mode generators, later sections may be generated rather than copied directly from the written progression.

### Events

Each event is a note-like instruction for an adapter:

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

## Generator Modes

### `classic`

Uses the written progression directly.

- parses chord slots from the progression
- voices them section by section
- emits note events with simpler behavior

### `roleBased`

Still uses the written progression directly, but each note behaves according to harmonic role.

- notes are treated mainly as `anchor`, `color`, or `tension`
- role affects motion type, drift, offset, duration, and velocity behavior

### `infinite`

Starts from a progression skeleton, then extends harmonic state forward.

The current design intent is:

1. generate a candidate pool of valid four-note chords
2. let the global scale shape or filter that pool first
3. let the local scale and target degree influence similarity scoring
4. let `harmonicMotion` decide the balance between local direction and minimum displacement
5. realize the winning harmony through voicing, register, and memory logic

Important current rule of thumb:

- global scale is the outer harmonic fence
- local scale is directional force inside that fence
- low `harmonicMotion` favors local-scale behavior more
- high `harmonicMotion` favors minimum displacement more

### `infinitePhrase`

Uses the same infinite harmonic sections as `infinite`, but emits phrase events instead of pad or arp-style chord realization.

- harmony still comes from the infinite chord engine
- phrase notes are chosen from current chord tones plus active global and local scale degrees
- note mobility is uniform across the phrase
- `registerCenter` remains the soft long-term gravity for the line

## Field Semantics

- `voiceId`: logical voice lane used for voice-leading, visual connection, and future synth allocation.
- `midi`: equal-tempered MIDI note before microtonal offset.
- `cents`: starting pitch offset in cents relative to `midi`.
- `driftEnd`: ending pitch offset in cents.
- `driftAmount`: absolute distance between `cents` and `driftEnd`.
- `role`: event-facing harmonic role. Common values are `anchor`, `color`, `tension`, and sometimes `passing`.
- `degree`: symbolic harmonic degree when available, such as `1`, `b3`, `5`, or `9`.
- `motionType`: the generation mode that produced the event behavior.
- `startBeat` and `durationBeats`: musical time in beats, not seconds or samples.

Internal note labeling in infinite helpers may also use extra working roles such as `support`. Those are implementation details unless they reach emitted events.

## Invariants

- The engine is deterministic.
- Musical time is always beat-based.
- The engine does not know DOM, canvas, Web Audio, MIDI files, or plugin host APIs.
- Adapters are responsible for converting beats to seconds, samples, pixels, MIDI ticks, or host timeline positions.
- The event schema is the contract between the engine and every future body: browser, tests, export, or plugin.

## Register And Voicing

`registerCenter` is a real musical control, not just a display hint.

It acts as a center of gravity:

- discourages long-term drift upward or downward
- keeps voice lanes in a usable range
- still allows movement instead of hard-clamping every note

Two voicing parameters matter most in the current engine:

- `voicingContinuity`: how strongly a voice prefers to remain near its previous position
- `voicingVariation`: how much vertical freedom the realized voicing gets

These shape the realized voicing more than the harmonic candidate pool itself.

## Host-Time Adapter

`src/adapters/host-time-adapter.js` is the first plugin-facing timing adapter.

It converts beat-based core events into block-local sample positions:

```js
scheduleEventsForBlock(events, {
  bpm,
  sampleRate,
  blockSize,
  blockStartBeat,
  isLooping,
  loopStartBeat,
  loopEndBeat
})
```

It returns events with:

- `sampleOffset`: start position inside the current audio block
- `durationSamples`: event duration in samples
- `blockStartBeat`: source host beat for the block

This mirrors the future plugin responsibility: read host transport and tempo, keep the core in beats, and schedule voices in sample time.

Scheduling uses half-open beat windows: `[startBeat, endBeat)`.

That means:

- an event exactly at the block start is included
- an event exactly at the block end is excluded
- when a block crosses `loopEndBeat`, the adapter also schedules events from `loopStartBeat`
- the core still does not know whether the host is looping

## Browser Audio Engine

`src/web/web-audio-engine.js` uses the host-time adapter even in the browser.

It simulates a plugin-style scheduler:

1. read browser `AudioContext.currentTime`
2. convert it to a host-like beat block
3. call `scheduleEventsForBlock`
4. schedule only the events in the next short lookahead window
5. create Web Audio voices for those scheduled events

The browser engine is still a development body, but its timing path mirrors the future plugin path:

```txt
core events in beats
-> host-time block scheduling
-> sample offsets
-> synth voices
```

## Voice Lifecycle

`src/audio/voice-manager.js` is the first pure voice lifecycle module.

It does not create audio nodes. It tracks synth voice state:

- `scheduled`: the voice has been assigned but its start time is still in the future
- `active`: the voice is sounding
- `releasing`: the voice has reached release time and is fading out

The manager is responsible for:

- creating voice records from scheduled events
- advancing voice state over time
- removing finished voices
- early release
- basic voice stealing when `maxVoices` is reached

The Web Audio engine uses this manager while still producing sound with browser oscillators. A future plugin synth can reuse the same lifecycle rules with native DSP voices.

## Synth Voice

`src/audio/synth-voice.js` owns the sound plan for a single voice.

It is split into:

- pure planning helpers for pitch, drift, envelope, filter, and pan
- Web Audio node creation for the current browser body

A synth voice applies:

- base pitch from `midi`
- microtonal start offset from `cents`
- drift target from `driftEnd`
- amplitude attack and release
- moderate pan from `voiceId`
- simple waveform and lowpass filter settings

This keeps `web-audio-engine.js` focused on scheduling and coordination. The browser implementation is still temporary, but the voice contract is explicit enough to port to native DSP later.

## Web Wrapper

The browser app is a development wrapper around the engine pipeline.

Its responsibilities are limited to:

- reading UI controls into settings, progression, and seed
- applying presets and compare patches
- calling `ghosttone-core`
- passing events to visual, MIDI, and audio adapters

Preset and compare behavior lives outside `app.js`:

- `src/web/presets.js`: practical listening presets for the current engine
- `src/web/patch-adapter.js`: capture/apply browser patches
- `src/web/compare-manager.js`: deterministic A/B slot state

Current presets include:

- Dreamy Pad
- Warm Bed
- Nocturne Current
- Broken Arp
- Local Weave
- Open Canopy
- Tight Orbit
- Wide Orbit

These presets are meant as listening anchors and regression fixtures, not a finished content library.

## Serializable State

`src/state/patch-state.js` defines the patch-state shape and is the source of truth for the browser wrapper.

It owns:

- schema version
- default patch
- compare slots
- active compare slot
- preset-to-patch conversion
- serialize and deserialize
- state normalization

This state is the bridge from the browser body to a future plugin body. A DAW project should eventually save this patch state, then restore it and regenerate the same musical events.

The browser app follows this state path:

```txt
UI edit
-> capture active patch
-> patch-state active compare slot
-> patchToCoreSettings / patchToProgression / patchToSoundSettings
-> core / visual / MIDI / audio adapters
```

Patch JSON export/import serializes the full patch state, including compare slots.

See `docs/plugin-body-spec.md` for the future processor/editor split.

## Offline Render Plan

`src/render/offline-render-plan.js` defines the deterministic offline scheduling path.

It takes a patch and render context, then returns pure data:

- render metadata
- generated core pattern
- fixed sample blocks
- scheduled events per block

It does not render audio yet. It answers which events would be rendered in which blocks at which sample offsets.

See `docs/offline-render-spec.md`.

## Offline Audio Renderer

`src/render/offline-audio-renderer.js` is the first pure audio renderer.

It consumes the offline render plan and writes deterministic Float32 audio buffers. It does not use Web Audio, DAW APIs, or plugin wrappers.

Current scope:

- oscillator sample generation
- envelope
- cents and drift
- simple stereo pan
- block-by-block voice continuity
- finite deterministic output buffers

See `docs/offline-audio-renderer-spec.md`.

## WAV Export

`src/render/wav-export.js` is the file-format layer above offline audio rendering.

It keeps rendering and export separate:

- `renderOfflineAudio(...)` creates deterministic Float32 buffers
- `encodeWav(audio)` converts those buffers into PCM WAV bytes
- `renderOfflineWav(...)` is a convenience wrapper for both steps

See `docs/wav-export-spec.md`.
