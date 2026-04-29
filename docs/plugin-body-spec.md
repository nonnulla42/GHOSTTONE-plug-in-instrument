# GhostTone Plugin Body Spec

This document describes how the current engine maps to a future instrument plugin.

It is not a JUCE implementation plan yet. It is the body contract.

This is also intentionally a little broader than "audio instrument only". The current codebase is far enough along that a MIDI-generating plugin is a plausible first body too.

## Product Shape

GhostTone can realistically become either:

- a MIDI-generating plugin that feeds another instrument in the DAW
- an instrument plugin with its own internal synth

The current repository already contains a simple synth and render path, but the shortest route to a DAW body may still be a MIDI-first version.

```txt
instrument or MIDI track
-> GhostTone generates events
-> optional internal synth renders audio
-> DAW handles the rest of the chain
```

GhostTone should stay focused on:

- harmony/progression
- generative motion
- microtonal offsets and drift
- a simple internal synth voice when present
- host-synced timing
- deterministic patch state

## Processor Responsibilities

The processor owns the real-time path:

1. read host transport
2. read host tempo
3. know current sample rate and block size
4. convert host position to beat block
5. call the equivalent of `scheduleEventsForBlock`
6. trigger synth voices from scheduled sample offsets
7. maintain voice lifecycle across audio blocks

The processor must not depend on editor/UI state directly during audio processing. It should read an immutable or safely synchronized patch snapshot.

## Editor Responsibilities

The editor owns user interaction:

- chord/progression editing
- motion controls
- global/local scale controls
- memory and register controls
- micro engine controls
- voicing/arp controls
- sound controls
- seed/regenerate
- preset selection
- A/B compare
- visualization

The editor creates patch state changes. The processor consumes patch snapshots.

## Patch State

Serializable patch state lives conceptually in:

```txt
src/state/patch-state.js
```

The saved state includes:

- schema version
- active compare slot
- compare slots
- seed
- BPM fallback for standalone/free-run modes
- mode
- sound choice
- progression/chords
- split/slot state
- generator mode
- infinite harmonic controls
- micro engine controls
- voicing controls
- arp controls
- simple synth controls

Same serialized state must restore the same musical events.

## Host Sync

In plugin mode, host tempo is authoritative.

The plugin should use:

- host BPM
- play/stop state
- timeline position
- loop range when available
- block sample position

Manual BPM is only for:

- standalone preview
- debug
- free-run mode

The core remains beat-based. Host timing belongs to the timing adapter/processor layer.

## Live Render Path

Instrument-body playback path:

```txt
patch state
-> ghosttone-core
-> beat events
-> host-time adapter
-> sample offsets for current block
-> voice manager
-> synth voice DSP
-> audio output
```

MIDI-body playback path:

```txt
patch state
-> ghosttone-core
-> beat events
-> host-time adapter
-> note on/off emission in host time
```

## Offline Render Path

Offline render should reuse the same path with a deterministic transport simulation:

```txt
patch state
-> ghosttone-core
-> iterate blocks over requested beat range
-> host-time adapter
-> voice manager
-> synth voice DSP
-> audio buffer
```

No separate musical engine should exist for offline export.

## Invariants

- Same patch state + same host timeline context = same scheduled events.
- Same settings + same progression + same seed = same core events.
- Core events use beats, not seconds or samples.
- Host-time adapter owns beat-to-sample conversion.
- Voice manager owns voice lifecycle.
- Synth voice owns sound behavior for one voice.
- Editor/UI is replaceable.

## Out Of Scope For First Plugin Body

- internal creative effects
- complex preset browser
- MPE
- multi-output routing
- advanced modulation matrix
- full DAW-like automation system
- heavy UI redesign

The first plugin body should prove the instrument path, not become a miniature DAW.
