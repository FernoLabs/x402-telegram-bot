<script lang="ts">
	import { onMount } from 'svelte';
	import {
		generateAssociationKeypair,
		generateRemoteAssociationURI
	} from '$lib/wallet/mwa-protocol';

	interface Props {
		appName: string;
		appUrl: string;
		onConnected?: (publicKey: string) => void;
	}

	let { appName, appUrl, onConnected }: Props = $props();

	let qrCanvas = $state<HTMLCanvasElement | null>(null);
	let associationURI = $state('');
	let connecting = $state(false);

	onMount(async () => {
		try {
			const keypair = await generateAssociationKeypair();
			const reflectorHost = 'mwa-reflector.example.com';
			const reflectorId = 'mock-' + Math.random().toString(36).slice(2);

			associationURI = generateRemoteAssociationURI(keypair.token, reflectorHost, reflectorId);

			if (qrCanvas) {
				renderPlaceholder(qrCanvas, associationURI);
			}

			connecting = true;
		} catch (error) {
			console.error('Failed to prepare MWA QR', error);
		}
	});

	function renderPlaceholder(canvas: HTMLCanvasElement, data: string): void {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		ctx.fillStyle = '#111827';
		ctx.font = '12px monospace';
		ctx.fillText('Scan with mobile wallet', 14, 24);

		for (let x = 0; x < 24; x += 1) {
			for (let y = 0; y < 24; y += 1) {
				if ((x * 17 + y * 13 + data.length) % 7 === 0) {
					ctx.fillRect(20 + x * 8, 40 + y * 8, 6, 6);
				}
			}
		}
	}

	async function copyURI(): Promise<void> {
		try {
			await navigator.clipboard?.writeText(associationURI);
		} catch (error) {
			console.warn('Unable to copy URI', error);
		}
	}
</script>

<div class="mwa-qr">
	<div class="qr-container">
		<canvas bind:this={qrCanvas} width="260" height="260" aria-hidden="true"></canvas>
	</div>

	<div class="instructions">
		<h3>Connect Mobile Wallet</h3>
		<ol>
			<li>Open your preferred Solana mobile wallet</li>
			<li>Tap <strong>Scan QR</strong></li>
			<li>Approve the connection request</li>
		</ol>

		{#if connecting}
			<p class="status">Waiting for wallet…</p>
		{/if}
	</div>

	<div class="uri-fallback">
		<details>
			<summary>Copy association URI</summary>
			<code>{associationURI}</code>
			<button type="button" onclick={copyURI}>Copy</button>
		</details>
	</div>
</div>

<style>
	.mwa-qr {
		display: grid;
		gap: 1.5rem;
		text-align: center;
	}

	.qr-container {
		display: flex;
		justify-content: center;
	}

	canvas {
		border: 2px solid rgba(148, 163, 184, 0.2);
		border-radius: 1rem;
		background: white;
	}

	.instructions h3 {
		margin: 0 0 1rem;
		color: #111827;
	}

	.instructions ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.5rem;
		color: #475569;
	}

	.status {
		margin-top: 1rem;
		color: #7c3aed;
		font-weight: 600;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.uri-fallback details {
		background: rgba(15, 23, 42, 0.04);
		border: 1px solid rgba(15, 23, 42, 0.08);
		border-radius: 0.75rem;
		padding: 0.75rem 1rem;
		text-align: left;
	}

	.uri-fallback summary {
		cursor: pointer;
		font-weight: 600;
	}

	code {
		display: block;
		margin: 0.75rem 0;
		padding: 0.75rem;
		background: white;
		border-radius: 0.75rem;
		font-size: 0.75rem;
		word-break: break-all;
	}

	button {
		border: none;
		border-radius: 0.75rem;
		padding: 0.45rem 0.9rem;
		background: #111827;
		color: white;
		font-weight: 600;
		cursor: pointer;
	}
</style>
