// PNG 내보내기: 폭(아트보드)마다 전체 페이지 PNG 한 장.
import { join } from 'node:path';
import type { Exporter } from './registry.ts';

export const pngExporter: Exporter = {
	id: 'png',
	async run(ctx) {
		const out: string[] = [];
		for (const w of ctx.widths) {
			const page = await ctx.open(w);
			const path = join(ctx.dir, `artboard-${w}.png`);
			await page.screenshot({ path, type: 'png', fullPage: true });
			out.push(path);
		}
		return out;
	}
};
