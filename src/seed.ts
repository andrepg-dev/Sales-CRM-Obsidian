import { CRMData, Conversation } from "./types";
import { parseISO } from "./util/dates";

/*
 * Seed data mirrors the prototype's example contacts so the plugin has
 * something to explore on first run. Everything here is fully editable and can
 * be wiped from the CRM view ("reset demo data" command).
 */

/** A clean, empty CRM — the default on first run so the data is truly yours. */
export function emptyData(): CRMData {
	return {
		version: 1,
		weeklyGoal: 10,
		contacts: [],
		conversations: [],
		personTypes: [],
	};
}

const ts = (iso: string, bump = 0) => parseISO(iso).getTime() + bump * 1000;

function conv(c: Partial<Conversation> & { id: string; contactId: string; date: string }): Conversation {
	return {
		channel: "call",
		facts: "",
		commitment: "none",
		badData: [],
		questionAnswers: [],
		nextStep: "",
		outcome: "advancing",
		createdAt: ts(c.date),
		...c,
	} as Conversation;
}

export function seedData(): CRMData {
	return {
		version: 1,
		weeklyGoal: 10,
		personTypes: [
			{
				id: "type-cafe",
				name: "Small café / food owner",
				color: "#7c3aed",
				editedAt: ts("2026-06-28"),
				questions: [
					{ id: "qc1", text: "How do orders actually arrive during the morning rush?" },
					{ id: "qc2", text: "What did the last lost order cost them, in money?" },
					{ id: "qc3", text: "What have they already tried or paid for to fix it?" },
				],
			},
			{
				id: "type-clinic",
				name: "Clinic / appointment business",
				color: "#2a9d8f",
				editedAt: ts("2026-06-30"),
				questions: [
					{ id: "ql1", text: "How many no-shows last month, and what happened after?" },
					{ id: "ql2", text: "Who answers the phone when the receptionist is busy?" },
					{ id: "ql3", text: "What does their current booking flow cost per month?" },
				],
			},
		],
		contacts: [
			{
				id: "c-maria",
				name: "María Reyes",
				company: "Café Alba",
				phone: "+504 9877-2210",
				email: "maria@cafealba.hn",
				status: "in_conversation",
				typeId: "type-cafe",
				learned: "Pays $80/mo for 3 tools she barely uses. Wants one bill.",
				nextStepText: "Demo with her barista",
				nextStepDate: "2026-07-02",
				referredBy: "Ana Solís",
				addedAt: ts("2026-06-22"),
				lastContactedAt: ts("2026-07-02"),
			},
			{
				id: "c-ana",
				name: "Ana Solís",
				company: "Boutique Sol",
				phone: "",
				email: "ana@bsol.hn",
				status: "won",
				typeId: null,
				learned: "Bought after seeing the WhatsApp export. That was the hook.",
				nextStepText: "Onboarding call",
				nextStepDate: "2026-07-03",
				referredBy: "",
				addedAt: ts("2026-06-10"),
				lastContactedAt: ts("2026-06-29"),
			},
			{
				id: "c-jorge",
				name: "Jorge Turcios",
				company: "Ferretería JT",
				phone: "+504 9911-4587",
				email: "",
				status: "to_contact",
				typeId: null,
				learned: "",
				nextStepText: "First call",
				nextStepDate: "2026-07-03",
				referredBy: "Ana Solís",
				addedAt: ts("2026-07-01"),
				lastContactedAt: null,
			},
			{
				id: "c-lucia",
				name: "Lucía Paz",
				company: "Clínica Paz",
				phone: "",
				email: "lucia@cpaz.hn",
				status: "in_conversation",
				typeId: "type-clinic",
				learned: "Books patients on paper; lost ~6 appointments last month.",
				nextStepText: "Send pricing",
				nextStepDate: "2026-07-04",
				referredBy: "",
				addedAt: ts("2026-06-15"),
				lastContactedAt: ts("2026-06-27"),
			},
			{
				id: "c-raul",
				name: "Raúl Cruz",
				company: "Autolavado Cruz",
				phone: "+504 8845-0093",
				email: "",
				status: "lost",
				typeId: null,
				learned: "\"Sounds great\" ×3 but never opened the trial — compliments ≠ commitment.",
				nextStepText: "Revisit",
				nextStepDate: "2026-10-01",
				referredBy: "",
				addedAt: ts("2026-06-01"),
				lastContactedAt: ts("2026-06-24"),
			},
			{
				id: "c-dora",
				name: "Dora Mejía",
				company: "Farmacia Central",
				phone: "",
				email: "",
				status: "to_contact",
				typeId: null,
				learned: "",
				nextStepText: "",
				nextStepDate: "",
				referredBy: "",
				addedAt: ts("2026-06-28"),
				lastContactedAt: null,
			},
			{
				id: "c-pedro",
				name: "Pedro Núñez",
				company: "Gym Fuerte",
				phone: "",
				email: "",
				status: "lost",
				typeId: null,
				learned: "No budget until 2027.",
				nextStepText: "Revisit",
				nextStepDate: "2027-01-15",
				referredBy: "",
				addedAt: ts("2026-05-20"),
				lastContactedAt: ts("2026-06-12"),
			},
		],
		conversations: [
			// María — the flagship advancing thread
			conv({
				id: "cv-maria-1",
				contactId: "c-maria",
				date: "2026-06-25",
				channel: "in_person",
				facts: "First chat at the café. She brought up WhatsApp chaos unprompted.",
				commitment: "none",
				questionAnswers: [{ questionId: "qc1", state: "murky" }],
				nextStep: "Ask about her morning rush",
				outcome: "advancing",
			}),
			conv({
				id: "cv-maria-2",
				contactId: "c-maria",
				date: "2026-06-30",
				channel: "call",
				facts: "60% of orders arrive 7–9 am. Committed to a demo.",
				commitment: "time",
				questionAnswers: [{ questionId: "qc1", state: "answered" }],
				nextStep: "Demo with her barista",
				outcome: "advancing",
			}),
			conv({
				id: "cv-maria-3",
				contactId: "c-maria",
				date: "2026-07-02",
				channel: "whatsapp",
				facts:
					"Spends ~40 min/day answering the same 5 questions on WhatsApp.\nLost two catering orders last month because replies came late.\nTracks orders in a paper notebook + Excel on Sundays.",
				commitment: "time",
				badData: [{ kind: "compliment", note: "\"me encanta la idea\"" }],
				questionAnswers: [
					{ questionId: "qc1", state: "answered" },
					{ questionId: "qc2", state: "murky" },
					{ questionId: "qc3", state: "not_asked" },
				],
				nextStep: "Demo with her barista · today 3 pm",
				outcome: "advancing",
			}),
			// Ana — won
			conv({
				id: "cv-ana-1",
				contactId: "c-ana",
				date: "2026-06-18",
				channel: "whatsapp",
				facts: "Runs the boutique; exports client chats weekly by hand.",
				commitment: "none",
				outcome: "advancing",
			}),
			conv({
				id: "cv-ana-2",
				contactId: "c-ana",
				date: "2026-06-26",
				channel: "call",
				facts: "Loved the WhatsApp export demo — asked to buy.",
				commitment: "money",
				outcome: "advancing",
			}),
			conv({
				id: "cv-ana-3",
				contactId: "c-ana",
				date: "2026-06-29",
				channel: "in_person",
				facts: "Signed up and paid the first month.",
				commitment: "money",
				nextStep: "Onboarding call",
				outcome: "advancing",
			}),
			// Lucía — stalling
			conv({
				id: "cv-lucia-1",
				contactId: "c-lucia",
				date: "2026-06-20",
				channel: "call",
				facts: "Books patients on paper.",
				commitment: "none",
				questionAnswers: [{ questionId: "ql1", state: "answered" }],
				outcome: "advancing",
			}),
			conv({
				id: "cv-lucia-2",
				contactId: "c-lucia",
				date: "2026-06-27",
				channel: "whatsapp",
				facts: "Lost ~6 appointments last month to no-shows.",
				commitment: "reputation",
				questionAnswers: [
					{ questionId: "ql1", state: "answered" },
					{ questionId: "ql2", state: "murky" },
				],
				nextStep: "Send pricing",
				outcome: "stalled",
			}),
			// Raúl — lost to compliments
			conv({
				id: "cv-raul-1",
				contactId: "c-raul",
				date: "2026-06-10",
				channel: "call",
				facts: "Said the idea sounds great.",
				commitment: "none",
				badData: [{ kind: "compliment", note: "\"sounds great\"" }],
				outcome: "stalled",
			}),
			conv({
				id: "cv-raul-2",
				contactId: "c-raul",
				date: "2026-06-24",
				channel: "call",
				facts: "Still \"sounds great\", never opened the trial. Closed out.",
				commitment: "none",
				badData: [
					{ kind: "compliment", note: "\"sounds great\"" },
					{ kind: "fluff", note: "" },
				],
				outcome: "dead",
			}),
			// Pedro — lost, no budget
			conv({
				id: "cv-pedro-1",
				contactId: "c-pedro",
				date: "2026-06-12",
				channel: "email",
				facts: "Confirmed no budget until 2027.",
				commitment: "none",
				outcome: "dead",
			}),
		],
	};
}
