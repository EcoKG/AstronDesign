// 편집기 세션: 대상 해석, 세션 키(sha256(target) 앞 12자), 작업·승인 리스너 수명, 최근 3개 유지, 유휴 종료.
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isExternal } from '../browser.ts';
import { settings } from '../config.ts';
import { ToolError, outRoot } from '../output.ts';
import { insideCwd } from '../paths.ts';
import type { Surface } from '../precedence.ts';
import { serial } from '../queue.ts';
import { renderTarget } from '../tools/render.ts';
import type { Listener } from './listen.ts';
import { loadChanges, writeJson } from './store.ts';
import { startApproveServer } from './approve-server.ts';
import { startWorkServer } from './work-server.ts';

export const MAX_SESSIONS = 3;
export const DEFAULT_WIDTHS = [1440, 768, 390];

/** 승인 nonce 기록: 묶음 해시, 계획 때 파일 해시, 만료 시각, 사용 여부. */
export type NonceRecord = { hash: string; files: Record<string, string>; expires: number; used: boolean };

/** 편집 대상: cwd 안 html 파일 또는 루프백 http 서버. */
export type EditorTarget = { norm: string; file: string | null; rel: string | null; upstream: string | null; targetPath: string };

export type Session = EditorTarget & {
	key: string; target: string; surface: Surface; widths: number[]; cwd: string; dir: string;
	tokA: string; work: Listener; workOrigin: string; workUrl: string;
	allowWrite: boolean; writeEnabled: boolean; approve: Listener | null; approveOrigin: string | null; approveUrl: string | null; tokBHash: string | null;
	blocked: number; warnings: string[]; lastApplied: { stamp: string; line: string } | null;
	nonces: Map<string, NonceRecord>; now: () => number; render: () => Promise<string>; idle: NodeJS.Timeout | null;
};

const sessions = new Map<string, Session>();
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** 대상 글을 편집 대상으로 푼다. 외부 URL 은 E_NETWORK_DISABLED, http 밖 스킴은 E_INPUT. */
export function resolveEditorTarget(target: string, cwd = process.cwd()): EditorTarget {
	if (/^https?:\/\//i.test(target)) {
		if (isExternal(target)) throw new ToolError('E_NETWORK_DISABLED', `편집기는 외부 대상을 열지 않습니다(루프백 서버나 cwd 안 html 만): ${target}`);
		const u = new URL(target);
		return { norm: u.href, file: null, rel: null, upstream: u.origin, targetPath: u.pathname + u.search };
	}
	if (/^[a-z][a-z0-9+.-]+:\/\//i.test(target)) throw new ToolError('E_INPUT', `편집기 대상은 cwd 안 html 또는 루프백 http 주소여야 합니다: ${target}`);
	let file = insideCwd(target, cwd);
	if (statSync(file).isDirectory()) file = insideCwd(join(target, 'index.html'), cwd);
	const rel = relative(cwd, file).split(sep).join('/');
	return { norm: rel, file, rel, upstream: null, targetPath: '/' + rel.split('/').map(encodeURIComponent).join('/') };
}

/** 같은 대상이면 같은 세션 키. */
export function sessionKey(target: string, cwd = process.cwd()): string {
	return sha256(resolveEditorTarget(target, cwd).norm).slice(0, 12);
}

/** 세션 폴더 `OUT/editor/<key>/`. */
export function editorDir(target: string, cwd = process.cwd()): string {
	return join(outRoot(cwd), 'editor', sessionKey(target, cwd));
}

/** 열린 세션. */
export function findSession(key: string): Session | undefined {
	return sessions.get(key);
}

/** session.json 을 쓴다. 승인 토큰은 해시로만 남긴다. */
function saveMeta(s: Session): void {
	writeJson(join(s.dir, 'session.json'), { version: 1, key: s.key, target: s.norm, surface: s.surface, widths: s.widths, writeEnabled: s.writeEnabled, approveTokenSha256: s.tokBHash, updated: new Date().toISOString() });
}

/** 쓰기 키 둘(env·인자)이 모두 있을 때만 승인 리스너를 열고, 아니면 닫는다. */
async function syncApprove(s: Session, allowWrite: boolean): Promise<void> {
	s.allowWrite = allowWrite;
	s.writeEnabled = settings().write && allowWrite;
	if (s.writeEnabled && !s.approve) {
		const tok = randomBytes(32).toString('hex');
		s.tokBHash = sha256(tok);
		s.approve = await startApproveServer(s);
		s.approveOrigin = s.approve.origin;
		s.approveUrl = `${s.approve.origin}/#${tok}`;
	} else if (!s.writeEnabled && s.approve) {
		await s.approve.close();
		Object.assign(s, { approve: null, approveOrigin: null, approveUrl: null, tokBHash: null });
		s.nonces.clear();
	}
}

/** 유휴 시간이 지나면 세션을 닫도록 다시 예약한다. */
function touch(s: Session): void {
	if (s.idle) clearTimeout(s.idle);
	s.idle = setTimeout(() => void closeSession(s.key), settings().editorIdleMs);
	s.idle.unref();
}

/** 세션을 열거나 같은 대상의 세션을 다시 쓴다. 넷째 세션을 열면 가장 오래 안 쓴 세션을 닫는다. */
export async function openSession(a: { target: string; surface: Surface; widths?: number[]; allowWrite?: boolean; cwd?: string }): Promise<Session> {
	const cwd = a.cwd ?? process.cwd();
	const t = resolveEditorTarget(a.target, cwd);
	const key = sha256(t.norm).slice(0, 12);
	let s = sessions.get(key);
	if (s) {
		sessions.delete(key);
		s.surface = a.surface;
		if (a.widths) s.widths = a.widths;
		s.warnings = [];
	} else {
		const dir = join(outRoot(cwd), 'editor', key);
		mkdirSync(dir, { recursive: true });
		const fresh: Omit<Session, 'work' | 'workOrigin' | 'workUrl' | 'render'> = {
			...t, key, target: a.target, surface: a.surface, widths: a.widths ?? DEFAULT_WIDTHS, cwd, dir, tokA: randomBytes(16).toString('hex'),
			allowWrite: false, writeEnabled: false, approve: null, approveOrigin: null, approveUrl: null, tokBHash: null,
			blocked: 0, warnings: [], lastApplied: null, nonces: new Map(), now: Date.now, idle: null
		};
		s = fresh as Session;
		const self = s;
		s.render = async () => {
			const r = await serial(() => renderTarget({ target: self.upstream ? self.norm : self.rel!, surface: self.surface, widths: self.widths, inline_image: false }));
			return r.content.find((c) => c.type === 'text')?.text ?? '';
		};
		s.work = await startWorkServer(s);
		s.workOrigin = s.work.origin;
		s.workUrl = `${s.work.origin}/__astron/${s.tokA}/`;
	}
	const warning = loadChanges(s.dir).warning;
	if (warning) s.warnings.push(warning);
	sessions.set(key, s);
	await syncApprove(s, a.allowWrite === true);
	saveMeta(s);
	touch(s);
	for (const old of [...sessions.keys()].slice(0, Math.max(0, sessions.size - MAX_SESSIONS))) await closeSession(old);
	return s;
}

/** 세션 하나의 리스너를 닫고 목록에서 뺀다. 폴더는 남긴다. */
export async function closeSession(key: string): Promise<void> {
	const s = sessions.get(key);
	if (!s) return;
	sessions.delete(key);
	if (s.idle) clearTimeout(s.idle);
	await s.work.close();
	await s.approve?.close();
}

/** 모든 편집기 세션을 닫는다(서버 종료·시험 정리). */
export async function closeEditors(): Promise<void> {
	for (const key of [...sessions.keys()]) await closeSession(key);
}
