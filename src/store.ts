import {
	Contact,
	ContactStatus,
	Conversation,
	CRMData,
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
		return [...this.data.contacts].sort(
			(a, b) => (b.lastContactedAt ?? b.addedAt) - (a.lastContactedAt ?? a.addedAt),
		);
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
		this.commit();
		return contact;
	}

	updateContact(id: string, patch: Partial<Contact>): void {
		const c = this.getContact(id);
		if (!c) return;
		Object.assign(c, patch);
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
			.sort((a, b) => b.createdAt - a.createdAt);
	}

	conversationCount(contactId: string): number {
		return this.data.conversations.filter((cv) => cv.contactId === contactId)
			.length;
	}

	addConversation(input: Omit<Conversation, "id" | "createdAt">): Conversation {
		const cv: Conversation = {
			...input,
			id: this.uid("cv"),
			createdAt: Date.now(),
		};
		this.data.conversations.push(cv);

		// Roll the conversation forward into the contact's summary fields.
		const c = this.getContact(cv.contactId);
		if (c) {
			c.lastContactedAt = parseISO(cv.date).getTime();
			const learned = firstLine(cv.facts);
			if (learned) c.learned = learned;
			if (cv.nextStep) c.nextStepText = cv.nextStep;
			if (c.status === "to_contact" && cv.outcome !== "dead") {
				c.status = "in_conversation";
			}
		}
		this.commit();
		return cv;
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
		this.commit();
	}

	newQuestionId(): string {
		return this.uid("q");
	}

	setWeeklyGoal(goal: number): void {
		this.data.weeklyGoal = Math.max(1, Math.round(goal));
		this.commit();
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
				count: this.distinctContactsInWeek(key).size,
			});
		}
		return bars;
	}

	upNext(limit = 5): Contact[] {
		return this.data.contacts
			.filter(
				(c) =>
					c.nextStepText &&
					(c.status === "to_contact" || c.status === "in_conversation"),
			)
			.sort((a, b) => {
				const da = a.nextStepDate || "9999-12-31";
				const db = b.nextStepDate || "9999-12-31";
				return da.localeCompare(db);
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
