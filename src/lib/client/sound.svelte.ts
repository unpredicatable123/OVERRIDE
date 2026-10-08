/**
 * Synthesised sound design (soft sines, glass chimes, warm pad) — WebAudio only, zero audio files to download.
 * Audio starts only after a user gesture (`unlock()`), honouring autoplay rules.
 */

export type Cue =
	| 'click'
	| 'type'
	| 'boot'
	| 'accept'
	| 'deny'
	| 'xp'
	| 'unlock'
	| 'tick'
	| 'tickHot'
	| 'alarm'
	| 'boss'
	| 'drum'
	| 'reveal'
	| 'winner'
	| 'glitch';

type Mood = 'calm' | 'boss';

const STORAGE_KEY = 'override.sound';

function loadPrefs(): { enabled: boolean; volume: number; ambient: boolean } {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return { enabled: true, volume: 0.6, ambient: true, ...JSON.parse(raw) };
	} catch {
		/* storage unavailable */
	}
	return { enabled: true, volume: 0.6, ambient: true };
}

class SoundEngine {
	enabled = $state(true);
	volume = $state(0.6);
	ambient = $state(true);
	unlocked = $state(false);

	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private sfx: GainNode | null = null;
	private bed: { gain: GainNode; stop: () => void; mood: Mood } | null = null;
	private mood: Mood = 'calm';
	private noiseBuf: AudioBuffer | null = null;
	private lastType = 0;

	init() {
		const p = loadPrefs();
		this.enabled = p.enabled;
		this.volume = p.volume;
		this.ambient = p.ambient;
	}

	private save() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume, ambient: this.ambient }));
		} catch {
			/* ignore */
		}
	}

	/** Must be called from a user gesture. */
	unlock() {
		if (typeof window === 'undefined') return;
		if (!this.ctx) {
			const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			if (!Ctx) return;
			this.ctx = new Ctx();
			this.master = this.ctx.createGain();
			this.master.connect(this.ctx.destination);
			this.sfx = this.ctx.createGain();
			this.sfx.gain.value = 0.55;
			this.sfx.connect(this.master);
			this.applyVolume();
		}
		void this.ctx.resume();
		this.unlocked = true;
		this.syncBed();
	}

	setEnabled(v: boolean) {
		this.enabled = v;
		this.save();
		if (v) this.unlock();
		this.applyVolume();
		this.syncBed();
	}

	setVolume(v: number) {
		this.volume = Math.min(1, Math.max(0, v));
		this.save();
		this.applyVolume();
	}

	setAmbient(v: boolean) {
		this.ambient = v;
		this.save();
		this.syncBed();
	}

	setMood(m: Mood) {
		if (this.mood === m) return;
		this.mood = m;
		this.syncBed();
	}

	private applyVolume() {
		if (!this.master || !this.ctx) return;
		const target = this.enabled ? this.volume * this.volume : 0;
		this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
	}

	private noise(): AudioBuffer {
		if (this.noiseBuf) return this.noiseBuf;
		const ctx = this.ctx!;
		const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const d = buf.getChannelData(0);
		for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
		return (this.noiseBuf = buf);
	}

	private tone(freq: number, dur: number, opts: { type?: OscillatorType; at?: number; gain?: number; slide?: number; attack?: number } = {}) {
		const ctx = this.ctx!;
		const t = ctx.currentTime + (opts.at ?? 0);
		const osc = ctx.createOscillator();
		const g = ctx.createGain();
		osc.type = opts.type ?? 'square';
		osc.frequency.setValueAtTime(freq, t);
		if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
		const peak = opts.gain ?? 0.2;
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.005));
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		osc.connect(g).connect(this.sfx!);
		osc.start(t);
		osc.stop(t + dur + 0.02);
	}

	private burst(dur: number, opts: { at?: number; gain?: number; freq?: number; q?: number } = {}) {
		const ctx = this.ctx!;
		const t = ctx.currentTime + (opts.at ?? 0);
		const src = ctx.createBufferSource();
		src.buffer = this.noise();
		const f = ctx.createBiquadFilter();
		f.type = 'bandpass';
		f.frequency.value = opts.freq ?? 2000;
		f.Q.value = opts.q ?? 1.2;
		const g = ctx.createGain();
		g.gain.setValueAtTime(opts.gain ?? 0.2, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		src.connect(f).connect(g).connect(this.sfx!);
		src.start(t, Math.random() * 0.5);
		src.stop(t + dur + 0.02);
	}

	play(cue: Cue) {
		if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
		const T = this.tone.bind(this);
		switch (cue) {
			case 'click':
				T(1800, 0.05, { type: 'sine', gain: 0.05 });
				break;
			case 'type': {
				const now = performance.now();
				if (now - this.lastType < 40) return;
				this.lastType = now;
				T(2400 + Math.random() * 600, 0.02, { type: 'sine', gain: 0.018 });
				break;
			}
			case 'boot':
				// Rising major-seventh bloom.
				[261.6, 329.6, 392, 493.9, 523.3].forEach((f, i) => T(f, 1.6, { type: 'sine', at: i * 0.09, gain: 0.07, attack: 0.08 }));
				T(1046.5, 1.2, { type: 'triangle', at: 0.5, gain: 0.04, attack: 0.05 });
				break;
			case 'accept':
				// Glass chime: fifth + octave.
				T(880, 0.5, { type: 'sine', gain: 0.1 });
				T(1318.5, 0.6, { type: 'sine', at: 0.07, gain: 0.08 });
				T(1760, 0.7, { type: 'triangle', at: 0.14, gain: 0.04 });
				break;
			case 'deny':
				T(220, 0.32, { type: 'triangle', slide: 160, gain: 0.12 });
				T(207.7, 0.32, { type: 'sine', slide: 150, gain: 0.08 });
				break;
			case 'xp':
				[1046.5, 1318.5, 1568, 2093].forEach((f, i) => T(f, 0.35, { type: 'sine', at: i * 0.05, gain: 0.045 }));
				break;
			case 'unlock':
				[523.3, 659.3, 784, 1046.5].forEach((f, i) => T(f, 0.6, { type: 'sine', at: i * 0.07, gain: 0.06 }));
				this.burst(0.6, { at: 0.25, freq: 7000, gain: 0.015 });
				break;
			case 'tick':
				T(1200, 0.06, { type: 'sine', gain: 0.06 });
				break;
			case 'tickHot':
				T(1600, 0.09, { type: 'sine', gain: 0.09 });
				T(800, 0.09, { type: 'sine', gain: 0.05 });
				break;
			case 'alarm':
				[784, 659.3, 523.3].forEach((f, i) => T(f, 0.5, { type: 'sine', at: i * 0.18, gain: 0.08 }));
				break;
			case 'boss':
				T(55, 2.4, { type: 'sine', gain: 0.3, attack: 0.05 });
				T(82.4, 2.2, { type: 'triangle', gain: 0.1, attack: 0.3 });
				this.burst(1.6, { freq: 220, gain: 0.12, q: 0.5 });
				[311.1, 293.7, 233.1].forEach((f, i) => T(f, 0.9, { type: 'sine', at: 0.6 + i * 0.35, gain: 0.07 }));
				break;
			case 'drum':
				T(90, 0.22, { type: 'sine', slide: 45, gain: 0.32 });
				this.burst(0.06, { freq: 3000, gain: 0.04 });
				break;
			case 'reveal':
				T(196, 1.4, { type: 'sine', slide: 784, gain: 0.06, attack: 0.3 });
				this.burst(1.2, { at: 0.6, freq: 8000, gain: 0.02 });
				break;
			case 'winner':
				[523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => T(f, 1.8, { type: 'sine', at: i * 0.1, gain: 0.07, attack: 0.02 }));
				[130.8, 196, 261.6].forEach((f) => T(f, 2.4, { type: 'triangle', at: 0.4, gain: 0.07, attack: 0.2 }));
				break;
			case 'glitch':
				this.burst(0.35, { freq: 1200, gain: 0.05, q: 0.7 });
				break;
		}
	}

	/** Background bed: detuned saw drone through a slowly breathing low-pass filter. */
	private syncBed() {
		const want = this.enabled && this.ambient && this.ctx !== null && this.unlocked;
		if (this.bed && (!want || this.bed.mood !== this.mood)) {
			this.bed.stop();
			this.bed = null;
		}
		if (!want || this.bed) return;
		const ctx = this.ctx!;
		const t = ctx.currentTime;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.exponentialRampToValueAtTime(this.mood === 'boss' ? 0.05 : 0.035, t + 4);
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = this.mood === 'boss' ? 700 : 900;
		filter.Q.value = 0.8;
		const lfo = ctx.createOscillator();
		const lfoGain = ctx.createGain();
		lfo.frequency.value = this.mood === 'boss' ? 0.5 : 0.07;
		lfoGain.gain.value = this.mood === 'boss' ? 300 : 350;
		lfo.connect(lfoGain).connect(filter.frequency);
		// Soft chord pad: root, fifth, ninth (minor-ish for the boss).
		const root = this.mood === 'boss' ? 73.4 : 110;
		const ratios = this.mood === 'boss' ? [1, 1.189, 1.498, 2.003] : [1, 1.498, 2.245, 2.003];
		const oscs = ratios.map((r, i) => {
			const o = ctx.createOscillator();
			o.type = i % 2 ? 'sine' : 'triangle';
			o.detune.value = (i - 1.5) * 4;
			const f = root * r;
			o.frequency.value = f;
			o.connect(filter);
			o.start(t);
			return o;
		});
		filter.connect(gain).connect(this.master!);
		lfo.start(t);
		this.bed = {
			gain,
			mood: this.mood,
			stop: () => {
				const now = ctx.currentTime;
				gain.gain.cancelScheduledValues(now);
				gain.gain.setTargetAtTime(0.0001, now, 0.4);
				for (const o of [...oscs, lfo]) o.stop(now + 2);
				setTimeout(() => gain.disconnect(), 2200);
			}
		};
	}
}

export const sound = new SoundEngine();
