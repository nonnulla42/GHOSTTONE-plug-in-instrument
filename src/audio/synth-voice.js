export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function centsToRatio(cents) {
  return Math.pow(2, cents / 1200);
}

export function buildSynthVoicePlan(event, coreSettings, soundSettings, durationSeconds) {
  const safeDuration = Math.max(0.001, Number(durationSeconds) || 0.001);
  const detune = coreSettings.ghostEnabled ? event.cents : 0;
  const endDetune = coreSettings.ghostEnabled ? event.driftEnd : 0;
  const attack = Math.min(soundSettings.attack, safeDuration * 0.42);
  const release = Math.min(soundSettings.release, safeDuration * 0.75);
  const sustainStartOffset = Math.max(attack, safeDuration - release);
  const voiceScale = soundSettings.sound === "pluck" ? 0.2 : 0.14;
  const peakGain = event.velocity * voiceScale;
  const pan = clamp((event.voiceId - 2) * 0.08 * soundSettings.space, -0.35, 0.35);

  return {
    waveform: soundSettings.waveform,
    startFrequency: midiToFreq(event.midi) * centsToRatio(detune),
    endFrequency: midiToFreq(event.midi) * centsToRatio(endDetune),
    shouldDrift: Math.abs(endDetune - detune) > 0.001 && safeDuration > 0.45,
    attack,
    release,
    sustainStartOffset,
    stopOffset: safeDuration + release + 0.05,
    peakGain,
    sustainGain: peakGain * 0.78,
    cutoff: soundSettings.cutoff,
    filterQ: soundSettings.sound === "pluck" ? 1.05 : 0.62,
    pan,
  };
}

export function createWebAudioSynthVoice({ ctx, filter, event, startTime, durationSeconds, coreSettings, soundSettings, onEnded }) {
  const plan = buildSynthVoicePlan(event, coreSettings, soundSettings, durationSeconds);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const panner = ctx.createStereoPanner();
  const sustainStart = startTime + plan.sustainStartOffset;

  osc.type = plan.waveform;
  osc.frequency.setValueAtTime(plan.startFrequency, startTime);
  if (plan.shouldDrift) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, plan.endFrequency), startTime + durationSeconds);
  }

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(plan.peakGain, startTime + plan.attack);
  gain.gain.setValueAtTime(plan.sustainGain, sustainStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds + plan.release);

  filter.frequency.setTargetAtTime(plan.cutoff, startTime, 0.02);
  filter.Q.setTargetAtTime(plan.filterQ, startTime, 0.02);
  panner.pan.setValueAtTime(plan.pan, startTime);

  osc.connect(gain);
  gain.connect(panner);
  panner.connect(filter);

  osc.start(startTime);
  osc.stop(startTime + plan.stopOffset);
  if (onEnded) osc.addEventListener("ended", onEnded);

  return {
    osc,
    gain,
    panner,
    plan,
    stopTime: startTime + plan.stopOffset,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

