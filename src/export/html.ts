// 독립 HTML 내보내기: 가장 넓은 폭의 렌더 결과에서 스크립트를 빼고 CSS·같은 출처 그림을 안에 담은 standalone.html 한 장.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectCss } from '../tools/render.ts';
import type { Exporter } from './registry.ts';

/** 페이지 안에서 스크립트·이벤트 속성·외부 시트를 빼고, 같은 출처 그림과 CSS url() 을 data URL 로 바꿔 직렬화한다. */
async function standalone(css: string): Promise<string> {
	const toData = async (u: string): Promise<string | null> => {
		try {
			const r = await fetch(u);
			if (!r.ok) return null;
			const b = await r.blob();
			return await new Promise((res) => {
				const fr = new FileReader();
				fr.onload = () => res(String(fr.result));
				fr.onerror = () => res(null);
				fr.readAsDataURL(b);
			});
		} catch {
			return null;
		}
	};
	const same = (u: string) => {
		try {
			return new URL(u, location.href).origin === location.origin;
		} catch {
			return false;
		}
	};
	for (const el of Array.from(document.querySelectorAll('script, noscript, link[rel~=stylesheet], link[rel=preload], link[rel=modulepreload], style, picture source'))) el.remove();
	for (const el of Array.from(document.querySelectorAll('*'))) for (const at of Array.from(el.attributes)) if (/^on/i.test(at.name)) el.removeAttribute(at.name);
	for (const img of Array.from(document.images)) {
		const src = img.currentSrc || img.src;
		img.removeAttribute('srcset');
		img.removeAttribute('loading');
		if (src && same(src)) {
			const d = await toData(src);
			if (d) img.setAttribute('src', d);
		}
	}
	let text = css;
	for (const u of new Set(Array.from(css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g), (m) => m[1]))) {
		if (!same(u) || u.startsWith('data:')) continue;
		const d = await toData(u);
		if (d) text = text.split(u).join(d);
	}
	const style = document.createElement('style');
	style.setAttribute('data-astrondesign-inlined', '');
	style.textContent = text;
	document.head.appendChild(style);
	return '<!doctype html>\n' + document.documentElement.outerHTML;
}

export const htmlExporter: Exporter = {
	id: 'html',
	async run(ctx) {
		const page = await ctx.open(Math.max(...ctx.widths));
		const { css } = await page.evaluate(collectCss);
		const path = join(ctx.dir, 'standalone.html');
		writeFileSync(path, await page.evaluate(standalone, css));
		return [path];
	}
};
