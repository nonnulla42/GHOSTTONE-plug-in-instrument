function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}

export class WebAudioAdapter {
  constructor() {
    this.audio = null;
    this.loopTimer = null;
    this.loopStart = 0;
    this.isPlaying = false;
    this.restartToken = 0;
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
    this.scheduleLoop(pattern, coreSettings, soundSettings, bpm);
  }

  stop() {
    this.isPlaying = false;
    this.restartToken += 1;
    clearTimeout(this.loopTimer);
    this.audio?.ctx.close();
    this.audio = null;
  }

  async restart(pattern, coreSettings, soundSettings, bpm) {
    if (!this.isPlaying) return;

    const token = ++this.restartToken;
    clearTimeout(this.loopTimer);
    const previousAudio = this.audio;
    this.audio = null;
    previousAudio?.ctx.close().catch(() => {});

    const { ctx } = this.setup();
    if (ctx.state === "suspended") await ctx.resume();
    if (!this.isPlaying || token !== this.restartToken) return;
    this.scheduleLoop(pattern, coreSettings, soundSettings, bpm);
  }

  scheduleLoop(pattern, coreSettings, soundSettings, bpm) {
    const { ctx } = this.setup();
    const secondsPerBeat = 60 / bpm;
    const loopSeconds = pattern.loopBeats * secondsPerBeat;
    const start = ctx.currentTime + 0.08;
    this.loopStart = start;

    pattern.events.forEach((event) => {
      this.playVoice(event, start + event.startBeat * secondsPerBeat, event.durationBeats * secondsPerBeat, coreSettings, soundSettings);
    });

    clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(() => {
      if (this.isPlaying) this.scheduleLoop(pattern, coreSettings, soundSettings, bpm);
    }, loopSeconds * 1000);
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
  }

  getCurrentBeat(bpm, loopBeats) {
    if (!this.isPlaying || !this.audio) return null;

    const secondsPerBeat = 60 / bpm;
    const loopSeconds = loopBeats * secondsPerBeat;
    const elapsed = (this.audio.ctx.currentTime - this.loopStart) % loopSeconds;
    return elapsed / secondsPerBeat;
  }
}

