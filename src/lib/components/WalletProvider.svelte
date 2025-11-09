<script lang="ts">
	import { onMount } from 'svelte';
	import { setContext } from 'svelte';
	import { PUBLIC_SOLANA_RPC_ENDPOINT } from '$lib/config';
	import { wallet } from '$lib/wallet/wallet.svelte';

	export let rpcEndpoint: string = PUBLIC_SOLANA_RPC_ENDPOINT;

	onMount(() => {
		wallet.initialize(rpcEndpoint);
	});

	setContext('wallet', wallet);
</script>
