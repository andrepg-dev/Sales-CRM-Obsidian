import type { CRMView } from "../view";
import { div, span, button } from "../util/dom";
import {
	startOfISOWeek,
	addDays,
	weekRangeLabel,
	isoWeekInfo,
} from "../util/dates";

export function renderReview(root: HTMLElement, view: CRMView): void {
	const store = view.store;
	const weekDate = addDays(startOfISOWeek(new Date()), 7 * view.reviewWeekOffset);
	const { week } = isoWeekInfo(weekDate);

	/* header + week nav ------------------------------------------------------ */
	const head = div(root, "scrm-screen-head");
	div(head, "scrm-screen-title", `Week ${week} review`);
	const nav = div(head, "scrm-weeknav");
	button(nav, "scrm-weeknav-btn", "‹", () => {
		view.reviewWeekOffset -= 1;
		view.render();
	});
	span(nav, "scrm-weeknav-label", weekRangeLabel(weekDate));
	button(
		nav,
		"scrm-weeknav-btn" + (view.reviewWeekOffset >= 0 ? " is-disabled" : ""),
		"›",
		() => {
			if (view.reviewWeekOffset < 0) {
				view.reviewWeekOffset += 1;
				view.render();
			}
		},
	);

	/* funnel ----------------------------------------------------------------- */
	const funBlock = div(root, "scrm-panel");
	div(funBlock, "scrm-panel-label", "FUNNEL THIS WEEK");
	const funnel = store.funnel(weekDate);
	const max = Math.max(1, ...funnel.map((s) => s.count));
	const fun = div(funBlock, "scrm-funnel");
	for (const stage of funnel) {
		const row = div(fun, "scrm-funnel-row");
		div(row, "scrm-funnel-label", stage.label);
		const track = div(row, "scrm-funnel-track");
		const fill = div(track, "scrm-funnel-fill");
		fill.style.width = `${Math.round((stage.count / max) * 100)}%`;
		div(row, "scrm-funnel-num", String(stage.count));
	}

	/* learnings -------------------------------------------------------------- */
	const learnBlock = div(root, "scrm-panel");
	div(learnBlock, "scrm-panel-label", "TOP LEARNINGS THIS WEEK");
	const learnings = store.weekLearnings(weekDate);
	if (!learnings.length) {
		div(learnBlock, "scrm-empty", "No conversations logged this week.");
	}
	const ll = div(learnBlock, "scrm-learn-list");
	learnings.forEach((text, i) => {
		const row = div(ll, "scrm-learn-row");
		span(row, "scrm-learn-n", String(i + 1).padStart(2, "0"));
		div(row, "scrm-learn-text", text);
	});

	/* next goal -------------------------------------------------------------- */
	const goalRow = div(learnBlock, "scrm-nextgoal");
	div(goalRow, "scrm-nextgoal-label", "Weekly conversation goal");
	const stepper = div(goalRow, "scrm-stepper");
	button(stepper, "scrm-stepper-btn", "−", () => {
		store.setWeeklyGoal(store.data.weeklyGoal - 1);
	});
	span(stepper, "scrm-stepper-val", String(store.data.weeklyGoal));
	button(stepper, "scrm-stepper-btn", "+", () => {
		store.setWeeklyGoal(store.data.weeklyGoal + 1);
	});
}
