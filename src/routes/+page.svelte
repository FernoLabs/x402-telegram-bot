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
