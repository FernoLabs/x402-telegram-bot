<script lang="ts">
	import { onMount } from 'svelte';
	import WalletModal from './WalletModal.svelte';
	import { wallet } from '$lib/wallet/wallet.svelte';

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	let showModal = $state(false);
	let menuOpen = $state(false);
	let container: HTMLDivElement | null = null;

	onMount(() => {
		const handleClick = (event: MouseEvent) => {
			if (!menuOpen) return;
			if (!container) return;
			if (!container.contains(event.target as Node)) {
				menuOpen = false;
			}
		};

		document.addEventListener('click', handleClick);
		return () => {
			document.removeEventListener('click', handleClick);
		};
	});

	function togglePrimary(): void {
		if ($wallet.connected) {
			menuOpen = !menuOpen;
		} else {
			showModal = true;
		}
	}

	async function handleDisconnect(): Promise<void> {
		await wallet.disconnect();
		menuOpen = false;
	}

	function handleSwitch(): void {
		menuOpen = false;
		showModal = true;
	}
</script>

<div class={`wallet-control ${className}`} bind:this={container}>
	<button
		class={`wallet-button ${$wallet.connected ? 'connected' : ''}`}
		onclick={togglePrimary}
		type="button"
		aria-expanded={$wallet.connected ? menuOpen : undefined}
		aria-haspopup={$wallet.connected ? 'menu' : undefined}
		disabled={$wallet.connecting}
	>
		<span class={`status-dot ${$wallet.connected ? 'online' : ''}`}></span>
		<span class="label">
			{$wallet.connected ? $wallet.shortAddress || 'Wallet Connected' : 'Connect Wallet'}
		</span>
		{#if $wallet.connected}
			<span class="chevron">▾</span>
		{/if}
	</button>

	{#if $wallet.connected && menuOpen}
		<div class="wallet-menu" role="menu">
			<button type="button" role="menuitem" onclick={handleSwitch}>Switch wallet</button>
			<button type="button" role="menuitem" onclick={handleDisconnect}>Disconnect</button>
		</div>
	{/if}

	<WalletModal bind:show={showModal} on:closed={() => (menuOpen = false)} />
</div>

<style>
	.wallet-control {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	.wallet-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.9rem;
		border-radius: 999px;
		border: 1px solid rgba(17, 24, 39, 0.1);
		background: white;
		color: #111827;
		font-weight: 600;
		cursor: pointer;
		transition:
			box-shadow 0.2s ease,
			transform 0.2s ease;
	}

	.wallet-button.connected {
		background: #111827;
		color: white;
	}

	.wallet-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.wallet-button:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
	}

	.status-dot {
		width: 0.65rem;
		height: 0.65rem;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.8);
	}

	.status-dot.online {
		background: #22c55e;
	}

	.label {
		white-space: nowrap;
	}

	.chevron {
		font-size: 0.8rem;
		opacity: 0.8;
	}

	.wallet-menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		display: grid;
		padding: 0.5rem;
		background: white;
		border: 1px solid rgba(15, 23, 42, 0.08);
		border-radius: 0.75rem;
		box-shadow: 0 10px 30px rgba(15, 23, 42, 0.2);
		min-width: 10rem;
		z-index: 20;
	}

	.wallet-menu button {
		background: none;
		border: none;
		text-align: left;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-weight: 600;
		font-size: 0.9rem;
		color: #111827;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.wallet-menu button:hover {
		background: rgba(17, 24, 39, 0.08);
	}
</style>
