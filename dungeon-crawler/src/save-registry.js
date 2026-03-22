// ─────────────────────────────────────────────────────────────────────────────
//  SAVE REGISTRY — each module registers its own serialize/restore callbacks
// ─────────────────────────────────────────────────────────────────────────────

const _handlers = new Map();

export function registerSaveHandler(key, { serialize, restore }) {
  if (_handlers.has(key)) throw new Error(`Duplicate save handler: ${key}`);
  _handlers.set(key, { serialize, restore });
}

export function serializeAll() {
  const data = {};
  for (const [key, handler] of _handlers) {
    data[key] = handler.serialize();
  }
  return data;
}

export function restoreAll(saveData) {
  for (const [key, handler] of _handlers) {
    if (key in saveData) {
      handler.restore(saveData[key]);
    }
  }
}
