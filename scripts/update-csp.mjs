import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const buildDir = path.join(rootDir, 'frontend', 'build');
const firebasePath = path.join(rootDir, 'firebase.json');
const runtimeStyleHashes = [
  // Runtime style elements emitted by the React/Vite client during route load.
  // Keep these explicit so new inline styles still fail scripts/smoke-csp.mjs.
  `'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='`,
  `'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='`,
  `'sha256-XtpGG9Aa3QThjWn0zzq1hXAAyAIVPexOKeK0SpGK9JY='`,
];

function hashToken(value) {
  const normalizedValue = value.replace(/\r\n?/g, '\n');
  const hash = createHash('sha256').update(normalizedValue, 'utf8').digest('base64');
  return `'sha256-${hash}'`;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function collectInlineHashes() {
  if (!existsSync(buildDir)) {
    throw new Error(`Build directory not found: ${buildDir}`);
  }

  const scriptValues = [];
  const styleValues = [];
  const htmlFiles = readdirSync(buildDir).filter((file) => file.endsWith('.html'));

  for (const file of htmlFiles) {
    const html = readFileSync(path.join(buildDir, file), 'utf8');

    for (const match of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (match[1].trim()) scriptValues.push(match[1]);
    }

    for (const match of html.matchAll(/\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const handler = match[1] ?? match[2] ?? '';
      if (handler.trim()) scriptValues.push(handler);
    }

    for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      if (match[1].trim()) styleValues.push(match[1]);
    }
  }

  return {
    scriptHashes: uniqueSorted(scriptValues.map(hashToken)),
    styleHashes: uniqueSorted([...styleValues.map(hashToken), ...runtimeStyleHashes]),
  };
}

function buildCsp({ scriptHashes, styleHashes }) {
  const directives = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `form-action 'self'`,
    `script-src 'self' 'report-sample' 'unsafe-hashes' ${scriptHashes.join(' ')}`.trim(),
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `style-src-elem 'self' https://fonts.googleapis.com ${styleHashes.join(' ')}`.trim(),
    // The React app still uses many runtime style attributes. Keep style
    // attributes allowed until those components are moved to CSS classes.
    `style-src-attr 'unsafe-inline'`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' data: blob: https://api.venpro.com.br`,
    [
      `connect-src 'self'`,
      `https://api.venpro.com.br`,
      `https://*.googleapis.com`,
      `https://*.firebaseio.com`,
      `wss://*.firebaseio.com`,
      `https://*.firebaseapp.com`,
      `https://brasilapi.com.br`,
      `https://receitaws.com.br`,
      `https://publica.cnpj.ws`,
    ].join(' '),
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join('; ');
}

function updateFirebaseConfig(csp) {
  const config = JSON.parse(readFileSync(firebasePath, 'utf8'));
  const globalHeader = config.hosting?.headers?.find((entry) => entry.source === '**');
  const cspHeader = globalHeader?.headers?.find((header) => header.key === 'Content-Security-Policy');

  if (!cspHeader) {
    throw new Error('Content-Security-Policy header not found in firebase.json');
  }

  cspHeader.value = csp;
  writeFileSync(firebasePath, `${JSON.stringify(config, null, 2)}\n`);
}

const hashes = collectInlineHashes();
const csp = buildCsp(hashes);
updateFirebaseConfig(csp);

console.log(
  `Updated firebase.json CSP (${hashes.scriptHashes.length} script hashes, ${hashes.styleHashes.length} style hashes).`,
);
