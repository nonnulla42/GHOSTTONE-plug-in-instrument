# GhostTone Offline Audio Renderer Spec

The offline audio renderer is the first pure audio render body.

It is not a plugin wrapper and does not use Web Audio. It renders directly into Float32 buffers from the offline render plan.

## API

```js
renderOfflineAudio(patch, {
  sampleRate,
  bpm,
  startBeat,
  endBeat,
  blockSize,
  channelCount
})
```

## Output

```js
{
  sampleRate,
  channelCount,
  durationSamples,
  left,
  right,
  plan
}
```

For mono renders, `left` and `right` reference the same buffer.

## Render Path

```txt
patch
-> offline render plan
-> scheduled events per block
-> voice manager
-> synth voice plan
-> block-by-block sample render with persistent phase
-> Float32 buffers
```

## MVP Voice Behavior

The current renderer supports:

- simple oscillator waveforms
- base pitch from MIDI note
- microtonal `cents`
- drift toward `driftEnd`
- amplitude attack/sustain/release
- simple stereo pan from voice id
- voice continuity across block boundaries
- deterministic sample generation

## Out Of Scope

- WAV export
- oversampling
- anti-aliasing
- reverb/delay/chorus
- final plugin DSP optimization
- host callbacks
- JUCE/VST wrapper code

The goal is not luxury. The goal is proving that a patch can produce deterministic audio outside the browser and outside a DAW.

## Invariants

- Same patch and render options produce the same buffers.
- Block size changes should not change the rendered buffer.
- Samples must be finite numbers.
- Offline render uses the same patch state and scheduling rules as live playback.
- Musical decisions still come from `ghosttone-core`.
- Timing still comes from the host-time/offline render planning path.
