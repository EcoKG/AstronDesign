// 인라인 댓글: 댓글 모드에서 누른 요소에 댓글을 달고, 의도·에이전트에 보내기·답글·해결과 모든 댓글 목록, 보드 폭별 표지를 다룬다.
import { LIMITS, collectBundle, elementByPath, elementPath, selectorAt } from './shared/dom-bundle.js';

/**
 * @param {{ intents: Record<string, { label: string }>, save: (items: any[]) => Promise<any[]>, doc: (width: number) => Document | null, width: () => number, changed: (items: any[]) => void }} opts
 */
export function createComments(opts) {
	const $ = (id) => document.getElementById(id);
	const form = $('c-form'), list = $('comment-list'), intent = $('c-intent'), note = $('c-note'), send = $('c-send');
	/** @type {any[]} */
	let items = [];
	let pending = null;

	async function persist(next) {
		items = await opts.save(next);
		render();
	}

	function render() {
		list.replaceChildren(...items.map((c, i) => {
			const li = document.createElement('li');
			li.dataset.id = c.id;
			li.dataset.status = c.status;
			const head = document.createElement('div');
			head.className = 'head';
			const num = document.createElement('span');
			num.className = 'num';
			num.textContent = String(i + 1);
			const meta = document.createElement('span');
			meta.textContent = `${opts.intents[c.intent]?.label ?? c.intent} · ${{ open: '열림', sent: '보냄', resolved: '해결' }[c.status]}${c.width ? ` · ${c.width}` : ''}`;
			head.append(num, meta);
			const p = document.createElement('p');
			p.className = 'note';
			p.textContent = c.note;
			const sel = document.createElement('p');
			sel.className = 'selector';
			sel.textContent = c.selector;
			const replies = document.createElement('ul');
			replies.className = 'replies';
			replies.replaceChildren(...c.replies.map((r) => Object.assign(document.createElement('li'), { textContent: r.text })));
			const check = document.createElement('label');
			check.className = 'check';
			const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: c.send });
			box.addEventListener('change', () => persist(items.map((x) => (x.id === c.id ? { ...x, send: box.checked } : x))));
			check.append(box, '에이전트에 보내기');
			const input = Object.assign(document.createElement('input'), { className: 'reply-input', placeholder: '답글', maxLength: 2000 });
			input.setAttribute('aria-label', `${i + 1}번 댓글 답글`);
			const reply = Object.assign(document.createElement('button'), { type: 'button', className: 'reply-send', textContent: '답글' });
			reply.addEventListener('click', () => {
				if (!input.value.trim()) return input.focus();
				persist(items.map((x) => (x.id === c.id ? { ...x, replies: [...x.replies, { at: new Date().toISOString(), text: input.value.trim() }] } : x)));
			});
			const resolve = Object.assign(document.createElement('button'), { type: 'button', className: 'resolve', textContent: c.status === 'resolved' ? '다시 열기' : '해결' });
			resolve.addEventListener('click', () => persist(items.map((x) => (x.id === c.id ? { ...x, status: x.status === 'resolved' ? 'open' : 'resolved' } : x))));
			const actions = document.createElement('div');
			actions.className = 'actions';
			actions.append(reply, resolve);
			li.append(head, p, sel, replies, check, input, actions);
			return li;
		}));
		opts.changed(items);
	}

	$('c-cancel').addEventListener('click', () => {
		pending = null;
		form.hidden = true;
	});
	$('c-save').addEventListener('click', async () => {
		if (!pending || !note.value.trim()) return note.focus();
		const c = { ...pending, id: 'c' + crypto.randomUUID().slice(0, 8), intent: intent.value, note: note.value.trim(), send: send.checked, status: 'open', replies: [] };
		pending = null;
		form.hidden = true;
		await persist([...items, c]);
	});

	return {
		/** 저장된 댓글로 목록을 채운다. */
		load(next) {
			if (!intent.options.length) intent.replaceChildren(...Object.entries(opts.intents).map(([id, v]) => new Option(v.label, id)));
			items = next;
			render();
		},
		/** 누른 요소로 새 댓글 입력칸을 연다(댓글 폭 = 활성 보드 폭). */
		pick(el, point) {
			pending = { selector: selectorAt(null, el), path: elementPath(el), tag: el.tagName.toLowerCase(), point: { x: Math.round(point.x), y: Math.round(point.y) }, width: opts.width(), bundle: collectBundle(el, LIMITS) };
			$('c-target').textContent = pending.selector;
			form.hidden = false;
			note.value = '';
			send.checked = true;
			note.focus();
		},
		/** 표지용 목록(해결 안 된 댓글). 요소는 댓글을 단 폭의 보드 문서에서 찾는다. */
		markers() {
			return items.map((c, i) => ({ c, i })).filter(({ c }) => c.status !== 'resolved').map(({ c, i }) => {
				const d = opts.doc(c.width);
				const el = d ? elementByPath(d, c.path) : null;
				return { id: c.id, n: i + 1, w: c.width, note: c.note, el: el && el.tagName.toLowerCase() === c.tag ? el : null, point: c.point };
			});
		},
		focus(id) {
			list.querySelector(`[data-id="${CSS.escape(id)}"] .reply-input`)?.focus();
		},
		openCount: () => items.filter((c) => c.status !== 'resolved').length
	};
}
