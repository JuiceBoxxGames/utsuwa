<script lang="ts">
	import { onMount } from 'svelte';
	import { mcpStore } from '$lib/stores/mcp.svelte';
	import type { McpAuth, McpServerConfig, McpTransport } from '$lib/types/mcp';
	import { parseEnvLines, parseQuotedArgs } from '$lib/services/mcp/protocol';
	import { Icon } from '$lib/components/ui';
	import '../settings-page.css';

	// ── Form state (shared for add + edit) ──────────────────────────────────
	let showForm = $state(false);
	let editingId = $state<string | null>(null);
	let formTransport = $state<McpTransport>('http');
	let formName = $state('');
	let formUrl = $state('');
	let formCommand = $state('');
	let formArgs = $state('');
	let formEnv = $state('');
	let formAuthType = $state<'none' | 'bearer'>('none');
	let formAuthToken = $state('');
	let formInjectResultsAsUser = $state(false);
	let formError = $state('');

	const isEditing = $derived(editingId !== null);

	function resetForm() {
		formName = '';
		formUrl = '';
		formCommand = '';
		formArgs = '';
		formEnv = '';
		formAuthType = 'none';
		formAuthToken = '';
		formInjectResultsAsUser = false;
		formError = '';
		editingId = null;
		showForm = false;
	}

	function openAddForm() {
		resetForm();
		formTransport = 'http';
		showForm = true;
	}

	function openEditForm(server: McpServerConfig) {
		editingId = server.id;
		formTransport = server.transport;
		formName = server.name;
		formUrl = server.url ?? '';
		formCommand = server.command ?? '';
		formArgs = (server.args ?? []).join(' ');
		formEnv = server.env
			? Object.entries(server.env)
					.map(([k, v]) => `${k}=${v}`)
					.join('\n')
			: '';
		formAuthType = server.auth?.type === 'bearer' ? 'bearer' : 'none';
		formAuthToken = server.auth?.type === 'bearer' ? server.auth.token : '';
		formInjectResultsAsUser = server.injectResultsAsUser ?? false;
		formError = '';
		showForm = true;
	}

	function submitForm() {
		formError = '';
		if (!formName.trim()) {
			formError = 'Name is required';
			return;
		}
		if (formTransport === 'http' && !formUrl.trim()) {
			formError = 'URL is required';
			return;
		}
		if (formTransport === 'stdio' && !formCommand.trim()) {
			formError = 'Command is required';
			return;
		}
		if (formAuthType === 'bearer' && !formAuthToken.trim()) {
			formError = 'Token is required for bearer authentication';
			return;
		}

		const auth: McpAuth =
			formAuthType === 'bearer' ? { type: 'bearer', token: formAuthToken.trim() } : { type: 'none' };
		const args = formArgs.trim() ? parseQuotedArgs(formArgs) : [];
		const env = formEnv.trim() ? parseEnvLines(formEnv) : undefined;

		const data = {
			name: formName.trim(),
			transport: formTransport,
			url: formTransport === 'http' ? formUrl.trim() : undefined,
			command: formTransport === 'stdio' ? formCommand.trim() : undefined,
			args: formTransport === 'stdio' ? args : undefined,
			env: formTransport === 'stdio' ? env : undefined,
			auth: formTransport === 'http' ? auth : undefined,
			injectResultsAsUser: formInjectResultsAsUser
		};

		if (isEditing) {
			mcpStore.updateServer(editingId!, data);
		} else {
			mcpStore.addServer({ ...data, enabled: true });
		}
		resetForm();
	}

	onMount(() => {
		void mcpStore.refreshTools();
	});
</script>

<div class="page">
	<header class="page-header">
		<h2>MCP Servers</h2>
		<p>
			Connect to Model Context Protocol servers to give your companion tools like home control,
			web search, and more.
		</p>
	</header>

	{#if mcpStore.capability === 'none'}
		<section class="section notice">
			<strong>MCP disabled on this server</strong>
			<span>
				The administrator of this deployment has not enabled MCP (set
				<code>MCP_ENABLED=server</code> to turn it on). No MCP requests will be sent.
			</span>
		</section>
	{/if}

	{#if mcpStore.capability === 'client'}
		<section class="section notice info">
			<strong>Desktop mode</strong>
			<span>HTTP servers connect directly. stdio servers run only in the server (web) build.</span>
		</section>
	{/if}

	{#if mcpStore.serverEnabled}
		<section class="section">
			<div class="section-header">
				<h3>Servers</h3>
				<button class="ghost-btn" onclick={() => (showForm && !isEditing ? resetForm() : openAddForm())}>
					<Icon name={showForm && !isEditing ? 'xmark' : 'plus'} size={13} />
					{showForm && !isEditing ? 'Cancel' : 'Add Server'}
				</button>
			</div>

			{#if showForm}
				<div class="form-card">
					<div class="form-title">{isEditing ? 'Edit Server' : 'New Server'}</div>

					<div class="form-row">
						<label class="form-label" for="mcp-name">Name</label>
						<input id="mcp-name" class="form-input" bind:value={formName} placeholder="Home Assistant" />
					</div>

					<div class="form-row">
						<span class="form-label">Transport</span>
						<div class="transport-toggle">
							<label class="transport-opt" class:active={formTransport === 'http'}>
								<input
									type="radio"
									name="mcp-transport"
									value="http"
									checked={formTransport === 'http'}
									onchange={() => (formTransport = 'http')}
								/>
								HTTP
							</label>
							<label class="transport-opt" class:active={formTransport === 'stdio'}>
								<input
									type="radio"
									name="mcp-transport"
									value="stdio"
									checked={formTransport === 'stdio'}
									onchange={() => (formTransport = 'stdio')}
								/>
								stdio
							</label>
						</div>
					</div>

					{#if formTransport === 'stdio'}
						<p class="form-hint">
							stdio is fail-closed: set <code>MCP_STDIO_ALLOWED_COMMANDS</code> (e.g.
							<code>npx</code>) in the server environment, otherwise this server stays disabled.
						</p>
					{/if}

					{#if formTransport === 'http'}
						<div class="form-row">
							<label class="form-label" for="mcp-url">URL</label>
							<input
								id="mcp-url"
								class="form-input"
								bind:value={formUrl}
								placeholder="http://homeassistant.local:8123/api/mcp"
								type="url"
							/>
						</div>
						<div class="form-row">
							<span class="form-label">Auth</span>
							<div class="transport-toggle">
								<label class="transport-opt" class:active={formAuthType === 'none'}>
									<input
										type="radio"
										name="mcp-auth"
										value="none"
										checked={formAuthType === 'none'}
										onchange={() => (formAuthType = 'none')}
									/>
									None
								</label>
								<label class="transport-opt" class:active={formAuthType === 'bearer'}>
									<input
										type="radio"
										name="mcp-auth"
										value="bearer"
										checked={formAuthType === 'bearer'}
										onchange={() => (formAuthType = 'bearer')}
									/>
									Bearer
								</label>
							</div>
						</div>
						{#if formAuthType === 'bearer'}
							<div class="form-row">
								<label class="form-label" for="mcp-token">Token</label>
								<input
									id="mcp-token"
									class="form-input"
									bind:value={formAuthToken}
									placeholder="Long-lived access token"
									type="password"
								/>
							</div>
						{/if}
					{:else}
						<div class="form-row">
							<label class="form-label" for="mcp-command">Command</label>
							<input id="mcp-command" class="form-input" bind:value={formCommand} placeholder="npx" />
						</div>
						<div class="form-row">
							<label class="form-label" for="mcp-args">Arguments</label>
							<input
								id="mcp-args"
								class="form-input"
								bind:value={formArgs}
								placeholder="-y mcp-searxng"
							/>
						</div>
						<div class="form-row">
							<label class="form-label" for="mcp-env">
								Env Vars
								<span class="form-hint">KEY=value per line</span>
							</label>
							<textarea
								id="mcp-env"
								class="form-input form-textarea"
								bind:value={formEnv}
								placeholder="SEARXNG_URL=http://your-searxng-host:8080"
								rows="3"
							></textarea>
						</div>
					{/if}

					{#if formError}
						<p class="form-error">{formError}</p>
					{/if}

					<label class="checkbox-row">
						<input type="checkbox" bind:checked={formInjectResultsAsUser} />
						<span>Inject text tool results as user messages</span>
						<span class="form-hint">Helps with local/SLIM models that ignore strict tool-role messages.</span>
					</label>

					<div class="form-actions">
						{#if isEditing}
							<button class="ghost-btn" onclick={resetForm}>Cancel</button>
						{/if}
						<button class="primary-btn" onclick={submitForm}>
							{isEditing ? 'Save Changes' : 'Add Server'}
						</button>
					</div>
				</div>
			{/if}

			{#if mcpStore.servers.length === 0 && !showForm}
				<p class="empty-hint">No servers configured. Add one above to get started.</p>
			{/if}

			<ul class="server-list">
				{#each mcpStore.servers as server (server.id)}
					<li class="server-card">
						<div class="server-info">
							<span class="server-name">{server.name}</span>
							<span class="server-meta">
								{server.transport === 'http'
									? server.url
									: `${server.command} ${(server.args ?? []).join(' ')}`}
							</span>
						</div>
						<div class="server-actions">
							{#if server.transport === 'http' && server.auth?.type === 'bearer'}
								<span class="server-badge auth">auth</span>
							{/if}
							<span class="server-badge">{server.transport}</span>
							<button
								class="toggle-btn"
								class:enabled={server.enabled}
								onclick={() => mcpStore.toggleServer(server.id)}
								title={server.enabled ? 'Disable' : 'Enable'}
							>
								{server.enabled ? 'On' : 'Off'}
							</button>
							<button
								class="icon-btn"
								onclick={() => openEditForm(server)}
								title="Edit server"
								aria-label="Edit server"
							>
								<Icon name="pencil" size={13} />
							</button>
							<button
								class="icon-btn danger"
								onclick={() => mcpStore.removeServer(server.id)}
								title="Remove server"
								aria-label="Remove server"
							>
								<Icon name="trash" size={13} />
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</section>

		<section class="section">
			<div class="section-header">
				<h3>Available Tools</h3>
				<button class="ghost-btn" onclick={() => mcpStore.refreshTools()} disabled={mcpStore.isLoadingTools}>
					<Icon name="refresh" size={13} />
					{mcpStore.isLoadingTools ? 'Loading…' : 'Refresh'}
				</button>
			</div>

			{#if mcpStore.toolsError}
				<p class="form-error">{mcpStore.toolsError}</p>
			{/if}

			{#if mcpStore.serverErrors.length > 0}
				<ul class="server-error-list">
					{#each mcpStore.serverErrors as error (error.serverId)}
						<li class="form-error">
							<strong>{error.serverName}:</strong>
							{error.message}
						</li>
					{/each}
				</ul>
			{/if}

			{#if mcpStore.tools.length === 0 && !mcpStore.isLoadingTools && mcpStore.serverErrors.length === 0}
				<p class="empty-hint">
					{mcpStore.enabledServers.length === 0
						? 'Enable a server above to see its tools.'
						: 'No tools found. Check that your MCP servers are running.'}
				</p>
			{/if}

			{#if mcpStore.tools.length > 0}
				<ul class="tool-list">
					{#each mcpStore.tools as tool (tool.serverId + '/' + tool.name)}
						<li class="tool-card">
							<div class="tool-header">
								<span class="tool-name">{tool.name}</span>
								<span class="tool-server">{tool.serverName}</span>
							</div>
							{#if tool.description}
								<p class="tool-desc">{tool.description}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<style>
	.section {
		margin-bottom: 1rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.section h3 {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-secondary);
	}

	.notice {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.notice strong {
		font-size: 0.9375rem;
		color: var(--text-primary);
	}

	.notice span {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.notice code {
		font-size: 0.78rem;
		background: var(--bg-tertiary);
		padding: 0.1rem 0.3rem;
		border-radius: var(--radius-sm);
	}

	.ghost-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8rem;
		padding: 0.3rem 0.7rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-light);
		background: var(--bg-secondary);
		color: var(--text-primary);
		cursor: pointer;
	}

	.ghost-btn:hover:not(:disabled) {
		background: var(--bg-tertiary);
	}

	.ghost-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.primary-btn {
		padding: 0.4rem 1rem;
		border-radius: var(--radius-md);
		border: none;
		background: var(--accent);
		color: #fff;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.primary-btn:hover {
		opacity: 0.9;
	}

	.form-card {
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-md);
		padding: 1rem;
		margin-bottom: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.form-title {
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-secondary);
	}

	.form-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.form-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
		min-width: 80px;
	}

	.form-input {
		flex: 1;
		min-width: 0;
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--border-light);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		background: var(--bg-primary);
		color: var(--text-primary);
	}

	.form-textarea {
		resize: vertical;
		font-family: monospace;
		line-height: 1.4;
	}

	.form-hint {
		font-size: 0.72rem;
		font-weight: 400;
		color: var(--text-tertiary);
	}

	.transport-toggle {
		display: flex;
		gap: 0.4rem;
	}

	.transport-opt {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.65rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-light);
		font-size: 0.8rem;
		cursor: pointer;
		background: var(--bg-primary);
		color: var(--text-secondary);
	}

	.transport-opt input {
		margin: 0;
		accent-color: var(--accent);
	}

	.transport-opt:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.transport-opt.active {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		color: var(--text-primary);
		flex-wrap: wrap;
	}

	.form-error {
		font-size: 0.8rem;
		color: var(--danger, #e55);
		margin: 0;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.server-list,
	.tool-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.server-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-md);
		padding: 0.75rem 1rem;
	}

	.server-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.server-name {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--text-primary);
	}

	.server-meta {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.server-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.server-badge {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius-sm);
		background: var(--bg-tertiary);
		color: var(--text-tertiary);
	}

	.server-badge.auth {
		background: var(--accent-muted);
		color: var(--accent);
	}

	.toggle-btn {
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.25rem 0.6rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-light);
		cursor: pointer;
		background: var(--bg-primary);
		color: var(--text-secondary);
	}

	.toggle-btn.enabled {
		background: var(--success, #22c55e);
		border-color: var(--success, #22c55e);
		color: #fff;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		padding: 0.3rem 0.45rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-light);
		background: var(--bg-primary);
		color: var(--text-tertiary);
		cursor: pointer;
	}

	.icon-btn:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.icon-btn.danger:hover {
		color: var(--danger, #e55);
		border-color: var(--danger, #e55);
	}

	.tool-card {
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-md);
		padding: 0.65rem 0.9rem;
	}

	.tool-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.tool-name {
		font-weight: 600;
		font-size: 0.88rem;
		color: var(--text-primary);
	}

	.tool-server {
		font-size: 0.72rem;
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	.tool-desc {
		margin: 0.3rem 0 0;
		font-size: 0.78rem;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.empty-hint {
		font-size: 0.85rem;
		color: var(--text-tertiary);
		text-align: center;
		padding: 1.5rem 0;
	}
</style>
