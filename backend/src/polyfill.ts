import nodeCrypto from "node:crypto";

const mergedCrypto: any = {};

for (const key of Reflect.ownKeys(nodeCrypto)) {
  const desc = Object.getOwnPropertyDescriptor(nodeCrypto, key);
  if (desc) Object.defineProperty(mergedCrypto, key, desc);
}

if (nodeCrypto.webcrypto) {
  for (const key of Reflect.ownKeys(nodeCrypto.webcrypto)) {
    const desc = Object.getOwnPropertyDescriptor(nodeCrypto.webcrypto, key);
    if (desc) Object.defineProperty(mergedCrypto, key, desc);
  }
}

try {
  Object.defineProperty(globalThis, "crypto", {
    value: mergedCrypto,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(global, "crypto", {
    value: mergedCrypto,
    writable: true,
    configurable: true,
  });
} catch (e) {
  (globalThis as any).crypto = mergedCrypto;
  (global as any).crypto = mergedCrypto;
}

export const isPolyfilled = true;
