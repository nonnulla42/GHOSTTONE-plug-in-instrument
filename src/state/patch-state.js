export const PATCH_STATE_VERSION = 1;

export const DEFAULT_PATCH = Object.freeze({
  name: "Dreamy Pad",
  seed: 48291,
  bpm: 92,
  mode: "pad",
  sound: "pad",
  barStates: freezeBars([
    barState(),
    barState(),
    barState(),
    barState(),
  ]),
  chords: Object.freeze([
    chordValue(0, 0, "Am9"),
    chordValue(1, 0, "Fmaj7"),
    chordValue(2, 0, "Cadd9"),
    chordValue(3, 0, "Gsus4"),
  ]),
  core: Object.freeze({
    generatorMode: "classic",
    harmonicMotion: 30,
    harmonicDistanceTarget: 1,
    harmonicDistanceFalloff: 1,
    localScaleType: "chromatic",
    localTargetDegree: 1,
    localDegreeFalloff: 1,
    ghostAmount: 48,
    drift: 35,
    harmonyLock: 68,
    colorMode: "dreamy",
    stayMusical: true,
    ghostEnabled: true,
    voicingStyle: "open",
    voicingVariation: 35,
    voicingContinuity: 65,
    arpDirection: "up",
    arpFeel: "even",
    arpDensity: 50,
    arpVariation: 35,
    arpContinuity: 60,
    globalRoot: "none",
    scaleName: "none",
    scaleInfluence: 30,
    memoryStrength: 50,
    registerCenter: 60,
  }),
  soundControls: Object.freeze({
    waveform: "triangle",
    cutoff: 1800,
    attack: 0.28,
    release: 0.7,
    space: 18,
    reverbMix: 18,
    delayMix: 0,
  }),
});

export function createDefaultPatch(overrides = {}) {
  return normalizePatch({ ...clonePatch(DEFAULT_PATCH), ...overrides });
}

export function createPatchState({ activeCompareSlot = "A", slots = {} } = {}) {
  const activeSlot = normalizeSlotName(activeCompareSlot);
  return normalizePatchState({
    version: PATCH_STATE_VERSION,
    activeCompareSlot: activeSlot,
    slots: {
      A: slots.A || createDefaultPatch({ name: "Slot A" }),
      B: slots.B || createDefaultPatch({ name: "Slot B", seed: 19377 }),
      ...slots,
    },
  });
}

export function createPatchFromPreset(preset) {
  return normalizePatch({
    name: preset?.name || DEFAULT_PATCH.name,
    seed: preset?.seed ?? DEFAULT_PATCH.seed,
    bpm: preset?.bpm ?? DEFAULT_PATCH.bpm,
    mode: preset?.mode || DEFAULT_PATCH.mode,
    sound: preset?.sound || DEFAULT_PATCH.sound,
    barStates: createDefaultBarStates(Math.max(4, preset?.chords?.length || 4)),
    chords: (preset?.chords || DEFAULT_PATCH.chords.map((chord) => chord.value)).map((value, index) => chordValue(index, 0, value)),
    core: { ...DEFAULT_PATCH.core, ...preset?.core },
    soundControls: { ...DEFAULT_PATCH.soundControls, ...preset?.soundControls },
  });
}

export function applyPresetToPatchState(state, preset, slot = state?.activeCompareSlot || "A") {
  const normalized = normalizePatchState(state);
  const targetSlot = normalizeSlotName(slot);
  return normalizePatchState({
    ...normalized,
    activeCompareSlot: targetSlot,
    slots: {
      ...normalized.slots,
      [targetSlot]: createPatchFromPreset(preset),
    },
  });
}

export function getActivePatch(state) {
  const normalized = normalizePatchState(state);
  return normalized.slots[normalized.activeCompareSlot];
}

export function setActivePatch(state, patch) {
  const normalized = normalizePatchState(state);
  return normalizePatchState({
    ...normalized,
    slots: {
      ...normalized.slots,
      [normalized.activeCompareSlot]: normalizePatch(patch),
    },
  });
}

export function setActiveCompareSlot(state, slot) {
  return normalizePatchState({
    ...normalizePatchState(state),
    activeCompareSlot: normalizeSlotName(slot),
  });
}

export function setPatchSlot(state, slot, patch) {
  const normalized = normalizePatchState(state);
  return normalizePatchState({
    ...normalized,
    slots: {
      ...normalized.slots,
      [normalizeSlotName(slot)]: normalizePatch(patch),
    },
  });
}

export function patchToCoreSettings(patch) {
  const normalized = normalizePatch(patch);
  return {
    generatorMode: normalized.core.generatorMode,
    harmonicMotion: normalized.core.harmonicMotion / 100,
    harmonicDistanceTarget: normalized.core.harmonicDistanceTarget,
    harmonicDistanceFalloff: normalized.core.harmonicDistanceFalloff,
    localScaleType: normalized.core.localScaleType,
    localTargetDegree: normalized.core.localTargetDegree,
    localDegreeFalloff: normalized.core.localDegreeFalloff,
    mode: normalized.mode,
    ghostAmount: normalized.core.ghostAmount / 100,
    drift: normalized.core.drift / 100,
    harmonyLock: normalized.core.harmonyLock / 100,
    colorMode: normalized.core.colorMode,
    stayMusical: normalized.core.stayMusical,
    ghostEnabled: normalized.core.ghostEnabled,
    voicingStyle: normalized.core.voicingStyle,
    voicingVariation: normalized.core.voicingVariation / 100,
    voicingContinuity: normalized.core.voicingContinuity / 100,
    arpDirection: normalized.core.arpDirection,
    arpFeel: normalized.core.arpFeel,
    arpDensity: normalized.core.arpDensity / 100,
    arpVariation: normalized.core.arpVariation / 100,
    arpContinuity: normalized.core.arpContinuity / 100,
    globalRoot: normalized.core.globalRoot,
    scaleName: normalized.core.scaleName,
    scaleInfluence: normalized.core.scaleInfluence / 100,
    memoryStrength: normalized.core.memoryStrength / 100,
    registerCenter: normalized.core.registerCenter,
  };
}

export function patchToSoundSettings(patch) {
  const normalized = normalizePatch(patch);
  return {
    sound: normalized.sound,
    waveform: normalized.soundControls.waveform,
    cutoff: normalized.soundControls.cutoff,
    attack: normalized.soundControls.attack,
    release: normalized.soundControls.release,
    space: normalized.soundControls.space / 100,
    reverbMix: normalized.soundControls.reverbMix / 100,
    delayMix: normalized.soundControls.delayMix / 100,
  };
}

export function patchToProgression(patch) {
  const normalized = normalizePatch(patch);
  return normalized.barStates.map((barState, barIndex) => {
    const slotCount = barState.split ? 2 : 1;
    const slots = [];

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      const chord = normalized.chords.find((item) => item.bar === barIndex && item.slot === slotIndex);
      slots.push({
        chord: chord?.value || "C",
        voicingSeed: barState.slots[slotIndex]?.voicingSeed || 0,
        arpSeed: barState.slots[slotIndex]?.arpSeed || 0,
      });
    }

    return {
      split: barState.split,
      slots,
    };
  });
}

export function serializePatchState(state) {
  return JSON.stringify(normalizePatchState(state));
}

export function deserializePatchState(serialized) {
  if (typeof serialized === "string") {
    return normalizePatchState(JSON.parse(serialized));
  }
  return normalizePatchState(serialized);
}

export function normalizePatchState(state = {}) {
  const activeCompareSlot = normalizeSlotName(state.activeCompareSlot || "A");
  const slots = state.slots || {};
  const normalizedSlots = Object.entries({ A: slots.A, B: slots.B, ...slots }).reduce((result, [slot, patch]) => {
    result[normalizeSlotName(slot)] = normalizePatch(patch || DEFAULT_PATCH);
    return result;
  }, {});

  if (!normalizedSlots[activeCompareSlot]) {
    normalizedSlots[activeCompareSlot] = createDefaultPatch({ name: `Slot ${activeCompareSlot}` });
  }

  return {
    version: PATCH_STATE_VERSION,
    activeCompareSlot,
    slots: normalizedSlots,
  };
}

export function normalizePatch(patch = {}) {
  return {
    name: String(patch.name || DEFAULT_PATCH.name),
    seed: normalizeInt(patch.seed, DEFAULT_PATCH.seed, 1),
    bpm: clampNumber(patch.bpm, 40, 240, DEFAULT_PATCH.bpm),
    mode: ["pad", "arp", "evolve"].includes(patch.mode) ? patch.mode : DEFAULT_PATCH.mode,
    sound: ["pad", "pluck"].includes(patch.sound) ? patch.sound : DEFAULT_PATCH.sound,
    barStates: normalizeBarStates(patch.barStates),
    chords: normalizeChords(patch.chords),
    core: normalizeCore(patch.core),
    soundControls: normalizeSoundControls(patch.soundControls),
  };
}

export function clonePatchState(state) {
  return deserializePatchState(serializePatchState(state));
}

function normalizeCore(core = {}) {
  return {
    generatorMode: ["classic", "roleBased", "infinite"].includes(core.generatorMode) ? core.generatorMode : DEFAULT_PATCH.core.generatorMode,
    harmonicMotion: clampNumber(core.harmonicMotion, 0, 100, DEFAULT_PATCH.core.harmonicMotion),
    harmonicDistanceTarget: normalizeInt(core.harmonicDistanceTarget, DEFAULT_PATCH.core.harmonicDistanceTarget, 0) % 12,
    harmonicDistanceFalloff: clampNumber(core.harmonicDistanceFalloff, 0, 6, DEFAULT_PATCH.core.harmonicDistanceFalloff),
    localScaleType: ["chromatic", "major", "minor", "dorian", "mixolydian", "phrygian", "harmonicMinor"].includes(core.localScaleType) ? core.localScaleType : DEFAULT_PATCH.core.localScaleType,
    localTargetDegree: clampNumber(Math.round(Number(core.localTargetDegree)), 1, 11, DEFAULT_PATCH.core.localTargetDegree),
    localDegreeFalloff: Number(core.localDegreeFalloff) > 0 ? 1 : 0,
    ghostAmount: clampNumber(core.ghostAmount, 0, 100, DEFAULT_PATCH.core.ghostAmount),
    drift: clampNumber(core.drift, 0, 100, DEFAULT_PATCH.core.drift),
    harmonyLock: clampNumber(core.harmonyLock, 0, 100, DEFAULT_PATCH.core.harmonyLock),
    colorMode: ["warm", "dreamy", "dark", "alien"].includes(core.colorMode) ? core.colorMode : DEFAULT_PATCH.core.colorMode,
    stayMusical: Boolean(core.stayMusical ?? DEFAULT_PATCH.core.stayMusical),
    ghostEnabled: Boolean(core.ghostEnabled ?? DEFAULT_PATCH.core.ghostEnabled),
    voicingStyle: ["close", "open", "spread", "smooth"].includes(core.voicingStyle) ? core.voicingStyle : DEFAULT_PATCH.core.voicingStyle,
    voicingVariation: clampNumber(core.voicingVariation, 0, 100, DEFAULT_PATCH.core.voicingVariation),
    voicingContinuity: clampNumber(core.voicingContinuity, 0, 100, DEFAULT_PATCH.core.voicingContinuity),
    arpDirection: ["up", "down", "updown", "insideout", "outsidein", "bounce", "free"].includes(core.arpDirection) ? core.arpDirection : DEFAULT_PATCH.core.arpDirection,
    arpFeel: ["even", "flowing", "broken", "syncopated", "pulsing"].includes(core.arpFeel) ? core.arpFeel : DEFAULT_PATCH.core.arpFeel,
    arpDensity: clampNumber(core.arpDensity, 0, 100, DEFAULT_PATCH.core.arpDensity),
    arpVariation: clampNumber(core.arpVariation, 0, 100, DEFAULT_PATCH.core.arpVariation),
    arpContinuity: clampNumber(core.arpContinuity, 0, 100, DEFAULT_PATCH.core.arpContinuity),
    globalRoot: ["none", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"].includes(String(core.globalRoot)) ? String(core.globalRoot) : DEFAULT_PATCH.core.globalRoot,
    scaleName: ["none", "major", "minor", "dorian", "mixolydian", "phrygian"].includes(core.scaleName) ? core.scaleName : DEFAULT_PATCH.core.scaleName,
    scaleInfluence: clampNumber(core.scaleInfluence, 0, 100, DEFAULT_PATCH.core.scaleInfluence),
    memoryStrength: clampNumber(core.memoryStrength, 0, 100, DEFAULT_PATCH.core.memoryStrength),
    registerCenter: clampNumber(core.registerCenter, 48, 72, DEFAULT_PATCH.core.registerCenter),
  };
}

function normalizeSoundControls(soundControls = {}) {
  return {
    waveform: ["sine", "triangle", "sawtooth", "square"].includes(soundControls.waveform) ? soundControls.waveform : DEFAULT_PATCH.soundControls.waveform,
    cutoff: clampNumber(soundControls.cutoff, 400, 6400, DEFAULT_PATCH.soundControls.cutoff),
    attack: clampNumber(soundControls.attack, 0.01, 1.2, DEFAULT_PATCH.soundControls.attack),
    release: clampNumber(soundControls.release, 0.05, 2.5, DEFAULT_PATCH.soundControls.release),
    space: clampNumber(soundControls.space, 0, 100, DEFAULT_PATCH.soundControls.space),
    reverbMix: clampNumber(soundControls.reverbMix, 0, 100, DEFAULT_PATCH.soundControls.reverbMix),
    delayMix: clampNumber(soundControls.delayMix, 0, 100, DEFAULT_PATCH.soundControls.delayMix),
  };
}

function normalizeBarStates(barStates = DEFAULT_PATCH.barStates) {
  const source = Array.isArray(barStates) && barStates.length ? barStates : DEFAULT_PATCH.barStates;
  return source.slice(0, 16).map((bar) => ({
    split: Boolean(bar.split),
    slots: [0, 1].map((index) => ({
      voicingSeed: normalizeInt(bar.slots?.[index]?.voicingSeed, 0, 0),
      arpSeed: normalizeInt(bar.slots?.[index]?.arpSeed, 0, 0),
    })),
  }));
}

function normalizeChords(chords = DEFAULT_PATCH.chords) {
  const source = Array.isArray(chords) && chords.length ? chords : DEFAULT_PATCH.chords;
  return source.slice(0, 32).map((chord, index) => ({
    bar: normalizeInt(chord.bar, index, 0),
    slot: normalizeInt(chord.slot, 0, 0),
    value: String(chord.value || "C"),
  }));
}

function createDefaultBarStates(length) {
  return Array.from({ length }, () => barState());
}

function barState() {
  return {
    split: false,
    slots: [
      { voicingSeed: 0, arpSeed: 0 },
      { voicingSeed: 0, arpSeed: 0 },
    ],
  };
}

function chordValue(bar, slot, value) {
  return Object.freeze({ bar, slot, value });
}

function clonePatch(patch) {
  return JSON.parse(JSON.stringify(patch));
}

function freezeBars(bars) {
  return Object.freeze(bars.map((bar) => Object.freeze({ split: bar.split, slots: Object.freeze(bar.slots.map((slot) => Object.freeze(slot))) })));
}

function normalizeSlotName(slot) {
  return String(slot || "A").trim().toUpperCase() || "A";
}

function normalizeInt(value, fallback, min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.trunc(number));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
