// 캔버스 엔진 어댑터(자체 무한 캔버스): 폭별 실제 렌더 iframe 아트보드를 world 에 나란히 두고 이동·배율·맞춤과 고르기·끌기·크기·댓글 표지를 그린다.
// 다른 엔진으로 바꿀 때 이 파일의 createCanvas 인터페이스(setBoards·activate·focusBoard·fitAll·fit·overviewZoom·boardZoom·setZoom·select·redraw·setMode·setTool·setSpace·setMarkers·view)만 맞춘다.
import { elementByPath, elementPath } from './shared/dom-bundle.js';
import { boardHeight, boardLabel, boardTag } from './shared/boards.js';

const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3];
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const DRAG_MIN = 3;
/** 보드 사이 간격(world px). */
const GAP = 96;
/** 맞춤 여백: 위는 이름표, 아래는 떠 있는 도구막대 자리. */
const PAD = { left: 32, right: 32, top: 48, bottom: 88 };
/** 점 격자 기본 간격(world px). */
const GRID = 16;
/** 이름표 아래쪽과 보드 위쪽 사이(화면 px, 이름표 높이 포함). */
const LABEL_GAP = 26;
/** 이름표 오른쪽 끝과 다음 이름표 사이 최소 간격(화면 px). */
const LABEL_SPACE = 8;
const MARKER = 24;
/** 선택 표지 이름 칩 높이(화면 px). 보드 위 이름표와 겹치면 요소 아래로 내린다. */
const TAG_H = 22;
/** 줄 단위 휠(deltaMode 1)의 줄 높이. */
const LINE = 16;
/** Ctrl+휠·핀치 배율 민감도(delta 1px 당 지수). */
const WHEEL_ZOOM = 0.0025;

/**
 * @param {{ onSelect: (el: Element | null) => void, onActivate: (w: number) => void, onComment: (el: Element, local: { x: number, y: number }) => void,
 *   onMove: (el: Element, start: { attr: string | null, translate: string }, dx: number, dy: number) => void,
 *   onResize: (el: Element, start: { attr: string | null, width: string, height: string }, w: number, h: number) => void,
 *   onView: (v: { x: number, y: number, zoom: number, active: number | null }) => void, onMarker: (id: string) => void }} cb
 */
export function createCanvas(cb) {
	const $ = (id) => document.getElementById(id);
	const canvas = $('canvas'), world = $('world'), labelsEl = $('labels');
	const selBox = $('sel-box'), hoverBox = $('hover-box'), ghostsEl = $('ghosts'), markersEl = $('markers');
	/** @type {{ w: number, h: number, x: number, el: HTMLElement, frame: HTMLIFrameElement, hit: HTMLElement, label: HTMLButtonElement }[]} */
	let boards = [];
	let active = null;
	let pan = { x: 0, y: 0 }, zoom = 1, mode = 'edit', tool = null, space = false;
	let selected = null;
	let markers = [];
	let gesture = null;
	let panned = false;

	const boardOf = (w) => boards.find((b) => b.w === w) ?? null;
	const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
	const box = () => canvas.getBoundingClientRect();
	/** 부모 화면 좌표 → 보드 iframe 화면 좌표. */
	const toLocal = (b, e) => {
		const c = box();
		return { x: (e.clientX - c.left - pan.x) / zoom - b.x, y: (e.clientY - c.top - pan.y) / zoom };
	};
	/** 보드 iframe 화면 좌표의 사각형 → 캔버스 기준 좌표. */
	const toCanvas = (b, r) => ({ left: pan.x + (b.x + r.left) * zoom, top: pan.y + r.top * zoom, width: r.width * zoom, height: r.height * zoom });
	const place = (el, r) => Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
	const pick = (b, p) => {
		const d = b.frame.contentDocument;
		const el = d?.elementFromPoint(p.x, p.y);
		return el && el !== d.documentElement ? el : d?.body ?? null;
	};
	/** 다른 보드 문서에서 같은 경로·태그의 요소. */
	const twin = (b, el) => {
		const d = b.frame.contentDocument;
		const t = d && elementByPath(d, elementPath(el));
		return t && t.tagName === el.tagName ? t : null;
	};
	const view = () => ({ x: pan.x, y: pan.y, zoom, active: active?.w ?? null });
	/** 요소 상자와 글자 상자 중 더 위쪽을 위 끝으로 한 사각형(글꼴이 줄 높이보다 커 글자가 상자 위로 나올 때 표지가 가리지 않게). */
	const visibleTop = (el) => {
		const r = el.getBoundingClientRect();
		const range = el.ownerDocument.createRange();
		range.selectNodeContents(el);
		const t = range.getBoundingClientRect();
		const top = t.height ? Math.min(r.top, t.top) : r.top;
		return { left: r.left, top, width: r.width, height: r.bottom - top };
	};

	/** 점 격자: 화면 간격이 12~48px 이 되는 16·2^k world px, 위치는 이동량을 간격으로 나눈 나머지. */
	function grid() {
		let step = GRID * zoom;
		while (step < 12) step *= 2;
		while (step > 48) step /= 2;
		const mod = (a) => ((a % step) + step) % step;
		canvas.style.setProperty('--grid-step', `${step}px`);
		canvas.style.setProperty('--grid-x', `${mod(pan.x)}px`);
		canvas.style.setProperty('--grid-y', `${mod(pan.y)}px`);
	}

	function redraw() {
		const c = box();
		for (const [i, b] of boards.entries()) {
			const left = pan.x + b.x * zoom;
			const next = boards[i + 1];
			const room = next ? (next.x - b.x) * zoom - LABEL_SPACE : Math.max(b.w * zoom, c.width - left - LABEL_SPACE);
			Object.assign(b.label.style, { left: `${left}px`, top: `${pan.y - LABEL_GAP}px`, maxWidth: `${Math.max(room, 0)}px` });
			b.label.textContent = boardTag(b.w, room);
		}
		const sel = active && selected?.isConnected ? selected : null;
		selBox.hidden = !sel;
		if (sel) {
			const r = toCanvas(active, sel.getBoundingClientRect());
			place(selBox, r);
			selBox.querySelector('.tag').textContent = sel.tagName.toLowerCase();
			selBox.classList.toggle('tag-below', r.top - TAG_H < pan.y);
		}
		ghostsEl.replaceChildren(...(sel ? boards.filter((b) => b !== active) : []).flatMap((b) => {
			const t = twin(b, sel);
			if (!t) return [];
			const g = document.createElement('div');
			g.className = 'sel-ghost';
			g.dataset.w = String(b.w);
			place(g, toCanvas(b, t.getBoundingClientRect()));
			return [g];
		}));
		markersEl.replaceChildren(...markers.map((m) => {
			const b = boardOf(m.w) ?? active;
			const r = m.el?.isConnected ? visibleTop(m.el) : { left: m.point?.x ?? 0, top: m.point?.y ?? 0, width: 0, height: 0 };
			const at = b ? toCanvas(b, r) : { left: 0, top: 0 };
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'marker';
			btn.tabIndex = -1;
			btn.textContent = String(m.n);
			btn.title = m.note;
			btn.style.left = `${Math.min(Math.max(at.left, 0), Math.max(0, c.width - MARKER))}px`;
			btn.style.top = `${Math.min(Math.max(at.top - MARKER, 0), Math.max(0, c.height - MARKER))}px`;
			btn.addEventListener('click', () => cb.onMarker(m.id));
			return btn;
		}));
	}

	/** 이동·배율을 world 와 격자에 반영하고 알린다. */
	function apply() {
		world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
		world.style.setProperty('--zoom', String(zoom));
		grid();
		cb.onView(view());
		redraw();
	}

	/** 화면 점(캔버스 기준) 아래 world 좌표를 고정한 채 배율을 바꾼다. */
	function zoomAt(z, cx, cy) {
		const next = clampZoom(z);
		pan = { x: cx - ((cx - pan.x) * next) / zoom, y: cy - ((cy - pan.y) * next) / zoom };
		zoom = next;
		apply();
	}

	/** world 사각형이 여백 안에 들어오는 배율(최대 1)과 가운데 맞춘 이동 위치를 계산만 한다. */
	function fitOf(r) {
		const c = box();
		const aw = Math.max(1, c.width - PAD.left - PAD.right), ah = Math.max(1, c.height - PAD.top - PAD.bottom);
		const z = clampZoom(Math.min(1, aw / r.w, ah / r.h));
		return { zoom: z, pan: { x: PAD.left + (aw - r.w * z) / 2 - r.x * z, y: PAD.top + (ah - r.h * z) / 2 - r.y * z } };
	}

	/** world 사각형이 여백 안에 들어오는 배율(최대 1)로 가운데 맞춘다. */
	function fitRect(r) {
		({ zoom, pan } = fitOf(r));
		apply();
	}

	const boardRect = (b) => ({ x: b.x, y: 0, w: b.w, h: b.h });
	const allRect = () => {
		const last = boards.at(-1);
		return { x: 0, y: 0, w: last ? last.x + last.w : 1, h: Math.max(1, ...boards.map((b) => b.h)) };
	};

	/** 보드 하나의 DOM(아트보드·iframe·가림막·이름표)과 고르기 처리. */
	function makeBoard(w) {
		const b = { w, h: boardHeight(w), x: 0, el: document.createElement('section'), frame: document.createElement('iframe'), hit: document.createElement('div'), label: document.createElement('button') };
		b.el.className = 'artboard';
		b.el.dataset.w = String(w);
		b.el.setAttribute('aria-label', boardLabel(w));
		b.el.setAttribute('aria-current', 'false');
		b.frame.id = `frame-${w}`;
		b.frame.name = `target-${w}`;
		b.frame.title = `편집 대상 화면 ${w}px`;
		b.hit.className = 'hit';
		b.el.append(b.frame, b.hit);
		b.label.type = 'button';
		b.label.className = 'board-label';
		b.label.dataset.w = String(w);
		b.label.setAttribute('aria-label', `${boardLabel(w)} 보드 활성화`);
		b.label.title = boardLabel(w);
		b.label.addEventListener('click', () => {
			cb.onActivate(w);
			api.focusBoard(w);
		});
		b.hit.addEventListener('pointermove', (e) => {
			if (gesture || mode !== 'edit' || tool || space) return hoverBox.classList.remove('on');
			const el = pick(b, toLocal(b, e));
			hoverBox.classList.toggle('on', !!el && el !== selected);
			if (el) place(hoverBox, toCanvas(b, el.getBoundingClientRect()));
		});
		b.hit.addEventListener('pointerleave', () => hoverBox.classList.remove('on'));
		b.hit.addEventListener('pointerdown', (e) => {
			if (e.button !== 0 || gesture) return;
			const p = toLocal(b, e);
			const el = pick(b, p);
			if (!el) return;
			if (b !== active) cb.onActivate(w);
			if (mode === 'comment') return cb.onComment(el, p);
			if (selected && active === b && (el === selected || selected.contains(el))) {
				gesture = { kind: 'move', x: e.clientX, y: e.clientY, moved: false, el: selected, attr: selected.getAttribute('style'), translate: selected.style.getPropertyValue('translate'), base: (b.frame.contentWindow.getComputedStyle(selected).translate || 'none') };
			} else cb.onSelect(el);
		});
		return b;
	}

	const setSpace = (on) => {
		space = on;
		document.body.dataset.space = on ? '1' : '0';
		if (on) hoverBox.classList.remove('on');
	};

	canvas.addEventListener('wheel', (e) => {
		e.preventDefault();
		const k = e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? box().height : 1;
		let dx = e.deltaX * k, dy = e.deltaY * k;
		if (e.ctrlKey || e.metaKey) {
			const c = box();
			return zoomAt(zoom * Math.exp(-dy * WHEEL_ZOOM), e.clientX - c.left, e.clientY - c.top);
		}
		if (e.altKey) {
			const b = boards.find((x) => x.el.contains(/** @type {Node} */ (e.target)));
			b?.frame.contentWindow?.scrollBy(dx, dy);
			return;
		}
		if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0];
		pan = { x: pan.x - dx, y: pan.y - dy };
		apply();
	}, { passive: false });
	canvas.addEventListener('pointerdown', (e) => {
		const t = /** @type {Element} */ (e.target);
		if (t.closest('#toolbar, .board-label, .marker, #warnings')) return;
		panned = false;
		canvas.focus({ preventScroll: true });
		if (e.button === 1 || (e.button === 0 && (space || tool === 'hand'))) {
			e.preventDefault();
			e.stopPropagation();
			panned = true;
			hoverBox.classList.remove('on');
			gesture = { kind: 'pan', x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
			document.body.dataset.panning = '1';
		}
	}, true);
	canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
	canvas.addEventListener('click', (e) => {
		if (panned || mode !== 'edit' || (e.target !== canvas && e.target !== world)) return;
		cb.onSelect(null);
	});
	selBox.querySelector('.handle').addEventListener('pointerdown', (e) => {
		if (!selected || e.button !== 0 || space || tool) return;
		e.preventDefault();
		e.stopPropagation();
		const r = selected.getBoundingClientRect();
		gesture = { kind: 'size', x: e.clientX, y: e.clientY, moved: false, el: selected, attr: selected.getAttribute('style'), width: selected.style.getPropertyValue('width'), height: selected.style.getPropertyValue('height'), w: r.width, h: r.height };
	});
	window.addEventListener('pointermove', (e) => {
		if (!gesture) return;
		if (gesture.kind === 'pan') {
			pan = { x: gesture.px + e.clientX - gesture.x, y: gesture.py + e.clientY - gesture.y };
			return apply();
		}
		const dx = (e.clientX - gesture.x) / zoom, dy = (e.clientY - gesture.y) / zoom;
		if (!gesture.moved && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < DRAG_MIN) return;
		gesture.moved = true;
		if (gesture.kind === 'move') {
			const [bx, by] = gesture.base === 'none' ? [0, 0] : gesture.base.split(' ').map((v) => parseFloat(v) || 0);
			gesture.el.style.setProperty('translate', `${Math.round(bx + dx)}px ${Math.round(by + dy)}px`);
		} else {
			gesture.el.style.setProperty('width', `${Math.max(1, Math.round(gesture.w + dx))}px`);
			gesture.el.style.setProperty('height', `${Math.max(1, Math.round(gesture.h + dy))}px`);
		}
		redraw();
	});
	window.addEventListener('pointerup', (e) => {
		const g = gesture;
		gesture = null;
		if (g?.kind === 'pan') return void delete document.body.dataset.panning;
		if (!g?.moved) return;
		const dx = (e.clientX - g.x) / zoom, dy = (e.clientY - g.y) / zoom;
		if (g.kind === 'move') {
			const [bx, by] = g.base === 'none' ? [0, 0] : g.base.split(' ').map((v) => parseFloat(v) || 0);
			cb.onMove(g.el, { attr: g.attr, translate: g.translate }, Math.round(bx + dx), Math.round(by + dy));
		} else cb.onResize(g.el, { attr: g.attr, width: g.width, height: g.height }, Math.max(1, Math.round(g.w + dx)), Math.max(1, Math.round(g.h + dy)));
	});
	window.addEventListener('blur', () => setSpace(false));
	new ResizeObserver(() => redraw()).observe(canvas);

	const api = {
		/** 보드 폭 목록으로 아트보드를 만들어 위쪽을 맞춰 가로로 놓는다. */
		setBoards(widths) {
			boards = widths.map(makeBoard);
			let x = 0;
			for (const b of boards) {
				b.x = x;
				Object.assign(b.el.style, { left: `${x}px`, width: `${b.w}px`, height: `${b.h}px` });
				x += b.w + GAP;
			}
			world.replaceChildren(...boards.map((b) => b.el));
			labelsEl.replaceChildren(...boards.map((b) => b.label));
			active = boards[0] ?? null;
		},
		/** 보드 목록({ w, frame }). */
		boards: () => boards.map((b) => ({ w: b.w, frame: b.frame })),
		/** 활성 보드 폭. */
		active: () => active?.w ?? null,
		/** 활성 보드 문서. */
		activeDoc: () => active?.frame.contentDocument ?? null,
		/** 폭 w 보드 문서(없으면 활성 보드 문서). */
		docFor: (w) => (boardOf(w) ?? active)?.frame.contentDocument ?? null,
		/** 보드를 활성으로 한다(선택 상자·레이어 기준). */
		activate(w) {
			active = boardOf(w) ?? active;
			for (const b of boards) {
				b.el.setAttribute('aria-current', String(b === active));
				b.label.setAttribute('aria-current', String(b === active));
			}
			cb.onView(view());
			redraw();
		},
		/** 보드를 지금 배율 그대로 화면 가운데로 옮긴다. */
		focusBoard(w) {
			const b = boardOf(w);
			if (!b) return;
			const c = box();
			const ah = c.height - PAD.top - PAD.bottom;
			pan = { x: c.width / 2 - (b.x + b.w / 2) * zoom, y: b.h * zoom <= ah ? PAD.top + (ah - b.h * zoom) / 2 : PAD.top };
			apply();
		},
		/** 모든 보드 맞춤. */
		fitAll: () => fitRect(allRect()),
		/** 활성 보드 맞춤. */
		fit: () => active && fitRect(boardRect(active)),
		/** 모든 보드 맞춤 배율(보기는 바꾸지 않음). */
		overviewZoom: () => fitOf(allRect()).zoom,
		/** 폭 w 보드 맞춤 배율(보기는 바꾸지 않음, 없는 폭은 0). */
		boardZoom: (w) => {
			const b = boardOf(w);
			return b ? fitOf(boardRect(b)).zoom : 0;
		},
		/** 배율을 캔버스 가운데 기준으로 정한다(0.1~3). */
		setZoom(z) {
			const c = box();
			zoomAt(z, c.width / 2, c.height / 2);
		},
		zoomIn() { this.setZoom(ZOOM_STEPS.find((s) => s > zoom + 0.001) ?? zoom); },
		zoomOut() { this.setZoom([...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.001) ?? zoom); },
		zoom: () => zoom,
		/** 보기 상태({ x, y, zoom, active }). */
		view,
		/** 보드 문서가 바뀌면 스크롤 표지를 다시 건다. */
		attach() {
			for (const b of boards) {
				b.frame.contentWindow?.addEventListener('scroll', redraw);
				b.frame.contentWindow?.addEventListener('resize', redraw);
			}
		},
		select(el) {
			selected = el;
			redraw();
		},
		setMode(m) {
			mode = m;
			hoverBox.classList.remove('on');
			redraw();
		},
		/** 손 도구(hand) 또는 null. */
		setTool(t) {
			tool = t;
			document.body.dataset.tool = t ?? '';
			hoverBox.classList.remove('on');
		},
		/** 스페이스를 누르는 동안 이동 모드. */
		setSpace,
		/** 댓글 표지 목록({ id, n, w, el, point, note }). */
		setMarkers(list) {
			markers = list;
			redraw();
		},
		redraw
	};
	return api;
}
