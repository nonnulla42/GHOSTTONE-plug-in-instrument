export class CompareManager {
  constructor({ activeSlot = "A" } = {}) {
    this.activeSlot = activeSlot;
    this.slots = {};
  }

  saveActive(patch) {
    this.slots[this.activeSlot] = patch;
  }

  switchTo(slot, currentPatch, createFallbackPatch) {
    if (slot === this.activeSlot) return this.slots[slot] || currentPatch;

    this.saveActive(currentPatch);
    this.activeSlot = slot;

    if (!this.slots[slot]) {
      this.slots[slot] = createFallbackPatch(slot, currentPatch);
    }

    return this.slots[slot];
  }

  getActiveSlot() {
    return this.activeSlot;
  }

  getSlot(slot) {
    return this.slots[slot];
  }

  setSlot(slot, patch) {
    this.slots[slot] = patch;
  }
}
