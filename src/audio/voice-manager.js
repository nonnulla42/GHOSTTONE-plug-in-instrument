export class VoiceManager {
  constructor({ maxVoices = 32 } = {}) {
    if (!Number.isFinite(maxVoices) || maxVoices <= 0) {
      throw new RangeError("maxVoices must be a positive finite number");
    }

    this.maxVoices = Math.trunc(maxVoices);
    this.nextId = 1;
    this.voices = [];
  }

  startVoice(event, timing) {
    const startTime = readFinite(timing?.startTime, "startTime");
    const currentTime = readFinite(timing?.currentTime ?? startTime, "currentTime");
    const durationSeconds = Math.max(0, readFinite(timing?.durationSeconds, "durationSeconds"));
    const releaseSeconds = Math.max(0, readFinite(timing?.releaseSeconds ?? 0, "releaseSeconds"));
    const releaseAt = startTime + durationSeconds;
    const endTime = releaseAt + releaseSeconds;

    this.advanceTo(currentTime);
    while (this.voices.length >= this.maxVoices) {
      this.stealOldestVoice();
    }

    const voice = {
      id: this.nextId,
      eventId: event.id,
      event,
      logicalVoiceId: event.voiceId,
      noteName: event.noteName,
      midi: event.midi,
      cents: event.cents,
      driftEnd: event.driftEnd,
      state: "scheduled",
      startTime,
      releaseAt,
      endTime,
      durationSeconds,
      releaseSeconds,
    };

    this.nextId += 1;
    this.voices.push(voice);
    this.advanceTo(currentTime);
    return voice;
  }

  releaseVoice(id, releaseTime, releaseSeconds = 0) {
    const voice = this.voices.find((item) => item.id === id);
    if (!voice) return null;

    const safeReleaseTime = readFinite(releaseTime, "releaseTime");
    const safeReleaseSeconds = Math.max(0, readFinite(releaseSeconds, "releaseSeconds"));

    voice.releaseAt = safeReleaseTime;
    voice.endTime = safeReleaseTime + safeReleaseSeconds;
    voice.releaseSeconds = safeReleaseSeconds;
    this.advanceTo(safeReleaseTime);
    return voice;
  }

  finishVoice(id) {
    const before = this.voices.length;
    this.voices = this.voices.filter((voice) => voice.id !== id);
    return this.voices.length !== before;
  }

  advanceTo(time) {
    const now = readFinite(time, "time");

    this.voices = this.voices.filter((voice) => {
      if (now >= voice.endTime) return false;
      if (now >= voice.releaseAt) {
        voice.state = "releasing";
      } else if (now >= voice.startTime) {
        voice.state = "active";
      } else {
        voice.state = "scheduled";
      }
      return true;
    });

    return this.getVoices();
  }

  getVoices() {
    return this.voices.map((voice) => ({ ...voice }));
  }

  getActiveVoices() {
    return this.voices.filter((voice) => voice.state === "active").map((voice) => ({ ...voice }));
  }

  getVoiceCount() {
    return this.voices.length;
  }

  clear() {
    this.voices = [];
  }

  stealOldestVoice() {
    if (!this.voices.length) return null;

    const oldest = this.voices.reduce((candidate, voice) => {
      if (!candidate) return voice;
      if (voice.endTime < candidate.endTime) return voice;
      if (voice.startTime < candidate.startTime) return voice;
      return candidate;
    }, null);

    this.finishVoice(oldest.id);
    return oldest;
  }
}

function readFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new RangeError(`${label} must be a finite number`);
  }
  return number;
}
