import { vi } from 'vitest';

globalThis.jest = vi;

if (!window.localStorage?.clear) {
  const store = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key),
      clear: () => store.clear(),
    },
  });
}
