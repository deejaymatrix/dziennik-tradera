#!/usr/bin/env node
// Prosty lokalny skan sekretów uruchamiany w CI i lokalnie przed commitem.
// Nie zastępuje dedykowanego narzędzia (np. gitleaks) uruchamianego w CI,
// ale wyłapuje najczęstsze pomyłki zanim trafią do repozytorium.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const IGNORED_FILES = new Set(['.env.example', 'scripts/scan-secrets.mjs']);

/** @type {{ name: string, pattern: RegExp }[]} */
const PATTERNS = [
  { name: 'Supabase service_role JWT', pattern: /"role"\s*:\s*"service_role"/ },
  { name: 'Klucz prywatny PEM', pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'AWS Access Key ID', pattern: /AKIA[0-9A-Z]{16}/ },
  {
    name: 'Ogólny sekret w przypisaniu',
    pattern: /(secret|password|api_?key|token)\s*[:=]\s*["'][A-Za-z0-9/+_=-]{20,}["']/i,
  },
  {
    name: 'Klucz Cloudflare R2 (32+ znaków hex jako sekret)',
    pattern: /r2_secret_access_key\s*[:=]\s*["'][a-f0-9]{32,}["']/i,
  },
];

function listTrackedFiles() {
  const output = execSync('git ls-files', { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

function main() {
  const files = listTrackedFiles();
  const findings = [];

  for (const file of files) {
    if (IGNORED_FILES.has(file)) continue;
    if (/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|eot|lock)$/i.test(file)) continue;

    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue; // plik binarny lub nieczytelny jako tekst - pomijamy
    }

    for (const { name, pattern } of PATTERNS) {
      if (pattern.test(content)) {
        findings.push(`${file}: możliwy sekret (${name})`);
      }
    }
  }

  if (findings.length > 0) {
    console.error('Wykryto potencjalne sekrety w repozytorium:');
    for (const finding of findings) {
      console.error(`  - ${finding}`);
    }
    console.error('\nUsuń sekret z pliku, unieważnij go u dostawcy i użyj menedżera sekretów.');
    process.exit(1);
  }

  console.log('Skan sekretów: brak wykrytych problemów.');
}

main();
