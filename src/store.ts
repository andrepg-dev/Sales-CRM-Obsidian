import {
	Contact,
	ContactStatus,
	Conversation,
	CRMData,
	Channel,
	DEFAULT_CONTACT_STATUS,
	PersonType,
} from "./types";
import { firstLine } from "./util/dom";
import {
	parseISO,
	startOfISOWeek,
	addDays,
	weekKey,
	weekLabelShort,
	weekRangeLabel,
} from "./util/dates";

type Listener = () => void;

export interface Metrics {
	contactedThisWeek: number;
	lastWeek: number;
	deltaPct: number | null;
	inConversation: number;
	realCommitments: number;
	won: number;
	lost: number;
	winRate: number | null;
	weeklyGoal: number;
	goalMet: boolean;
}

export interface WeekBar {
	key: string;
	label: string;
	range: string;
	count: number;
}

export interface FunnelStage {
	label: string;
	count: number;
}

export interface TypeCoverage {
	question: string;
	questionId: string;
	answered: number;
	murky: number;
	state: "answered" | "murky" | "open";
}

/**
 * In-memory source of truth for the CRM. Every mutation persists through the
 * injected `persist` callback (the plugin's saveData) and notifies subscribers
 * so open views re-render.
 */
export class CRMStore {
	data: CRMData;
	private listeners = new Set<Listener>();
	private persist: (data: CRMData) => Promise<void>;

	constructor(data: CRMData, persist: (data: CRMData) => Promise<void>) {
		this.data = data;
		this.persist = persist;
	}

	onChange(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private async commit(): Promise<void> {
		await this.persist(this.data);
		this.listeners.forEach((l) => l());
	}

	replaceAll(data: CRMData): Promise<void> {
		this.data = data;
		return this.commit();
	}

	private uid(prefix: string): string {
		return `${prefix}-${Date.now().toString(36)}-${Math.random()
			.toString(36)
			.slice(2, 7)}`;
	}

	/* ---------------------------------------------------------------- contacts */

	getContact(id: string): Contact | undefined {
		return this.data.contacts.find((c) => c.id === id);
	}

	contactsSortedByRecency(): Contact[] {
		return [...this.data.contacts].sort((a, b) => {
			const aTalkedAt = this.lastTalkedAt(a.id);
			const bTalkedAt = this.lastTalkedAt(b.id);
			if (aTalkedAt !== null || bTalkedAt !== null) {
				if (aTalkedAt === null) return 1;
				if (bTalkedAt === null) return -1;
				return bTalkedAt - aTalkedAt || b.addedAt - a.addedAt;
			}
			return b.addedAt - a.addedAt;
		});
	}

	contactsByStatus(status: ContactStatus): Contact[] {
		return this.contactsSortedByRecency().filter((c) => c.status === status);
	}

	addContact(partial: Partial<Contact>): Contact {
		const now = Date.now();
		const contact: Contact = {
			id: this.uid("c"),
			name: partial.name?.trim() || "Untitled contact",
			company: partial.company?.trim() || "",
			phone: partial.phone?.trim() || "",
			email: partial.email?.trim() || "",
			profileUrl: partial.profileUrl?.trim() || "",
			status: partial.status || DEFAULT_CONTACT_STATUS,
			typeId: partial.typeId ?? null,
			learned: partial.learned?.trim() || "",
			nextStepText: partial.nextStepText?.trim() || "",
			nextStepDate: partial.nextStepDate || "",
			referredBy: partial.referredBy?.trim() || "",
			addedAt: now,
			lastContactedAt: partial.lastContactedAt ?? null,
		};
		this.data.contacts.push(contact);
		this.data.defaultPersonTypeId = contact.typeId;
		this.commit();
		return contact;
	}

	addContacts(partials: Partial<Contact>[]): Contact[] {
		const added: Contact[] = [];
		for (const partial of partials) {
			const now = Date.now();
			const contact: Contact = {
				id: this.uid("c"),
				name: partial.name?.trim() || "Untitled contact",
				company: partial.company?.trim() || "",
				phone: partial.phone?.trim() || "",
				email: partial.email?.trim() || "",
				profileUrl: partial.profileUrl?.trim() || "",
				status: partial.status || DEFAULT_CONTACT_STATUS,
				typeId: partial.typeId ?? null,
				learned: partial.learned?.trim() || "",
				nextStepText: partial.nextStepText?.trim() || "",
				nextStepDate: partial.nextStepDate || "",
				referredBy: partial.referredBy?.trim() || "",
				addedAt: now,
				lastContactedAt: partial.lastContactedAt ?? null,
			};
			this.data.contacts.push(contact);
			this.data.defaultPersonTypeId = contact.typeId;
			added.push(contact);
		}
		this.commit();
		return added;
	}

	updateContact(id: string, patch: Partial<Contact>): void {
		const c = this.getContact(id);
		if (!c) return;
		Object.assign(c, patch);
		if ("typeId" in patch) this.data.defaultPersonTypeId = c.typeId;
		this.commit();
	}

	setStatus(id: string, status: ContactStatus): void {
		this.updateContact(id, { status });
	}

	deleteContact(id: string): void {
		this.data.contacts = this.data.contacts.filter((c) => c.id !== id);
		this.data.conversations = this.data.conversations.filter(
			(cv) => cv.contactId !== id,
		);
		this.commit();
	}

	/* ----------------------------------------------------------- conversations */

	conversationsFor(contactId: string): Conversation[] {
		return this.data.conversations
			.filter((cv) => cv.contactId === contactId)
			.sort(
				(a, b) =>
					parseISO(b.date).getTime() - parseISO(a.date).getTime() ||
					b.createdAt - a.createdAt,
			);
	}

	lastTalkedAt(contactId: string): number | null {
		const latest = this.conversationsFor(contactId)[0];
		return latest ? parseISO(latest.date).getTime() : null;
	}

	conversationCount(contactId: string): number {
		return this.data.conversations.filter((cv) => cv.contactId === contactId)
			.length;
	}

	addConversation(
		input: Omit<Conversation, "id" | "createdAt">,
		options: { silent?: boolean } = {},
	): Conversation {
		const cv: Conversation = {
			...input,
			id: this.uid("cv"),
			createdAt: Date.now(),
		};
		this.data.defaultConversationChannel = cv.channel;
		this.data.conversations.push(cv);

		this.applyConversationToContact(cv);
		if (options.silent) void this.persist(this.data);
		else this.commit();
		return cv;
	}

	updateConversation(
		id: string,
		patch: Partial<Conversation>,
		options: { silent?: boolean } = {},
	): void {
		const cv = this.data.conversations.find((conversation) => conversation.id === id);
		if (!cv) return;
		Object.assign(cv, patch);
		this.applyConversationToContact(cv);
		if (options.silent) void this.persist(this.data);
		else this.commit();
	}

	private applyConversationToContact(cv: Conversation): void {
		const c = this.getContact(cv.contactId);
		if (!c) return;
		c.lastContactedAt = parseISO(cv.date).getTime();
		const learned = firstLine(cv.facts);
		if (learned) c.learned = learned;
		if (c.status === "to_contact" && cv.outcome !== "dead") {
			c.status = "in_conversation";
		}
	}

	deleteConversation(id: string): void {
		this.data.conversations = this.data.conversations.filter((c) => c.id !== id);
		this.commit();
	}

	/* -------------------------------------------------------------- person types */

	getType(id: string | null): PersonType | undefined {
		if (!id) return undefined;
		return this.data.personTypes.find((t) => t.id === id);
	}

	contactsOfType(typeId: string): Contact[] {
		return this.data.contacts.filter((c) => c.typeId === typeId);
	}

	addType(partial: Partial<PersonType>): PersonType {
		const type: PersonType = {
			id: this.uid("type"),
			name: partial.name?.trim() || "New type",
			color: partial.color || "#7c3aed",
			questions: partial.questions?.length
				? partial.questions
				: [
						{ id: this.uid("q"), text: "" },
						{ id: this.uid("q"), text: "" },
						{ id: this.uid("q"), text: "" },
				  ],
			editedAt: Date.now(),
		};
		this.data.personTypes.push(type);
		this.commit();
		return type;
	}

	updateType(id: string, patch: Partial<PersonType>): void {
		const t = this.getType(id);
		if (!t) return;
		Object.assign(t, patch, { editedAt: Date.now() });
		this.commit();
	}

	deleteType(id: string): void {
		this.data.personTypes = this.data.personTypes.filter((t) => t.id !== id);
		this.data.contacts.forEach((c) => {
			if (c.typeId === id) c.typeId = null;
		});
		if (this.data.defaultPersonTypeId === id) {
			this.data.defaultPersonTypeId = null;
		}
		this.commit();
	}

	newQuestionId(): string {
		return this.uid("q");
	}

	setWeeklyGoal(goal: number): void {
		this.data.weeklyGoal = Math.max(1, Math.round(goal));
		this.commit();
	}

	rememberConversationChannel(channel: Channel): void {
		if (this.data.defaultConversationChannel === channel) return;
		this.data.defaultConversationChannel = channel;
		void this.persist(this.data);
	}

	getDefaultPersonTypeId(): string | null {
		const id = this.data.defaultPersonTypeId;
		return id && this.getType(id) ? id : null;
	}

	rememberPersonType(typeId: string | null): void {
		const next = typeId && this.getType(typeId) ? typeId : null;
		if (this.data.defaultPersonTypeId === next) return;
		this.data.defaultPersonTypeId = next;
		void this.persist(this.data);
	}

	/* ------------------------------------------------------------------ selectors */

	private distinctContactsInWeek(key: string): Set<string> {
		const set = new Set<string>();
		for (const cv of this.data.conversations) {
			if (weekKey(parseISO(cv.date)) === key) set.add(cv.contactId);
		}
		return set;
	}

	metrics(now = new Date()): Metrics {
		const thisKey = weekKey(now);
		const lastKey = weekKey(addDays(startOfISOWeek(now), -1));
		const thisWeek = this.distinctContactsInWeek(thisKey).size;
		const lastWeek = this.distinctContactsInWeek(lastKey).size;
		const realCommitments = this.data.conversations.filter(
			(cv) =>
				weekKey(parseISO(cv.date)) === thisKey && cv.commitment !== "none",
		).length;
		const won = this.data.contacts.filter((c) => c.status === "won").length;
		const lost = this.data.contacts.filter((c) => c.status === "lost").length;
		const inConversation = this.data.contacts.filter(
			(c) => c.status === "in_conversation",
		).length;
		return {
			contactedThisWeek: thisWeek,
			lastWeek,
			deltaPct:
				lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null,
			inConversation,
			realCommitments,
			won,
			lost,
			winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
			weeklyGoal: this.data.weeklyGoal,
			goalMet: thisWeek >= this.data.weeklyGoal,
		};
	}

	weeklyBars(weeks = 8, now = new Date()): WeekBar[] {
		const bars: WeekBar[] = [];
		const start = startOfISOWeek(now);
		for (let i = weeks - 1; i >= 0; i--) {
			const d = addDays(start, -7 * i);
			const key = weekKey(d);
			bars.push({
				key,
				label: weekLabelShort(d),
				range: weekRangeLabel(d),
				count: this.distinctContactsInWeek(key).size,
			});
		}
		return bars;
	}

	upNext(limit = 5): Contact[] {
		return this.data.contacts
			.filter(
				(c) =>
					(c.status === "to_contact" || c.status === "in_conversation"),
			)
			.sort((a, b) => {
				const aTalkedAt = this.lastTalkedAt(a.id);
				const bTalkedAt = this.lastTalkedAt(b.id);
				return (bTalkedAt ?? b.addedAt) - (aTalkedAt ?? a.addedAt);
			})
			.slice(0, limit);
	}

	latestLearning(): string {
		const withFacts = this.data.conversations
			.filter((cv) => firstLine(cv.facts))
			.sort((a, b) => b.createdAt - a.createdAt);
		if (withFacts.length) return firstLine(withFacts[0].facts);
		const learned = this.data.contacts.find((c) => c.learned);
		return learned ? learned.learned : "";
	}

	typeCoverage(typeId: string): TypeCoverage[] {
		const type = this.getType(typeId);
		if (!type) return [];
		const contactIds = new Set(
			this.contactsOfType(typeId).map((c) => c.id),
		);
		const relevant = this.data.conversations.filter((cv) =>
			contactIds.has(cv.contactId),
		);
		return type.questions.map((q) => {
			let answered = 0;
			let murky = 0;
			for (const cv of relevant) {
				const qa = cv.questionAnswers.find((a) => a.questionId === q.id);
				if (!qa) continue;
				if (qa.state === "answered") answered++;
				else if (qa.state === "murky") murky++;
			}
			return {
				question: q.text,
				questionId: q.id,
				answered,
				murky,
				state: answered > 0 ? "answered" : murky > 0 ? "murky" : "open",
			};
		});
	}

	funnel(weekDate: Date): FunnelStage[] {
		const key = weekKey(weekDate);
		const inWeek = this.data.conversations.filter(
			(cv) => weekKey(parseISO(cv.date)) === key,
		);
		const distinct = (pred: (cv: Conversation) => boolean) =>
			new Set(inWeek.filter(pred).map((cv) => cv.contactId)).size;
		return [
			{ label: "Contacted", count: distinct(() => true) },
			{ label: "Replied", count: distinct((cv) => cv.outcome !== "dead") },
			{ label: "Real conversation", count: distinct((cv) => !!firstLine(cv.facts)) },
			{ label: "Commitment", count: distinct((cv) => cv.commitment !== "none") },
		];
	}

	weekLearnings(weekDate: Date, limit = 5): string[] {
		const key = weekKey(weekDate);
		return this.data.conversations
			.filter((cv) => weekKey(parseISO(cv.date)) === key && firstLine(cv.facts))
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((cv) => firstLine(cv.facts))
			.slice(0, limit);
	}
}
