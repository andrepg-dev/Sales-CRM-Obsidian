/* Thin wrappers over Obsidian's createEl to keep render code readable. */

export function div(
	parent: HTMLElement,
	cls?: string,
	text?: string,
): HTMLDivElement {
	return parent.createEl("div", { cls, text });
}

export function span(
	parent: HTMLElement,
	cls?: string,
	text?: string,
): HTMLSpanElement {
	return parent.createEl("span", { cls, text });
}

export function el<K extends keyof HTMLElementTagNameMap>(
	parent: HTMLElement,
	tag: K,
	cls?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	return parent.createEl(tag, { cls, text });
}

/**
 * Buttons are rendered as <div>, not <button>, on purpose: Obsidian's theme
 * heavily styles native <button> (background, border, box-shadow) which fights
 * the prototype's flat look. A styled div gives us full control.
 */
export function button(
	parent: HTMLElement,
	cls: string,
	text: string,
	onClick: (ev: MouseEvent) => void,
): HTMLDivElement {
	const b = parent.createEl("div", { cls, text });
	b.addClass("scrm-clickable");
	b.setAttr("role", "button");
	b.setAttr("tabindex", "0");
	b.addEventListener("click", onClick);
	return b;
}

/** Person initials, e.g. "María Reyes" -> "MR". */
export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Set an inline CSS custom property (used to theme per-type accent colours). */
export function setVar(elx: HTMLElement, name: string, value: string): void {
	elx.style.setProperty(name, value);
}

export function firstLine(s: string): string {
	const line = (s || "").split("\n").map((l) => l.trim()).find((l) => l.length > 0);
	return line || "";
}
