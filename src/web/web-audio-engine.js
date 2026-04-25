import { scheduleEventsForBlock, samplesToBeats } from "../adapters/host-time-adapter.js";

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
    this.tick(pattern, coreSettings, soundSettings, bpm);
  }

  stop() {
    this.isPlaying = false;
    clearTimeout(this.timer);
    this.timer = null;
    this.activeVoiceCount = 0;
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

    this.lastScheduledBeat = blockContext.blockStartBeat + samplesToBeats(blockContext.blockSize, bpm, ctx.sampleRate);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(pattern, coreSettings, soundSettings, bpm), this.tickMs);
  }

  playVoice(event, when, durationSeconds, coreSettings, soundSettings) {
    const { ctx, filter } = this.setup();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const detune = coreSettings.ghostEnabled ? event.cents : 0;
    const endDetune = coreSettings.ghostEnabled ? event.driftEnd : 0;
    const startFreq = midiToFreq(event.midi) * centsToRatio(detune);
    const endFreq = midiToFreq(event.midi) * centsToRatio(endDetune);
    const attack = Math.min(soundSettings.attack, durationSeconds * 0.42);
    const release = Math.min(soundSettings.release, durationSeconds * 0.75);
    const sustainStart = Math.max(when + attack, when + durationSeconds - release);
    const voiceScale = soundSettings.sound === "pluck" ? 0.2 : 0.14;
    const peak = event.velocity * voiceScale;
    const pan = Math.max(-0.35, Math.min(0.35, (event.voiceId - 2) * 0.08 * soundSettings.space));

    this.activeVoiceCount += 1;
    osc.type = soundSettings.waveform;
    osc.frequency.setValueAtTime(startFreq, when);
    if (durationSeconds > 0.45) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), when + durationSeconds);
    }

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(peak, when + attack);
    gain.gain.setValueAtTime(peak * 0.78, sustainStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + durationSeconds + release);

    filter.frequency.setTargetAtTime(soundSettings.cutoff, when, 0.02);
    filter.Q.setTargetAtTime(soundSettings.sound === "pluck" ? 1.05 : 0.62, when, 0.02);
    panner.pan.setValueAtTime(pan, when);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(filter);
    osc.start(when);
    osc.stop(when + durationSeconds + release + 0.05);
    osc.addEventListener("ended", () => {
      this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
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

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}
