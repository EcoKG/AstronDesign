// 편집기 세션 폴더의 편집 기록(changes.json, 덧붙이기만)과 댓글(comments.json) 읽기·쓰기·검사.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { ToolError } from '../output.ts';
import { INTENTS, type Intent } from '../intents.ts';
import { MAX_OPS, OpError, validateOp, type Op } from '../shared/ops.js';

export type ChangeEvent = { type: 'do'; op: Op } | { type: 'undo'; id: string } | { type: 'applied'; ids: string[]; stamp: string };
export type StoredEvent = ChangeEvent & { seq: number; at: string };
export type Comment = {
	id: string; selector: string; path: number[]; tag: string; point: { x: number; y: number } | null; width: number;
	intent: Intent; note: string; send: boolean; status: 'open' | 'sent' | 'resolved'; replies: { at: string; text: string }[];
	bundle: Record<string, unknown> | null;
};

export const MAX_EVENTS = 5000;
export const MAX_COMMENTS = 200;
export const NOTE_MAX = 2000;
const REPLY_MAX = 50;
const BUNDLE_MAX = 20000;
const STATUS = new Set(['open', 'sent', 'resolved']);

/** 같은 폴더 임시 파일에 쓰고 이름을 바꿔 JSON 을 원자적으로 쓴다. */
export function writeJson(file: string, data: unknown): void {
	const tmp = `${file}.${randomBytes(3).toString('hex')}.tmp`;
	writeFileSync(tmp, JSON.stringify(data, null, '\t'));
	renameSync(tmp, file);
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const input = (message: string) => new ToolError('E_INPUT', message);

/** changes.json 을 읽는다. 손상됐으면 백업 이름으로 옮기고 빈 기록과 경고를 돌려준다. */
export function loadChanges(dir: string): { events: StoredEvent[]; warning: string | null } {
	const file = join(dir, 'changes.json');
	if (!existsSync(file)) return { events: [], warning: null };
	try {
		const data = JSON.parse(readFileSync(file, 'utf8'));
		if (data?.version !== 1 || !Array.isArray(data.events)) throw new Error('형식');
		return { events: data.events as StoredEvent[], warning: null };
	} catch {
		const backup = join(dir, `changes.broken-${stamp()}.json`);
		renameSync(file, backup);
		return { events: [], warning: `손상된 changes.json 을 ${backup} 로 옮기고 빈 상태로 열었습니다` };
	}
}

/** 편집기가 보낸 사건 하나를 검사한다. 편집기는 do·undo 만 보낼 수 있다(applied 는 승인 쓰기만 남김). */
function checkEvent(e: any, allowApplied: boolean): ChangeEvent {
	try {
		if (e?.type === 'do') return { type: 'do', op: validateOp(e.op) };
		if (e?.type === 'undo' && typeof e.id === 'string' && e.id.length <= 64) return { type: 'undo', id: e.id };
		if (allowApplied && e?.type === 'applied') return { type: 'applied', ids: e.ids, stamp: e.stamp };
	} catch (err) {
		if (err instanceof OpError) throw input(err.message);
		throw err;
	}
	throw input('사건은 do(op) 또는 undo(id) 여야 합니다');
}

/** 사건을 changes.json 끝에 덧붙이고 전체 기록을 돌려준다. */
export function appendEvents(dir: string, raw: unknown, allowApplied = false): StoredEvent[] {
	if (!Array.isArray(raw) || raw.length > MAX_OPS) throw input(`사건은 ${MAX_OPS}개 이하 배열이어야 합니다`);
	const checked = raw.map((e) => checkEvent(e, allowApplied));
	const { events } = loadChanges(dir);
	if (events.length + checked.length > MAX_EVENTS) throw input(`편집 기록이 ${MAX_EVENTS}건을 넘습니다`);
	let seq = events.at(-1)?.seq ?? 0;
	const at = new Date().toISOString();
	const next = [...events, ...checked.map((e) => ({ ...e, seq: ++seq, at }))];
	writeJson(join(dir, 'changes.json'), { version: 1, events: next });
	return next;
}

/** 아직 원본에 쓰지 않은 유효 연산(되돌린 것·적용한 것 제외, 기록 순서). */
export function pendingOps(events: StoredEvent[]): Op[] {
	let list: Op[] = [];
	for (const e of events) {
		if (e.type === 'do') list = [...list.filter((o) => o.id !== e.op.id), e.op];
		else if (e.type === 'undo') list = list.filter((o) => o.id !== e.id);
		else list = list.filter((o) => !e.ids.includes(o.id));
	}
	return list;
}

/** 댓글 하나를 검사하고 알려진 칸만 남긴다. */
function checkComment(c: any): Comment {
	const s = (v: unknown, max: number, name: string) => {
		if (typeof v !== 'string' || v.length > max) throw input(`댓글 ${name}: ${max}자 이하 문자열이어야 합니다`);
		return v;
	};
	if (!c || typeof c !== 'object') throw input('댓글은 객체여야 합니다');
	if (!Object.hasOwn(INTENTS, c.intent)) throw input(`모르는 의도: ${String(c.intent).slice(0, 20)}`);
	if (!STATUS.has(c.status)) throw input('status 는 open·sent·resolved 중 하나');
	if (!Array.isArray(c.path) || c.path.length > 64 || !c.path.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0)) throw input('댓글 path 형식 오류');
	if (!Array.isArray(c.replies) || c.replies.length > REPLY_MAX) throw input(`답글은 ${REPLY_MAX}개 이하`);
	const point = c.point && Number.isFinite(c.point.x) && Number.isFinite(c.point.y) ? { x: Number(c.point.x), y: Number(c.point.y) } : null;
	const bundle = c.bundle && typeof c.bundle === 'object' ? c.bundle : null;
	if (bundle && JSON.stringify(bundle).length > BUNDLE_MAX) throw input('댓글 요소 묶음이 너무 큽니다');
	return {
		id: s(c.id, 64, 'id'), selector: s(c.selector, 700, 'selector'), path: [...c.path], tag: s(c.tag, 40, 'tag'), point,
		width: Number.isInteger(c.width) ? c.width : 0, intent: c.intent, note: s(c.note, NOTE_MAX, 'note'), send: c.send === true, status: c.status,
		replies: c.replies.map((r: any) => ({ at: s(r?.at, 40, 'reply.at'), text: s(r?.text, NOTE_MAX, 'reply.text') })), bundle
	};
}

/** comments.json 을 읽는다. 없거나 손상됐으면 빈 목록. */
export function loadComments(dir: string): Comment[] {
	try {
		const data = JSON.parse(readFileSync(join(dir, 'comments.json'), 'utf8'));
		return Array.isArray(data?.items) ? data.items : [];
	} catch {
		return [];
	}
}

/** 댓글 목록 전체를 검사해 저장한다(최대 MAX_COMMENTS 개). */
export function saveComments(dir: string, items: unknown): Comment[] {
	if (!Array.isArray(items) || items.length > MAX_COMMENTS) throw input(`댓글은 ${MAX_COMMENTS}개 이하 배열이어야 합니다`);
	const list = items.map(checkComment);
	writeJson(join(dir, 'comments.json'), { version: 1, items: list });
	return list;
}
