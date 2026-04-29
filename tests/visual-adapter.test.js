import assert from "node:assert/strict";
import test from "node:test";

import {
  beatToViewportX,
  getVisibleBeatRange,
  GridVisualizer,
  isEventVisible,
  VIEW_BEATS_AFTER,
  VIEW_BEATS_BEFORE,
} from "../src/web/visual-adapter.js";

test("visible beat range follows the current beat with a fixed window", () => {
  assert.deepEqual(getVisibleBeatRange(12), {
    startBeat: 12 - VIEW_BEATS_BEFORE,
    endBeat: 12 + VIEW_BEATS_AFTER,
  });
});

test("event visibility uses note duration and half-open viewport overlap", () => {
  const range = getVisibleBeatRange(10);

  assert.equal(isEventVisible({ startBeat: 6, durationBeats: 0.5 }, range), true);
  assert.equal(isEventVisible({ startBeat: 13.8, durationBeats: 0.5 }, range), true);
  assert.equal(isEventVisible({ startBeat: 1, durationBeats: 1 }, range), false);
  assert.equal(isEventVisible({ startBeat: 15, durationBeats: 1 }, range), false);
});

test("beatToViewportX normalizes beat positions inside the sliding window", () => {
  const range = getVisibleBeatRange(20);

  assert.equal(beatToViewportX(range.startBeat, range), 0);
  assert.equal(beatToViewportX(20, range), 50);
  assert.equal(beatToViewportX(range.endBeat, range), 100);
});

test("GridVisualizer renders only events inside the sliding viewport", () => {
  const previousDocument = globalThis.document;
  globalThis.document = createFakeDocument();
  try {
    const grid = createFakeElement("div");
    const visualizer = new GridVisualizer(grid);
    const events = Array.from({ length: 48 }, (_, index) => ({
      id: String(index),
      sectionIndex: index,
      sectionLabel: "Test",
      voiceId: index % 4,
      noteName: "C",
      midi: 48 + (index % 12),
      startBeat: index,
      durationBeats: 0.5,
      cents: 0,
      driftAmount: 0,
      driftEnd: 0,
      role: "anchor",
      degree: "1",
      motionType: "stay",
      carriedFromPrevious: false,
    }));
    const pattern = {
      loopBeats: 48,
      events,
      sections: Array.from({ length: 12 }, (_, index) => ({
        label: `S${index}`,
        startBeat: index * 4,
        durationBeats: 4,
        sectionIndex: index,
      })),
    };

    visualizer.render(pattern, 0, 20);

    assert.ok(grid.children.filter((child) => child.className?.includes?.("note-block")).length < events.length);
    assert.equal(grid.children.filter((child) => child.className?.includes?.("note-block")).length, 9);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("GridVisualizer keeps the same playhead node for small playback updates", () => {
  const previousDocument = globalThis.document;
  globalThis.document = createFakeDocument();
  try {
    const grid = createFakeElement("div");
    const visualizer = new GridVisualizer(grid);
    const pattern = createTestPattern();

    visualizer.render(pattern, 0, 20);
    const firstPlayhead = grid.querySelector("#gridPlayhead");

    visualizer.updatePlayhead(20.05);
    const secondPlayhead = grid.querySelector("#gridPlayhead");

    assert.equal(secondPlayhead, firstPlayhead);
    assert.notEqual(secondPlayhead.style.left, undefined);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("GridVisualizer toggles active section without rebuilding the viewport", () => {
  const previousDocument = globalThis.document;
  globalThis.document = createFakeDocument();
  try {
    const grid = createFakeElement("div");
    const visualizer = new GridVisualizer(grid);
    const pattern = createTestPattern();

    visualizer.render(pattern, 0, 20);
    const firstPlayhead = grid.querySelector("#gridPlayhead");
    const initialChildren = grid.children.slice();

    visualizer.updateActiveSection(1);

    assert.equal(grid.querySelector("#gridPlayhead"), firstPlayhead);
    assert.deepEqual(grid.children, initialChildren);
  } finally {
    globalThis.document = previousDocument;
  }
});

function createTestPattern() {
  const events = Array.from({ length: 48 }, (_, index) => ({
    id: String(index),
    sectionIndex: index,
    sectionLabel: "Test",
    voiceId: index % 4,
    noteName: "C",
    midi: 48 + (index % 12),
    startBeat: index,
    durationBeats: 0.5,
    cents: 0,
    driftAmount: 0,
    driftEnd: 0,
    role: "anchor",
    degree: "1",
    motionType: "stay",
    carriedFromPrevious: false,
  }));

  return {
    loopBeats: 48,
    events,
    sections: Array.from({ length: 12 }, (_, index) => ({
      label: `S${index}`,
      startBeat: index * 4,
      durationBeats: 4,
      sectionIndex: index,
    })),
  };
}

function createFakeDocument() {
  return {
    createElement: (tagName) => createFakeElement(tagName),
    createElementNS: (_namespace, tagName) => createFakeElement(tagName),
  };
}

function createFakeElement(tagName) {
  const element = {
    tagName,
    children: [],
    dataset: {},
    hidden: false,
    id: "",
    className: "",
    textContent: "",
    title: "",
    attributes: {},
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
    },
    classList: {
      remove(...names) {
        const current = element.className ? element.className.split(" ") : [];
        element.className = current.filter((name) => !names.includes(name)).join(" ");
      },
      add(...names) {
        element.className = [...new Set([...(element.className ? element.className.split(" ") : []), ...names])].join(" ");
      },
    },
    append(...children) {
      element.children.push(...children);
    },
    appendChild(child) {
      element.children.push(child);
      return child;
    },
    querySelector(selector) {
      if (selector === "#gridPlayhead") {
        return findChild(element, (child) => child.id === "gridPlayhead");
      }
      return null;
    },
    setAttribute(name, value) {
      element.attributes[name] = value;
    },
    get innerHTML() {
      return "";
    },
    set innerHTML(_value) {
      element.children = [];
    },
  };
  return element;
}

function findChild(element, predicate) {
  for (const child of element.children) {
    if (predicate(child)) return child;
    const nested = findChild(child, predicate);
    if (nested) return nested;
  }
  return null;
}
