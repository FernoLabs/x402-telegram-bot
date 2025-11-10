<script lang="ts">
        import type { Group } from '$lib/types';

        let { data } = $props<{ data: { groups: Group[]; loadError: boolean } }>();

        const currencyFormatter = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
        });
        const numberFormatter = new Intl.NumberFormat('en-US');

        const groups = $derived(data.groups.filter((group: Group) => group.active));

        const formatUsd = (value: number) => currencyFormatter.format(value);
        const formatMessages = (count: number) => numberFormatter.format(count);
</script>

<section class="page" aria-labelledby="groups-title">
	<header>
		<h2 id="groups-title">Active groups</h2>
		<p>
			These communities accept paid posts through the console. Listings reflect the live minimum
			bid, wallet, and delivery stats pulled directly from the database.
		</p>
	</header>

	{#if data.loadError}
		<div class="error" role="alert">
			<strong>Unable to load groups.</strong>
			<span>Check your connection or try again after refreshing.</span>
		</div>
	{/if}

	{#if groups.length > 0}
		<table>
			<caption class="visually-hidden">Telegram groups enabled for paid posts</caption>
			<thead>
				<tr>
					<th scope="col">Group</th>
					<th scope="col">Telegram ID</th>
					<th scope="col">Price per message</th>
					<th scope="col">Messages sent</th>
					<th scope="col">Total earned</th>
					<th scope="col" class="actions">Action</th>
				</tr>
			</thead>
			<tbody>
				{#each groups as group (group.id)}
					<tr>
						<th scope="row">{group.name}</th>
						<td>{group.telegramId}</td>
						<td>{formatUsd(group.minBid)}</td>
						<td>{formatMessages(group.messageCount)}</td>
						<td>{formatUsd(group.totalEarned)}</td>
						<td class="actions">
							<a href={`/send?groupId=${group.id}`} class="action">Send message</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="empty" role="status">No groups are currently active. Add one from the setup guide.</p>
	{/if}

	<section class="note" aria-labelledby="note-title">
		<h3 id="note-title">How pricing works</h3>
                <p>
                        Senders pay the listed amount in the configured Solana stablecoin (USDC by default) using their
                        own wallet. Payments confirm within seconds and the bot posts the message with a receipt. Group
                        owners can pause listings or adjust pricing at any time from Telegram using the /setprice
                        command.
                </p>
		<a class="action" href="/setup">Add your group</a>
	</section>
</section>

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		display: grid;
		gap: clamp(1.5rem, 3vw, 2.5rem);
	}

	header {
		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: clamp(1.5rem, 3vw, 2.25rem);
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: clamp(2rem, 2vw + 1.5rem, 2.4rem);
		color: #111827;
	}

	p {
		margin: 0;
		color: #475569;
		line-height: 1.6;
	}

	.error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 14px;
		padding: 1rem 1.25rem;
		display: grid;
		gap: 0.35rem;
		color: #991b1b;
	}

	.error strong {
		font-weight: 600;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		overflow: hidden;
	}

	th,
	td {
		padding: 0.9rem 1rem;
		text-align: left;
		border-bottom: 1px solid #e5e7eb;
		color: #1f2937;
	}

	thead th {
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: #6b7280;
		background: #f9fafb;
	}

	tbody tr:last-child th,
	tbody tr:last-child td {
		border-bottom: none;
	}

	th[scope='row'] {
		font-weight: 600;
		color: #111827;
	}

	.action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.45rem 1rem;
		border-radius: 8px;
		background: #111827;
		color: white;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.95rem;
	}

	.actions {
		text-align: right;
		min-width: 130px;
	}

	.empty {
		margin: 0;
		padding: 1rem 1.25rem;
		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		color: #475569;
	}

	.note {
		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: clamp(1.5rem, 3vw, 2.25rem);
		display: grid;
		gap: 1rem;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		border: 0;
	}
</style>
