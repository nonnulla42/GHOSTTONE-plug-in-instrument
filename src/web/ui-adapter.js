export function getElements(root = document) {
  return {
    playButton: root.querySelector("#playButton"),
    generateButton: root.querySelector("#generateButton"),
    exportButton: root.querySelector("#exportButton"),
    exportInfiniteButton: root.querySelector("#exportInfiniteButton"),
    exportWavButton: root.querySelector("#exportWavButton"),
    presetSelect: root.querySelector("#presetSelect"),
    compareButtons: [...root.querySelectorAll(".compare-button")],
    seedValue: root.querySelector("#seedValue"),
    exportPatchButton: root.querySelector("#exportPatchButton"),
    importPatchButton: root.querySelector("#importPatchButton"),
    importPatchFile: root.querySelector("#importPatchFile"),
    generatorButtons: [...root.querySelectorAll(".generator-segment")],
    bpm: root.querySelector("#bpm"),
    chordInputs: [...root.querySelectorAll(".chord-input")],
    splitButtons: [...root.querySelectorAll(".split-button")],
    voiceButtons: [...root.querySelectorAll(".voice-button")],
    arpButtons: [...root.querySelectorAll(".arp-button")],
    ghostAmount: root.querySelector("#ghostAmount"),
    drift: root.querySelector("#drift"),
    harmonyLock: root.querySelector("#harmonyLock"),
    colorMode: root.querySelector("#colorMode"),
    harmonicMotion: root.querySelector("#harmonicMotion"),
    localScaleType: root.querySelector("#localScaleType"),
    localTargetDegree: root.querySelector("#localTargetDegree"),
    localDegreeFalloff: root.querySelector("#localDegreeFalloff"),
    stayMusical: root.querySelector("#stayMusical"),
    ghostEnabled: root.querySelector("#ghostEnabled"),
    voicingStyle: root.querySelector("#voicingStyle"),
    voicingVariation: root.querySelector("#voicingVariation"),
    voicingContinuity: root.querySelector("#voicingContinuity"),
    arpDirection: root.querySelector("#arpDirection"),
    arpFeel: root.querySelector("#arpFeel"),
    arpDensity: root.querySelector("#arpDensity"),
    arpVariation: root.querySelector("#arpVariation"),
    arpContinuity: root.querySelector("#arpContinuity"),
    globalRoot: root.querySelector("#globalRoot"),
    scaleName: root.querySelector("#scaleName"),
    scaleInfluence: root.querySelector("#scaleInfluence"),
    scaleInfluenceValue: root.querySelector("#scaleInfluenceValue"),
    memoryStrength: root.querySelector("#memoryStrength"),
    memoryStrengthValue: root.querySelector("#memoryStrengthValue"),
    registerCenter: root.querySelector("#registerCenter"),
    registerCenterValue: root.querySelector("#registerCenterValue"),
    waveform: root.querySelector("#waveform"),
    cutoff: root.querySelector("#cutoff"),
    attack: root.querySelector("#attack"),
    release: root.querySelector("#release"),
    space: root.querySelector("#space"),
    reverbMix: root.querySelector("#reverbMix"),
    reverbMixValue: root.querySelector("#reverbMixValue"),
    delayMix: root.querySelector("#delayMix"),
    delayMixValue: root.querySelector("#delayMixValue"),
    gridView: root.querySelector("#gridView"),
    currentChord: root.querySelector("#currentChord"),
    rangeReadout: root.querySelector("#rangeReadout"),
    eventReadout: root.querySelector("#eventReadout"),
    patternTitle: root.querySelector("#patternTitle"),
    ghostValue: root.querySelector("#ghostValue"),
    driftValue: root.querySelector("#driftValue"),
    lockValue: root.querySelector("#lockValue"),
    cutoffValue: root.querySelector("#cutoffValue"),
    attackValue: root.querySelector("#attackValue"),
    releaseValue: root.querySelector("#releaseValue"),
    spaceValue: root.querySelector("#spaceValue"),
    voicingVariationValue: root.querySelector("#voicingVariationValue"),
    voicingContinuityValue: root.querySelector("#voicingContinuityValue"),
    arpDensityValue: root.querySelector("#arpDensityValue"),
    arpVariationValue: root.querySelector("#arpVariationValue"),
    arpContinuityValue: root.querySelector("#arpContinuityValue"),
  };
}

export function createInitialBarStates(length = 4) {
  return Array.from({ length }, () => ({
    split: false,
    slots: [
      { voicingSeed: 0, arpSeed: 0 },
      { voicingSeed: 0, arpSeed: 0 },
    ],
  }));
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function readBpm(els) {
  return clamp(Number(els.bpm.value) || 92, 40, 180);
}

export function readCoreSettings(els, mode, generatorMode = "classic") {
  return {
    generatorMode,
    mode,
    ghostAmount: Number(els.ghostAmount.value) / 100,
    drift: Number(els.drift.value) / 100,
    harmonyLock: Number(els.harmonyLock.value) / 100,
    colorMode: els.colorMode.value,
    harmonicMotion: els.harmonicMotion.value,
    localScaleType: els.localScaleType?.value ?? "chromatic",
    localTargetDegree: Number(els.localTargetDegree?.value ?? 1),
    localDegreeFalloff: Number(els.localDegreeFalloff?.value ?? 1),
    stayMusical: els.stayMusical.checked,
    ghostEnabled: els.ghostEnabled.checked,
    voicingStyle: els.voicingStyle.value,
    voicingVariation: Number(els.voicingVariation.value) / 100,
    voicingContinuity: Number(els.voicingContinuity.value) / 100,
    arpDirection: els.arpDirection.value,
    arpFeel: els.arpFeel.value,
    arpDensity: Number(els.arpDensity.value) / 100,
    arpVariation: Number(els.arpVariation.value) / 100,
    arpContinuity: Number(els.arpContinuity.value) / 100,
    globalRoot: els.globalRoot?.value ?? "none",
    scaleName: els.scaleName?.value ?? "none",
    scaleInfluence: Number(els.scaleInfluence?.value ?? 30) / 100,
    memoryStrength: Number(els.memoryStrength?.value ?? 50) / 100,
    registerCenter: Number(els.registerCenter?.value ?? 60),
  };
}

export function readSoundSettings(els, sound) {
  return {
    sound,
    waveform: els.waveform.value,
    cutoff: Number(els.cutoff.value),
    attack: Number(els.attack.value),
    release: Number(els.release.value),
    space: Number(els.space.value) / 100,
    reverbMix: Number(els.reverbMix?.value ?? 18) / 100,
    delayMix: Number(els.delayMix?.value ?? 0) / 100,
  };
}

export function readProgression(els, barStates) {
  return barStates.map((barState, barIndex) => {
    const slotCount = barState.split ? 2 : 1;
    const slots = [];

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      const input = els.chordInputs.find((control) => Number(control.dataset.bar) === barIndex && Number(control.dataset.slot) === slotIndex);
      const slotState = barState.slots[slotIndex];
      slots.push({
        chord: input?.value || "C",
        voicingSeed: slotState.voicingSeed,
        arpSeed: slotState.arpSeed,
      });
    }

    return {
      split: barState.split,
      slots,
    };
  });
}

export function refreshProgressionUi(barStates, root = document) {
  barStates.forEach((barState, barIndex) => {
    const card = root.querySelector(`.bar-card[data-bar="${barIndex}"]`);
    const variation = root.querySelector(`.variation-slot[data-bar="${barIndex}"]`);
    const splitButton = root.querySelector(`.split-button[data-bar="${barIndex}"]`);

    card?.classList.toggle("is-split", barState.split);
    if (variation) variation.hidden = !barState.split;
    if (splitButton) {
      splitButton.classList.toggle("active", barState.split);
      splitButton.textContent = barState.split ? "Unsplit" : "Split";
    }

    barState.slots.forEach((slotState, slotIndex) => {
      const voiceButton = root.querySelector(`.voice-button[data-bar="${barIndex}"][data-slot="${slotIndex}"]`);
      const arpButton = root.querySelector(`.arp-button[data-bar="${barIndex}"][data-slot="${slotIndex}"]`);
      voiceButton?.classList.toggle("active", Boolean(slotState.voicingSeed));
      arpButton?.classList.toggle("active", Boolean(slotState.arpSeed));
    });
  });
}

export function applySoundPreset(els, sound) {
  document.querySelectorAll(".sound-segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.sound === sound);
  });

  if (sound === "pad") {
    els.waveform.value = "triangle";
    els.cutoff.value = 1800;
    els.attack.value = 0.28;
    els.release.value = 0.7;
    els.space.value = 18;
  } else {
    els.waveform.value = "square";
    els.cutoff.value = 3200;
    els.attack.value = 0.03;
    els.release.value = 0.22;
    els.space.value = 8;
  }
}

export function updateReadouts(els, pattern, settings, bpm, soundSettings, currentSectionIndex) {
  const maxOffset = pattern.events.reduce((max, event) => Math.max(max, Math.abs(event.cents)), 0);
  els.ghostValue.textContent = Math.round(settings.ghostAmount * 100);
  els.driftValue.textContent = Math.round(settings.drift * 100);
  els.lockValue.textContent = Math.round(settings.harmonyLock * 100);
  els.cutoffValue.textContent = String(soundSettings.cutoff);
  els.attackValue.textContent = soundSettings.attack.toFixed(2);
  els.releaseValue.textContent = soundSettings.release.toFixed(2);
  els.spaceValue.textContent = Math.round(soundSettings.space * 100);
  els.voicingVariationValue.textContent = Math.round(settings.voicingVariation * 100);
  els.voicingContinuityValue.textContent = Math.round(settings.voicingContinuity * 100);
  els.arpDensityValue.textContent = Math.round(settings.arpDensity * 100);
  els.arpVariationValue.textContent = Math.round(settings.arpVariation * 100);
  els.arpContinuityValue.textContent = Math.round(settings.arpContinuity * 100);
  if (els.scaleInfluenceValue) els.scaleInfluenceValue.textContent = Math.round((settings.scaleInfluence ?? 0) * 100);
  if (els.memoryStrengthValue) els.memoryStrengthValue.textContent = Math.round((settings.memoryStrength ?? 0.5) * 100);
  if (els.registerCenterValue) els.registerCenterValue.textContent = midiToNoteName(settings.registerCenter ?? 60);
  if (els.reverbMixValue) els.reverbMixValue.textContent = Math.round((soundSettings.reverbMix ?? 0) * 100);
  if (els.delayMixValue) els.delayMixValue.textContent = Math.round((soundSettings.delayMix ?? 0) * 100);
  els.rangeReadout.textContent = `+/-${Math.round(maxOffset)} cents`;
  els.eventReadout.textContent = String(pattern.events.length);
  els.currentChord.textContent = pattern.sections[currentSectionIndex]?.label || "-";
  els.patternTitle.textContent = `${capitalize(settings.colorMode)} ${formatGeneratorMode(settings.generatorMode)} ${settings.mode} at ${bpm} BPM`;
  if (els.seedValue) els.seedValue.textContent = String(pattern.seed);
}

function midiToNoteName(midi) {
  const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  return names[midi % 12] + (Math.floor(midi / 12) - 1);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatGeneratorMode(value) {
  if (value === "infinite") return "infinite";
  return value === "roleBased" ? "role-based" : "classic";
}
