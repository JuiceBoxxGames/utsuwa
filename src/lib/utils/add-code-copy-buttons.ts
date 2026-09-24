import { tick } from 'svelte';

// Lucide copy and check, inlined since these buttons are built outside Svelte.
const svg = (body: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const copyIcon = svg('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
const checkIcon = svg('<path d="M20 6 9 17l-5-5"/>');

export function addCodeCopyButtons(containerSelector: string) {
	tick().then(() => {
		document.querySelectorAll(`${containerSelector} pre`).forEach((pre) => {
			if (pre.querySelector('.copy-btn')) return;

			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'copy-btn';
			btn.innerHTML = copyIcon;
			btn.title = 'Copy code';
			btn.setAttribute('aria-label', 'Copy code');
			btn.onclick = async () => {
				const code = pre.querySelector('code')?.textContent || pre.textContent || '';
				await navigator.clipboard.writeText(code);
				btn.innerHTML = checkIcon;
				btn.setAttribute('aria-label', 'Copied');
				setTimeout(() => {
					btn.innerHTML = copyIcon;
					btn.setAttribute('aria-label', 'Copy code');
				}, 2000);
			};
			pre.appendChild(btn);
		});
	});
}
