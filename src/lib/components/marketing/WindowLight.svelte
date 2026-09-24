<script lang="ts">
	import { onMount } from 'svelte';
	import { WINDOW_FRAGMENT, PALETTES, paletteUniforms, coverScale, type TimeOfDay } from './window-light';

	// Live window light over the static backdrop: leaves sway, a cloud passes,
	// and the sun drifts as the page scrolls. Half resolution (the light is soft
	// anyway), at most 30fps, and only while on screen. The static image stays
	// underneath for no-WebGL and reduced motion.
	let { time }: { time: TimeOfDay } = $props();

	let canvas: HTMLCanvasElement;
	let ready = $state(false);

	onMount(() => {
		const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
		if (!gl) return;

		const compile = (type: number, source: string) => {
			const shader = gl.createShader(type)!;
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			return shader;
		};
		const program = gl.createProgram()!;
		gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'));
		gl.attachShader(program, compile(gl.FRAGMENT_SHADER, WINDOW_FRAGMENT));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
		gl.useProgram(program);

		// One oversized triangle covers the whole canvas
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		const set = (name: string, value: number | number[]) => {
			const loc = gl.getUniformLocation(program, name);
			if (typeof value === 'number') gl.uniform1f(loc, value);
			else if (value.length === 2) gl.uniform2f(loc, value[0], value[1]);
			else gl.uniform3f(loc, value[0], value[1], value[2]);
		};
		set('uSeed', 3.7);

		const zone = canvas.parentElement!;
		const resize = () => {
			const { width, height } = zone.getBoundingClientRect();
			canvas.width = Math.max(1, Math.round(width / 2));
			canvas.height = Math.max(1, Math.round(height / 2));
			gl.viewport(0, 0, canvas.width, canvas.height);
			set('uRes', [canvas.width, canvas.height]);
			set('uCover', coverScale(width, height));
		};
		resize();
		const sizer = new ResizeObserver(resize);
		sizer.observe(zone);

		let onScreen = true;
		const watcher = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting));
		watcher.observe(zone);

		let shown: TimeOfDay | null = null;
		let frame = 0;
		let last = 0;
		const start = performance.now();
		const draw = (now: number) => {
			frame = requestAnimationFrame(draw);
			if (!onScreen || now - last < 33) return;
			last = now;
			if (shown !== time) {
				for (const [name, value] of Object.entries(paletteUniforms(PALETTES[time]))) set(name, value);
				shown = time;
			}
			const r = zone.getBoundingClientRect();
			set('uTime', (now - start) / 1000);
			set('uDrift', Math.min(Math.max(-r.top / r.height, 0), 1));
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			ready = true;
		};
		frame = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(frame);
			sizer.disconnect();
			watcher.disconnect();
			gl.getExtension('WEBGL_lose_context')?.loseContext();
		};
	});
</script>

<canvas bind:this={canvas} class="window-light" class:ready aria-hidden="true"></canvas>

<style>
	.window-light {
		position: absolute;
		inset: 0;
		z-index: -1;
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity 0.8s ease;
	}

	.window-light.ready {
		opacity: 1;
	}
</style>
