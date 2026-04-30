import { generatePattern } from "./src/core/ghosttone-core.js";
import {
  applyPresetToPatchState,
  createPatchFromPreset,
  createPatchState,
  deserializePatchState,
  getActivePatch,
  patchToCoreSettings,
  patchToProgression,
  patchToSoundSettings,
  serializePatchState,
  setActiveCompareSlot,
  setActivePatch,
  setPatchSlot,
} from "./src/state/patch-state.js";
import { WebAudioAdapter } from "./src/web/audio-adapter.js";
import { exportMidi, exportInfiniteMidi } from "./src/web/midi-export-adapter.js";
import { exportWav } from "./src/web/wav-export-adapter.js";
import { applyPatch, capturePatch, updateCompareUi } from "./src/web/patch-adapter.js";
import { findPreset } from "./src/web/presets.js";
import { getElements, refreshProgressionUi, updateReadouts } from "./src/web/ui-adapter.js";
import { GridVisualizer } from "./src/web/visual-adapter.js";

const initialPreset = findPreset("dreamy-pad");

const state = {
  patchState: createPatchState({
    slots: {
      A: createPatchFromPreset(initialPreset),
      B: { ...createPatchFromPreset(initialPreset), name: "Slot B", seed: Math.floor(Math.random() * 100000) + 1 },
    },
  }),
  pattern: null,
  currentSectionIndex: 0,
  raf: null,
  pendingUiUpdate: null,
  pendingUiTimer: null,
};

const LIVE_PATTERN_UPDATE_MS = 120;
const LIVE_SOUND_UPDATE_MS = 45;

const els = getElements();
const audio = new WebAudioAdapter();
const visualizer = new GridVisualizer(els.gridView);
const refreshSnapPointWidgets = initSnapPointWidgets();
const refreshGeneratorWidgets = initGeneratorWidgets();
const refreshSoundWidgets = initSoundWidgets();

audio.onPatternExtended = (pattern) => {
  state.pattern = pattern;
  updateReadouts(els, state.pattern, patchToCoreSettings(activePatch()), activePatch().bpm, patchToSoundSettings(activePatch()), state.currentSectionIndex);
  visualizer.render(state.pattern, state.currentSectionIndex, getVisualBeat());
};

function activePatch() {
  return getActivePatch(state.patchState);
}

function syncActivePatchFromUi() {
  state.patchState = setActivePatch(state.patchState, capturePatch(els, activePatch()));
}

function applyActivePatchToUi() {
  const patch = activePatch();
  applyPatch(els, patch);
  refreshProgressionUi(patch.barStates);
  refreshSnapPointWidgets();
  refreshGeneratorWidgets();
  refreshSoundWidgets();
  updateCompareUi(document, state.patchState.activeCompareSlot);
}

function clearPendingUiUpdate() {
  if (state.pendingUiTimer) {
    clearTimeout(state.pendingUiTimer);
    state.pendingUiTimer = null;
  }
}

function commitUiPatchUpdate({ restartAudio = true, soundOnly = false } = {}) {
  syncActivePatchFromUi();
  if (soundOnly) {
    refreshSoundOnly({ restartAudio });
  } else {
    rebuildPattern({ restartAudio });
  }
}

function flushPendingUiUpdate() {
  if (!state.pendingUiUpdate) return;
  const pending = state.pendingUiUpdate;
  state.pendingUiUpdate = null;
  clearPendingUiUpdate();
  commitUiPatchUpdate(pending);
}

function scheduleUiPatchUpdate({ restartAudio = true, soundOnly = false, immediate = false } = {}) {
  if (immediate || !audio.isPlaying) {
    state.pendingUiUpdate = null;
    clearPendingUiUpdate();
    commitUiPatchUpdate({ restartAudio, soundOnly });
    return;
  }

  const delay = soundOnly ? LIVE_SOUND_UPDATE_MS : LIVE_PATTERN_UPDATE_MS;
  const previous = state.pendingUiUpdate;
  state.pendingUiUpdate = previous
    ? {
        restartAudio: previous.restartAudio || restartAudio,
        soundOnly: previous.soundOnly && soundOnly,
      }
    : { restartAudio, soundOnly };

  clearPendingUiUpdate();
  state.pendingUiTimer = setTimeout(() => {
    flushPendingUiUpdate();
  }, delay);
}

function rebuildPattern({ restartAudio = true } = {}) {
  const patch = activePatch();
  const coreSettings = patchToCoreSettings(patch);
  const progression = patchToProgression(patch);
  const soundSettings = patchToSoundSettings(patch);

  state.pattern = generatePattern(coreSettings, progression, patch.seed);
  if (state.currentSectionIndex >= state.pattern.sections.length) state.currentSectionIndex = 0;

  updateReadouts(els, state.pattern, coreSettings, patch.bpm, soundSettings, state.currentSectionIndex);
  visualizer.render(state.pattern, state.currentSectionIndex, getVisualBeat(patch.bpm));

  if (restartAudio) {
    if (audio.isPlaying) {
      audio.schedulePatternSwap(state.pattern, coreSettings, soundSettings, patch.bpm);
    } else {
      audio.restart(state.pattern, coreSettings, soundSettings, patch.bpm);
    }
  }
}

function getVisualBeat(bpm = activePatch().bpm) {
  if (!audio.isPlaying || !state.pattern) return visualizer.currentBeat || 0;
  return audio.getCurrentBeat(bpm, state.pattern) ?? visualizer.currentBeat ?? 0;
}

function refreshSoundOnly({ restartAudio = true } = {}) {
  const patch = activePatch();
  const coreSettings = patchToCoreSettings(patch);
  const soundSettings = patchToSoundSettings(patch);

  updateReadouts(els, state.pattern, coreSettings, patch.bpm, soundSettings, state.currentSectionIndex);
  if (restartAudio) {
    if (audio.isPlaying) {
      audio.updateSoundSettings(soundSettings, coreSettings, patch.bpm);
    } else {
      audio.restart(state.pattern, coreSettings, soundSettings, patch.bpm);
    }
  }
}

function patternForExport() {
  return audio.isPlaying ? audio.getFullPattern() : state.pattern;
}

function loadCurrentPatch({ restartAudio = true } = {}) {
  state.pendingUiUpdate = null;
  clearPendingUiUpdate();
  applyActivePatchToUi();
  rebuildPattern({ restartAudio });
}

function applyPreset(presetId) {
  state.patchState = applyPresetToPatchState(state.patchState, findPreset(presetId));
  loadCurrentPatch();
}

function switchCompareSlot(slot) {
  syncActivePatchFromUi();

  if (!state.patchState.slots[slot]) {
    state.patchState = setPatchSlot(state.patchState, slot, {
      ...activePatch(),
      name: `Slot ${slot}`,
      seed: Math.floor(Math.random() * 100000) + 1,
    });
  }

  state.patchState = setActiveCompareSlot(state.patchState, slot);
  loadCurrentPatch();
}

function updateActivePatch(mutator, { restartAudio = true, syncUi = true } = {}) {
  state.pendingUiUpdate = null;
  clearPendingUiUpdate();
  const nextPatch = mutator(activePatch());
  state.patchState = setActivePatch(state.patchState, nextPatch);
  if (syncUi) applyActivePatchToUi();
  rebuildPattern({ restartAudio });
}

function updateActivePatchFromUi({ restartAudio = true, soundOnly = false, immediate = false } = {}) {
  scheduleUiPatchUpdate({ restartAudio, soundOnly, immediate });
}

async function togglePlay() {
  if (!audio.isPlaying) {
    updateActivePatchFromUi({ restartAudio: false, immediate: true });
    const patch = activePatch();
    await audio.start(state.pattern, patchToCoreSettings(patch), patchToSoundSettings(patch), patch.bpm);
    els.playButton.textContent = "Stop";
    animate();
    return;
  }

  flushPendingUiUpdate();
  audio.stop();
  els.playButton.textContent = "Play";
  visualizer.updatePlayhead(null);
  if (state.raf) cancelAnimationFrame(state.raf);
}

function animate() {
  const patch = activePatch();
  const beat = audio.getCurrentBeat(patch.bpm, state.pattern);
  visualizer.updatePlayhead(beat);

  if (beat !== null) {
    const sectionIndex = state.pattern.sections.findIndex((section) => beat >= section.startBeat && beat < section.startBeat + section.durationBeats);
    const nextSectionIndex = sectionIndex >= 0 ? sectionIndex : 0;
    if (nextSectionIndex !== state.currentSectionIndex) {
      state.currentSectionIndex = nextSectionIndex;
      visualizer.updateActiveSection(nextSectionIndex);
      refreshSoundOnly({ restartAudio: false });
    }
  }

  if (audio.isPlaying) {
    state.raf = requestAnimationFrame(animate);
  }
}

function setMode(mode) {
  updateActivePatch((patch) => ({ ...patch, mode }));
}

function setGeneratorMode(generatorMode) {
  updateActivePatch((patch) => ({
    ...patch,
    core: {
      ...patch.core,
      generatorMode,
    },
  }));
}

function setSound(sound) {
  updateActivePatch((patch) => ({ ...patch, sound }), { restartAudio: true });
}

function toggleSplit(barIndex) {
  updateActivePatch((patch) => ({
    ...patch,
    barStates: patch.barStates.map((bar, index) => (index === barIndex ? { ...bar, split: !bar.split } : bar)),
  }));
}

function randomizeVoicing(barIndex, slotIndex) {
  updateActivePatch((patch) => ({
    ...patch,
    barStates: updateSlotSeed(patch.barStates, barIndex, slotIndex, "voicingSeed"),
  }));
}

function randomizeArp(barIndex, slotIndex) {
  updateActivePatch((patch) => ({
    ...patch,
    barStates: updateSlotSeed(patch.barStates, barIndex, slotIndex, "arpSeed"),
  }));
}

function regenerateSeed() {
  updateActivePatch((patch) => ({
    ...patch,
    seed: Math.floor(Math.random() * 100000) + 1,
  }));
}

function exportPatchJson() {
  flushPendingUiUpdate();
  syncActivePatchFromUi();
  const blob = new Blob([serializePatchState(state.patchState)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ghosttone-patch.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importPatchJson(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      state.patchState = deserializePatchState(String(reader.result));
      loadCurrentPatch();
    } catch (error) {
      console.error(error);
      window.alert("Could not import this GhostTone patch JSON.");
    } finally {
      els.importPatchFile.value = "";
    }
  });
  reader.readAsText(file);
}

function updateSlotSeed(barStates, barIndex, slotIndex, seedKey) {
  return barStates.map((bar, index) => {
    if (index !== barIndex) return bar;
    return {
      ...bar,
      slots: bar.slots.map((slot, innerIndex) => (innerIndex === slotIndex ? { ...slot, [seedKey]: Math.floor(Math.random() * 100000) + 1 } : slot)),
    };
  });
}

function bindEvents() {
  els.playButton.addEventListener("click", () => {
    togglePlay().catch((error) => console.error(error));
  });

  els.generateButton.addEventListener("click", regenerateSeed);
  els.seedValue.addEventListener("change", () => updateActivePatchFromUi());
  els.presetSelect.addEventListener("change", () => applyPreset(els.presetSelect.value));
  els.exportPatchButton.addEventListener("click", exportPatchJson);
  els.importPatchButton.addEventListener("click", () => els.importPatchFile.click());
  els.importPatchFile.addEventListener("change", () => importPatchJson(els.importPatchFile.files?.[0]));

  els.compareButtons.forEach((button) => {
    button.addEventListener("click", () => switchCompareSlot(button.dataset.compareSlot));
  });

  els.exportButton.addEventListener("click", () => {
    flushPendingUiUpdate();
    updateActivePatchFromUi({ restartAudio: false, immediate: true });
    const patch = activePatch();
    exportMidi(patternForExport(), patch.bpm, patch.sound);
  });

  els.exportInfiniteButton.addEventListener("click", () => {
    flushPendingUiUpdate();
    updateActivePatchFromUi({ restartAudio: false, immediate: true });
    const patch = activePatch();
    exportInfiniteMidi(patternForExport(), patch.bpm, patch.sound);
  });

  els.exportWavButton.addEventListener("click", () => {
    flushPendingUiUpdate();
    updateActivePatchFromUi({ restartAudio: false, immediate: true });
    const patch = activePatch();
    exportWav(patch, {
      sampleRate: 44100,
      bpm: patch.bpm,
      startBeat: 0,
      endBeat: state.pattern.loopBeats,
      blockSize: 2048,
      channelCount: 2,
    });
  });

  els.bpm.addEventListener("input", () => updateActivePatchFromUi({ soundOnly: true }));
  els.bpm.addEventListener("change", () => scheduleUiPatchUpdate({ soundOnly: true, immediate: true }));

  els.generatorButtons.forEach((button) => {
    button.addEventListener("click", () => setGeneratorMode(button.dataset.generatorMode));
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  els.splitButtons.forEach((button) => {
    button.addEventListener("click", () => toggleSplit(Number(button.dataset.bar)));
  });
  els.voiceButtons.forEach((button) => {
    button.addEventListener("click", () => randomizeVoicing(Number(button.dataset.bar), Number(button.dataset.slot)));
  });
  els.arpButtons.forEach((button) => {
    button.addEventListener("click", () => randomizeArp(Number(button.dataset.bar), Number(button.dataset.slot)));
  });

  [
    els.ghostAmount,
    els.drift,
    els.harmonyLock,
    els.colorMode,
    els.harmonicMotion,
    els.localScaleType,
    els.localTargetDegree,
    els.localDegreeFalloff,
    els.stayMusical,
    els.ghostEnabled,
    els.voicingStyle,
    els.voicingVariation,
    els.voicingContinuity,
    els.arpDirection,
    els.arpFeel,
    els.arpDensity,
    els.arpContinuity,
    els.timeSignature,
    els.globalRoot,
    els.scaleName,
    els.scaleInfluence,
    els.memoryStrength,
    els.registerCenter,
    ...els.chordInputs,
  ].forEach((control) => {
    control.addEventListener("input", () => updateActivePatchFromUi());
    control.addEventListener("change", () => scheduleUiPatchUpdate({ immediate: true }));
  });

  [els.waveform, els.cutoff, els.attack, els.release, els.space, els.reverbMix, els.delayMix].forEach((control) => {
    control.addEventListener("input", () => updateActivePatchFromUi({ soundOnly: true }));
    control.addEventListener("change", () => scheduleUiPatchUpdate({ soundOnly: true, immediate: true }));
  });

  window.addEventListener("resize", () => {
    if (state.pattern) visualizer.render(state.pattern, state.currentSectionIndex, getVisualBeat());
  });
}

bindEvents();
loadCurrentPatch({ restartAudio: false });

function initSnapPointWidgets(root = document) {
  const syncTasks = [];

  root.querySelectorAll("input[type=\"range\"][data-snap-points]").forEach((slider) => {
    const parsedPoints = String(slider.dataset.snapPoints || "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value));

    if (parsedPoints.length < 2) return;

    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const points = parsedPoints
      .map((value) => Math.min(max, Math.max(min, value)))
      .sort((a, b) => a - b);

    slider.style.setProperty("--snap-slots", String(points.length));

    const snapToNearest = () => {
      const current = Number(slider.value);
      const nearest = points.reduce((best, point) => (Math.abs(point - current) < Math.abs(best - current) ? point : best), points[0]);
      if (nearest !== current) slider.value = String(nearest);
    };

    slider.addEventListener("input", snapToNearest);
    slider.addEventListener("change", snapToNearest);
    syncTasks.push(snapToNearest);
    snapToNearest();
  });

  return () => {
    syncTasks.forEach((sync) => sync());
  };
}

function initGeneratorWidgets(root = document) {
  const syncTasks = [];

  root.querySelectorAll("[data-snap-select]").forEach((row) => {
    const selectId = row.dataset.snapSelect;
    const select = root.querySelector(`#${selectId}`);
    const slider = row.querySelector(".snap-slider");
    const readout = row.querySelector("[data-snap-value]");
    if (!select || !slider) return;

    const options = [...select.options];
    slider.min = "0";
    slider.max = String(Math.max(0, options.length - 1));
    slider.step = "1";

    const syncFromSelect = () => {
      const optionIndex = Math.max(0, options.findIndex((option) => option.value === select.value));
      slider.value = String(optionIndex);
      if (readout) readout.textContent = options[optionIndex]?.textContent ?? "";
    };

    const syncFromSlider = (eventType) => {
      const optionIndex = Number(slider.value);
      const option = options[optionIndex];
      if (!option) return;
      if (select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event(eventType, { bubbles: true }));
      }
      if (readout) readout.textContent = option.textContent ?? "";
    };

    slider.addEventListener("input", () => syncFromSlider("input"));
    slider.addEventListener("change", () => syncFromSlider("change"));
    select.addEventListener("input", syncFromSelect);
    select.addEventListener("change", syncFromSelect);
    syncTasks.push(syncFromSelect);
    syncFromSelect();
  });

  root.querySelectorAll("[data-knob-range]").forEach((row) => {
    const rangeId = row.dataset.knobRange;
    const range = root.querySelector(`#${rangeId}`);
    const knob = row.querySelector("[data-knob-handle]");
    const value = row.querySelector("[data-knob-value]");
    if (!range || !knob || !value) return;

    let dragSession = null;
    const min = Number(range.min || 0);
    const max = Number(range.max || 100);
    const step = Number(range.step || 1);

    const clamp = (raw) => Math.min(max, Math.max(min, raw));
    const quantize = (raw) => {
      const normalized = (raw - min) / step;
      return clamp(min + Math.round(normalized) * step);
    };

    const setRangeValue = (next, eventType) => {
      const quantified = quantize(next);
      if (Number(range.value) === quantified) return;
      range.value = String(quantified);
      range.dispatchEvent(new Event(eventType, { bubbles: true }));
    };

    const resolveDecimals = () => {
      const stepText = String(range.step || "1");
      if (!stepText.includes(".")) return 0;
      return stepText.split(".")[1].length;
    };

    const renderKnob = () => {
      const current = Number(range.value);
      const normalized = max > min ? (current - min) / (max - min) : 0;
      const angle = -132 + normalized * 264;
      knob.style.setProperty("--knob-angle", `${angle}deg`);
      const decimals = resolveDecimals();
      value.textContent = decimals > 0 ? current.toFixed(decimals) : String(Math.round(current));
    };

    const onPointerMove = (event) => {
      if (!dragSession) return;
      const delta = dragSession.startY - event.clientY;
      const next = dragSession.startValue + delta * dragSession.unitsPerPixel;
      setRangeValue(next, "input");
      renderKnob();
    };

    const onPointerUp = (event) => {
      if (!dragSession) return;
      onPointerMove(event);
      setRangeValue(Number(range.value), "change");
      dragSession = null;
      knob.releasePointerCapture(event.pointerId);
      knob.classList.remove("is-dragging");
    };

    knob.addEventListener("pointerdown", (event) => {
      dragSession = {
        startY: event.clientY,
        startValue: Number(range.value),
        unitsPerPixel: Math.max(step, (max - min) / 160),
      };
      knob.setPointerCapture(event.pointerId);
      knob.classList.add("is-dragging");
      event.preventDefault();
    });

    knob.addEventListener("pointermove", onPointerMove);
    knob.addEventListener("pointerup", onPointerUp);
    knob.addEventListener("pointercancel", onPointerUp);

    knob.addEventListener("wheel", (event) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setRangeValue(Number(range.value) + direction * step, "input");
      setRangeValue(Number(range.value), "change");
      renderKnob();
    });

    range.addEventListener("input", renderKnob);
    range.addEventListener("change", renderKnob);
    syncTasks.push(renderKnob);
    renderKnob();
  });

  return () => {
    syncTasks.forEach((sync) => sync());
  };
}

function initSoundWidgets(root = document) {
  const syncTasks = [];

  root.querySelectorAll("[data-wave-group]").forEach((group) => {
    const select = root.querySelector("#waveform");
    const buttons = [...group.querySelectorAll("[data-wave-value]")];
    if (!select || buttons.length === 0) return;

    const syncFromSelect = () => {
      buttons.forEach((button) => {
        button.classList.toggle("active", button.dataset.waveValue === select.value);
      });
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const nextValue = button.dataset.waveValue;
        if (!nextValue || select.value === nextValue) return;
        select.value = nextValue;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncFromSelect();
      });
    });

    select.addEventListener("input", syncFromSelect);
    select.addEventListener("change", syncFromSelect);
    syncTasks.push(syncFromSelect);
    syncFromSelect();
  });

  return () => {
    syncTasks.forEach((sync) => sync());
  };
}
