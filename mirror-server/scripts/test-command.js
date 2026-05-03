import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const maybeParams = process.argv[3]?.trim();
const params = maybeParams?.startsWith('{') ? JSON.parse(maybeParams) : {};
const speechArgs = Object.keys(params).length ? process.argv.slice(4) : process.argv.slice(3);

const port = Number(process.env.PORT || process.env.WS_PORT || 3001);
const payload = {
  intent: process.argv[2] || 'SHOW_WEATHER',
  params,
  speech: speechArgs.join(' ') || '',
};

const response = await fetch(`http://localhost:${port}/mirror-command`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Mirror-Secret': process.env.ELEVENLABS_TOOL_SECRET || '',
  },
  body: JSON.stringify(payload),
});

console.log('status:', response.status);
console.log(await response.text());
