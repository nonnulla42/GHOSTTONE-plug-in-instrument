import { renderOfflineAudio } from "./offline-audio-renderer.js";

export function encodeWav(audio, { bitDepth = 16 } = {}) {
  if (bitDepth !== 16) {
    throw new RangeError("Only 16-bit PCM WAV export is currently supported");
  }

  const normalized = normalizeAudio(audio);
  const bytesPerSample = bitDepth / 8;
  const blockAlign = normalized.channelCount * bytesPerSample;
  const byteRate = normalized.sampleRate * blockAlign;
  const dataSize = normalized.durationSamples * blockAlign;
  const wavSize = 44 + dataSize;
  const buffer = new ArrayBuffer(wavSize);
  const view = new DataView(buffer);
  const channels = interleaveChannels(normalized);
  let offset = 0;

  writeAscii(view, offset, "RIFF");
  offset += 4;
  view.setUint32(offset, wavSize - 8, true);
  offset += 4;
  writeAscii(view, offset, "WAVE");
  offset += 4;
  writeAscii(view, offset, "fmt ");
  offset += 4;
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, normalized.channelCount, true);
  offset += 2;
  view.setUint32(offset, normalized.sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bitDepth, true);
  offset += 2;
  writeAscii(view, offset, "data");
  offset += 4;
  view.setUint32(offset, dataSize, true);
  offset += 4;

  channels.forEach((sample, index) => {
    view.setInt16(offset + index * 2, floatToPcm16(sample), true);
  });

  return new Uint8Array(buffer);
}

export function renderOfflineWav(patch, renderOptions = {}, wavOptions = {}) {
  const audio = renderOfflineAudio(patch, renderOptions);
  const wavBytes = encodeWav(audio, wavOptions);
  return {
    audio,
    wavBytes,
  };
}

function normalizeAudio(audio) {
  const sampleRate = Number(audio?.sampleRate);
  const channelCount = Number(audio?.channelCount);
  const durationSamples = Number(audio?.durationSamples);
  const left = audio?.left;
  const right = audio?.right;

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError("audio.sampleRate must be a positive finite number");
  }
  if (![1, 2].includes(channelCount)) {
    throw new RangeError("audio.channelCount must be 1 or 2");
  }
  if (!Number.isFinite(durationSamples) || durationSamples < 0) {
    throw new RangeError("audio.durationSamples must be a non-negative finite number");
  }
  if (!(left instanceof Float32Array) || left.length !== durationSamples) {
    throw new RangeError("audio.left must be a Float32Array matching durationSamples");
  }
  if (!(right instanceof Float32Array) || right.length !== durationSamples) {
    throw new RangeError("audio.right must be a Float32Array matching durationSamples");
  }

  return {
    sampleRate,
    channelCount,
    durationSamples,
    left,
    right,
  };
}

function interleaveChannels(audio) {
  const samples = new Float32Array(audio.durationSamples * audio.channelCount);
  for (let index = 0; index < audio.durationSamples; index += 1) {
    const sampleIndex = index * audio.channelCount;
    samples[sampleIndex] = sanitizeSample(audio.left[index]);
    if (audio.channelCount === 2) {
      samples[sampleIndex + 1] = sanitizeSample(audio.right[index]);
    }
  }
  return samples;
}

function sanitizeSample(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function floatToPcm16(value) {
  const sample = sanitizeSample(value);
  return sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

