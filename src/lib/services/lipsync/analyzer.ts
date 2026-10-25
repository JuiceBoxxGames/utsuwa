export interface VisemeWeights {
	aa: number; // Open mouth (A sound)
	ee: number; // Smile/teeth (E sound)
	ih: number; // Half open (I sound)
	oh: number; // Round (O sound)
	ou: number; // Pursed (U sound)
}

export class LipSyncAnalyzer {
	private analyser: AnalyserNode | null = null;
	private dataArray: Uint8Array | null = null;
	private smoothedWeights: VisemeWeights = { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 };

	// Smoothing parameters
	private readonly ATTACK = 0.3; // Speed to reach target
	private readonly RELEASE = 0.15; // Speed to return to zero
	private readonly VOLUME_THRESHOLD = 0.05; // Silence threshold
	// VRM blends expressions additively, so the visemes stack on one mouth.
	// Their sum is capped at most one full shape, or the jaw clips through
	// the face on loud audio (#289).
	private readonly MOUTH_BUDGET = 1;
	private readonly VOLUME_GAIN = 1.3;

	setAnalyser(analyser: AnalyserNode | null) {
		this.analyser = analyser;
		if (analyser) {
			this.dataArray = new Uint8Array(analyser.frequencyBinCount);
		} else {
			this.dataArray = null;
		}
	}

	update(delta: number): VisemeWeights {
		if (!this.analyser || !this.dataArray) {
			// Smoothly return to neutral
			this.smoothToZero(delta);
			return this.smoothedWeights;
		}

		// Get frequency data
		this.analyser.getByteFrequencyData(this.dataArray as Uint8Array<ArrayBuffer>);

		// Calculate average volume
		let sum = 0;
		for (let i = 0; i < this.dataArray.length; i++) {
			sum += this.dataArray[i];
		}
		const avgVolume = sum / this.dataArray.length / 255;

		// If below threshold, smoothly close mouth
		if (avgVolume < this.VOLUME_THRESHOLD) {
			this.smoothToZero(delta);
			return this.smoothedWeights;
		}

		// Map frequency bands to visemes
		// Low frequencies (bass) -> 'aa' (open mouth)
		// Low-mid frequencies -> 'oh' (round)
		// Mid frequencies -> 'ee' (smile)
		// High frequencies -> 'ih' (half open)
		const target = this.mapFrequenciesToVisemes(avgVolume);

		// Smooth the values
		const rate = this.ATTACK;
		this.smoothedWeights.aa = this.lerp(this.smoothedWeights.aa, target.aa, rate);
		this.smoothedWeights.ee = this.lerp(this.smoothedWeights.ee, target.ee, rate);
		this.smoothedWeights.ih = this.lerp(this.smoothedWeights.ih, target.ih, rate);
		this.smoothedWeights.oh = this.lerp(this.smoothedWeights.oh, target.oh, rate);
		this.smoothedWeights.ou = this.lerp(this.smoothedWeights.ou, target.ou, rate);

		return this.smoothedWeights;
	}

	private mapFrequenciesToVisemes(volume: number): VisemeWeights {
		if (!this.dataArray) {
			return { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 };
		}

		const len = this.dataArray.length;

		// Divide into frequency bands
		const lowEnd = Math.floor(len * 0.1);
		const lowMidEnd = Math.floor(len * 0.25);
		const midEnd = Math.floor(len * 0.5);
		const highEnd = Math.floor(len * 0.75);

		// Calculate band averages
		const low = this.averageRange(0, lowEnd) / 255;
		const lowMid = this.averageRange(lowEnd, lowMidEnd) / 255;
		const mid = this.averageRange(lowMidEnd, midEnd) / 255;
		const high = this.averageRange(midEnd, highEnd) / 255;

		// Map to visemes with volume scaling
		const scale = Math.min(volume * this.VOLUME_GAIN, 1);

		const weights = {
			aa: Math.min(low * 1.5 * scale, 0.8),
			oh: Math.min(lowMid * 1.3 * scale, 0.7),
			ee: Math.min(mid * 1.2 * scale, 0.6),
			ih: Math.min(high * 1.0 * scale, 0.5),
			ou: Math.min((low + lowMid) * 0.5 * scale, 0.6)
		};
		// Shrink the whole mix rather than clip one viseme, so the shape stays
		const sum = weights.aa + weights.oh + weights.ee + weights.ih + weights.ou;
		if (sum > this.MOUTH_BUDGET) {
			const k = this.MOUTH_BUDGET / sum;
			for (const key of Object.keys(weights) as (keyof VisemeWeights)[]) weights[key] *= k;
		}
		return weights;
	}

	private averageRange(start: number, end: number): number {
		if (!this.dataArray || end <= start) return 0;

		let sum = 0;
		for (let i = start; i < end && i < this.dataArray.length; i++) {
			sum += this.dataArray[i];
		}
		return sum / (end - start);
	}

	private smoothToZero(delta: number) {
		const rate = this.RELEASE;
		this.smoothedWeights.aa = this.lerp(this.smoothedWeights.aa, 0, rate);
		this.smoothedWeights.ee = this.lerp(this.smoothedWeights.ee, 0, rate);
		this.smoothedWeights.ih = this.lerp(this.smoothedWeights.ih, 0, rate);
		this.smoothedWeights.oh = this.lerp(this.smoothedWeights.oh, 0, rate);
		this.smoothedWeights.ou = this.lerp(this.smoothedWeights.ou, 0, rate);
	}

	private lerp(current: number, target: number, rate: number): number {
		return current + (target - current) * rate;
	}

	reset() {
		this.smoothedWeights = { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 };
	}
}

// Singleton instance
export const lipSyncAnalyzer = new LipSyncAnalyzer();
