import { Notice } from "obsidian";
import { analyzeConversationWithLangGraph } from "../ai/conversationAnalysis";
import type { ConversationAnalysisResult } from "../ai/conversationAnalysis";
import type { CRMView } from "../view";
import { div, span, button } from "../util/dom";
import { todayISO } from "../util/dates";
import {
	AnswerState,
	BadDataKind,
	Channel,
	Commitment,
	Outcome,
	CHANNEL_META,
	COMMITMENT_META,
	BAD_DATA_META,
	DEFAULT_CONVERSATION_CHANNEL,
} from "../types";

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
	const activeContact = contact;
	const type = store.getType(contact.typeId);

	const state = {
		date: todayISO(),
		channel: store.data.defaultConversationChannel ?? DEFAULT_CONVERSATION_CHANNEL,
		facts: "",
		commitment: "none" as Commitment,
		outcome: "advancing" as Outcome,
	};
	const answers = new Map<string, AnswerState>();
	type?.questions.forEach((q) => answers.set(q.id, "not_asked"));
	const bad = new Map<BadDataKind, BadState>([
		["compliment", { on: false, note: "", touched: false }],
		["fluff", { on: false, note: "", touched: false }],
		["hypothetical", { on: false, note: "", touched: false }],
	]);
	let analysisApplied = false;
	let lastAnalyzedTranscript = "";
	let analysisRunId = 0;
	let autoAnalyzeTimer: number | null = null;

	const head = div(root, "scrm-detail-head");
	const back = span(head, "scrm-mono-mini scrm-link", "← contacts");
	back.addEventListener("click", () => view.navigate({ screen: "contacts" }));
	const idcol = div(head, "scrm-detail-idcol");
	div(idcol, "scrm-detail-name", `Log conversation — ${contact.name}`);
	div(
		idcol,
		"scrm-detail-sub",
		[contact.company, type ? `type: ${type.name}` : ""].filter(Boolean).join(" · "),
	);
	button(head, "scrm-btn", "conversation log", () => view.openConversationLog(contactId));

	const grid = div(root, "scrm-log-grid");
	const main = div(grid, "scrm-panel");
	const side = div(grid, "scrm-panel scrm-side");

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
	(Object.keys(CHANNEL_META) as Channel[]).forEach((channel) => {
		const option = chSel.createEl("option", { text: CHANNEL_META[channel].label });
		option.value = channel;
	});
	chSel.value = state.channel;
	chSel.addEventListener("change", () => {
		state.channel = chSel.value as Channel;
		store.rememberConversationChannel(state.channel);
	});
	span(chSelWrap, "scrm-select-caret", "▾");

	const chatField = div(main, "scrm-field scrm-ai-field");
	div(chatField, "scrm-field-label", "Conversation transcript");
	div(
		chatField,
		"scrm-field-desc",
		"Paste the chat with the user. Qwen labels facts, compliments, commitments and question matches.",
	);
	const chatInput = chatField.createEl("textarea", {
		cls: "scrm-input scrm-textarea scrm-ai-chat",
	});
	chatInput.rows = 8;
	chatInput.setAttr("placeholder", "Paste LinkedIn chat transcript here...");
	const aiActions = div(chatField, "scrm-ai-actions");
	const analysisStatus = span(aiActions, "scrm-mono-mini");
	const analysisResult = div(chatField, "scrm-ai-result");

	const detectRow = div(main, "scrm-detect");
	const signalSummary = div(main, "scrm-ai-signals");
	chatInput.addEventListener("input", () => {
		analysisApplied = false;
		analysisStatus.setText("");
		analysisResult.empty();
		signalSummary.empty();
		scheduleAutoAnalysis();
	});

	const foot = div(main, "scrm-modal-foot");
	button(foot, "scrm-btn", "Cancel", () => view.openConversationLog(contactId));
	button(foot, "scrm-btn scrm-btn-primary", "Save conversation", () => void save());

	const reminder = div(side, "scrm-momtest");
	div(reminder, "scrm-panel-label scrm-accent", "MOM TEST REMINDER");
	div(
		reminder,
		"scrm-momtest-text",
		"Use the chat as raw material. Keep concrete past/present facts, real commitments, and answered questions. Compliments, fluff, and hypotheticals are not signal.",
	);
	const autoNote = div(side, "scrm-side-block");
	div(autoNote, "scrm-panel-label", "LOCAL QWEN");
	div(
		autoNote,
		"scrm-momtest-text",
		"Only this contact, this person type, the 3 questions and pasted chat are sent to Ollama on your machine.",
	);

	function paintDetected(hits: string[]): void {
		detectRow.empty();
		if (hits.length) {
			span(detectRow, "scrm-detect-label", "DETECTED");
			hits.forEach((h) => span(detectRow, "scrm-detect-chip", h));
		}
	}

	function scheduleAutoAnalysis(): void {
		if (autoAnalyzeTimer) window.clearTimeout(autoAnalyzeTimer);
		const transcript = chatInput.value.trim();
		if (transcript.length < 20) return;
		analysisStatus.setText("Will analyze after paste settles...");
		autoAnalyzeTimer = window.setTimeout(() => {
			autoAnalyzeTimer = null;
			void runAiAnalysis({ force: false });
		}, 1200);
	}

	function applyAnalysis(result: ConversationAnalysisResult): void {
		state.facts = result.draft.facts;

		state.commitment = result.draft.commitment;
		state.outcome = result.draft.outcome;

		answers.forEach((_, questionId) => {
			answers.set(questionId, "not_asked");
		});
		result.draft.questionAnswers.forEach((answer) => {
			if (!answers.has(answer.questionId)) return;
			answers.set(answer.questionId, answer.state);
		});

		const draftBad = new Map(result.draft.badData.map((entry) => [entry.kind, entry.note]));
		(Object.keys(BAD_DATA_META) as BadDataKind[]).forEach((kind) => {
			const entry = bad.get(kind)!;
			const note = draftBad.get(kind) ?? "";
			entry.on = note.length > 0;
			entry.note = note;
			entry.touched = true;
		});

		const hits: string[] = [];
		if (state.commitment !== "none") hits.push(`commitment: ${state.commitment}`);
		bad.forEach((entry, kind) => {
			if (entry.on) hits.push(kind);
		});
		paintDetected(hits);
		analysisApplied = true;
		paintSignalSummary();
	}

	function paintSignalSummary(): void {
		signalSummary.empty();
		if (!analysisApplied) return;

		div(signalSummary, "scrm-panel-label", "QWEN DECISIONS");
		const commitmentRow = div(signalSummary, "scrm-ai-signal-row");
		span(commitmentRow, "scrm-mono-mini scrm-muted", "COMMITMENT");
		const commitment = COMMITMENT_META[state.commitment];
		span(commitmentRow, "scrm-chip scrm-chip-commit", `${commitment.icon} ${commitment.label}`);

		if (!type?.questions.length) return;
		const questionWrap = div(signalSummary, "scrm-ai-question-summary");
		for (const q of type.questions) {
			const answer = answers.get(q.id) ?? "not_asked";
			const row = div(questionWrap, "scrm-qcheck is-readonly is-" + answer);
			const box = div(row, "scrm-qcheck-box");
			box.setText(answer === "answered" ? "✓" : answer === "murky" ? "~" : "");
			div(row, "scrm-qcheck-text", q.text || "(empty question)");
			span(row, "scrm-qcheck-state", STATE_LABEL[answer]);
		}
	}

	function paintAnalysisResult(result: ConversationAnalysisResult): void {
		analysisResult.empty();
		const head = div(analysisResult, "scrm-ai-result-head");
		div(
			head,
			"scrm-mono-mini",
			`${result.source.toUpperCase()} · ${result.lines.length} TURNS`,
		);
		result.warnings.forEach((warning) => div(analysisResult, "scrm-ai-warning", warning));

		const lines = div(analysisResult, "scrm-ai-lines");
		result.lines.forEach((line) => {
			const row = div(lines, "scrm-ai-line");
			span(row, `scrm-ai-label scrm-ai-label-${line.label}`, line.label);
			span(row, "scrm-ai-confidence", `${Math.round(line.confidence * 100)}%`);
			div(row, "scrm-ai-line-text", line.speaker ? `${line.speaker}: ${line.text}` : line.text);
			if (line.questionId) span(row, "scrm-ai-question", line.questionId);
		});
	}

	async function runAiAnalysis(options: { force: boolean }): Promise<boolean> {
		const transcript = chatInput.value.trim();
		if (!transcript) return false;
		if (!options.force && analysisApplied && transcript === lastAnalyzedTranscript) {
			return true;
		}
		const runId = ++analysisRunId;
		analysisStatus.setText("Auto-analyzing...");
		analysisResult.empty();
		try {
			const result = await analyzeConversationWithLangGraph({
				transcript,
				context: {
					contactName: activeContact.name,
					company: activeContact.company,
					personTypeName: type?.name ?? "",
					questions: type?.questions.map((q) => ({ id: q.id, text: q.text })) ?? [],
				},
			});
			if (runId !== analysisRunId) return false;
			lastAnalyzedTranscript = transcript;
			paintAnalysisResult(result);
			applyAnalysis(result);
			analysisStatus.setText(
				result.source === "qwen" ? "Qwen decisions applied." : "Heuristic fallback applied.",
			);
			return true;
		} catch (err) {
			if (runId !== analysisRunId) return false;
			const message = err instanceof Error ? err.message : String(err);
			analysisStatus.setText("Analysis failed.");
			new Notice(`Qwen analysis failed: ${message}`);
			return false;
		}
	}

	async function save(): Promise<void> {
		if (autoAnalyzeTimer) {
			window.clearTimeout(autoAnalyzeTimer);
			autoAnalyzeTimer = null;
		}
		const transcript = chatInput.value.trim();
		if (transcript && !analysisApplied) {
			const ok = await runAiAnalysis({ force: true });
			if (!ok) return;
		}
		if (!transcript) {
			new Notice("Paste chat before saving.");
			return;
		}

		const badData: { kind: BadDataKind; note: string }[] = [];
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
			conversationUrl: "",
			facts: state.facts,
			commitment: state.commitment,
			badData,
			questionAnswers,
			nextStep: "",
			outcome: state.outcome,
		});
		view.openConversationLog(contactId);
	}
}
