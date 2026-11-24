// 편집기 화면 진입점: 상태를 읽어 아트보드 캔버스·레이어·속성·댓글·기록을 잇고, 편집을 모든 보드에 반영해 자동 저장하며 승인 적용 뒤 보드를 다시 불러온다.
import { createCanvas } from './canvas-overlay.js';
import { createComments } from './comments.js';
import { createHistory } from './history.js';
import { createLayers } from './layers.js';
import { createProps } from './props.js';
import { boardHeight, boardLabel, boardName, initialView } from './shared/boards.js';
import { elementByPath, elementPath, selectorAt } from './shared/dom-bundle.js';
import { OP_KINDS } from './shared/ops.js';

const TOK = location.pathname.split('/')[2];
const API = `/__astron/api/${TOK}`;
const POLL_MS = 1500;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mqWide = matchMedia('(min-width: 1100px)');
const mqMid = matchMedia('(min-width: 700px)');

let state = null;
let mode = 'edit';
let tool = null;
let selected = null;
let appliedStamp = null;
let firstLoad = true;
let saving = Promise.resolve();
let pendingSaves = 0;
const intents = {};

window.__astron = { api: API, view: () => canvas.view() };

/** 활성 보드 문서. */
const doc = () => canvas.activeDoc();
/** 모든 보드 문서. */
const docs = () => canvas.boards().map((b) => b.frame.contentDocument).filter(Boolean);

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

/** 그 문서에서 연산의 대상 요소(경로와 태그가 맞을 때만). */
function target(op, d) {
	const el = d && elementByPath(d, op.path);
	return el && el.tagName.toLowerCase() === op.tag ? el : null;
}

/** 연산들을 모든 보드 문서에 적용(apply)하거나 거꾸로 되돌린다(invert). 경로·태그가 맞지 않는 보드와 skip 문서는 건너뛴다. */
function applyAll(ops, how, skip = null) {
	for (const d of docs()) {
		if (d === skip) continue;
		for (const op of how === 'invert' ? [...ops].reverse() : ops) {
			const el = target(op, d);
			if (el) OP_KINDS[op.kind][how](el, op);
		}
	}
}

function refresh() {
	canvas.redraw();
	if (selected) props.show(selected);
	canvas.setMarkers(comments.markers());
}

const history = createHistory({
	apply(ops) {
		applyAll(ops, 'apply');
		refresh();
	},
	revert(ops) {
		applyAll(ops, 'invert');
		refresh();
	},
	save,
	changed() {
		$('undo').disabled = !history.canUndo();
		$('redo').disabled = !history.canRedo();
	}
});

/** 활성 보드 요소에 연산들을 차례로 적용하고(다음 연산이 바뀐 style 속성을 기록하도록) 다른 보드에도 같은 연산을 반영한 뒤 기록 한 항목으로 남긴다. 아무것도 바꾸지 않은 연산은 남기지 않는다. */
function commit(el, specs) {
	const ops = [];
	for (const [kind, prop, after] of specs) {
		const op = { id: 'op-' + crypto.randomUUID().slice(0, 13), kind, path: elementPath(el), tag: el.tagName.toLowerCase(), selector: selectorAt(null, el), before: kind === 'style' ? el.style.getPropertyValue(prop) : el.textContent, after, attr: el.getAttribute('style') };
		if (kind === 'style') op.prop = prop;
		OP_KINDS[kind].apply(el, op);
		const same = kind === 'style' ? el.getAttribute('style') === op.attr : op.before === op.after;
		if (!same) ops.push(op);
	}
	if (ops.length) {
		applyAll(ops, 'apply', el.ownerDocument);
		history.record(ops);
	}
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
	onActivate: activate,
	onComment(el, p) {
		if (!mqMid.matches) setPanel('side', true);
		comments.pick(el, p);
	},
	onMove(el, start, x, y) {
		restore(el, start.attr);
		commit(el, [['style', 'translate', `${x}px ${y}px`]]);
	},
	onResize(el, start, w, h) {
		restore(el, start.attr);
		commit(el, [['style', 'width', `${w}px`], ['style', 'height', `${h}px`]]);
	},
	onView: (v) => void ($('zoom-label').textContent = `${Math.round(v.zoom * 100)}%`),
	onMarker: (id) => comments.focus(id)
});
const layers = createLayers($('layers'), { onPick: select });
const props = createProps({
	onStyle: (prop, value) => selected && commit(selected, [['style', prop, value]]),
	onText: (value) => selected && selected.children.length === 0 && commit(selected, [['text', null, value]])
});
const comments = createComments({
	intents,
	doc: (w) => canvas.docFor(w),
	width: () => canvas.active(),
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

/** 편집·댓글 모드. 도구 버튼은 손 도구와 서로 배타로 눌린다. */
function setMode(m) {
	mode = m;
	document.body.dataset.mode = m;
	$('props').hidden = m !== 'edit';
	$('comments').hidden = m !== 'comment';
	canvas.setMode(m);
	canvas.setMarkers(comments.markers());
	pressTools();
}

/** 도구막대 눌림 표시(편집·댓글·손 도구 중 하나). */
function pressTools() {
	$('mode-edit').setAttribute('aria-pressed', String(!tool && mode === 'edit'));
	$('mode-comment').setAttribute('aria-pressed', String(!tool && mode === 'comment'));
	$('tool-hand').setAttribute('aria-pressed', String(tool === 'hand'));
}

/** 손 도구(hand) 또는 null. */
function setTool(t) {
	tool = t;
	canvas.setTool(t);
	pressTools();
}

/** 패널(layers·side)을 열고 닫는다. 넓은 화면에서는 칸을 접고, 좁은 화면에서는 서랍·시트로 연다. */
function setPanel(name, open) {
	document.body.dataset[name] = open ? 'open' : 'closed';
	$(`toggle-${name}`).setAttribute('aria-expanded', String(open));
	requestAnimationFrame(() => canvas.redraw());
}

/** 화면 폭에 맞는 패널 기본값: 1100px 이상 둘 다, 700px 이상 속성만 연다. */
function panelDefaults() {
	setPanel('layers', mqWide.matches);
	setPanel('side', mqMid.matches);
}

/** 보드를 활성으로 하고 레이어를 그 보드 문서로 다시 만든 뒤 같은 경로 요소를 다시 고른다. */
function activate(w) {
	const path = selected ? elementPath(selected) : null;
	const tag = selected?.tagName.toLowerCase();
	canvas.activate(w);
	for (const b of $('boards').children) b.setAttribute('aria-pressed', String(Number(b.dataset.w) === canvas.active()));
	if (document.body.dataset.ready !== '1') return;
	const d = doc();
	if (d) layers.build(d);
	select(path && d ? target({ path, tag }, d) : null);
	canvas.setMarkers(comments.markers());
}

/** 모든 보드에 대상을 (다시) 불러와 저장된 연산을 적용하고 트리·댓글·딥링크 선택을 맞춘다. 보기 상태(활성 보드·배율·이동)는 그대로 둔다. */
function loadFrames(reload) {
	document.body.dataset.ready = '0';
	const frames = canvas.boards().map((b) => b.frame);
	const loaded = frames.map((f) => new Promise((resolve) => {
		const done = () => {
			if (f.contentWindow?.location.href === 'about:blank') return;
			f.removeEventListener('load', done);
			resolve();
		};
		f.addEventListener('load', done);
		if (reload) f.contentWindow.location.reload();
		else f.src = state.targetPath;
	}));
	return Promise.all(loaded).then(() => {
		canvas.attach();
		selected = null;
		applyAll(state.ops, 'apply');
		history.reset(state.ops);
		layers.build(doc());
		comments.load(state.comments);
		const sel = firstLoad ? params.get('sel') : null;
		firstLoad = false;
		let el = null;
		try {
			el = sel ? doc().querySelector(sel) : null;
		} catch {}
		select(el);
		setMode(mode);
		refresh();
		document.body.dataset.ready = '1';
	});
}

async function fetchState() {
	const r = await fetch(`${API}/state`);
	if (!r.ok) throw new Error(`상태 ${r.status}`);
	return r.json();
}

/** 차단 수·승인 적용을 주기적으로 확인하고, 새 적용이 있으면 모든 보드를 다시 불러온다. */
async function poll() {
	try {
		const s = await fetchState();
		$('blocked').textContent = `차단 ${s.blocked}건`;
		if (s.applied?.line && s.applied.stamp !== appliedStamp) {
			appliedStamp = s.applied.stamp;
			state = s;
			const done = loadFrames(true);
			$('applied').hidden = false;
			$('applied').textContent = `원본 적용: ${s.applied.line}`;
			await done;
		}
	} catch {}
	setTimeout(poll, POLL_MS);
}

/** 단축키. V·C·H·Space 는 포커스가 캔버스(또는 문서)일 때만, Shift+1/2 는 입력칸이 아닐 때. 입력칸·버튼의 원래 동작은 막지 않는다. */
function keys(e) {
	const t = /** @type {HTMLElement} */ (e.target);
	const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
	const onCanvas = t === document.body || t === document.documentElement || t === $('canvas');
	if (!(e.ctrlKey || e.metaKey || e.altKey)) {
		if (e.key === 'Escape' && !typing) return select(null);
		if (e.shiftKey && !typing && (e.code === 'Digit1' || e.code === 'Digit2')) {
			e.preventDefault();
			return e.code === 'Digit1' ? canvas.fitAll() : canvas.fit();
		}
		if (!onCanvas || e.shiftKey) return;
		if (e.code === 'Space') {
			e.preventDefault();
			if (!e.repeat) canvas.setSpace(true);
			return;
		}
		if (e.code === 'KeyV') {
			setTool(null);
			setMode('edit');
		} else if (e.code === 'KeyC') {
			setTool(null);
			setMode('comment');
		} else if (e.code === 'KeyH') setTool(tool === 'hand' ? null : 'hand');
		else return;
		e.preventDefault();
		return;
	}
	if (e.altKey) return;
	const k = e.key.toLowerCase();
	if (k === '=' || k === '+') canvas.zoomIn();
	else if (k === '-') canvas.zoomOut();
	else if (k === '0') canvas.fitAll();
	else if (k === '\\') setPanel('side', document.body.dataset.side === 'closed');
	else if (typing) return;
	else if ((k === 'z' && e.shiftKey) || k === 'y') history.redo();
	else if (k === 'z') history.undo();
	else return;
	e.preventDefault();
}

/** 스페이스를 떼면 이동 모드를 끝낸다. */
function keyUp(e) {
	if (e.code === 'Space') canvas.setSpace(false);
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
	const raw = params.get('w');
	const w = /^\d+$/.test(raw ?? '') ? Number(raw) : NaN;
	const valid = w >= 320 && w <= 2560;
	const widths = [...state.widths];
	if (valid && !widths.includes(w)) widths.push(w);
	canvas.setBoards(widths);
	$('boards').replaceChildren(...widths.map((bw) => {
		const b = document.createElement('button');
		b.type = 'button';
		b.dataset.w = String(bw);
		b.setAttribute('aria-pressed', 'false');
		const name = Object.assign(document.createElement('span'), { textContent: boardName(bw) });
		const size = Object.assign(document.createElement('span'), { className: 'dim', textContent: `${bw} × ${boardHeight(bw)}` });
		b.append(name, size);
		b.setAttribute('aria-label', `${boardLabel(bw)} 보드 활성화`);
		b.addEventListener('click', () => {
			activate(bw);
			canvas.focusBoard(bw);
		});
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
	$('zoom-fit').addEventListener('click', () => canvas.fitAll());
	$('mode-edit').addEventListener('click', () => {
		setTool(null);
		setMode('edit');
	});
	$('mode-comment').addEventListener('click', () => {
		setTool(null);
		setMode('comment');
	});
	$('tool-hand').addEventListener('click', () => setTool(tool === 'hand' ? null : 'hand'));
	$('undo').addEventListener('click', () => history.undo());
	$('redo').addEventListener('click', () => history.redo());
	$('toggle-layers').addEventListener('click', () => setPanel('layers', document.body.dataset.layers === 'closed'));
	$('toggle-side').addEventListener('click', () => setPanel('side', document.body.dataset.side === 'closed'));
	mqWide.addEventListener('change', panelDefaults);
	mqMid.addEventListener('change', panelDefaults);
	panelDefaults();
	document.addEventListener('keydown', keys);
	document.addEventListener('keyup', keyUp);
	mode = params.get('mode') === 'comment' ? 'comment' : 'edit';
	setMode(mode);
	const first = initialView({ widths, requested: valid ? w : null, overview: canvas.overviewZoom(), fitOf: canvas.boardZoom, viewport: innerWidth });
	activate(first.active);
	if (first.fit === 'all') canvas.fitAll();
	else canvas.fit();
	await loadFrames(false);
	setTimeout(poll, POLL_MS);
}

main().catch((e) => {
	$('warnings').hidden = false;
	$('warnings').textContent = `편집기를 열지 못했습니다: ${e.message}`;
});
