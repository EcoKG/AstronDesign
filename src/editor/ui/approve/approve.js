// 승인 화면: 주소 해시의 승인 토큰을 이 출처 localStorage 로 옮기고, 원본 diff 를 보여 준 뒤 사람이 누를 때만 쓰기를 요청한다.
const KEY = 'astron-approve';
const $ = (id) => document.getElementById(id);

if (location.hash.length > 1) {
	localStorage.setItem(KEY, location.hash.slice(1));
	history.replaceState(null, '', location.pathname);
}
const token = localStorage.getItem(KEY) ?? '';
let nonce = null;

/** 승인 API 호출(토큰 헤더). 실패면 `코드: 설명` 오류. */
async function call(path, body) {
	const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-astron-approve': token }, body: JSON.stringify(body ?? {}) });
	const data = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(`${data.error ?? r.status}: ${data.message ?? ''}`);
	return data;
}

/** diff 줄마다 더함·뺌·묶음 머리 표시를 붙여 그린다. 글자는 diff 원문 그대로다. */
function showDiff(text) {
	const pre = $('diff');
	pre.replaceChildren(...text.split('\n').map((line) => {
		const span = document.createElement('span');
		span.className = line.startsWith('@@') ? 'hunk' : line.startsWith('+') && !line.startsWith('+++') ? 'add' : line.startsWith('-') && !line.startsWith('---') ? 'del' : '';
		span.textContent = line + '\n';
		return span;
	}));
}

async function plan() {
	$('approve').disabled = true;
	$('diff').dataset.loaded = '0';
	try {
		if (!token) throw new Error('승인 토큰이 없습니다: design_edit 결과의 승인 주소(# 포함)를 이 브라우저에서 한 번 여십시오');
		const p = await call('/api/plan');
		nonce = p.nonce;
		$('target').textContent = `대상: ${p.target} · 쓸 파일: ${p.files.join(', ') || '없음'}`;
		showDiff(p.diff || '원본에 쓸 편집이 없습니다.');
		$('skipped').replaceChildren(...(p.skipped.length ? p.skipped : [null]).map((s) => {
			const li = document.createElement('li');
			li.textContent = s ? `${s.selector} ${s.prop ?? '글자'}: ${s.after} — ${s.reason}` : '없음';
			return li;
		}));
		$('approve').disabled = !p.files.length;
	} catch (e) {
		showDiff(String(e.message));
	}
	$('diff').dataset.loaded = '1';
}

$('refresh').addEventListener('click', plan);
$('approve').addEventListener('click', async () => {
	$('approve').disabled = true;
	$('result').dataset.done = '0';
	$('result').textContent = '쓰는 중… 다시 렌더해 검증합니다.';
	try {
		const r = await call('/api/approve', { nonce });
		$('result').textContent = `${r.render}\n쓴 파일: ${r.files.join(', ')}\n백업: ${r.backup}`;
	} catch (e) {
		$('result').textContent = `ERROR ${e.message}`;
	}
	$('result').dataset.done = '1';
});

plan();
