// 환경 변수 해석, 하위 프로세스용 격리 env 생성과 실행.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolError } from './output.ts';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const VENDOR = join(ROOT, 'vendor');
export const IMPECCABLE_BIN = join(ROOT, 'node_modules', '@impeccable', 'cli-windows-x64', 'bin', 'impeccable.exe');
export const TASTE_SCRIPTS = join(VENDOR, 'taste-skill', 'scripts');
export const UUPM_SEARCH = join(VENDOR, 'ui-ux-pro-max', 'scripts', 'search.py');
export const SUB_TIMEOUT_MS = 20000;

const PASS_THROUGH = ['SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'COMSPEC', 'TEMP', 'TMP'];
const BLACKHOLE = 'http://127.0.0.1:9';

/** 호출 시점의 등록 env 를 읽는다. */
export function settings() {
	const idle = Number(process.env.ASTRONDESIGN_IDLE_MS);
	return {
		network: process.env.ASTRONDESIGN_NETWORK === 'allow',
		python: process.env.ASTRONDESIGN_PYTHON || 'python',
		browser: process.env.ASTRONDESIGN_BROWSER || undefined,
		idleMs: Number.isFinite(idle) && idle > 0 ? idle : 120000
	};
}

/** 허용 목록·홈 격리·텔레메트리 끄기·프록시 블랙홀만 담은 하위 프로세스 env 를 만든다. */
export function subEnv(out: string, extra: Record<string, string> = {}): Record<string, string> {
	const env: Record<string, string> = {};
	for (const k of PASS_THROUGH) {
		const v = process.env[k];
		if (v !== undefined) env[k] = v;
	}
	const home = join(out, '.home');
	mkdirSync(home, { recursive: true });
	for (const k of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) env[k] = home;
	Object.assign(env, {
		DO_NOT_TRACK: '1',
		IMPECCABLE_NO_TELEMETRY: '1',
		IMPECCABLE_NO_UPDATE_CHECK: '1',
		IMPECCABLE_BIN,
		HTTP_PROXY: BLACKHOLE,
		HTTPS_PROXY: BLACKHOLE,
		ALL_PROXY: BLACKHOLE,
		NO_PROXY: '127.0.0.1,localhost'
	}, extra);
	return env;
}

export type SubResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean; spawnError?: string };

/** 시간 초과는 E_TIMEOUT, 실행 실패는 E_ENGINE 으로 던진다. */
export function assertRan(r: SubResult, label: string, spawnMessage?: string): void {
	if (r.timedOut) throw new ToolError('E_TIMEOUT', `${label} 이(가) ${SUB_TIMEOUT_MS / 1000}초를 넘겨 종료했습니다`);
	if (r.spawnError) throw new ToolError('E_ENGINE', spawnMessage ?? `${label} 실행 실패: ${r.spawnError}`);
}

/** 그 밖의 종료코드를 E_ENGINE(종료코드·stderr 앞 500자)으로 던진다. */
export function engineError(r: SubResult, label: string): ToolError {
	return new ToolError('E_ENGINE', `${label} 종료코드 ${r.code}: ${r.stderr.trim().slice(0, 500)}`);
}

/** 하위 프로세스를 실행하고, 제한 시간을 넘기면 프로세스 트리를 끝낸다. */
export function runSub(cmd: string, args: string[], opts: { cwd: string; env: Record<string, string>; timeoutMs?: number }): Promise<SubResult> {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
			else child.kill('SIGKILL');
		}, opts.timeoutMs ?? SUB_TIMEOUT_MS);
		child.stdout.on('data', (d: Buffer) => out.push(d));
		child.stderr.on('data', (d: Buffer) => err.push(d));
		child.on('error', (e: NodeJS.ErrnoException) => {
			clearTimeout(timer);
			resolve({ code: null, stdout: '', stderr: '', timedOut: false, spawnError: e.code ?? e.message });
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), timedOut });
		});
	});
}
