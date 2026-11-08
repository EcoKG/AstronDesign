# 편집기 캔버스 작업 공간 디자인 근거

AstronDesign 편집기 화면(`src/editor/ui/`)을 디자이너가 쓰는 캔버스 작업 공간으로 다시 설계하고 구현한 기록이다. 디자인 과정은 AstronDesign 하네스 작업 흐름(S1~S7)으로 진행했다. 하네스가 자기 화면을 스스로 설계·검증한 첫 사례다.

- 작업서: task-v1 #6dd42a49(2026-11-08 주인님 지시 "캔버스 같은 디자이너 작업 공간", 화면 유형 operate)
- 결정: 사양서 7절 G2 "자체 구현"(`docs/claude-design-parity-spec.md` 7절). G4 버전 모델과 G7 진입 경로는 이번에 바꾸지 않는다(임시 형태 유지).
- 바꾸지 않은 것: GrapesJS 미채택(4.2절), 원본 쓰기 기본 꺼짐과 승인 3단(env `ASTRONDESIGN_WRITE=allow` + 인자 `allow_write` + 다른 출처 승인 화면의 사람 diff 승인, 4.3절). 작업 출처에 새 API 를 만들지 않았고 `UI_CSP` 도 그대로다.
- 하네스 도구 연결: 이 노드에 astrondesign MCP 가 붙어 있었고 서버 cwd 는 이 저장소였다(`design_edit` 결과 `세션: D:\AstronDesign\.astron-logs\astrondesign\editor\e7f1276e0d3d`). MCP 서버 프로세스는 작업 시작 전에 뜬 것이라 `src/*.ts` 변경(보고서 토큰 가림 등)은 그 프로세스에 반영되지 않는다. 화면 파일(`src/editor/ui/*`, `src/shared/*.js`)은 요청마다 디스크에서 읽으므로 MCP 렌더에도 새 화면이 나온다. 새 서버 코드 경로는 `npm run render`(서버를 새로 띄움)로 확인했다.

## 1. 단계별 기록

### S1 요구 정리
- surface: `operate`(앱 화면). 저장소에 DESIGN.md·PRODUCT.md 가 없다. 브리프에 명시 허용이 없어 `allow` 는 비웠다.
- 요구: 중앙 캔버스(차분한 바탕), 왼쪽 레이어, 오른쪽 속성, 떠 있는 도구막대, 아트보드 이름표. 아트보드는 1440·768·390 등 폭으로 나란히, 이동(스페이스+드래그·휠)·확대축소·화면 맞춤.
- 같이 고칠 것: TODO 64cab862 6건(5절).

### S2 방향(design_search)
| 호출 | 결과 요약 | 고른 것 | 이유 |
|---|---|---|---|
| `design_search design_system:true "design tool canvas workspace"` (report `.astron-logs/astrondesign/20261108-234609-design_search-e095/report.json`) | "Product Demo + Features" 패턴, Flat Design, 청록·주황 색, Inter·Playfair Display(Google Fonts) | Flat 의 "그림자·그라디언트 최소, 150~200ms 전환, SVG 아이콘, 포커스 보임, reduced-motion" 원칙만 채택 | 패턴·색·서체는 랜딩(persuade)용이라 맞지 않는다. Google Fonts 는 외부 요청이 생겨 범위 밖(로컬 동봉만) |
| `design_search domain:color "neutral tool chrome"` (`.astron-logs/astrondesign/20261108-234610-design_search-e0a5/report.json`) | 5행. 3행 "Generative Art Platform — Canvas neutral"(#18181B·#FAFAFA·#E4E4E7·#475569) | 3행의 중성 아연(zinc) 계열을 패널·글자·선에 씀(`--ink #18181b`, `--line #e4e4e7`, `--muted #52525b`) | 디자인 도구의 캔버스 중성 색이다. 강조색은 행의 분홍 대신 기존 선택 파랑 `#0b57d0` 하나로 둔다(선택·활성 보드·눌린 도구 = 한 의미) |
| `design_search domain:ux "canvas pan zoom shortcuts"` (`.astron-logs/astrondesign/20261108-234609-design_search-43f9/report.json`) | 1건: 좁은 폭·확대에서도 글자가 잘리지 않게 | 패널·이름표·알약에 `text-overflow`, 상단 바 `min-width:0` | 390 폭에서 가로 넘침 0(CV9) |
| `design_search domain:ux "toolbar keyboard shortcut icon button"` (`.astron-logs/astrondesign/20261108-234615-design_search-01e3/report.json`) | 키보드 탐색, 보이는 포커스 | 도구 버튼마다 `aria-label`·`aria-keyshortcuts`·`title`, 모든 조작 요소 `:focus-visible` 파란 고리 | 아이콘 버튼은 글자가 없어 이름과 단축키를 따로 알려야 한다 |
| `design_guide topic=brand/figma`(읽기만) | 흑백 바탕 위 짧은 색 강조, 작은 라운드(6~8px), 8px 간격 | 6px 라운드·12/16px 간격 리듬·흑백 바탕 위 색 하나 | 디자인 도구 계열의 기준점. 브랜드 색 블록(라임·라일락)은 가져오지 않는다(P7 참고 전용) |

결정한 시각 언어(해석 한 줄씩):
- 밝은 화면: 대상 페이지가 대개 밝고, 사람이 그 위에서 색·대비를 판단하므로 바탕은 중성 회색 `#e8e9ec` 에 점 격자 `#b9bcc3` 로 한다.
- 서명(signature move): 아트보드 이름표("데스크톱 · 1440 × 900", 표 숫자)와 다른 보드의 같은 요소를 점선 상자(`.sel-ghost`)로 보이는 "한 번 고치면 모든 폭" 표시. 편집 1회 = 연산 1건이 모든 보드에 반영되는 동작을 그대로 그린다.
- 서체: 시스템 서체 목록(Pretendard 가 설치돼 있으면 사용, 내려받지 않음). 패널 13px, 이름표 12px, 숫자는 `tabular-nums`.
- 높이 표현: 떠 있는 것(도구막대·서랍·시트)은 그림자 하나 `--lift`, 테두리를 같이 쓰지 않는다(craft-floor "ghost card" 회피). 패널은 1px 선만.
- 아이콘: 직접 그린 인라인 SVG 심볼 10개(선 1.6px, 둥근 끝). 이모지·유니코드 기호를 아이콘으로 쓰지 않는다.

### S3 구현 전 읽은 것
- `impeccable/craft-floor`: 대비 4.5:1, 그림자 한 가지, 상태(hover·disabled·focus), 브라우저 표면(::selection·caret·스크롤바·포커스 고리)을 팔레트로, 아이콘은 그린 SVG, "그리드 무늬는 실제 캔버스가 있을 때만" → 점 격자는 실제 무한 캔버스 바탕이라 해당.
- `impeccable/mode-operate`: 세계관은 서체·색·밀도·서명 하나만 빌려주고, 내비게이션·컨트롤은 플랫폼 표준(버튼·토글·트리)으로 둔다 → 도구막대·패널은 표준 버튼과 `role=toolbar`·`role=tree` 를 쓴다.

### S4 검사
| 검사 | 결과 | 경로 |
|---|---|---|
| `design_lint`(ui css·html·app.js·canvas-overlay.js·props.js·comments.js, surface operate) | FAIL 0 · WARN 0 · INFO 0, surface-skipped 22(taste 규칙은 persuade 전용) | `.astron-logs/astrondesign/20261109-000943-design_lint-070a/report.json` |
| `design_render`(MCP, 편집기 `?sel=h1`, 1440·768·390) | FAIL 0 · WARN 0, 폭마다 blocked=0 | `.astron-logs/astrondesign/20261109-001233-design_render-4dd6/` |
| `design_render`(MCP, `?mode=comment&w=1440`) | FAIL 0 · WARN 0 | `.astron-logs/astrondesign/20261109-001338-design_render-b178/` |
| `npm run render -- --edit test/fixtures/editor/index.html --viewports 1440,768,390 --states "sel=h1;mode=comment;w=390&sel=h1"` | 세 상태 모두 `OK design_render: FAIL 0 · WARN 0`, `blocked=0` | `.astron-logs/after-render.log` |
| `ASTRONDESIGN_WRITE=allow npm run render -- --edit … --approve` | `OK … FAIL 0`, `blocked=0`, report.json 에 64자 hex 0건 | `.astron-logs/after-render-approve.log`, `.astron-logs/token-check.log` |
| `design_inspect` notes(`#toolbar`·`.board-label`·`.marker`·`#comment-list .actions`·`#comment-list > li`) | 5개 요소 feedback.md | `.astron-logs/astrondesign/20261109-001330-design_inspect-0757/feedback.md` |

### S5 비평(라운드별)

라운드 1 — 바뀌기 전 화면(`20261108-234548-design_render-09b2`, `20261108-234603-design_render-4e5a`)

```
DEGRADED(single-agent)
## 비평
- 대상: 편집기 ?sel=h1 · ?mode=comment · surface=operate · 폭=1440, 768, 390
- 측정: FAIL 0 · WARN 0 (conflict 0)
- 상위 3개:
	1. 390 폭에서 캔버스가 사라지고 레이어·댓글 패널만 남음 — body 3칸 grid(248px 1fr 296px) — 패널을 서랍·시트로 바꾸고 캔버스를 남김
	2. 보드가 하나씩만 보이고 폭은 상단 바 버튼으로 바꿔야 함, 바탕이 빈 회색 — #scaler·#boards — 무한 캔버스 위 아트보드를 나란히, 점 격자 바탕
	3. 도구가 상단 바 글자 버튼 줄(되돌리기·다시 하기·맞춤)에 섞여 줄바꿈 — .topbar — 떠 있는 아이콘 도구막대로 분리
- 지킬 것: 흰 패널·파란 선택 하나, 레이어 트리 동작, 대비 표시
- 사람 결정 필요: 없음
```

라운드 2 — 새 화면 첫 렌더(`20261109-001233-design_render-4dd6`, 768·390 단독 `20261109-001247-design_render-1402`·`20261109-001249-design_render-3de8`)

```
DEGRADED(single-agent)
## 비평
- 대상: 편집기 ?sel=h1 · surface=operate · 폭=1440, 768, 390
- 측정: FAIL 0 · WARN 0 (conflict 0)
- 상위 3개:
	1. 선택 표지 이름 칩(h1)이 보드 이름표("데스크톱 · 1440 × 900")를 덮음 — #sel-box .tag, 768·390 — 칩이 보드 위 이름표 자리로 올라가면 요소 아래로 내림
	2. 비활성 되돌리기·다시 하기 아이콘이 너무 옅어 버튼인지 알기 어려움(#a1a1aa) — #undo·#redo — #8b8b94 로 진하게
	3. 좁은 화면 첫 화면은 세 보드 맞춤이라 배율 12~15% — 맞춤 — 유지(작업서 "화면 맞춤" 기본). 이름표·아트보드 목록 클릭이나 Shift+2 로 활성 보드 맞춤
- 지킬 것: 점 격자와 이름표, 다른 보드 점선 표지, 투명 배경 체커
- 사람 결정 필요: 없음
```

라운드 3 — 수정 뒤(`20261109-001345-design_render-b452` 768, `20261109-001338-design_render-b178` 댓글 모드)

```
DEGRADED(single-agent)
## 비평
- 대상: 편집기 ?sel=h1(768) · ?mode=comment&w=1440 · surface=operate
- 측정: FAIL 0 · WARN 0 (conflict 0)
- 상위 3개:
	1. 칩이 요소 아래로 내려가 이름표와 겹치지 않음 — 해결
	2. 댓글 표지가 제목 글자 위 바깥에 있고 글자를 가리지 않음, 답글·해결 버튼 한 줄 — 해결(TODO 64cab862)
	3. 남은 것 없음(FAIL 0·WARN 0)
- 지킬 것: 도구막대 배치, 활성 보드 파란 외곽선
- 사람 결정 필요: 없음
```

### S6 수정
| 라운드 | 고친 것 | 파일 |
|---|---|---|
| 1 → 2 | 3칸 grid 를 작업 공간 flex + 서랍(1099px 이하)·시트(699px 이하)로, 무한 캔버스·아트보드·점 격자, 떠 있는 도구막대 | `index.html`, `editor.css`, `canvas-overlay.js`, `app.js` |
| 2 → 3 | 선택 칩 `tag-below`, 비활성 도구 색 | `canvas-overlay.js`(`TAG_H`), `editor.css` |

### S7 보고
- 측정: 최종 FAIL 0 · WARN 0 · INFO 0(lint·render 모두). 남은 conflict 없음.
- 전후 대표 스크린샷(4장):
	- 전 1440(선택): `.astron-logs/astrondesign/20261108-234548-design_render-09b2/fold-1440.jpg`
	- 전 390(댓글 모드): `.astron-logs/astrondesign/20261108-234603-design_render-4e5a/fold-390.jpg`
	- 후 1440(선택): `.astron-logs/astrondesign/20261109-001400-design_render-b491/fold-1440.jpg`
	- 후 390(선택): `.astron-logs/astrondesign/20261109-001400-design_render-b491/fold-390.jpg`
- 브라우저 시험 스크린샷: `.astron-logs/astrondesign/editor-e2e/cv3-fit-active.png`, `cv4-artboards.png`, `cv5-cross-board-select.png`, `cv9-768*.png`, `cv9-390*.png`, `cv11-four-boards.png`, `ed16-transparent.png`, `ed17-markers.png`, `ed18-actions-288.png`, `ed18-actions-390.png`

## 2. 화면 구조
| 영역 | 내용 |
|---|---|
| 상단 바(44px) | 서랍 토글(1099px 이하), 상표, 대상 이름, 열린 댓글·차단·저장 상태 알약, 원본 적용 버튼(쓰기 키가 있을 때만), 속성 토글 |
| 왼쪽(240px) | "아트보드" 목록(이름·폭 × 높이, `aria-pressed`)과 "레이어" 트리(활성 보드 문서) |
| 가운데 캔버스 | 점 격자 바탕, world 안 아트보드(`section.artboard[data-w][aria-current]`, iframe `target-<w>`), 화면 좌표 오버레이(호버·선택·점선 표지·댓글 표지), 이름표, 떠 있는 도구막대 |
| 오른쪽(288px) | 속성(편집 모드)·모든 댓글(댓글 모드) |

캔버스 조작:
| 동작 | 입력 |
|---|---|
| 이동 | 휠·트랙패드, Shift+휠(가로), 스페이스+끌기, 가운데 버튼 끌기, 손 도구(H) |
| 확대·축소 | Ctrl(⌘)+휠·핀치(커서 아래 world 좌표 고정), Ctrl+=·Ctrl+-, 도구막대(10~300%) |
| 맞춤 | 모든 보드 Ctrl+0·Shift+1·도구막대, 활성 보드 Shift+2 |
| 보드 활성 | 이름표·아트보드 목록 클릭(그 보드를 화면 가운데로), 다른 보드 요소 클릭 |
| 보드 안 스크롤 | Alt+휠 |
| 도구 | V 편집, C 댓글, H 손. 입력칸·버튼에 포커스가 있으면 V·C·H·스페이스는 원래 동작 |

## 3. 결정과 근거
- 보드 높이는 고정 높이 표(`src/shared/boards.js`)를 쓴다. 전체 페이지 높이로 늘리면 iframe 높이가 바뀔 때마다 `vh` 단위가 다시 계산돼 페이지 높이가 계속 변한다. 같은 표를 design_render·design_export 도 쓴다(전에는 export 쪽 표가 3폭만 있어 어긋났다).
- 편집 1회 = 연산 1건. 활성 보드에서 만든 연산을 다른 보드에는 화면에만 반영하고 기록·저장은 한 번만 한다. 경로·태그가 맞지 않는 보드(폭마다 DOM 이 다른 대상)는 건너뛴다(CV12).
- 처음 화면은 모든 보드 맞춤(최대 100%)이다. `?w=` 로 연 경우만 그 보드를 맞춘다. 잘못된 `?w=`(숫자 아님·320 미만·2560 초과)는 첫 보드다.
- 차단 수: 보드마다 같은 외부 자원을 요청하므로 CSP 위반 보고는 같은 주소를 한 번만 센다(`src/editor/work-server.ts` `api`).
- 엔진 어댑터 자리: `canvas-overlay.js` 하나(`createCanvas`). 인터페이스는 `setBoards·activate·focusBoard·fitAll·fit·setZoom·zoomIn·zoomOut·select·redraw·setMode·setTool·setSpace·setMarkers·view`.

## 4. 시험
| 시험 | 내용 |
|---|---|
| `test/browser/canvas.test.ts` CV1~CV14 | 이동·확대축소 한도·맞춤·아트보드 배치와 활성 전환·보드 간 선택 연동·모든 보드 반영·단축키 포커스 규칙·점 격자·반응형 서랍·외부 요청 0·보드 1개/4개·폭별 DOM·승인 뒤 보기 유지·창 크기 변경 |
| `test/browser/editor.test.ts` ED1~ED14·AP9(활성 보드 기준으로 갱신), ED15~ED18 | 토큰 가림, 투명 표시, 마커 위치, 답글 버튼 한 줄 |
| `test/unit/boards.test.ts` BD1, `test/unit/output.test.ts` OU1 | 보드 높이 표 경계, `redactSecrets`·`writeReport` |

## 5. TODO 64cab862 처리
| 항목 | 원인 | 처리 | 확인 |
|---|---|---|---|
| 투명 배경 색칸이 검정 | `props.js` `toHex` 가 알파를 버려 `rgba(0,0,0,0)` → `#000000` | `toColor` 가 `{hex, alpha}` 를 돌려주고, 알파 0 은 체커 + "투명", 0~1 은 체커 위 반투명 색 + "투명도 n%"(`aria-describedby`). 색을 고르면 표시를 지운다 | ED16 |
| 댓글 마커가 글자를 가림 | `.marker` 가 요소 왼쪽 위 모서리에 가운데를 맞춤(`margin:-12px`) | 꼬리(왼쪽 아래 각진 모서리)를 요소·글자 상자 중 더 위쪽 끝에 대고 몸통은 바깥 위로. 캔버스 밖이면 안쪽으로 붙임 | ED17 |
| 답글·해결 버튼 세로 줄바꿈 | `.reply-row` 의 input `flex:1`, 버튼 nowrap 없음 | 답글 입력은 한 줄 전체, 그 아래 `.actions` 줄에 버튼(`white-space:nowrap; flex:none`) | ED18 |
| report.json 승인 토큰 평문 | render·inspect·export 가 `args`·`url` 을 그대로 기록 | `src/output.ts` `redactSecrets`·`writeReport`(64자 hex 해시, `/__astron/(api/)32hex` → `<redacted>`). dom.html·aria·feedback.md 도 가림. 도구 결과 글은 그대로 | OU1, ED15, `.astron-logs/token-check.log` |
| 사양서 7절 번호(R2) | G1 비고 "(4.2절)" 은 쓰기 분리 절이 4.3절, G3 비고 "근거 4.1절" 은 미채택 결정이 4.2절 | G1 → 4.3절, G3 → 4.2절 | 문서 |
| 안내서 내보내기 폭(R3) | `design_export` 가 폭 인자 없이 세션 보드 폭을 쓰는데 안내서에 없음 | `guides/editor.md` 내보내기 절과 사양서 5.5절에 "폭은 편집기 세션의 보드 폭, 세션이 없으면 1440·768·390, 높이는 보드 높이 표" 추가 | 문서 |

## 6. 남은 것
- MCP 서버 프로세스를 다시 시작해야 그 프로세스의 report.json 에도 토큰 가림이 적용된다(작업 중에 뜬 서버는 옛 코드).
- 터치 두 손가락 핀치·이동은 넣지 않았다(손 도구 한 손가락 끌기와 트랙패드 핀치만).
- 좁은 화면 첫 배율이 낮다(390 폭에서 약 12%). 의도한 기본(모두 맞춤)이고 Shift+2·이름표로 활성 보드를 맞춘다.
