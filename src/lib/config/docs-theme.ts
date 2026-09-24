// Blog and legal pages still style themselves with --docs-* names; these alias
// the site tokens in app.css. The docs pages use the app theme directly.
export const lightVars: Record<string, string> = {
	'--docs-bg': 'var(--bg-page)',
	'--docs-bg-solid': 'var(--bg-primary)',
	'--docs-text': 'var(--text-primary)',
	'--docs-text-muted': 'var(--text-secondary)',
	'--docs-border': 'var(--border-light)',
	'--docs-border-solid': 'var(--border-light)',
	'--docs-surface': 'var(--bg-secondary)',
	'--docs-surface-solid': 'var(--bg-primary)',
	'--docs-code-bg': 'var(--bg-secondary)',
	'--docs-accent': 'var(--accent)',
	'--docs-accent-light': 'var(--accent)',
	'--docs-accent-hover': 'var(--accent-hover)',
	'--docs-logo-filter': 'brightness(0)',
	'--docs-glow': 'var(--accent-muted)',
	'--docs-glow-strong': 'var(--accent-muted)',
	'--docs-inner-highlight': 'transparent',
	'--docs-inner-shadow': 'transparent',
	'--docs-glass-bg': 'var(--bg-secondary)',
	'--docs-glass-border': 'var(--border-subtle)',
	'--docs-panel-gradient': 'var(--bg-secondary)',
	'--docs-btn-gradient': 'var(--accent)',
	'--docs-btn-gradient-hover': 'var(--accent-hover)',
	'--docs-btn-shadow': 'var(--shadow-sm)',
	'--docs-btn-shadow-hover': 'var(--shadow-md)'
};
