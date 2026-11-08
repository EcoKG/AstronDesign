// 원본 반영 계획(diff)과 사람 승인 뒤 쓰기: 쓰기 키 확인, 1회용 nonce(5분·묶음 해시), 파일 해시 재확인, 백업, 원자 교체, applied.json.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, isAbsolute, join } from 'node:path';
import { settings } from '../config.ts';
import { ToolError } from '../output.ts';
import type { Op } from '../shared/ops.js';
import { unifiedDiff } from './diff.ts';
import type { Session } from './session.ts';
import { appendEvents, loadChanges, pendingOps, writeJson } from './store.ts';
import { writerFor } from './writers/registry.ts';

export const NONCE_TTL_MS = 5 * 60 * 1000;

export type PlanFile = { rel: string; abs: string; hash: string; before: string; after: string };
export type Plan = { files: PlanFile[]; diff: string; applied: Op[]; skipped: { op: Op; reason: string }[]; lines: Record<string, number>; bundleHash: string };
export type ApplyResult = { stamp: string; files: string[]; backup: string; opIds: string[] };

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

/** 원본 쓰기 금지 경로(cwd 밖·절대 경로·점 파일·점 폴더·node_modules)면 E_PATH. */
export function checkWritePath(rel: string): void {
	const norm = rel.replace(/\\/g, '/');
	const parts = norm.split('/');
	if (!norm || isAbsolute(rel) || norm.startsWith('/') || /^[a-z]:/i.test(norm) || parts.some((p) => p === '..' || p.startsWith('.') || p === 'node_modules')) {
		throw new ToolError('E_PATH', `쓸 수 없는 경로: ${rel}`);
	}
}

/** 연산을 기록기로 계획한다(파일은 쓰지 않음). 원본 파일을 모르거나 기록기가 없으면 모두 넘겨주기 전용. */
export function computePlan(t: { file: string | null; rel: string | null }, ops: Op[]): Plan {
	const empty = (reason: string): Plan => ({ files: [], diff: '', applied: [], skipped: ops.map((op) => ({ op, reason })), lines: {}, bundleHash: sha('[]') });
	if (!t.file || !t.rel) return empty('원본 파일을 모르는 대상(루프백 서버): 넘겨주기 전용');
	const writer = writerFor(t.file);
	if (!writer) return empty('등록된 기록기 없음: 넘겨주기 전용');
	const before = readFileSync(t.file, 'utf8');
	const p = writer.plan(before, ops);
	const files = p.text === before ? [] : [{ rel: t.rel, abs: t.file, hash: sha(before), before, after: p.text }];
	return {
		files, diff: files.map((f) => unifiedDiff(f.rel, f.before, f.after)).join(''), applied: p.applied, skipped: p.skipped, lines: p.lines,
		bundleHash: sha(JSON.stringify(files.map((f) => [f.rel, f.hash, sha(f.after)])))
	};
}

/** 등록 env 와 design_edit 인자가 모두 쓰기를 허용하는지. */
const writeAllowed = (s: Session) => s.writeEnabled && s.allowWrite && settings().write;

/** 지금 유효 연산의 원본 반영 계획과 1회용 nonce 를 만든다. */
export function planApply(s: Session): Plan & { nonce: string } {
	if (!writeAllowed(s)) throw new ToolError('E_WRITE_DISABLED', '원본 쓰기에는 env ASTRONDESIGN_WRITE=allow 와 design_edit 인자 allow_write:true 가 모두 필요합니다');
	if (s.rel) checkWritePath(s.rel);
	const plan = computePlan(s, pendingOps(loadChanges(s.dir).events));
	const now = s.now();
	for (const [k, v] of s.nonces) if (v.used || v.expires < now) s.nonces.delete(k);
	const nonce = randomBytes(16).toString('hex');
	s.nonces.set(nonce, { hash: plan.bundleHash, files: Object.fromEntries(plan.files.map((f) => [f.rel, f.hash])), expires: now + NONCE_TTL_MS, used: false });
	return { ...plan, nonce };
}

/** 같은 폴더 임시 파일에 쓰고 이름을 바꾼다. Windows 잠금(EPERM·EBUSY·EACCES)은 3번 다시 시도한 뒤 E_CONFLICT. */
function atomicWrite(file: string, text: string): void {
	const tmp = join(dirname(file), `.${randomBytes(4).toString('hex')}.astron-tmp`);
	writeFileSync(tmp, text);
	for (let i = 0; ; i++) {
		try {
			return renameSync(tmp, file);
		} catch (e) {
			const code = (e as NodeJS.ErrnoException).code ?? '';
			if (i < 3 && ['EPERM', 'EBUSY', 'EACCES'].includes(code)) continue;
			if (existsSync(tmp)) unlinkSync(tmp);
			throw new ToolError('E_CONFLICT', `원본 교체 실패(${code}): ${file}`);
		}
	}
}

/** 사람이 승인한 nonce 로 원본을 쓴다. 쓰는 바이트는 그 nonce 의 계획과 같아야 하고, 계획 뒤 파일이 바뀌었으면 쓰지 않는다. */
export function approveApply(s: Session, nonce: string, meta: { userAgent: string }): ApplyResult {
	if (!writeAllowed(s)) throw new ToolError('E_WRITE_DISABLED', '원본 쓰기가 꺼져 있습니다');
	const rec = s.nonces.get(nonce);
	if (!rec || rec.used || s.now() > rec.expires) throw new ToolError('E_CONFLICT', '승인 nonce 가 없거나 이미 쓰였거나 만료됐습니다: 승인 화면을 새로 고치십시오');
	rec.used = true;
	const plan = computePlan(s, pendingOps(loadChanges(s.dir).events));
	for (const [rel, hash] of Object.entries(rec.files)) {
		checkWritePath(rel);
		if (sha(readFileSync(join(s.cwd, rel))) !== hash) throw new ToolError('E_CONFLICT', `계획 뒤 원본이 바뀌었습니다: ${rel}`);
	}
	if (plan.bundleHash !== rec.hash) throw new ToolError('E_CONFLICT', '계획 뒤 편집이 바뀌었습니다: 승인 화면을 새로 고치십시오');
	if (!plan.files.length) throw new ToolError('E_INPUT', '원본에 쓸 편집이 없습니다');
	const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(2).toString('hex');
	const backup = join(s.dir, 'applied', stamp);
	for (const f of plan.files) {
		mkdirSync(dirname(join(backup, f.rel)), { recursive: true });
		copyFileSync(f.abs, join(backup, f.rel));
		atomicWrite(f.abs, f.after);
	}
	const logFile = join(s.dir, 'applied.json');
	const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : [];
	log.push({
		stamp, at: new Date().toISOString(), userAgent: meta.userAgent.slice(0, 300), bundleHash: plan.bundleHash,
		files: plan.files.map((f) => ({ rel: f.rel, before: f.hash, after: sha(f.after) })),
		ops: plan.applied.map((o) => ({ id: o.id, kind: o.kind, selector: o.selector, prop: o.prop, after: o.after }))
	});
	writeJson(logFile, log);
	const opIds = plan.applied.map((o) => o.id);
	appendEvents(s.dir, [{ type: 'applied', ids: opIds, stamp }], true);
	s.lastApplied = { stamp, line: '' };
	return { stamp, files: plan.files.map((f) => f.rel), backup, opIds };
}
