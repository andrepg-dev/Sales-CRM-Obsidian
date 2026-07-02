/* Small date helpers. Everything works on local time; ISO week per ISO-8601. */

export function parseISO(d: string): Date {
	const [y, m, day] = d.split("-").map(Number);
	return new Date(y, (m || 1) - 1, day || 1);
}

export function toISODate(dt: Date): string {
	const y = dt.getFullYear();
	const m = String(dt.getMonth() + 1).padStart(2, "0");
	const d = String(dt.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function todayISO(): string {
	return toISODate(new Date());
}

export function startOfDay(ts: number): number {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/** Monday 00:00 of the week containing dt. */
export function startOfISOWeek(dt: Date): Date {
	const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
	const dow = (d.getDay() + 6) % 7; // Mon = 0 … Sun = 6
	d.setDate(d.getDate() - dow);
	return d;
}

export function addDays(dt: Date, n: number): Date {
	const d = new Date(dt);
	d.setDate(d.getDate() + n);
	return d;
}

export function isoWeekInfo(dt: Date): { year: number; week: number } {
	const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
	const dayNum = (d.getUTCDay() + 6) % 7;
	d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thursday of this week
	const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
	const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
	firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
	const week =
		1 +
		Math.round(
			(d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000),
		);
	return { year: d.getUTCFullYear(), week };
}

/** Stable key like "2026-W27" for grouping. */
export function weekKey(dt: Date): string {
	const { year, week } = isoWeekInfo(dt);
	return `${year}-W${String(week).padStart(2, "0")}`;
}

export function weekLabelShort(dt: Date): string {
	return "W" + isoWeekInfo(dt).week;
}

/** "Jun 28 – Jul 4" for the week that contains dt. */
export function weekRangeLabel(dt: Date): string {
	const start = startOfISOWeek(dt);
	const end = addDays(start, 6);
	const fmt = (d: Date) =>
		d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	return `${fmt(start)} – ${fmt(end)}`;
}

/** "Jun 30" */
export function shortDate(iso: string): string {
	if (!iso) return "—";
	return parseISO(iso).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

/** "today" / "yesterday" / "3d ago" / "2w ago" / "3mo ago". */
export function relDays(ts: number | null, now: number = Date.now()): string {
	if (!ts) return "never";
	const diff = Math.round((startOfDay(now) - startOfDay(ts)) / (24 * 3600 * 1000));
	if (diff <= 0) return "today";
	if (diff === 1) return "yesterday";
	if (diff < 7) return `${diff}d ago`;
	if (diff < 35) return `${Math.floor(diff / 7)}w ago`;
	return `${Math.floor(diff / 30)}mo ago`;
}

/** Relative label for an upcoming next-step date: TODAY / TOMORROW / "Jul 4". */
export function relFuture(iso: string): string {
	if (!iso) return "";
	const diff = Math.round(
		(startOfDay(parseISO(iso).getTime()) - startOfDay(Date.now())) /
			(24 * 3600 * 1000),
	);
	if (diff === 0) return "TODAY";
	if (diff === 1) return "TOMORROW";
	if (diff === -1) return "YESTERDAY";
	if (diff < 0) return "OVERDUE";
	return shortDate(iso).toUpperCase();
}
