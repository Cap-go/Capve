#!/usr/bin/env node
import { chromium } from '@playwright/test';
import Database from 'better-sqlite3';
import { readdirSync } from 'fs';
import { join } from 'path';

const mode = process.argv[2] || 'after';
const outputPath = `/tmp/${mode}.png`;

function findDB() {
  const dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
  const files = readdirSync(dir);
  const dbFile = files.find(f => f.endsWith('.sqlite'));
  if (!dbFile) throw new Error('No .sqlite file in ' + dir);
  return join(dir, dbFile);
}

// Deterministic pseudo-random generator (seeded)
class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  nextInt(max) {
    return Math.floor(this.next() * max);
  }
}

const rng = new SeededRandom(12345); // Fixed seed for reproducibility

function id(prefix) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = prefix + '_';
  for (let i = 0; i < 16; i++) {
    result += chars[rng.nextInt(chars.length)];
  }
  return result;
}

console.log('🌱 Seeding...');

const db = new Database(findDB());

// Step 1: Register user via API and get userId
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

// Clean up existing user
const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get('seed@example.com');
if (existingUser) {
  db.prepare('DELETE FROM conversions WHERE program_id IN (SELECT id FROM programs WHERE user_id = ?)').run(existingUser.id);
  db.prepare('DELETE FROM clicks WHERE program_id IN (SELECT id FROM programs WHERE user_id = ?)').run(existingUser.id);
  db.prepare('DELETE FROM affiliates WHERE program_id IN (SELECT id FROM programs WHERE user_id = ?)').run(existingUser.id);
  db.prepare('DELETE FROM programs WHERE user_id = ?').run(existingUser.id);
  db.prepare('DELETE FROM traffic_sources WHERE user_id = ?').run(existingUser.id);
  db.prepare('DELETE FROM account_onboarding WHERE account_id = ?').run(existingUser.id);
  db.prepare('DELETE FROM account_billing WHERE account_id = ?').run(existingUser.id);
  db.prepare('DELETE FROM auth_tokens WHERE user_id = ?').run(existingUser.id);
  db.prepare('DELETE FROM api_tokens WHERE user_id = ?').run(existingUser.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(existingUser.id);
}

// Register new user
const registerResp = await page.request.post('http://localhost:8787/api/auth/register', {
  data: { email: 'seed@example.com', password: 'password123', name: 'Test User' }
});

if (!registerResp.ok()) {
  console.error('Register failed:', await registerResp.text());
  await browser.close();
  process.exit(1);
}

// Get the new userId from DB
const user = db.prepare('SELECT id FROM users WHERE email = ?').get('seed@example.com');
if (!user) throw new Error('User not created');
const userId = user.id;

// Step 2: Create test data
const programId = id('prg');
const affiliateId = id('aff');
const sourceId = id('src');
const now = Date.now();

db.prepare(`INSERT INTO traffic_sources (id, user_id, name, cost_type, default_cost_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(sourceId, userId, 'CPC Source', 'cpc', 25, now);
db.prepare(`INSERT INTO programs (id, user_id, name, slug, api_key, destination_url, campaign_key, convert_secret, traffic_source_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(programId, userId, 'Test Campaign', 'test', id('key'), 'https://example.com', id('ck'), id('secret'), sourceId, now);
db.prepare(`INSERT INTO affiliates (id, program_id, name, code, created_at) VALUES (?, ?, ?, ?, ?)`).run(affiliateId, programId, 'Test Affiliate', 'test-aff', now);

console.log('✓ Campaign:', programId);

// Create clicks
const clicks = [];
for (let i = 0; i < 450; i++) {
  const clickId = id('clk');
  db.prepare(`INSERT INTO clicks (id, program_id, affiliate_id, ip, is_unique, is_bot, cost_cents, created_at) VALUES (?, ?, ?, ?, 1, 0, 25, ?)`).run(clickId, programId, affiliateId, '1.2.3.4', now);
  clicks.push(clickId);
}
console.log('✓', clicks.length, 'clicks');

// Registrations: ~30%
const regCount = Math.floor(clicks.length * 0.30);
let ftdCount = 0;
for (let i = 0; i < regCount; i++) {
  const convId = id('cnv');
  const clickId = clicks[i];
  const orderId = 'order_' + i;
  db.prepare(`INSERT INTO conversions (id, program_id, affiliate_id, click_id, order_id, amount_cents, currency, status, event, created_at) VALUES (?, ?, ?, ?, ?, 0, 'USD', 'approved', 'registration', ?)`).run(convId, programId, affiliateId, clickId, orderId, now);
}

// FTDs: ~40% of registrations
ftdCount = Math.floor(regCount * 0.40);
for (let i = 0; i < ftdCount; i++) {
  const convId = id('cnv');
  const clickId = clicks[regCount + i];
  const orderId = 'ftd_' + i;
  const amount = rng.nextInt(40000) + 10000; // $100-$500 (deterministic)
  db.prepare(`INSERT INTO conversions (id, program_id, affiliate_id, click_id, order_id, amount_cents, currency, status, event, created_at) VALUES (?, ?, ?, ?, ?, ?, 'USD', 'approved', 'ftd', ?)`).run(convId, programId, affiliateId, clickId, orderId, amount, now);
}

console.log('✓', regCount, 'regs,', ftdCount, 'FTDs');

// Backdate across 14 days (deterministic)
console.log('⏰ Backdating...');
const DAY_MS = 86400000;
const clickRows = db.prepare('SELECT id FROM clicks WHERE program_id = ? ORDER BY id').all(programId);
clickRows.forEach((row, i) => {
  const day = Math.floor(i / (clicks.length / 14));
  const dayTime = now - ((13 - day) * DAY_MS);
  const time = dayTime + rng.nextInt(DAY_MS);
  db.prepare('UPDATE clicks SET created_at = ? WHERE id = ?').run(time, row.id);
});

const convRows = db.prepare('SELECT id FROM conversions WHERE program_id = ? ORDER BY id').all(programId);
convRows.forEach((row, i) => {
  const day = Math.floor(i / (convRows.length / 14));
  const dayTime = now - ((13 - day) * DAY_MS);
  const time = dayTime + rng.nextInt(DAY_MS);
  db.prepare('UPDATE conversions SET created_at = ? WHERE id = ?').run(time, row.id);
});

console.log('✓ Backdated');
db.close();

// Step 3: Login and capture
console.log('\n📸 Capturing...');

const loginResp = await page.request.post('http://localhost:8787/api/auth/login', {
  data: { email: 'seed@example.com', password: 'password123' }
});

if (!loginResp.ok()) {
  console.error('Login failed:', await loginResp.text());
  await browser.close();
  process.exit(1);
}

await page.goto(`http://localhost:5173/app/campaigns/${programId}/performance`);
// Wait for page to settle
await page.waitForTimeout(5000);

// Take full page screenshot
await page.screenshot({ path: outputPath, fullPage: true });
await browser.close();

console.log('✓', outputPath);
console.log('\n✅ Done');
