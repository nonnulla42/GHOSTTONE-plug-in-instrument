import assert from "node:assert/strict";
import test from "node:test";

import {
  assignHarmonicRole,
  generateRoleDriftEndCents,
  generateRoleMicroOffsetCents,
  pickDurationClass,
  pickMotionType,
  resolveDurationBeats,
  ROLE_BEHAVIORS,
  shouldCarryForward,
} from "../src/core/harmonic-roles.js";

function sequenceRandom(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

test("assignHarmonicRole maps root to anchor and extensions to tension", () => {
  assert.equal(assignHarmonicRole({ degree: "1" }), "anchor");
  assert.equal(assignHarmonicRole({ degree: "3" }), "color");
  assert.equal(assignHarmonicRole({ degree: "5" }), "color");
  assert.equal(assignHarmonicRole({ degree: "9" }), "tension");
});

test("pickDurationClass follows role bias", () => {
  assert.equal(pickDurationClass("anchor", sequenceRandom([0.01])), "long");
  assert.equal(pickDurationClass("color", sequenceRandom([0.5])), "medium");
  assert.equal(pickDurationClass("tension", sequenceRandom([0.95])), "short");
});

test("resolveDurationBeats adapts role duration to motion mode", () => {
  const anchorPad = resolveDurationBeats("anchor", "pad", sequenceRandom([0.01, 0.6]), {
    sectionBeats: 4,
    remainingBeats: 4,
  });
  const tensionArp = resolveDurationBeats("tension", "arp", sequenceRandom([0.95, 0.2]), {
    sectionBeats: 4,
    remainingBeats: 4,
  });

  assert.ok(anchorPad >= 2);
  assert.ok(tensionArp <= 0.5);
});

test("generateRoleMicroOffsetCents stays role-coherent", () => {
  const anchor = generateRoleMicroOffsetCents("anchor", sequenceRandom([0.02, 0.8, 0.6]), {
    ghostEnabled: true,
    ghostAmount: 1,
    harmonyLock: 0.8,
    stayMusical: true,
    colorIntensity: 1,
  });
  const tension = generateRoleMicroOffsetCents("tension", sequenceRandom([0.02, 0.2, 0.9]), {
    ghostEnabled: true,
    ghostAmount: 1,
    harmonyLock: 0.2,
    stayMusical: false,
    colorIntensity: 1,
  });

  assert.ok(Math.abs(anchor) <= ROLE_BEHAVIORS.anchor.microRangeCents.max + 1);
  assert.ok(Math.abs(tension) >= ROLE_BEHAVIORS.tension.microRangeCents.min);
  assert.ok(Math.abs(tension) > Math.abs(anchor));
});

test("generateRoleDriftEndCents applies stronger drift to tension", () => {
  const anchor = generateRoleDriftEndCents("anchor", 2, sequenceRandom([0.02, 0.6, 0.6]), {
    ghostEnabled: true,
    driftAmount: 1,
    colorIntensity: 1,
  });
  const tension = generateRoleDriftEndCents("tension", 2, sequenceRandom([0.02, 0.8, 0.9]), {
    ghostEnabled: true,
    driftAmount: 1,
    colorIntensity: 1,
  });

  assert.ok(Math.abs(tension - 2) > Math.abs(anchor - 2));
});

test("pickMotionType and carry-forward stay deterministic", () => {
  assert.equal(pickMotionType("anchor", sequenceRandom([0.1])), "stay");
  assert.equal(pickMotionType("tension", sequenceRandom([0.95])), "leap");
  assert.equal(shouldCarryForward("anchor", sequenceRandom([0.2]), { sharedWithPrevious: true }), true);
  assert.equal(shouldCarryForward("tension", sequenceRandom([0.9])), false);
});
