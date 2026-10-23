# MCP 클라이언트 연동

AstronDesign 은 stdio MCP 서버 하나(`astrondesign`)입니다. MCP 를 지원하는 클라이언트라면 같은 방식으로 등록합니다. 아래 예시의 `<설치 경로>` 는 이 저장소를 받은 폴더, `<python 경로>` 는 Python 3.9 이상 실행 파일로 바꿔 쓰십시오.

## 1. 등록 전 확인

```powershell
cd <설치 경로>
npm ci            # 저장소 안에만 설치(.npmrc: save-exact, ignore-scripts)
npm run smoke     # initialize → tools/list → design_guide, 마지막 줄 OK
```

- Node 22.18 이상이어야 `.ts` 를 빌드 없이 바로 실행합니다(Node 24 권장).
- 브라우저는 playwright 기본 위치(`%LOCALAPPDATA%\ms-playwright`)의 chromium headless shell 을 씁니다. 없으면 `ASTRONDESIGN_BROWSER` 경로, 그다음 설치된 Edge 순서로 찾습니다. 하네스가 브라우저를 내려받지는 않습니다.

## 2. 등록 값

| 항목 | 값 |
|---|---|
| 이름 | `astrondesign` |
| 전송 | stdio |
| command | `node` (또는 node 실행 파일 절대 경로) |
| args | `["<설치 경로>/src/server.ts"]` |
| cwd | 지정하지 않음. 클라이언트가 작업 중인 프로젝트 폴더에서 띄우게 둡니다 |
| 도구 호출 제한 시간 | 180초 권장 |

- 서버는 시작 위치(cwd)를 작업 루트로 씁니다. 렌더·검사 대상 경로는 이 폴더 안이어야 하고, 산출물은 `<cwd>/.astron-logs/astrondesign/` 에 쌓입니다.
- 180초 근거: design_render 는 폭 3개 × (페이지 로드 최대 30초 + 정착 2초 + 스크롤 최대 11화면 × 0.65초) ≈ 최대 100초가 걸립니다.

## 3. Claude Code

명령으로 등록합니다(`--scope user` 는 모든 프로젝트에서 쓰기, 생략하면 현재 프로젝트 전용).

```powershell
claude mcp add astrondesign --scope user `
	-e ASTRONDESIGN_NETWORK=off `
	-e ASTRONDESIGN_PYTHON="<python 경로>" `
	-- node "<설치 경로>/src/server.ts"
```

프로젝트에 함께 두려면 루트의 `.mcp.json` 에 적습니다.

```json
{
	"mcpServers": {
		"astrondesign": {
			"type": "stdio",
			"command": "node",
			"args": ["<설치 경로>/src/server.ts"],
			"env": {
				"ASTRONDESIGN_NETWORK": "off",
				"ASTRONDESIGN_PYTHON": "<python 경로>"
			}
		}
	}
}
```

등록 뒤 세션 안에서 `/mcp` 로 연결 상태와 도구 6개를 확인합니다.

## 4. Codex

`~/.codex/config.toml` 에 적습니다.

```toml
[mcp_servers.astrondesign]
command = "node"
args = ["<설치 경로>/src/server.ts"]
startup_timeout_sec = 20
tool_timeout_sec = 180

[mcp_servers.astrondesign.env]
ASTRONDESIGN_NETWORK = "off"
ASTRONDESIGN_PYTHON = "<python 경로>"
```

## 5. 환경 변수

| 이름 | 기본 | 뜻 |
|---|---|---|
| `ASTRONDESIGN_OUT_DIR` | `<cwd>/.astron-logs/astrondesign` | 산출 루트(절대 경로) |
| `ASTRONDESIGN_NETWORK` | `off` | `allow` 이고 호출 인자 `allow_network:true` 일 때만 외부 요청 허용 |
| `ASTRONDESIGN_PYTHON` | `python` | UI UX Pro Max 검색(design_search)에 쓸 python |
| `ASTRONDESIGN_BROWSER` | — | 브라우저 실행 파일(1순위) |
| `ASTRONDESIGN_IDLE_MS` | `120000` | 마지막 호출 뒤 브라우저를 닫기까지의 시간(ms) |

- 하위 프로세스(impeccable 엔진·python 검색기)에는 텔레메트리 끄기(`DO_NOT_TRACK=1`, `IMPECCABLE_NO_TELEMETRY=1`, `IMPECCABLE_NO_UPDATE_CHECK=1`)와 프록시 차단이 서버 쪽에서 늘 적용되므로 등록 값에 따로 넣지 않아도 됩니다.
- 외부 URL 을 렌더하려면 두 조건이 모두 필요합니다: 등록 env `ASTRONDESIGN_NETWORK=allow`, 호출 인자 `allow_network: true`.

## 6. 에이전트 지시 예시

디자인 작업을 맡기는 에이전트의 지시문에 한 줄을 넣으면 흐름이 고정됩니다.

> 디자인 작업은 먼저 astrondesign 의 `design_guide` 를 topic 없이 부르고, 그 작업 흐름(S1~S7)과 충돌 우선순위(P0~P7)를 따르십시오.

- 도구 정의는 약 1.2k 토큰입니다. 디자인 작업을 하는 에이전트에만 붙이는 편이 좋습니다.
- 서버 하나가 브라우저 하나를 띄웁니다. 동시에 도는 디자인 에이전트는 2개 이하를 권장합니다.

## 7. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| `E_BROWSER_UNAVAILABLE` | chromium headless shell 설치 여부, `ASTRONDESIGN_BROWSER` 경로, Edge 설치 여부 |
| `E_NETWORK_DISABLED` | 외부 URL 대상이면 env `ASTRONDESIGN_NETWORK=allow` 와 인자 `allow_network:true` 를 함께 |
| design_search 실패 | `ASTRONDESIGN_PYTHON` 이 Python 3.9 이상을 가리키는지 |
| 대상 경로 오류 | 대상 파일이 서버 cwd(작업 중인 프로젝트 폴더) 안에 있는지 |
| 호출 시간 초과 | 클라이언트의 도구 호출 제한 시간이 180초 이상인지 |
