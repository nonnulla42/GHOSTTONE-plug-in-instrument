import { createPatchFromPreset, normalizePatch } from "../state/patch-state.js";

const coreRangeControls = ["ghostAmount", "drift", "harmonyLock", "voicingVariation", "voicingContinuity", "arpDensity", "arpVariation", "arpContinuity"];
const coreSelectControls = ["colorMode", "harmonicMotion", "harmonicDistanceTarget", "harmonicDistanceFalloff", "voicingStyle", "arpDirection", "arpFeel"];
const coreToggleControls = ["stayMusical", "ghostEnabled"];
const soundControls = ["waveform", "cutoff", "attack", "release", "space"];

export function capturePatch(els, basePatch, name = basePatch?.name || "Patch") {
  return normalizePatch({
    ...basePatch,
    name,
    bpm: Number(els.bpm.value),
    barStates: cloneBarStates(basePatch.barStates),
    chords: els.chordInputs.map((input) => ({
      bar: Number(input.dataset.bar),
      slot: Number(input.dataset.slot),
      value: input.value,
    })),
    core: {
      ...basePatch.core,
      ...readControlGroup(els, [...coreRangeControls, ...coreSelectControls, ...coreToggleControls]),
    },
    soundControls: {
      ...basePatch.soundControls,
      ...readControlGroup(els, soundControls),
    },
  });
}

export function presetToPatch(preset) {
  return createPatchFromPreset(preset);
}

export function applyPatch(els, patch) {
  const normalized = normalizePatch(patch);
  els.bpm.value = normalized.bpm;

  applyControlGroup(els, normalized.core);
  applyControlGroup(els, normalized.soundControls);
  applyChords(els, normalized.chords);
  setActiveButton(".generator-segment", "generatorMode", normalized.core.generatorMode);
  setActiveButton(".segment", "mode", normalized.mode);
  setActiveButton(".sound-segment", "sound", normalized.sound);
}

export function updateCompareUi(root, activeSlot) {
  root.querySelectorAll(".compare-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.compareSlot === activeSlot);
  });
}

function readControlGroup(els, ids) {
  return ids.reduce((values, id) => {
    const control = els[id];
    values[id] = control.type === "checkbox" ? control.checked : control.value;
    return values;
  }, {});
}

function applyControlGroup(els, values) {
  Object.entries(values).forEach(([id, value]) => {
    if (!els[id]) return;
    if (els[id].type === "checkbox") {
      els[id].checked = Boolean(value);
    } else {
      els[id].value = value;
    }
  });
}

function applyChords(els, chords) {
  chords.forEach((chord) => {
    const input = els.chordInputs.find((control) => Number(control.dataset.bar) === chord.bar && Number(control.dataset.slot) === chord.slot);
    if (input) input.value = chord.value;
  });
}

function cloneBarStates(barStates) {
  return barStates.map((bar) => ({
    split: bar.split,
    slots: bar.slots.map((slot) => ({ ...slot })),
  }));
}

function setActiveButton(selector, dataKey, value) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle("active", button.dataset[dataKey] === value);
  });
}
