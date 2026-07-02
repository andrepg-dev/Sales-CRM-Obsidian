import type { CRMView } from "../view";
import { div, span, button, initials } from "../util/dom";
import { relDays, shortDate } from "../util/dates";
import { Contact, STATUS_META } from "../types";

export function renderContacts(root: HTMLElement, view: CRMView): void {
	const store = view.store;

	/* header ----------------------------------------------------------------- */
	const head = div(root, "scrm-screen-head");
	const left = div(head, "scrm-screen-head-left");
	div(left, "scrm-screen-title", "Contacts");
	div(
		left,
		"scrm-mono-mini",
		`${store.data.contacts.length} total · sorted by last contacted`,
	);

	const right = div(head, "scrm-screen-head-right");
	const search = right.createEl("input", {
		cls: "scrm-search",
		attr: { type: "text", placeholder: "Search…" },
	});
	search.value = view.contactSearch;

	const toggle = div(right, "scrm-toggle");
	const cardsBtn = button(
		toggle,
		"scrm-toggle-btn" + (view.contactsMode === "cards" ? " is-active" : ""),
		"cards",
		() => {
			view.contactsMode = "cards";
			view.render();
		},
	);
	const tableBtn = button(
		toggle,
		"scrm-toggle-btn" + (view.contactsMode === "table" ? " is-active" : ""),
		"table",
		() => {
			view.contactsMode = "table";
			view.render();
		},
	);
	void cardsBtn;
	void tableBtn;

	button(right, "scrm-btn scrm-btn-primary", "+ new", () => view.addContact());

	/* results ---------------------------------------------------------------- */
	const results = div(root, "scrm-results");

	const draw = () => {
		results.empty();
		const q = view.contactSearch.trim().toLowerCase();
		const list = store.contactsSortedByRecency().filter((c) => {
			if (!q) return true;
			return (
				c.name.toLowerCase().includes(q) ||
				c.company.toLowerCase().includes(q)
			);
		});
		if (!list.length) {
			div(results, "scrm-empty", q ? "No contacts match your search." : "No contacts yet.");
			return;
		}
		if (view.contactsMode === "cards") drawCards(results, view, list);
		else drawTable(results, view, list);
	};

	search.addEventListener("input", () => {
		view.contactSearch = search.value;
		draw();
	});

	draw();
}

function typeDot(parent: HTMLElement, view: CRMView, c: Contact): void {
	const type = view.store.getType(c.typeId);
	if (!type) return;
	const dot = span(parent, "scrm-typedot");
	dot.style.background = type.color;
	dot.setAttr("aria-label", type.name);
	dot.setAttr("title", type.name);
}

function drawCards(root: HTMLElement, view: CRMView, list: Contact[]): void {
	const grid = div(root, "scrm-card-grid");
	for (const c of list) {
		const meta = STATUS_META[c.status];
		const card = div(grid, "scrm-contact-card");
		card.addEventListener("click", () => view.openContact(c.id));

		const top = div(card, "scrm-card-top");
		const idRow = div(top, "scrm-card-idrow");
		div(idRow, "scrm-avatar", initials(c.name));
		const names = div(idRow, "");
		const nameLine = div(names, "scrm-card-name");
		nameLine.appendText(c.name);
		typeDot(nameLine, view, c);
		div(names, "scrm-card-company", c.company || "—");
		span(top, `scrm-badge ${meta.cls}`, meta.short);

		const learned = div(card, "scrm-card-learned");
		if (c.learned) {
			span(learned, "scrm-muted", "Learned: ");
			learned.appendText(c.learned);
		} else {
			learned.addClass("is-empty");
			learned.appendText(
				c.referredBy ? `No conversation yet — referred by ${c.referredBy}.` : "No conversation yet.",
			);
		}

		const foot = div(card, "scrm-card-foot");
		div(
			foot,
			"scrm-mono-mini",
			c.lastContactedAt ? `last talked ${relDays(c.lastContactedAt)}` : `added ${relDays(c.addedAt)}`,
		);
	}

	// add tile
	const add = div(grid, "scrm-add-tile");
	add.addEventListener("click", () => view.addContact());
	div(add, "scrm-add-plus", "+");
	div(add, "scrm-mono-mini", "ADD CONTACT");
}

function drawTable(root: HTMLElement, view: CRMView, list: Contact[]): void {
	const table = div(root, "scrm-table");
	const header = div(table, "scrm-tr scrm-thead");
	["NAME", "COMPANY", "CONTACT", "STATUS", "LAST TALK", "LATEST FACT"].forEach((h) =>
		div(header, "scrm-th", h),
	);

	for (const c of list) {
		const meta = STATUS_META[c.status];
		const row = div(table, "scrm-tr");
		row.addEventListener("click", () => view.openContact(c.id));
		div(row, "scrm-td scrm-td-name", c.name);
		div(row, "scrm-td", c.company || "—");
		div(row, "scrm-td scrm-mono", c.phone || c.email || "—");
		const st = div(row, "scrm-td");
		span(st, `scrm-badge ${meta.cls}`, meta.short);
		div(row, "scrm-td scrm-mono", c.lastContactedAt ? shortDate(dateFromTs(c.lastContactedAt)) : "—");
		const next = div(row, "scrm-td scrm-td-next");
		next.appendText(c.learned || "—");
	}
}

function dateFromTs(ts: number): string {
	const d = new Date(ts);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}
