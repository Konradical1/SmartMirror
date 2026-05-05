#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY not set in .env');
  process.exit(1);
}

const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
const url = `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`;

const response = await fetch(url);
if (!response.ok) {
  const text = await response.text().catch(() => '');
  console.error(`Gemini ListModels failed: ${response.status} ${text || response.statusText}`);
  process.exit(1);
}

const data = await response.json();
const models = data.models || [];
if (!models.length) {
  console.log('No models returned.');
  process.exit(0);
}

for (const model of models) {
  const methods = (model.supportedGenerationMethods || []).join(',');
  console.log(`${model.name}${methods ? ` | ${methods}` : ''}`);
}
