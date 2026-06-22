import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('[patch-tokenx] Starting patch...');

// Helper to convert imports and exports to CJS
function transpileEsmToCjs(jsContent) {
  // Convert import { A as B, C } from "..." to const { A: B, C } = require("...")
  jsContent = jsContent.replace(/import\s*\{\s*([\w\s$,]+)\s*\}\s*from\s*['"]([^'"]+)['"];?/g, (match, clause, modulePath) => {
    const list = clause.split(',').map(item => item.trim()).filter(Boolean);
    const mapped = list.map(item => {
      if (item.includes(' as ')) {
        const [localName, aliasName] = item.split(/\s+as\s+/);
        return `${localName}: ${aliasName}`;
      }
      return item;
    });
    return `const { ${mapped.join(', ')} } = require("${modulePath}");`;
  });

  // Convert export { ... } to module.exports
  const exportRegex = /export\s*\{\s*([\w\s$,]+(?:as\s+[\w$]+)?[\w\s$,]*)\s*\}\s*;?\s*$/;
  const match = jsContent.match(exportRegex);
  if (match) {
    const exportList = match[1].split(',').map(item => item.trim()).filter(Boolean);
    const mapped = exportList.map(item => {
      if (item.includes(' as ')) {
        const [localName, exportName] = item.split(/\s+as\s+/);
        return `${exportName}: ${localName}`;
      }
      return `${item}: ${item}`;
    });
    jsContent = jsContent.replace(exportRegex, `module.exports = {\n  ${mapped.join(',\n  ')}\n};`);
  }
  return jsContent;
}

// 1. Patch tokenx
const tokenxPaths = [
  path.join(rootDir, 'node_modules', 'tokenx'),
  path.join(rootDir, 'backend', 'node_modules', 'tokenx'),
];

for (const tokenxPath of tokenxPaths) {
  if (!fs.existsSync(tokenxPath)) {
    console.log(`[patch-tokenx] Path not found: ${tokenxPath}`);
    continue;
  }

  const pkgJsonPath = path.join(tokenxPath, 'package.json');
  const mjsPath = path.join(tokenxPath, 'dist', 'index.mjs');
  const cjsPath = path.join(tokenxPath, 'dist', 'index.cjs');

  if (fs.existsSync(mjsPath)) {
    const mjsContent = fs.readFileSync(mjsPath, 'utf8');
    // Replace export statement with CommonJS exports
    const exportRegex = /export\s*\{\s*([\w\s,]+)\s*\}\s*;?\s*$/;
    if (exportRegex.test(mjsContent)) {
      const cjsContent = mjsContent.replace(exportRegex, 'module.exports = { $1 };');
      fs.writeFileSync(cjsPath, cjsContent, 'utf8');
      console.log(`[patch-tokenx] Created CJS build at: ${cjsPath}`);
    } else {
      console.error(`[patch-tokenx] Could not find export statement in ${mjsPath}`);
    }
  }

  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    // Update exports to include require
    pkg.exports = {
      ".": {
        "types": "./dist/index.d.mts",
        "require": "./dist/index.cjs",
        "default": "./dist/index.mjs"
      }
    };
    // Also set main for legacy tools
    pkg.main = "./dist/index.cjs";
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
    console.log(`[patch-tokenx] Updated package.json at: ${pkgJsonPath}`);
  }
}

// 2. Patch exit-hook
const hookPaths = [
  path.join(rootDir, 'node_modules', 'exit-hook'),
  path.join(rootDir, 'backend', 'node_modules', 'exit-hook'),
];

for (const hookPath of hookPaths) {
  if (!fs.existsSync(hookPath)) {
    console.log(`[patch-tokenx] Path not found: ${hookPath}`);
    continue;
  }

  const pkgJsonPath = path.join(hookPath, 'package.json');
  const jsPath = path.join(hookPath, 'index.js');
  const cjsPath = path.join(hookPath, 'index.cjs');

  if (fs.existsSync(jsPath)) {
    let jsContent = fs.readFileSync(jsPath, 'utf8');
    
    // Replace import process from 'node:process'; with const process = global.process;
    jsContent = jsContent.replace(/import\s+process\s+from\s+['"]node:process['"];?/, 'const process = global.process;');

    // Remove export default and export keywords
    jsContent = jsContent.replace(/export\s+default\s+function\s+exitHook/g, 'function exitHook');
    jsContent = jsContent.replace(/export\s+function\s+asyncExitHook/g, 'function asyncExitHook');
    jsContent = jsContent.replace(/export\s+function\s+gracefulExit/g, 'function gracefulExit');

    // Append CommonJS exports
    jsContent += '\nmodule.exports = exitHook;\nmodule.exports.default = exitHook;\nmodule.exports.asyncExitHook = asyncExitHook;\nmodule.exports.gracefulExit = gracefulExit;\n';

    fs.writeFileSync(cjsPath, jsContent, 'utf8');
    console.log(`[patch-tokenx] Created CJS build for exit-hook at: ${cjsPath}`);
  }

  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    pkg.exports = {
      ".": {
        "types": "./index.d.ts",
        "require": "./index.cjs",
        "default": "./index.js"
      }
    };
    pkg.main = "./index.cjs";
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
    console.log(`[patch-tokenx] Updated package.json for exit-hook at: ${pkgJsonPath}`);
  }
}

// 3. Patch @modelcontextprotocol/ext-apps
const extAppsPaths = [
  path.join(rootDir, 'node_modules', '@modelcontextprotocol', 'ext-apps'),
  path.join(rootDir, 'backend', 'node_modules', '@modelcontextprotocol', 'ext-apps'),
];

for (const extPath of extAppsPaths) {
  if (!fs.existsSync(extPath)) {
    console.log(`[patch-tokenx] Path not found: ${extPath}`);
    continue;
  }

  const pkgJsonPath = path.join(extPath, 'package.json');
  const jsPath = path.join(extPath, 'dist', 'src', 'app.js');
  const cjsPath = path.join(extPath, 'dist', 'src', 'app.cjs');

  if (fs.existsSync(jsPath)) {
    let jsContent = fs.readFileSync(jsPath, 'utf8');
    
    // Transpile
    jsContent = transpileEsmToCjs(jsContent);
    
    fs.writeFileSync(cjsPath, jsContent, 'utf8');
    console.log(`[patch-tokenx] Created CJS build for ext-apps at: ${cjsPath}`);
  }

  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    pkg.exports = {
      ".": {
        "types": "./dist/src/app.d.ts",
        "require": "./dist/src/app.cjs",
        "default": "./dist/src/app.js"
      },
      "./app-with-deps": {
        "types": "./dist/src/app.d.ts",
        "default": "./dist/src/app-with-deps.js"
      },
      "./react": {
        "types": "./dist/src/react/index.d.ts",
        "default": "./dist/src/react/index.js"
      },
      "./react-with-deps": {
        "types": "./dist/src/react/index.d.ts",
        "default": "./dist/src/react/react-with-deps.js"
      },
      "./app-bridge": {
        "types": "./dist/src/app-bridge.d.ts",
        "default": "./dist/src/app-bridge.js"
      },
      "./server": {
        "types": "./dist/src/server/index.d.ts",
        "default": "./dist/src/server/index.js"
      },
      "./schema.json": "./dist/src/generated/schema.json"
    };
    pkg.main = "./dist/src/app.cjs";
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
    console.log(`[patch-tokenx] Updated package.json for ext-apps at: ${pkgJsonPath}`);
  }
}
