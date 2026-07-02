import type { CRMView } from "../view";
import { div, span, button, initials } from "../util/dom";
import { relDays } from "../util/dates";
import type { Contact } from "../types";

export function renderDashboard(root: HTMLElement, view: CRMView): void {
	const store = view.store;

	if (!store.data.contacts.length) {
		renderEmptyHero(root, view);
		return;
	}

	const m = store.metrics();

	/* ---- headline stats ---------------------------------------------------- */
	const stats = div(root, "scrm-stats");

	const stat = (
		label: string,
		value: string,
		sub: string,
		subCls = "scrm-muted",
	) => {
		const cell = div(stats, "scrm-stat");
		div(cell, "scrm-stat-label", label);
		const row = div(cell, "scrm-stat-row");
		div(row, "scrm-stat-value", value);
		span(row, `scrm-stat-sub ${subCls}`, sub);
	};

	stat(
		"CONTACTED THIS WEEK",
		String(m.contactedThisWeek),
		m.deltaPct === null
			? "first week"
			: `${m.deltaPct >= 0 ? "▲" : "▼"} ${m.deltaPct >= 0 ? "+" : ""}${m.deltaPct}% vs last wk`,
		m.deltaPct !== null && m.deltaPct >= 0 ? "scrm-accent" : "scrm-neg",
	);
	stat("IN CONVERSATION", String(m.inConversation), "active threads");
	stat("REAL COMMITMENTS", String(m.realCommitments), "time · money · rep");
	stat(
		"WON / LOST",
		`${m.won}/${m.lost}`,
		m.winRate === null ? "no closes yet" : `${m.winRate}% win rate`,
	);

	/* ---- two columns: chart + up-next ------------------------------------- */
	const cols = div(root, "scrm-dash-cols");

	// chart --------------------------------------------------------------
	const chartCol = div(cols, "scrm-panel scrm-chart-col");
	const chartHead = div(chartCol, "scrm-panel-head");
	div(chartHead, "scrm-panel-title", "Contacts per week");
	div(chartHead, "scrm-mono-mini", "last 8 weeks");

	const bars = store.weeklyBars(8);
	const max = Math.max(1, ...bars.map((b) => b.count));
	const chart = div(chartCol, "scrm-bars");
	bars.forEach((b, i) => {
		const isCurrent = i === bars.length - 1;
		const percentOfGoal = Math.round((b.count / Math.max(1, m.weeklyGoal)) * 100);
		const col = div(chart, "scrm-bar-col scrm-chart-point");
		col.setAttr("tabindex", "0");
		col.setAttr("role", "img");
		col.setAttr(
			"aria-label",
			`${b.range}: ${b.count} contacts, ${percentOfGoal}% of weekly goal`,
		);
		div(col, "scrm-bar-val" + (isCurrent ? " scrm-accent" : ""), String(b.count));
		const track = div(col, "scrm-bar-track");
		const fill = div(track, "scrm-bar-fill" + (isCurrent ? " is-current" : ""));
		fill.style.height = `${Math.round((b.count / max) * 100)}%`;
		div(col, "scrm-bar-label" + (isCurrent ? " scrm-accent" : ""), b.label);
		const tip = div(col, "scrm-chart-tooltip");
		div(tip, "scrm-chart-tip-range", b.range);
		div(tip, "scrm-chart-tip-count", `${b.count} ${b.count === 1 ? "contact" : "contacts"}`);
		div(tip, "scrm-chart-tip-goal", `${percentOfGoal}% of weekly goal`);
	});

	const goal = div(chartCol, "scrm-goal-row");
	const goalText = div(goal, "scrm-goal-text");
	goalText.appendText("Weekly goal: ");
	goalText.createEl("strong", { text: `${m.weeklyGoal} conversations` });
	div(
		goal,
		"scrm-mono-mini " + (m.goalMet ? "scrm-accent" : "scrm-muted"),
		`${m.contactedThisWeek}/${m.weeklyGoal} ${m.goalMet ? "✓ GOAL MET" : ""}`.trim(),
	);

	// up next ------------------------------------------------------------
	const nextCol = div(cols, "scrm-panel");
	const nextHead = div(nextCol, "scrm-panel-head");
	div(nextHead, "scrm-panel-title", "Active conversations");
	const viewAll = div(nextHead, "scrm-mono-mini scrm-accent scrm-link", "VIEW ALL →");
	viewAll.addEventListener("click", () => view.navigate({ screen: "contacts" }));

	const list = div(nextCol, "scrm-uplist");
	const upcoming = store.upNext(4);
	if (!upcoming.length) {
		div(list, "scrm-empty", "No active internet conversations yet.");
	}
	for (const c of upcoming) {
		const row = div(list, "scrm-uprow");
		row.addEventListener("click", () => view.openContact(c.id));
		div(row, "scrm-avatar", initials(c.name));
		const mid = div(row, "scrm-uprow-mid");
		div(mid, "scrm-uprow-name", c.name);
		const lastTalkedAt = store.lastTalkedAt(c.id);
		const when = lastTalkedAt ?? c.addedAt;
		const whenLabel = lastTalkedAt ? `last talked ${relDays(lastTalkedAt)}` : `created ${relDays(c.addedAt)}`;
		const created = div(mid, "scrm-uprow-sub", whenLabel);
		created.setAttr("title", new Date(when).toLocaleString());
		const state = div(row, "scrm-uprow-badges");
		span(state, "scrm-mono-mini scrm-muted", lastTalkedAt ? "LOGGED" : "NEW");
		const reply = replyState(view, c);
		if (reply) {
			span(
				state,
				`scrm-badge scrm-reply-badge scrm-reply-${reply}`,
				reply === "replied" ? "REPLIED" : "NO REPLY",
			);
		}
	}

	const learn = store.latestLearning();
	if (learn) {
		const box = div(nextCol, "scrm-learnbox");
		div(box, "scrm-panel-label", "LATEST LEARNING");
		div(box, "scrm-learnbox-text", `“${learn}”`);
	}
}

function replyState(view: CRMView, contact: Contact): "replied" | "waiting" | null {
	const latest = view.store.conversationsFor(contact.id)[0];
	if (!latest?.transcript.trim()) return null;
	if (latest.facts.trim() || latest.questionAnswers.length || latest.commitment !== "none") {
		return "replied";
	}
	return transcriptHasProspectReply(latest.transcript, contact.name) ? "replied" : "waiting";
}

function transcriptHasProspectReply(transcript: string, contactName: string): boolean {
	const turns = splitTranscriptTurns(transcript);
	if (turns.length < 2) return false;
	const firstSpeaker = speakerKey(turns.find((turn) => turn.speaker)?.speaker ?? "");
	if (!firstSpeaker) return false;
	const contactKey = speakerKey(contactName);
	return turns.slice(1).some((turn) => {
		const key = speakerKey(turn.speaker ?? "");
		if (!key) return false;
		if (contactKey && (key === contactKey || key.includes(contactKey) || contactKey.includes(key))) {
			return true;
		}
		return key !== firstSpeaker;
	});
}

function splitTranscriptTurns(transcript: string): { speaker: string | null; text: string }[] {
	const lines = transcript
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const turns: { speaker: string | null; text: string }[] = [];
	let current: { speaker: string | null; chunks: string[] } | null = null;
	let foundSpeaker = false;
	const flush = () => {
		if (!current) return;
		const text = current.chunks.join("\n").trim();
		if (text) turns.push({ speaker: current.speaker, text });
		current = null;
	};
	for (const line of lines) {
		if (isSpeakerHeader(line)) {
			foundSpeaker = true;
			flush();
			current = { speaker: line, chunks: [] };
			continue;
		}
		if (!current) current = { speaker: null, chunks: [] };
		current.chunks.push(line);
	}
	flush();
	return foundSpeaker ? turns : [];
}

function isSpeakerHeader(value: string): boolean {
	if (/[?¿!¡.,;:]/.test(value)) return false;
	const words = value.split(/\s+/).filter(Boolean);
	if (words.length < 1 || words.length > 5) return false;
	const letters = value.replace(/[^\p{L}\p{M}]/gu, "");
	if (letters.length < 2) return false;
	const isAllCaps =
		letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase();
	const isNameCase = words.every((word) => /^[\p{Lu}][\p{L}\p{M}'-]*$/u.test(word));
	return isAllCaps || isNameCase;
}

function speakerKey(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function renderEmptyHero(root: HTMLElement, view: CRMView): void {
	const hero = div(root, "scrm-hero");
	div(hero, "scrm-hero-title", "Your CRM is empty");
	div(
		hero,
		"scrm-hero-sub",
		"This is your own data — nothing is hardcoded. Add your first contact, or load the example dataset to explore every screen.",
	);
	const actions = div(hero, "scrm-hero-actions");
	button(actions, "scrm-btn scrm-btn-primary", "+ Add your first contact", () =>
		view.addContact(),
	);
	button(actions, "scrm-btn", "Load demo data", () => view.loadDemo());
}
