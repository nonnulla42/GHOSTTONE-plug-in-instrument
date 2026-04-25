import { buildInfiniteSectionSequence, createHarmonicStateFromSection } from "./harmonic-infinite.js";
import { buildPatternEventsForSections } from "./ghosttone-core.js";

function cloneTemplateSections(sections) {
  return sections.map((section) => ({
    ...section,
    notes: section.notes.map((note) => ({ ...note })),
    baseNotes: section.baseNotes?.map((note) => ({ ...note })) || [],
    slotState: { ...section.slotState },
  }));
}

export function createInfiniteStreamRuntime(pattern, settings, seed, options = {}) {
  if (!pattern || pattern.generatorMode !== "infinite") {
    throw new TypeError("createInfiniteStreamRuntime requires an infinite pattern");
  }

  const templateSections = cloneTemplateSections(pattern.templateSections || pattern.sections);
  const templateLoopBeats = Number(pattern.templateLoopBeats) || Number(pattern.loopBeats) || 16;
  const sectionsPerLoop = templateSections.length;
  const initialLoopCount = Math.max(1, Math.trunc(options.initialLoopCount || 2));
  const extendLoopCount = Math.max(1, Math.trunc(options.extendLoopCount || 2));
  const lowWaterBeats = Number(options.lowWaterBeats) > 0 ? Number(options.lowWaterBeats) : templateLoopBeats;

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
    pattern,
    currentHarmonicState: pattern.sections.length ? createHarmonicStateFromSection(pattern.sections[pattern.sections.length - 1]) : null,
    generatedBars: Math.floor((pattern.loopBeats || templateLoopBeats) / 4),
    generatedEvents: pattern.events.length,
    nextBarToGenerate: Math.floor((pattern.loopBeats || templateLoopBeats) / 4),
    history: pattern.sections.slice(-8).map((section) => section.state).filter(Boolean),
  };

  ensureInfiniteBeats(runtime, 0, {
    targetMinimumBeats: templateLoopBeats * initialLoopCount,
  });

  return runtime;
}

export function ensureInfiniteBeats(runtime, currentBeat, options = {}) {
  const minimumRemainingBeats = Number(options.minimumRemainingBeats) > 0 ? Number(options.minimumRemainingBeats) : runtime.lowWaterBeats;
  const targetMinimumBeats = Number(options.targetMinimumBeats) > 0 ? Number(options.targetMinimumBeats) : null;

  while (true) {
    const remainingBeats = runtime.pattern.loopBeats - currentBeat;
    const hasEnoughAhead = remainingBeats >= minimumRemainingBeats;
    const hasEnoughTotal = targetMinimumBeats == null || runtime.pattern.loopBeats >= targetMinimumBeats;
    if (hasEnoughAhead && hasEnoughTotal) break;
    extendInfiniteRuntime(runtime, runtime.extendLoopCount);
  }

  return runtime.pattern;
}

export function extendInfiniteRuntime(runtime, loopCount = runtime.extendLoopCount) {
  const loops = Math.max(1, Math.trunc(loopCount || 1));
  const currentSectionCount = runtime.pattern.sections.length;
  const totalSectionCount = currentSectionCount + runtime.sectionsPerLoop * loops;
  const sections = buildInfiniteSectionSequence(
    runtime.templateSections,
    runtime.settings,
    runtime.seed,
    totalSectionCount,
    makeRandom,
  );
  const events = buildPatternEventsForSections(sections, runtime.settings, runtime.seed);

  runtime.pattern.sections = sections;
  runtime.pattern.events = events;
  runtime.pattern.loopBeats = sections.reduce(
    (max, section) => Math.max(max, section.startBeat + section.durationBeats),
    runtime.templateLoopBeats,
  );
  runtime.currentHarmonicState = sections.length ? createHarmonicStateFromSection(sections[sections.length - 1]) : runtime.currentHarmonicState;
  runtime.generatedBars = Math.floor(runtime.pattern.loopBeats / 4);
  runtime.generatedEvents = events.length;
  runtime.nextBarToGenerate = runtime.generatedBars;
  runtime.history = sections.slice(-8).map((section) => section.state).filter(Boolean);

  return runtime.pattern;
}

function makeRandom(seed) {
  let value = Math.trunc(seed) % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
