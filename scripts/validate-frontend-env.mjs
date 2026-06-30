import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const frontendDir = path.join(rootDir, 'frontend');
const mode = process.env.NODE_ENV || 'production';

const envFiles = [
  '.env',
  '.env.local',
  `.env.${mode}`,
  `.env.${mode}.local`,
];

const envValues = { ...process.env };

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    envValues[key] = value;
  }
}

for (const file of envFiles) {
  parseEnvFile(path.join(frontendDir, file));
}

const requiredVars = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID',
  'REACT_APP_BACKEND_URL',
];

const missingVars = requiredVars.filter((key) => !String(envValues[key] || '').trim());

if (missingVars.length > 0) {
  console.error(
    [
      'Frontend build blocked: missing required environment variables.',
      `Missing: ${missingVars.join(', ')}`,
      'Load frontend/.env, frontend/.env.production or equivalent CI environment before running npm run build.',
    ].join('\n'),
  );
  process.exit(1);
}

console.log('Frontend environment validation passed.');
