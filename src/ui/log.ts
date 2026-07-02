import type { CRMView } from "../view";
import { div, span, button } from "../util/dom";
import { todayISO } from "../util/dates";
import { detect } from "../util/detect";
import {
	AnswerState,
	BadDataFlag,
	BadDataKind,
	Channel,
	Commitment,
	Outcome,
	CHANNEL_META,
	COMMITMENT_META,
	OUTCOME_META,
	BAD_DATA_META,
} from "../types";

const NEXT_STATE: Record<AnswerState, AnswerState> = {
	not_asked: "answered",
	answered: "murky",
	murky: "not_asked",
};
const STATE_LABEL: Record<AnswerState, string> = {
	not_asked: "NOT ASKED",
	answered: "ANSWERED",
	murky: "MURKY — ASK AGAIN",
};

interface BadState {
	on: boolean;
	note: string;
	touched: boolean;
}

export function renderLog(root: HTMLElement, view: CRMView, contactId: string): void {
	const store = view.store;
	const contact = store.getContact(contactId);
	if (!contact) {
		div(root, "scrm-empty", "This contact no longer exists.");
		button(root, "scrm-btn", "← contacts", () => view.navigate({ screen: "contacts" }));
		return;
	}
	const type = store.getType(contact.typeId);

	const state = {
		date: todayISO(),
		channel: "call" as Channel,
		facts: "",
		commitment: "none" as Commitment,
		commitmentTouched: false,
		nextStep: "",
		nextStepDate: "",
		outcome: "advancing" as Outcome,
		outcomeTouched: false,
	};
	const answers = new Map<string, AnswerState>();
	const bad = new Map<BadDataKind, BadState>([
		["compliment", { on: false, note: "", touched: false }],
		["fluff", { on: false, note: "", touched: false }],
		["hypothetical", { on: false, note: "", touched: false }],
	]);

	/* header ----------------------------------------------------------------- */
	const head = div(root, "scrm-detail-head");
	const back = span(head, "scrm-mono-mini scrm-link", "← back");
	back.addEventListener("click", () => view.openContact(contactId));
	const idcol = div(head, "scrm-detail-idcol");
	div(idcol, "scrm-detail-name", `Log conversation — ${contact.name}`);
	div(
		idcol,
		"scrm-detail-sub",
		[contact.company, type ? `type: ${type.name}` : ""].filter(Boolean).join(" · "),
	);

	const grid = div(root, "scrm-log-grid");
	const main = div(grid, "scrm-panel");
	const side = div(grid, "scrm-panel scrm-side");

	/* date + channel --------------------------------------------------------- */
	const meta = div(main, "scrm-log-metarow");
	const dateWrap = div(meta, "scrm-field");
	div(dateWrap, "scrm-field-label", "Date");
	const dateInput = dateWrap.createEl("input", {
		cls: "scrm-input",
		attr: { type: "date" },
	});
	dateInput.value = state.date;
	dateInput.addEventListener("input", () => (state.date = dateInput.value));

	const chWrap = div(meta, "scrm-field");
	div(chWrap, "scrm-field-label", "Channel");
	const chSelWrap = div(chWrap, "scrm-select-wrap");
	const chSel = chSelWrap.createEl("select", { cls: "scrm-input scrm-select" });
	(Object.keys(CHANNEL_META) as Channel[]).forEach((c) => {
		const op = chSel.createEl("option", { text: CHANNEL_META[c].label });
		op.value = c;
	});
	chSel.value = state.channel;
	chSel.addEventListener("change", () => (state.channel = chSel.value as Channel));
	span(chSelWrap, "scrm-select-caret", "▾");

	/* big-question checklist ------------------------------------------------- */
	if (type && type.questions.length) {
		div(main, "scrm-panel-label", "YOUR BIG QUESTIONS FOR THIS TYPE — did this answer any?");
		for (const q of type.questions) {
			answers.set(q.id, "not_asked");
			const row = div(main, "scrm-qcheck");
			const box = div(row, "scrm-qcheck-box");
			div(row, "scrm-qcheck-text", q.text || "(empty question)");
			const st = span(row, "scrm-qcheck-state");
			const paint = () => {
				const s = answers.get(q.id) as AnswerState;
				row.className = "scrm-qcheck is-" + s;
				box.setText(s === "answered" ? "✓" : s === "murky" ? "~" : "");
				st.setText(STATE_LABEL[s]);
			};
			row.addEventListener("click", () => {
				answers.set(q.id, NEXT_STATE[answers.get(q.id) as AnswerState]);
				paint();
			});
			paint();
		}
	}

	/* facts ------------------------------------------------------------------ */
	const factsField = div(main, "scrm-field");
	div(factsField, "scrm-field-label", "Facts learned");
	div(
		factsField,
		"scrm-field-desc",
		"Specifics about their life, not opinions about your idea. One per line.",
	);
	const facts = factsField.createEl("textarea", { cls: "scrm-input scrm-textarea" });
	facts.rows = 5;
	facts.setAttr("placeholder", "What did you actually learn?");

	/* auto-detection banner -------------------------------------------------- */
	const detectRow = div(main, "scrm-detect");

	/* commitment (segmented) ------------------------------------------------- */
	div(main, "scrm-field-label", "Commitment given — did they give up something real?");
	const commitSeg = div(main, "scrm-seg scrm-seg-wrap");
	const paintCommit = () => {
		commitSeg.empty();
		(Object.keys(COMMITMENT_META) as Commitment[]).forEach((c) => {
			const b = span(
				commitSeg,
				"scrm-seg-btn" + (state.commitment === c ? " is-active" : ""),
				`${COMMITMENT_META[c].icon} ${COMMITMENT_META[c].label}`,
			);
			b.addEventListener("click", () => {
				state.commitment = c;
				state.commitmentTouched = true;
				paintCommit();
			});
		});
	};
	paintCommit();

	/* bad-data flags --------------------------------------------------------- */
	div(main, "scrm-field-label", "BAD-DATA FLAGS — auto-detected, don't count these as signal");
	const badWrap = div(main, "scrm-baddata-wrap");
	const paintBad = (kind: BadDataKind, row: HTMLElement, chip: HTMLElement) => {
		void row;
		chip.toggleClass("is-on", bad.get(kind)!.on);
	};
	const badControls = new Map<BadDataKind, { chip: HTMLElement; note: HTMLInputElement }>();
	(Object.keys(BAD_DATA_META) as BadDataKind[]).forEach((kind) => {
		const entry = bad.get(kind)!;
		const row = div(badWrap, "scrm-baddata-row");
		const chip = span(
			row,
			"scrm-chip scrm-chip-bad-toggle",
			`${BAD_DATA_META[kind].icon} ${BAD_DATA_META[kind].label}`,
		);
		const note = row.createEl("input", {
			cls: "scrm-input scrm-baddata-note",
			attr: { type: "text", placeholder: "what did they say?" },
		});
		note.value = entry.note;
		note.addEventListener("input", () => {
			entry.note = note.value;
			entry.touched = true;
		});
		chip.addEventListener("click", () => {
			entry.on = !entry.on;
			entry.touched = true;
			paintBad(kind, row, chip);
		});
		badControls.set(kind, { chip, note });
		paintBad(kind, row, chip);
	});

	/* next step + outcome ---------------------------------------------------- */
	const nsRow = div(main, "scrm-log-metarow");
	const nsField = div(nsRow, "scrm-field");
	div(nsField, "scrm-field-label", "Next step (advancement)");
	const nsInput = nsField.createEl("input", {
		cls: "scrm-input",
		attr: { type: "text", placeholder: "e.g. Demo with her barista · today 3 pm" },
	});
	nsInput.addEventListener("input", () => (state.nextStep = nsInput.value));

	const nsdField = div(nsRow, "scrm-field");
	div(nsdField, "scrm-field-label", "Next step date");
	const nsdInput = nsdField.createEl("input", { cls: "scrm-input", attr: { type: "date" } });
	nsdInput.addEventListener("input", () => (state.nextStepDate = nsdInput.value));

	div(main, "scrm-field-label", "Outcome");
	const outSeg = div(main, "scrm-seg scrm-seg-wrap");
	const paintOutcome = () => {
		outSeg.empty();
		(Object.keys(OUTCOME_META) as Outcome[]).forEach((o) => {
			const b = span(
				outSeg,
				"scrm-seg-btn" + (state.outcome === o ? " is-active" : ""),
				OUTCOME_META[o].label,
			);
			b.addEventListener("click", () => {
				state.outcome = o;
				state.outcomeTouched = true;
				paintOutcome();
			});
		});
	};
	paintOutcome();

	/* footer ----------------------------------------------------------------- */
	const foot = div(main, "scrm-modal-foot");
	button(foot, "scrm-btn", "Cancel", () => view.openContact(contactId));
	button(foot, "scrm-btn scrm-btn-primary", "Save conversation", () => save());

	/* side: guidance --------------------------------------------------------- */
	const reminder = div(side, "scrm-momtest");
	div(reminder, "scrm-panel-label scrm-accent", "MOM TEST REMINDER");
	div(
		reminder,
		"scrm-momtest-text",
		"Talk about their life, not your idea. Ask for specifics in the past, not opinions about the future. Compliments, fluff and hypotheticals are not data — real commitments of time, money or reputation are.",
	);
	const autoNote = div(side, "scrm-side-block");
	div(autoNote, "scrm-panel-label", "AUTO-DETECTION");
	div(
		autoNote,
		"scrm-momtest-text",
		"As you type the facts, the CRM flags compliments / fluff / hypotheticals and guesses the commitment and outcome. Anything it gets wrong, just click to override.",
	);

	/* live detection --------------------------------------------------------- */
	const runDetection = () => {
		state.facts = facts.value;
		const det = detect(state.facts);

		if (!state.commitmentTouched) {
			state.commitment = det.commitment;
			paintCommit();
		}
		if (!state.outcomeTouched) {
			state.outcome = det.outcome;
			paintOutcome();
		}
		(Object.keys(BAD_DATA_META) as BadDataKind[]).forEach((kind) => {
			const entry = bad.get(kind)!;
			if (entry.touched) return;
			const hit = det.bad[kind];
			entry.on = !!hit;
			entry.note = hit || "";
			const ctrl = badControls.get(kind)!;
			ctrl.chip.toggleClass("is-on", entry.on);
			ctrl.note.value = entry.note;
		});

		// summary chips
		detectRow.empty();
		const hits: string[] = [];
		if (det.commitment !== "none") hits.push(`commitment: ${det.commitment}`);
		(Object.keys(det.bad) as BadDataKind[]).forEach((k) => hits.push(k));
		if (hits.length) {
			span(detectRow, "scrm-detect-label", "DETECTED");
			hits.forEach((h) => span(detectRow, "scrm-detect-chip", h));
		}
	};
	facts.addEventListener("input", runDetection);

	/* save ------------------------------------------------------------------- */
	const save = () => {
		const badData: BadDataFlag[] = [];
		bad.forEach((v, kind) => {
			if (v.on) badData.push({ kind, note: v.note.trim() });
		});
		const questionAnswers = Array.from(answers.entries())
			.filter(([, s]) => s !== "not_asked")
			.map(([questionId, s]) => ({ questionId, state: s }));

		store.addConversation({
			contactId,
			date: state.date || todayISO(),
			channel: state.channel,
			facts: state.facts,
			commitment: state.commitment,
			badData,
			questionAnswers,
			nextStep: state.nextStep,
			outcome: state.outcome,
		});
		if (state.nextStepDate) {
			store.updateContact(contactId, { nextStepDate: state.nextStepDate });
		}
		view.openContact(contactId);
	};
}
