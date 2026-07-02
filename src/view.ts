import { ItemView, WorkspaceLeaf } from "obsidian";
import { CRMStore } from "./store";
import { seedData } from "./seed";
import { Contact, PersonType } from "./types";
import { div, button } from "./util/dom";
import { renderDashboard } from "./ui/dashboard";
import { renderContacts } from "./ui/contacts";
import { renderDetail } from "./ui/detail";
import { renderPipeline } from "./ui/pipeline";
import { renderReview } from "./ui/review";
import { renderPersonTypes } from "./ui/persontypes";
import { renderLog } from "./ui/log";
import { ContactModal } from "./modals/contactModal";
import { TypeModal } from "./modals/typeModal";

export const VIEW_TYPE_CRM = "sales-crm-view";

export type Screen = "dashboard" | "contacts" | "pipeline" | "review" | "types" | "log";

export interface Route {
	screen: Screen;
	contactId?: string;
}

const NAV: { screen: Screen; label: string }[] = [
	{ screen: "dashboard", label: "dashboard" },
	{ screen: "contacts", label: "contacts" },
	{ screen: "pipeline", label: "pipeline" },
	{ screen: "review", label: "review" },
	{ screen: "types", label: "types" },
];

export class CRMView extends ItemView {
	store: CRMStore;
	route: Route = { screen: "dashboard" };
	contactsMode: "cards" | "table" = "cards";
	contactSearch = "";
	reviewWeekOffset = 0;
	private unsub?: () => void;

	constructor(leaf: WorkspaceLeaf, store: CRMStore) {
		super(leaf);
		this.store = store;
	}

	getViewType(): string {
		return VIEW_TYPE_CRM;
	}
	getDisplayText(): string {
		return "Sales CRM";
	}
	getIcon(): string {
		return "users";
	}

	async onOpen(): Promise<void> {
		this.unsub = this.store.onChange(() => this.render());
		this.render();
	}

	async onClose(): Promise<void> {
		this.unsub?.();
	}

	/* navigation ------------------------------------------------------------- */

	navigate(route: Route): void {
		this.route = route;
		this.render();
	}

	openContact(id: string): void {
		this.navigate({ screen: "contacts", contactId: id });
	}

	/* actions ---------------------------------------------------------------- */

	addContact(): void {
		new ContactModal(this.app, this.store, null).open();
	}
	editContact(c: Contact): void {
		new ContactModal(this.app, this.store, c).open();
	}
	logConversation(contactId: string): void {
		this.navigate({ screen: "log", contactId });
	}
	editType(t: PersonType | null): void {
		new TypeModal(this.app, this.store, t).open();
	}
	loadDemo(): void {
		this.store.replaceAll(seedData());
	}

	/* render ----------------------------------------------------------------- */

	render(): void {
		const root = this.contentEl;
		root.empty();
		root.toggleClass("scrm-root", true);
		const wrap = div(root, "scrm-wrap");
		this.renderHeader(wrap);
		const body = div(wrap, "scrm-body");

		switch (this.route.screen) {
			case "dashboard":
				renderDashboard(body, this);
				break;
			case "contacts":
				if (this.route.contactId) renderDetail(body, this, this.route.contactId);
				else renderContacts(body, this);
				break;
			case "pipeline":
				renderPipeline(body, this);
				break;
			case "review":
				renderReview(body, this);
				break;
			case "types":
				renderPersonTypes(body, this);
				break;
			case "log":
				if (this.route.contactId) renderLog(body, this, this.route.contactId);
				else renderContacts(body, this);
				break;
		}
	}

	private renderHeader(parent: HTMLElement): void {
		const bar = div(parent, "scrm-topbar");
		const brand = div(bar, "scrm-brand");
		div(brand, "scrm-brand-name", "Client Manager");
		div(brand, "scrm-brand-tag", "MOM TEST · TRACTION");

		const nav = div(bar, "scrm-nav");
		for (const item of NAV) {
			const active =
				this.route.screen === item.screen ? " is-active" : "";
			button(nav, "scrm-tab" + active, item.label, () =>
				this.navigate({ screen: item.screen }),
			);
		}
	}
}
