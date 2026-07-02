import { App, Modal, Notice } from "obsidian";
import { CRMStore } from "../store";
import { Contact, ContactStatus, DEFAULT_CONTACT_STATUS, STATUS_META, STATUS_ORDER } from "../types";
import { button } from "../util/dom";
import { textField, textAreaField, selectField, modalFooter } from "./formkit";

export class ContactModal extends Modal {
	private store: CRMStore;
	private existing: Contact | null;
	private draft: {
		name: string;
		company: string;
		phone: string;
		email: string;
		status: ContactStatus;
		typeId: string | null;
		learned: string;
		nextStepText: string;
		nextStepDate: string;
		referredBy: string;
	};

	constructor(app: App, store: CRMStore, existing: Contact | null) {
		super(app);
		this.store = store;
		this.existing = existing;
		this.draft = {
			name: existing?.name ?? "",
			company: existing?.company ?? "",
			phone: existing?.phone ?? "",
			email: existing?.email ?? "",
			status: existing?.status ?? DEFAULT_CONTACT_STATUS,
			typeId: existing?.typeId ?? null,
			learned: existing?.learned ?? "",
			nextStepText: existing?.nextStepText ?? "",
			nextStepDate: existing?.nextStepDate ?? "",
			referredBy: existing?.referredBy ?? "",
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass("scrm-modal-shell");
		contentEl.addClass("scrm-modal");
		contentEl.createEl("h2", {
			cls: "scrm-modal-title",
			text: this.existing ? "Edit contact" : "New contact",
		});

		const grid = contentEl.createDiv({ cls: "scrm-form-grid" });

		textField(grid, "Name", this.draft.name, (v) => (this.draft.name = v), {
			placeholder: "e.g. María Reyes",
		});
		textField(grid, "Company", this.draft.company, (v) => (this.draft.company = v), {
			placeholder: "e.g. Café Alba",
		});
		textField(grid, "Phone", this.draft.phone, (v) => (this.draft.phone = v));
		textField(grid, "Email", this.draft.email, (v) => (this.draft.email = v));

		selectField(
			grid,
			"Status",
			STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label })),
			this.draft.status,
			(v) => (this.draft.status = v as ContactStatus),
		);
		selectField(
			grid,
			"Person type",
			[
				{ value: "", label: "— none —" },
				...this.store.data.personTypes.map((t) => ({ value: t.id, label: t.name })),
			],
			this.draft.typeId ?? "",
			(v) => (this.draft.typeId = v || null),
		);

		textField(grid, "Next step", this.draft.nextStepText, (v) => (this.draft.nextStepText = v), {
			placeholder: "e.g. Demo with her barista",
		});
		textField(
			grid,
			"Next step date",
			this.draft.nextStepDate,
			(v) => (this.draft.nextStepDate = v),
			{ type: "date" },
		);

		textAreaField(
			contentEl,
			"Latest learning",
			this.draft.learned,
			(v) => (this.draft.learned = v),
			{ desc: "A fact about their life — not an opinion about your idea." },
		);
		textField(contentEl, "Referred by", this.draft.referredBy, (v) => (this.draft.referredBy = v), {
			placeholder: "Who introduced them?",
		});

		const foot = modalFooter(contentEl);
		button(foot, "scrm-btn", "Cancel", () => this.close());
		button(foot, "scrm-btn scrm-btn-primary", this.existing ? "Save" : "Create", () =>
			this.save(),
		);
	}

	private save(): void {
		if (!this.draft.name.trim()) {
			new Notice("Name is required.");
			return;
		}
		if (this.existing) this.store.updateContact(this.existing.id, this.draft);
		else this.store.addContact(this.draft);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
