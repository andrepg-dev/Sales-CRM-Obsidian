import { BadDataKind, Commitment, Outcome } from "../types";

/*
 * Lightweight heuristic detection over the "facts learned" text of a
 * conversation. The Mom Test says compliments / fluff / hypotheticals are not
 * data — so we surface them automatically, and we guess the strongest
 * commitment. Everything detected is a *suggestion* the user can override.
 *
 * Patterns cover English and Spanish since the CRM mixes both.
 */

export interface Detection {
	commitment: Commitment;
	bad: Partial<Record<BadDataKind, string>>;
	outcome: Outcome;
}

const BAD_PATTERNS: Record<BadDataKind, RegExp[]> = {
	compliment: [
		/\b(love|loved|loves|great|awesome|amazing|cool|nice|fantastic|excellent|brilliant|perfect|wonderful|impressive|genius)\b/i,
		/\bsounds?\s+(good|great|amazing|awesome|interesting)\b/i,
		/\blooks?\s+(great|amazing|good)\b/i,
		/(me\s+encanta|encanta|buen[íi]simo|geniale?|excelente|incre[íi]ble|me\s+gusta\s+mucho|qu[ée]\s+bueno|fant[áa]stico)/i,
	],
	hypothetical: [
		/\b(would|could|might|i'?d|someday|eventually)\b/i,
		/\bif\s+(i|we|you|they)\b/i,
		/\bin\s+the\s+future\b/i,
		/(en\s+el\s+futuro|alg[úu]n\s+d[íi]a|tal\s+vez|quiz[áa]s?|si\s+yo|si\s+tuviera|har[íi]a|comprar[íi]a)/i,
	],
	fluff: [
		/\b(always|usually|normally|generally|typically|never|often)\b/i,
		/\bi\s+(will|plan\s+to|want\s+to|would\s+like)\b/i,
		/(siempre|normalmente|generalmente|nunca|a\s+veces|en\s+general|voy\s+a|planeo|quisiera)/i,
	],
};

/** Commitment keywords, checked strongest-first (money > reputation > time). */
const COMMIT_PATTERNS: [Commitment, RegExp[]][] = [
	[
		"money",
		[
			/\b(pay|paid|pays|paying|deposit|prepay|buy|bought|buying|purchase|purchased|subscribe|subscribed|invoice|upfront)\b/i,
			/\$\s?\d|\d+\s?(usd|hnl|lps|dollars?)/i,
			/(pag[óo]|pagar[áa]?|dep[óo]sito|comprar|compr[óo]|adelanto|factura|suscrib|anticipo)/i,
		],
	],
	[
		"reputation",
		[
			/\b(intro|introduce|introduced|introduction|referral|refer|referred|recommend|recommended|vouch)\b/i,
			/(refiri[óo]|referid|recomend|present[óo]\s+a|me\s+contact[óo]\s+con)/i,
		],
	],
	[
		"time",
		[
			/\b(demo|meeting|booked|book|schedule|scheduled|appointment|call\s+back|next\s+call|trial|onboard|onboarding)\b/i,
			/(demo|reuni[óo]n|cita|agend[óo]|prueba|siguiente\s+llamada|onboarding|qued[óo]\s+en)/i,
		],
	],
];

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
	for (const re of patterns) {
		const m = re.exec(text);
		if (m) return m[0].trim();
	}
	return undefined;
}

export function detect(text: string): Detection {
	const bad: Partial<Record<BadDataKind, string>> = {};
	(Object.keys(BAD_PATTERNS) as BadDataKind[]).forEach((kind) => {
		const hit = firstMatch(text, BAD_PATTERNS[kind]);
		if (hit) bad[kind] = hit;
	});

	let commitment: Commitment = "none";
	for (const [kind, patterns] of COMMIT_PATTERNS) {
		if (firstMatch(text, patterns)) {
			commitment = kind;
			break;
		}
	}

	// A compliment with nothing concrete behind it is a stall signal.
	const outcome: Outcome =
		commitment !== "none"
			? "advancing"
			: bad.compliment
				? "stalled"
				: "advancing";

	return { commitment, bad, outcome };
}
