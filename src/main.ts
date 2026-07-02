import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { CHANNEL_META, CRMData, DEFAULT_CONVERSATION_CHANNEL } from "./types";
import { seedData, emptyData } from "./seed";
import { CRMStore } from "./store";
import { CRMView, VIEW_TYPE_CRM } from "./view";
import { ContactModal } from "./modals/contactModal";

const DATA_VERSION = 1;

export default class SalesCRMPlugin extends Plugin {
	store!: CRMStore;

	async onload(): Promise<void> {
		const { data, isFirstRun } = await this.loadCRMData();
		this.store = new CRMStore(data, (d) => this.saveData(d));
		// Persist immediately on first run so the data file exists and the app
		// never silently re-seeds on reload.
		if (isFirstRun) await this.saveData(data);

		this.registerView(
			VIEW_TYPE_CRM,
			(leaf: WorkspaceLeaf) => new CRMView(leaf, this.store),
		);

		this.addRibbonIcon("users", "Open Sales CRM", () => this.activateView());

		this.addCommand({
			id: "open-sales-crm",
			name: "Open Sales CRM",
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: "sales-crm-new-contact",
			name: "New contact",
			callback: () =>
				new ContactModal(this.app, this.store, null, (contact, wasNew) => {
					if (!wasNew) return;
					void this.activateView().then(() => this.openLog(contact.id));
				}).open(),
		});

		this.addCommand({
			id: "sales-crm-load-demo",
			name: "Load demo data",
			callback: () => {
				if (
					confirm(
						"Replace ALL current CRM data with the built-in demo dataset? This cannot be undone.",
					)
				) {
					this.store.replaceAll(seedData());
					new Notice("Sales CRM demo data loaded.");
				}
			},
		});

		this.addCommand({
			id: "sales-crm-clear-all",
			name: "Clear all data",
			callback: () => {
				if (confirm("Delete ALL CRM data? This cannot be undone.")) {
					this.store.replaceAll(emptyData());
					new Notice("Sales CRM cleared.");
				}
			},
		});
	}

	onunload(): void {
		// Leaves of this type are detached automatically by Obsidian on unload.
	}

	private async loadCRMData(): Promise<{ data: CRMData; isFirstRun: boolean }> {
		const raw = (await this.loadData()) as Partial<CRMData> | null;
		if (!raw || !Array.isArray(raw.contacts)) {
			// First run — start empty. This is your own CRM, not a fixed mockup.
			// Use the "Load demo data" command to explore the example dataset.
			return { data: emptyData(), isFirstRun: true };
		}
		return {
			data: {
				version: raw.version ?? DATA_VERSION,
				weeklyGoal: raw.weeklyGoal ?? 10,
				defaultConversationChannel:
					raw.defaultConversationChannel &&
					raw.defaultConversationChannel in CHANNEL_META
						? raw.defaultConversationChannel
						: DEFAULT_CONVERSATION_CHANNEL,
				contacts: raw.contacts ?? [],
				conversations: raw.conversations ?? [],
				personTypes: raw.personTypes ?? [],
			},
			isFirstRun: false,
		};
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(VIEW_TYPE_CRM)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_CRM, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	private openLog(contactId: string): void {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CRM)[0];
		const view = leaf?.view;
		if (view instanceof CRMView) view.logConversation(contactId);
	}
}
