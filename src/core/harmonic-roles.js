function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function weightedChoice(weights, random) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  if (total <= 0) return entries[0]?.[0] || null;

  let cursor = random() * total;
  for (const [key, weight] of entries) {
    cursor -= Math.max(0, weight);
    if (cursor <= 0) return key;
  }

  return entries[entries.length - 1]?.[0] || null;
}

export const ROLE_BEHAVIORS = Object.freeze({
  anchor: Object.freeze({
    durationBias: Object.freeze({ long: 0.85, medium: 0.12, short: 0.03 }),
    microProbability: 0.1,
    microRangeCents: Object.freeze({ min: 0, max: 6 }),
    driftProbability: 0.1,
    driftRangeCents: Object.freeze({ min: 0, max: 5 }),
    carryForwardBias: 0.88,
    motionStepBias: Object.freeze({ stay: 0.78, step: 0.2, leap: 0.02 }),
  }),
  color: Object.freeze({
    durationBias: Object.freeze({ long: 0.3, medium: 0.45, short: 0.25 }),
    microProbability: 0.55,
    microRangeCents: Object.freeze({ min: 5, max: 22 }),
    driftProbability: 0.45,
    driftRangeCents: Object.freeze({ min: 3, max: 14 }),
    carryForwardBias: 0.45,
    motionStepBias: Object.freeze({ stay: 0.3, step: 0.55, leap: 0.15 }),
  }),
  tension: Object.freeze({
    durationBias: Object.freeze({ long: 0.1, medium: 0.35, short: 0.55 }),
    microProbability: 0.75,
    microRangeCents: Object.freeze({ min: 10, max: 35 }),
    driftProbability: 0.65,
    driftRangeCents: Object.freeze({ min: 6, max: 20 }),
    carryForwardBias: 0.25,
    motionStepBias: Object.freeze({ stay: 0.15, step: 0.6, leap: 0.25 }),
  }),
});

const DURATION_BY_MODE = Object.freeze({
  pad: Object.freeze({
    long: Object.freeze([2, 4, 6]),
    medium: Object.freeze([1, 2]),
    short: Object.freeze([0.5, 1]),
  }),
  arp: Object.freeze({
    long: Object.freeze([1, 1.5]),
    medium: Object.freeze([0.5, 0.75]),
    short: Object.freeze([0.25, 0.5]),
  }),
  evolve: Object.freeze({
    long: Object.freeze([2, 4]),
    medium: Object.freeze([0.5, 1, 2]),
    short: Object.freeze([0.25, 0.5]),
  }),
});

export function assignHarmonicRole(note) {
  const degree = String(note?.degree || "");

  if (degree === "1") return "anchor";
  if (["3", "b3", "5", "6", "b6"].includes(degree)) return "color";
  return "tension";
}

export function pickDurationClass(role, random) {
  const behavior = ROLE_BEHAVIORS[role] || ROLE_BEHAVIORS.color;
  return weightedChoice(behavior.durationBias, random) || "medium";
}

export function pickMotionType(role, random) {
  const behavior = ROLE_BEHAVIORS[role] || ROLE_BEHAVIORS.color;
  return weightedChoice(behavior.motionStepBias, random) || "step";
}

export function shouldCarryForward(role, random, context = {}) {
  const behavior = ROLE_BEHAVIORS[role] || ROLE_BEHAVIORS.color;
  const sharedBonus = context.sharedWithPrevious ? 0.08 : 0;
  const commonToneBonus = context.sharedWithNext ? 0.06 : 0;
  const probability = clamp(behavior.carryForwardBias + sharedBonus + commonToneBonus, 0, 1);
  return random() < probability;
}

export function resolveDurationBeats(role, mode, random, options = {}) {
  const durationClass = pickDurationClass(role, random);
  const modePool = DURATION_BY_MODE[mode] || DURATION_BY_MODE.pad;
  const pool = modePool[durationClass] || modePool.medium;
  const sectionBeats = Math.max(0.25, Number(options.sectionBeats) || 4);
  const remainingBeats = Math.max(0.25, Number(options.remainingBeats) || sectionBeats);
  const legal = pool.filter((duration) => duration <= remainingBeats + 1e-6);
  const chosenPool = legal.length ? legal : [Math.min(remainingBeats, pool[0] || remainingBeats)];
  const chosen = chosenPool[Math.floor(random() * chosenPool.length)];
  return clamp(chosen, 0.25, remainingBeats);
}

export function generateRoleMicroOffsetCents(role, random, options = {}) {
  if (!options.ghostEnabled || options.ghostAmount <= 0.01) return 0;

  const behavior = ROLE_BEHAVIORS[role] || ROLE_BEHAVIORS.color;
  const intensity = clamp(Number(options.colorIntensity) || 1, 0.35, 2);
  const probabilityScale = lerp(0.18, 1, clamp(Number(options.ghostAmount) || 0, 0, 1));
  const probability = clamp(behavior.microProbability * probabilityScale * intensity, 0, 1);

  if (random() > probability) return 0;

  const lockScale = role === "anchor" ? lerp(1, 0.58, options.harmonyLock || 0) : lerp(0.86, 1.06, 1 - (options.harmonyLock || 0));
  const musicalScale = options.stayMusical ? (role === "tension" ? 0.9 : 0.82) : 1;
  const maxRange = lerp(behavior.microRangeCents.min, behavior.microRangeCents.max, clamp(Number(options.ghostAmount) || 0, 0, 1));
  const amount = lerp(behavior.microRangeCents.min, maxRange, Math.pow(random(), 0.72)) * lockScale * musicalScale * intensity;
  const sign = random() < 0.5 ? -1 : 1;

  return clamp(sign * amount, -72, 72);
}

export function generateRoleDriftEndCents(role, baseCents, random, options = {}) {
  if (!options.ghostEnabled || options.driftAmount <= 0.01) return baseCents;

  const behavior = ROLE_BEHAVIORS[role] || ROLE_BEHAVIORS.color;
  const intensity = clamp(Number(options.colorIntensity) || 1, 0.35, 2);
  const probabilityScale = lerp(0.18, 1, clamp(Number(options.driftAmount) || 0, 0, 1));
  const probability = clamp(behavior.driftProbability * probabilityScale, 0, 1);

  if (random() > probability) return baseCents;

  const maxRange = lerp(behavior.driftRangeCents.min, behavior.driftRangeCents.max, clamp(Number(options.driftAmount) || 0, 0, 1));
  const amount = lerp(behavior.driftRangeCents.min, maxRange, Math.pow(random(), 0.68)) * intensity;
  const sign = random() < 0.5 ? -1 : 1;
  return clamp(baseCents + sign * amount, -80, 80);
}
