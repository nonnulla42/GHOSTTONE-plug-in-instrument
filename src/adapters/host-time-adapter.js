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
  const blockStartBeat = normalized.blockStartBeat;
  const blockEndBeat = blockStartBeat + samplesToBeats(normalized.blockSize, normalized.bpm, normalized.sampleRate);

  return events
    .filter((event) => event.startBeat >= blockStartBeat && event.startBeat < blockEndBeat)
    .map((event) => {
      const offsetBeats = event.startBeat - blockStartBeat;
      const durationSamples = Math.max(1, Math.round(beatsToSamples(event.durationBeats, normalized.bpm, normalized.sampleRate)));

      return {
        ...event,
        sampleOffset: Math.round(beatsToSamples(offsetBeats, normalized.bpm, normalized.sampleRate)),
        durationSamples,
        blockStartBeat,
      };
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
  };
}

function normalizeContext(context = {}) {
  const bpm = Number(context.bpm);
  const sampleRate = Number(context.sampleRate);
  const blockSize = Number(context.blockSize);
  const blockStartBeat = Number(context.blockStartBeat || 0);

  validateTempoContext(bpm, sampleRate);
  if (!Number.isFinite(blockSize) || blockSize <= 0) {
    throw new RangeError("blockSize must be a positive finite number");
  }
  if (!Number.isFinite(blockStartBeat) || blockStartBeat < 0) {
    throw new RangeError("blockStartBeat must be a non-negative finite number");
  }

  return {
    bpm,
    sampleRate,
    blockSize: Math.trunc(blockSize),
    blockStartBeat,
  };
}

function validateTempoContext(bpm, sampleRate) {
  if (!Number.isFinite(Number(bpm)) || Number(bpm) <= 0) {
    throw new RangeError("bpm must be a positive finite number");
  }
  if (!Number.isFinite(Number(sampleRate)) || Number(sampleRate) <= 0) {
    throw new RangeError("sampleRate must be a positive finite number");
  }
}

