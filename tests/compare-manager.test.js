import assert from "node:assert/strict";
import test from "node:test";

import { CompareManager } from "../src/web/compare-manager.js";

test("stores and switches compare patches", () => {
  const manager = new CompareManager();
  const patchA = { name: "A", seed: 1 };
  const patchB = manager.switchTo("B", patchA, (slot, current) => ({ ...current, name: slot, seed: 2 }));

  assert.deepEqual(manager.getSlot("A"), patchA);
  assert.deepEqual(patchB, { name: "B", seed: 2 });
  assert.equal(manager.getActiveSlot(), "B");
});

test("restores existing compare patch", () => {
  const manager = new CompareManager();
  manager.saveActive({ name: "A", seed: 1 });
  manager.setSlot("B", { name: "B", seed: 2 });

  const b = manager.switchTo("B", { name: "A edited", seed: 3 }, () => ({ name: "unused" }));
  const a = manager.switchTo("A", b, () => ({ name: "unused" }));

  assert.deepEqual(b, { name: "B", seed: 2 });
  assert.deepEqual(a, { name: "A edited", seed: 3 });
});

