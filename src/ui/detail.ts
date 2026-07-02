import type { CRMView } from "../view";
import { div, span, button, initials } from "../util/dom";
import { shortDate, relFuture } from "../util/dates";
import {
	STATUS_META,
	STATUS_ORDER,
	COMMITMENT_META,
	CHANNEL_META,
	BAD_DATA_META,
	OUTCOME_META,
	Conversation,
} from "../types";

export function renderDetail(root: HTMLElement, view: CRMView, contactId: string): void {
	const store = view.store;
	const c = store.getContact(contactId);
	if (!c) {
		div(root, "scrm-empty", "This contact no longer exists.");
		button(root, "scrm-btn", "← contacts", () => view.navigate({ screen: "contacts" }));
		return;
	}
	const meta = STATUS_META[c.status];

	/* header ----------------------------------------------------------------- */
	const head = div(root, "scrm-detail-head");
	const back = span(head, "scrm-mono-mini scrm-link", "← contacts");
	back.addEventListener("click", () => view.navigate({ screen: "contacts" }));
	div(head, "scrm-avatar scrm-avatar-lg", initials(c.name));
	const idcol = div(head, "scrm-detail-idcol");
	div(idcol, "scrm-detail-name", c.name);
	div(
		idcol,
		"scrm-detail-sub",
		[c.company, c.phone, c.email].filter(Boolean).join(" · ") || "—",
	);
	span(head, `scrm-badge ${meta.cls}`, meta.short);

	/* action bar ------------------------------------------------------------- */
	const actions = div(root, "scrm-detail-actions");
	button(actions, "scrm-btn scrm-btn-primary", "+ log conversation", () =>
		view.logConversation(c.id),
	);
	button(actions, "scrm-btn", "edit", () => view.editContact(c));
	button(actions, "scrm-btn scrm-btn-danger", "delete", () => {
		if (confirm(`Delete ${c.name} and all their conversations?`)) {
			store.deleteContact(c.id);
			view.navigate({ screen: "contacts" });
		}
	});

	const seg = div(actions, "scrm-seg scrm-seg-status");
	for (const s of STATUS_ORDER) {
		const b = button(
			seg,
			"scrm-seg-btn" + (c.status === s ? " is-active" : ""),
			STATUS_META[s].short,
			() => store.setStatus(c.id, s),
		);
		void b;
	}

	/* body: history + side --------------------------------------------------- */
	const grid = div(root, "scrm-detail-grid");

	// history ------------------------------------------------------------
	const left = div(grid, "scrm-panel");
	div(left, "scrm-panel-title", "Conversation log");
	const convos = store.conversationsFor(c.id);
	const total = convos.length;
	if (!total) {
		div(
			left,
			"scrm-empty",
			c.referredBy
				? `No conversations yet — referred by ${c.referredBy}. Log the first one.`
				: "No conversations yet. Log the first one.",
		);
	}
	const timeline = div(left, "scrm-timeline");
	convos.forEach((cv, i) => renderConversation(timeline, view, cv, total - i));

	// side panel ---------------------------------------------------------
	const side = div(grid, "scrm-panel scrm-side");

	// next step
	const nextBox = div(side, "scrm-side-block");
	div(nextBox, "scrm-panel-label", "NEXT STEP");
	if (c.nextStepText) {
		const nb = div(nextBox, "scrm-side-value");
		nb.appendText(c.nextStepText);
		const when = relFuture(c.nextStepDate);
		if (when) span(nb, "scrm-next-when", ` · ${when}`);
	} else {
		div(nextBox, "scrm-muted", "No next step set.");
	}

	// type + coverage
	const type = store.getType(c.typeId);
	const typeBox = div(side, "scrm-side-block");
	const tlabel = div(typeBox, "scrm-panel-label");
	tlabel.appendText("BIG QUESTIONS FOR THIS TYPE");
	if (type) {
		const th = div(typeBox, "scrm-side-typehead");
		const dot = span(th, "scrm-typedot");
		dot.style.background = type.color;
		span(th, "scrm-side-typename", type.name);
		const cov = store.typeCoverage(type.id);
		const ql = div(typeBox, "scrm-qcov-list");
		type.questions.forEach((q, idx) => {
			const cvg = cov[idx];
			const rowq = div(ql, "scrm-qcov");
			span(rowq, "scrm-qcov-n", "Q" + (idx + 1)).style.color = type.color;
			div(rowq, "scrm-qcov-text", q.text);
			const st = cvg?.state ?? "open";
			const badge =
				st === "answered"
					? `ANSWERED ×${cvg.answered}`
					: st === "murky"
						? `MURKY ×${cvg.murky}`
						: "OPEN";
			span(rowq, `scrm-cov scrm-cov-${st}`, badge);
		});
	} else {
		div(typeBox, "scrm-muted", "No type set — ");
		const link = span(typeBox.lastElementChild as HTMLElement, "scrm-link scrm-accent", "assign one");
		link.addEventListener("click", () => view.editContact(c));
	}

	// Mom Test reminder
	const reminder = div(side, "scrm-momtest");
	div(reminder, "scrm-panel-label scrm-accent", "MOM TEST REMINDER");
	div(
		reminder,
		"scrm-momtest-text",
		"Talk about their life, not your idea. Ask for specifics in the past, not opinions about the future. Compliments, fluff and hypotheticals are not data — real commitments of time, money or reputation are.",
	);
}

function renderConversation(
	parent: HTMLElement,
	view: CRMView,
	cv: Conversation,
	num: number,
): void {
	const entry = div(parent, "scrm-tl-entry");
	const rail = div(entry, "scrm-tl-rail");
	if (cv.outcome === "advancing") rail.addClass("is-advancing");
	const body = div(entry, "scrm-tl-body");

	const head = div(body, "scrm-tl-head");
	div(
		head,
		"scrm-mono-mini scrm-accent",
		`#${num} · ${shortDate(cv.date).toUpperCase()} · ${CHANNEL_META[cv.channel].label.toUpperCase()}`,
	);
	const del = span(head, "scrm-tl-del scrm-link", "✕");
	del.setAttr("aria-label", "Delete conversation");
	del.addEventListener("click", () => {
		if (confirm("Delete this conversation?")) view.store.deleteConversation(cv.id);
	});

	if (cv.facts.trim()) {
		const facts = div(body, "scrm-tl-facts");
		cv.facts.split("\n").forEach((line) => {
			if (line.trim()) div(facts, "scrm-tl-fact", line.trim());
		});
	}

	const chips = div(body, "scrm-tl-chips");
	if (cv.commitment !== "none") {
		const cm = COMMITMENT_META[cv.commitment];
		span(chips, "scrm-chip scrm-chip-commit", `${cm.icon} ${cm.label}`);
	}
	for (const bd of cv.badData) {
		const md = BAD_DATA_META[bd.kind];
		span(
			chips,
			"scrm-chip scrm-chip-bad",
			`${md.icon} ${md.label}${bd.note ? ": " + bd.note : ""}`,
		);
	}
	span(chips, `scrm-chip scrm-out-${cv.outcome}`, `→ ${OUTCOME_META[cv.outcome].label}`);
}
