import test from 'node:test';
import assert from 'node:assert/strict';
import { LipSyncAnalyzer, type VisemeWeights } from './analyzer.ts';

// Stands in for a Web Audio AnalyserNode (fftSize 256, like every TTS provider)
function fakeAnalyser(level: (bin: number) => number) {
	return {
		frequencyBinCount: 128,
		getByteFrequencyData(out: Uint8Array) {
			for (let i = 0; i < out.length; i++) out[i] = level(i);
		}
	} as unknown as AnalyserNode;
}

function settle(analyser: AnalyserNode): VisemeWeights {
	const lip = new LipSyncAnalyzer();
	lip.setAnalyser(analyser);
	let w = lip.update(1 / 60);
	for (let i = 0; i < 200; i++) w = lip.update(1 / 60);
	return { ...w };
}

const total = (w: VisemeWeights) => w.aa + w.ee + w.ih + w.oh + w.ou;

test('the visemes together never open the mouth past one full shape', () => {
	// Clipped, full-spectrum audio: the loudest input there is
	const w = settle(fakeAnalyser(() => 255));
	assert.ok(total(w) <= 1.0001, `combined mouth weight ${total(w).toFixed(2)} exceeds 1`);
	assert.ok(w.aa >= Math.max(w.ee, w.ih, w.oh, w.ou), 'the open vowel still leads');
});

test('loud speech-shaped audio stays within the budget too', () => {
	// Energy concentrated in the low bands, falling off toward the highs
	const w = settle(fakeAnalyser((bin) => Math.max(0, 255 - bin * 3)));
	assert.ok(total(w) <= 1.0001, `combined mouth weight ${total(w).toFixed(2)} exceeds 1`);
	assert.ok(w.aa > 0.2, 'the mouth still clearly opens');
});

test('silence closes the mouth', () => {
	const w = settle(fakeAnalyser(() => 0));
	assert.ok(total(w) < 0.001);
});
