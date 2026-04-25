import { buildSynthVoicePlan } from "../audio/synth-voice.js";
import { VoiceManager } from "../audio/voice-manager.js";
import { createOfflineRenderPlan } from "./offline-render-plan.js";
import { patchToCoreSettings, patchToSoundSettings } from "../state/patch-state.js";

const twoPi = Math.PI * 2;

export function renderOfflineAudio(patch, options = {}) {
  const plan = createOfflineRenderPlan(patch, options);
  const coreSettings = patchToCoreSettings(patch);
  const soundSettings = patchToSoundSettings(patch);
  const channelCount = options.channelCount === 1 ? 1 : 2;
  const left = new Float32Array(plan.durationSamples);
  const right = channelCount === 2 ? new Float32Array(plan.durationSamples) : left;
  const voiceManager = new VoiceManager({ maxVoices: options.maxVoices || 48 });
  const voiceRuntime = new Map();

  plan.blocks.forEach((block) => {
    const blockStartTime = block.sampleStart / plan.sampleRate;
    const blockEndTime = (block.sampleStart + block.blockSize) / plan.sampleRate;

    voiceManager.advanceTo(blockStartTime);
    syncVoiceRuntime(voiceRuntime, voiceManager);

    block.scheduledEvents.forEach((event) => {
      const startTime = (block.sampleStart + event.sampleOffset) / plan.sampleRate;
      const durationSeconds = event.durationSamples / plan.sampleRate;
      const synthPlan = buildSynthVoicePlan(event, coreSettings, soundSettings, durationSeconds);
      const voice = voiceManager.startVoice(event, {
        startTime,
        currentTime: blockStartTime,
        durationSeconds,
        releaseSeconds: synthPlan.release + 0.05,
      });

      voiceRuntime.set(voice.id, {
        plan: synthPlan,
        phase: 0,
      });
      syncVoiceRuntime(voiceRuntime, voiceManager);
    });

    renderBlock({
      block,
      blockStartTime,
      blockEndTime,
      plan,
      voiceManager,
      voiceRuntime,
      left,
      right,
      channelCount,
    });

    voiceManager.advanceTo(blockEndTime);
    syncVoiceRuntime(voiceRuntime, voiceManager);
  });

  return {
    sampleRate: plan.sampleRate,
    channelCount,
    durationSamples: plan.durationSamples,
    left,
    right,
    plan,
  };
}

function renderBlock({ block, blockStartTime, blockEndTime, plan, voiceManager, voiceRuntime, left, right, channelCount }) {
  const activeVoices = voiceManager.getVoices();
  if (!activeVoices.length) return;

  for (let index = 0; index < block.blockSize; index += 1) {
    const sampleIndex = block.sampleStart + index;
    if (sampleIndex >= plan.durationSamples) break;

    const currentTime = sampleIndex / plan.sampleRate;
    if (currentTime < blockStartTime || currentTime >= blockEndTime) continue;

    activeVoices.forEach((voice) => {
      if (currentTime < voice.startTime || currentTime >= voice.endTime) return;

      const runtime = voiceRuntime.get(voice.id);
      if (!runtime) return;

      const sample = renderVoiceSample(voice, runtime, currentTime, plan.sampleRate);
      const pan = channelCount === 2 ? runtime.plan.pan : 0;
      const leftGain = channelCount === 2 ? Math.cos((pan + 1) * Math.PI * 0.25) : 1;
      const rightGain = channelCount === 2 ? Math.sin((pan + 1) * Math.PI * 0.25) : 1;

      left[sampleIndex] += sample * leftGain;
      right[sampleIndex] += sample * rightGain;
    });
  }
}

function renderVoiceSample(voice, runtime, currentTime, sampleRate) {
  const relativeTime = currentTime - voice.startTime;
  const frequency = getFrequencyAtTime(runtime.plan, relativeTime, voice.durationSeconds);
  const amp = getEnvelopeAtTime(runtime.plan, relativeTime, voice.durationSeconds);
  const sample = oscillatorSample(runtime.plan.waveform, runtime.phase) * amp;

  runtime.phase += twoPi * frequency / sampleRate;
  if (runtime.phase > twoPi) runtime.phase %= twoPi;

  return sample;
}

function getFrequencyAtTime(plan, time, durationSeconds) {
  if (!plan.shouldDrift || durationSeconds <= 0) return plan.startFrequency;
  const t = Math.max(0, Math.min(1, time / durationSeconds));
  return plan.startFrequency * Math.pow(plan.endFrequency / plan.startFrequency, t);
}

function getEnvelopeAtTime(plan, time, durationSeconds) {
  if (time < 0) return 0;
  if (time < plan.attack) {
    return lerp(0, plan.peakGain, plan.attack <= 0 ? 1 : time / plan.attack);
  }
  if (time < durationSeconds) {
    return plan.sustainGain;
  }
  if (time < durationSeconds + plan.release) {
    const t = plan.release <= 0 ? 1 : (time - durationSeconds) / plan.release;
    return lerp(plan.sustainGain, 0, t);
  }
  return 0;
}

function oscillatorSample(waveform, phase) {
  if (waveform === "sine") return Math.sin(phase);
  if (waveform === "square") return Math.sin(phase) >= 0 ? 1 : -1;
  if (waveform === "sawtooth") return 2 * (phase / twoPi - Math.floor(phase / twoPi + 0.5));
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

function syncVoiceRuntime(voiceRuntime, voiceManager) {
  const activeIds = new Set(voiceManager.getVoices().map((voice) => voice.id));
  [...voiceRuntime.keys()].forEach((id) => {
    if (!activeIds.has(id)) voiceRuntime.delete(id);
  });
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

