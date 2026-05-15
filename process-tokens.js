const fs   = require('fs');
const path = require('path');

const TOKENS_DIR    = path.join(__dirname, 'tokens', 'files');
const COMPILED_FILE = path.join(__dirname, 'tokens', 'compiled-version.json');
const COMPILED_JS   = path.join(__dirname, 'tokens', 'compiled-version.js');

// Load existing compiled version as baseline
let compiled = {};
if (fs.existsSync(COMPILED_FILE)) {
  try {
    const existing = JSON.parse(fs.readFileSync(COMPILED_FILE, 'utf8'));
    for (const t of existing.tokens || []) {
      compiled[t.name] = { type: t.type, modes: { ...t.modes } };
    }
    console.log(`Loaded ${Object.keys(compiled).length} tokens from compiled-version.json`);
  } catch {
    console.warn('compiled-version.json inválido — iniciando do zero');
  }
}

// Recursively extract tokens from nested Figma JSON
function extractTokens(obj, prefix, modeName, out) {
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$extensions') continue;
    if (typeof value !== 'object' || value === null) continue;

    const name = prefix ? `${prefix}/${key}` : key;

    if (value.$type) {
      const type  = value.$type.toUpperCase();
      let   token = null;

      if (type === 'COLOR') {
        const v = value.$value;
        if (typeof v === 'string') {
          token = v;
        } else if (v?.hex) {
          token = v.hex;
        } else if (Array.isArray(v?.components)) {
          const [r, g, b] = v.components.map(c => Math.round(c * 255));
          token = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        }
      } else if (type === 'NUMBER') {
        token = value.$value;
      } else if (type === 'STRING') {
        token = value.$value;
      }

      if (token !== null && token !== undefined) {
        if (!out[name]) out[name] = { type, modes: {} };
        out[name].modes[modeName] = token;
      }
    } else {
      // Group — recurse deeper
      extractTokens(value, name, modeName, out);
    }
  }
}

// Merge tokens from each file in tokens/
const files = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith('.json'));

for (const file of files) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(TOKENS_DIR, file), 'utf8'));
  } catch {
    console.warn(`Skipping ${file}: invalid JSON`);
    continue;
  }

  const modeName =
    data.$extensions?.['com.figma.modeName'] ||
    file.replace(/\.tokens\.json$/, '').replace(/\.json$/, '');

  extractTokens(data, '', modeName, compiled);
  console.log(`Merged: ${file} (mode: ${modeName})`);
}

// Build TOKEN_SEED
const TOKEN_SEED = Object.entries(compiled).map(([name, d]) => ({
  name,
  type: d.type,
  modes: d.modes,
}));

// Save compiled-version.json
fs.writeFileSync(
  COMPILED_FILE,
  JSON.stringify({ updatedAt: new Date().toISOString(), tokens: TOKEN_SEED }, null, 2),
  'utf8'
);
console.log(`compiled-version.json: ${TOKEN_SEED.length} tokens`);

// Save compiled-version.js (loaded by alcance-design-system.html via <script src>)
fs.writeFileSync(
  COMPILED_JS,
  `const TOKEN_SEED = ${JSON.stringify(TOKEN_SEED, null, 2)};\n`,
  'utf8'
);
console.log(`compiled-version.js: ${TOKEN_SEED.length} tokens`);
