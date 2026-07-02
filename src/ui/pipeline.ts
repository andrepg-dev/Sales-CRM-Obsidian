import type { CRMView } from "../view";
import { div, span } from "../util/dom";
import { Contact, ContactStatus, STATUS_META, STATUS_ORDER } from "../types";

export function renderPipeline(root: HTMLElement, view: CRMView): void {
	const store = view.store;

	const head = div(root, "scrm-screen-head");
	div(head, "scrm-screen-title", "Pipeline");
	div(head, "scrm-mono-mini", "drag cards between stages");

	const board = div(root, "scrm-board");

	for (const status of STATUS_ORDER) {
		const col = div(board, `scrm-col scrm-col-${status}`);
		col.dataset.status = status;

		const colHead = div(col, "scrm-col-head");
		span(colHead, "scrm-col-title", STATUS_META[status].short);
		const cards = store.contactsByStatus(status);
		span(colHead, "scrm-col-count", String(cards.length));

		const body = div(col, "scrm-col-body");
		for (const c of cards) renderCard(body, view, c, status);

		if (status === "to_contact") {
			const add = div(body, "scrm-col-add");
			add.appendText("+ ADD");
			add.addEventListener("click", () => view.addContact());
		}

		// drop target
		col.addEventListener("dragover", (e) => {
			e.preventDefault();
			col.addClass("is-dropping");
		});
		col.addEventListener("dragleave", () => col.removeClass("is-dropping"));
		col.addEventListener("drop", (e) => {
			e.preventDefault();
			col.removeClass("is-dropping");
			const id = e.dataTransfer?.getData("text/plain");
			if (id) store.setStatus(id, status);
		});
	}
}

function renderCard(
	parent: HTMLElement,
	view: CRMView,
	c: Contact,
	status: ContactStatus,
): void {
	const card = div(parent, `scrm-pcard scrm-pcard-${status}`);
	card.setAttr("draggable", "true");
	card.addEventListener("dragstart", (e) => {
		e.dataTransfer?.setData("text/plain", c.id);
		card.addClass("is-dragging");
	});
	card.addEventListener("dragend", () => card.removeClass("is-dragging"));
	card.addEventListener("click", () => view.openContact(c.id));

	div(card, "scrm-pcard-name", c.name);
	div(card, "scrm-pcard-company", c.company || "—");

	const latest = view.store.conversationsFor(c.id)[0];

	if (status === "to_contact") {
		div(
			card,
			"scrm-mono-mini scrm-muted",
			c.referredBy ? `REFERRED BY ${c.referredBy.toUpperCase()}` : "READY TO LOG",
		);
	} else if (status === "in_conversation") {
		const row = div(card, "scrm-pcard-signal");
		if (latest?.commitment && latest.commitment !== "none") {
			span(row, "scrm-mini-tag scrm-tag-commit", "⏱ COMMITTED");
		} else if (latest?.outcome === "stalled") {
			span(row, "scrm-mini-tag scrm-tag-stall", "⚠ STALLING");
		}
		span(row, "scrm-mono-mini scrm-accent", c.learned || "PASTE NEXT CHAT");
	} else {
		// won / lost — keep the lesson
		if (c.learned) {
			const why = div(card, "scrm-pcard-why");
			span(
				why,
				status === "won" ? "scrm-why-won" : "scrm-why-lost",
				status === "won" ? "WHY WON: " : "WHY LOST: ",
			);
			why.appendText(c.learned);
		}
	}
}
