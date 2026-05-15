const fs = require('fs');
const path = require('path');

const TOKENS_DIR = path.join(__dirname, 'tokens');
const HTML_FILE  = path.join(__dirname, 'alcance-design-system.html');

const files = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith('.json'));

// tokenName -> { type, modes: { modeName: hex } }
const tokenMap = new Map();

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

    if (!tokenMap.has(key)) tokenMap.set(key, { type, modes: {} });
    if (hex) tokenMap.get(key).modes[modeName] = hex;
  }
}

const TOKEN_SEED = Array.from(tokenMap.entries()).map(([name, d]) => ({
  name,
  type: d.type,
  modes: d.modes,
}));

// Inject between TOKEN_SEED markers
let html = fs.readFileSync(HTML_FILE, 'utf8');
const START = '/* TOKEN_SEED:START */';
const END   = '/* TOKEN_SEED:END */';

const si = html.indexOf(START);
const ei = html.indexOf(END);

if (si === -1 || ei === -1) {
  console.error('TOKEN_SEED markers not found in HTML');
  process.exit(1);
}

const injection = `\n    const TOKEN_SEED = ${JSON.stringify(TOKEN_SEED, null, 6)};\n    `;
html = html.slice(0, si + START.length) + injection + html.slice(ei);

fs.writeFileSync(HTML_FILE, html, 'utf8');
console.log(`Processed ${TOKEN_SEED.length} tokens from ${files.length} file(s).`);
