import assert from "node:assert/strict";
import test from "node:test";

import { VoiceManager } from "../src/audio/voice-manager.js";

test("tracks voice lifecycle from scheduled to cleanup", () => {
  const manager = new VoiceManager();
  const voice = manager.startVoice(event("a"), {
    startTime: 10,
    currentTime: 10,
    durationSeconds: 2,
    releaseSeconds: 0.5,
  });

  assert.equal(voice.state, "active");
  assert.equal(manager.getVoiceCount(), 1);

  assert.equal(manager.advanceTo(11)[0].state, "active");
  assert.equal(manager.advanceTo(12.1)[0].state, "releasing");
  assert.equal(manager.advanceTo(12.5).length, 0);
});

test("supports future scheduled voices", () => {
  const manager = new VoiceManager();
  manager.startVoice(event("a"), {
    startTime: 10,
    currentTime: 9,
    durationSeconds: 2,
    releaseSeconds: 0.5,
  });

  assert.equal(manager.getVoices()[0].state, "scheduled");
  assert.equal(manager.advanceTo(10)[0].state, "active");
});

test("can release a voice early", () => {
  const manager = new VoiceManager();
  const voice = manager.startVoice(event("a"), {
    startTime: 0,
    durationSeconds: 10,
    releaseSeconds: 1,
  });

  manager.releaseVoice(voice.id, 2, 0.25);

  assert.equal(manager.advanceTo(2).length, 1);
  assert.equal(manager.getVoices()[0].state, "releasing");
  assert.equal(manager.advanceTo(2.25).length, 0);
});

test("steals a voice when max voices is reached", () => {
  const manager = new VoiceManager({ maxVoices: 2 });
  const first = manager.startVoice(event("a"), { startTime: 0, durationSeconds: 1, releaseSeconds: 1 });
  const second = manager.startVoice(event("b"), { startTime: 0, durationSeconds: 4, releaseSeconds: 1 });
  const third = manager.startVoice(event("c"), { startTime: 0, durationSeconds: 4, releaseSeconds: 1 });

  assert.equal(manager.getVoiceCount(), 2);
  assert.deepEqual(
    manager.getVoices().map((voice) => voice.eventId),
    [second.eventId, third.eventId],
  );
  assert.equal(manager.getVoices().some((voice) => voice.id === first.id), false);
});

test("rejects invalid voice settings", () => {
  assert.throws(() => new VoiceManager({ maxVoices: 0 }), /maxVoices/);
  assert.throws(() => new VoiceManager().startVoice(event("a"), { startTime: Number.NaN, durationSeconds: 1 }), /startTime/);
});

function event(id) {
  return {
    id,
    sectionIndex: 0,
    sectionLabel: "Am9",
    voiceId: 0,
    noteName: "A",
    midi: 57,
    startBeat: 0,
    durationBeats: 1,
    cents: 0,
    driftAmount: 0,
    driftEnd: 0,
    role: "stable",
    degree: "1",
    motionType: "pad",
    velocity: 0.5,
  };
}
