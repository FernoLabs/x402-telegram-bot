<script lang="ts">
  import { onMount } from 'svelte';
  import { setContext } from 'svelte';
  import { wallet } from '$lib/wallet/wallet.svelte';

  export let rpcEndpoint: string = 'https://api.mainnet-beta.solana.com';

  onMount(() => {
    wallet.initialize(rpcEndpoint);
  });

  setContext('wallet', wallet);
</script>
