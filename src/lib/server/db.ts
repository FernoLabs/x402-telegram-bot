import { env } from '$env/dynamic/private';
import type { Database } from './database';
import { CloudflareKVDatabase } from './cloudflare-db';
import { createInMemoryDatabase } from './memory-db';

const accountId = env.CLOUDFLARE_KV_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID;
const namespaceId = env.CLOUDFLARE_KV_NAMESPACE_ID || env.CLOUDFLARE_NAMESPACE_ID;
const apiToken = env.CLOUDFLARE_API_TOKEN;

let database: Database;

if (accountId && namespaceId && apiToken) {
  database = new CloudflareKVDatabase({
    accountId,
    namespaceId,
    apiToken
  });
} else {
  database = createInMemoryDatabase();
}

async function seedDemoData(db: Database) {
  const groups = await db.getAllGroups();
  if (groups.length > 0) {
    return;
  }

  await db.createGroup({
    name: 'Crypto Developers',
    category: 'Technology',
    telegramId: '-1001234567890',
    minBid: 0.5,
    ownerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    active: true
  });

  await db.createGroup({
    name: 'Marketing Experts',
    category: 'Business',
    telegramId: '-1001234567891',
    minBid: 0.75,
    ownerAddress: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
    active: true
  });

  await db.createGroup({
    name: 'AI Researchers',
    category: 'Research',
    telegramId: '-1001234567892',
    minBid: 1,
    ownerAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    active: true
  });
}

if (env.SEED_DEMO_DATA !== 'false') {
  // Fire and forget to avoid blocking module evaluation
  seedDemoData(database).catch((error) => {
    console.error('Failed to seed demo data', error);
  });
}

export const db = database;
export const usingCloudflareKV = database instanceof CloudflareKVDatabase;
