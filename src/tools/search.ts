// design_search: UI UX Pro Max 검색기(search.py)를 하위 프로세스로 실행.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import { UUPM_SEARCH, assertRan, engineError, runSub, settings, subEnv } from '../config.ts';
import { ToolError, callDir, defineTool, ok, outRoot } from '../output.ts';

type SearchJson = { error?: string; domain?: string; stack?: string; query: string; count: number; results?: Record<string, unknown>[]; suggestions?: string[] };

const NOTE = '권고(P6): 상위 행을 그대로 채택하지 말고 프로젝트 DESIGN.md·브리프가 우선';

export const searchTool = defineTool({
	name: 'design_search',
	description: 'Search UI UX Pro Max design data (styles, palettes, fonts, UX rules) or build a design-system suggestion. Results are recommendations, not rules.',
	inputSchema: z.object({
		query: z.string().min(2).max(80),
		domain: z.enum(['style', 'color', 'chart', 'landing', 'product', 'ux', 'typography', 'icons', 'gsap', 'react', 'web', 'google-fonts']).optional(),
		stack: z.string().max(40).optional(),
		design_system: z.boolean().optional(),
		project_name: z.string().max(60).optional(),
		max_results: z.number().int().min(1).max(10).optional()
	}),
	handler: async (a) => {
		const dir = callDir('design_search');
		const args = ['-E', '-s', '-B', UUPM_SEARCH, a.query];
		if (a.design_system) args.push('--design-system', '-f', 'markdown', ...(a.project_name ? ['-p', a.project_name] : []));
		else args.push(...(a.domain ? ['--domain', a.domain] : []), ...(a.stack ? ['--stack', a.stack] : []), '-n', String(a.max_results ?? 3), '--json');
		const r = await runSub(settings().python, args, { cwd: dir, env: subEnv(outRoot(), { PYTHONIOENCODING: 'utf-8' }) });
		assertRan(r, 'UUPM search.py', 'UUPM 사용 불가: 기본값임을 밝히고 진행');
		if (r.code === 2) throw new ToolError('E_INPUT', r.stderr.trim().split('\n').pop() ?? 'search.py 인자 오류');
		if (r.code !== 0) throw engineError(r, 'UUPM search.py');
		const report = join(dir, 'report.json');
		if (a.design_system) {
			writeFileSync(report, JSON.stringify({ args: args.slice(3), markdown: r.stdout }, null, '\t'));
			return ok(`OK design_search: design-system "${a.query}"\n${NOTE}\nreport: ${report}\n\n${r.stdout.trim()}`);
		}
		let data: SearchJson;
		try {
			data = JSON.parse(r.stdout) as SearchJson;
		} catch {
			throw engineError(r, 'UUPM search.py(JSON 아님)');
		}
		writeFileSync(report, JSON.stringify({ args: args.slice(3), result: data }, null, '\t'));
		if (data.error) throw new ToolError('E_INPUT', data.error);
		const scope = data.stack ? `stack=${data.stack}` : `domain=${data.domain}`;
		if (!data.count) {
			const sug = data.suggestions?.length ? `\n가까운 용어: ${data.suggestions.join(', ')}` : '';
			return ok(`OK design_search: 0건: 지어내지 말고 기본값임을 밝힐 것 (${scope}, query="${a.query}")\nreport: ${report}${sug}`);
		}
		const rows = (data.results ?? []).map((row, i) => [`### ${i + 1}`, ...Object.entries(row).map(([k, v]) => `- ${k}: ${String(v).slice(0, 300)}`)].join('\n'));
		return ok(`OK design_search: ${data.count}건 ${scope} query="${a.query}"\n${NOTE}\nreport: ${report}\n\n${rows.join('\n\n')}`);
	}
});
