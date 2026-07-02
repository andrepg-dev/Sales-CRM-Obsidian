/* Custom form controls styled to match the CRM design (no Obsidian Setting). */
import { div, span } from "../util/dom";

export function field(
	parent: HTMLElement,
	label: string,
	desc?: string,
): HTMLDivElement {
	const f = div(parent, "scrm-field");
	div(f, "scrm-field-label", label);
	if (desc) div(f, "scrm-field-desc", desc);
	return div(f, "scrm-field-control");
}

export function textField(
	parent: HTMLElement,
	label: string,
	value: string,
	onChange: (v: string) => void,
	opts: { desc?: string; placeholder?: string; type?: string } = {},
): HTMLInputElement {
	const c = field(parent, label, opts.desc);
	const input = c.createEl("input", {
		cls: "scrm-input",
		attr: { type: opts.type || "text" },
	});
	if (opts.placeholder) input.setAttr("placeholder", opts.placeholder);
	input.value = value;
	input.addEventListener("input", () => onChange(input.value));
	return input;
}

export function textAreaField(
	parent: HTMLElement,
	label: string,
	value: string,
	onChange: (v: string) => void,
	opts: { desc?: string; placeholder?: string; rows?: number } = {},
): HTMLTextAreaElement {
	const c = field(parent, label, opts.desc);
	const ta = c.createEl("textarea", { cls: "scrm-input scrm-textarea" });
	if (opts.placeholder) ta.setAttr("placeholder", opts.placeholder);
	ta.value = value;
	ta.rows = opts.rows || 4;
	ta.addEventListener("input", () => onChange(ta.value));
	return ta;
}

export function selectField(
	parent: HTMLElement,
	label: string,
	options: { value: string; label: string }[],
	value: string,
	onChange: (v: string) => void,
	opts: { desc?: string } = {},
): HTMLSelectElement {
	const c = field(parent, label, opts.desc);
	const wrap = div(c, "scrm-select-wrap");
	const sel = wrap.createEl("select", { cls: "scrm-input scrm-select" });
	for (const o of options) {
		const op = sel.createEl("option", { text: o.label });
		op.value = o.value;
	}
	sel.value = value;
	sel.addEventListener("change", () => onChange(sel.value));
	span(wrap, "scrm-select-caret", "▾");
	return sel;
}

export function modalFooter(parent: HTMLElement): HTMLDivElement {
	return div(parent, "scrm-modal-foot");
}
