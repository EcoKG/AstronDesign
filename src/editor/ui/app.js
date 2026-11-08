// 편집기 화면 진입점: 상태를 읽어 캔버스·레이어·속성·댓글·기록을 잇고, 편집을 자동 저장하며 승인 적용 뒤 대상을 다시 불러온다.
import { createCanvas } from './canvas-overlay.js';
import { createComments } from './comments.js';
import { createHistory } from './history.js';
import { createLayers } from './layers.js';
import { createProps } from './props.js';
import { elementByPath, elementPath, selectorAt } from './shared/dom-bundle.js';
import { OP_KINDS } from './shared/ops.js';

const TOK = location.pathname.split('/')[2];
const API = `/__astron/api/${TOK}`;
const HEIGHT = { 1440: 900, 1280: 800, 1024: 768, 768: 1024, 390: 844, 375: 812 };
const POLL_MS = 1500;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

let state = null;
let board = 1440;
let mode = 'edit';
let selected = null;
let appliedStamp = null;
let firstLoad = true;
let saving = Promise.resolve();
let pendingSaves = 0;
const intents = {};

window.__astron = { api: API };

const doc = () => canvas.frame.contentDocument;

/** 자동 저장 상태 표시. */
function setSave(s, text) {
	const el = $('save-state');
	el.dataset.state = s;
	el.textContent = text;
}

/** 편집 사건을 순서대로 저장한다. 모두 끝나면 '저장됨'. */
function save(events) {
	pendingSaves++;
	setSave('saving', '저장 중…');
	saving = saving
		.then(async () => {
			const r = await fetch(`${API}/changes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }) });
			if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).message) ?? String(r.status));
		})
		.then(() => {
			if (--pendingSaves === 0) setSave('saved', `저장됨 ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}`);
		}, (e) => {
			pendingSaves--;
			setSave('error', `저장 실패: ${e.message}`);
		});
}

/** 연산의 대상 요소(경로와 태그가 맞을 때만). */
function target(op) {
	const el = doc() && elementByPath(doc(), op.path);
	return el && el.tagName.toLowerCase() === op.tag ? el : null;
}

function refresh() {
	canvas.redraw();
	if (selected) props.show(selected);
	canvas.setMarkers(comments.markers());
}

const history = createHistory({
	apply(ops) {
		for (const op of ops) {
			const el = target(op);
			if (el) OP_KINDS[op.kind].apply(el, op);
		}
		refresh();
	},
	revert(ops) {
		for (const op of [...ops].reverse()) {
			const el = target(op);
			if (el) OP_KINDS[op.kind].invert(el, op);
		}
		refresh();
	},
	save,
	changed() {
		$('undo').disabled = !history.canUndo();
		$('redo').disabled = !history.canRedo();
	}
});

/** 요소에 연산들을 차례로 적용하고(다음 연산이 바뀐 style 속성을 기록하도록) 기록 한 항목으로 남긴다. 아무것도 바꾸지 않은 연산은 남기지 않는다. */
function commit(el, specs) {
	const ops = [];
	for (const [kind, prop, after] of specs) {
		const op = { id: 'op-' + crypto.randomUUID().slice(0, 13), kind, path: elementPath(el), tag: el.tagName.toLowerCase(), selector: selectorAt(null, el), before: kind === 'style' ? el.style.getPropertyValue(prop) : el.textContent, after, attr: el.getAttribute('style') };
		if (kind === 'style') op.prop = prop;
		OP_KINDS[kind].apply(el, op);
		const same = kind === 'style' ? el.getAttribute('style') === op.attr : op.before === op.after;
		if (!same) ops.push(op);
	}
	if (ops.length) history.record(ops);
	refresh();
}

/** 끌기·크기 미리보기 전의 style 속성으로 되돌린다. */
function restore(el, attr) {
	if (attr == null) el.removeAttribute('style');
	else el.setAttribute('style', attr);
}

function select(el) {
	selected = el;
	canvas.select(el);
	layers.select(el);
	props.show(el);
}

const canvas = createCanvas({
	onSelect: select,
	onComment: (el, p) => comments.pick(el, p),
	onMove(el, start, x, y) {
		restore(el, start.attr);
		commit(el, [['style', 'translate', `${x}px ${y}px`]]);
	},
	onResize(el, start, w, h) {
		restore(el, start.attr);
		commit(el, [['style', 'width', `${w}px`], ['style', 'height', `${h}px`]]);
	},
	onZoom: (z) => void ($('zoom-label').textContent = `${Math.round(z * 100)}%`),
	onMarker: (id) => comments.focus(id)
});
const layers = createLayers($('layers'), { onPick: select });
const props = createProps({
	onStyle: (prop, value) => selected && commit(selected, [['style', prop, value]]),
	onText: (value) => selected && selected.children.length === 0 && commit(selected, [['text', null, value]])
});
const comments = createComments({
	intents,
	doc,
	width: () => board,
	async save(items) {
		const r = await fetch(`${API}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) });
		const data = await r.json();
		if (!r.ok) throw new Error(data.message);
		return data.comments;
	},
	changed(items) {
		$('open-count').textContent = `열린 댓글 ${items.filter((c) => c.status !== 'resolved').length}`;
		canvas.setMarkers(comments.markers());
	}
});

function setMode(m) {
	mode = m;
	document.body.dataset.mode = m;
	$('mode-edit').setAttribute('aria-pressed', String(m === 'edit'));
	$('mode-comment').setAttribute('aria-pressed', String(m === 'comment'));
	$('props').hidden = m !== 'edit';
	$('comments').hidden = m !== 'comment';
	canvas.setMode(m);
	canvas.setMarkers(comments.markers());
}

function setBoard(w) {
	board = w;
	for (const b of $('boards').children) b.setAttribute('aria-pressed', String(Number(b.dataset.w) === w));
	canvas.setBoard(w, HEIGHT[w] ?? Math.round(w * 0.625));
	canvas.fit();
	requestAnimationFrame(refresh);
}

/** 대상을 (다시) 불러와 저장된 연산을 적용하고 트리·댓글·딥링크 선택을 맞춘다. */
function loadFrame(reload) {
	document.body.dataset.ready = '0';
	return new Promise((resolve) => {
		canvas.frame.addEventListener('load', () => {
			const d = doc();
			canvas.attach();
			selected = null;
			for (const op of state.ops) {
				const el = target(op);
				if (el) OP_KINDS[op.kind].apply(el, op);
			}
			history.reset(state.ops);
			layers.build(d);
			comments.load(state.comments);
			const sel = firstLoad ? params.get('sel') : null;
			firstLoad = false;
			select(sel ? d.querySelector(sel) : null);
			setMode(mode);
			refresh();
			document.body.dataset.ready = '1';
			resolve();
		}, { once: true });
		if (reload) canvas.frame.contentWindow.location.reload();
		else canvas.frame.src = state.targetPath;
	});
}

async function fetchState() {
	const r = await fetch(`${API}/state`);
	if (!r.ok) throw new Error(`상태 ${r.status}`);
	return r.json();
}

/** 차단 수·승인 적용을 주기적으로 확인하고, 새 적용이 있으면 대상을 다시 불러온다. */
async function poll() {
	try {
		const s = await fetchState();
		$('blocked').textContent = `차단 ${s.blocked}건`;
		if (s.applied?.line && s.applied.stamp !== appliedStamp) {
			appliedStamp = s.applied.stamp;
			state = s;
			const done = loadFrame(true);
			$('applied').hidden = false;
			$('applied').textContent = `원본 적용: ${s.applied.line}`;
			await done;
		}
	} catch {}
	setTimeout(poll, POLL_MS);
}

function keys(e) {
	const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
	if (!(e.ctrlKey || e.metaKey)) {
		if (e.key === 'Escape' && !typing) select(null);
		return;
	}
	const k = e.key.toLowerCase();
	if (k === '=' || k === '+') canvas.zoomIn();
	else if (k === '-') canvas.zoomOut();
	else if (k === '0') canvas.fit();
	else if (k === '\\') $('side').hidden = !$('side').hidden;
	else if (typing) return;
	else if ((k === 'z' && e.shiftKey) || k === 'y') history.redo();
	else if (k === 'z') history.undo();
	else return;
	e.preventDefault();
}

async function main() {
	state = await fetchState();
	appliedStamp = state.applied?.stamp ?? null;
	$('target-name').textContent = state.target;
	$('target-name').title = state.target;
	$('blocked').textContent = `차단 ${state.blocked}건`;
	if (state.warnings.length) {
		$('warnings').hidden = false;
		$('warnings').textContent = state.warnings.join(' / ');
	}
	Object.assign(intents, state.intents);
	const w = Number(params.get('w'));
	const widths = [...state.widths];
	if (w >= 320 && w <= 2560 && !widths.includes(w)) widths.push(w);
	$('boards').replaceChildren(...widths.map((bw) => {
		const b = Object.assign(document.createElement('button'), { type: 'button', textContent: `${bw}` });
		b.dataset.w = String(bw);
		b.setAttribute('aria-label', `보드 폭 ${bw}px`);
		b.addEventListener('click', () => setBoard(bw));
		return b;
	}));
	if (state.writeEnabled && state.approveOrigin) {
		const b = Object.assign(document.createElement('button'), { id: 'apply', type: 'button', className: 'primary', textContent: '원본에 적용…' });
		b.title = '다른 출처의 승인 화면에서 diff 를 보고 승인합니다';
		b.addEventListener('click', () => window.open(`${state.approveOrigin}/`, '_blank', 'noopener'));
		$('apply-slot').replaceChildren(b);
	}
	$('zoom-in').addEventListener('click', () => canvas.zoomIn());
	$('zoom-out').addEventListener('click', () => canvas.zoomOut());
	$('zoom-fit').addEventListener('click', () => canvas.fit());
	$('mode-edit').addEventListener('click', () => setMode('edit'));
	$('mode-comment').addEventListener('click', () => setMode('comment'));
	$('undo').addEventListener('click', () => history.undo());
	$('redo').addEventListener('click', () => history.redo());
	document.addEventListener('keydown', keys);
	mode = params.get('mode') === 'comment' ? 'comment' : 'edit';
	setMode(mode);
	setBoard(widths.includes(w) ? w : widths[0]);
	await loadFrame(false);
	setTimeout(poll, POLL_MS);
}

main().catch((e) => {
	$('warnings').hidden = false;
	$('warnings').textContent = `편집기를 열지 못했습니다: ${e.message}`;
});
