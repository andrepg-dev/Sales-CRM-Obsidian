import type { CRMView } from "../view";
import { div, span, button, initials } from "../util/dom";

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
		const col = div(chart, "scrm-bar-col");
		div(col, "scrm-bar-val" + (isCurrent ? " scrm-accent" : ""), String(b.count));
		const track = div(col, "scrm-bar-track");
		const fill = div(track, "scrm-bar-fill" + (isCurrent ? " is-current" : ""));
		fill.style.height = `${Math.round((b.count / max) * 100)}%`;
		div(col, "scrm-bar-label" + (isCurrent ? " scrm-accent" : ""), b.label);
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
		span(
			row,
			"scrm-mono-mini scrm-muted",
			c.lastContactedAt ? "LOGGED" : "NEW",
		);
	}

	const learn = store.latestLearning();
	if (learn) {
		const box = div(nextCol, "scrm-learnbox");
		div(box, "scrm-panel-label", "LATEST LEARNING");
		div(box, "scrm-learnbox-text", `“${learn}”`);
	}
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
