import { Notice } from "obsidian";
import type { CRMView } from "../view";
import { div, span, button, initials } from "../util/dom";
import { relDays, shortDate } from "../util/dates";
import { Contact, ContactStatus, STATUS_META, STATUS_ORDER } from "../types";

export function renderContacts(root: HTMLElement, view: CRMView): void {
	const store = view.store;

	/* header ----------------------------------------------------------------- */
	const head = div(root, "scrm-screen-head");
	const left = div(head, "scrm-screen-head-left");
	div(left, "scrm-screen-title", "Contacts");
	div(
		left,
		"scrm-mono-mini",
		`${store.data.contacts.length} total · sorted by last talked`,
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

	const importInput = right.createEl("input", {
		attr: {
			type: "file",
			accept: ".csv,.tsv,.txt,.xlsx",
		},
	});
	importInput.addClass("scrm-hidden-file");
	importInput.addEventListener("change", () => {
		const file = importInput.files?.[0];
		if (!file) return;
		void importContactsFile(file, view, draw).finally(() => {
			importInput.value = "";
		});
	});
	button(right, "scrm-btn", "import", () => importInput.click());
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
		const lastTalkedAt = view.store.lastTalkedAt(c.id);
		div(foot, "scrm-mono-mini", lastTalkedAt ? `last talked ${relDays(lastTalkedAt)}` : "no talks yet");
		const created = div(foot, "scrm-mono-mini scrm-muted", `created ${dateTimeFromTs(c.addedAt)}`);
		created.setAttr("title", new Date(c.addedAt).toLocaleString());
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
	["NAME", "COMPANY", "CONTACT", "STATUS", "LAST TALK", "CREATED", "LATEST FACT"].forEach((h) =>
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
		const lastTalkedAt = view.store.lastTalkedAt(c.id);
		div(row, "scrm-td scrm-mono", lastTalkedAt ? shortDate(dateFromTs(lastTalkedAt)) : "—");
		div(row, "scrm-td scrm-mono", shortDate(dateFromTs(c.addedAt)));
		const next = div(row, "scrm-td scrm-td-next");
		next.appendText(c.learned || "—");
	}
}

async function importContactsFile(
	file: File,
	view: CRMView,
	afterImport: () => void,
): Promise<void> {
	if (/\.xlsx$/i.test(file.name)) {
		new Notice("XLSX import needs parser support. Export from Excel as CSV, then import.");
		return;
	}
	const text = await file.text();
	const rows = parseDelimited(text);
	if (rows.length < 2) {
		new Notice("No prospect rows found.");
		return;
	}
	const headers = rows[0].map(normalizeHeader);
	const drafts = rows
		.slice(1)
		.map((row) => prospectFromRow(headers, row, view))
		.filter((contact): contact is Partial<Contact> => !!contact);
	if (!drafts.length) {
		new Notice("No valid contacts found. Include at least a name column.");
		return;
	}
	view.store.addContacts(drafts);
	afterImport();
	new Notice(`Imported ${drafts.length} contact${drafts.length === 1 ? "" : "s"}.`);
}

function prospectFromRow(
	headers: string[],
	row: string[],
	view: CRMView,
): Partial<Contact> | null {
	const value = (...names: string[]) => {
		const idx = headers.findIndex((header) => names.includes(header));
		return idx >= 0 ? (row[idx] ?? "").trim() : "";
	};
	const name = value("name", "nombre", "contact", "contacto", "prospect", "prospecto");
	if (!name) return null;
	const typeName = value("person type", "type", "tipo", "tipo de persona", "person_type");
	const type = typeName
		? view.store.data.personTypes.find(
				(t) => normalizeHeader(t.name) === normalizeHeader(typeName) || t.id === typeName,
			)
		: null;
	return {
		name,
		company: value("company", "compania", "compañia", "empresa"),
		email: value("email", "mail", "correo"),
		phone: value("phone", "telefono", "teléfono", "celular", "whatsapp"),
		status: normalizeStatus(value("status", "estado")) ?? undefined,
		typeId: type?.id ?? null,
		profileUrl: value(
			"profile url",
			"profile",
			"perfil",
			"perfil url",
			"linkedin",
			"url",
			"conversation url",
			"conversation",
			"conversacion",
			"conversación",
		),
		referredBy: value("referred by", "referido por", "referrer"),
	};
}

function normalizeStatus(value: string): ContactStatus | null {
	const clean = normalizeHeader(value);
	if (!clean) return null;
	if ((STATUS_ORDER as string[]).includes(clean)) return clean as ContactStatus;
	const aliases: Record<string, ContactStatus> = {
		"to contact": "to_contact",
		tocontact: "to_contact",
		nuevo: "to_contact",
		prospecto: "to_contact",
		"in conversation": "in_conversation",
		inconversation: "in_conversation",
		conversacion: "in_conversation",
		"en conversacion": "in_conversation",
		ganado: "won",
		won: "won",
		perdido: "lost",
		lost: "lost",
	};
	return aliases[clean] ?? null;
}

function parseDelimited(text: string): string[][] {
	const delimiter = text.includes("\t") ? "\t" : ",";
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		const next = text[i + 1];
		if (quoted && ch === '"' && next === '"') {
			cell += '"';
			i++;
			continue;
		}
		if (ch === '"') {
			quoted = !quoted;
			continue;
		}
		if (!quoted && ch === delimiter) {
			row.push(cell.trim());
			cell = "";
			continue;
		}
		if (!quoted && (ch === "\n" || ch === "\r")) {
			if (ch === "\r" && next === "\n") i++;
			row.push(cell.trim());
			if (row.some(Boolean)) rows.push(row);
			row = [];
			cell = "";
			continue;
		}
		cell += ch;
	}
	row.push(cell.trim());
	if (row.some(Boolean)) rows.push(row);
	return rows;
}

function normalizeHeader(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ");
}

function dateFromTs(ts: number): string {
	const d = new Date(ts);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function dateTimeFromTs(ts: number): string {
	return new Date(ts).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}
