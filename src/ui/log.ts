import { Notice } from "obsidian";
import {
	analyzeConversationWithLangGraph,
	inferQuestionAnswersFromTranscript,
} from "../ai/conversationAnalysis";
import type {
	ConversationAnalysisContext,
	ConversationAnalysisResult,
} from "../ai/conversationAnalysis";
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
	BAD_DATA_META,
	DEFAULT_CONVERSATION_CHANNEL,
} from "../types";

interface BadState {
	on: boolean;
	note: string;
	touched: boolean;
}

export function renderLog(root: HTMLElement, view: CRMView, contactId: string): void {
	renderConversationComposerInternal(root, view, contactId, { embedded: false });
}

export function renderConversationComposer(
	root: HTMLElement,
	view: CRMView,
	contactId: string,
	sideTarget?: HTMLElement,
	controlsTarget?: HTMLElement,
): void {
	renderConversationComposerInternal(root, view, contactId, {
		embedded: true,
		sideTarget,
		controlsTarget,
	});
}

function renderConversationComposerInternal(
	root: HTMLElement,
	view: CRMView,
	contactId: string,
	options: { embedded: boolean; sideTarget?: HTMLElement; controlsTarget?: HTMLElement },
): void {
	const store = view.store;
	const contact = store.getContact(contactId);
	if (!contact) {
		div(root, "scrm-empty", "This contact no longer exists.");
		button(root, "scrm-btn", "← contacts", () => view.navigate({ screen: "contacts" }));
		return;
	}
	const activeContact = contact;
	const type = store.getType(contact.typeId);
	const loadedConversation = store.conversationsFor(contactId)[0] ?? null;
	const initialChannel = validChannel(
		loadedConversation?.channel || store.data.defaultConversationChannel,
	);

	const state = {
		date: loadedConversation?.date ?? todayISO(),
		channel: initialChannel,
		facts: loadedConversation?.facts ?? "",
		commitment: (loadedConversation?.commitment ?? "none") as Commitment,
		outcome: (loadedConversation?.outcome ?? "advancing") as Outcome,
	};
	const inferredAnswerResponses = new Map<string, string>();
	if (loadedConversation?.transcript && type?.questions.length) {
		inferQuestionAnswersFromTranscript({
			transcript: loadedConversation.transcript,
			context: analysisContext(),
		}).forEach((answer) => {
			if (answer.response?.trim()) {
				inferredAnswerResponses.set(answer.questionId, answer.response.trim());
			}
		});
	}
	const answers = new Map<string, AnswerState>();
	const answerResponses = new Map<string, string>();
	type?.questions.forEach((q) => answers.set(q.id, "not_asked"));
	loadedConversation?.questionAnswers.forEach((answer) => {
		if (answers.has(answer.questionId)) answers.set(answer.questionId, answer.state);
		const response = answer.response?.trim() || inferredAnswerResponses.get(answer.questionId);
		if (answers.has(answer.questionId) && response) {
			answerResponses.set(answer.questionId, response);
		}
	});
	const bad = new Map<BadDataKind, BadState>([
		["compliment", { on: false, note: "", touched: false }],
		["fluff", { on: false, note: "", touched: false }],
		["hypothetical", { on: false, note: "", touched: false }],
	]);
	loadedConversation?.badData.forEach((entry) => {
		bad.set(entry.kind, { on: true, note: entry.note, touched: true });
	});
	let savedConversationId: string | null = loadedConversation?.id ?? null;
	let analysisApplied = !!loadedConversation?.transcript;
	let lastAnalyzedTranscript = loadedConversation?.transcript ?? "";
	let lastPersistedSignature = "";
	let analysisRunId = 0;
	let autoAnalyzeTimer: number | null = null;
	let notesSaveTimer: number | null = null;

	let main = root;
	let side: HTMLElement | null = options.sideTarget ?? null;
	if (!options.embedded) {
		const head = div(root, "scrm-detail-head");
		const idcol = div(head, "scrm-detail-idcol");
		div(idcol, "scrm-detail-name", `Log conversation — ${contact.name}`);
		div(
			idcol,
			"scrm-detail-sub",
			[contact.company, type ? `type: ${type.name}` : ""].filter(Boolean).join(" · "),
		);
		button(head, "scrm-btn", "conversation log", () => view.openConversationLog(contactId));

		const grid = div(root, "scrm-log-grid");
		main = div(grid, "scrm-panel scrm-composer-panel");
		side = div(grid, "scrm-panel scrm-side");
	}

	const controls = options.controlsTarget ?? main;
	const chWrap = div(
		controls,
		options.controlsTarget ? "scrm-action-channel" : "scrm-field scrm-action-channel",
	);
	if (!options.controlsTarget) div(chWrap, "scrm-field-label", "Channel");
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
		if (chatInput.value.trim() || notesInput.value.trim()) {
			void persistConversation();
		}
	});
	span(chSelWrap, "scrm-select-caret", "▾");
	const conversationBadges = div(
		controls,
		options.controlsTarget
			? "scrm-conversation-badges"
			: "scrm-conversation-badges scrm-conversation-badges-block",
	);

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
	chatInput.value = loadedConversation?.transcript ?? "";
	chatInput.setAttr("placeholder", "Paste LinkedIn chat transcript here...");
	autoSizeTextarea(chatInput);
	const aiActions = div(chatField, "scrm-ai-actions");
	const analysisStatus = span(aiActions, "scrm-mono-mini");
	const analysisResult = div(chatField, "scrm-ai-result");

	const notesField = div(main, "scrm-field scrm-notes-field");
	div(notesField, "scrm-field-label", "Notes");
	div(notesField, "scrm-field-desc", "Quick manual notes for this conversation.");
	const notesInput = notesField.createEl("textarea", {
		cls: "scrm-input scrm-textarea scrm-notes-input",
	});
	notesInput.value = loadedConversation?.notes ?? "";
	notesInput.setAttr("placeholder", "Add notes here...");
	autoSizeTextarea(notesInput);
	const notesStatus = div(notesField, "scrm-mono-mini scrm-muted");

	const questionsPanel = side ? div(side, "scrm-side-block") : null;
	chatInput.addEventListener("input", () => {
		autoSizeTextarea(chatInput);
		analysisRunId++;
		analysisApplied = false;
		analysisStatus.setText("");
		analysisResult.empty();
		answers.forEach((_, questionId) => answers.set(questionId, "not_asked"));
		answerResponses.clear();
		paintConversationBadges();
		paintSideQuestions();
		scheduleAutoAnalysis();
	});
	notesInput.addEventListener("input", () => {
		autoSizeTextarea(notesInput);
		scheduleNotesSave();
	});

	if (!options.embedded) {
		const foot = div(main, "scrm-modal-foot");
		button(foot, "scrm-btn", "Cancel", () => view.openConversationLog(contactId));
	}

	if (questionsPanel) paintSideQuestions();
	if (loadedConversation) {
		lastPersistedSignature = currentSignature(chatInput.value.trim());
		paintLoadedConversation();
		if (
			loadedConversation.transcript.trim() &&
			type?.questions.length &&
			!loadedConversation.questionAnswers.length
		) {
			window.setTimeout(() => void runAiAnalysis({ force: true }), 250);
		}
	}

	function paintConversationBadges(): void {
		conversationBadges.empty();
		if (!analysisApplied) return;
		let count = 0;
		bad.forEach((entry, kind) => {
			if (!entry.on) return;
			const meta = BAD_DATA_META[kind];
			const note = entry.note.trim();
			span(
				conversationBadges,
				"scrm-chip scrm-chip-bad",
				`${meta.icon} ${meta.label}${note ? `: ${clip(note, 42)}` : ""}`,
			);
			count++;
		});
		if (!count) {
			span(conversationBadges, "scrm-chip scrm-chip-empty", "no bad-data");
		}
	}

	function paintLoadedConversation(): void {
		paintConversationBadges();
		paintSideQuestions();
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

	function scheduleNotesSave(): void {
		if (notesSaveTimer) window.clearTimeout(notesSaveTimer);
		notesStatus.setText("Saving notes...");
		notesSaveTimer = window.setTimeout(async () => {
			notesSaveTimer = null;
			const saved = await persistConversation();
			notesStatus.setText(saved ? "Notes saved." : "");
		}, 500);
	}

	function applyAnalysis(result: ConversationAnalysisResult): void {
		state.facts = result.draft.facts;

		state.commitment = result.draft.commitment;
		state.outcome = result.draft.outcome;

		answers.forEach((_, questionId) => {
			answers.set(questionId, "not_asked");
		});
		answerResponses.clear();
		result.draft.questionAnswers.forEach((answer) => {
			if (!answers.has(answer.questionId)) return;
			answers.set(answer.questionId, answer.state);
			if (answer.response?.trim()) {
				answerResponses.set(answer.questionId, answer.response.trim());
			}
		});

		const draftBad = new Map(result.draft.badData.map((entry) => [entry.kind, entry.note]));
		(Object.keys(BAD_DATA_META) as BadDataKind[]).forEach((kind) => {
			const entry = bad.get(kind)!;
			const note = draftBad.get(kind) ?? "";
			entry.on = note.length > 0;
			entry.note = note;
			entry.touched = true;
		});

		analysisApplied = true;
		paintConversationBadges();
		paintSideQuestions();
	}

	function paintSideQuestions(): void {
		if (!questionsPanel) return;
		questionsPanel.empty();
		const label = div(questionsPanel, "scrm-panel-label");
		label.appendText("BIG QUESTIONS FOR THIS TYPE");
		if (!type) {
			div(questionsPanel, "scrm-muted", "No type set — ");
			const link = span(
				questionsPanel.lastElementChild as HTMLElement,
				"scrm-link scrm-accent",
				"assign one",
			);
			link.addEventListener("click", () => view.editContact(activeContact));
			return;
		}

		const th = div(questionsPanel, "scrm-side-typehead");
		const dot = span(th, "scrm-typedot");
		dot.style.background = type.color;
		span(th, "scrm-side-typename", type.name);

		const coverage = store.typeCoverage(type.id);
		const ql = div(questionsPanel, "scrm-qcov-list");
		type.questions.forEach((q, idx) => {
			const rowq = div(ql, "scrm-qcov");
			span(rowq, "scrm-qcov-n", "Q" + (idx + 1)).style.color = type.color;
			const qmain = div(rowq, "scrm-qcov-main");
			div(qmain, "scrm-qcov-text", q.text);
			const current = answers.get(q.id) ?? "not_asked";
			if (current !== "not_asked") {
				const state = current === "answered" ? "answered" : "murky";
				span(rowq, `scrm-cov scrm-cov-${state}`, current === "answered" ? "ANSWERED" : "MURKY");
				const response = answerResponses.get(q.id);
				if (response) div(qmain, "scrm-qcov-response", clip(response, 180));
				return;
			}
			const cvg = coverage[idx];
			const state = cvg?.state ?? "open";
			const badge =
				state === "answered"
					? `ANSWERED ×${cvg.answered}`
					: state === "murky"
						? `MURKY ×${cvg.murky}`
						: "OPEN";
			span(rowq, `scrm-cov scrm-cov-${state}`, badge);
		});
	}

	function paintAnalysisResult(result: ConversationAnalysisResult): void {
		analysisResult.empty();
		result.warnings.forEach((warning) => div(analysisResult, "scrm-ai-warning", warning));
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
				context: analysisContext(),
			});
			if (runId !== analysisRunId) return false;
			lastAnalyzedTranscript = transcript;
			paintAnalysisResult(result);
			applyAnalysis(result);
			await persistConversation();
			analysisStatus.setText(
				result.source === "qwen"
					? "Qwen decisions applied. Saved."
					: "Heuristic fallback applied. Saved.",
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

	async function persistConversation(): Promise<boolean> {
		const transcript = chatInput.value.trim();
		const notes = notesInput.value.trim();
		if (!transcript && !notes) return false;

		const badData: { kind: BadDataKind; note: string }[] = [];
		bad.forEach((v, kind) => {
			if (v.on) badData.push({ kind, note: v.note.trim() });
		});
		const questionAnswers = Array.from(answers.entries())
			.filter(([, s]) => s !== "not_asked")
			.map(([questionId, s]) => {
				const response = answerResponses.get(questionId);
				return {
					questionId,
					state: s,
					...(response ? { response } : {}),
				};
			});

		const payload = {
			contactId,
			date: state.date || todayISO(),
			channel: state.channel,
			conversationUrl: "",
			transcript,
			notes,
			facts: state.facts,
			commitment: state.commitment,
			badData,
			questionAnswers,
			nextStep: "",
			outcome: state.outcome,
		};
		const signature = currentSignature(transcript);
		if (signature === lastPersistedSignature) return true;
		if (savedConversationId) {
			store.updateConversation(savedConversationId, payload, { silent: options.embedded });
		} else {
			const saved = store.addConversation(payload, { silent: options.embedded });
			savedConversationId = saved.id;
		}
		lastPersistedSignature = signature;
		return true;
	}

	function currentSignature(transcript: string): string {
		const badData = Array.from(bad.entries())
			.filter(([, v]) => v.on)
			.map(([kind, v]) => `${kind}:${v.note.trim()}`)
			.sort();
		const questionAnswers = Array.from(answers.entries())
			.filter(([, s]) => s !== "not_asked")
			.map(([questionId, s]) => `${questionId}:${s}:${answerResponses.get(questionId) ?? ""}`)
			.sort();
		return JSON.stringify({
			date: state.date || todayISO(),
			channel: state.channel,
			transcript,
			notes: notesInput.value.trim(),
			facts: state.facts,
			commitment: state.commitment,
			badData,
			questionAnswers,
			outcome: state.outcome,
		});
	}

	function analysisContext(): ConversationAnalysisContext {
		return {
			contactName: activeContact.name,
			company: activeContact.company,
			personTypeName: type?.name ?? "",
			questions: type?.questions.map((q) => ({ id: q.id, text: q.text })) ?? [],
		};
	}
}

function clip(value: string, max: number): string {
	const clean = value.replace(/\s+/g, " ").trim();
	if (clean.length <= max) return clean;
	return clean.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function validChannel(value: unknown): Channel {
	return typeof value === "string" && value in CHANNEL_META
		? (value as Channel)
		: DEFAULT_CONVERSATION_CHANNEL;
}

function autoSizeTextarea(textarea: HTMLTextAreaElement): void {
	textarea.style.height = "auto";
	textarea.style.height = `${textarea.scrollHeight}px`;
}
