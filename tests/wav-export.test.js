import assert from "node:assert/strict";
import test from "node:test";

import { renderOfflineAudio } from "../src/render/offline-audio-renderer.js";
import { encodeWav, renderOfflineWav } from "../src/render/wav-export.js";
import { createPatchFromPreset } from "../src/state/patch-state.js";
import { PRESETS } from "../src/web/presets.js";

const renderOptions = {
  bpm: 120,
  sampleRate: 12000,
  startBeat: 0,
  endBeat: 4,
  blockSize: 1200,
};

test("encodes a valid stereo 16-bit WAV header", () => {
  const audio = renderOfflineAudio(createPatchFromPreset(PRESETS[0]), renderOptions);
  const wav = encodeWav(audio);
  const header = readHeader(wav);

  assert.equal(header.riff, "RIFF");
  assert.equal(header.wave, "WAVE");
  assert.equal(header.fmt, "fmt ");
  assert.equal(header.data, "data");
  assert.equal(header.audioFormat, 1);
  assert.equal(header.channelCount, 2);
  assert.equal(header.sampleRate, 12000);
  assert.equal(header.bitsPerSample, 16);
  assert.equal(header.dataSize, audio.durationSamples * audio.channelCount * 2);
  assert.equal(wav.length, 44 + header.dataSize);
});

test("encodes mono WAV consistently", () => {
  const audio = renderOfflineAudio(createPatchFromPreset(PRESETS[0]), {
    ...renderOptions,
    channelCount: 1,
  });
  const wav = encodeWav(audio);
  const header = readHeader(wav);

  assert.equal(header.channelCount, 1);
  assert.equal(header.dataSize, audio.durationSamples * 2);
});

test("wav export is deterministic for identical input", () => {
  const patch = createPatchFromPreset(PRESETS[2]);
  const first = renderOfflineWav(patch, renderOptions).wavBytes;
  const second = renderOfflineWav(patch, renderOptions).wavBytes;

  assert.deepEqual([...second], [...first]);
});

test("wav export contains non-zero audio data for a valid patch", () => {
  const wav = renderOfflineWav(createPatchFromPreset(PRESETS[0]), renderOptions).wavBytes;
  const pcm = wav.slice(44);

  assert.equal(pcm.some((value) => value !== 0), true);
});

test("wav export sanitizes invalid samples", () => {
  const wav = encodeWav({
    sampleRate: 12000,
    channelCount: 2,
    durationSamples: 2,
    left: new Float32Array([Infinity, 0.5]),
    right: new Float32Array([NaN, -0.5]),
  });
  const header = readHeader(wav);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

  assert.equal(header.dataSize, 8);
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), 0);
  assert.notEqual(view.getInt16(48, true), 0);
  assert.notEqual(view.getInt16(50, true), 0);
});

test("rejects unsupported bit depth and malformed audio", () => {
  const audio = renderOfflineAudio(createPatchFromPreset(PRESETS[0]), renderOptions);

  assert.throws(() => encodeWav(audio, { bitDepth: 24 }), /16-bit/);
  assert.throws(() => encodeWav({ ...audio, channelCount: 3 }), /channelCount/);
});

function readHeader(wavBytes) {
  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  return {
    riff: readAscii(view, 0, 4),
    wave: readAscii(view, 8, 4),
    fmt: readAscii(view, 12, 4),
    audioFormat: view.getUint16(20, true),
    channelCount: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    data: readAscii(view, 36, 4),
    dataSize: view.getUint32(40, true),
  };
}

function readAscii(view, offset, length) {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += String.fromCharCode(view.getUint8(offset + index));
  }
  return result;
}

