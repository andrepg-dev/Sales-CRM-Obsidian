import type { CRMView } from "../view";
import { div, span, button } from "../util/dom";
import { PersonType } from "../types";

export function renderPersonTypes(root: HTMLElement, view: CRMView): void {
	const store = view.store;

	const head = div(root, "scrm-screen-head");
	const left = div(head, "scrm-screen-head-left");
	div(left, "scrm-screen-title", "Person types");
	div(left, "scrm-mono-mini", "every contact gets a type · every type gets its big questions");
	button(head, "scrm-btn scrm-btn-primary", "+ new type", () => view.editType(null));

	const grid = div(root, "scrm-type-grid");
	if (!store.data.personTypes.length) {
		div(grid, "scrm-empty", "No person types yet. Create one to plan your big questions.");
	}
	for (const t of store.data.personTypes) renderTypeCard(grid, view, t);

	const note = div(root, "scrm-rule");
	span(note, "scrm-rule-label", "RULE OF THUMB");
	span(
		note,
		"scrm-rule-text",
		"Keep one list of big questions per type of person. No need to repeat answered ones — pick up where you left off.",
	);
}

function renderTypeCard(parent: HTMLElement, view: CRMView, t: PersonType): void {
	const store = view.store;
	const card = div(parent, "scrm-type-card");

	const ch = div(card, "scrm-type-head");
	const dotName = div(ch, "scrm-type-dotname");
	const dot = span(dotName, "scrm-typedot");
	dot.style.background = t.color;
	span(dotName, "scrm-type-name", t.name);
	span(ch, "scrm-mono-mini", `${store.contactsOfType(t.id).length} CONTACTS`);

	const cov = store.typeCoverage(t.id);
	const qlist = div(card, "scrm-type-qs");
	t.questions.forEach((q, idx) => {
		const cvg = cov[idx];
		const row = div(qlist, "scrm-qcov");
		span(row, "scrm-qcov-n", "Q" + (idx + 1)).style.color = t.color;
		div(row, "scrm-qcov-text" + (q.text ? "" : " scrm-muted"), q.text || "(empty question)");
		const st = cvg?.state ?? "open";
		const badge =
			st === "answered"
				? `ANSWERED ×${cvg.answered}`
				: st === "murky"
					? `MURKY ×${cvg.murky}`
					: "OPEN";
		span(row, `scrm-cov scrm-cov-${st}`, badge);
	});

	const foot = div(card, "scrm-type-foot");
	div(
		foot,
		"scrm-mono-mini",
		"EDITED " +
			new Date(t.editedAt)
				.toLocaleDateString("en-US", { month: "short", day: "numeric" })
				.toUpperCase(),
	);
	const editLink = span(foot, "scrm-link scrm-type-edit", "edit list →");
	editLink.style.color = t.color;
	editLink.addEventListener("click", () => view.editType(t));
}
