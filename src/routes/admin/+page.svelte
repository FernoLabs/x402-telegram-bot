<script lang="ts">
	const adminRows = [
		{
			group: 'Memecoin Cabal',
			steward: 'Jules Vega',
			contact: '@jules_vega',
			reserve: '15 SOL',
			notes: 'Confirm treasury split before Friday auction.'
		},
		{
			group: 'Ferno Tech Expert',
			steward: 'Iris Ferno',
			contact: '@ferno_ops',
			reserve: '22 SOL',
			notes: 'Validator partner wants extra spotlight slide.'
		},
		{
			group: 'Monkey DAO',
			steward: 'Kade Monroe',
			contact: '@monkey_ops',
			reserve: '18 SOL',
			notes: 'DAO treasury matching highest bid up to 20 SOL.'
		}
	];

	const guardrails = [
		'Human override before posting any creative outside approved templates.',
		'Treasury split ledger exported weekly for revenue share payouts.',
		'Automated profanity filter plus steward review queue for flagged copy.'
	];

	const cadences = [
		{
			title: 'Reserve audits',
			detail: 'Verify on-chain payments and update reserves every Monday.'
		},
		{ title: 'Creative refresh', detail: 'Swap hero artwork and CTA copy at least bi-weekly.' },
		{
			title: 'Response routing',
			detail: 'Confirm bot forwarding rules and support aliases on Fridays.'
		}
	];
</script>

<section class="admin" aria-labelledby="admin-title">
	<header class="hero">
		<div class="hero-copy">
			<h2 id="admin-title">Operate every community with the same playbook</h2>
			<p>
				Steward notes, revenue tracking, and guardrails sit in one place so you can scale auctions
				without losing signal. Use the dashboard to sync weekly rituals with each steward team.
			</p>
			<div class="cta-row">
				<a class="cta primary" href="/setup">Run setup checklist</a>
				<a class="cta secondary" href="/send">Open message console</a>
			</div>
		</div>
		<dl class="metrics" aria-label="Operations snapshot">
			<div>
				<dt>12 active groups</dt>
				<dd>Each aligned on the same 15-minute cadence.</dd>
			</div>
			<div>
				<dt>70 / 30 split</dt>
				<dd>Automated ledgering handles revenue share payouts.</dd>
			</div>
			<div>
				<dt>100% human review</dt>
				<dd>Every winning bid routes through a steward before posting.</dd>
			</div>
		</dl>
	</header>

	<div class="table-card" aria-labelledby="steward-table">
		<div class="table-heading">
			<h3 id="steward-table">Steward roster &amp; reserves</h3>
			<p>Keep contacts and reserve logic current before each auction window.</p>
		</div>
		<div class="table-scroll" role="region" aria-live="polite">
			<table>
				<thead>
					<tr>
						<th scope="col">Group</th>
						<th scope="col">Steward</th>
						<th scope="col">Contact</th>
						<th scope="col">Reserve</th>
						<th scope="col">Notes</th>
					</tr>
				</thead>
				<tbody>
					{#each adminRows as row}
						<tr>
							<th scope="row">{row.group}</th>
							<td>{row.steward}</td>
							<td>{row.contact}</td>
							<td>{row.reserve}</td>
							<td>{row.notes}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div class="detail-grid">
		<article class="card" aria-labelledby="guardrails-title">
			<h3 id="guardrails-title">Guardrails that keep auctions safe</h3>
			<ul>
				{#each guardrails as guardrail}
					<li>{guardrail}</li>
				{/each}
			</ul>
		</article>
		<article class="card" aria-labelledby="cadence-title">
			<h3 id="cadence-title">Weekly cadence to stay aligned</h3>
			<ul>
				{#each cadences as cadence}
					<li>
						<strong>{cadence.title}</strong>
						<span>{cadence.detail}</span>
					</li>
				{/each}
			</ul>
		</article>
	</div>
</section>

<style>
	.admin {
		display: grid;
		gap: clamp(1.75rem, 3vw, 2.5rem);
		max-width: 1040px;
		margin: 0 auto;
	}

	.hero {
		background: linear-gradient(135deg, #111827, #1f2937 55%, #1e293b 100%);
		border-radius: 22px;
		padding: clamp(1.75rem, 3vw, 2.75rem);
		color: white;
		display: grid;
		gap: clamp(1.5rem, 3vw, 2.25rem);
		box-shadow: 0 35px 70px -45px rgba(15, 23, 42, 0.9);
	}

	@media (min-width: 900px) {
		.hero {
			grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
			align-items: start;
		}
	}

	.hero-copy {
		display: grid;
		gap: 1rem;
	}

	.hero-copy h2 {
		margin: 0;
		font-size: clamp(2rem, 2vw + 1.5rem, 2.75rem);
	}

	.hero-copy p {
		margin: 0;
		line-height: 1.7;
		color: rgba(226, 232, 240, 0.9);
	}

	.cta-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.65rem 1.4rem;
		border-radius: 999px;
		font-weight: 600;
		text-decoration: none;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease,
			background 0.2s ease;
	}

	.cta.primary {
		background: white;
		color: #0f172a;
		box-shadow: 0 16px 36px -22px rgba(226, 232, 240, 0.7);
	}

	.cta.primary:hover,
	.cta.primary:focus-visible {
		transform: translateY(-2px);
	}

	.cta.secondary {
		background: rgba(59, 130, 246, 0.18);
		color: #bfdbfe;
		border: 1px solid rgba(96, 165, 250, 0.35);
	}

	.cta.secondary:hover,
	.cta.secondary:focus-visible {
		transform: translateY(-2px);
		background: rgba(59, 130, 246, 0.28);
	}

	.metrics {
		display: grid;
		gap: 1rem;
	}

	.metrics div {
		background: rgba(15, 23, 42, 0.45);
		border-radius: 16px;
		padding: 1.25rem 1.5rem;
		border: 1px solid rgba(148, 163, 184, 0.25);
		display: grid;
		gap: 0.35rem;
	}

	.metrics dt {
		font-weight: 700;
		margin: 0;
	}

	.metrics dd {
		margin: 0;
		color: rgba(226, 232, 240, 0.8);
	}

	.table-card {
		background: white;
		border-radius: 20px;
		padding: clamp(1.5rem, 3vw, 2.25rem);
		border: 1px solid #e0e7ff;
		box-shadow: 0 28px 64px -48px rgba(30, 41, 59, 0.5);
		display: grid;
		gap: 1.25rem;
	}

	.table-heading h3 {
		margin: 0;
		font-size: 1.45rem;
		color: #0f172a;
	}

	.table-heading p {
		margin: 0.35rem 0 0;
		color: #475569;
	}

	.table-scroll {
		overflow-x: auto;
		border-radius: 14px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		min-width: 640px;
	}

	thead th {
		text-align: left;
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		color: #64748b;
		padding: 0.85rem 1.25rem;
		background: #f8fafc;
	}

	tbody th,
	td {
		padding: 0.9rem 1.25rem;
		border-top: 1px solid #e2e8f0;
		color: #1e293b;
	}

	tbody tr:nth-child(even) {
		background: #f9fbff;
	}

	tbody th {
		font-size: 0.98rem;
	}

	.detail-grid {
		display: grid;
		gap: 1.5rem;
	}

	@media (min-width: 880px) {
		.detail-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.card {
		background: white;
		border-radius: 18px;
		padding: clamp(1.5rem, 3vw, 2.1rem);
		border: 1px solid #e0e7ff;
		box-shadow: 0 24px 58px -46px rgba(30, 41, 59, 0.45);
		display: grid;
		gap: 1.1rem;
	}

	.card h3 {
		margin: 0;
		font-size: 1.3rem;
		color: #0f172a;
	}

	.card ul {
		margin: 0;
		padding-left: 1.25rem;
		display: grid;
		gap: 0.75rem;
		color: #475569;
		line-height: 1.6;
	}

	.card li strong {
		display: block;
		color: #111827;
		margin-bottom: 0.25rem;
	}
</style>
