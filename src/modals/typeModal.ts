import { App, Modal, Notice } from "obsidian";
import { CRMStore } from "../store";
import { BigQuestion, PersonType, TYPE_COLORS } from "../types";
import { div, span, button } from "../util/dom";
import { field, textField, modalFooter } from "./formkit";

export class TypeModal extends Modal {
	private store: CRMStore;
	private existing: PersonType | null;
	private name: string;
	private color: string;
	private questions: BigQuestion[];

	constructor(app: App, store: CRMStore, existing: PersonType | null) {
		super(app);
		this.store = store;
		this.existing = existing;
		this.name = existing?.name ?? "";
		this.color = existing?.color ?? TYPE_COLORS[0];
		this.questions = existing
			? existing.questions.map((q) => ({ ...q }))
			: [0, 1, 2].map(() => ({ id: store.newQuestionId(), text: "" }));
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass("scrm-modal-shell");
		contentEl.addClass("scrm-modal");
		contentEl.createEl("h2", {
			cls: "scrm-modal-title",
			text: this.existing ? "Edit person type" : "New person type",
		});

		textField(contentEl, "Name", this.name, (v) => (this.name = v), {
			placeholder: "e.g. Small café / food owner",
		});

		// colour swatches
		const colorControl = field(contentEl, "Colour");
		const swatchWrap = div(colorControl, "scrm-swatches");
		const paintSwatches = () => {
			swatchWrap.empty();
			for (const col of TYPE_COLORS) {
				const sw = span(swatchWrap, "scrm-swatch" + (col === this.color ? " is-active" : ""));
				sw.style.background = col;
				sw.addEventListener("click", () => {
					this.color = col;
					paintSwatches();
				});
			}
		};
		paintSwatches();

		// questions
		div(contentEl, "scrm-field-label", "Big questions");
		const qWrap = div(contentEl, "scrm-modal-qs");
		const drawQuestions = () => {
			qWrap.empty();
			this.questions.forEach((q, idx) => {
				const row = div(qWrap, "scrm-modal-qrow");
				span(row, "scrm-qcov-n", "Q" + (idx + 1)).style.color = this.color;
				const input = row.createEl("input", {
					cls: "scrm-input scrm-modal-qinput",
					attr: { type: "text", placeholder: "Type a big question…" },
				});
				input.value = q.text;
				input.addEventListener("input", () => (q.text = input.value));
				const del = span(row, "scrm-qrow-del scrm-link", "✕");
				del.addEventListener("click", () => {
					this.questions.splice(idx, 1);
					drawQuestions();
				});
			});
			button(qWrap, "scrm-btn scrm-btn-ghost", "+ add question", () => {
				this.questions.push({ id: this.store.newQuestionId(), text: "" });
				drawQuestions();
			});
		};
		drawQuestions();

		const foot = modalFooter(contentEl);
		if (this.existing) {
			button(foot, "scrm-btn scrm-btn-danger", "Delete", () => {
				if (confirm(`Delete the "${this.existing!.name}" type?`)) {
					this.store.deleteType(this.existing!.id);
					this.close();
				}
			});
		} else {
			button(foot, "scrm-btn", "Cancel", () => this.close());
		}
		button(foot, "scrm-btn scrm-btn-primary", this.existing ? "Save" : "Create", () =>
			this.save(),
		);
	}

	private save(): void {
		if (!this.name.trim()) {
			new Notice("Name is required.");
			return;
		}
		const questions = this.questions
			.map((q) => ({ id: q.id, text: q.text.trim() }))
			.filter((q) => q.text.length > 0);
		if (this.existing) {
			this.store.updateType(this.existing.id, {
				name: this.name,
				color: this.color,
				questions,
			});
		} else {
			this.store.addType({ name: this.name, color: this.color, questions });
		}
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
