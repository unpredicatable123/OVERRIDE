import type { ChallengeView, SubmitResult, TeamStateView } from '#lib/engine/views.ts';
import { api, ApiError } from './api.ts';
import { clock } from './clock.svelte.ts';
import { sound } from './sound.svelte.ts';

export interface Verdict {
	id: number;
	result: SubmitResult;
}

/**
 * What the protocol views need from a game backend. Implemented by `TeamGame` (live, server
 * authoritative) and `DemoGame` (local sandbox with demo-only content).
 */
export interface GameClient {
	readonly view: TeamStateView | null;
	readonly verdict: Verdict | null;
	readonly submitting: string | null;
	readonly notice: string | null;
	open(id: string): Promise<ChallengeView | null>;
	submit(id: string, answer: string): Promise<SubmitResult | null>;
	refresh(): Promise<void>;
}

/**
 * Player-side game client. Holds the team's server-projected view; never computes XP or
 * correctness itself — it sends intents and renders what the server returns.
 */
export class TeamGame implements GameClient {
	view = $state<TeamStateView | null>(null);
	error = $state<string | null>(null);
	notice = $state<string | null>(null);
	verdict = $state<Verdict | null>(null);
	submitting = $state<string | null>(null);
	starting = $state(false);

	private inflight: Promise<void> | null = null;
	private queued = false;
	private debounce: ReturnType<typeof setTimeout> | null = null;
	private verdictSeq = 0;
	private noticeTimer: ReturnType<typeof setTimeout> | null = null;

	async refresh(): Promise<void> {
		if (this.inflight) {
			this.queued = true;
			return this.inflight;
		}
		this.inflight = (async () => {
			try {
				const v = await api<TeamStateView>('/api/team/state');
				clock.sync(v.serverNow);
				this.view = v;
				this.error = null;
			} catch (e) {
				if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
					this.error = e.message;
				}
			} finally {
				this.inflight = null;
				if (this.queued) {
					this.queued = false;
					void this.refresh();
				}
			}
		})();
		return this.inflight;
	}

	/** Coalesces bursts of realtime hints (teammate activity) into one fetch. */
	scheduleRefresh(ms = 350) {
		if (this.debounce) clearTimeout(this.debounce);
		this.debounce = setTimeout(() => {
			this.debounce = null;
			void this.refresh();
		}, ms);
	}

	dispose() {
		if (this.debounce) clearTimeout(this.debounce);
		if (this.noticeTimer) clearTimeout(this.noticeTimer);
	}

	private patch(ch: ChallengeView) {
		if (!this.view) return;
		const i = this.view.challenges.findIndex((c) => c.id === ch.id);
		if (i >= 0) this.view.challenges[i] = ch;
	}

	flash(message: string) {
		this.notice = message;
		if (this.noticeTimer) clearTimeout(this.noticeTimer);
		this.noticeTimer = setTimeout(() => (this.notice = null), 2600);
	}

	async open(id: string): Promise<ChallengeView | null> {
		try {
			const res = await api<{ challenge: ChallengeView; serverNow: number }>('/api/team/open', { challengeId: id });
			clock.sync(res.serverNow);
			this.patch(res.challenge);
			return res.challenge;
		} catch (e) {
			this.flash(e instanceof Error ? e.message : 'Signal lost');
			void this.refresh();
			return null;
		}
	}

	/** Self-paced run: start the team's own clock on the protocol that just opened. */
	async startRound(protocol: string): Promise<boolean> {
		if (this.starting) return false;
		this.starting = true;
		try {
			const res = await api<{ serverNow: number }>('/api/team/round', { protocol });
			clock.sync(res.serverNow);
			await this.refresh();
			return true;
		} catch (e) {
			sound.play('deny');
			this.flash(e instanceof Error ? e.message : 'Signal lost');
			void this.refresh();
			return false;
		} finally {
			this.starting = false;
		}
	}

	async submit(id: string, answer: string): Promise<SubmitResult | null> {
		if (this.submitting) return null;
		this.submitting = id;
		try {
			const result = await api<SubmitResult>('/api/team/submit', { challengeId: id, answer });
			this.patch(result.challenge);
			this.verdict = { id: ++this.verdictSeq, result };
			if (result.outcome === 'accepted') {
				sound.play('accept');
				setTimeout(() => sound.play(result.bonusXp > 0 || result.nextUnlocked ? 'unlock' : 'xp'), 160);
			} else sound.play('deny');
			void this.refresh();
			return result;
		} catch (e) {
			sound.play('deny');
			this.flash(e instanceof Error ? e.message : 'Signal lost');
			void this.refresh();
			return null;
		} finally {
			this.submitting = null;
		}
	}
}
