(function (global) {
  'use strict';
  const key = 'c-micro-lab-v1';

  function open(getStorage, restore) {
    let available = true;

    return {
      get available() { return available; },
      load() {
        try {
          const storage = getStorage();
          storage.setItem(`${key}-probe`, '1');
          storage.removeItem(`${key}-probe`);
          const saved = storage.getItem(key);
          return saved === null ? null : restore(JSON.parse(saved));
        } catch {
          available = false;
          return null;
        }
      },
      save(state) {
        if (available) this.replace(state);
        return available;
      },
      replace(state) {
        try {
          getStorage().setItem(key, JSON.stringify(state));
          available = true;
        } catch {
          available = false;
        }
        return available;
      }
    };
  }

  global.CLabStorage = { open };
})(typeof window === 'undefined' ? globalThis : window);
