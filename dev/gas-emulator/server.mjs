#!/usr/bin/env node
/**
 * Server emulator Apps Script untuk pengembangan lokal.
 *
 *   npm run dev:api        (default http://localhost:8787/exec)
 *
 * Membaca APPS_SCRIPT_API_KEY dari .env.local agar sama dengan yang dipakai Next.js.
 * Data disimpan di memori dan kembali ke data contoh setiap server dijalankan ulang.
 *
 * Opsi env: EMULATOR_PORT (8787), EMULATOR_LATENCY_MS (0), EMULATOR_NO_USAK_CONFIG=1
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { projectRoot } from './runtime.mjs';
import { createSeededRuntime, DEV_FALLBACK_SECRET } from './seed.mjs';

function readEnvFile(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // .env.local opsional
  }
  return out;
}

const env = { ...readEnvFile(path.join(projectRoot, '.env.local')), ...process.env };
const secret = env.APPS_SCRIPT_API_KEY || DEV_FALLBACK_SECRET;
const port = Number(env.EMULATOR_PORT || 8787);
const latency = Number(env.EMULATOR_LATENCY_MS || 0);

const { rt, importLines } = createSeededRuntime({ secret, withUsakConfig: env.EMULATOR_NO_USAK_CONFIG !== '1', scopeDemo: true });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (obj) => {
    const body = JSON.stringify(obj);
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(body);
    }, latency);
  };
  if (url.pathname !== '/exec') {
    res.writeHead(404).end('Not found');
    return;
  }
  if (req.method === 'GET') {
    send(rt.get());
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405).end();
    return;
  }
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 200000) req.destroy();
  });
  req.on('end', () => {
    const started = Date.now();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      send({ ok: false, error: { code: 'BAD_REQUEST', message: 'Body request bukan JSON yang valid.' } });
      return;
    }
    const result = rt.request(body);
    // Hanya nama aksi & status yang dicatat — tanpa payload, token, atau kata sandi.
    console.log(`[emulator] ${body.action} -> ${result.ok ? 'ok' : result.error.code} (${Date.now() - started} ms)`);
    send(result);
  });
});

server.listen(port, () => {
  console.log(`Emulator Apps Script berjalan di http://localhost:${port}/exec`);
  console.log(importLines.map((l) => '  ' + l).join('\n'));
  if (secret === DEV_FALLBACK_SECRET) {
    console.log('  (APPS_SCRIPT_API_KEY tidak ditemukan di .env.local — memakai secret dev bawaan)');
  }
});
