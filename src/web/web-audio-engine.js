import { scheduleEventsForBlock, samplesToBeats } from "../adapters/host-time-adapter.js";
import { buildSynthVoicePlan, createWebAudioSynthVoice } from "../audio/synth-voice.js";
import { VoiceManager } from "../audio/voice-manager.js";
import { createInfiniteStreamRuntime, ensureInfiniteBeats } from "../core/infinite-stream-runtime.js";

function createConvolutionReverb(ctx, decaySeconds = 3.5) {
  const length = Math.round(ctx.sampleRate * decaySeconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  return conv;
}

export function getBrowserScheduleBlock({ audioCurrentTime, loopStartTime, bpm, sampleRate, loopBeats, lookaheadSeconds, isLooping = true }) {
  const elapsedSeconds = Math.max(0, audioCurrentTime - loopStartTime);
  const absoluteStartBeat = elapsedSeconds / (60 / bpm);
  const blockSize = Math.max(1, Math.round(lookaheadSeconds * sampleRate));
  const block = {
    bpm,
    sampleRate,
    blockSize,
    blockStartBeat: absoluteStartBeat,
  };

  if (isLooping) {
    block.isLooping = true;
    block.loopStartBeat = 0;
    block.loopEndBeat = loopBeats;
  }

  return block;
}

export function getNextBrowserScheduleBlock({ audioCurrentTime, loopStartTime, bpm, sampleRate, loopBeats, lookaheadSeconds, lastScheduledBeat, isLooping = true }) {
  const currentBlock = getBrowserScheduleBlock({ audioCurrentTime, loopStartTime, bpm, sampleRate, loopBeats, lookaheadSeconds, isLooping });
  const currentEndBeat = currentBlock.blockStartBeat + samplesToBeats(currentBlock.blockSize, bpm, sampleRate);
  const blockStartBeat = Math.max(currentBlock.blockStartBeat, Number.isFinite(lastScheduledBeat) ? lastScheduledBeat : currentBlock.blockStartBeat);
  const durationBeats = Math.max(0, currentEndBeat - blockStartBeat);

  return {
    ...currentBlock,
    blockStartBeat,
    blockSize: Math.max(1, Math.round(durationBeats * (60 / bpm) * sampleRate)),
  };
}

export function scheduleBrowserEvents(events, context) {
  const block = getBrowserScheduleBlock(context);
  return scheduleEventsForBlock(events, block);
}

export class WebAudioEngine {
  constructor({ lookaheadSeconds = 0.18, tickMs = 45 } = {}) {
    this.lookaheadSeconds = lookaheadSeconds;
    this.tickMs = tickMs;
    this.audio = null;
    this.timer = null;
    this.loopStartTime = 0;
    this.isPlaying = false;
    this.lastScheduledBeat = null;
    this.voiceManager = new VoiceManager({ maxVoices: 48 });
    this.activeVoiceCount = 0;
    this.streamRuntime = null;
    this.onPatternExtended = null;
  }

  setup() {
    if (this.audio) return this.audio;

    const ctx = new AudioContext();
    const master = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const compressor = ctx.createDynamicsCompressor();

    master.gain.value = 0.72;
    filter.type = "lowpass";
    filter.Q.value = 0.7;

    // Reverb: convolution with procedural IR + high-cut for warmth
    const reverb = createConvolutionReverb(ctx, 3.5);
    const reverbHighCut = ctx.createBiquadFilter();
    reverbHighCut.type = "lowpass";
    reverbHighCut.frequency.value = 3800;
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0;

    // Delay: 1/8-note BPM-synced with feedback
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.25;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.32;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0;

    // Dry chain
    filter.connect(compressor);
    compressor.connect(master);

    // Reverb send: filter → reverb → highcut → wet → master
    filter.connect(reverb);
    reverb.connect(reverbHighCut);
    reverbHighCut.connect(reverbWet);
    reverbWet.connect(master);

    // Delay send: filter → delay ↔ feedback, delay → wet → master
    filter.connect(delay);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(master);

    master.connect(ctx.destination);

    this.audio = { ctx, filter, master, reverbWet, delay, delayWet, delayFeedback };
    return this.audio;
  }

  updateMasterFx(soundSettings, bpm) {
    if (!this.audio) return;
    const { ctx, reverbWet, delay, delayWet, delayFeedback } = this.audio;
    const now = ctx.currentTime;
    const eighthNote = (60 / bpm) * 0.5;

    // exponential curve: perceived loudness matches slider position
    const rawReverb = soundSettings.reverbMix || 0;
    const rawDelay = soundSettings.delayMix || 0;
    reverbWet.gain.setTargetAtTime(rawReverb * rawReverb, now, 0.08);
    delayWet.gain.setTargetAtTime(rawDelay * rawDelay, now, 0.08);
    delay.delayTime.setTargetAtTime(eighthNote, now, 0.08);
    delayFeedback.gain.setTargetAtTime(Math.min(0.32, 0.6), now, 0.08);
  }

  async start(pattern, coreSettings, soundSettings, bpm) {
    const { ctx } = this.setup();
    if (ctx.state === "suspended") await ctx.resume();

    this.isPlaying = true;
    this.loopStartTime = ctx.currentTime + 0.05;
    this.lastScheduledBeat = null;
    const previousLoopBeats = pattern.loopBeats;
    this.streamRuntime = pattern.generatorMode === "infinite"
      ? createInfiniteStreamRuntime(pattern, coreSettings, pattern.seed || 1)
      : null;
    if (this.streamRuntime && pattern.loopBeats !== previousLoopBeats) {
      this.onPatternExtended?.(pattern);
    }
    this.voiceManager.clear();
    this.tick(pattern, coreSettings, soundSettings, bpm);
  }

  stop() {
    this.isPlaying = false;
    clearTimeout(this.timer);
    this.timer = null;
    this.activeVoiceCount = 0;
    this.voiceManager.clear();
    this.streamRuntime = null;
    this.audio?.ctx.close();
    this.audio = null;
  }

  async restart(pattern, coreSettings, soundSettings, bpm) {
    if (!this.isPlaying) return;
    this.stop();
    await this.start(pattern, coreSettings, soundSettings, bpm);
  }

  tick(pattern, coreSettings, soundSettings, bpm) {
    if (!this.isPlaying) return;

    const { ctx } = this.setup();
    this.updateMasterFx(soundSettings, bpm);
    this.voiceManager.advanceTo(ctx.currentTime);
    const isInfinite = Boolean(this.streamRuntime);
    const livePattern = this.getPlaybackPattern(pattern);
    const currentBeat = this.getCurrentBeat(bpm, livePattern);
    this.extendInfinitePlaybackIfNeeded(currentBeat || 0);
    const blockContext = getNextBrowserScheduleBlock({
      audioCurrentTime: ctx.currentTime,
      loopStartTime: this.loopStartTime,
      bpm,
      sampleRate: ctx.sampleRate,
      loopBeats: livePattern.loopBeats,
      lookaheadSeconds: this.lookaheadSeconds,
      lastScheduledBeat: this.lastScheduledBeat,
      isLooping: !isInfinite,
    });
    const scheduled = scheduleEventsForBlock(livePattern.events, blockContext);

    scheduled.forEach((event) => {
      const when = ctx.currentTime + event.sampleOffset / ctx.sampleRate;
      const durationSeconds = event.durationSamples / ctx.sampleRate;
      this.playVoice(event, when, durationSeconds, coreSettings, soundSettings);
    });

    this.activeVoiceCount = this.voiceManager.getVoiceCount();
    this.lastScheduledBeat = blockContext.blockStartBeat + samplesToBeats(blockContext.blockSize, bpm, ctx.sampleRate);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(pattern, coreSettings, soundSettings, bpm), this.tickMs);
  }

  getPlaybackPattern(pattern) {
    return this.streamRuntime?.pattern || pattern;
  }

  extendInfinitePlaybackIfNeeded(currentBeat) {
    if (!this.streamRuntime) return;

    const previousLoopBeats = this.streamRuntime.pattern.loopBeats;
    ensureInfiniteBeats(this.streamRuntime, currentBeat);
    if (this.streamRuntime.pattern.loopBeats !== previousLoopBeats) {
      this.onPatternExtended?.(this.streamRuntime.pattern);
    }
  }

  getInfiniteDebugState() {
    if (!this.streamRuntime) return null;

    return {
      generatedBars: this.streamRuntime.generatedBars,
      generatedEvents: this.streamRuntime.generatedEvents,
      nextBarToGenerate: this.streamRuntime.nextBarToGenerate,
      availableBeatRange: [0, this.streamRuntime.pattern.loopBeats],
      lastScheduledBeat: this.lastScheduledBeat,
    };
  }

  playVoice(event, when, durationSeconds, coreSettings, soundSettings) {
    const { ctx, filter } = this.setup();
    const plan = buildSynthVoicePlan(event, coreSettings, soundSettings, durationSeconds);
    const voice = this.voiceManager.startVoice(event, {
      startTime: when,
      currentTime: ctx.currentTime,
      durationSeconds,
      releaseSeconds: plan.release + 0.05,
    });

    this.activeVoiceCount = this.voiceManager.getVoiceCount();
    createWebAudioSynthVoice({
      ctx,
      filter,
      event,
      startTime: when,
      durationSeconds,
      coreSettings,
      soundSettings,
      onEnded: () => {
        this.voiceManager.finishVoice(voice.id);
        this.activeVoiceCount = this.voiceManager.getVoiceCount();
      },
    });
  }

  getCurrentBeat(bpm, patternOrLoopBeats) {
    if (!this.isPlaying || !this.audio) return null;

    const isInfinite = typeof patternOrLoopBeats === "object" && patternOrLoopBeats?.generatorMode === "infinite";
    const loopBeats = typeof patternOrLoopBeats === "object" ? patternOrLoopBeats.loopBeats : patternOrLoopBeats;
    const secondsPerBeat = 60 / bpm;
    const elapsedSeconds = Math.max(0, this.audio.ctx.currentTime - this.loopStartTime);
    if (isInfinite) {
      return elapsedSeconds / secondsPerBeat;
    }
    const loopSeconds = loopBeats * secondsPerBeat;
    const elapsed = elapsedSeconds % loopSeconds;
    return elapsed / secondsPerBeat;
  }
}
