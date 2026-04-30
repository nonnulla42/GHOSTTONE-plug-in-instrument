import { generatePattern } from "../core/ghosttone-core.js";
import { getBeatsPerBar } from "../core/meter.js";
import { beatsToSamples, samplesToBeats, scheduleEventsForBlock } from "../adapters/host-time-adapter.js";
import { normalizePatch, patchToCoreSettings, patchToProgression } from "../state/patch-state.js";

export function createOfflineRenderPlan(patch, options = {}) {
  const normalizedPatch = normalizePatch(patch);
  const context = normalizeRenderOptions(normalizedPatch, options);
  const coreSettings = patchToCoreSettings(normalizedPatch);
  const progression = patchToProgression(normalizedPatch);
  const pattern = generatePattern(coreSettings, progression, normalizedPatch.seed);
  const durationBeats = context.endBeat - context.startBeat;
  const durationSamples = Math.round(beatsToSamples(durationBeats, context.bpm, context.sampleRate));
  const totalBlocks = Math.ceil(durationSamples / context.blockSize);
  const blocks = [];

  for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex += 1) {
    const sampleStart = blockIndex * context.blockSize;
    const remainingSamples = durationSamples - sampleStart;
    const blockSize = Math.min(context.blockSize, remainingSamples);
    const blockStartBeat = context.startBeat + samplesToBeats(sampleStart, context.bpm, context.sampleRate);
    const blockEndBeat = context.startBeat + samplesToBeats(sampleStart + blockSize, context.bpm, context.sampleRate);
    const scheduledEvents = scheduleEventsForBlock(pattern.events, {
      bpm: context.bpm,
      sampleRate: context.sampleRate,
      blockSize,
      blockStartBeat,
    })
      .filter((event) => event.startBeat >= context.startBeat && event.startBeat < context.endBeat)
      .map((event) => ({
        ...event,
        eventId: event.id,
        blockIndex,
      }));

    blocks.push({
      blockIndex,
      blockStartBeat,
      blockEndBeat,
      sampleStart,
      blockSize,
      scheduledEvents,
    });
  }

  return {
    startBeat: context.startBeat,
    endBeat: context.endBeat,
    blockSize: context.blockSize,
    sampleRate: context.sampleRate,
    bpm: context.bpm,
    totalBlocks,
    durationBeats,
    durationSamples,
    pattern,
    blocks,
  };
}

function normalizeRenderOptions(patch, options) {
  const bpm = readPositive(options.bpm ?? patch.bpm, "bpm");
  const sampleRate = readPositive(options.sampleRate, "sampleRate");
  const blockSize = Math.trunc(readPositive(options.blockSize, "blockSize"));
  const startBeat = readFinite(options.startBeat ?? 0, "startBeat");
  const beatsPerBar = getBeatsPerBar(patch.core);
  const endBeat = readFinite(options.endBeat ?? patch.barStates.length * beatsPerBar, "endBeat");

  if (startBeat < 0) {
    throw new RangeError("startBeat must be non-negative");
  }
  if (endBeat <= startBeat) {
    throw new RangeError("endBeat must be greater than startBeat");
  }

  return {
    bpm,
    sampleRate,
    blockSize,
    startBeat,
    endBeat,
  };
}

function readPositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${label} must be a positive finite number`);
  }
  return number;
}

function readFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new RangeError(`${label} must be a finite number`);
  }
  return number;
}
