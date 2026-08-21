[PLAN r3]

웨이브를 6건 이하로 쪼갤 수 없는 이유 — T2~T20 과 GATE Q3 로 편입된 T23·T24 가 sync→async 라는 단일 계약 변경을 공유해서 프로토콜(워커·러너)·상태 머신(레지스트리·라우트)·화면(폴링)·삭제 정리가 같은 릴리스 안에서 동시에 성립해야 하고, 로드맵 19건을 파일 소유권 단위로 최대한 병합한 결과가 11건이다. 라운드 1·2와 태스크 집합·개수는 동일하며 이번 라운드는 `[RED r2]` 블로커 1건 + 노트 5건 해소만 반영한다.

## red_response

`[RED r2]` 블로커 1건 전부, 노트 5건 전부 반영. 자식 이슈 11건 전부 재사용(신설·폐기 0). 실질 편집 6건(OW-201·204·206·207·209·210), 나머지 5건 무수정. 6건 전부 Linear 왕복 대조(`cmp`) 바이트 일치 확인.

| 항목 | 조치 | 검증 |
|---|---|---|
| B1 `tests/remote-worker-contract.test.ts` 의 `colab` 3건에 계측 판정 부재 | (1) OW-201 전제조건에 기대 3 검사를 넣고, 2-2 검증 블록을 "두 명령 모두 완료 판정" 으로 바꿔 `grep -ci colab tests/remote-worker-contract.test.ts` 기대 `0` / `exit=1` 을 완료 판정에 넣었다. (2) OW-209 `## 3` 첫 목록에서 이 파일을 빼고 `### 조건부 대상` 절을 신설했다 — `git grep -Ilc -i -- colab` 출력에 없으면 무수정, 남아 있으면 잔여 식별자만 마무리. 2-2 "정본" 규칙에 같은 예외를 명시하고 전제조건에 기대 `0` / `exit=1` 검사를 추가했다. dispatch table 은 OW-209 `target_files` 에 이 경로를 `write: true` 로 추가했다 | 편집 전 `grep -ci colab tests/remote-worker-contract.test.ts` = 3, 종료 0 (35·39·40행, 전부 `colab_runtime_versions` 참조). 소유 사슬 `OW-201 → OW-208 → OW-209 → OW-210` 이행 폐포로 정렬돼 순서 없는 공유-쓰기 쌍 0건 유지 |
| N1 OW-204 45행 앵커 미승격 | 45행 문자열을 전제조건 `grep -cF` 기대 1 로 등재하고 dispatch table `anchors` · `## new_anchors` 에 승격. 2-1 에 교체쌍을 추가하고 두 줄이 서로 다른 함수(`actionLabelFor` / `statusCopyFor`)임을 명시 | `grep -ni colab components/image-processor.tsx` = 45행 `case "running": return "Colab GPU에서 처리 중입니다";` · 57행 상태 카피. `grep -cF` 각 1, 종료 0 |
| N2 OW-206 폐기 환경변수 잔재에 검사 부재 | 2-5·2-6 완료 판정에 `grep -cE 'IMAGEWORK_(HF_TOKEN\|JOB_SCRIPT\|RECOVERY_ROOT\|GOOGLE_APPLICATION_CREDENTIALS)'` 기대 `0` / `exit=1` 을 파일별로 1줄씩 추가 | 현재값 `docs/server-worker.md` 5, `README.md` 1 — 둘 다 이름에 `colab` 이 없어 기존 검사만으로는 통과함을 재현 |
| N3 OW-210 `## 3` 두 하위 절 상충 | 조건부 허용 문구를 삭제하고 첫 목록으로 통일했다 — 검사 실패가 `target_files` 밖을 지목하면 고치지 말고 `--outcome failed` 로 보고 | 해당 경로군은 OW-210 `target_files` 19건 어디에도 없음(표 재파싱으로 확인) |
| N4 OW-207 0단계가 락 2종만 대조 | "락 파일 3종(`sam3-local-requirements.lock`, `sam3-local-build-requirements.lock`, `vtracer-Cargo.lock`)" 으로 문구를 맞추고 3단계가 그 파일을 쓰는 사실을 근거로 적었다 | `test -e runner/vtracer-Cargo.lock` 종료 0, 22392 bytes |
| N5 OW-209 픽스처 예시 이름 | 2-4 예시를 `archive` → `legacy` 로 바꾸고 `archive/archive.ipynb` 가 되는 이유를 적었다. 2-3 에 `(?:colab\/)?` 가 선행 `(?:^\|\/)` 대안과 중복이라 검출 동작 불변임을 명시 | 동작 무영향 — 문구·가독성 조치 |

`[RED r2]` A1 의 설계문서 L227 인용 정밀도 지적은 RED 자신이 "재차 블로커로 올리지 않는다" 로 종결해 계획을 바꾸지 않았다. A2 부수 관측 2건(OW-206 2-2·2-6)은 스펙 산문이 개수를 명기하고 RED 측정값과 일치해 무조치다.

## requirement_map

`[ANALYZE]` 25항 + `[GATE]` 26·27항 전부 매핑. 라운드 1·2와 동일하다.

```
1 → OW-200        2 → OW-200        3 → OW-201        4 → OW-201
5 → OW-201        6 → OW-201        7 → OW-201        8 → OW-201
9 → OW-202       10 → OW-202       11 → OW-203       12 → OW-203
13 → OW-203      14 → OW-203 · OW-210             15 → OW-204
16 → OW-203      17 → OW-206       18 → OW-207      19 → OW-206
20 → OW-206      21 → OW-206       22 → OW-208
23 → OW-201 · OW-208 · OW-209 · OW-210            24 → OW-205 · OW-210
25 → OW-210      26 → OW-202 · OW-203              27 → OW-204 · OW-209
```

GATE 확정 답변 5건도 전부 태스크로 내려갔다 — Q1(A) → OW-201·OW-207 의 `py_compile` / `bash -n` 판정, Q2(C) → OW-200, Q3 T23·T24 편입 → OW-202·OW-203·OW-204·OW-209, Q4(A) → OW-208·OW-209, Q5(B) 120s·400 고정 + burst·드라이버 임계값 위임 → OW-206·OW-207.

제공요건 23(`git grep -ri colab` 0건)의 소유 사슬이 이번 라운드에 바뀌었다 — 라운드 2까지는 OW-208·OW-209·OW-210 3건이었고, B1 해소로 OW-201 이 `tests/remote-worker-contract.test.ts` 0건의 1차 소유자로, OW-209 가 조건부 마무리 소유자로 추가돼 4건 사슬이 됐다.

## dispatch table

```json
{
  "wave": "OW-199",
  "tasks": [
    {"id": "OW-200", "title": "로컬 해시 락 2종 + 해시 게이트 + LOCKS.md", "model": "sonnet",
     "deps": [],
     "target_files": [{"path": "runner/sam3-local-requirements.lock", "write": true}, {"path": "runner/sam3-local-build-requirements.lock", "write": true}, {"path": "runner/LOCKS.md", "write": true}, {"path": "runner/sam3-requirements.lock", "write": false}, {"path": "runner/sam3-build-requirements.lock", "write": false}, {"path": "runner/vtracer-Cargo.lock", "write": false}, {"path": "runner/remote-worker.py", "write": false}],
     "anchors": ["sam3-requirements.lock"],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-201", "title": "runner/local-worker.py 신규 + contract 테스트 승계", "model": "sonnet",
     "deps": ["OW-200"],
     "target_files": [{"path": "runner/local-worker.py", "write": true}, {"path": "tests/remote-worker-contract.test.ts", "write": true}, {"path": "runner/remote-worker.py", "write": false}, {"path": "runner/sam3-local-requirements.lock", "write": false}, {"path": "runner/sam3-local-build-requirements.lock", "write": false}, {"path": "runner/vtracer-Cargo.lock", "write": false}],
     "anchors": ["def run_inference(job_root: Path) -> None:", "const workerPath = resolve(process.cwd(), \"runner/remote-worker.py\");"],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-202", "title": "레지스트리 상태 머신 + lib/local-job-runner.ts", "model": "sonnet",
     "deps": [],
     "target_files": [{"path": "lib/process-job-registry.ts", "write": true}, {"path": "lib/local-job-runner.ts", "write": true}, {"path": "lib/colab-job-runner.ts", "write": false}, {"path": "lib/colab-errors.ts", "write": false}, {"path": "lib/colab-input.ts", "write": false}, {"path": "lib/zip-contract.ts", "write": false}, {"path": "lib/output-format.ts", "write": false}],
     "anchors": ["export class ProcessJobRegistry {", "local-job-runner"],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-203", "title": "비동기 API 라우트 4종 + 에러 문구", "model": "sonnet",
     "deps": ["OW-202"],
     "target_files": [{"path": "app/api/process/route.ts", "write": true}, {"path": "app/api/process/status/route.ts", "write": true}, {"path": "app/api/process/result/route.ts", "write": true}, {"path": "app/api/process/cancel/route.ts", "write": true}, {"path": "lib/colab-errors.ts", "write": true}, {"path": "lib/local-job-runner.ts", "write": false}, {"path": "lib/process-job-registry.ts", "write": false}, {"path": "lib/colab-input.ts", "write": false}, {"path": "lib/output-format.ts", "write": false}],
     "anchors": ["const result = await runnerProvider().run(input, AbortSignal.any([jobSignal, request.signal]));", "import { ColabJobRunner, matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from \"@/lib/colab-job-runner\";", "import { matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from \"@/lib/colab-job-runner\";", "super(\"The client cancelled the Colab job.\");", "super(\"The Colab job exceeded its allowed time.\");", "super(\"The Colab command did not complete.\");"],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-204", "title": "프런트 폴링 재작성 + Colab 카피 제거", "model": "sonnet",
     "deps": ["OW-203"],
     "target_files": [{"path": "components/image-processor.tsx", "write": true}, {"path": "app/page.tsx", "write": true}, {"path": "DESIGN.md", "write": false}],
     "anchors": ["case \"running\": return \"전용 Colab GPU 작업자가 이미지를 처리하고 있습니다. 이 창을 닫지 마세요.\";", "case \"running\": return \"Colab GPU에서 처리 중입니다\";", "전용 Colab GPU 작업자가 결과를 만든 뒤 브라우저로 다운로드합니다.", "type JobState ="],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-205", "title": "테스트 전면 갱신", "model": "sonnet",
     "deps": ["OW-202", "OW-203", "OW-204"],
     "target_files": [{"path": "tests/local-job-runner.test.ts", "write": true}, {"path": "tests/process-job-registry.test.ts", "write": true}, {"path": "tests/process-async-api.test.ts", "write": true}, {"path": "tests/image-processor.test.tsx", "write": true}, {"path": "tests/process-cancel.test.ts", "write": true}, {"path": "lib/local-job-runner.ts", "write": false}, {"path": "lib/process-job-registry.ts", "write": false}, {"path": "app/api/process/route.ts", "write": false}, {"path": "app/api/process/status/route.ts", "write": false}, {"path": "app/api/process/result/route.ts", "write": false}, {"path": "app/api/process/cancel/route.ts", "write": false}, {"path": "components/image-processor.tsx", "write": false}],
     "anchors": ["createCancelHandler", "import { ImageProcessor } from \"../components/image-processor\";"],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-206", "title": ".env.example + deploy 2종 + 문서 4종", "model": "sonnet",
     "deps": [],
     "target_files": [{"path": ".env.example", "write": true}, {"path": "deploy/nginx.conf.example", "write": true}, {"path": "deploy/imagework.service.example", "write": true}, {"path": "docs/server-worker.md", "write": true}, {"path": "docs/reverse-proxy.md", "write": true}, {"path": "README.md", "write": true}, {"path": "CLAUDE.md", "write": true}],
     "anchors": ["IMAGEWORK_RECOVERY_ROOT", "proxy_read_timeout 7350s;", "proxy_read_timeout 7350s", "## 2. Configure Google Colab CLI authentication", "check:colab-notebook"],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-207", "title": "provision-worker.sh 신설", "model": "sonnet",
     "deps": ["OW-200", "OW-201"],
     "target_files": [{"path": "scripts/provision-worker.sh", "write": true}, {"path": "runner/sam3-local-requirements.lock", "write": false}, {"path": "runner/sam3-local-build-requirements.lock", "write": false}, {"path": "runner/vtracer-Cargo.lock", "write": false}, {"path": "runner/LOCKS.md", "write": false}],
     "anchors": ["sam3-local-requirements.lock"],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-208", "title": "Colab 자산 삭제 + package.json/.gitignore", "model": "haiku",
     "deps": ["OW-200", "OW-201", "OW-202", "OW-203", "OW-204", "OW-205", "OW-206", "OW-207"],
     "target_files": [{"path": "lib/colab-job-runner.ts", "write": true}, {"path": "colab/imagework.ipynb", "write": true}, {"path": "scripts/check-colab-notebook.mjs", "write": true}, {"path": "tests/colab-job-runner.test.ts", "write": true}, {"path": "runner/remote-worker.py", "write": true}, {"path": "runner/sam3-requirements.lock", "write": true}, {"path": "runner/sam3-build-requirements.lock", "write": true}, {"path": "docs/colab-results.md", "write": true}, {"path": "package.json", "write": true}, {"path": ".gitignore", "write": true}],
     "anchors": ["\"check:colab-notebook\": \"node scripts/check-colab-notebook.mjs\",", "# generated Colab artifacts (the canonical notebook and results template are intended for tracking)"],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-209", "title": "잔여 colab 식별자 전수 제거", "model": "sonnet",
     "deps": ["OW-208"],
     "target_files": [{"path": "lib/colab-errors.ts", "write": true}, {"path": "lib/colab-input.ts", "write": true}, {"path": "lib/job-errors.ts", "write": true}, {"path": "lib/image-input.ts", "write": true}, {"path": "lib/zip-contract.ts", "write": true}, {"path": "lib/process-job-registry.ts", "write": true}, {"path": "lib/local-job-runner.ts", "write": true}, {"path": "app/api/process/route.ts", "write": true}, {"path": "app/api/process/status/route.ts", "write": true}, {"path": "app/api/process/result/route.ts", "write": true}, {"path": "app/api/process/cancel/route.ts", "write": true}, {"path": "scripts/check-public-artifacts.mjs", "write": true}, {"path": "tests/check-public-artifacts.test.ts", "write": true}, {"path": "tests/process-cancel.test.ts", "write": true}, {"path": "tests/image-processor.test.tsx", "write": true}, {"path": "tests/local-job-runner.test.ts", "write": true}, {"path": "tests/process-job-registry.test.ts", "write": true}, {"path": "tests/process-async-api.test.ts", "write": true}, {"path": "tests/remote-worker-contract.test.ts", "write": true}, {"path": "CLAUDE.md", "write": true}],
     "anchors": ["import type { AssetMode } from \"./colab-input\";", "import { ResultContractError } from \"./colab-errors\";", "import { ImageworkInputError } from \"./colab-errors\";", "colab\\/"],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-210", "title": "최종 체크 세트 실행", "model": "sonnet",
     "deps": ["OW-209"],
     "target_files": [{"path": "package.json", "write": false}, {"path": "tests/local-job-runner.test.ts", "write": true}, {"path": "tests/process-job-registry.test.ts", "write": true}, {"path": "tests/process-async-api.test.ts", "write": true}, {"path": "tests/image-processor.test.tsx", "write": true}, {"path": "tests/process-cancel.test.ts", "write": true}, {"path": "tests/remote-worker-contract.test.ts", "write": true}, {"path": "tests/check-public-artifacts.test.ts", "write": true}, {"path": "lib/local-job-runner.ts", "write": true}, {"path": "lib/process-job-registry.ts", "write": true}, {"path": "lib/job-errors.ts", "write": true}, {"path": "lib/image-input.ts", "write": true}, {"path": "lib/zip-contract.ts", "write": true}, {"path": "app/api/process/route.ts", "write": true}, {"path": "app/api/process/status/route.ts", "write": true}, {"path": "app/api/process/result/route.ts", "write": true}, {"path": "app/api/process/cancel/route.ts", "write": true}, {"path": "components/image-processor.tsx", "write": true}, {"path": "app/page.tsx", "write": true}],
     "anchors": ["\"check:public-artifacts\": \"node scripts/check-public-artifacts.mjs\""],
     "irreversible": false, "skills": [], "strict_mcp": true}
  ]
}
```

## new_anchors

`[ANALYZE]` 의 `anchor_candidates` 에 없던 앵커 전량. 측정은 `grep -cF -- '<s>' <file>`, 커밋 `7b3e205`, 트리 clean. 라운드 3 신규 승격 1건은 `(r3)` 표시.

```
sam3-requirements.lock — 3 — runner/LOCKS.md
sam3-local-requirements.lock — 0 (종료 1) — runner/LOCKS.md (신규 도입 대상, OW-200 이 생성)
def run_inference(job_root: Path) -> None: — 1 — runner/remote-worker.py
const workerPath = resolve(process.cwd(), "runner/remote-worker.py"); — 1 — tests/remote-worker-contract.test.ts
export class ProcessJobRegistry { — 1 — lib/process-job-registry.ts
const result = await runnerProvider().run(input, AbortSignal.any([jobSignal, request.signal])); — 1 — app/api/process/route.ts
import { ColabJobRunner, matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner"; — 1 — app/api/process/route.ts
import { matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner"; — 1 — app/api/process/cancel/route.ts
super("The client cancelled the Colab job."); — 1 — lib/colab-errors.ts
super("The Colab job exceeded its allowed time."); — 1 — lib/colab-errors.ts
super("The Colab command did not complete."); — 1 — lib/colab-errors.ts
type JobState = — 1 — components/image-processor.tsx
case "running": return "전용 Colab GPU 작업자가 이미지를 처리하고 있습니다. 이 창을 닫지 마세요."; — 1 — components/image-processor.tsx
case "running": return "Colab GPU에서 처리 중입니다"; — 1 — components/image-processor.tsx (r3)
전용 Colab GPU 작업자가 결과를 만든 뒤 브라우저로 다운로드합니다. — 1 — app/page.tsx
import { ImageProcessor } from "../components/image-processor"; — 1 — tests/image-processor.test.tsx
proxy_read_timeout 7350s; — 1 — deploy/nginx.conf.example
proxy_read_timeout 7350s — 1 — docs/reverse-proxy.md
## 2. Configure Google Colab CLI authentication — 1 — docs/server-worker.md
"check:colab-notebook": "node scripts/check-colab-notebook.mjs", — 1 — package.json
"check:public-artifacts": "node scripts/check-public-artifacts.mjs" — 1 — package.json
# generated Colab artifacts (the canonical notebook and results template are intended for tracking) — 1 — .gitignore
import type { AssetMode } from "./colab-input"; — 1 — lib/zip-contract.ts
import { ResultContractError } from "./colab-errors"; — 1 — lib/zip-contract.ts
import { ImageworkInputError } from "./colab-errors"; — 1 — lib/colab-input.ts
colab\/ — 1 — scripts/check-public-artifacts.mjs
```

`local-job-runner`(0건) · `check:colab-notebook` · `createCancelHandler` · `IMAGEWORK_RECOVERY_ROOT` 는 `anchor_candidates` 에 이미 있어 여기 적지 않는다.

## source_reads

라운드 1·2 목록 + 라운드 3 신규 열람(`(r3)`).

```
components/image-processor.tsx — JobState 유니온과 Colab 카피 2건 위치 확인. r3: 45행이 actionLabelFor, 57행이 statusCopyFor 로 서로 다른 함수임을 sed 로 확인 (N1)
tests/remote-worker-contract.test.ts — 승계·폐기 어서션 구분, vtracer-Cargo.lock 참조 1건. r3: colab 3건이 35·39·40행 colab_runtime_versions 어서션임을 grep -ni 로 확인 (B1)
docs/server-worker.md — r3: 폐기 환경변수 4종 잔재 5건 계수 (N2) (grep only)
README.md — r3: 같은 잔재 1건 계수 (N2) (grep only)
lib/colab-errors.ts — 교체할 Colab 메시지 3건 확인
lib/colab-input.ts — 자기 자신의 ./colab-errors 임포트 줄 확인
lib/process-job-registry.ts — 상태 머신 확장 앵커와 보존할 pending-cancellation 범위 확인
app/api/process/route.ts — AbortSignal.any 결합 위치와 핸들러 팩토리 시그니처 확인
app/api/process/cancel/route.ts — 유지할 취소 계약과 교체할 import 확인
package.json — check:colab-notebook 항목의 정확한 줄 확인
runner/LOCKS.md — 락 3종 목록과 iopath 소스 전용 배포 서술 확인
runner/vtracer-Cargo.lock — 존재 확인만 (test -e)
deploy/nginx.conf.example — 7350s 타임아웃과 client_max_body_size 위치 확인
docs/reverse-proxy.md — colab·2×30·7350·7200 히트수 측정
.env.example — 변수 목록 대조
lib/colab-job-runner.ts — export 이름 4종과 환경 변수 zod 스키마 확인 (grep only)
app/page.tsx — Colab 문구 1건 확인 (grep only)
scripts/check-public-artifacts.mjs — 정규식 안의 colab 그룹 확인 (grep only)
.gitignore — colab 블록 경계 확인 (grep only)
runner/remote-worker.py — 이식 원본 함수·상수 이름, SAM3_SHA256 유일 보유 파일 확인 (grep only)
~/.gstack/projects/taeseong-ryaniee-imagework/taeseongyi-main-design-20260720-182557.md — D18~D22·D28~D41·프로비저닝 0~7단계 계약 전문
~/.gstack/projects/taeseong-ryaniee-imagework/tasks-eng-review-20260721-095918.jsonl — T1~T20 정의와 files 목록 (run_id 20260721T005918Z-89757 일치 확인)
```

## refutations

라운드 1·2에서 세운 반박 5건 전부 이번 계획에도 그대로 유효하다. 라운드 3에서 새로 세운 반박은 없다.

```
ls docs/ | wc -l — 3 — [ANALYZE] target_state 의 "docs/ (디렉터리) | 존재 | 2개 파일" 을 반박. 실제는 colab-results.md · reverse-proxy.md · server-worker.md 3개다. colab-results.md 는 로드맵 어느 태스크의 files 에도 없어 무주공산이었으므로 OW-208 삭제 목록에 편입하고, 이를 참조하는 README.md 링크 2건 제거를 OW-206 에 넣었다.

D=$(mktemp -d); git check-ignore -v -- "$D" — fatal: ... is outside repository at '/Users/taeseongyi/Desktop/GitHub/imagework' (종료 128) — [ANALYZE] non_git_paths 의 "(none)" 을 반박. OW-200 2-3 의 해시 게이트가 저장소 밖 임시 디렉터리에 pip download 산출물을 내려받으므로 이 웨이브에는 비-git 경로가 1건 존재한다. 라운드 2에서 고정 경로를 mktemp -d 산출 경로로 바꾸고 rm -rf 대상을 그 디렉터리 하나로 한정했다.

git grep -Ilc -i -- colab | grep -v -E '^(colab/imagework\.ipynb|lib/colab-job-runner\.ts|scripts/check-colab-notebook\.mjs|tests/colab-job-runner\.test\.ts|runner/remote-worker\.py|runner/sam3-requirements\.lock|docs/colab-results\.md)$' — 19개 파일(.env.example .gitignore CLAUDE.md README.md app/api/process/cancel/route.ts app/api/process/route.ts app/page.tsx components/image-processor.tsx docs/server-worker.md lib/colab-errors.ts lib/colab-input.ts lib/process-job-registry.ts lib/zip-contract.ts package.json runner/LOCKS.md scripts/check-public-artifacts.mjs tests/check-public-artifacts.test.ts tests/process-cancel.test.ts tests/remote-worker-contract.test.ts) — [GATE] Q4 (A) 의 "git grep -ri colab 0건 달성" 을 반박. (A) 가 열거한 삭제 집합만으로는 19개 파일이 남고, 그 중 lib/colab-errors.ts · lib/colab-input.ts 는 파일명 자체와 16곳의 import 경로다. 0건은 두 모듈 rename 없이 도달 불가이므로 OW-209 를 신설했다. 이 rename 은 설계 문서의 "lib/colab-errors.ts 파일명 유지" 및 "lib/zip-contract.ts 무수정 재사용" 서술과 충돌하므로 OW-209 스펙에서 zip-contract.ts 변경을 import 2줄로 못박았다. 목록 마지막 tests/remote-worker-contract.test.ts 가 라운드 3 블로커 B1 대상이다.

grep -cF -- 'iopath==0.1.10' runner/sam3-requirements.lock — 1 — [GATE] Q2 (C) 의 단일 게이트 명령(pip download --require-hashes --only-binary=:all: --platform manylinux_2_28_x86_64 --python-version 3.12)을 반박. iopath 0.1.10 은 소스 배포만 발행해 --only-binary=:all: 로 받히지 않는다. OW-200 에서 게이트를 2단계로 분해했다 — iopath 제외 사본으로 크로스플랫폼 종료 0 확보 + iopath 는 --platform 없이 --no-binary=:all: 로 해시 확인.

grep -n -F -- 'iopath 0.1.10' runner/LOCKS.md — 24:metadata. iopath 0.1.10 publishes only a source distribution; its exact — [GATE] Q4 (A) 의 sam3-build-requirements.lock 삭제를 부분 반박. 빌드 툴 락은 소스 전용 iopath 를 --no-build-isolation 으로 설치하기 위한 선행 계약이라 로컬 전환 후에도 살아 있다. 옛 파일 삭제는 유지하되 로컬 대응물 runner/sam3-local-build-requirements.lock 신설을 OW-200 에, 2단계 설치 순서를 OW-207 1단계에 넣었다.
```