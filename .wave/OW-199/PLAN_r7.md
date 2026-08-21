[PLAN r7]

웨이브를 6건 이하로 쪼갤 수 없는 이유 — T2~T20 과 GATE Q3 로 편입된 T23·T24 가 sync→async 라는 단일 계약 변경을 공유해서 프로토콜(워커·러너)·상태 머신(레지스트리·라우트)·화면(폴링)·삭제 정리가 같은 릴리스 안에서 동시에 성립해야 하고, 로드맵 19건을 파일 소유권 단위로 최대한 병합한 결과가 11건이다. 라운드 1~6과 태스크 집합·개수는 동일하며(신설·폐기 0), 이번 라운드는 `[RED r6]` 의 블로커 1건 + 노트 5건 해소만 반영한다.

이 라운드의 코멘트는 2건이고, **분할 지점이 라운드 6과 다르다** — 본 코멘트가 dispatch table 과 `## new_anchors` 를 담고, `## source_reads` · `## refutations` · `## red_response` · `## requirement_map` 네 절이 바로 다음 코멘트 `[PLAN r7 cont.1]` 에 계약 순서대로 들어 있다. `## new_anchors` 를 25건에서 33건으로 정정하면서(`[RED r6]` 노트 1) 본 코멘트가 Linear 코멘트 1건의 저장 상한(20000자)을 넘어, 계약이 정한 절 경계에서 다시 잘랐다. 세 필수 절은 하나도 빠지지 않았고 순서도 그대로다.

기준선 — 커밋 `7b3e205`, `git status --porcelain` 무출력, 소스 무편집. 이번 라운드에 description 을 고친 이슈는 **1건**(`OW-206`)이고 나머지 10건은 무수정이다. `OW-206` 은 Linear 왕복 대조로 저장본이 전송본과 바이트 일치함을 확인했다(`cmp` 종료 0, 차이 0바이트).

펜스 규칙 — 이 코멘트의 코드 펜스는 짝이 맞고 절 제목 2개는 전부 펜스 밖에 있다. 이번 라운드가 `OW-206` 2-5 에 넣은 교체 대응표 4쌍도 인라인 백틱이 아니라 펜스 안에 넣었다.

## dispatch table

```json
{
  "wave": "OW-199",
  "tasks": [
    {"id": "OW-200", "title": "로컬 해시 락 2종 + 해시 게이트 + LOCKS.md", "model": "sonnet",
     "deps": [],
     "target_files": [{"path": "runner/sam3-local-requirements.lock", "write": true}, {"path": "runner/sam3-local-build-requirements.lock", "write": true}, {"path": "runner/LOCKS.md", "write": true}, {"path": "runner/sam3-requirements.lock", "write": false}, {"path": "runner/sam3-build-requirements.lock", "write": false}, {"path": "runner/vtracer-Cargo.lock", "write": false}, {"path": "runner/remote-worker.py", "write": false}],
     "anchors": ["sam3-requirements.lock", "# Torch, torchvision, numpy<2, and Pillow are Colab base-runtime invariants and are preflighted separately."],
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
     "anchors": ["const result = await runnerProvider().run(input, AbortSignal.any([jobSignal, request.signal]));", "import { ColabJobRunner, matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from \"@/lib/colab-job-runner\";", "type Runner = Pick<ColabJobRunner, \"run\">;", "let serverRunner: ColabJobRunner | undefined;", "const runnerFromEnvironment = (): ColabJobRunner => {", "if (!serverRunner) serverRunner = new ColabJobRunner(parseRunnerConfig(process.env));", "현재 Colab 작업을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.", "import { matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from \"@/lib/colab-job-runner\";", "super(\"The client cancelled the Colab job.\");", "super(\"The Colab job exceeded its allowed time.\");", "super(\"The Colab command did not complete.\");"],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-204", "title": "프런트 폴링 재작성 + Colab 카피 제거", "model": "sonnet",
     "deps": ["OW-203"],
     "target_files": [{"path": "components/image-processor.tsx", "write": true}, {"path": "app/page.tsx", "write": true}, {"path": "DESIGN.md", "write": false}],
     "anchors": ["case \"running\": return \"전용 Colab GPU 작업자가 이미지를 처리하고 있습니다. 이 창을 닫지 마세요.\";", "case \"running\": return \"Colab GPU에서 처리 중입니다\";", "전용 Colab GPU 작업자가 결과를 만든 뒤 브라우저로 다운로드합니다.", "type JobState ="],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-205", "title": "테스트 전면 갱신", "model": "sonnet",
     "deps": ["OW-202", "OW-203", "OW-204"],
     "target_files": [{"path": "tests/local-job-runner.test.ts", "write": true}, {"path": "tests/process-job-registry.test.ts", "write": true}, {"path": "tests/process-async-api.test.ts", "write": true}, {"path": "tests/image-processor.test.tsx", "write": true}, {"path": "tests/process-cancel.test.ts", "write": true}, {"path": "lib/local-job-runner.ts", "write": false}, {"path": "lib/process-job-registry.ts", "write": false}, {"path": "app/api/process/route.ts", "write": false}, {"path": "app/api/process/status/route.ts", "write": false}, {"path": "app/api/process/result/route.ts", "write": false}, {"path": "app/api/process/cancel/route.ts", "write": false}, {"path": "components/image-processor.tsx", "write": false}],
     "anchors": ["createCancelHandler", "import { parseRunnerConfig } from \"../lib/colab-job-runner\";", "import { ImageProcessor } from \"../components/image-processor\";"],
     "irreversible": false, "skills": [], "strict_mcp": true},
    {"id": "OW-206", "title": ".env.example + deploy 2종 + 문서 4종", "model": "sonnet",
     "deps": [],
     "target_files": [{"path": ".env.example", "write": true}, {"path": "deploy/nginx.conf.example", "write": true}, {"path": "deploy/imagework.service.example", "write": true}, {"path": "docs/server-worker.md", "write": true}, {"path": "docs/reverse-proxy.md", "write": true}, {"path": "README.md", "write": true}, {"path": "CLAUDE.md", "write": true}],
     "anchors": ["IMAGEWORK_RECOVERY_ROOT", "proxy_read_timeout 7350s;", "proxy_read_timeout 7350s", "## 2. Configure Google Colab CLI authentication", "check:colab-notebook", "AbortSignal.any"],
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
     "anchors": ["\"check:public-artifacts\": \"node scripts/check-public-artifacts.mjs\"", "colab", "AbortSignal.any"],
     "irreversible": false, "skills": [], "strict_mcp": true}
  ]
}
```
## new_anchors

`[ANALYZE]` 의 `anchor_candidates` 34행에 없던 앵커 전량. **33건**이다 — 라운드 6이 "25건" 으로 적은 것은 기록 누락이었고(`[RED r6]` 노트 1), 빠져 있던 8건을 이번 라운드에 전부 직접 계수해 아래 목록 끝에 `(r7 기록 정정)` 으로 붙였다. 8건은 라운드 1~4에 이미 dispatch table 에 올라 있던 앵커이지 이번 라운드가 새로 도입한 것이 아니며, 8건 전부 저장소 전역 1 file / 1 hit 로 유일해 워커가 오도될 여지는 없다.

계수 근거 — dispatch table 의 `anchors` 배열을 파싱하면 항목 40개 / 중복 제거 39개이고, 그중 `anchor_candidates` 에 이미 있는 것은 6건(`AbortSignal.any` · `IMAGEWORK_RECOVERY_ROOT` · `check:colab-notebook` · `colab` · `createCancelHandler` · `local-job-runner`)이므로 39 − 6 = **33** 이 이 절의 정확한 크기다. 측정 명령은 `grep -cF -- '<s>' <file>` 와 `git grep -I -c -F -- '<s>'`, 커밋 `7b3e205`, 트리 clean. 라운드 3 승격 1건은 `(r3)`, 라운드 5 승격 2건은 `(r5)`, 라운드 6 승격 5건은 `(r6)` 로 표시했고 이번 라운드가 승격한 앵커는 0건이다.

```
sam3-requirements.lock — 3 — runner/LOCKS.md
# Torch, torchvision, numpy<2, and Pillow are Colab base-runtime invariants and are preflighted separately. — 1 — runner/sam3-requirements.lock (r5)
sam3-local-requirements.lock — 0 (종료 1) — runner/LOCKS.md (신규 도입 대상, OW-200 이 생성)
def run_inference(job_root: Path) -> None: — 1 — runner/remote-worker.py
const workerPath = resolve(process.cwd(), "runner/remote-worker.py"); — 1 — tests/remote-worker-contract.test.ts
export class ProcessJobRegistry { — 1 — lib/process-job-registry.ts
const result = await runnerProvider().run(input, AbortSignal.any([jobSignal, request.signal])); — 1 — app/api/process/route.ts
import { ColabJobRunner, matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner"; — 1 — app/api/process/route.ts
type Runner = Pick<ColabJobRunner, "run">; — 1 — app/api/process/route.ts (r6)
let serverRunner: ColabJobRunner | undefined; — 1 — app/api/process/route.ts (r6)
const runnerFromEnvironment = (): ColabJobRunner => { — 1 — app/api/process/route.ts (r6)
if (!serverRunner) serverRunner = new ColabJobRunner(parseRunnerConfig(process.env)); — 1 — app/api/process/route.ts (r6, 파일에서는 앞에 공백 2칸이 붙은 줄이라 부분 일치로 잡힌다)
현재 Colab 작업을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요. — 1 — app/api/process/route.ts (r6, 라운드 5까지 인라인 인용이던 교체 대상을 펜스 앵커로 승격)
import { matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner"; — 1 — app/api/process/cancel/route.ts
import { parseRunnerConfig } from "../lib/colab-job-runner"; — 1 — tests/process-cancel.test.ts (r5)
super("The client cancelled the Colab job."); — 1 — lib/colab-errors.ts
super("The Colab job exceeded its allowed time."); — 1 — lib/colab-errors.ts
super("The Colab command did not complete."); — 1 — lib/colab-errors.ts
type JobState = — 1 — components/image-processor.tsx
case "running": return "전용 Colab GPU 작업자가 이미지를 처리하고 있습니다. 이 창을 닫지 마세요."; — 1 — components/image-processor.tsx
case "running": return "Colab GPU에서 처리 중입니다"; — 1 — components/image-processor.tsx (r3)
전용 Colab GPU 작업자가 결과를 만든 뒤 브라우저로 다운로드합니다. — 1 — app/page.tsx
import { ImageProcessor } from "../components/image-processor"; — 1 — tests/image-processor.test.tsx (저장소 전역은 2 files — app/page.tsx:1 · tests/image-processor.test.tsx:1, OW-205 전제조건에서 파일 스코프 고정)
proxy_read_timeout 7350s; — 1 — deploy/nginx.conf.example
proxy_read_timeout 7350s — 1 — docs/reverse-proxy.md
## 2. Configure Google Colab CLI authentication — 1 — docs/server-worker.md (r7 기록 정정)
"check:colab-notebook": "node scripts/check-colab-notebook.mjs", — 1 — package.json (r7 기록 정정)
# generated Colab artifacts (the canonical notebook and results template are intended for tracking) — 1 — .gitignore (r7 기록 정정)
import type { AssetMode } from "./colab-input"; — 1 — lib/zip-contract.ts (r7 기록 정정)
import { ResultContractError } from "./colab-errors"; — 1 — lib/zip-contract.ts (r7 기록 정정)
import { ImageworkInputError } from "./colab-errors"; — 1 — lib/colab-input.ts (r7 기록 정정)
colab\/ — 1 — scripts/check-public-artifacts.mjs (r7 기록 정정)
"check:public-artifacts": "node scripts/check-public-artifacts.mjs" — 1 — package.json (r7 기록 정정)
```

[PLAN r7 cont.1]

이 코멘트는 `[PLAN r7]` 의 이어지는 부분이다. 계약이 정한 세 필수 절 중 `## source_reads` 와 `## refutations` 가 여기 있고(`## new_anchors` 는 `[PLAN r7]` 에), 그 뒤로 `## red_response` · `## requirement_map` 이 따른다. 분할 사유와 절 순서 보존은 `[PLAN r7]` 세 번째 문단에 적었다.

## source_reads

라운드 1~6 목록 + 라운드 7 신규 열람(`r7:`). 라운드 7의 열람은 `grep -nE` · `grep -cE` 계수 1건뿐이며 파일 본문을 편집하지 않았다.

```
components/image-processor.tsx — JobState 유니온과 Colab 카피 2건 위치 확인. r3: 45행이 actionLabelFor, 57행이 statusCopyFor 로 서로 다른 함수임을 sed 로 확인
tests/remote-worker-contract.test.ts — 승계·폐기 어서션 구분, vtracer-Cargo.lock 참조 1건. r3: colab 3건이 35·39·40행 colab_runtime_versions 어서션임을 grep -ni 로 확인
docs/server-worker.md — r3: 폐기 환경변수 4종 잔재 5건 계수. r7: 삭제 대상 러너 자산을 가리키는 서술을 grep -nE 'sam3-(build-)?requirements\.lock|remote[- ]worker' 로 5줄(66·122·123·124·131행) 계수하고, 같은 정규식이 로컬 전환 후 정상 표기 4종을 잡지 않음을 별도 파일로 확인 (블로커) (grep only)
README.md — r3: 같은 잔재 1건 계수. r6: docs/colab-results.md 링크가 89·153행 2건임을 grep -cF/-nF 로 계수하고 lib/colab-(input|errors).ts 표기가 0건(종료 1)임을 grep -cE 로 확인 (N2·N4) (grep only)
lib/colab-errors.ts — 교체할 Colab 메시지 3건 확인
lib/colab-input.ts — 자기 자신의 ./colab-errors 임포트 줄 확인
lib/process-job-registry.ts — 상태 머신 확장 앵커와 보존할 pending-cancellation 범위 확인
app/api/process/route.ts — AbortSignal.any 결합 위치와 핸들러 팩토리 시그니처 확인. r4: 38행 1건 재계수. r6: ColabJobRunner 가 1·9·53·55·56행 5건임을 grep -n 으로 확인, 5개 문자열이 전역에서 각각 이 파일 1건뿐임을 git grep -I -c -F 로 계수, 18~24행 sed 로 한국어 문구 원문 확인, 상한 게이트 근거로 grep -ci colab = 8 · 살아남는 import 2건을 계수 (B1·N1)
app/api/process/cancel/route.ts — 유지할 취소 계약과 교체할 import 확인
package.json — check:colab-notebook 항목의 정확한 줄 확인
runner/LOCKS.md — 락 3종 목록과 iopath 소스 전용 배포 서술 확인
runner/vtracer-Cargo.lock — 존재 확인만 (test -e)
deploy/nginx.conf.example — 7350s 타임아웃과 client_max_body_size 위치 확인
docs/reverse-proxy.md — colab·2×30·7350·7200 히트수 측정
.env.example — 변수 목록 대조
app/page.tsx — Colab 문구 1건 확인. r5: ImageProcessor import 가 이 파일에도 1건 있음을 git grep -c -F 로 확인 (N2) (grep only)
scripts/check-public-artifacts.mjs — 정규식 안의 colab 그룹 확인 (grep only)
.gitignore — colab 블록 경계 확인 (grep only)
runner/remote-worker.py — 이식 원본 함수·상수 이름, SAM3_SHA256 유일 보유 파일 확인. r4: grep -ci colab = 11 재계수 (grep only)
CLAUDE.md — r4: AbortSignal.any 1건과 폐기 IMAGEWORK_* 1건을 grep -cF / grep -cE 로 계수. r6: lib/colab-input.ts · lib/colab-errors.ts 표기가 31·35행 2건임을 grep -nE 로 확인 — README.md 0건과 대비되는 근거 (N4) (grep only)
~/.gstack/projects/taeseong-ryaniee-imagework/taeseongyi-main-design-20260720-182557.md — D18~D22·D28~D41·프로비저닝 0~7단계 계약 전문. r5: sed -n '227p' · '250p' · '284p' 로 GATE Q2 인용 출처 대조 (N5)
~/.gstack/projects/taeseong-ryaniee-imagework/tasks-eng-review-20260721-095918.jsonl — T1~T20 정의와 files 목록 (run_id 20260721T005918Z-89757 일치 확인)
lib/colab-job-runner.ts — export 이름 4종과 환경 변수 zod 스키마 확인. r5: ./colab-errors · ./colab-input import 가 6·7행 정확히 2줄임을 grep -n -E 로 계수(OW-202 상한 게이트의 근거) + grep -ci colab = 37 (N4) (grep only)
tests/process-cancel.test.ts — r4: 폐기 IMAGEWORK_* 4건 계수. r5: 구 모듈 임포트 앵커 grep -cF = 1, 폐기 7종 전수 grep -cE = 7, IMAGEWORK_JOB_TIMEOUT_SECONDS 값이 "60" 임을 grep -n 으로 확인 (B1) (grep only)
runner/sam3-requirements.lock — r4: 3행 Colab base-runtime 주석 원문을 grep -n -i 로 확인. r5: 그 전문을 grep -cF = 1 로 재계수해 앵커로 승격 (N1) (grep only)
tests/image-processor.test.tsx — r5: ImageProcessor import 1건 재계수, 저장소 전역 2 files 확인 (N2) (grep only)
```

## refutations

라운드 1·2에서 세운 반박 5건과 라운드 5에서 추가한 1건은 이번 계획에도 그대로 유효하다. 이번 라운드가 새로 반박한 `[ANALYZE]`·`[GATE]` 주장은 없다 — 6건 그대로다.

```
ls docs/ | wc -l — 3 — [ANALYZE] target_state 의 "docs/ (디렉터리) | 존재 | 2개 파일" 을 반박. 실제는 colab-results.md · reverse-proxy.md · server-worker.md 3개다. colab-results.md 는 로드맵 어느 태스크의 files 에도 없어 무주공산이었으므로 OW-208 삭제 목록에 편입하고, 이를 참조하는 README.md 링크 2건 제거를 OW-206 에 넣었다.

D=$(mktemp -d); git check-ignore -v -- "$D" — fatal: ... is outside repository at '/Users/taeseongyi/Desktop/GitHub/imagework' (종료 128) — [ANALYZE] non_git_paths 의 "(none)" 을 반박. OW-200 2-3 의 해시 게이트가 저장소 밖 임시 디렉터리에 pip download 산출물을 내려받으므로 이 웨이브에는 비-git 경로가 1건 존재한다. 라운드 2에서 고정 경로를 mktemp -d 산출 경로로 바꾸고 rm -rf 대상을 그 디렉터리 하나로 한정했다.

git grep -Ilc -i -- colab | grep -v -E '^(colab/imagework\.ipynb|lib/colab-job-runner\.ts|scripts/check-colab-notebook\.mjs|tests/colab-job-runner\.test\.ts|runner/remote-worker\.py|runner/sam3-requirements\.lock|docs/colab-results\.md)$' — 19개 파일(.env.example .gitignore CLAUDE.md README.md app/api/process/cancel/route.ts app/api/process/route.ts app/page.tsx components/image-processor.tsx docs/server-worker.md lib/colab-errors.ts lib/colab-input.ts lib/process-job-registry.ts lib/zip-contract.ts package.json runner/LOCKS.md scripts/check-public-artifacts.mjs tests/check-public-artifacts.test.ts tests/process-cancel.test.ts tests/remote-worker-contract.test.ts) — [GATE] Q4 (A) 의 "git grep -ri colab 0건 달성" 을 반박. (A) 가 열거한 삭제 집합만으로는 19개 파일이 남고, 그 중 lib/colab-errors.ts · lib/colab-input.ts 는 파일명 자체와 16곳의 import 경로다. 0건은 두 모듈 rename 없이 도달 불가이므로 OW-209 를 신설했다. 이 rename 은 설계 문서의 "lib/colab-errors.ts 파일명 유지" 및 "lib/zip-contract.ts 무수정 재사용" 서술과 충돌하므로 OW-209 스펙에서 zip-contract.ts 변경을 import 2줄로 못박았다.

grep -cF -- 'iopath==0.1.10' runner/sam3-requirements.lock — 1 — [GATE] Q2 (C) 의 단일 게이트 명령(pip download --require-hashes --only-binary=:all: --platform manylinux_2_28_x86_64 --python-version 3.12)을 반박. iopath 0.1.10 은 소스 배포만 발행해 --only-binary=:all: 로 받히지 않는다. OW-200 에서 게이트를 2단계로 분해했다 — iopath 제외 사본으로 크로스플랫폼 종료 0 확보 + iopath 는 --platform 없이 --no-binary=:all: 로 해시 확인.

grep -n -F -- 'iopath 0.1.10' runner/LOCKS.md — 24:metadata. iopath 0.1.10 publishes only a source distribution; its exact — [GATE] Q4 (A) 의 sam3-build-requirements.lock 삭제를 부분 반박. 빌드 툴 락은 소스 전용 iopath 를 --no-build-isolation 으로 설치하기 위한 선행 계약이라 로컬 전환 후에도 살아 있다. 옛 파일 삭제는 유지하되 로컬 대응물 runner/sam3-local-build-requirements.lock 신설을 OW-200 에, 2단계 설치 순서를 OW-207 1단계에 넣었다.

sed -n '227p' ~/.gstack/projects/taeseong-ryaniee-imagework/taeseongyi-main-design-20260720-182557.md — ### 프로비저닝 (1회, scripts/provision-worker.sh 신규) — [GATE] Q2 의 출처 "설계 문서 227행 '프로비저닝 0단계'(이미 재실행 지점을 정의)" 중 줄 포인터를 반박(r5 신규, [RED r4] N5). 227행은 절 제목이고 인용한 내용은 다른 두 줄에 있다 — sed -n '250p' = "- **(c) 프로비저닝 0단계 드라이버 검사**: 위 프로비저닝 0단계에 통합 ...", sed -n '284p' = "... (b) torch/torchvision CUDA 휠 해시 고정 가능성 검증(프로비저닝 0단계), NVIDIA 드라이버/CUDA 버전 확인(D21c)이 함께 기록됨." 답변 (C) 자체는 문서 내용과 일치하므로 계획은 바꾸지 않고 출처 줄 포인터만 정정한다. 같은 GATE 행의 Q5 인용 2건(263·349행)은 정확히 일치했다.
```
## red_response

`[RED r6]` 은 블로커 1건과 노트 5건을 냈다. 블로커 1건과 노트 5건 **전부**에 조치했고, 실질 편집은 이슈 1건(`OW-206`)에 들어갔다. 나머지 10건은 무수정이다. `OW-206` 은 Linear 왕복 대조로 저장본이 전송본과 바이트 일치함을 확인했다(`cmp` 종료 0, 차이 0바이트 — 라운드 6까지 남던 말미 개행 1바이트 차이도 이번에는 없다).

### 블로커 — `OW-206` 이 삭제 대상 러너 자산 참조 4줄을 잡는 게이트를 갖지 않음

| 항목 | 내용 |
|---|---|
| RED 지적 | `docs/server-worker.md` 는 이 웨이브가 삭제하는 `runner/remote-worker.py` · `runner/sam3-requirements.lock` · `runner/sam3-build-requirements.lock` 을 5줄에서 가리키는데, 그중 66행만 `OW-206` 2-5 의 `IMAGEWORK_*` 정규식 게이트에 걸리고 122·123·124·131행은 어디에도 걸리지 않는다. 이름에 `colab` 이 없어 `grep -ci colab` 0건 게이트를 통과하고, `OW-210` 전역 스윕 2건은 `colab` 과 `AbortSignal.any` 뿐이며, 이 파일은 어떤 테스트·tsc·lint·build 도 읽지 않는다. 웨이브 종료 시 존재하지 않는 파일로 가는 상대 링크 2건과 원격 워커 서술 2문단이 남는다 |
| 조치 | `fix_instruction` 그대로 실행 — (1) 2-5 의 `IMAGEWORK_*` 게이트 **바로 아래에** 같은 형식의 완료 판정 1줄을 추가(기대 `0` / `exit=1`), (2) 측정 기준값 5건과 그 줄 번호(66·122·123·124·131)를 함께 기재, (3) `## 1. Preconditions` 의 착수 검사 펜스에 대응 줄 1건 추가(기대 5 / 종료 0), (4) 정규식이 로컬 전환 후 정상 표기를 잡지 않음을 실측으로 명시 |
| 추가 조치 | `fix_instruction` 이 요구하지 않았지만 게이트만으로는 도달 방법이 없어 **교체 지시 1건**을 함께 넣었다 — 2-5 에 4쌍짜리 대응표(`runner/remote-worker.py` → `runner/local-worker.py`, 락 2종 → 로컬 락 2종, `The remote worker verifies` → `The local worker verifies`)를 펜스로 추가했다. RED 자신이 대비군으로 든 `runner/LOCKS.md`(OW-200 2-4)·`tests/remote-worker-contract.test.ts`(OW-201 2-2)와 처리 형태를 맞춘 것이다. 대응표는 인라인 백틱이 아니라 펜스 안에 있고, 파일 자체는 손대지 않는다는 §3 제약을 같은 줄에 다시 못박았다 |
| 측정 | 커밋 `7b3e205`, 트리 clean. `grep -cE 'sam3-(build-)?requirements\.lock|remote[- ]worker' docs/server-worker.md` = **5** / 종료 0 이고 `grep -nE` 로 66·122·123·124·131행임을 확인했다. 거짓 양성 검사 — 대응표 오른쪽 4개 문자열만 담은 파일에 같은 정규형을 돌린 결과 `0` / 종료 1 로, 로컬 전환 후의 정상 표기는 이 게이트에 걸리지 않는다 |
| deps · target_files | 변경 없음 — `docs/server-worker.md` 는 이미 `OW-206` 의 `write: true` 항목이고 새 경로가 생기지 않는다. RED 의 "`OW-206` 의 `target_files` · `deps` 변경은 필요 없다" 판정과 같다 |

### 노트 5건

| 노트 | 조치 | 측정 |
|---|---|---|
| N1 `[PLAN r6]` `## new_anchors` 가 "25건" 이라고 선언했으나 8건 누락 | `[PLAN r7]` 의 `## new_anchors` 를 **33건**으로 정정하고, 빠져 있던 8건에 `(r7 기록 정정)` 을 붙여 목록 끝에 넣었다. 8건이 이번 라운드의 신규 도입이 아니라 라운드 1~4에 이미 dispatch table 에 있던 앵커라는 사실도 그 절 서두에 적었다. 계획 자체는 바뀌지 않았다 — 기록만 실제 표와 일치시켰다 | dispatch table 파싱 결과 `anchors` 항목 40 / 중복 제거 39, 그중 `anchor_candidates` 34행에 이미 있는 것 6건(`AbortSignal.any` · `IMAGEWORK_RECOVERY_ROOT` · `check:colab-notebook` · `colab` · `createCancelHandler` · `local-job-runner`) → 39 − 6 = 33. 누락 8건은 각각 `git grep -I -c -F` 로 1 file / 1 hit 유일함을 재확인 |
| N2 `OW-206` — `.env.example` 목록과 `OW-202` zod 스키마를 맞춰 주는 게이트가 없음 | `## 1. Preconditions` 에 "형제 결정값" 1줄을 추가했다 — `OW-202` 의 `## Decisions` 가 이미 있으면 그 목록을 정본으로 쓰고 어긋나는 항목을 `worker_done` 에 적는다, 없으면 이 스펙이 정본이고 2-8 이 그것을 공표한다. 읽는 명령(`orca linear issue OW-202 --full --json`, 값은 `result.comments`)까지 적었고, 조건부 참조이므로 `deps` 는 `[]` 로 유지된다는 사실을 같은 줄에 명시했다 | RED 가 이번 라운드에 두 목록을 문자 대조해 **현행 불일치 0건**(제거 7종·추가 5종·유지 3종·변경 1종이 두 스펙에서 동일)임을 확인했다. 값이 아니라 어긋났을 때의 판정 경로가 없던 것이 문제였고 그 경로만 추가했다 |
| N3 `OW-207` — venv·모델 캐시·vtracer 경로가 `OW-206` 의 `.env.example`·문서와 어긋날 수 있음 | 같은 1줄로 함께 닫았다 — N2 의 "형제 결정값" 항목에 `OW-207` 의 `## Decisions`(경로 자리표시자)를 같은 자격으로 넣었다. `OW-207` 쪽은 이미 `## Decisions` 절에 "문서 태스크가 이미 끝났다면 불일치를 `worker_done` 에 보고한다" 가 있어 이제 양방향이 대칭이다. `OW-207` 의 description·`deps`·`target_files` 는 무수정이다 | 두 태스크는 파일을 공유하지 않아 §4 check 4 에 걸리지 않는다(A3 재계측 그대로 미정렬 0건). 실패 강도가 낮다는 RED 판정에 동의해 태스크 신설·순서 추가 없이 조회 경로만 열었다 |
| N4 `[ANALYZE]` `non_git_paths: (none)` ↔ `## refutations` 2번 불일치가 라운드 3~6 잔존 | 계획은 바꾸지 않는다 — RED 자신이 이번 라운드에도 재측정(종료 128)해 반박을 재현하고 `irreversible: false` 유지를 판정했다. 노드 2 에는 `[ANALYZE]` 코멘트를 고칠 verb 가 없으므로 현행 처리(반박을 `## refutations` 로 넘김)를 유지하고, 다음 웨이브 노드 1 이 `non_git_paths` 를 승계하지 않게 하는 것이 유일한 후속 조치라는 RED 의 결론을 그대로 받는다 | 이번 라운드 재측정 없음. 근거는 `[RED r6]` A4 결과와 `## refutations` 2번 항목 |
| N5 신규 파일 5건(`app/api/process/status/route.ts` · `app/api/process/result/route.ts` · `tests/local-job-runner.test.ts` · `tests/process-job-registry.test.ts` · `tests/process-async-api.test.ts`)만 자기 파일 `colab` 0건 1차 방어선이 없음 | 계획은 바꾸지 않는다. 이 5건에 `grep -ci colab <file>` = 0 게이트를 붙이면 **구조적으로 반드시 실패한다** — 생성 시점에 두 모듈은 아직 `lib/colab-errors.ts` · `lib/colab-input.ts` 이고, 5건 전부 그 모듈을 임포트해야 동작하기 때문이다. rename 은 `OW-209` 소관이고 `OW-203`·`OW-205` → `OW-208` → `OW-209` 순서라 생성 시점에는 옛 이름만 존재한다. 1차 방어선이 있는 다른 신규 파일 6건(락 2종·`runner/local-worker.py`·`lib/local-job-runner.ts`·`deploy/imagework.service.example`·`scripts/provision-worker.sh`)은 두 모듈을 임포트하지 않아 0건 게이트가 성립하는 것이지, 이 5건만 규율이 느슨한 것이 아니다. 커버리지는 RED 가 확인한 대로 `OW-209` 2-2 대상 목록(1차)과 `OW-210` 전역 스윕(2차)이 받는다 | `ls lib/` = `colab-errors.ts` · `colab-input.ts` · `colab-job-runner.ts` · `output-format.ts` · `process-job-registry.ts` · `zip-contract.ts`(커밋 `7b3e205`) — 생성 시점의 임포트 대상 파일명에 `colab` 이 들어 있음이 확인된다. dispatch table 의 `deps` 폐포로 `OW-203`·`OW-205` 가 `OW-209` 보다 앞선다는 순서도 확인했다 |

### 구조 (변경 없음)

`[GATE r2]` 가 지시한 `OW-210` 전역 백스톱 구조는 라운드 4에서 확정한 그대로다 — 2-1 체크 세트 5종 + 2-2 전역 스윕 2건, 스윕이 지목한 경로에 한정된 사후 수정 권한, `target_files` 무확장. 이번 라운드가 추가한 판정 1건(`OW-206` 2-5 의 러너 자산 참조 0건)도 1차 방어선이고 2차는 여전히 `OW-210` 이다. 이로써 `OW-206` 은 자기 대상 파일 4종에 대해 `colab` 0건 · `IMAGEWORK_*` 0건 · 러너 자산 참조 0건 세 종류의 완료 판정을 갖는다.

§4 check 4(공유-쓰기 순서)는 이번 라운드에 다시 확인할 대상이 없다 — `target_files` 도 `deps` 도 `anchors` 도 한 건도 바뀌지 않았고, 바뀐 것은 `OW-206` 본문뿐이다. `[RED r6]` A3 이 계측한 고유 경로 46개 · 공유 쌍 97건 · 순서 필요 쌍 87건 · 미정렬 0건이 그대로 유효하다.

## requirement_map

`[ANALYZE]` 25항 + `[GATE]` 26·27항 전부 매핑. 라운드 4~6에서 확정한 소유자와 동일하다 — 이번 라운드도 태스크를 신설하거나 폐기하지 않았고 `target_files` 도 바꾸지 않았다.

```
1 → OW-200        2 → OW-200        3 → OW-201        4 → OW-201
5 → OW-201        6 → OW-201        7 → OW-201        8 → OW-201
9 → OW-202       10 → OW-202       11 → OW-203       12 → OW-203
13 → OW-203      15 → OW-204       16 → OW-203       17 → OW-206
18 → OW-207      19 → OW-206       20 → OW-206       22 → OW-208
24 → OW-205 · OW-210               25 → OW-210
14 → OW-203 · OW-206 · OW-210
21 → OW-206 · OW-209
23 → OW-200 · OW-201 · OW-202 · OW-203 · OW-204 · OW-206 · OW-207 · OW-208 · OW-209 · OW-210
26 → OW-202 · OW-203               27 → OW-204 · OW-209
```

GATE 확정 답변 5건도 전부 태스크로 내려가 있다 — Q1(A) → `OW-201` · `OW-207` 의 `py_compile` / `bash -n` 판정, Q2(C) → `OW-200`, Q3 T23·T24 편입 → `OW-202` · `OW-203` · `OW-204` · `OW-209`, Q4(A) → `OW-208` · `OW-209`, Q5(B) 120s·400 고정 + burst·드라이버 임계값 위임 → `OW-206` · `OW-207`. `[GATE r2]` 의 구조 지시는 `OW-210` 2-2 가 소유한다.

전역 불변식 2건의 소유 사슬 — 제공요건 14 는 1차 `OW-203`(자기 파일) · `OW-206`(`CLAUDE.md`), 2차 `OW-210`. 제공요건 23 은 1차 `OW-200` · `OW-201` · `OW-202` · `OW-203`(이번 라운드 신설 상한 게이트) · `OW-204` · `OW-206` · `OW-207` · `OW-208` · `OW-209`(각자 자기 파일), 2차 `OW-210`. 위 매핑 줄의 23항은 라운드 5에서 이 문단이 이미 열거하던 `OW-202` · `OW-204` 를 함께 적어 두 서술을 일치시킨 것이고, `OW-203` 은 라운드 6이 그 파일에 상한 게이트를 넣으면서 1차 방어선 소유자로 편입됐다. 이번 라운드는 소유자 집합을 바꾸지 않았다 — `OW-206` 2-5 에 추가한 러너 자산 참조 0건 판정은 이미 21항의 소유자인 `OW-206` 이 자기 대상 파일에서 수행하는 검사가 하나 늘어난 것이다.