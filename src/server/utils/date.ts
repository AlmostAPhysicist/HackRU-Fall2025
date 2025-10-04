export function differenceInDays(date: Date, from: Date): number {
	const msPerDay = 1000 * 60 * 60 * 24;
	const utcDate = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
	const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
	return Math.round((utcDate - utcFrom) / msPerDay);
}
