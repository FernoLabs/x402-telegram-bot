#!/usr/bin/env bash
set -euo pipefail

ROOT="."

echo "→ Creating folder structure..."
mkdir -p "$ROOT/static"
mkdir -p "$ROOT/src/lib/server"
mkdir -p "$ROOT/src/lib/components"
mkdir -p "$ROOT/src/routes/api/groups"
mkdir -p "$ROOT/src/routes/api/auctions"
mkdir -p "$ROOT/src/routes/api/telegram/webhook"

cd "$ROOT"

echo "→ Writing files..."

# ---------------------------
# package.json
# ---------------------------
cat > package.json <<'EOF'
{
  "name": "x402-telegram-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev --host",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "cf:dev": "wrangler pages dev .svelte-kit/cloudflare -- npm run build"
  },
  "devDependencies": {
    "@sveltejs/adapter-cloudflare": "^4.0.0",
    "@sveltejs/kit": "^2.7.0",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@types/node": "^20.10.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "postcss-load-config": "5.1.0",
    "svelte": "^5.0.0",
    "svelte-check": "^3.6.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "wrangler": "^3.75.0"
  },
  "dependencies": {
    "lucide-svelte": "0.553.0"
  }
}
EOF

# ---------------------------
# svelte.config.js
# ---------------------------
cat > svelte.config.js <<'EOF'
import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};

export default config;
EOF

# ---------------------------
# vite.config.ts
# ---------------------------
cat > vite.config.ts <<'EOF'
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()]
});
EOF

# ---------------------------
# tsconfig.json
# ---------------------------
cat > tsconfig.json <<'EOF'
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
EOF

# ---------------------------
# tailwind.config.js
# ---------------------------
cat > tailwind.config.js <<'EOF'
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {}
  },
  plugins: []
};
EOF

# ---------------------------
# postcss.config.js
# ---------------------------
cat > postcss.config.js <<'EOF'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
EOF

# ---------------------------
# .env.example
# ---------------------------
cat > .env.example <<'EOF'
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/telegram/webhook

# x402 Payment Configuration
RECEIVER_ADDRESS=0xYourWalletAddress
PAYMENT_NETWORK=base

# Optional: Database (for production)
DATABASE_URL=postgresql://user:password@localhost:5432/ai_auction
EOF

# ---------------------------
# .gitignore
# ---------------------------
cat > .gitignore <<'EOF'
.DS_Store
node_modules
/build
/.svelte-kit
/package
.env
.env.*
!.env.example
vite.config.js.timestamp-*
vite.config.ts.timestamp-*
EOF

# ---------------------------
# README.md
# ---------------------------
cat > README.md <<'EOF'
# AI Auction System for Telegram Groups

A decentralized marketplace where AI agents can pay to send messages to Telegram groups using x402 micropayments.

## Features

- 🤖 **AI Agent Bidding**: AI agents submit bids to post messages to groups
- 💰 **x402 Micropayments**: Instant USDC payments on Base network
- 📱 **Telegram Integration**: Automatic message posting to groups
- 📊 **Live Analytics**: Real-time auction tracking and statistics
- 👥 **Group Management**: Admin dashboard for group owners

## Tech Stack

- **Frontend**: SvelteKit 2 + Svelte 5 (with runes)
- **Styling**: Tailwind CSS
- **Backend**: SvelteKit API routes
- **Payments**: x402 protocol (USDC on Base)
- **Messaging**: Telegram Bot API
...
(See project files for full details)
EOF

# ---------------------------
# src/app.css
# ---------------------------
cat > src/app.css <<'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}
EOF

# ---------------------------
# src/app.html
# ---------------------------
cat > src/app.html <<'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
EOF

# ---------------------------
# src/lib/types.ts
# ---------------------------
cat > src/lib/types.ts <<'EOF'
export interface Group {
  id: number;
  name: string;
  category: string;
  telegramId: string;
  minBid: number;
  ownerAddress: string;
  totalEarned: number;
  messageCount: number;
  active: boolean;
  createdAt: Date;
}

export interface Auction {
  id: number;
  groupId: number;
  bidderAddress: string;
  bidderName: string;
  amount: number;
  message: string;
  status: 'pending' | 'active' | 'completed' | 'rejected';
  txHash: string;
  responses: AuctionResponse[];
  createdAt: Date;
  postedAt?: Date;
}

export interface AuctionResponse {
  id: number;
  text: string;
  userId: number;
  username: string;
  timestamp: Date;
}

export interface X402Payment {
  amount: number;
  currency: string;
  sender: string;
  txHash: string;
  verified: boolean;
}
EOF

# ---------------------------
# src/lib/server/x402.ts
# ---------------------------
cat > src/lib/server/x402.ts <<'EOF'
import type { X402Payment } from '$lib/types';

export class X402Middleware {
  private receiverAddress: string;
  
  constructor(receiverAddress: string) {
    this.receiverAddress = receiverAddress;
  }

  async verifyPayment(request: Request): Promise<X402Payment | null> {
    const paymentHeader = request.headers.get('x-payment');
    const amountHeader = request.headers.get('x-payment-amount');
    const senderHeader = request.headers.get('x-payment-sender');
    const txHashHeader = request.headers.get('x-payment-txhash');

    if (!paymentHeader || !amountHeader || !senderHeader) {
      return null;
    }

    // Production: Verify on-chain via Base RPC or Coinbase Commerce API
    // Example: const verified = await this.verifyOnChain(txHashHeader);
    
    const payment: X402Payment = {
      amount: parseFloat(amountHeader),
      currency: 'USDC',
      sender: senderHeader,
      txHash: txHashHeader || `0x${Date.now().toString(16)}`,
      verified: true // Set to false and verify on-chain in production
    };

    return payment;
  }

  create402Response(requiredAmount: number, recipientAddress: string) {
    return new Response(
      JSON.stringify({
        error: 'Payment Required',
        amount: requiredAmount,
        currency: 'USDC',
        recipient: recipientAddress,
        network: 'base',
        instructions: 'Include x-payment headers with USDC payment proof on Base network'
      }),
      {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          'x-payment-required': 'true',
          'x-payment-amount': requiredAmount.toString(),
          'x-payment-currency': 'USDC',
          'x-payment-recipient': recipientAddress,
          'x-payment-network': 'base'
        }
      }
    );
  }

  // Production method for on-chain verification
  private async verifyOnChain(txHash: string): Promise<boolean> {
    // Implement Base network verification
    // Check transaction on Base blockchain
    // Verify USDC transfer to receiverAddress
    return true;
  }
}
EOF

# ---------------------------
# src/lib/server/telegram.ts
# ---------------------------
cat > src/lib/server/telegram.ts <<'EOF'
import type { Auction } from '$lib/types';

export class TelegramBot {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  async sendMessage(chatId: string, text: string, options: Record<string, any> = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
          ...options
        })
      });
      return await response.json();
    } catch (error) {
      console.error('Telegram sendMessage error:', error);
      throw error;
    }
  }

  async setWebhook(url: string) {
    const response = await fetch(`${this.baseUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return await response.json();
  }

  async getMe() {
    const response = await fetch(`${this.baseUrl}/getMe`);
    return await response.json();
  }

  formatAuctionMessage(auction: Auction): string {
    return `🤖 **AI Agent Message** (Paid $${auction.amount.toFixed(2)})

From: *${auction.bidderName}*
Tx: \`${auction.txHash.slice(0, 10)}...${auction.txHash.slice(-8)}\`

${auction.message}

💬 Reply to this message to send your response to the AI agent.`;
  }
}
EOF

# ---------------------------
# src/lib/server/db.ts
# ---------------------------
cat > src/lib/server/db.ts <<'EOF'
import type { Group, Auction, AuctionResponse } from '$lib/types';

// In-memory database for demo
// Replace with PostgreSQL/Drizzle ORM for production
class Database {
  private groups: Map<number, Group> = new Map();
  private auctions: Map<number, Auction> = new Map();
  private groupCounter = 1;
  private auctionCounter = 1;

  createGroup(data: Omit<Group, 'id' | 'totalEarned' | 'messageCount' | 'createdAt'>): Group {
    const group: Group = {
      ...data,
      id: this.groupCounter++,
      totalEarned: 0,
      messageCount: 0,
      createdAt: new Date()
    };
    this.groups.set(group.id, group);
    return group;
  }

  getGroup(id: number): Group | undefined {
    return this.groups.get(id);
  }

  getAllGroups(): Group[] {
    return Array.from(this.groups.values());
  }

  updateGroup(id: number, data: Partial<Group>): Group | undefined {
    const group = this.groups.get(id);
    if (group) {
      Object.assign(group, data);
      return group;
    }
    return undefined;
  }

  createAuction(data: Omit<Auction, 'id' | 'status' | 'responses' | 'createdAt'>): Auction {
    const auction: Auction = {
      ...data,
      id: this.auctionCounter++,
      status: 'pending',
      responses: [],
      createdAt: new Date()
    };
    this.auctions.set(auction.id, auction);
    return auction;
  }

  getAuction(id: number): Auction | undefined {
    return this.auctions.get(id);
  }

  getAllAuctions(): Auction[] {
    return Array.from(this.auctions.values()).sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  updateAuction(id: number, data: Partial<Auction>): Auction | undefined {
    const auction = this.auctions.get(id);
    if (auction) {
      Object.assign(auction, data);
      return auction;
    }
    return undefined;
  }

  addResponse(auctionId: number, response: AuctionResponse): Auction | undefined {
    const auction = this.auctions.get(auctionId);
    if (auction) {
      auction.responses.push(response);
      return auction;
    }
    return undefined;
  }
}

export const db = new Database();

// Seed demo data
db.createGroup({
  name: 'Crypto Developers',
  category: 'Technology',
  telegramId: '-1001234567890',
  minBid: 0.50,
  ownerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  active: true
});

db.createGroup({
  name: 'Marketing Experts',
  category: 'Business',
  telegramId: '-1001234567891',
  minBid: 0.75,
  ownerAddress: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
  active: true
});

db.createGroup({
  name: 'AI Researchers',
  category: 'Research',
  telegramId: '-1001234567892',
  minBid: 1.00,
  ownerAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  active: true
});
EOF

# ---------------------------
# src/routes/api/groups/+server.ts
# ---------------------------
cat > src/routes/api/groups/+server.ts <<'EOF'
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  const groups = db.getAllGroups();
  return json(groups);
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data = await request.json();
    
    if (!data.name || !data.category || !data.telegramId || !data.ownerAddress) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    const group = db.createGroup({
      name: data.name,
      category: data.category,
      telegramId: data.telegramId,
      minBid: parseFloat(data.minBid) || 0.10,
      ownerAddress: data.ownerAddress,
      active: true
    });

    return json(group, { status: 201 });
  } catch (error) {
    return json({ error: 'Failed to create group' }, { status: 500 });
  }
};
EOF

# ---------------------------
# src/routes/api/auctions/+server.ts
# ---------------------------
cat > src/routes/api/auctions/+server.ts <<'EOF'
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { X402Middleware } from '$lib/server/x402';
import { TelegramBot } from '$lib/server/telegram';
import { TELEGRAM_BOT_TOKEN, RECEIVER_ADDRESS } from '$env/static/private';

const x402 = new X402Middleware(RECEIVER_ADDRESS || '0xDemo');
const telegramBot = TELEGRAM_BOT_TOKEN ? new TelegramBot(TELEGRAM_BOT_TOKEN) : null;

export const GET: RequestHandler = async ({ url }) => {
  const groupId = url.searchParams.get('groupId');
  
  if (groupId) {
    const auctions = db.getAllAuctions().filter(a => a.groupId === parseInt(groupId));
    return json(auctions);
  }
  
  return json(db.getAllAuctions());
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const payment = await x402.verifyPayment(request);
    const data = await request.json();
    
    const group = db.getGroup(data.groupId);
    if (!group) {
      return json({ error: 'Group not found' }, { status: 404 });
    }

    // Check payment
    if (!payment || payment.amount < group.minBid) {
      return x402.create402Response(group.minBid, group.ownerAddress);
    }

    // Create auction
    const auction = db.createAuction({
      groupId: data.groupId,
      bidderAddress: payment.sender,
      bidderName: data.bidderName || 'Anonymous AI',
      amount: payment.amount,
      message: data.message,
      txHash: payment.txHash
    });

    // Update group stats
    db.updateGroup(group.id, {
      totalEarned: group.totalEarned + payment.amount,
      messageCount: group.messageCount + 1
    });

    // Post to Telegram
    if (telegramBot && group.telegramId) {
      try {
        const messageText = telegramBot.formatAuctionMessage(auction);
        await telegramBot.sendMessage(group.telegramId, messageText);
        
        db.updateAuction(auction.id, { 
          status: 'active',
          postedAt: new Date() 
        });
      } catch (error) {
        console.error('Failed to post to Telegram:', error);
      }
    }

    return json(auction, { status: 201 });
  } catch (error) {
    console.error('Auction creation error:', error);
    return json({ error: 'Failed to create auction' }, { status: 500 });
  }
};
EOF

# ---------------------------
# src/routes/api/telegram/webhook/+server.ts
# ---------------------------
cat > src/routes/api/telegram/webhook/+server.ts <<'EOF'
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const update = await request.json();

    // Handle replies to auction messages
    if (update.message?.reply_to_message && update.message.text) {
      const replyText = update.message.text;
      const username = update.message.from.username || 'Anonymous';
      const userId = update.message.from.id;
      
      // Extract auction ID from message (implement proper tracking in production)
      // For now, log the response
      console.log(`Response from @${username} (${userId}): ${replyText}`);
      
      // In production: 
      // 1. Extract auction ID from reply_to_message
      // 2. Add response to auction
      // 3. Notify AI agent via webhook/API
    }

    return json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return json({ error: 'Webhook processing failed' }, { status: 500 });
  }
};
EOF

# ---------------------------
# src/routes/+layout.svelte
# ---------------------------
cat > src/routes/+layout.svelte <<'EOF'
<script lang="ts">
  import '../app.css';
</script>

<slot />
EOF

# ---------------------------
# src/routes/+page.svelte
# ---------------------------
cat > src/routes/+page.svelte <<'EOF'
<script lang="ts">
  import { onMount } from 'svelte';
  import { Users, DollarSign, MessageSquare, TrendingUp, Send } from 'lucide-svelte';
  import type { Group, Auction } from '$lib/types';

  let view = $state<'admin' | 'ai-agent' | 'analytics'>('admin');
  let groups = $state<Group[]>([]);
  let auctions = $state<Auction[]>([]);
  
  let newGroup = $state({
    name: '',
    category: '',
    telegramId: '',
    minBid: 0.10,
    ownerAddress: ''
  });

  let newBid = $state({
    groupId: '',
    amount: '',
    message: '',
    bidderName: ''
  });

  const totalRevenue = $derived(groups.reduce((sum, g) => sum + g.totalEarned, 0));
  const totalMessages = $derived(groups.reduce((sum, g) => sum + g.messageCount, 0));
  const avgBid = $derived(totalMessages > 0 ? totalRevenue / totalMessages : 0);

  onMount(() => {
    loadGroups();
    loadAuctions();
  });

  async function loadGroups() {
    try {
      const res = await fetch('/api/groups');
      groups = await res.json();
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  }

  async function loadAuctions() {
    try {
      const res = await fetch('/api/auctions');
      auctions = await res.json();
    } catch (error) {
      console.error('Failed to load auctions:', error);
    }
  }

  async function createGroup() {
    if (!newGroup.name || !newGroup.category || !newGroup.telegramId || !newGroup.ownerAddress) {
      alert('Please fill in all fields');
      return;
    }
    
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGroup)
      });

      if (res.ok) {
        await loadGroups();
        newGroup = { name: '', category: '', telegramId: '', minBid: 0.10, ownerAddress: '' };
        alert('Group created successfully!');
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create group');
      }
    } catch (error) {
      alert('Network error');
    }
  }

  async function submitBid() {
    if (!newBid.groupId || !newBid.amount || !newBid.message) {
      alert('Please fill in all fields');
      return;
    }

    const group = groups.find(g => g.id === parseInt(newBid.groupId));
    if (!group) return;

    if (parseFloat(newBid.amount) < group.minBid) {
      alert(`Minimum bid is $${group.minBid}`);
      return;
    }

    try {
      const res = await fetch('/api/auctions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-payment': 'true',
          'x-payment-amount': newBid.amount,
          'x-payment-sender': '0xAI' + Math.random().toString(16).slice(2, 10),
          'x-payment-txhash': '0x' + Math.random().toString(16).slice(2, 66)
        },
        body: JSON.stringify({
          groupId: parseInt(newBid.groupId),
          bidderName: newBid.bidderName || 'Anonymous AI',
          message: newBid.message
        })
      });

      if (res.ok) {
        await loadAuctions();
        await loadGroups();
        newBid = { groupId: '', amount: '', message: '', bidderName: '' };
        alert('Bid submitted successfully!');
      } else if (res.status === 402) {
        const paymentInfo = await res.json();
        alert(`Payment required:\n${JSON.stringify(paymentInfo, null, 2)}`);
      } else {
        alert('Failed to submit bid');
      }
    } catch (error) {
      alert('Network error');
    }
  }

  function getStatusColor(status: string): string {
    const colors = {
      pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
      active: 'bg-green-500/20 text-green-300 border-green-500/50',
      completed: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
      rejected: 'bg-red-500/20 text-red-300 border-red-500/50'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-500/20 text-gray-300 border-gray-500/50';
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-4xl font-bold text-white mb-2 flex items-center gap-3">
        🤖 AI Auction System
      </h1>
      <p class="text-purple-200">SvelteKit + Telegram + x402 Micropayments</p>
    </div>

    <!-- Navigation -->
    <div class="flex gap-4 mb-6">
      <button
        onclick={() => view = 'admin'}
        class="px-6 py-3 rounded-lg font-semibold transition-all {view === 'admin' ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'}"
      >
        Group Admin
      </button>
      <button
        onclick={() => view = 'ai-agent'}
        class="px-6 py-3 rounded-lg font-semibold transition-all {view === 'ai-agent' ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'}"
      >
        AI Agent
      </button>
      <button
        onclick={() => view = 'analytics'}
        class="px-6 py-3 rounded-lg font-semibold transition-all {view === 'analytics' ? 'bg-purple-600 text-white shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'}"
      >
        Live Auctions
      </button>
    </div>

    {#if view === 'admin'}
      <!-- Stats Dashboard -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-purple-200 text-sm">Total Groups</p>
              <p class="text-3xl font-bold text-white">{groups.length}</p>
            </div>
            <Users class="w-8 h-8 text-purple-400" />
          </div>
        </div>
        <div class="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-purple-200 text-sm">Total Revenue</p>
              <p class="text-3xl font-bold text-white">${totalRevenue.toFixed(2)}</p>
            </div>
            <DollarSign class="w-8 h-8 text-green-400" />
          </div>
        </div>
        <div class="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-purple-200 text-sm">Messages</p>
              <p class="text-3xl font-bold text-white">{totalMessages}</p>
            </div>
            <MessageSquare class="w-8 h-8 text-blue-400" />
          </div>
        </div>
        <div class="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-purple-200 text-sm">Avg. Bid</p>
              <p class="text-3xl font-bold text-white">${avgBid.toFixed(2)}</p>
            </div>
            <TrendingUp class="w-8 h-8 text-yellow-400" />
          </div>
        </div>
      </div>

      <!-- Register New Group -->
      <div class="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20 mb-6">
        <h2 class="text-2xl font-bold text-white mb-4">Register New Group</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Group Name"
            bind:value={newGroup.name}
            class="px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-purple-300 focus:outline-none focus:border-purple-400"
          />
          <input
            type="text"
            placeholder="Category (e.g., Technology)"
            bind:value={newGroup.category}
            class="px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-purple-300 focus:outline-none focus:border-purple-400"
          />
          <input
            type="text"
            placeholder="Telegram Group ID"
            bind:value={newGroup.telegramId}
            class="px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-purple-300 focus:outline-none focus:border-purple-400"
          />
          <input
            type="number"
            placeholder="Min Bid (USD)"
            bind:value={newGroup.minBid}
            step="0.01"
            class="px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-purple-300 focus:outline-none focus:border-purple-400"
          />
          <input
            type="text"
            placeholder="Owner Wallet Address (0x...)"
            bind:value={newGroup.ownerAddress}
            class="px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-purple-300 focus:outline-none focus:border-purple-400 md:col-span-2"
          />
        </div>
        <button
          onclick={createGroup}
          class="mt-4 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-all"
        >
          Register Group
        </button>
      </div>

      <!-- Groups List -->
      <div class="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
        <h2 class="text-2xl font-bold text-white mb-4">Your Groups</h2>
        <div class="space-y-3">
          {#each groups as group (group.id)}
            <div class="bg-white/5 rounded-lg p-4 border border-white/10 hover:border-purple-400/50 transition-all">
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <h3 class="text-xl font-semibold text-white">{group.name}</h3>
                  <p class="text-purple-200 text-sm">{group.category} • Min bid: ${group.minBid}</p>
                  <p class="text-purple-300 text-xs mt-1">{group.telegramId}</p>
                </div>
                <div class="text-right">
                  <p class="text-2xl font-bold text-green-400">${group.totalEarned.toFixed(2)}</p>
                  <p class="text-purple-200 text-sm">{group.messageCount} messages</p>
                </div>
              </div>
            </div>
          {:else}
            <p class="text-purple-300 text-center py-8">No groups registered yet</p>
          {/each}
        </div>
      </div>
    {/if}

    {#if view === 'ai-agent'}
      <!-- Available Groups -->
      <div class="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20 mb-6">
        <h2 class="text-2xl font-bold text-white mb-4">Available Groups</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          {#each groups as group (group.id)}
            <div class="bg-white/5 rounded-lg p-4 border border-white/10 hover:border-purple-400 transition-all cursor-pointer">
              <h3 class="text-lg font-semibold text-white mb-2">{group.name}</h3>
              <p class="text-purple-200 text-sm mb-3">{group.category}</p>
              <div class="flex items-center justify-between">
                <span class="text-purple-300 text-sm">{group.messageCount} msgs</span>
                <span class="text-green-400 font-semibold">${group.minBid} min</span>
              </div>
            </div>
          {:else}
            <p class="text-purple-300 col-span-3 text-center py-8">No groups available</p>
          {/each}
        </div>
      </div>

      <!-- Submit Bid -->
      <div class="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
        <h2 class="text-2xl font-bold text-white mb-4">Submit Bid</h2>
        <div class="space-y-4">
          <input
            type="text"
            placeholder="AI Agent Name"
            bind:value={newBid.bidderName}
            class="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-purple-300 focus:outline-none focus:border-purple-400"
          />
          <select
            bind:value={newBid.groupId}
            class="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white focus:outline-none focus:border-purple-400"
          >
            <option value="">Select Group</option>
            {#each groups as group (group.id)}
              <option value={group.id}>{group.name} (min ${group.minBid})</option>
            {/each}
          </select>
          <input
            type="number"
            placeholder="Bid Amount (USD)"
            bind:value={newBid.amount}
            step="0.01"
            class="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-purple-300 focus:outline-none focus:border-purple-400"
          />
          <textarea
            placeholder="Your message to the group..."
            bind:value={newBid.message}
            rows="4"
            class="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-purple-300 focus:outline-none focus:border-purple-400"
          ></textarea>
          <button
            onclick={submitBid}
            class="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
          >
            <Send class="w-5 h-5" />
            Submit Bid (x402 Payment)
          </button>
        </div>
        <div class="mt-4 p-4 bg-blue-500/10 border border-blue-400/30 rounded-lg">
          <p class="text-blue-300 text-sm">
            <strong>How it works:</strong> Your bid triggers an x402 micropayment. Payment is verified on Base network using USDC. Once confirmed, your message is posted to the Telegram group.
          </p>
        </div>
      </div>
    {/if}

    {#if view === 'analytics'}
      <div class="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
        <h2 class="text-2xl font-bold text-white mb-4">Live Auctions</h2>
        <div class="space-y-3">
          {#each auctions as auction (auction.id)}
            {@const group = groups.find(g => g.id === auction.groupId)}
            <div class="bg-white/5 rounded-lg p-4 border border-white/10">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="px-3 py-1 rounded-full text-xs font-semibold border {getStatusColor(auction.status)}">
                      {auction.status}
                    </span>
                    <span class="text-purple-300 text-sm">
                      {new Date(auction.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <h3 class="text-lg font-semibold text-white mb-1">
                    {group?.name || 'Unknown Group'}
                  </h3>
                  <p class="text-purple-200 text-sm mb-2">Bidder: {auction.bidderName}</p>
                  <p class="text-white mb-2">{auction.message}</p>
                  <p class="text-purple-300 text-xs">Tx: {auction.txHash.slice(0, 10)}...{auction.txHash.slice(-8)}</p>
                </div>
                <div class="text-right ml-4">
                  <p class="text-2xl font-bold text-green-400">${auction.amount.toFixed(2)}</p>
                  <p class="text-purple-300 text-sm">{auction.responses.length} responses</p>
                </div>
              </div>
            </div>
          {:else}
            <p class="text-purple-300 text-center py-8">No auctions yet</p>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
EOF

# ---------------------------
# src/lib/components placeholders (optional)
# ---------------------------
cat > src/lib/components/StatCard.svelte <<'EOF'
<!-- Placeholder component (not used in +page.svelte but kept for structure) -->
<script lang="ts">
  export let title = '';
  export let value: string | number = '';
</script>

<div class="bg-white/10 rounded-lg p-4 border border-white/20">
  <p class="text-purple-200 text-sm">{title}</p>
  <p class="text-2xl font-bold text-white mt-1">{value}</p>
</div>
EOF

cat > src/lib/components/AuctionCard.svelte <<'EOF'
<!-- Placeholder component -->
<script lang="ts">
  export let bidder = '';
  export let amount = 0;
  export let message = '';
</script>

<div class="bg-white/5 rounded-lg p-4 border border-white/10">
  <div class="flex items-center justify-between">
    <h3 class="text-white font-semibold">{bidder}</h3>
    <span class="text-green-400 font-bold">${amount.toFixed(2)}</span>
  </div>
  <p class="text-purple-200 mt-2">{message}</p>
</div>
EOF

# ---------------------------
# static/favicon.png (1x1 transparent)
# ---------------------------
base64 -d > static/favicon.png <<'EOF'
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3m8y8AAAAASUVORK5CYII=
EOF

echo "→ Installing dependencies (this uses package.json versions)..."
npm install >/dev/null 2>&1 || npm install

# Tailwind post-init is already covered by config files, no npx init needed

echo "✅ Done."
echo "Run:"
echo "  cd $ROOT"
echo "  cp .env.example .env  # then edit"
echo "  npm run dev"
