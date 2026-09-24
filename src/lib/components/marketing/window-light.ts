// Late light through a four-pane window onto a plaster wall, with a tree
// outside dappling it. The live canvas runs this shader; the static
// backdrop-window-*.webp images underneath were rendered from it too.

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';
export const TIMES: TimeOfDay[] = ['morning', 'day', 'evening', 'night'];

// The room's light follows the visitor's clock.
export function timeOfDay(hour: number): TimeOfDay {
	if (hour >= 5 && hour < 11) return 'morning';
	if (hour >= 11 && hour < 17) return 'day';
	if (hour >= 17 && hour < 21) return 'evening';
	return 'night';
}

// Shape of the static backdrop images; the live canvas crops the same way.
export const IMAGE_W = 2000;
export const IMAGE_H = 2200;

// Same crop as `background-size: cover; background-position: center top`,
// as the fraction of the image visible along each axis.
export function coverScale(width: number, height: number): [number, number] {
	const s = Math.max(width / IMAGE_W, height / IMAGE_H);
	return [width / IMAGE_W / s, height / IMAGE_H / s];
}

export type Palette = {
	wallTop: string;
	wallBottom: string;
	sun: string;
	sunAmt: number;
	glow: string;
	lamp: string;
	lampAmt: number;
	shear: number;
	angle: number;
	blur: number;
	// CSS for the page chrome over this light
	base: string;
	scrim: string;
	glassGlow: string;
};

export const PALETTES: Record<TimeOfDay, Palette> = {
	morning: {
		wallTop: '#6c5560',
		wallBottom: '#8a6a6c',
		sun: '#fff0dc',
		sunAmt: 0.82,
		glow: '#ffd6c0',
		lamp: '#ffb070',
		lampAmt: 0,
		shear: 0.3,
		angle: -0.06,
		blur: 0.007,
		base: '#7d6166',
		scrim: 'rgba(40, 28, 40, 0.3)',
		glassGlow: 'rgba(255, 236, 228, 0.55)'
	},
	day: {
		wallTop: '#624240',
		wallBottom: '#8a5c4a',
		sun: '#ffcc92',
		sunAmt: 0.9,
		glow: '#ff9660',
		lamp: '#ffb070',
		lampAmt: 0,
		shear: 0.42,
		angle: -0.1,
		blur: 0.006,
		base: '#7a5448',
		scrim: 'rgba(40, 20, 16, 0.32)',
		glassGlow: 'rgba(255, 222, 196, 0.5)'
	},
	evening: {
		wallTop: '#4a3040',
		wallBottom: '#74463f',
		sun: '#ff9d55',
		sunAmt: 0.85,
		glow: '#ff7a40',
		lamp: '#ffae66',
		lampAmt: 0.1,
		shear: 0.62,
		angle: -0.16,
		blur: 0.009,
		base: '#5e3a3e',
		scrim: 'rgba(30, 12, 20, 0.35)',
		glassGlow: 'rgba(255, 196, 150, 0.45)'
	},
	night: {
		wallTop: '#1e2138',
		wallBottom: '#36324a',
		sun: '#b8c8f0',
		sunAmt: 0.42,
		glow: '#6f86c8',
		lamp: '#ffa860',
		lampAmt: 0.16,
		shear: 0.35,
		angle: -0.08,
		blur: 0.004,
		base: '#2a2a42',
		scrim: 'rgba(8, 10, 24, 0.4)',
		glassGlow: 'rgba(190, 205, 255, 0.4)'
	}
};

export function rgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Uniform values for one palette.
export function paletteUniforms(p: Palette): Record<string, number | number[]> {
	return {
		uWallTop: rgb(p.wallTop),
		uWallBottom: rgb(p.wallBottom),
		uSun: rgb(p.sun),
		uSunAmt: p.sunAmt,
		uGlow: rgb(p.glow),
		uLamp: rgb(p.lamp),
		uLampAmt: p.lampAmt,
		uShear: p.shear,
		uAngle: p.angle,
		uBlur: p.blur
	};
}

// GLSL ES 1.0, so it runs on plain WebGL and inside three.js alike.
export const WINDOW_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform vec2 uCover;
uniform float uTime;
uniform float uDrift;
uniform float uSeed;
uniform vec3 uWallTop;
uniform vec3 uWallBottom;
uniform vec3 uSun;
uniform vec3 uGlow;
uniform vec3 uLamp;
uniform float uSunAmt;
uniform float uLampAmt;
uniform float uShear;
uniform float uAngle;
uniform float uBlur;

const float ASPECT = ${IMAGE_W}.0 / ${IMAGE_H}.0;

vec2 hash(vec2 p) {
	p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
	return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
	const float K1 = 0.366025404;
	const float K2 = 0.211324865;
	vec2 i = floor(p + (p.x + p.y) * K1);
	vec2 a = p - i + (i.x + i.y) * K2;
	vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
	vec2 b = a - o + K2;
	vec2 c = a - 1.0 + 2.0 * K2;
	vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
	vec3 n = h * h * h * h * vec3(dot(a, hash(i)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
	return dot(n, vec3(70.0));
}

float fbm4(vec2 p) {
	float f = 0.0;
	float a = 0.5;
	mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
	for (int i = 0; i < 4; i++) {
		f += a * noise(p);
		p = m * p;
		a *= 0.5;
	}
	return f;
}

float sdBox(vec2 p, vec2 b) {
	vec2 d = abs(p) - b;
	return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float blob(vec2 w, vec2 c, float r) {
	vec2 d = w - c;
	return exp(-dot(d, d) / (r * r));
}

vec3 lin(vec3 c) {
	return pow(c, vec3(2.2));
}

// One window's light on the wall: sheared, softly focused, dappled by leaves
float sunPatch(vec2 p, vec2 center, vec2 hs, float seed) {
	vec2 q = p - center;
	float ca = cos(uAngle);
	float sa = sin(uAngle);
	q = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);
	q.x -= q.y * uShear;
	// Penumbra widens toward the far edge, like a real projected window
	float soft = uBlur * (1.0 + 2.2 * clamp((hs.y - q.y) / (2.0 * hs.y), 0.0, 1.0));
	float outer = 1.0 - smoothstep(-soft, soft, sdBox(q, hs));
	if (outer <= 0.0) return 0.0;
	float bars = min(abs(q.x), abs(q.y - hs.y * 0.12)) - 0.006;
	float lit = outer * smoothstep(-soft, soft, bars);
	// Leaves sit well outside the glass, so their shadows land soft, and sway
	vec2 lp = q * 4.2 + seed;
	lp += vec2(0.07 * sin(uTime * 0.8 + lp.y * 1.7), 0.05 * cos(uTime * 0.6 + lp.x * 1.3));
	float leaf = fbm4(lp) + 0.4 * fbm4(lp * 2.6 + 7.0);
	float gap = smoothstep(-0.36, 0.12, leaf + 0.18 * noise(p * 1.3 + seed * 0.5));
	return lit * mix(0.34, 1.0, gap);
}

void main() {
	vec2 z = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
	vec2 uv = vec2((z.x - 0.5) * uCover.x + 0.5, 1.0 - z.y * uCover.y);
	vec2 p = vec2(uv.x * ASPECT, uv.y);

	// The sun slides a little as the page scrolls, and a cloud passes now and then
	vec2 drift = vec2(-0.02, -0.035) * uDrift;
	float cloud = 0.93 + 0.07 * noise(vec2(uTime * 0.04, uSeed));

	vec3 wall = mix(lin(uWallBottom), lin(uWallTop), smoothstep(0.2, 1.0, uv.y));
	float l1 = sunPatch(p, vec2(0.71 * ASPECT, 0.71) + drift, vec2(0.155, 0.185), uSeed);
	float l2 = 0.55 * sunPatch(p, vec2(0.13 * ASPECT, 0.3) + drift, vec2(0.1, 0.14), uSeed + 11.0);
	float lit = max(l1, l2) * cloud;

	vec3 col = mix(wall, lin(uSun), lit * uSunAmt);
	col += lin(uGlow) * 0.07 * blob(p, vec2(0.71 * ASPECT, 0.7) + drift, 0.42);
	col += lin(uGlow) * 0.04 * blob(p, vec2(0.13 * ASPECT, 0.3) + drift, 0.3);
	col += lin(uLamp) * uLampAmt * blob(p, vec2(0.02 * ASPECT, 0.52), 0.34);
	col *= 1.0 + 0.05 * (0.6 * noise(p * 16.0 + uSeed) + 0.4 * noise(p * 52.0 + 3.0));
	vec2 v = (uv - vec2(0.55, 0.6)) * vec2(1.0, 0.9);
	col *= 1.0 - 0.28 * smoothstep(0.35, 0.95, length(v));
	// Lower wall washes out toward the page so the fade into white stays clean
	col = mix(col, lin(vec3(240.0, 228.0, 220.0) / 255.0), smoothstep(0.16, 0.0, uv.y) * 0.9);
	gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;
