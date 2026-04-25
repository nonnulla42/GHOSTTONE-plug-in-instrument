import { scheduleEventsForBlock, samplesToBeats } from "../adapters/host-time-adapter.js";
import { buildSynthVoicePlan, createWebAudioSynthVoice } from "../audio/synth-voice.js";
import { VoiceManager } from "../audio/voice-manager.js";

export function getBrowserScheduleBlock({ audioCurrentTime, loopStartTime, bpm, sampleRate, loopBeats, lookaheadSeconds }) {
  const elapsedSeconds = Math.max(0, audioCurrentTime - loopStartTime);
  const absoluteStartBeat = elapsedSeconds / (60 / bpm);
  const blockSize = Math.max(1, Math.round(lookaheadSeconds * sampleRate));

  return {
    bpm,
    sampleRate,
    blockSize,
    blockStartBeat: absoluteStartBeat,
    isLooping: true,
    loopStartBeat: 0,
    loopEndBeat: loopBeats,
  };
}

export function getNextBrowserScheduleBlock({ audioCurrentTime, loopStartTime, bpm, sampleRate, loopBeats, lookaheadSeconds, lastScheduledBeat }) {
  const currentBlock = getBrowserScheduleBlock({ audioCurrentTime, loopStartTime, bpm, sampleRate, loopBeats, lookaheadSeconds });
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

    filter.connect(compressor);
    compressor.connect(master);
    master.connect(ctx.destination);

    this.audio = { ctx, filter, master };
    return this.audio;
  }

  async start(pattern, coreSettings, soundSettings, bpm) {
    const { ctx } = this.setup();
    if (ctx.state === "suspended") await ctx.resume();

    this.isPlaying = true;
    this.loopStartTime = ctx.currentTime + 0.05;
    this.lastScheduledBeat = null;
    this.voiceManager.clear();
    this.tick(pattern, coreSettings, soundSettings, bpm);
  }

  stop() {
    this.isPlaying = false;
    clearTimeout(this.timer);
    this.timer = null;
    this.activeVoiceCount = 0;
    this.voiceManager.clear();
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
    this.voiceManager.advanceTo(ctx.currentTime);
    const blockContext = getNextBrowserScheduleBlock({
      audioCurrentTime: ctx.currentTime,
      loopStartTime: this.loopStartTime,
      bpm,
      sampleRate: ctx.sampleRate,
      loopBeats: pattern.loopBeats,
      lookaheadSeconds: this.lookaheadSeconds,
      lastScheduledBeat: this.lastScheduledBeat,
    });
    const scheduled = scheduleEventsForBlock(pattern.events, blockContext);

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

  getCurrentBeat(bpm, loopBeats) {
    if (!this.isPlaying || !this.audio) return null;

    const secondsPerBeat = 60 / bpm;
    const loopSeconds = loopBeats * secondsPerBeat;
    const elapsed = (this.audio.ctx.currentTime - this.loopStartTime) % loopSeconds;
    return elapsed / secondsPerBeat;
  }
}
