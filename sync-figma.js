const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const TOKEN = process.env.FIGMA_TOKEN;
if (!TOKEN) {
  console.error('Erro: variável FIGMA_TOKEN não definida.');
  console.error('Use: FIGMA_TOKEN=seu_token node sync-figma.js');
  process.exit(1);
}

const FILE_KEY = 'tFefkV8gBYqXdOyYycWjaW';
const COLOR_IDS = '1085:714,1085:720,1085:728';
const TYPO_ID = '1085:735';

function toHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

function findCards(node, group, out) {
  if (node.name === '.ColorCard') {
    let color = null, label = null;
    for (const ch of node.children ?? []) {
      if (ch.name === 'Color' && ch.fills?.[0]?.type === 'SOLID') {
        const c = ch.fills[0].color;
        color = toHex(c.r, c.g, c.b);
      }
      if (ch.name === 'Info') {
        for (const sub of ch.children ?? [])
          if (sub.name === 'color-name') label = sub.characters;
      }
    }
    if (color) out.push({ group, hex: color, label: label ?? '' });
    return;
  }
  for (const ch of node.children ?? []) findCards(ch, group, out);
}

function findTypo(node, seen, out) {
  if (node.type === 'TEXT' && node.style?.fontSize && node.characters?.trim()) {
    const { fontFamily: family, fontSize: size, fontWeight: weight } = node.style;
    const key = `${size}-${weight}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ sample: node.characters.trim().slice(0, 40), family, size, weight });
    }
  }
  for (const ch of node.children ?? []) findTypo(ch, seen, out);
}

(async () => {
  console.log('Buscando dados da API Figma...');

  const headers = { 'X-Figma-Token': TOKEN };
  const ids = [...COLOR_IDS.split(','), TYPO_ID].map(encodeURIComponent).join(',');

  // Uma única chamada — /nodes já retorna name e lastModified do arquivo
  const res      = await fetch(`https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${ids}&depth=6`, { headers });
  const nodesData = await res.json();

  if (nodesData.err)    { console.error('Erro:', nodesData.err);          process.exit(1); }
  if (!nodesData.nodes) { console.error('Resposta inesperada da API');    process.exit(1); }

  const colors = [];
  for (const id of COLOR_IDS.split(',')) {
    const doc = nodesData.nodes[id]?.document;
    if (doc) findCards(doc, doc.name, colors);
  }

  const typoRaw = [];
  const typoDoc = nodesData.nodes[TYPO_ID]?.document;
  if (typoDoc) findTypo(typoDoc, new Set(), typoRaw);

  const typoSeen = new Set();
  const typo = typoRaw
    .sort((a, b) => b.size - a.size)
    .filter(t => {
      const k = `${t.size}-${t.weight}`;
      if (typoSeen.has(k)) return false;
      typoSeen.add(k);
      return true;
    })
    .slice(0, 8);

  const data = {
    syncedAt: new Date().toISOString(),
    file: {
      name: nodesData.name,
      lastModified: nodesData.lastModified,
      pages: ['🚀 Sobre', '💻 Projeto', '🎨 Style Guide'],
    },
    colors,
    typo,
  };

  const htmlPath = join(__dirname, 'alcance-design-system.html');
  let html = readFileSync(htmlPath, 'utf8');

  if (!html.includes('/* FIGMA_SEED:START */')) {
    console.error('Marcadores FIGMA_SEED:START/END não encontrados no HTML.');
    process.exit(1);
  }

  const newBlock = `/* FIGMA_SEED:START */
    const FIGMA_SEED = ${JSON.stringify(data, null, 6)};
    /* FIGMA_SEED:END */`;

  html = html.replace(/\/\* FIGMA_SEED:START \*\/[\s\S]*?\/\* FIGMA_SEED:END \*\//, newBlock);
  writeFileSync(htmlPath, html, 'utf8');

  console.log(`✓ ${colors.length} cores · ${typo.length} estilos de texto`);
  console.log(`  Arquivo    : ${data.file.name}`);
  console.log(`  Modificado : ${data.file.lastModified}`);
  console.log(`  Sincronizado: ${data.syncedAt}`);
})();

