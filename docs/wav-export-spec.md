# GhostTone WAV Export Spec

WAV export is a packaging layer on top of offline audio rendering.

The renderer produces Float32 audio buffers. The WAV encoder converts those buffers into a standard file format without changing the musical or timing behavior.

## API

Preferred two-step flow:

```js
const audio = renderOfflineAudio(patch, renderOptions);
const wavBytes = encodeWav(audio);
```

Convenience wrapper:

```js
const { audio, wavBytes } = renderOfflineWav(patch, renderOptions);
```

## Current Format

- RIFF/WAVE
- PCM
- 16-bit integer samples
- mono or stereo
- little-endian

## Responsibilities

`encodeWav(audio)`:

- validates audio metadata and channel buffers
- interleaves channels
- sanitizes invalid samples
- clamps to `[-1, 1]`
- writes a valid WAV header

`renderOfflineWav(...)`:

- renders audio with the offline renderer
- passes the result to the WAV encoder
- returns both the raw audio object and encoded bytes

## Invariants

- Same audio input produces the same WAV bytes.
- Invalid samples are sanitized instead of leaking `NaN` or `Inf` into the file.
- Mono and stereo output preserve channel count in the header.
- WAV export does not change scheduling or synthesis rules.

## Out Of Scope

- metadata chunks
- 24-bit / 32-bit export
- compressed formats
- streaming file writes
- DAW/plugin file dialogs

