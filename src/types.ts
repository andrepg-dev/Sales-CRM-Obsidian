/*
 * Domain model for the Sales CRM.
 *
 * The vocabulary comes straight from the two methodologies the prototype is
 * built on: The Mom Test (facts vs. compliments, real commitments, bad-data
 * flags) and Traction (weekly conversation goal, funnel, learnings).
 */

export type ContactStatus = "to_contact" | "in_conversation" | "won" | "lost";

export const DEFAULT_CONTACT_STATUS: ContactStatus = "in_conversation";

/** Outcome of a single logged conversation. */
export type Outcome = "advancing" | "stalled" | "dead";

/** The kind of real commitment a prospect gave up, if any. */
export type Commitment = "time" | "reputation" | "money" | "none";

export type Channel =
	| "linkedin"
	| "whatsapp"
	| "email"
	| "instagram"
	| "facebook"
	| "x"
	| "website"
	| "other";

export const DEFAULT_CONVERSATION_CHANNEL: Channel = "linkedin";

/** Whether one of the type's "3 big questions" got answered in a conversation. */
export type AnswerState = "answered" | "murky" | "not_asked";

/** A Mom-Test "bad data" signal — something that must NOT be counted as traction. */
export type BadDataKind = "compliment" | "fluff" | "hypothetical";

export interface BigQuestion {
	id: string;
	text: string;
}

export interface PersonType {
	id: string;
	name: string;
	/** Accent colour (hex) used for the type dot and badges. */
	color: string;
	/** The pre-planned big questions for this type (usually three). */
	questions: BigQuestion[];
	editedAt: number;
}

export interface QuestionAnswer {
	questionId: string;
	state: AnswerState;
}

export interface BadDataFlag {
	kind: BadDataKind;
	note: string;
}

export interface Conversation {
	id: string;
	contactId: string;
	/** ISO date (yyyy-mm-dd) the conversation happened. */
	date: string;
	channel: Channel;
	conversationUrl: string;
	/** Specifics about their life — not opinions about your idea. */
	facts: string;
	commitment: Commitment;
	badData: BadDataFlag[];
	/** Coverage of the type's big questions captured during this conversation. */
	questionAnswers: QuestionAnswer[];
	nextStep: string;
	outcome: Outcome;
	createdAt: number;
}

export interface Contact {
	id: string;
	name: string;
	company: string;
	phone: string;
	email: string;
	status: ContactStatus;
	/** null when the contact has not been classified into a person type yet. */
	typeId: string | null;
	/** Short "latest learning" shown on cards. */
	learned: string;
	nextStepText: string;
	/** ISO date, or "" when no date is set. */
	nextStepDate: string;
	referredBy: string;
	addedAt: number;
	/** ms epoch of the last logged conversation, or null. */
	lastContactedAt: number | null;
}

export interface CRMData {
	version: number;
	/** Weekly conversation goal (Traction rock). */
	weeklyGoal: number;
	defaultConversationChannel: Channel;
	contacts: Contact[];
	conversations: Conversation[];
	personTypes: PersonType[];
}

export const STATUS_META: Record<
	ContactStatus,
	{ label: string; short: string; cls: string }
> = {
	to_contact: { label: "To contact", short: "TO CONTACT", cls: "scrm-st-tocontact" },
	in_conversation: { label: "In conversation", short: "IN CONV.", cls: "scrm-st-inconv" },
	won: { label: "Won", short: "WON", cls: "scrm-st-won" },
	lost: { label: "Lost", short: "LOST", cls: "scrm-st-lost" },
};

export const STATUS_ORDER: ContactStatus[] = [
	"to_contact",
	"in_conversation",
	"won",
	"lost",
];

export const COMMITMENT_META: Record<Commitment, { label: string; icon: string }> = {
	time: { label: "time", icon: "⏱" },
	reputation: { label: "reputation", icon: "💬" },
	money: { label: "money", icon: "$" },
	none: { label: "none", icon: "∅" },
};

export const OUTCOME_META: Record<Outcome, { label: string }> = {
	advancing: { label: "advancing" },
	stalled: { label: "stalled" },
	dead: { label: "dead" },
};

export const CHANNEL_META: Record<Channel, { label: string }> = {
	linkedin: { label: "LinkedIn" },
	whatsapp: { label: "WhatsApp" },
	email: { label: "Email" },
	instagram: { label: "Instagram" },
	facebook: { label: "Facebook" },
	x: { label: "X / Twitter" },
	website: { label: "Website" },
	other: { label: "Other" },
};

export const BAD_DATA_META: Record<BadDataKind, { label: string; icon: string }> = {
	compliment: { label: "compliment", icon: "⚠" },
	fluff: { label: "fluff", icon: "~" },
	hypothetical: { label: "hypothetical", icon: "?" },
};

/** Palette offered when creating a new person type. */
export const TYPE_COLORS = [
	"#7c3aed",
	"#2a9d8f",
	"#e8853e",
	"#3b82f6",
	"#d6336c",
	"#0ca678",
];
