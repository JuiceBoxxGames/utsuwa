import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/browser',
	fullyParallel: false,
	workers: 1,
	timeout: 45_000,
	use: { baseURL: 'http://127.0.0.1:5188', trace: 'retain-on-failure' },
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } }
	],
	webServer: {
		command: 'pnpm dev --host 127.0.0.1 --port 5188',
		url: 'http://127.0.0.1:5188/app/settings/display',
		reuseExistingServer: false
	}
});
