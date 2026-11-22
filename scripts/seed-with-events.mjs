#!/usr/bin/env node
import Database from 'better-sqlite3';
import { chromium } from '@playwright/test';
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

function id(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 18);
}

console.log('🌱 Seeding...');

const db = new Database(findDB());

// Find existing user first
const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get('seed@example.com');

// Clean up old test data for this user including the user itself
if (existingUser) {
  db.prepare('DELETE FROM conversions WHERE program_id IN (SELECT id FROM programs WHERE user_id = ?)').run(existingUser.id);
  db.prepare('DELETE FROM clicks WHERE program_id IN (SELECT id FROM programs WHERE user_id = ?)').run(existingUser.id);
  db.prepare('DELETE FROM affiliates WHERE program_id IN (SELECT id FROM programs WHERE user_id = ?)').run(existingUser.id);
  db.prepare('DELETE FROM programs WHERE user_id = ?').run(existingUser.id);
  db.prepare('DELETE FROM traffic_sources WHERE user_id = ?').run(existingUser.id);
  db.prepare('DELETE FROM account_onboarding WHERE account_id = ?').run(existingUser.id);
  db.prepare('DELETE FROM account_billing WHERE account_id = ?').run(existingUser.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(existingUser.id);
}

// Create user, program, affiliate, traffic source
let userId = id('usr');
const programId = id('prg');
const affiliateId = id('aff');
const sourceId = id('src');
const now = Date.now();

// User will be created by API register call during capture
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
let regIds = [];
for (let i = 0; i < regCount; i++) {
  const convId = id('cnv');
  const clickId = clicks[i];
  const orderId = 'order_' + i;
  db.prepare(`INSERT INTO conversions (id, program_id, affiliate_id, click_id, order_id, amount_cents, currency, status, event, created_at) VALUES (?, ?, ?, ?, ?, 0, 'USD', 'approved', 'registration', ?)`).run(convId, programId, affiliateId, clickId, orderId, now);
  regIds.push(convId);
}

// FTDs: ~40% of registrations
ftdCount = Math.floor(regCount * 0.40);
for (let i = 0; i < ftdCount; i++) {
  const convId = id('cnv');
  const clickId = clicks[regCount + i];
  const orderId = 'ftd_' + i;
  const amount = Math.floor(Math.random() * 50000) + 10000; // $100-$500
  db.prepare(`INSERT INTO conversions (id, program_id, affiliate_id, click_id, order_id, amount_cents, currency, status, event, created_at) VALUES (?, ?, ?, ?, ?, ?, 'USD', 'approved', 'ftd', ?)`).run(convId, programId, affiliateId, clickId, orderId, amount, now);
}

console.log('✓', regCount, 'regs,', ftdCount, 'FTDs');

// Backdate across 14 days
console.log('⏰ Backdating...');
const DAY_MS = 86400000;
const clickRows = db.prepare('SELECT id FROM clicks WHERE program_id = ? ORDER BY id').all(programId);
clickRows.forEach((row, i) => {
  const day = Math.floor(i / (clicks.length / 14));
  const dayTime = now - ((13 - day) * DAY_MS);
  const time = dayTime + Math.floor(Math.random() * DAY_MS);
  db.prepare('UPDATE clicks SET created_at = ? WHERE id = ?').run(time, row.id);
});

const convRows = db.prepare('SELECT id FROM conversions WHERE program_id = ? ORDER BY id').all(programId);
convRows.forEach((row, i) => {
  const day = Math.floor(i / (convRows.length / 14));
  const dayTime = now - ((13 - day) * DAY_MS);
  const time = dayTime + Math.floor(Math.random() * DAY_MS);
  db.prepare('UPDATE conversions SET created_at = ? WHERE id = ?').run(time, row.id);
});

console.log('✓ Backdated');
db.close();

// Capture screenshot
console.log('\n📸 Capturing...');
async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  
  // Try to register (will fail if user exists, that's ok)
  const registerResp = await page.request.post('http://localhost:8787/api/auth/register', {
    data: { email: 'seed@example.com', password: 'password123', name: 'Test User' }
  });
  
  console.log('Register:', registerResp.status(), registerResp.ok() ? 'OK' : await registerResp.text());
  
  // Login via API to get session cookie
  const loginResp = await page.request.post('http://localhost:8787/api/auth/login', {
    data: { email: 'seed@example.com', password: 'password123' }
  });
  
  if (!loginResp.ok()) {
    console.error('Login failed:', loginResp.status(), await loginResp.text());
    await browser.close();
    throw new Error('Login failed');
  }
  
  // Go to performance page
  await page.goto(`http://localhost:5173/app/campaigns/${programId}/performance`);
  await page.waitForSelector('svg', { timeout: 30000 });
  await page.waitForTimeout(2000);
  
  const chart = page.locator('svg').first();
  await chart.screenshot({ path: outputPath });
  await browser.close();
}

await capture();
console.log('✓', outputPath);
console.log('\n✅ Done');
