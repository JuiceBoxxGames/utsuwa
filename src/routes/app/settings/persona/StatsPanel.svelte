<script lang="ts">
	import { slideOpen } from '$lib/utils/motion';
	import { Icon, Tooltip } from '$lib/components/ui';
	import type { PersonaPageState } from './persona-page.svelte';

	let { page }: { page: PersonaPageState } = $props();
</script>

<!-- Right Panel: Stats -->
<div class="stats-panel">
	{#if page.isCharacterLoading}
		<div class="loading-stats">Loading character data...</div>
	{/if}

	{#if page.isDatingSimMode}
		<!-- Bond Progress (Dating Sim Mode only) - Sims-style glossy bar -->
		<div class="bond-section">
			<div class="bond-progress">
				<div class="bond-header">
					<Tooltip content="Overall affection level. Grows through positive interactions, compliments, and time spent together." side="left">
						<div class="bond-icon">
							<Icon name="heart" size={18} />
						</div>
					</Tooltip>
					<div class="bond-info">
						<span class="bond-tier">{page.stageInfo.name}</span>
						<span class="bond-description">{page.stageInfo.description}</span>
					</div>
					<span class="bond-percent">{page.affectionPercent}%</span>
				</div>
				<div class="bond-bar-track">
					<div class="bond-bar-fill" style="width: {page.affectionPercent}%">
					</div>
					<div class="bond-bar-markers">
						{#each [25, 50, 75] as marker}
							<div class="bond-marker" style="left: {marker}%"></div>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<!-- Relationship Stats (Dating Sim Mode only) - Sims-style vertical bars -->
		<div class="stats-section">
			<Tooltip content="Core relationship attributes that evolve based on your interactions.">
				<span class="settings-label">Relationship Stats</span>
			</Tooltip>
			<div class="sims-stat-bars">
				<Tooltip content="How much she relies on and believes in you. Built through honesty and keeping promises.">
					<div class="sims-stat" style="--bar-color: var(--stat-trust); --bar-glow: rgba(77, 208, 255, 0.5)">
						<div class="sims-bar-track">
							<div class="sims-bar-fill" style="height: {page.charState.trust}%">
							</div>
						</div>
						<div class="sims-stat-icon">
							<Icon name="shield" size={14} />
						</div>
						<span class="sims-stat-label">Trust</span>
					</div>
				</Tooltip>
				<Tooltip content="Emotional closeness and vulnerability. Grows from meaningful conversations and shared experiences.">
					<div class="sims-stat" style="--bar-color: var(--stat-intimacy); --bar-glow: rgba(192, 132, 252, 0.5)">
						<div class="sims-bar-track">
							<div class="sims-bar-fill" style="height: {page.charState.intimacy}%">
							</div>
						</div>
						<div class="sims-stat-icon">
							<Icon name="heart" size={14} />
						</div>
						<span class="sims-stat-label">Intimacy</span>
					</div>
				</Tooltip>
				<Tooltip content="How at ease she feels around you. Increases with consistent, supportive presence.">
					<div class="sims-stat" style="--bar-color: var(--stat-comfort); --bar-glow: rgba(74, 222, 128, 0.5)">
						<div class="sims-bar-track">
							<div class="sims-bar-fill" style="height: {page.charState.comfort}%">
							</div>
						</div>
						<div class="sims-stat-icon">
							<Icon name="home" size={14} />
						</div>
						<span class="sims-stat-label">Comfort</span>
					</div>
				</Tooltip>
				<Tooltip content="How much she admires and values you. Earned through thoughtful actions and integrity.">
					<div class="sims-stat" style="--bar-color: var(--stat-respect); --bar-glow: rgba(96, 165, 250, 0.5)">
						<div class="sims-bar-track">
							<div class="sims-bar-fill" style="height: {page.charState.respect}%">
							</div>
						</div>
						<div class="sims-stat-icon">
							<Icon name="award" size={14} />
						</div>
						<span class="sims-stat-label">Respect</span>
					</div>
				</Tooltip>
				<Tooltip content="Her current energy level. Affects mood and responsiveness. Replenishes over time.">
					<div class="sims-stat" style="--bar-color: var(--stat-energy); --bar-glow: rgba(251, 191, 36, 0.5)">
						<div class="sims-bar-track">
							<div class="sims-bar-fill" style="height: {page.charState.energy}%">
							</div>
						</div>
						<div class="sims-stat-icon">
							<Icon name="zap" size={14} />
						</div>
						<span class="sims-stat-label">Energy</span>
					</div>
				</Tooltip>
			</div>
		</div>
	{:else}
		<!-- Companion Mode: Simplified stats -->
		<div class="companion-mode-section">
			<div class="companion-badge">
				<Icon name="sparkles" size={20} />
				<span>Companion Mode</span>
			</div>
			<p class="companion-description">Relationship stats and events are disabled. Only mood and energy are tracked.</p>
		</div>

		<!-- Energy bar (Companion Mode) - Sims-style -->
		<div class="stats-section companion-energy">
			<span class="settings-label">Energy</span>
			<div class="sims-stat-bars single">
				<div class="sims-stat" style="--bar-color: var(--stat-energy); --bar-glow: rgba(251, 191, 36, 0.5)">
					<div class="sims-bar-track tall">
						<div class="sims-bar-fill" style="height: {page.charState.energy}%">
						</div>
					</div>
					<div class="sims-stat-icon">
						<Icon name="zap" size={16} />
					</div>
					<span class="sims-stat-label">Energy</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Mood - Sims-style glossy card -->
	<div class="mood-section">
		<Tooltip content="Her emotional state right now, influenced by recent interactions and events.">
			<span class="settings-label">Current Mood</span>
		</Tooltip>
		<div class="mood-card" style="--mood-color: {page.moodInfo.color}">
			<div class="mood-icon-badge">
				<Icon name={page.moodInfo.icon} size={24} />
			</div>
			<div class="mood-info">
				<span class="mood-name">{page.moodInfo.description}</span>
				{#if page.charState.mood.causes.length > 0}
					<span class="mood-cause">{page.charState.mood.causes[page.charState.mood.causes.length - 1]}</span>
				{/if}
			</div>
			<div class="mood-indicator">
				<div class="mood-pulse"></div>
			</div>
		</div>
	</div>

	<!-- Activity - Sims-style stat tiles -->
	<div class="activity-section">
		<span class="settings-label">Activity</span>
		<div class="activity-grid">
			<div class="activity-tile" style="--tile-color: #ff8f3f; --tile-glow: rgba(255, 143, 63, 0.4)">
				<div class="activity-tile-icon">
					<Icon name="flame" size={16} />
				</div>
				<span class="activity-tile-value">{page.charState.currentStreak}</span>
				<span class="activity-tile-label">Streak</span>
			</div>
			<div class="activity-tile" style="--tile-color: #fbbf24; --tile-glow: rgba(251, 191, 36, 0.4)">
				<div class="activity-tile-icon">
					<Icon name="trophy" size={16} />
				</div>
				<span class="activity-tile-value">{page.charState.longestStreak}</span>
				<span class="activity-tile-label">Best</span>
			</div>
			<div class="activity-tile" style="--tile-color: #4dd0ff; --tile-glow: rgba(77, 208, 255, 0.4)">
				<div class="activity-tile-icon">
					<Icon name="message-circle" size={16} />
				</div>
				<span class="activity-tile-value">{page.charState.totalInteractions}</span>
				<span class="activity-tile-label">Chats</span>
			</div>
			<div class="activity-tile" style="--tile-color: #4ade80; --tile-glow: rgba(74, 222, 128, 0.4)">
				<div class="activity-tile-icon">
					<Icon name="calendar" size={16} />
				</div>
				<span class="activity-tile-value">{page.charState.daysKnown}</span>
				<span class="activity-tile-label">Days</span>
			</div>
		</div>
	</div>

	<!-- Events (Dating Sim Mode only, collapsible) - Sims-style achievements -->
	{#if page.isDatingSimMode}
		<div class="events-section">
			<button class="events-toggle" aria-expanded={page.eventsExpanded} onclick={() => page.eventsExpanded = !page.eventsExpanded}>
				<div class="events-toggle-icon">
					<Icon name="star" size={16} />
				</div>
				<span>Achievements</span>
				{#if page.achievements.length > 0}
					<span class="events-count">{page.achievements.length}</span>
				{/if}
				<Icon name={page.eventsExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
			</button>

			{#if page.eventsExpanded}
				<div class="events-content" transition:slideOpen>
					{#if page.achievements.length > 0}
						<div class="events-list">
							{#each page.achievements as achievement, i}
								{@const config = page.achievementConfig[achievement.type]}
								<div
									class="achievement-card"
									style="--event-color: {config.color}; --event-bg: {config.bgColor}; --delay: {i}"
								>
									<div class="achievement-badge">
										<Icon name={config.icon} size={18} />
									</div>
									<div class="achievement-info">
										<span class="achievement-name">{achievement.name}</span>
										<div class="achievement-meta">
											<span class="achievement-type">{config.label}</span>
											<span class="achievement-date">{page.formatAchievementDate(achievement.completedAt)}</span>
										</div>
									</div>
									<div class="achievement-check">
										<Icon name="check" size={14} strokeWidth={3} />
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="events-empty">
							<div class="empty-icon">
								<Icon name="sparkles" size={28} />
							</div>
							<span class="empty-title">No achievements yet</span>
							<span class="empty-hint">Keep chatting to unlock special moments!</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Companion Mode Section */
	.companion-mode-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1.25rem;
		background: var(--accent-subtle);
		border-radius: var(--radius-lg);
	}

	.companion-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--accent);
		border-radius: var(--radius-full);
		color: #fff;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.companion-description {
		margin: 0;
		text-align: center;
		font-size: 0.75rem;
		color: var(--text-tertiary);
		line-height: 1.5;
	}

	/* Stats Panel (Right) */
	.stats-panel {
		flex: 1 1 45%;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
	}

	.stats-panel > * {
		flex-shrink: 0;
	}

	.loading-stats {
		padding: 1.25rem;
		text-align: center;
		color: var(--text-tertiary);
		font-size: 0.875rem;
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}


	/* Bond Section */
	.bond-section {
		padding: 1.25rem;
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	.bond-progress {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.bond-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.bond-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: var(--stat-intimacy);
		border-radius: var(--radius-md);
		color: #fff;
	}

	.bond-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.bond-tier {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.bond-description {
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}

	.bond-percent {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--stat-intimacy);
	}

	.bond-bar-track {
		position: relative;
		height: 8px;
		background: var(--bg-tertiary);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.bond-bar-fill {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		background: var(--stat-intimacy);
		border-radius: var(--radius-full);
		transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.bond-bar-markers {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
	}

	.bond-marker {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--border-light);
	}

	/* Stats Section */
	.stats-section {
		padding: 1rem 1.25rem;
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	/* Vertical Stat Bars */
	.sims-stat-bars {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.5rem 0;
	}

	.sims-stat-bars.single {
		justify-content: center;
	}

	.sims-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
	}

	.sims-bar-track {
		width: 20px;
		height: 80px;
		background: var(--bg-tertiary);
		border-radius: var(--radius-full);
		position: relative;
		overflow: hidden;
	}

	.sims-bar-track.tall {
		height: 100px;
		width: 24px;
	}

	.sims-bar-fill {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--bar-color);
		border-radius: var(--radius-full);
		transition: height 0.5s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.sims-stat-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		background: var(--bg-secondary);
		border-radius: var(--radius-sm);
		color: var(--bar-color);
	}

	.sims-stat-label {
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-tertiary);
	}

	.companion-energy {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.companion-energy .sims-stat-bars {
		width: 100%;
	}

	/* Mood Section */
	.mood-section {
		padding: 1rem 1.25rem;
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	.mood-card {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.75rem;
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
	}

	.mood-icon-badge {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		background: var(--mood-color);
		border-radius: var(--radius-md);
		color: #fff;
		flex-shrink: 0;
	}

	.mood-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.mood-name {
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.mood-cause {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		font-style: italic;
	}

	.mood-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.mood-pulse {
		width: 10px;
		height: 10px;
		background: var(--mood-color);
		border-radius: var(--radius-full);
		animation: mood-pulse 2s ease-in-out infinite;
	}

	@keyframes mood-pulse {
		0%, 100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.2);
			opacity: 0.7;
		}
	}

	/* Activity Section */
	.activity-section {
		padding: 1rem 1.25rem;
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	.activity-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.625rem;
	}

	.activity-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
		padding: 0.875rem 0.5rem;
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
		transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s ease;
	}

	.activity-tile:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-sm);
	}

	.activity-tile-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: var(--tile-color);
		border-radius: var(--radius-sm);
		color: #fff;
	}

	.activity-tile-value {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
		line-height: 1.2;
	}

	.activity-tile-label {
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-tertiary);
	}

	/* Events / Achievements Section */
	.events-section {
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: var(--shadow-sm);
	}

	.events-toggle {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 1rem 1.25rem;
		background: transparent;
		border: none;
		color: var(--text-secondary);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.events-toggle:hover {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	.events-toggle-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: var(--color-warning);
		border-radius: var(--radius-sm);
		color: #fff;
	}

	.events-toggle span {
		flex: 1;
		text-align: left;
	}

	.events-count {
		font-size: 0.7rem;
		font-weight: 700;
		color: #fff;
		background: var(--accent);
		padding: 0.25rem 0.625rem;
		border-radius: var(--radius-full);
	}

	.events-content {
		padding: 0 1rem 1.25rem;
	}

	.events-list {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.achievement-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
		transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s ease;
		animation: achievement-slide 0.3s ease-out backwards;
		animation-delay: calc(var(--delay) * 50ms);
	}

	@keyframes achievement-slide {
		from {
			opacity: 0;
			transform: translateX(-10px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.achievement-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-sm);
	}

	.achievement-badge {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: var(--event-color);
		border-radius: var(--radius-md);
		color: #fff;
		flex-shrink: 0;
	}

	.achievement-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.achievement-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.achievement-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
	}

	.achievement-type {
		color: var(--event-color);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.achievement-date {
		color: var(--text-tertiary);
	}

	.achievement-date::before {
		content: '•';
		margin-right: 0.5rem;
		opacity: 0.5;
	}

	.achievement-check {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		background: var(--color-success);
		border-radius: var(--radius-full);
		color: #fff;
		flex-shrink: 0;
	}

	.events-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.625rem;
		padding: 2rem 1rem;
		text-align: center;
	}

	.empty-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		background: var(--bg-secondary);
		border-radius: var(--radius-lg);
		color: var(--text-tertiary);
	}

	.empty-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.empty-hint {
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}

	/* Mobile */
	@media (max-width: 900px) {
		.stats-panel {
			flex: none;
			overflow: visible;
		}

		.activity-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
