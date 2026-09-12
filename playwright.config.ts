import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/browser',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	timeout: 45_000,
	use: {
		baseURL: 'http://127.0.0.1:5188',
		// Keep DOM/action traces without continuously recording the animated 3D canvas.
		// Visual review screenshots are captured explicitly by the tests.
		trace: { mode: 'retain-on-failure', screenshots: false }
	},
	projects: [
		{
			name: 'desktop',
			use: {
				...devices['Desktop Chrome'],
				// Hosted runners have no GPU. Use the software backend we exercise locally.
				launchOptions: process.env.CI
					? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
					: undefined
			}
		},
		{ name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } }
	],
	webServer: {
		command: 'pnpm dev --host 127.0.0.1 --port 5188',
		url: 'http://127.0.0.1:5188/app/settings/display',
		reuseExistingServer: false
	}
});
