// Shared background system for the regular scene and photo mode. Presets are
// defined once: gradients and solids as CSS-compatible values, patterns as
// procedurally drawn canvas tiles reused for both the live CSS preview (as a
// data URL) and capture compositing (as a canvas pattern), so what the user
// sees behind her is exactly what a photo bakes.

export interface SceneBackground {
	type: 'default' | 'transparent' | 'solid' | 'gradient' | 'pattern' | 'image';
	// solid: CSS color; gradient: "colorA,colorB" top to bottom; pattern: tile id;
	// image: stored image id (see storage/scene-background-images.ts)
	value?: string;
}

export interface BackgroundPreset {
	id: string;
	label: string;
	bg: SceneBackground;
	swatch: string;
	// Transparent only makes sense for photo captures
	photoOnly?: boolean;
}

// --- Pattern tiles -----------------------------------------------------------

type TilePainter = (ctx: CanvasRenderingContext2D, size: number) => void;

const TILE_SIZE = 96;

function paintDots(ctx: CanvasRenderingContext2D, s: number) {
	ctx.fillStyle = '#ffd9e8';
	ctx.fillRect(0, 0, s, s);
	ctx.fillStyle = '#ffffff';
	const r = s * 0.09;
	for (const [cx, cy] of [
		[s * 0.25, s * 0.25],
		[s * 0.75, s * 0.75]
	]) {
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.fill();
	}
}

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
	const s = size;
	ctx.beginPath();
	ctx.moveTo(cx, cy + s * 0.3);
	ctx.bezierCurveTo(cx - s * 0.5, cy - s * 0.1, cx - s * 0.3, cy - s * 0.45, cx, cy - s * 0.2);
	ctx.bezierCurveTo(cx + s * 0.3, cy - s * 0.45, cx + s * 0.5, cy - s * 0.1, cx, cy + s * 0.3);
	ctx.closePath();
}

function paintHearts(ctx: CanvasRenderingContext2D, s: number) {
	ctx.fillStyle = '#fff1f4';
	ctx.fillRect(0, 0, s, s);
	ctx.fillStyle = '#ffb7cd';
	heartPath(ctx, s * 0.28, s * 0.3, s * 0.3);
	ctx.fill();
	ctx.fillStyle = '#ffd3e0';
	heartPath(ctx, s * 0.74, s * 0.72, s * 0.22);
	ctx.fill();
}

function sparklePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
	// Four-point sparkle: points pulled toward the center between tips
	ctx.beginPath();
	ctx.moveTo(cx, cy - r);
	ctx.quadraticCurveTo(cx, cy, cx + r, cy);
	ctx.quadraticCurveTo(cx, cy, cx, cy + r);
	ctx.quadraticCurveTo(cx, cy, cx - r, cy);
	ctx.quadraticCurveTo(cx, cy, cx, cy - r);
	ctx.closePath();
}

function paintSparkles(ctx: CanvasRenderingContext2D, s: number) {
	ctx.fillStyle = '#eee4ff';
	ctx.fillRect(0, 0, s, s);
	ctx.fillStyle = '#ffffff';
	sparklePath(ctx, s * 0.3, s * 0.28, s * 0.16);
	ctx.fill();
	ctx.fillStyle = '#d9c6ff';
	sparklePath(ctx, s * 0.72, s * 0.7, s * 0.11);
	ctx.fill();
	ctx.fillStyle = '#ffffff';
	sparklePath(ctx, s * 0.82, s * 0.22, s * 0.07);
	ctx.fill();
}

function paintStripes(ctx: CanvasRenderingContext2D, s: number) {
	ctx.fillStyle = '#e2fff4';
	ctx.fillRect(0, 0, s, s);
	ctx.strokeStyle = '#bdf3de';
	ctx.lineWidth = s * 0.14;
	ctx.lineCap = 'butt';
	// Diagonal candy stripes; extend past the tile so the repeat seams cleanly
	for (let offset = -s; offset <= s * 2; offset += s / 2) {
		ctx.beginPath();
		ctx.moveTo(offset - s * 0.25, -s * 0.25);
		ctx.lineTo(offset + s * 1.25, s * 1.25);
		ctx.stroke();
	}
}

function paintGingham(ctx: CanvasRenderingContext2D, s: number) {
	ctx.fillStyle = '#fff7ef';
	ctx.fillRect(0, 0, s, s);
	ctx.fillStyle = 'rgba(255, 200, 165, 0.55)';
	ctx.fillRect(0, 0, s / 2, s);
	ctx.fillRect(0, 0, s, s / 2);
	ctx.fillStyle = 'rgba(255, 178, 132, 0.45)';
	ctx.fillRect(0, 0, s / 2, s / 2);
}

const TILE_PAINTERS: Record<string, TilePainter> = {
	dots: paintDots,
	hearts: paintHearts,
	sparkles: paintSparkles,
	stripes: paintStripes,
	gingham: paintGingham
};

const tileCache = new Map<string, HTMLCanvasElement>();

function getPatternTile(id: string): HTMLCanvasElement | null {
	if (typeof document === 'undefined') return null;
	const painter = TILE_PAINTERS[id];
	if (!painter) return null;
	let tile = tileCache.get(id);
	if (!tile) {
		tile = document.createElement('canvas');
		tile.width = TILE_SIZE;
		tile.height = TILE_SIZE;
		const ctx = tile.getContext('2d');
		if (!ctx) return null;
		painter(ctx, TILE_SIZE);
		tileCache.set(id, tile);
	}
	return tile;
}

// --- Presets -----------------------------------------------------------------

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
	{ id: 'default', label: 'Default', bg: { type: 'default' }, swatch: 'var(--bg-tertiary)' },
	{
		id: 'transparent',
		label: 'Clear',
		bg: { type: 'transparent' },
		swatch: 'repeating-conic-gradient(#d9d9d9 0% 25%, #ffffff 0% 50%) 0 0 / 10px 10px',
		photoOnly: true
	},
	{ id: 'white', label: 'White', bg: { type: 'solid', value: '#ffffff' }, swatch: '#ffffff' },
	{ id: 'black', label: 'Black', bg: { type: 'solid', value: '#0b0b0d' }, swatch: '#0b0b0d' },
	{
		id: 'mist',
		label: 'Mist',
		bg: { type: 'gradient', value: '#dfe9f3,#ffffff' },
		swatch: 'linear-gradient(180deg, #dfe9f3, #ffffff)'
	},
	{
		id: 'blossom',
		label: 'Blossom',
		bg: { type: 'gradient', value: '#fbd3e0,#fde8d7' },
		swatch: 'linear-gradient(180deg, #fbd3e0, #fde8d7)'
	},
	{
		id: 'lagoon',
		label: 'Lagoon',
		bg: { type: 'gradient', value: '#c2e9fb,#e0f7e9' },
		swatch: 'linear-gradient(180deg, #c2e9fb, #e0f7e9)'
	},
	{
		id: 'sakura',
		label: 'Sakura',
		bg: { type: 'gradient', value: '#ffdee9,#fdf3f8' },
		swatch: 'linear-gradient(180deg, #ffdee9, #fdf3f8)'
	},
	{
		id: 'peach',
		label: 'Peach',
		bg: { type: 'gradient', value: '#ffecd2,#fcc5b1' },
		swatch: 'linear-gradient(180deg, #ffecd2, #fcc5b1)'
	},
	{
		id: 'lavender',
		label: 'Lavender',
		bg: { type: 'gradient', value: '#e8d5ff,#cfe4ff' },
		swatch: 'linear-gradient(180deg, #e8d5ff, #cfe4ff)'
	},
	{ id: 'dots', label: 'Dots', bg: { type: 'pattern', value: 'dots' }, swatch: '' },
	{ id: 'hearts', label: 'Hearts', bg: { type: 'pattern', value: 'hearts' }, swatch: '' },
	{ id: 'sparkles', label: 'Sparkles', bg: { type: 'pattern', value: 'sparkles' }, swatch: '' },
	{ id: 'stripes', label: 'Stripes', bg: { type: 'pattern', value: 'stripes' }, swatch: '' },
	{ id: 'gingham', label: 'Gingham', bg: { type: 'pattern', value: 'gingham' }, swatch: '' }
];

// Pattern swatches show the real tile; resolved lazily in the browser
export function presetSwatch(preset: BackgroundPreset): string {
	if (preset.bg.type === 'pattern' && preset.bg.value) {
		const tile = getPatternTile(preset.bg.value);
		if (tile) return `url(${tile.toDataURL()}) 0 0 / 48px 48px`;
	}
	return preset.swatch;
}

// Source rect that covers the destination like CSS background-size: cover, centered
export function coverCrop(
	srcW: number,
	srcH: number,
	dstW: number,
	dstH: number
): { sx: number; sy: number; sw: number; sh: number } {
	if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return { sx: 0, sy: 0, sw: srcW, sh: srcH };
	const scale = Math.max(dstW / srcW, dstH / srcH);
	const sw = dstW / scale;
	const sh = dstH / scale;
	return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

// CSS for the live preview layer behind the transparent GL canvas
export function backgroundToCss(bg: SceneBackground, imageUrl?: string | null): string | undefined {
	if (bg.type === 'image') return imageUrl ? `url("${imageUrl}") center / cover no-repeat` : undefined;
	if (bg.type === 'solid' && bg.value) return bg.value;
	if (bg.type === 'gradient' && bg.value) return `linear-gradient(180deg, ${bg.value})`;
	if (bg.type === 'pattern' && bg.value) {
		const tile = getPatternTile(bg.value);
		if (tile) return `url(${tile.toDataURL()}) repeat 0 0 / ${TILE_SIZE}px ${TILE_SIZE}px`;
	}
	if (bg.type === 'transparent') {
		return 'repeating-conic-gradient(#d4d4d4 0% 25%, #f5f5f5 0% 50%) 0 0 / 22px 22px';
	}
	return undefined;
}

// Capture compositing. pixelScale maps CSS pixels to capture pixels so a
// supersampled photo shows the pattern at the same visual size as the preview.
export function drawSceneBackground(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	bg: SceneBackground,
	pixelScale = 1,
	image?: CanvasImageSource & { width: number; height: number }
): void {
	if (bg.type === 'image') {
		if (!image) return;
		const { sx, sy, sw, sh } = coverCrop(image.width, image.height, width, height);
		ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
	} else if (bg.type === 'solid' && bg.value) {
		ctx.fillStyle = bg.value;
		ctx.fillRect(0, 0, width, height);
	} else if (bg.type === 'gradient' && bg.value) {
		const [from, to] = bg.value.split(',');
		const gradient = ctx.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, from?.trim() || '#ffffff');
		gradient.addColorStop(1, to?.trim() || '#ffffff');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
	} else if (bg.type === 'pattern' && bg.value) {
		const tile = getPatternTile(bg.value);
		if (!tile) return;
		const pattern = ctx.createPattern(tile, 'repeat');
		if (!pattern) return;
		ctx.save();
		ctx.scale(pixelScale, pixelScale);
		ctx.fillStyle = pattern;
		ctx.fillRect(0, 0, width / pixelScale, height / pixelScale);
		ctx.restore();
	}
	// 'default' captures the opaque scene as-is; 'transparent' leaves alpha alone
}

export function sanitizeSceneBackground(raw: unknown): SceneBackground {
	if (raw && typeof raw === 'object') {
		const bg = raw as SceneBackground;
		if (bg.type === 'solid' && typeof bg.value === 'string') return { type: 'solid', value: bg.value };
		if (bg.type === 'gradient' && typeof bg.value === 'string')
			return { type: 'gradient', value: bg.value };
		if (bg.type === 'pattern' && typeof bg.value === 'string' && TILE_PAINTERS[bg.value])
			return { type: 'pattern', value: bg.value };
		if (bg.type === 'image' && typeof bg.value === 'string' && bg.value)
			return { type: 'image', value: bg.value };
	}
	return { type: 'default' };
}
