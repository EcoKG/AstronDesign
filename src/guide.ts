// design_guide 의 topic 색인과 3,500자 페이지 나누기.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, VENDOR } from './config.ts';
import { ToolError } from './output.ts';

const PAGE = 3500;
const BRANDS_DIR = join(VENDOR, 'awesome-design-md', 'design-md');
let cache: Map<string, string> | null = null;

const topicName = (s: string) => s.toLowerCase().replace(/\.md$/, '').replace(/\./g, '-');

/** topic → 파일 경로(또는 생성 문서 표지 `@brands`) 대응을 만든다. */
function topics(): Map<string, string> {
	if (cache) return cache;
	const m = new Map<string, string>();
	for (const g of ['index', 'workflow', 'precedence', 'critique']) m.set(g, join(ROOT, 'guides', `${g}.md`));
	m.set('brands', '@brands');
	m.set('impeccable/skill', join(VENDOR, 'impeccable', 'SKILL.md'));
	for (const f of readdirSync(join(VENDOR, 'impeccable', 'reference'))) m.set(`impeccable/${topicName(f)}`, join(VENDOR, 'impeccable', 'reference', f));
	m.set('taste/skill', join(VENDOR, 'taste-skill', 'SKILL.md'));
	for (const f of readdirSync(join(VENDOR, 'taste-skill', 'references'))) m.set(`taste/${topicName(f)}`, join(VENDOR, 'taste-skill', 'references', f));
	m.set('uupm/skill', join(VENDOR, 'ui-ux-pro-max', 'SKILL.md'));
	for (const d of readdirSync(BRANDS_DIR)) if (existsSync(join(BRANDS_DIR, d, 'DESIGN.md'))) m.set(`brand/${topicName(d)}`, join(BRANDS_DIR, d, 'DESIGN.md'));
	cache = m;
	return m;
}

/** 모든 topic 이름(정렬). */
export function listTopics(): string[] {
	return [...topics().keys()].sort();
}

function distance(a: string, b: string): number {
	const row = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let prev = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cur = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = cur;
		}
	}
	return row[b.length];
}

function body(topic: string, path: string): string {
	if (path !== '@brands') return readFileSync(path, 'utf8');
	const brands = listTopics().filter((t) => t.startsWith('brand/'));
	return `# 브랜드 참고 DESIGN.md (${brands.length}개, awesome-design-md)\n\n참고 전용입니다(P7). 프로젝트에 복사하는 것은 사용자가 명시로 요청할 때만 쓰기 노드가 직접 합니다. 상표·외형의 권리는 각 소유자에게 있습니다.\n\n${brands.map((b) => `- ${b}`).join('\n')}\n`;
}

/** topic 문서의 offset 부터 3,500자를 머리줄과 함께 돌려준다. 없는 topic 은 E_NOT_FOUND(후보 10개). */
export function guidePage(topic: string | undefined, offset = 0): string {
	const name = topic || 'index';
	const path = topics().get(name);
	if (!path) {
		const cands = listTopics().sort((a, b) => distance(name, a) - distance(name, b)).slice(0, 10);
		throw new ToolError('E_NOT_FOUND', `없는 topic: ${name}. 후보:\n${cands.join('\n')}`);
	}
	const text = body(name, path);
	const a = Math.min(offset, text.length);
	const b = Math.min(a + PAGE, text.length);
	return `topic=${name} chars=${a}-${b}/${text.length} next_offset=${b < text.length ? b : 'end'}\n${text.slice(a, b)}`;
}
