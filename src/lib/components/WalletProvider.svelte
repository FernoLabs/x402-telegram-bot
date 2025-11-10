<script lang="ts">
        import { setContext } from 'svelte';
        import { PUBLIC_SOLANA_RPC_ENDPOINT } from '$lib/config';
        import { wallet } from '$lib/wallet/wallet.svelte';

        let { rpcEndpoint = PUBLIC_SOLANA_RPC_ENDPOINT } = $props<{ rpcEndpoint?: string }>();

        $effect(() => {
                void wallet.initialize(rpcEndpoint);
        });

        setContext('wallet', wallet);
</script>
