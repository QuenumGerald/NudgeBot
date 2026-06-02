if (typeof globalThis.CustomEvent === 'undefined') {
  class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type, options);
      this.detail = options.detail;
    }
  }
  globalThis.CustomEvent = CustomEvent;
}

// Dynamically import Vite CLI
import('./node_modules/vite/bin/vite.js');
