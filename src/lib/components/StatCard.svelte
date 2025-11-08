<!-- Placeholder component (not used in +page.svelte but kept for structure) -->
<script lang="ts">
  export let title = '';
  export let value: string | number = '';
</script>

<div class="bg-white/10 rounded-lg p-4 border border-white/20">
  <p class="text-purple-200 text-sm">{title}</p>
  <p class="text-2xl font-bold text-white mt-1">{value}</p>
</div>
