/**
 * test/setup.js
 *
 * Global Vitest setup file — runs in each test worker before any test file.
 * Referenced via `test.setupFiles` in vitest.config.js.
 *
 * PURPOSE: src/equipment.js (and other source modules) call
 * document.getElementById(...).addEventListener(...) at module-load time.
 * Under jsdom the elements don't exist unless pre-created, causing
 * "Cannot read properties of null".
 *
 * SOLUTION: Intercept document.getElementById so that it auto-creates a
 * placeholder <div> when a queried element doesn't exist. The element is
 * inserted into document.body so subsequent DOM queries within the same module
 * (e.g. querySelector inside handlers) also resolve. This is safe for our tests
 * because we never actually trigger those event handlers.
 */

const _originalGetById = document.getElementById.bind(document);

document.getElementById = function (id) {
  const existing = _originalGetById(id);
  if (existing) return existing;

  // Auto-create a stub element so addEventListener calls don't throw.
  const el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
  return el;
};
