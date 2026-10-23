// 헤드리스 브라우저 지연 기동(대체 경로 3단계)·유휴 종료·외부 요청 차단 context·대상 URL 해석.
import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext } from 'playwright-core';
import { settings } from './config.ts';
import { ToolError } from './output.ts';
import { insideCwd, serveStatic } from './paths.ts';

export type Blocked = { url: string; type: string }[];
export type Target = { url: string; external: boolean; close: () => Promise<void> };

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
let browser: Browser | null = null;
let via = '';
let idle: NodeJS.Timeout | null = null;

/** http(s) 이고 루프백이 아닌 주소인지. */
export function isExternal(url: string): boolean {
	try {
		const u = new URL(url);
		return /^(https?|wss?):$/.test(u.protocol) && !LOOPBACK.has(u.hostname);
	} catch {
		return false;
	}
}

/** 브라우저를 처음 쓸 때 띄운다: env 경로 → playwright 기본 → msedge 순서. */
export async function getBrowser(): Promise<{ browser: Browser; via: string }> {
	if (idle) clearTimeout(idle);
	idle = null;
	if (browser?.isConnected()) return { browser, via };
	const { chromium } = await import('playwright-core');
	const exe = settings().browser;
	const tries: [string, Parameters<typeof chromium.launch>[0]][] = [];
	if (exe) tries.push([`env:${exe}`, { executablePath: exe }]);
	tries.push(['playwright-default', {}], ['channel:msedge', { channel: 'msedge' }]);
	const errors: string[] = [];
	for (const [name, opts] of tries) {
		try {
			browser = await chromium.launch({ headless: true, ...opts });
			via = name;
			return { browser, via };
		} catch (e) {
			errors.push(`${name}: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
		}
	}
	throw new ToolError('E_BROWSER_UNAVAILABLE', errors.join(' | '));
}

/** 마지막 호출 뒤 ASTRONDESIGN_IDLE_MS 가 지나면 브라우저를 닫도록 예약한다. */
export function scheduleIdle(): void {
	if (idle) clearTimeout(idle);
	idle = setTimeout(() => void closeBrowser(), settings().idleMs);
	idle.unref();
}

/** 브라우저를 닫는다(유휴·stdin 종료·SIGTERM). */
export async function closeBrowser(): Promise<void> {
	if (idle) clearTimeout(idle);
	idle = null;
	const b = browser;
	browser = null;
	if (b) await b.close().catch(() => {});
}

/** 폭·높이 context 를 만들고, 허용되지 않은 외부 요청·웹소켓을 막아 blocked 에 기록한다. */
export async function newContext(b: Browser, width: number, height: number, allowNetwork: boolean, blocked: Blocked): Promise<BrowserContext> {
	const ctx = await b.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600, deviceScaleFactor: 1, serviceWorkers: 'block' });
	await ctx.route('**/*', (route) => {
		const req = route.request();
		if (!allowNetwork && isExternal(req.url())) {
			blocked.push({ url: req.url(), type: req.resourceType() });
			return route.abort('blockedbyclient');
		}
		return route.continue();
	});
	await ctx.routeWebSocket(/.*/, (ws) => {
		if (!allowNetwork && isExternal(ws.url())) {
			blocked.push({ url: ws.url(), type: 'websocket' });
			return ws.close();
		}
		ws.connectToServer();
	});
	return ctx;
}

/** 대상(http(s) URL 또는 cwd 안 html)을 브라우저가 열 URL 로 바꾼다. 파일은 127.0.0.1 임시 서버로 제공. */
export async function resolveTarget(target: string, allowNetworkArg: boolean | undefined, cwd = process.cwd()): Promise<Target & { allowNetwork: boolean }> {
	const allowNetwork = settings().network && allowNetworkArg === true;
	if (/^https?:\/\//i.test(target)) {
		const external = isExternal(target);
		if (external && !allowNetwork) throw new ToolError('E_NETWORK_DISABLED', `외부 대상은 등록 env ASTRONDESIGN_NETWORK=allow 와 인자 allow_network:true 가 모두 있어야 합니다: ${target}`);
		return { url: target, external, allowNetwork, close: async () => {} };
	}
	let file = insideCwd(target, cwd);
	if (statSync(file).isDirectory()) file = insideCwd(join(target, 'index.html'), cwd);
	const srv = await serveStatic(cwd, file);
	return { url: srv.url, external: false, allowNetwork, close: srv.close };
}
