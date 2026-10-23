// 시험용 임시 프로젝트(.astron-logs/test-proj-<hex6>) 생성·정리와 stdio MCP 시험 클라이언트.
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const FIXTURES = join(ROOT, 'test', 'fixtures');
const made: string[] = [];

/** 저장소 안에 임시 프로젝트를 만들고 fixtures 하위 폴더를 복사한다. */
export function makeProj(...fixtureDirs: string[]): string {
	const d = join(ROOT, '.astron-logs', `test-proj-${randomBytes(3).toString('hex')}`);
	mkdirSync(d, { recursive: true });
	for (const f of fixtureDirs) cpSync(join(FIXTURES, f), join(d, f), { recursive: true });
	made.push(d);
	return d;
}

export type Rpc = { jsonrpc: '2.0'; id?: number; result?: any; error?: { code: number; message: string } };
export type Client = {
	request: (method: string, params?: unknown, timeoutMs?: number) => Promise<Rpc>;
	call: (name: string, args: unknown, timeoutMs?: number) => Promise<{ isError?: boolean; content: { type: string; text?: string; data?: string; mimeType?: string }[] }>;
	lines: string[];
	stderr: string[];
	pid: number;
	init?: Rpc;
	close: () => Promise<void>;
};
const clients: Client[] = [];

/** 서버를 cwd 에서 띄우고 initialize 까지 마친 시험 클라이언트를 돌려준다. */
export async function startServer(cwd: string, env: Record<string, string> = {}): Promise<Client> {
	const child = spawn(process.execPath, [join(ROOT, 'src', 'server.ts')], { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
	const lines: string[] = [];
	const stderr: string[] = [];
	const waiting = new Map<number, (r: Rpc) => void>();
	let buf = '';
	let nextId = 1;
	child.stdout.setEncoding('utf8');
	child.stdout.on('data', (d: string) => {
		buf += d;
		let i;
		while ((i = buf.indexOf('\n')) >= 0) {
			const line = buf.slice(0, i).replace(/\r$/, '');
			buf = buf.slice(i + 1);
			if (!line) continue;
			lines.push(line);
			try {
				const msg = JSON.parse(line) as Rpc;
				if (msg.id !== undefined) waiting.get(msg.id)?.(msg);
			} catch {}
		}
	});
	child.stderr.setEncoding('utf8');
	child.stderr.on('data', (d: string) => stderr.push(d));
	let dead = false;
	const failAll = new Set<(e: Error) => void>();
	const exited = new Promise<void>((r) => child.on('exit', (code) => {
		dead = true;
		for (const f of failAll) f(new Error(`server exited ${code}: ${stderr.join('').slice(0, 500)}`));
		r();
	}));
	const request = (method: string, params: unknown = {}, timeoutMs = 30000) => new Promise<Rpc>((resolve, reject) => {
		if (dead) return reject(new Error('server not running'));
		const id = nextId++;
		const onExit = (e: Error) => { clearTimeout(t); reject(e); };
		const t = setTimeout(() => { failAll.delete(onExit); reject(new Error(`timeout ${method}`)); }, timeoutMs);
		failAll.add(onExit);
		waiting.set(id, (r) => { clearTimeout(t); failAll.delete(onExit); resolve(r); });
		child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
	});
	const client: Client = {
		request,
		call: async (name, args, timeoutMs = 120000) => (await request('tools/call', { name, arguments: args }, timeoutMs)).result,
		lines,
		stderr,
		pid: child.pid ?? 0,
		close: async () => {
			if (dead) return;
			child.stdin.end();
			const t = setTimeout(() => child.kill(), 5000);
			await exited;
			clearTimeout(t);
		}
	};
	clients.push(client);
	const init = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'astrondesign-test', version: '0' } });
	if (init.error) throw new Error('initialize 실패: ' + JSON.stringify(init.error));
	child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
	client.init = init;
	return client;
}

/** 첫 text 블록을 돌려준다. */
export const textOf = (r: { content: { type: string; text?: string }[] }) => r.content.find((c) => c.type === 'text')?.text ?? '';

/** 이 시험 파일이 띄운 서버를 닫고 만든 임시 프로젝트만 지운다. */
export async function cleanup(): Promise<void> {
	for (const c of clients.splice(0)) await c.close();
	for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
