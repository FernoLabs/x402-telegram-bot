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
