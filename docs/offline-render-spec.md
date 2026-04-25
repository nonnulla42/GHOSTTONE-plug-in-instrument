# GhostTone Offline Render Spec

The offline render path defines how GhostTone renders a patch over a fixed beat range.

This spec does not define audio buffer generation yet. It defines the deterministic scheduling plan that a future renderer will consume.

## Input

```js
createOfflineRenderPlan(patch, {
  sampleRate,
  bpm,
  startBeat,
  endBeat,
  blockSize
})
```

Inputs:

- `patch`: normalized or normalizable GhostTone patch
- `sampleRate`: render sample rate
- `bpm`: tempo used for the offline render
- `startBeat`: first beat included in the render
- `endBeat`: first beat excluded from the render
- `blockSize`: render block size in samples

## Steps

1. Normalize the patch.
2. Convert patch state into core settings, progression, and seed.
3. Generate beat-based core events.
4. Convert the requested beat range into total samples.
5. Iterate the render range in fixed-size sample blocks.
6. Convert each block into a host-time context.
7. Use `scheduleEventsForBlock` for each block.
8. Return a deterministic render plan.

## Output

```js
{
  startBeat,
  endBeat,
  blockSize,
  sampleRate,
  bpm,
  totalBlocks,
  durationBeats,
  durationSamples,
  pattern,
  blocks
}
```

Each block:

```js
{
  blockIndex,
  blockStartBeat,
  blockEndBeat,
  sampleStart,
  blockSize,
  scheduledEvents
}
```

Each scheduled event includes the original event plus:

```js
{
  eventId,
  blockIndex,
  sampleOffset,
  durationSamples
}
```

## Boundary Rule

Offline render ranges use half-open beat windows:

```txt
[startBeat, endBeat)
```

This means:

- an event exactly at `startBeat` is included
- an event exactly at `endBeat` is excluded
- adjacent renders can be stitched without duplicate event starts

## Invariants

- The plan is deterministic.
- The plan is pure data.
- The core remains beat-based.
- The offline render planner does not know Web Audio, DAW APIs, or native plugin APIs.
- The same live scheduling rules are reused through the host-time adapter.

## Future Audio Renderer

A future renderer can consume this plan:

```txt
offline render plan
-> voice manager
-> synth voice DSP
-> output audio buffer
```

The musical and timing behavior should not fork between live playback and offline render.

