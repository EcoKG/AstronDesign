// 레이어 트리: 대상 body 아래 요소를 접고 펴는 트리로 보이고, 행 선택 ↔ 캔버스 선택을 잇는다.
import { elementByPath, elementPath } from './shared/dom-bundle.js';

const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'BASE']);
const MAX_NODES = 1500;

/** 요소 이름표(tag#id.class). */
function label(el) {
	const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
	return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls.map((c) => '.' + c).join('');
}

/**
 * @param {HTMLUListElement} root
 * @param {{ onPick: (el: Element) => void }} opts
 */
export function createLayers(root, opts) {
	let doc = null;
	let count = 0;

	/** 요소 하나의 행과 하위 트리. */
	function node(el, level) {
		const li = document.createElement('li');
		const path = elementPath(el).join('.');
		li.setAttribute('role', 'treeitem');
		li.dataset.path = path;
		li.setAttribute('aria-level', String(level));
		li.setAttribute('aria-selected', 'false');
		const kids = Array.from(el.children).filter((c) => !SKIP.has(c.tagName));
		const row = document.createElement('div');
		row.className = 'row';
		if (kids.length) {
			li.setAttribute('aria-expanded', level === 1 ? 'true' : 'false');
			const t = document.createElement('button');
			t.type = 'button';
			t.className = 'toggle';
			t.tabIndex = -1;
			t.setAttribute('aria-label', `${label(el)} 펼치기·접기`);
			t.textContent = '▸';
			t.addEventListener('click', () => toggle(li));
			row.append(t);
		} else {
			const g = document.createElement('span');
			g.className = 'gap';
			row.append(g);
		}
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'label';
		b.textContent = label(el);
		b.addEventListener('click', () => {
			const target = doc && elementByPath(doc, path.split('.').map(Number));
			if (target) opts.onPick(target);
		});
		row.append(b);
		li.append(row);
		if (kids.length) {
			const ul = document.createElement('ul');
			ul.setAttribute('role', 'group');
			for (const k of kids) if (count++ < MAX_NODES) ul.append(node(k, level + 1));
			li.append(ul);
		}
		syncArrow(li);
		return li;
	}

	function syncArrow(li) {
		const t = li.querySelector(':scope > .row > .toggle');
		if (t) t.textContent = li.getAttribute('aria-expanded') === 'true' ? '▾' : '▸';
	}

	function toggle(li) {
		li.setAttribute('aria-expanded', li.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
		syncArrow(li);
	}

	return {
		/** 대상 문서로 트리를 다시 만든다. */
		build(d) {
			doc = d;
			count = 0;
			root.replaceChildren(d.body ? node(d.body, 1) : document.createTextNode(''));
		},
		/** 요소의 행을 강조하고 조상 행을 펼친다. */
		select(el) {
			for (const s of root.querySelectorAll('[aria-selected="true"]')) s.setAttribute('aria-selected', 'false');
			if (!el) return;
			const li = root.querySelector(`[data-path="${elementPath(el).join('.')}"]`);
			if (!li) return;
			li.setAttribute('aria-selected', 'true');
			for (let p = li.parentElement?.closest('li'); p; p = p.parentElement?.closest('li')) {
				p.setAttribute('aria-expanded', 'true');
				syncArrow(p);
			}
			li.querySelector(':scope > .row')?.scrollIntoView({ block: 'nearest' });
		}
	};
}
