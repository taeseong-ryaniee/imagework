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