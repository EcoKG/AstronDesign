// 줄 단위 통합 diff(문맥 3줄). 승인 화면에 보여 주는 diff 와 쓴 뒤 바이트 diff 를 같은 함수로 만든다.

const CONTEXT = 3;
const LCS_MAX = 4_000_000;

type Edit = { op: ' ' | '-' | '+'; line: string; a: number; b: number };

/** 앞뒤 공통 줄을 뺀 가운데를 LCS 로 맞춰 줄 편집 목록을 만든다. 너무 크면 가운데를 통째로 바꾼 것으로 본다. */
function lineEdits(a: string[], b: string[]): Edit[] {
	let pre = 0;
	while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
	let suf = 0;
	while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
	const am = a.slice(pre, a.length - suf);
	const bm = b.slice(pre, b.length - suf);
	const mid: Edit[] = [];
	if (am.length * bm.length <= LCS_MAX) {
		const n = am.length, m = bm.length;
		const t = new Uint32Array((n + 1) * (m + 1));
		for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i * (m + 1) + j] = am[i] === bm[j] ? t[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(t[(i + 1) * (m + 1) + j], t[i * (m + 1) + j + 1]);
		let i = 0, j = 0;
		while (i < n || j < m) {
			if (i < n && j < m && am[i] === bm[j]) mid.push({ op: ' ', line: am[i], a: pre + i++, b: pre + j++ });
			else if (i < n && (j === m || t[(i + 1) * (m + 1) + j] >= t[i * (m + 1) + j + 1])) mid.push({ op: '-', line: am[i], a: pre + i++, b: pre + j });
			else mid.push({ op: '+', line: bm[j], a: pre + i, b: pre + j++ });
		}
	} else {
		am.forEach((line, i) => mid.push({ op: '-', line, a: pre + i, b: pre }));
		bm.forEach((line, j) => mid.push({ op: '+', line, a: pre + am.length, b: pre + j }));
	}
	const head = a.slice(0, pre).map((line, i): Edit => ({ op: ' ', line, a: i, b: i }));
	const tail = a.slice(a.length - suf).map((line, k): Edit => ({ op: ' ', line, a: a.length - suf + k, b: b.length - suf + k }));
	return [...head, ...mid, ...tail];
}

/** rel 파일의 before → after 통합 diff. 같으면 빈 문자열. */
export function unifiedDiff(rel: string, before: string, after: string): string {
	if (before === after) return '';
	const edits = lineEdits(before.split('\n'), after.split('\n'));
	const changed = edits.map((e, i) => (e.op === ' ' ? -1 : i)).filter((i) => i >= 0);
	const out = [`--- a/${rel}`, `+++ b/${rel}`];
	let k = 0;
	while (k < changed.length) {
		const start = Math.max(0, changed[k] - CONTEXT);
		let end = Math.min(edits.length - 1, changed[k] + CONTEXT);
		while (k + 1 < changed.length && changed[k + 1] - CONTEXT <= end + 1) end = Math.min(edits.length - 1, changed[++k] + CONTEXT);
		k++;
		const hunk = edits.slice(start, end + 1);
		const aLen = hunk.filter((e) => e.op !== '+').length;
		const bLen = hunk.filter((e) => e.op !== '-').length;
		out.push(`@@ -${hunk[0].a + 1},${aLen} +${hunk[0].b + 1},${bLen} @@`, ...hunk.map((e) => e.op + e.line));
	}
	return out.join('\n') + '\n';
}
