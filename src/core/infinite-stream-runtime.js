import { appendInfiniteSections, createInfiniteSectionRuntime } from "./harmonic-infinite.js";
import { appendInfinitePatternEvents, createInfinitePatternEventRuntime } from "./ghosttone-core.js";

function cloneTemplateSections(sections) {
  return sections.map((section) => ({
    ...section,
    notes: section.notes.map((note) => ({ ...note })),
    baseNotes: section.baseNotes?.map((note) => ({ ...note })) || [],
    slotState: { ...section.slotState },
  }));
}

export function createInfiniteStreamRuntime(pattern, settings, seed, options = {}) {
  if (!pattern || !["infinite", "infinitePhrase"].includes(pattern.generatorMode)) {
    throw new TypeError("createInfiniteStreamRuntime requires an infinite-mode pattern");
  }

  const templateSections = cloneTemplateSections(pattern.templateSections || pattern.sections);
  const templateLoopBeats = Number(pattern.templateLoopBeats) || Number(pattern.loopBeats) || 16;
  const sectionsPerLoop = templateSections.length;
  const initialLoopCount = Math.max(1, Math.trunc(options.initialLoopCount || 2));
  const extendLoopCount = Math.max(1, Math.trunc(options.extendLoopCount || 2));
  const lowWaterBeats = Number(options.lowWaterBeats) > 0 ? Number(options.lowWaterBeats) : templateLoopBeats;
  const retainPastBeats = Number(options.retainPastBeats) > 0 ? Number(options.retainPastBeats) : templateLoopBeats;
  const retainFutureBeats = Number(options.retainFutureBeats) > 0
    ? Number(options.retainFutureBeats)
    : Math.max(lowWaterBeats * 2, templateLoopBeats * 2);
  const windowUpdateStepBeats = Number(options.windowUpdateStepBeats) > 0 ? Number(options.windowUpdateStepBeats) : 4;

  const runtime = {
    mode: "infinite-stream",
    settings,
    seed,
    templateSections,
    templateLoopBeats,
    sectionsPerLoop,
    initialLoopCount,
    extendLoopCount,
    lowWaterBeats,
    retainPastBeats,
    retainFutureBeats,
    windowUpdateStepBeats,
    pattern,
    windowPattern: {
      ...pattern,
      sections: pattern.sections.slice(),
      events: pattern.events.slice(),
    },
    sectionRuntime: createInfiniteSectionRuntime(templateSections, settings, seed, makeRandom),
    eventRuntime: createInfinitePatternEventRuntime(settings, seed),
    currentHarmonicState: null,
    generatedBars: Math.floor((pattern.loopBeats || templateLoopBeats) / 4),
    generatedEvents: pattern.events.length,
    nextBarToGenerate: Math.floor((pattern.loopBeats || templateLoopBeats) / 4),
    history: pattern.sections.slice(-8).map((section) => section.state).filter(Boolean),
    totalSectionCount: pattern.sections.length,
    lastWindowShiftBeat: null,
    windowStartBeat: 0,
    windowEndBeat: pattern.loopBeats,
  };

  if (pattern.sections.length) {
    appendInfiniteSections(runtime.sectionRuntime, pattern.sections.length);
    appendInfinitePatternEvents(runtime.eventRuntime, pattern.sections);
    runtime.currentHarmonicState = runtime.sectionRuntime.currentState || null;
  }

  ensureInfiniteBeats(runtime, 0, {
    targetMinimumBeats: templateLoopBeats * initialLoopCount,
  });

  return runtime;
}

export function ensureInfiniteBeats(runtime, currentBeat, options = {}) {
  const minimumRemainingBeats = Number(options.minimumRemainingBeats) > 0 ? Number(options.minimumRemainingBeats) : runtime.lowWaterBeats;
  const targetMinimumBeats = Number(options.targetMinimumBeats) > 0 ? Number(options.targetMinimumBeats) : null;
  let extended = false;

  while (true) {
    const remainingBeats = runtime.pattern.loopBeats - currentBeat;
    const hasEnoughAhead = remainingBeats >= minimumRemainingBeats;
    const hasEnoughTotal = targetMinimumBeats == null || runtime.pattern.loopBeats >= targetMinimumBeats;
    if (hasEnoughAhead && hasEnoughTotal) break;
    extendInfiniteRuntime(runtime, runtime.extendLoopCount);
    extended = true;
  }

  if (extended || shouldRefreshWindow(runtime, currentBeat)) {
    updateWindowPattern(runtime, currentBeat);
  }

  return runtime.windowPattern;
}

export function extendInfiniteRuntime(runtime, loopCount = runtime.extendLoopCount) {
  const loops = Math.max(1, Math.trunc(loopCount || 1));
  const sectionCountToAppend = runtime.sectionsPerLoop * loops;
  const sections = appendInfiniteSections(runtime.sectionRuntime, sectionCountToAppend);
  const events = appendInfinitePatternEvents(runtime.eventRuntime, sections);

  runtime.pattern.sections.push(...sections);
  runtime.pattern.events.push(...events);
  runtime.pattern.loopBeats = runtime.pattern.sections.reduce(
    (max, section) => Math.max(max, section.startBeat + section.durationBeats),
    runtime.templateLoopBeats,
  );
  runtime.currentHarmonicState = runtime.sectionRuntime.currentState || runtime.currentHarmonicState;
  runtime.generatedBars = Math.floor(runtime.pattern.loopBeats / 4);
  runtime.generatedEvents = runtime.pattern.events.length;
  runtime.nextBarToGenerate = runtime.generatedBars;
  runtime.history = runtime.pattern.sections.slice(-8).map((section) => section.state).filter(Boolean);
  runtime.totalSectionCount = runtime.pattern.sections.length;

  updateWindowPattern(runtime, runtime.lastWindowShiftBeat ?? 0, { force: true });

  return runtime.windowPattern;
}

function shouldRefreshWindow(runtime, currentBeat) {
  if (!Number.isFinite(runtime.lastWindowShiftBeat)) return true;
  return currentBeat - runtime.lastWindowShiftBeat >= runtime.windowUpdateStepBeats;
}

function updateWindowPattern(runtime, currentBeat, options = {}) {
  if (!runtime.windowPattern) return;

  const beat = Math.max(0, Number(currentBeat) || 0);
  const startBeat = Math.max(0, beat - runtime.retainPastBeats);
  const endBeat = Math.min(runtime.pattern.loopBeats, Math.max(beat + runtime.retainFutureBeats, beat + runtime.lowWaterBeats));
  const force = Boolean(options.force);

  if (!force && startBeat === runtime.windowStartBeat && endBeat === runtime.windowEndBeat) {
    runtime.lastWindowShiftBeat = beat;
    return;
  }

  runtime.windowPattern.sections = runtime.pattern.sections.filter(
    (section) => section.startBeat + section.durationBeats >= startBeat && section.startBeat <= endBeat,
  );
  runtime.windowPattern.events = runtime.pattern.events.filter(
    (event) => event.startBeat + event.durationBeats >= startBeat && event.startBeat <= endBeat,
  );
  runtime.windowPattern.loopBeats = runtime.pattern.loopBeats;
  runtime.windowPattern.templateLoopBeats = runtime.pattern.templateLoopBeats;
  runtime.windowPattern.templateSections = runtime.pattern.templateSections;
  runtime.windowPattern.generatorMode = runtime.pattern.generatorMode;
  runtime.windowPattern.progression = runtime.pattern.progression;
  runtime.windowPattern.settings = runtime.pattern.settings;
  runtime.windowPattern.seed = runtime.pattern.seed;
  runtime.windowPattern.windowStartBeat = startBeat;
  runtime.windowPattern.windowEndBeat = endBeat;

  runtime.windowStartBeat = startBeat;
  runtime.windowEndBeat = endBeat;
  runtime.lastWindowShiftBeat = beat;
}

function makeRandom(seed) {
  let value = Math.trunc(seed) % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
