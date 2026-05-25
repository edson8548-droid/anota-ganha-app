import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const buildDir = path.join(rootDir, 'frontend', 'build');
const firebaseConfig = JSON.parse(readFileSync(path.join(rootDir, 'firebase.json'), 'utf8'));

const globalHeaders = Object.fromEntries(
  firebaseConfig.hosting.headers
    .find((entry) => entry.source === '**')
    .headers
    .map((header) => [header.key, header.value]),
);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

function resolveBuildPath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  if (cleanPath === '/') return { redirect: '/home.html' };

  const requested = path.normalize(cleanPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(buildDir, requested);
  if (existsSync(filePath)) return { filePath };

  return { filePath: path.join(buildDir, 'index.html') };
}

const server = createServer((req, res) => {
  const { redirect, filePath } = resolveBuildPath(req.url || '/');
  if (redirect) {
    res.writeHead(302, { Location: redirect, ...globalHeaders });
    res.end();
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    ...globalHeaders,
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
  });
  res.end(readFileSync(filePath));
});

const port = 5179;
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

try {
  const require = createRequire(path.join(rootDir, 'frontend', 'package.json'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const violations = [];
  const styleDiagnostics = [];
  let currentRoute = 'startup';

  page.on('console', (message) => {
    const text = message.text();
    if (/content security policy|refused to/i.test(text)) {
      violations.push(`${currentRoute} ${message.type()}: ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    if (/content security policy|refused to/i.test(error.message)) {
      violations.push(`pageerror: ${error.message}`);
    }
  });

  for (const route of ['/home.html', '/register', '/terms.html', '/privacy-policy.html', '/delete-account.html']) {
    currentRoute = route;
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'networkidle' });
    const routeStyleHashes = await page.$$eval('style', (styles) =>
      styles.map((style) => style.textContent || ''),
    );
    for (const value of routeStyleHashes) {
      const hash = createHash('sha256').update(value, 'utf8').digest('base64');
      styleDiagnostics.push(`${route} style sha256-${hash} len=${value.length}`);
    }
  }

  currentRoute = '/home.html interaction';
  await page.goto(`http://127.0.0.1:${port}/home.html`, { waitUntil: 'networkidle' });
  await page.click('.faq-q');
  await page.click('.nav-cta');
  await page.waitForURL(`http://127.0.0.1:${port}/register`, { timeout: 5000 });

  await browser.close();

  if (violations.length) {
    throw new Error(`CSP violations found:\n${violations.join('\n')}\n\nStyle diagnostics:\n${styleDiagnostics.join('\n')}`);
  }

  console.log('CSP smoke test passed.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
