import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
	AnswerState,
	BadDataFlag,
	BadDataKind,
	Commitment,
	Outcome,
	QuestionAnswer,
} from "../types";
import { detect } from "../util/detect";

export type ConversationLineLabel =
	| "fact"
	| "compliment"
	| "commitment"
	| "hypothetical"
	| "fluff"
	| "opinion"
	| "other";

export interface ConversationAnalysisQuestion {
	id: string;
	text: string;
}

export interface ConversationAnalysisContext {
	contactName: string;
	company: string;
	personTypeName: string;
	questions: ConversationAnalysisQuestion[];
}

export interface ConversationLineAnalysis {
	line: number;
	speaker: string | null;
	text: string;
	label: ConversationLineLabel;
	confidence: number;
	questionId: string | null;
	reason: string;
}

export interface ConversationAnalysisDraft {
	facts: string;
	commitment: Commitment;
	badData: BadDataFlag[];
	questionAnswers: QuestionAnswer[];
	outcome: Outcome;
}

export interface ConversationAnalysisResult {
	source: "qwen" | "heuristic";
	lines: ConversationLineAnalysis[];
	draft: ConversationAnalysisDraft;
	warnings: string[];
}

export interface ConversationAnalysisInput {
	transcript: string;
	context: ConversationAnalysisContext;
	model?: string;
	endpoint?: string;
}

interface GraphState {
	transcript: string;
	context: ConversationAnalysisContext;
	model: string;
	endpoint: string;
	prompt: string;
	raw: string | null;
	modelError: string | null;
	result: ConversationAnalysisResult | null;
}

interface ModelLine {
	line?: number;
	speaker?: string | null;
	text?: string;
	label?: string;
	confidence?: number;
	questionId?: string | null;
	reason?: string;
}

interface ConversationTurn {
	line: number;
	speaker: string | null;
	text: string;
}

interface ModelQuestionAnswer {
	questionId?: string;
	state?: string;
	response?: string;
}

interface ModelBadData {
	kind?: string;
	note?: string;
}

interface ModelResult {
	lines?: ModelLine[];
	draft?: {
		facts?: string | string[];
		commitment?: string;
		badData?: ModelBadData[];
		questionAnswers?: ModelQuestionAnswer[];
		outcome?: string;
	};
	warnings?: string[];
}

const DEFAULT_MODEL = "qwen3:1.7b";
const DEFAULT_ENDPOINT = "http://127.0.0.1:11434/api/generate";

const LABELS: ConversationLineLabel[] = [
	"fact",
	"compliment",
	"commitment",
	"hypothetical",
	"fluff",
	"opinion",
	"other",
];
const BAD_LABELS: Partial<Record<ConversationLineLabel, BadDataKind>> = {
	compliment: "compliment",
	hypothetical: "hypothetical",
	fluff: "fluff",
};
const VALID_COMMITMENTS: Commitment[] = ["time", "reputation", "money", "none"];
const VALID_OUTCOMES: Outcome[] = ["advancing", "stalled", "dead"];
const VALID_ANSWER_STATES: AnswerState[] = ["answered", "murky", "not_asked"];

const STOP_WORDS = new Set([
	"the",
	"and",
	"for",
	"with",
	"that",
	"this",
	"what",
	"when",
	"where",
	"who",
	"how",
	"does",
	"did",
	"do",
	"their",
	"they",
	"them",
	"you",
	"your",
	"que",
	"como",
	"para",
	"con",
	"por",
	"los",
	"las",
	"una",
	"del",
	"cuando",
	"donde",
	"quien",
	"cuanto",
	"actual",
]);

const AnalysisState = Annotation.Root({
	transcript: Annotation<string>(),
	context: Annotation<ConversationAnalysisContext>(),
	model: Annotation<string>(),
	endpoint: Annotation<string>(),
	prompt: Annotation<string>(),
	raw: Annotation<string | null>(),
	modelError: Annotation<string | null>(),
	result: Annotation<ConversationAnalysisResult | null>(),
});

const graph = new StateGraph(AnalysisState)
	.addNode("prepare_prompt", preparePrompt)
	.addNode("call_model", callModel)
	.addNode("normalize_result", normalizeResult)
	.addEdge(START, "prepare_prompt")
	.addEdge("prepare_prompt", "call_model")
	.addEdge("call_model", "normalize_result")
	.addEdge("normalize_result", END)
	.compile();

export async function analyzeConversationWithLangGraph(
	input: ConversationAnalysisInput,
): Promise<ConversationAnalysisResult> {
	const result = await graph.invoke({
		transcript: input.transcript,
		context: input.context,
		model: input.model || DEFAULT_MODEL,
		endpoint: input.endpoint || DEFAULT_ENDPOINT,
		prompt: "",
		raw: null,
		modelError: null,
		result: null,
	});
	return result.result ?? heuristicResult(input.transcript, input.context, [
		"Graph returned no result; used heuristic fallback.",
	]);
}

export function inferQuestionAnswersFromTranscript(
	input: Pick<ConversationAnalysisInput, "transcript" | "context">,
): QuestionAnswer[] {
	return heuristicResult(input.transcript, input.context, []).draft.questionAnswers;
}

function preparePrompt(state: typeof AnalysisState.State): Partial<GraphState> {
	return { prompt: buildPrompt(state.transcript, state.context) };
}

async function callModel(state: typeof AnalysisState.State): Promise<Partial<GraphState>> {
	try {
		const response = await fetch(state.endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: state.model,
				prompt: state.prompt,
				stream: false,
				format: "json",
				options: {
					temperature: 0.1,
					num_ctx: 4096,
				},
			}),
		});
		if (!response.ok) {
			const errorBody = await response.text().catch(() => "");
			throw new Error(
				`${response.status} ${response.statusText}${errorBody ? `: ${errorBody.slice(0, 200)}` : ""}`,
			);
		}
		const body = (await response.json()) as { response?: string; error?: string };
		if (body.error) throw new Error(body.error);
		return { raw: body.response ?? "", modelError: null };
	} catch (err) {
		return { raw: null, modelError: err instanceof Error ? err.message : String(err) };
	}
}

function normalizeResult(state: typeof AnalysisState.State): Partial<GraphState> {
	const warnings: string[] = [];
	if (state.modelError) warnings.push(`Qwen unavailable: ${state.modelError}`);
	if (!state.raw) {
		return { result: heuristicResult(state.transcript, state.context, warnings) };
	}

	const parsed = parseJsonObject(state.raw);
	if (!parsed) {
		return {
			result: heuristicResult(state.transcript, state.context, [
				...warnings,
				"Qwen returned invalid JSON; used heuristic fallback.",
			]),
		};
	}

	const result = normalizeModelResult(parsed, state.transcript, state.context, warnings);
	return { result };
}

function buildPrompt(transcript: string, context: ConversationAnalysisContext): string {
	const questions = context.questions
		.map((q, idx) => `${idx + 1}. id=${q.id} text=${q.text}`)
		.join("\n");
	const turns = splitLines(transcript)
		.map((turn) => {
			const speaker = turn.speaker ? ` speaker=${turn.speaker}` : "";
			return `${turn.line}.${speaker} text=${turn.text}`;
		})
		.join("\n");

	return `You classify a full customer discovery chat for a Mom Test CRM.

Use only this context:
Contact: ${context.contactName || "(unknown)"}
Company: ${context.company || "(none)"}
Person type: ${context.personTypeName || "(none)"}
Big questions:
${questions || "(none)"}

Labels:
- fact: concrete past/present detail about their life or business.
- compliment: praise/opinion about our idea, not evidence.
- commitment: gave time, money, reputation, intro, demo, meeting, payment, trial, or concrete action.
- hypothetical: future/conditional talk like "would", "could", "maybe", "si tuviera".
- fluff: vague generality like "always", "usually", "normally", "siempre", "en general".
- opinion: preference or belief without concrete behavior.
- other: anything else.

Rules:
- Return strict JSON only. No markdown.
- The first speaker who opens the conversation is the seller doing outreach, never the prospect.
- The contact named above is the prospect/customer.
- Read the whole conversation from start to finish before tagging.
- Classify complete conversation turns, not individual raw transcript lines.
- Return exactly one lines item for every Conversation turn, preserving line numbers and text.
- A speaker-name header, timestamp, or sender label is metadata, not a fact.
- Only the prospect/customer's turns can become facts, commitments, bad data, or question answers.
- The seller's own questions and follow-ups are other unless they quote a prospect fact.
- Seller questions can identify which big question was asked.
- Grade questionAnswers from the next prospect/customer response: specific fact or commitment = answered; vague, opinion, hypothetical, or partial answer = murky; no response = not_asked.
- Include the exact prospect/customer answer turn as questionAnswers.response.
- If a big question gets a direct but generic/partial prospect response, return murky rather than omitting the question.
- Put questionId on the prospect/customer answer turn, not on the seller question turn.
- Match questionId only to ids above. Use null when unsure.
- Big questions are context, not a checklist to force-fill.
- Mark question answer only when the prospect answers with a useful fact or commitment.
- A seller/outreach/follow-up question is not a question answer.
- Do not label seller questions as hypothetical. Example: "Do you mind if I ask how you're dealing with this?" is other.
- Do not treat chat headers or timestamps like "André Ponce 11:45" as facts.
- Keep facts as concise newline-separated facts. Exclude compliments and hypotheticals.
- Use confidence from 0 to 1.

JSON schema:
{
  "lines": [
    {
      "line": 1,
      "speaker": "speaker name or null",
      "text": "complete turn text without speaker header",
      "label": "fact|compliment|commitment|hypothetical|fluff|opinion|other",
      "confidence": 0.0,
      "questionId": "question id or null",
      "reason": "short reason"
    }
  ],
  "draft": {
    "facts": "newline-separated factual notes only",
    "commitment": "time|reputation|money|none",
    "badData": [{"kind": "compliment|fluff|hypothetical", "note": "short quote"}],
    "questionAnswers": [{"questionId": "id", "state": "answered|murky|not_asked", "response": "exact prospect/customer answer turn"}],
    "outcome": "advancing|stalled|dead"
  },
  "warnings": []
}

Conversation turns:
${turns}`;
}

function normalizeModelResult(
	model: ModelResult,
	transcript: string,
	context: ConversationAnalysisContext,
	warnings: string[],
): ConversationAnalysisResult {
	const questionIds = new Set(context.questions.map((q) => q.id));
	const transcriptLines = splitLines(transcript);
	const sellerSpeakers = identifySellerSpeakers(transcriptLines, context);
	const modelLines = normalizeLines(model.lines, transcriptLines, questionIds, context, sellerSpeakers);
	const fallback = heuristicResult(transcript, context, []);
	// Derive the draft from real lines even when the model omits them,
	// otherwise sequence inference and fact extraction silently no-op.
	const lines = modelLines.length ? modelLines : fallback.lines;
	const draft = model.draft ?? {};

	const facts = normalizeFacts(draft.facts) || deriveFacts(lines) || fallback.draft.facts;
	const commitment =
		toCommitment(draft.commitment) ||
		(lines.some((line) => line.label === "commitment") ? "time" : fallback.draft.commitment);
	const badData = normalizeBadData(draft.badData, lines);
	const questionAnswers = normalizeQuestionAnswers(
		draft.questionAnswers,
		lines,
		questionIds,
		context,
		sellerSpeakers,
	);
	const outcome =
		toOutcome(draft.outcome) ||
		(commitment !== "none" ? "advancing" : fallback.draft.outcome);

	return {
		source: "qwen",
		lines,
		draft: {
			facts,
			commitment,
			badData,
			questionAnswers,
			outcome,
		},
		warnings: [
			...warnings,
			...(Array.isArray(model.warnings) ? model.warnings.map((w) => String(w)) : []),
		],
	};
}

function normalizeLines(
	modelLines: ModelLine[] | undefined,
	transcriptLines: ConversationTurn[],
	questionIds: Set<string>,
	context: ConversationAnalysisContext,
	sellerSpeakers: Set<string>,
): ConversationLineAnalysis[] {
	if (!Array.isArray(modelLines)) return [];
	if (!modelLines.length) return [];

	const transcriptLineNumbers = new Set(transcriptLines.map((line) => line.line));
	const modelByLine = new Map<number, ModelLine>();
	const modelByText = new Map<string, ModelLine>();
	modelLines.forEach((line) => {
		if (typeof line.line === "number" && transcriptLineNumbers.has(line.line)) {
			modelByLine.set(line.line, line);
		}
		const textKey = turnTextKey(cleanText(line.text));
		if (textKey && !modelByText.has(textKey)) modelByText.set(textKey, line);
	});
	const canTrustIndexFallback = modelLines.length === transcriptLines.length;

	return transcriptLines
		.map((fallbackLine, idx) => {
			const modelLine =
				modelByLine.get(fallbackLine.line) ??
				modelByText.get(turnTextKey(fallbackLine.text)) ??
				(canTrustIndexFallback ? modelLines[idx] : undefined);
			const text = fallbackLine.text;
			if (!text) return null;
			const speaker = fallbackLine.speaker || cleanText(modelLine?.speaker) || null;
			const heuristic = heuristicLabel(
				text,
				detect(text),
				speaker,
				context,
				sellerSpeakers,
			);
			const label = modelLine
				? sanitizeLineLabel(text, toLabel(modelLine.label), speaker, context, sellerSpeakers)
				: heuristic;
			const questionId =
				label !== "other" &&
				typeof modelLine?.questionId === "string" &&
				questionIds.has(modelLine.questionId)
					? modelLine.questionId
					: null;
			return {
				line: fallbackLine.line,
				speaker,
				text,
				label,
				confidence: modelLine
					? clampConfidence(modelLine.confidence)
					: heuristic === "other"
						? 0.4
						: 0.7,
				questionId,
				reason: modelLine ? cleanText(modelLine.reason) : "Local heuristic for missing model turn.",
			};
		})
		.filter((line): line is ConversationLineAnalysis => line !== null);
}

function heuristicResult(
	transcript: string,
	context: ConversationAnalysisContext,
	warnings: string[],
): ConversationAnalysisResult {
	const transcriptLines = splitLines(transcript);
	const sellerSpeakers = identifySellerSpeakers(transcriptLines, context);
	const lines = transcriptLines.map((line) => {
		const det = detect(line.text);
		const label = heuristicLabel(line.text, det, line.speaker, context, sellerSpeakers);
		return {
			line: line.line,
			speaker: line.speaker,
			text: line.text,
			label,
			confidence: label === "other" ? 0.4 : 0.7,
			questionId:
				label === "fact" || label === "commitment"
					? bestQuestionId(line.text, context.questions)
					: null,
			reason: "Local heuristic fallback.",
		};
	});
	const facts = deriveFacts(lines);
	const whole = detect(facts || transcript);
	const badData = normalizeBadData([], lines);
	const questionAnswers = normalizeQuestionAnswers(
		[],
		lines,
		new Set(context.questions.map((q) => q.id)),
		context,
		sellerSpeakers,
	);

	return {
		source: "heuristic",
		lines,
		draft: {
			facts,
			commitment:
				whole.commitment !== "none" || !lines.some((line) => line.label === "commitment")
					? whole.commitment
					: "time",
			badData,
			questionAnswers,
			outcome: whole.outcome,
		},
		warnings,
	};
}

function heuristicLabel(
	text: string,
	det: ReturnType<typeof detect>,
	speaker: string | null,
	context: ConversationAnalysisContext,
	sellerSpeakers: Set<string>,
): ConversationLineLabel {
	if (!isProspectTurn(text, speaker, context, sellerSpeakers)) return "other";
	if (isTranscriptHeader(text) || isSellerDiscoveryQuestion(text)) return "other";
	if (det.commitment !== "none") return "commitment";
	if (det.bad.compliment) return "compliment";
	if (det.bad.hypothetical) return "hypothetical";
	if (det.bad.fluff) return "fluff";
	if (hasSpecificQuestionAnswerSignal(text)) return "fact";
	return "other";
}

function sanitizeLineLabel(
	text: string,
	label: ConversationLineLabel,
	speaker: string | null,
	context: ConversationAnalysisContext,
	sellerSpeakers: Set<string>,
): ConversationLineLabel {
	if (!isProspectTurn(text, speaker, context, sellerSpeakers)) return "other";
	if (isTranscriptHeader(text)) return "other";
	if (isSellerDiscoveryQuestion(text)) return "other";
	return label;
}

function identifySellerSpeakers(
	turns: ConversationTurn[],
	context: ConversationAnalysisContext,
): Set<string> {
	const speakers = new Set<string>();
	// Outbound CRM: the seller always opens the conversation, so the first
	// named speaker is the seller unless it is the contact themself.
	const firstNamed = turns.find((turn) => speakerKey(turn.speaker));
	const firstKey = firstNamed ? speakerKey(firstNamed.speaker) : "";
	if (firstKey && !matchesContactName(firstKey, context)) speakers.add(firstKey);
	turns.forEach((turn) => {
		const key = speakerKey(turn.speaker);
		if (!key || matchesContactName(key, context)) return;
		if (isSellerQuestionText(turn.text, context)) speakers.add(key);
	});
	return speakers;
}

function matchesContactName(normalizedSpeaker: string, context: ConversationAnalysisContext): boolean {
	const normalizedContact = normalizeName(context.contactName);
	if (!normalizedContact || normalizedContact === "nuevo contacto") return false;
	return (
		normalizedSpeaker === normalizedContact ||
		normalizedSpeaker.includes(normalizedContact) ||
		normalizedContact.includes(normalizedSpeaker)
	);
}

function isProspectTurn(
	text: string,
	speaker: string | null,
	context: ConversationAnalysisContext,
	sellerSpeakers: Set<string>,
): boolean {
	const key = speakerKey(speaker);
	if (key && sellerSpeakers.has(key)) return false;
	if (key && matchesContactName(key, context)) return true;
	if (isSellerQuestionText(text, context)) return false;
	if (!key) return true;
	const normalizedContact = normalizeName(context.contactName);
	if (!normalizedContact || normalizedContact === "nuevo contacto") return true;
	return sellerSpeakers.size > 0;
}

function isSellerQuestionText(text: string, context: ConversationAnalysisContext): boolean {
	if (!text.includes("?")) return false;
	return isSellerDiscoveryQuestion(text) || bestQuestionId(text, context.questions) !== null;
}

function speakerKey(speaker: string | null): string {
	return speaker ? normalizeName(speaker) : "";
}

function normalizeName(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function isTranscriptHeader(text: string): boolean {
	const clean = text.trim();
	if (!clean) return false;
	return /^[\p{L}\p{M} .'-]{2,80}\s+\d{1,2}:\d{2}(\s?(am|pm))?$/iu.test(clean);
}

function isSellerDiscoveryQuestion(text: string): boolean {
	const clean = text.trim().toLowerCase();
	if (!clean.includes("?")) return false;
	if (
		/\b(how|what|when|who|where|why|which|cu[aá]l|c[oó]mo|cu[aá]ndo|d[oó]nde|qui[eé]n|por qu[eé])\b/i.test(
			clean,
		) &&
		/\b(you|your|you're|tu|tus|usted|su|sus)\b/i.test(clean)
	) {
		return true;
	}
	return [
		/\bdo you mind if i ask\b/,
		/\bcan i ask\b/,
		/\bcould i ask\b/,
		/\bi saw on your profile\b/,
		/\bi noticed\b/,
		/\bi was curious\b/,
		/\bi'?m curious\b/,
		/\bhow (are you|you're|you are) (dealing|handling|managing)\b/,
		/\bwhat'?s your current process\b/,
		/\bhow does that work today\b/,
		/\bte puedo preguntar\b/,
		/\bpuedo preguntarte\b/,
		/\bcómo (estás|estas) manejando\b/,
		/\bcómo (lo|la|los|las) manejas\b/,
	].some((pattern) => pattern.test(clean));
}

function isValidFactText(text: string): boolean {
	return !isTranscriptHeader(text) && !isSellerDiscoveryQuestion(text);
}

function normalizeFacts(facts: string | string[] | undefined): string {
	const values = Array.isArray(facts) ? facts : cleanText(facts).split(/\r?\n/);
	return values.map(cleanText).filter(isValidFactText).join("\n");
}

function deriveFacts(lines: ConversationLineAnalysis[]): string {
	return lines
		.filter((line) => line.label === "fact" || line.label === "commitment")
		.map((line) => line.text.trim())
		.filter(isValidFactText)
		.join("\n");
}

function normalizeBadData(
	modelBadData: ModelBadData[] | undefined,
	lines: ConversationLineAnalysis[],
): BadDataFlag[] {
	const notes = new Map<BadDataKind, string[]>();
	const add = (kind: BadDataKind, note: string) => {
		const clean = cleanText(note);
		if (!clean || !isValidFactText(clean)) return;
		const existing = notes.get(kind) ?? [];
		if (!existing.includes(clean)) existing.push(clean);
		notes.set(kind, existing);
	};

	if (Array.isArray(modelBadData)) {
		modelBadData.forEach((entry) => {
			const kind = toBadDataKind(entry.kind);
			if (kind) add(kind, entry.note ?? "");
		});
	}
	lines.forEach((line) => {
		const kind = BAD_LABELS[line.label];
		if (kind) add(kind, line.text);
	});

	return Array.from(notes.entries()).map(([kind, values]) => ({
		kind,
		note: values.slice(0, 2).join("; "),
	}));
}

function normalizeQuestionAnswers(
	modelAnswers: ModelQuestionAnswer[] | undefined,
	lines: ConversationLineAnalysis[],
	questionIds: Set<string>,
	context: ConversationAnalysisContext,
	sellerSpeakers: Set<string>,
): QuestionAnswer[] {
	const answers = new Map<string, { state: AnswerState; response: string }>();
	const setAnswer = (
		questionId: string,
		state: AnswerState,
		response = "",
		allowDowngrade = false,
	) => {
		if (!questionIds.has(questionId) || state === "not_asked") return;
		const current = answers.get(questionId);
		const cleanResponse = cleanQuestionResponse(response);
		if (current?.state === "answered" && state !== "answered" && !allowDowngrade) {
			if (!current.response && cleanResponse) current.response = cleanResponse;
			return;
		}
		answers.set(questionId, {
			state: current?.state === "murky" && state !== "answered" ? current.state : state,
			response: cleanResponse || current?.response || "",
		});
	};

	if (Array.isArray(modelAnswers)) {
		modelAnswers.forEach((answer) => {
			const state = toAnswerState(answer.state);
			if (answer.questionId && state) {
				setAnswer(answer.questionId, state, answer.response);
			}
		});
	}
	lines.forEach((line) => {
		if (!line.questionId) return;
		const state = classifyQuestionResponse(line);
		if (state !== "not_asked") setAnswer(line.questionId, state, line.text);
	});
	inferQuestionAnswersFromSequence(lines, context, sellerSpeakers).forEach(
		(answer, questionId) => {
			setAnswer(questionId, answer.state, answer.response, true);
		},
	);

	return Array.from(answers.entries()).map(([questionId, answer]) => ({
		questionId,
		state: answer.state,
		...(answer.response ? { response: answer.response } : {}),
	}));
}

function inferQuestionAnswersFromSequence(
	lines: ConversationLineAnalysis[],
	context: ConversationAnalysisContext,
	sellerSpeakers: Set<string>,
): Map<string, { state: AnswerState; response: string }> {
	const answers = new Map<string, { state: AnswerState; response: string }>();
	lines.forEach((line, idx) => {
		if (!isSellerQuestionText(line.text, context)) return;
		const questionId = bestQuestionId(line.text, context.questions);
		if (!questionId) return;
		const response = lines
			.slice(idx + 1)
			.find((candidate) =>
				isProspectTurn(candidate.text, candidate.speaker, context, sellerSpeakers) &&
				!isSellerQuestionText(candidate.text, context),
			);
		if (!response) return;
		answers.set(questionId, {
			state: classifyQuestionResponse(response),
			response: response.text,
		});
	});
	return answers;
}

function cleanQuestionResponse(value: string | undefined): string {
	return cleanText(value).replace(/\s+/g, " ");
}

function classifyQuestionResponse(line: ConversationLineAnalysis): AnswerState {
	if (line.label === "commitment") return "answered";
	if (line.label === "compliment" || line.label === "hypothetical" || line.label === "fluff") {
		return "murky";
	}
	const text = line.text.trim();
	if (!text) return "not_asked";
	const det = detect(text);
	if (det.commitment !== "none") return "answered";
	if (det.bad.compliment || det.bad.hypothetical || det.bad.fluff) return "murky";
	if (/^(yes|yeah|yep|sure|ok|okay|si|sí|claro|dale|va|tengo un momento)\b/i.test(text)) {
		return "murky";
	}
	if (isGenericQuestionResponse(text)) return "murky";
	if (hasSpecificQuestionAnswerSignal(text)) return "answered";
	const contentTokens = Array.from(tokenize(text));
	if (line.label === "fact" && contentTokens.length >= 6 && !text.includes("?")) {
		return "answered";
	}
	return "murky";
}

function isGenericQuestionResponse(text: string): boolean {
	const clean = text.trim();
	const tokens = tokenize(clean);
	if (
		tokens.size <= 5 &&
		/\b(buen[ao]s?|good|great|mejor|herramienta|tool|app|software)\b/i.test(clean) &&
		!hasSpecificQuestionAnswerSignal(clean)
	) {
		return true;
	}
	return (
		/^(una?\s+)?(buena?|good|great)\s+(herramienta|tool|app|software)(\s+para\s+.+)?$/iu.test(clean) &&
		!hasSpecificQuestionAnswerSignal(clean)
	);
}

function hasSpecificQuestionAnswerSignal(text: string): boolean {
	return (
		/\d|last|yesterday|today|week|month|paid|lost|uses|takes|customers?|orders?|ayer|hoy|semana|mes|pag[óo]|perd|usa|clientes?|pedidos?/i.test(text) ||
		/\b(html|responsive|mobile|m[óo]vil|outlook|gmail|mailchimp|hubspot|klaviyo|c[óo]digo|template|plantilla|preview|previsual|spam|render|compatib|integraci[óo]n|automatiz|personaliz|tracking|analytics|im[aá]genes?|assets?|editor|drag|drop|arrastrar)\b/i.test(text) ||
		/\b(debe|deba|necesit|tiene que|importante|requier|requiere|require|must|should|needs?|soporte|permita|incluya|exporte|integre|evite|resuelva|problema|dolor|falla|error)\b/i.test(text)
	);
}

function bestQuestionId(
	text: string,
	questions: ConversationAnalysisQuestion[],
): string | null {
	let bestId: string | null = null;
	let bestScore = 0;
	const tokens = tokenize(text);
	if (!tokens.size) return null;

	questions.forEach((question) => {
		const qTokens = tokenize(question.text);
		let overlap = 0;
		qTokens.forEach((token) => {
			if (tokens.has(token)) overlap += 1;
		});
		const coverage = overlap / Math.max(1, qTokens.size);
		// A seller usually asks a much shorter paraphrase of the stored
		// question, so also accept strong coverage of the spoken text.
		const reverseCoverage = overlap / Math.max(1, tokens.size);
		const qualifies = coverage >= 0.16 || (overlap >= 2 && reverseCoverage >= 0.34);
		const score = qualifies ? Math.max(coverage, reverseCoverage) : 0;
		if (score > bestScore) {
			bestId = question.id;
			bestScore = score;
		}
	});

	return bestScore > 0 ? bestId : null;
}

function tokenize(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.split(/[^a-z0-9]+/i)
			.map((token) => token.trim())
			.filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
	);
}

function splitLines(text: string): ConversationTurn[] {
	const rawLines = text
		.split(/\r?\n/)
		.map((line, idx) => ({ line: idx + 1, text: line.trim() }))
		.filter((line) => line.text.length > 0);

	let foundSpeaker = false;
	let current: { line: number; speaker: string | null; chunks: string[] } | null = null;
	const turns: ConversationTurn[] = [];
	const flush = () => {
		if (!current) return;
		const turnText = current.chunks.map(cleanText).filter(Boolean).join("\n").trim();
		if (turnText) {
			turns.push({
				line: current.line,
				speaker: current.speaker,
				text: turnText,
			});
		}
		current = null;
	};

	rawLines.forEach((entry) => {
		if (isTimeOnlyLine(entry.text)) return;
		if (isSpeakerHeaderLine(entry.text)) {
			foundSpeaker = true;
			flush();
			current = {
				line: entry.line,
				speaker: cleanSpeaker(entry.text),
				chunks: [],
			};
			return;
		}
		if (!current) {
			current = {
				line: entry.line,
				speaker: null,
				chunks: [],
			};
		}
		current.chunks.push(entry.text);
	});
	flush();

	if (foundSpeaker) return turns;
	return rawLines.map((line) => ({
		line: line.line,
		speaker: null,
		text: line.text,
	}));
}

function isSpeakerHeaderLine(text: string): boolean {
	if (isTranscriptHeader(text)) return true;
	const speaker = cleanSpeaker(text);
	if (!speaker || speaker.length > 80 || isTimeOnlyLine(speaker)) return false;
	if (/[?¿!¡.,;:]/.test(speaker)) return false;
	const words = speaker.split(/\s+/).filter(Boolean);
	if (words.length < 1 || words.length > 5) return false;
	if (!/[\p{L}]/u.test(speaker)) return false;
	const letters = speaker.replace(/[^\p{L}\p{M}]/gu, "");
	if (letters.length < 2) return false;
	const isAllCaps =
		letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase();
	const isNameCase = words.every((word) => /^[\p{Lu}][\p{L}\p{M}'-]*$/u.test(word));
	return isAllCaps || isNameCase;
}

function cleanSpeaker(text: string): string {
	return text
		.trim()
		.replace(/\s+\d{1,2}:\d{2}(\s?(am|pm))?$/iu, "")
		.trim();
}

function isTimeOnlyLine(text: string): boolean {
	return /^\d{1,2}:\d{2}(\s?(am|pm))?$/iu.test(text.trim());
}

function parseJsonObject(raw: string): ModelResult | null {
	try {
		return JSON.parse(raw) as ModelResult;
	} catch {
		const start = raw.indexOf("{");
		const end = raw.lastIndexOf("}");
		if (start === -1 || end === -1 || end <= start) return null;
		try {
			return JSON.parse(raw.slice(start, end + 1)) as ModelResult;
		} catch {
			return null;
		}
	}
}

function toLabel(value: string | undefined): ConversationLineLabel {
	const label = String(value ?? "").trim().toLowerCase() as ConversationLineLabel;
	return LABELS.includes(label) ? label : "other";
}

function toCommitment(value: string | undefined): Commitment | null {
	const commitment = String(value ?? "").trim().toLowerCase() as Commitment;
	return VALID_COMMITMENTS.includes(commitment) ? commitment : null;
}

function toOutcome(value: string | undefined): Outcome | null {
	const outcome = String(value ?? "").trim().toLowerCase() as Outcome;
	return VALID_OUTCOMES.includes(outcome) ? outcome : null;
}

function toAnswerState(value: string | undefined): AnswerState | null {
	const state = String(value ?? "").trim().toLowerCase() as AnswerState;
	return VALID_ANSWER_STATES.includes(state) ? state : null;
}

function toBadDataKind(value: string | undefined): BadDataKind | null {
	const kind = String(value ?? "").trim().toLowerCase() as BadDataKind;
	return kind === "compliment" || kind === "fluff" || kind === "hypothetical" ? kind : null;
}

function clampConfidence(value: number | undefined): number {
	if (typeof value !== "number" || Number.isNaN(value)) return 0.5;
	return Math.max(0, Math.min(1, value));
}

function cleanText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function turnTextKey(value: string): string {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}
