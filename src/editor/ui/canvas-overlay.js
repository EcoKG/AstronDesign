// 캔버스 엔진 어댑터(자체 오버레이): 실제 렌더 iframe 을 폭·배율로 띄우고 그 위에 고르기·끌기·크기·댓글 표지를 그린다.
// 다른 엔진으로 바꿀 때 이 파일의 createCanvas 인터페이스(setBoard·setZoom·fit·select·redraw·setMode·setMarkers)만 맞춘다.

const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3];
const DRAG_MIN = 3;

/**
 * @param {{ onSelect: (el: Element | null) => void, onComment: (el: Element, local: { x: number, y: number }) => void,
 *   onMove: (el: Element, start: { attr: string | null, translate: string }, dx: number, dy: number) => void,
 *   onResize: (el: Element, start: { attr: string | null, width: string, height: string }, w: number, h: number) => void,
 *   onZoom: (z: number) => void, onMarker: (id: string) => void }} cb
 */
export function createCanvas(cb) {
	const $ = (id) => document.getElementById(id);
	const canvas = $('canvas'), stage = $('stage'), scaler = $('scaler'), frame = /** @type {HTMLIFrameElement} */ ($('frame')), hit = $('hit');
	const selBox = $('sel-box'), hoverBox = $('hover-box'), markersEl = $('markers');
	let width = 1440, height = 900, zoom = 1, mode = 'edit';
	let selected = null;
	let markers = [];
	let gesture = null;

	const doc = () => frame.contentDocument;
	/** 부모 화면 좌표 → 대상 iframe 화면 좌표. */
	const toLocal = (e) => {
		const r = hit.getBoundingClientRect();
		return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
	};
	/** 대상 iframe 화면 좌표의 사각형 → 캔버스 기준 좌표. */
	const toCanvas = (r) => {
		const f = frame.getBoundingClientRect();
		const c = canvas.getBoundingClientRect();
		return { left: f.left - c.left + r.left * zoom, top: f.top - c.top + r.top * zoom, width: r.width * zoom, height: r.height * zoom };
	};
	const place = (box, r) => Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
	const pick = (p) => {
		const d = doc();
		const el = d?.elementFromPoint(p.x, p.y);
		return el && el !== d.documentElement ? el : d?.body ?? null;
	};

	function redraw() {
		selBox.hidden = !selected || !selected.isConnected;
		if (!selBox.hidden) {
			place(selBox, toCanvas(selected.getBoundingClientRect()));
			selBox.querySelector('.tag').textContent = selected.tagName.toLowerCase();
		}
		markersEl.replaceChildren(...markers.map((m) => {
			const r = m.el?.isConnected ? m.el.getBoundingClientRect() : { left: m.point?.x ?? 0, top: m.point?.y ?? 0, width: 0, height: 0 };
			const at = toCanvas(r);
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'marker';
			b.textContent = String(m.n);
			b.title = m.note;
			b.style.left = `${at.left}px`;
			b.style.top = `${at.top}px`;
			b.addEventListener('click', () => cb.onMarker(m.id));
			return b;
		}));
	}

	function layout() {
		frame.style.width = `${width}px`;
		frame.style.height = `${height}px`;
		frame.style.transform = `scale(${zoom})`;
		scaler.style.width = `${width * zoom}px`;
		scaler.style.height = `${height * zoom}px`;
		cb.onZoom(zoom);
		redraw();
	}

	hit.addEventListener('mousemove', (e) => {
		if (gesture || mode !== 'edit') return hoverBox.classList.remove('on');
		const el = pick(toLocal(e));
		hoverBox.classList.toggle('on', !!el && el !== selected);
		if (el) place(hoverBox, toCanvas(el.getBoundingClientRect()));
	});
	hit.addEventListener('mouseleave', () => hoverBox.classList.remove('on'));
	hit.addEventListener('wheel', (e) => {
		const w = frame.contentWindow;
		if (!w || e.ctrlKey) return;
		e.preventDefault();
		w.scrollBy(e.deltaX / zoom, e.deltaY / zoom);
	}, { passive: false });

	hit.addEventListener('mousedown', (e) => {
		if (e.button !== 0) return;
		const p = toLocal(e);
		const el = pick(p);
		if (!el) return;
		if (mode === 'comment') return cb.onComment(el, p);
		if (selected && (el === selected || selected.contains(el))) {
			gesture = { kind: 'move', x: e.clientX, y: e.clientY, moved: false, el: selected, attr: selected.getAttribute('style'), translate: selected.style.getPropertyValue('translate'), base: (doc().defaultView.getComputedStyle(selected).translate || 'none') };
		} else cb.onSelect(el);
	});
	selBox.querySelector('.handle').addEventListener('mousedown', (e) => {
		if (!selected || e.button !== 0) return;
		e.preventDefault();
		const r = selected.getBoundingClientRect();
		gesture = { kind: 'size', x: e.clientX, y: e.clientY, moved: false, el: selected, attr: selected.getAttribute('style'), width: selected.style.getPropertyValue('width'), height: selected.style.getPropertyValue('height'), w: r.width, h: r.height };
	});
	window.addEventListener('mousemove', (e) => {
		if (!gesture) return;
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
	window.addEventListener('mouseup', (e) => {
		const g = gesture;
		gesture = null;
		if (!g?.moved) return;
		const dx = (e.clientX - g.x) / zoom, dy = (e.clientY - g.y) / zoom;
		if (g.kind === 'move') {
			const [bx, by] = g.base === 'none' ? [0, 0] : g.base.split(' ').map((v) => parseFloat(v) || 0);
			cb.onMove(g.el, { attr: g.attr, translate: g.translate }, Math.round(bx + dx), Math.round(by + dy));
		} else cb.onResize(g.el, { attr: g.attr, width: g.width, height: g.height }, Math.max(1, Math.round(g.w + dx)), Math.max(1, Math.round(g.h + dy)));
	});
	stage.addEventListener('scroll', redraw);
	window.addEventListener('resize', redraw);

	return {
		frame,
		/** 보드 폭·높이를 바꾼다. */
		setBoard(w, h) {
			width = w;
			height = h;
			layout();
		},
		/** 배율을 정한다(0.1~3). */
		setZoom(z) {
			zoom = Math.min(3, Math.max(0.1, Math.round(z * 100) / 100));
			layout();
		},
		zoomIn() { this.setZoom(ZOOM_STEPS.find((s) => s > zoom + 0.001) ?? zoom); },
		zoomOut() { this.setZoom([...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.001) ?? zoom); },
		/** 보드가 캔버스 안에 다 보이는 배율(최대 1). */
		fit() {
			const pad = 48;
			this.setZoom(Math.min(1, (canvas.clientWidth - pad) / width, (canvas.clientHeight - pad) / height));
		},
		zoom: () => zoom,
		/** 대상 문서가 바뀌면 스크롤 표지를 다시 건다. */
		attach() {
			frame.contentWindow?.addEventListener('scroll', redraw);
			frame.contentWindow?.addEventListener('resize', redraw);
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
		/** 댓글 표지 목록({ id, n, el, point, note }). */
		setMarkers(list) {
			markers = list;
			redraw();
		},
		redraw
	};
}
