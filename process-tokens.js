const fs   = require('fs');
const path = require('path');

const TOKENS_DIR    = path.join(__dirname, 'tokens');
const COMPILED_FILE = path.join(__dirname, 'compiled-version.json');
const HTML_FILE     = path.join(__dirname, 'alcance-design-system.html');

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

  for (const [key, value] of Object.entries(data)) {
    if (key === '$extensions') continue;
    if (typeof value !== 'object' || !value.$type) continue;

    const type = value.$type.toUpperCase();
    let hex = null;

    if (type === 'COLOR') {
      const v = value.$value;
      if (typeof v === 'string') {
        hex = v;
      } else if (v?.hex) {
        hex = v.hex;
      } else if (Array.isArray(v?.components)) {
        const [r, g, b] = v.components.map(c => Math.round(c * 255));
        hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
      }
    }

    if (!compiled[key]) compiled[key] = { type, modes: {} };
    if (hex) compiled[key].modes[modeName] = hex;
  }

  console.log(`Merged: ${file} (mode: ${modeName})`);
}

// Build TOKEN_SEED from compiled map
const TOKEN_SEED = Object.entries(compiled).map(([name, d]) => ({
  name,
  type: d.type,
  modes: d.modes,
}));

// Save compiled-version.json
fs.writeFileSync(COMPILED_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), tokens: TOKEN_SEED }, null, 2), 'utf8');
console.log(`compiled-version.json: ${TOKEN_SEED.length} tokens`);

// Inject into HTML between TOKEN_SEED markers
let html = fs.readFileSync(HTML_FILE, 'utf8');
const START = '/* TOKEN_SEED:START */';
const END   = '/* TOKEN_SEED:END */';
const si    = html.indexOf(START);
const ei    = html.indexOf(END);

if (si === -1 || ei === -1) {
  console.error('TOKEN_SEED markers not found in HTML');
  process.exit(1);
}

html = html.slice(0, si + START.length) +
  `\n    const TOKEN_SEED = ${JSON.stringify(TOKEN_SEED, null, 6)};\n    ` +
  html.slice(ei);

fs.writeFileSync(HTML_FILE, html, 'utf8');
console.log(`alcance-design-system.html atualizado.`);
