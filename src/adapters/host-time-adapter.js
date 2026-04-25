export function beatsToSamples(beats, bpm, sampleRate) {
  validateTempoContext(bpm, sampleRate);
  return beats * secondsPerBeat(bpm) * sampleRate;
}

export function samplesToBeats(samples, bpm, sampleRate) {
  validateTempoContext(bpm, sampleRate);
  return samples / sampleRate / secondsPerBeat(bpm);
}

export function secondsPerBeat(bpm) {
  const tempo = Number(bpm);
  if (!Number.isFinite(tempo) || tempo <= 0) {
    throw new RangeError("bpm must be a positive finite number");
  }
  return 60 / tempo;
}

export function scheduleEventsForBlock(events, context) {
  const normalized = normalizeContext(context);
  const segments = getBlockSegments(normalized);

  return segments
    .flatMap((segment) => {
      return events
        .filter((event) => event.startBeat >= segment.startBeat && event.startBeat < segment.endBeat)
        .map((event) => {
          const offsetBeats = segment.offsetBeat + event.startBeat - segment.startBeat;
          const durationSamples = Math.max(1, Math.round(beatsToSamples(event.durationBeats, normalized.bpm, normalized.sampleRate)));

          return {
            ...event,
            sampleOffset: Math.round(beatsToSamples(offsetBeats, normalized.bpm, normalized.sampleRate)),
            durationSamples,
            blockStartBeat: normalized.blockStartBeat,
          };
        });
    })
    .sort((a, b) => a.sampleOffset - b.sampleOffset);
}

export function getLoopingBlockWindow(context) {
  const normalized = normalizeContext(context);
  const blockDurationBeats = samplesToBeats(normalized.blockSize, normalized.bpm, normalized.sampleRate);
  return {
    startBeat: normalized.blockStartBeat,
    endBeat: normalized.blockStartBeat + blockDurationBeats,
    durationBeats: blockDurationBeats,
    isLooping: normalized.isLooping,
    segments: getBlockSegments(normalized),
  };
}

function normalizeContext(context = {}) {
  const bpm = Number(context.bpm);
  const sampleRate = Number(context.sampleRate);
  const blockSize = Number(context.blockSize);
  const blockStartBeat = Number(context.blockStartBeat || 0);
  const isLooping = Boolean(context.isLooping);
  const loopStartBeat = Number(context.loopStartBeat || 0);
  const loopEndBeat = Number(context.loopEndBeat);

  validateTempoContext(bpm, sampleRate);
  if (!Number.isFinite(blockSize) || blockSize <= 0) {
    throw new RangeError("blockSize must be a positive finite number");
  }
  if (!Number.isFinite(blockStartBeat) || blockStartBeat < 0) {
    throw new RangeError("blockStartBeat must be a non-negative finite number");
  }
  if (isLooping) {
    if (!Number.isFinite(loopStartBeat) || loopStartBeat < 0) {
      throw new RangeError("loopStartBeat must be a non-negative finite number");
    }
    if (!Number.isFinite(loopEndBeat) || loopEndBeat <= loopStartBeat) {
      throw new RangeError("loopEndBeat must be greater than loopStartBeat");
    }
  }

  return {
    bpm,
    sampleRate,
    blockSize: Math.trunc(blockSize),
    blockStartBeat,
    isLooping,
    loopStartBeat,
    loopEndBeat,
  };
}

function getBlockSegments(context) {
  const durationBeats = samplesToBeats(context.blockSize, context.bpm, context.sampleRate);

  if (!context.isLooping) {
    return [
      {
        startBeat: context.blockStartBeat,
        endBeat: context.blockStartBeat + durationBeats,
        offsetBeat: 0,
      },
    ];
  }

  const segments = [];
  const epsilon = 1e-9;
  let remaining = durationBeats;
  let offsetBeat = 0;
  let cursorBeat = wrapBeat(context.blockStartBeat, context.loopStartBeat, context.loopEndBeat);

  while (remaining > epsilon) {
    const endBeat = Math.min(context.loopEndBeat, cursorBeat + remaining);
    const segmentDuration = endBeat - cursorBeat;

    if (segmentDuration <= epsilon) break;

    segments.push({
      startBeat: cursorBeat,
      endBeat,
      offsetBeat,
    });

    remaining -= segmentDuration;
    offsetBeat += segmentDuration;
    cursorBeat = endBeat >= context.loopEndBeat - epsilon ? context.loopStartBeat : endBeat;
  }

  return segments;
}

function wrapBeat(beat, loopStartBeat, loopEndBeat) {
  const loopLength = loopEndBeat - loopStartBeat;
  return ((((beat - loopStartBeat) % loopLength) + loopLength) % loopLength) + loopStartBeat;
}

function validateTempoContext(bpm, sampleRate) {
  if (!Number.isFinite(Number(bpm)) || Number(bpm) <= 0) {
    throw new RangeError("bpm must be a positive finite number");
  }
  if (!Number.isFinite(Number(sampleRate)) || Number(sampleRate) <= 0) {
    throw new RangeError("sampleRate must be a positive finite number");
  }
}
