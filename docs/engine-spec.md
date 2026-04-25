# GhostTone Engine Spec

This document describes the headless GhostTone engine contract.

## API

```js
generatePattern(settings, progression, seed)
```

The engine is a pure musical generator. It does not read UI controls, schedule audio, export MIDI, or know the host BPM.

## Input

### `settings`

Core musical controls:

- `mode`: `pad`, `arp`, or `evolve`
- `ghostAmount`: microtonal intensity, normalized `0..1`
- `drift`: pitch movement amount, normalized `0..1`
- `harmonyLock`: how strongly offsets stay close to harmonic context, normalized `0..1`
- `colorMode`: `warm`, `dreamy`, `dark`, or `alien`
- `stayMusical`: constrains more unstable offset choices
- `ghostEnabled`: bypasses micro offsets when false
- `voicingStyle`: chord layout strategy
- `voicingVariation`: amount of voicing reshuffle, normalized `0..1`
- `voicingContinuity`: strength of voice-leading continuity, normalized `0..1`
- `arpDirection`: arp ordering strategy
- `arpFeel`: rhythmic feel strategy
- `arpDensity`: event count density, normalized `0..1`
- `arpVariation`: arp reshuffle amount, normalized `0..1`
- `arpContinuity`: strength of arp contour continuity, normalized `0..1`

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

### `seed`

Positive integer seed. Same settings, same progression, and same seed must produce the same result.

## Output

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

## Field Semantics

- `voiceId`: logical voice lane used for voice-leading, visual connection, and future synth allocation.
- `midi`: equal-tempered MIDI note before microtonal offset.
- `cents`: starting pitch offset in cents relative to `midi`.
- `driftEnd`: ending pitch offset in cents.
- `driftAmount`: absolute distance between `cents` and `driftEnd`.
- `role`: harmonic role, currently `stable`, `color`, `tension`, or `passing`.
- `motionType`: the generation mode that produced the event.
- `startBeat` and `durationBeats`: musical time in beats, not seconds or samples.

## Invariants

- The engine is deterministic.
- Musical time is always beat-based.
- The engine does not know DOM, canvas, Web Audio, MIDI files, or plugin host APIs.
- Adapters are responsible for converting beats to seconds, samples, pixels, MIDI ticks, or host timeline positions.
- The event schema is the contract between the engine and every future body: browser, tests, or plugin.

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

This mirrors the future plugin responsibility: read host transport/tempo, keep the core in beats, and schedule synth voices in sample time.

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

The browser engine is still only a development body, but its timing path now mirrors the future plugin path:

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

This keeps `web-audio-engine.js` focused on scheduling and coordination. The browser implementation is still temporary, but the voice contract is now explicit enough to port to native DSP later.
