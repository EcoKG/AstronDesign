// design_direction: taste draw 로 공개 페이지(persuade)의 아트 디렉션을 뽑음.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import { TASTE_SCRIPTS, assertRan, engineError, runSub, subEnv } from '../config.ts';
import { ToolError, defineTool, ok, outRoot } from '../output.ts';

const ASSET_RULE = '자산: assets.mjs 는 제공하지 않음. 실제로 있는 자산(have)만 쓰고, 없으면 자리표시 면에 캡션 "실제 사진 필요". 외부 이미지 URL(picsum 등)은 기본 렌더에서 차단됨';

export const directionTool = defineTool({
	name: 'design_direction',
	description: 'Deal an art direction for a public landing or marketing page (taste-skill draw). Not for dashboards or app screens.',
	inputSchema: z.object({
		list: z.enum(['sectors', 'directions', 'roles', 'tones']).optional(),
		sector: z.string().max(40).optional(),
		brief: z.string().max(200).optional(),
		sections: z.array(z.string().max(30)).max(12).optional(),
		tone: z.enum(['quiet', 'bold', 'warm', 'technical', 'playful', 'luxury', 'editorial']).optional(),
		have: z.array(z.enum(['photography', 'product-photo', 'product-ui', 'illustration', 'video'])).optional(),
		keep: z.array(z.enum(['palette', 'type'])).optional(),
		options: z.number().int().min(2).max(5).optional(),
		direction: z.string().max(60).optional(),
		redraw: z.string().max(80).optional(),
		seed: z.number().int().optional()
	}),
	handler: async (a) => {
		const out = join(outRoot(), 'direction');
		mkdirSync(out, { recursive: true });
		const args = [join(TASTE_SCRIPTS, 'draw.mjs')];
		let mode: string;
		if (a.list) {
			args.push('--list', a.list);
			mode = `list ${a.list}`;
		} else if (a.redraw) {
			args.push('--redraw', a.redraw);
			mode = `redraw ${a.redraw}`;
		} else {
			if (!a.sector || !a.brief) throw new ToolError('E_INPUT', 'sector 와 brief 가 필요합니다(목록만 보려면 list)');
			args.push('--sector', a.sector, '--brief', a.brief);
			if (a.sections?.length) args.push('--sections', a.sections.join(','));
			if (a.tone) args.push('--tone', a.tone);
			if (a.have?.length) args.push('--have', a.have.join(','));
			if (a.keep?.length) args.push('--keep', a.keep.join(','));
			if (a.direction) args.push('--direction', a.direction);
			if (a.options) args.push('--options', String(a.options));
			mode = a.options ? `options ${a.options}` : 'sheet';
		}
		if (a.seed !== undefined) args.push('--seed', String(a.seed));
		args.push('--out', out);
		const r = await runSub(process.execPath, args, { cwd: out, env: subEnv(outRoot(), { TASTE_SKILL_HISTORY: join(out, 'history.json') }) });
		assertRan(r, 'taste draw');
		if (r.code === 2) throw new ToolError('E_INPUT', r.stderr.trim().split('\n')[0] || 'draw 입력 오류');
		if (r.code !== 0) throw engineError(r, 'taste draw');
		const sheet = join(out, 'direction.json');
		const head = [`OK design_direction: ${mode} (persuade 전용)`];
		if ((mode === 'sheet' || mode.startsWith('redraw')) && existsSync(sheet)) head.push(`direction.json: ${sheet}`);
		if (!a.list) head.push(ASSET_RULE);
		return ok(`${head.join('\n')}\n\n${r.stdout.trim()}`);
	}
});
