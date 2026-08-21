[PLAN r5]

웨이브를 6건 이하로 쪼갤 수 없는 이유 — T2~T20 과 GATE Q3 로 편입된 T23·T24 가 sync→async 라는 단일 계약 변경을 공유해서 프로토콜(워커·러너)·상태 머신(레지스트리·라우트)·화면(폴링)·삭제 정리가 같은 릴리스 안에서 동시에 성립해야 하고, 로드맵 19건을 파일 소유권 단위로 최대한 병합한 결과가 11건이다. 라운드 1~4와 태스크 집합·개수는 동일하며(신설·폐기 0), 이번 라운드는 `[RED r4]` 의 블로커 1건 + 노트 6건 해소만 반영한다.

이 라운드의 코멘트는 2건이다 — 본 코멘트가 dispatch table 과 `## new_anchors` · `## source_reads` · `## refutations` 를 담고, `## red_response` 와 `## requirement_map` 은 바로 다음 코멘트 `[PLAN r5 cont.1]` 에 있다. Linear 코멘트 1건의 저장 상한(20000자)을 넘어 분할했다.

기준선 — 커밋 `7b3e205`, `git status --porcelain` 무출력, `npx vitest run` 68/68 (라운드 4에서 재측정, 이번 라운드는 소스 무편집). 이번 라운드에 description 을 고친 이슈는 **4건**(`OW-200` · `OW-202` · `OW-205` · `OW-209`)이고 나머지 7건은 무수정이다. 4건 전부 Linear 왕복 대조(`cmp`)로 바이트 일치를 확인했다.

`[RED r4]` N3 대응 — 이 코멘트의 코드 펜스는 짝이 맞고(백틱 3개로 시작하는 줄 = 8, 짝수) 절 제목 4개는 전부 펜스 밖에 있다.

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

`[ANALYZE]` 의 `anchor_candidates` 에 없던 앵커 전량. 측정은 이 라운드에서 20건 전부 재실행했다 — `grep -cF -- '<s>' <file>`, 커밋 `7b3e205`, 트리 clean. 라운드 3 신규 승격 1건은 `(r3)`, 라운드 5 신규 승격 2건은 `(r5)` 로 표시했다. 라운드 4가 dispatch table 에 올린 `AbortSignal.any`·`colab` 두 문자열은 `[ANALYZE]` `anchor_candidates` 에 이미 등재돼 있어 여기 적을 대상이 아니다.

```
sam3-requirements.lock — 3 — runner/LOCKS.md
# Torch, torchvision, numpy<2, and Pillow are Colab base-runtime invariants and are preflighted separately. — 1 — runner/sam3-requirements.lock (r5)
sam3-local-requirements.lock — 0 (종료 1) — runner/LOCKS.md (신규 도입 대상, OW-200 이 생성)
def run_inference(job_root: Path) -> None: — 1 — runner/remote-worker.py
const workerPath = resolve(process.cwd(), "runner/remote-worker.py"); — 1 — tests/remote-worker-contract.test.ts
export class ProcessJobRegistry { — 1 — lib/process-job-registry.ts
const result = await runnerProvider().run(input, AbortSignal.any([jobSignal, request.signal])); — 1 — app/api/process/route.ts
import { ColabJobRunner, matchesProcessingCode, parseRunnerConfig, type RunnerConfig } from "@/lib/colab-job-runner"; — 1 — app/api/process/route.ts
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
```

## source_reads

라운드 1~4 목록 + 라운드 5 신규 열람(`r5:`). 라운드 5의 열람은 전부 `grep` · `sed` 계수이며 파일 본문을 편집하지 않았다.

```
components/image-processor.tsx — JobState 유니온과 Colab 카피 2건 위치 확인. r3: 45행이 actionLabelFor, 57행이 statusCopyFor 로 서로 다른 함수임을 sed 로 확인
tests/remote-worker-contract.test.ts — 승계·폐기 어서션 구분, vtracer-Cargo.lock 참조 1건. r3: colab 3건이 35·39·40행 colab_runtime_versions 어서션임을 grep -ni 로 확인
docs/server-worker.md — r3: 폐기 환경변수 4종 잔재 5건 계수 (grep only)
README.md — r3: 같은 잔재 1건 계수 (grep only)
lib/colab-errors.ts — 교체할 Colab 메시지 3건 확인
lib/colab-input.ts — 자기 자신의 ./colab-errors 임포트 줄 확인
lib/process-job-registry.ts — 상태 머신 확장 앵커와 보존할 pending-cancellation 범위 확인
app/api/process/route.ts — AbortSignal.any 결합 위치와 핸들러 팩토리 시그니처 확인. r4: 38행 1건 재계수
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
CLAUDE.md — r4: AbortSignal.any 1건과 폐기 IMAGEWORK_* 1건을 grep -cF / grep -cE 로 계수 (grep only)
~/.gstack/projects/taeseong-ryaniee-imagework/taeseongyi-main-design-20260720-182557.md — D18~D22·D28~D41·프로비저닝 0~7단계 계약 전문. r5: sed -n '227p' · '250p' · '284p' 로 GATE Q2 인용 출처 대조 (N5)
~/.gstack/projects/taeseong-ryaniee-imagework/tasks-eng-review-20260721-095918.jsonl — T1~T20 정의와 files 목록 (run_id 20260721T005918Z-89757 일치 확인)
lib/colab-job-runner.ts — export 이름 4종과 환경 변수 zod 스키마 확인. r5: ./colab-errors · ./colab-input import 가 6·7행 정확히 2줄임을 grep -n -E 로 계수(OW-202 상한 게이트의 근거) + grep -ci colab = 37 (N4) (grep only)
tests/process-cancel.test.ts — r4: 폐기 IMAGEWORK_* 4건 계수. r5: 구 모듈 임포트 앵커 grep -cF = 1, 폐기 7종 전수 grep -cE = 7, IMAGEWORK_JOB_TIMEOUT_SECONDS 값이 "60" 임을 grep -n 으로 확인 (B1) (grep only)
runner/sam3-requirements.lock — r4: 3행 Colab base-runtime 주석 원문을 grep -n -i 로 확인. r5: 그 전문을 grep -cF = 1 로 재계수해 앵커로 승격 (N1) (grep only)
tests/image-processor.test.tsx — r5: ImageProcessor import 1건 재계수, 저장소 전역 2 files 확인 (N2) (grep only)
```

## refutations

라운드 1·2에서 세운 반박 5건은 이번 계획에도 그대로 유효하고, 라운드 5에서 1건이 늘었다(`[RED r4]` N5 의 출처 줄 포인터).

```
ls docs/ | wc -l — 3 — [ANALYZE] target_state 의 "docs/ (디렉터리) | 존재 | 2개 파일" 을 반박. 실제는 colab-results.md · reverse-proxy.md · server-worker.md 3개다. colab-results.md 는 로드맵 어느 태스크의 files 에도 없어 무주공산이었으므로 OW-208 삭제 목록에 편입하고, 이를 참조하는 README.md 링크 2건 제거를 OW-206 에 넣었다.

D=$(mktemp -d); git check-ignore -v -- "$D" — fatal: ... is outside repository at '/Users/taeseongyi/Desktop/GitHub/imagework' (종료 128) — [ANALYZE] non_git_paths 의 "(none)" 을 반박. OW-200 2-3 의 해시 게이트가 저장소 밖 임시 디렉터리에 pip download 산출물을 내려받으므로 이 웨이브에는 비-git 경로가 1건 존재한다. 라운드 2에서 고정 경로를 mktemp -d 산출 경로로 바꾸고 rm -rf 대상을 그 디렉터리 하나로 한정했다.

git grep -Ilc -i -- colab | grep -v -E '^(colab/imagework\.ipynb|lib/colab-job-runner\.ts|scripts/check-colab-notebook\.mjs|tests/colab-job-runner\.test\.ts|runner/remote-worker\.py|runner/sam3-requirements\.lock|docs/colab-results\.md)$' — 19개 파일(.env.example .gitignore CLAUDE.md README.md app/api/process/cancel/route.ts app/api/process/route.ts app/page.tsx components/image-processor.tsx docs/server-worker.md lib/colab-errors.ts lib/colab-input.ts lib/process-job-registry.ts lib/zip-contract.ts package.json runner/LOCKS.md scripts/check-public-artifacts.mjs tests/check-public-artifacts.test.ts tests/process-cancel.test.ts tests/remote-worker-contract.test.ts) — [GATE] Q4 (A) 의 "git grep -ri colab 0건 달성" 을 반박. (A) 가 열거한 삭제 집합만으로는 19개 파일이 남고, 그 중 lib/colab-errors.ts · lib/colab-input.ts 는 파일명 자체와 16곳의 import 경로다. 0건은 두 모듈 rename 없이 도달 불가이므로 OW-209 를 신설했다. 이 rename 은 설계 문서의 "lib/colab-errors.ts 파일명 유지" 및 "lib/zip-contract.ts 무수정 재사용" 서술과 충돌하므로 OW-209 스펙에서 zip-contract.ts 변경을 import 2줄로 못박았다.

grep -cF -- 'iopath==0.1.10' runner/sam3-requirements.lock — 1 — [GATE] Q2 (C) 의 단일 게이트 명령(pip download --require-hashes --only-binary=:all: --platform manylinux_2_28_x86_64 --python-version 3.12)을 반박. iopath 0.1.10 은 소스 배포만 발행해 --only-binary=:all: 로 받히지 않는다. OW-200 에서 게이트를 2단계로 분해했다 — iopath 제외 사본으로 크로스플랫폼 종료 0 확보 + iopath 는 --platform 없이 --no-binary=:all: 로 해시 확인.

grep -n -F -- 'iopath 0.1.10' runner/LOCKS.md — 24:metadata. iopath 0.1.10 publishes only a source distribution; its exact — [GATE] Q4 (A) 의 sam3-build-requirements.lock 삭제를 부분 반박. 빌드 툴 락은 소스 전용 iopath 를 --no-build-isolation 으로 설치하기 위한 선행 계약이라 로컬 전환 후에도 살아 있다. 옛 파일 삭제는 유지하되 로컬 대응물 runner/sam3-local-build-requirements.lock 신설을 OW-200 에, 2단계 설치 순서를 OW-207 1단계에 넣었다.

sed -n '227p' ~/.gstack/projects/taeseong-ryaniee-imagework/taeseongyi-main-design-20260720-182557.md — ### 프로비저닝 (1회, scripts/provision-worker.sh 신규) — [GATE] Q2 의 출처 "설계 문서 227행 '프로비저닝 0단계'(이미 재실행 지점을 정의)" 중 줄 포인터를 반박(r5 신규, [RED r4] N5). 227행은 절 제목이고 인용한 내용은 다른 두 줄에 있다 — sed -n '250p' = "- **(c) 프로비저닝 0단계 드라이버 검사**: 위 프로비저닝 0단계에 통합 ...", sed -n '284p' = "... (b) torch/torchvision CUDA 휠 해시 고정 가능성 검증(프로비저닝 0단계), NVIDIA 드라이버/CUDA 버전 확인(D21c)이 함께 기록됨." 답변 (C) 자체는 문서 내용과 일치하므로 계획은 바꾸지 않고 출처 줄 포인터만 정정한다. 같은 GATE 행의 Q5 인용 2건(263·349행)은 정확히 일치했다.
```


[PLAN r5 cont.1]

## red_response

`[RED r4]` 는 블로커 1건(B1)과 노트 6건(N1~N6)을 냈다. 블로커 1건과 노트 6건 **전부**에 조치했고, 실질 편집은 이슈 4건(`OW-200` · `OW-202` · `OW-205` · `OW-209`)에 들어갔다. 나머지 7건은 무수정이다. 4건 전부 Linear 왕복 대조(`cmp`)로 바이트 일치를 확인했다.

### 블로커 B1 — OW-205 가 구 모듈에서 `parseRunnerConfig` 를 임포트한 채 남음

| 항목 | 내용 |
|---|---|
| RED 지적 | `tests/process-cancel.test.ts` 4행이 `../lib/colab-job-runner` 에서 `parseRunnerConfig` 를 임포트하고 16행 모듈 최상위에서 호출한다. 구 zod 스키마가 폐기 키를 `.optional()` 없이 필수로 요구하므로 fake 만 고치면 파일이 로드 시점에 떨어지고, `OW-208` 삭제 후에는 미해결 모듈이 된다. 구 모듈 임포터 4건 중 이 파일만 재지정 지시가 없었다 |
| 조치 | `fix_instruction` 그대로 실행 — (1) `OW-205` 2-4 에 임포트 교체를 펜스 앵커 2개(교체 전 / 교체 후)로 명시, (2) 같은 절에 fake `RunnerConfig` 재구성 지시(폐기 7종 삭제 · 신규 5종 추가 · `IMAGEWORK_JOB_TIMEOUT_SECONDS` 를 30~600 안으로) 와 함께 `OW-202` 의 `## Decisions` 코멘트를 정본으로 지정, (3) `## 1. Preconditions` 에 임포트 앵커 생존 검사 1줄(기대 1 / 종료 0) 추가, (4) dispatch table `OW-205` `anchors` 에 그 앵커 승격 |
| 추가 조치 | `fix_instruction` 이 지목하지 않은 두 구멍을 함께 닫았다 — (a) 2-4 에 완료 판정 2줄 신설(폐기 7종 정규식 0건 / `lib/colab-job-runner` 문자열 0건), (b) `OW-202` 2-3 의 `## Decisions` 에 환경 변수 스키마 전문(제거 7 · 추가 5 · 유지 3 · 변경 1의 키·기본값·zod 범위)을 적도록 의무화. (b) 가 없으면 `OW-205` 가 읽으라고 지시받은 채널에 정작 그 값이 실려 있지 않다 |
| 측정 | `grep -cF -- 'import { parseRunnerConfig } from "../lib/colab-job-runner";' tests/process-cancel.test.ts` = 1, 종료 0. 폐기 키는 4종이 아니라 **7종 전부**가 이 파일에 각각 1건씩 실재한다 — `grep -cE 'IMAGEWORK_(HF_TOKEN\|JOB_SCRIPT\|RECOVERY_ROOT\|GOOGLE_APPLICATION_CREDENTIALS\|COLAB_AUTH_MODE\|COLAB_CONFIG\|COLAB_ACCELERATOR)' tests/process-cancel.test.ts` = 7. 라운드 4 스펙에 적힌 "4" 는 4종만 담은 좁은 정규식의 값이었고, 스펙 본문을 7종 기준으로 고쳤다. `IMAGEWORK_JOB_TIMEOUT_SECONDS` 는 `"60"` 이라 새 범위 안이므로 값 변경이 필요 없다는 사실도 스펙에 적었다 |
| deps · target_files | 변경 없음 — RED 가 확인한 대로 `OW-202` 가 이미 `deps` 에 있고 `lib/local-job-runner.ts` 가 `write: false` 로 등재돼 있다 |

### 노트 6건

| 노트 | 조치 | 측정 |
|---|---|---|
| N1 `OW-200` — 편집 위치를 줄 번호로 지시 + 인용이 `...` 로 잘림 | 2-1 의 "출발점 파일 3행의 주석" 표현을 지우고 주석 **전문**을 펜스 블록 앵커로 넣었다. `## 1. Preconditions` 에 `grep -cF` 검사 1줄(기대 1 / 종료 0)을 추가하고 dispatch table `OW-200` `anchors` 에 승격했다. 이로써 웨이브 안의 줄 번호 지시는 0건이다 | `grep -cF -- '# Torch, torchvision, numpy<2, and Pillow are Colab base-runtime invariants and are preflighted separately.' runner/sam3-requirements.lock` = 1, 종료 0 |
| N2 `OW-205` — `ImageProcessor` 임포트 앵커가 저장소 전역에서 유일하지 않음 | 전제조건 블록 뒤에 파일 스코프 고정 문단을 넣었다 — 앵커를 전역으로 잡지 말고 언제나 `tests/image-processor.test.tsx` 를 지정해 grep 하며, `app/page.tsx` 는 `OW-204` 의 쓰기 대상이라 §3 대로 한 글자도 건드리지 않는다. `## new_anchors` 표기에도 2 files 사실을 병기했다 | `git grep -c -F` 결과가 `app/page.tsx:1` · `tests/image-processor.test.tsx:1` 2 files |
| N3 `[PLAN r4]` 코멘트의 코드 펜스가 홀수 | 이번 라운드 코멘트를 펜스 짝수로 생성했다 — 절 제목 4개(`## dispatch table` · `## new_anchors` · `## source_reads` · `## refutations`)는 전부 펜스 **밖**이고, 각 절의 목록만 펜스 안이다 | `[PLAN r5]` 본문의 `grep -c '^` + 백틱 3개 = 8 (짝수), 게시 전 생성 스크립트가 계수 |
| N4 `OW-202` — 신규 `lib/local-job-runner.ts` 에 `colab` 계측 부재 | RED 가 제안한 **상한 게이트**를 2-2b 절로 신설했다 — `grep -in colab lib/local-job-runner.ts` 히트가 2줄 이하이고 그 전부가 `./colab-errors` · `./colab-input` import 줄이어야 하며, import 가 아닌 히트는 그 줄을 고쳐 지우고 다시 센다. 1차 방어선임을 명시하고 `OW-209` 의 rename 과 `OW-210` 의 전역 스윕을 2·3차 방어선으로 적었다 | `grep -ci colab lib/colab-job-runner.ts` = 37. 정당한 import 는 `grep -n -E 'from "./colab-(errors\|input)"' lib/colab-job-runner.ts` = 6행 · 7행 정확히 2건 |
| N5 `[GATE]` Q2 의 출처 줄 포인터가 절 제목을 가리킴 | 계획은 바꾸지 않는다 — 답변 (C) 자체는 문서 내용과 일치한다. `## refutations` 에 측정과 함께 정정 항목 1건을 추가했다 | `sed -n '227p'` = `### 프로비저닝 (1회, scripts/provision-worker.sh 신규)`. 인용한 내용은 250행과 284행에 있다 |
| N6 `OW-209` §3 금지 행위 ↔ 2-2 조건부 지시 충돌 | 금지 행위 줄에 예외를 명시했다 — "예외는 2-2 의 조건부 대상 1건(`tests/remote-worker-contract.test.ts`)뿐이며, 그 파일에 `colab` 이 남아 있을 때만 2-2 와 §3 「조건부 대상」이 정한 범위대로 해당 어서션을 대체한다". 금지 행위 목록만 읽고 판단하는 워커도 이제 예외를 본다 | 현재 `grep -ci colab tests/remote-worker-contract.test.ts` = 3, 전부 `colab_runtime_versions` 어서션이라 `OW-201` 이 제 몫을 하면 이 조건부 경로는 발동하지 않는다 |

### 구조 (변경 없음)

`[GATE r2]` 가 지시한 OW-210 전역 백스톱 구조는 라운드 4에서 확정한 그대로다 — 2-1 체크 세트 5종 + 2-2 전역 스윕 2건(`git grep -ri colab` 0건, `git grep -F 'AbortSignal.any'` 0건), 스윕이 지목한 경로에 한정된 사후 수정 권한 4개 조건, `target_files` 무확장. 이번 라운드가 추가한 로컬 판정 2건(`OW-202` 2-2b 상한 게이트, `OW-205` 2-4 완료 판정)도 전부 1차 방어선이고 2차는 여전히 OW-210 이다.

§4 check 4(공유-쓰기 순서)를 이번 라운드에도 직접 계측했다 — `target_files` 는 한 건도 바뀌지 않았고, `deps` 이행 폐포에서 공유-쓰기 쌍 **87건 전부 순서 있음, 미정렬 0건**이다. 폐포 크기는 OW-200 0 · OW-201 1 · OW-202 0 · OW-203 1 · OW-204 2 · OW-205 3 · OW-206 0 · OW-207 2 · OW-208 8 · OW-209 9 · OW-210 10 으로 라운드 4와 동일하며, OW-210 은 여전히 웨이브의 유일한 싱크 노드다.

## requirement_map

`[ANALYZE]` 25항 + `[GATE]` 26·27항 전부 매핑. 라운드 4에서 확정한 소유자와 동일하다 — 이번 라운드는 태스크를 신설하거나 폐기하지 않았고 `target_files` 도 바꾸지 않았다.

```
1 → OW-200        2 → OW-200        3 → OW-201        4 → OW-201
5 → OW-201        6 → OW-201        7 → OW-201        8 → OW-201
9 → OW-202       10 → OW-202       11 → OW-203       12 → OW-203
13 → OW-203      15 → OW-204       16 → OW-203       17 → OW-206
18 → OW-207      19 → OW-206       20 → OW-206       22 → OW-208
24 → OW-205 · OW-210               25 → OW-210
14 → OW-203 · OW-206 · OW-210
21 → OW-206 · OW-209
23 → OW-200 · OW-201 · OW-206 · OW-207 · OW-208 · OW-209 · OW-210
26 → OW-202 · OW-203               27 → OW-204 · OW-209
```

GATE 확정 답변 5건도 전부 태스크로 내려가 있다 — Q1(A) → `OW-201` · `OW-207` 의 `py_compile` / `bash -n` 판정, Q2(C) → `OW-200`, Q3 T23·T24 편입 → `OW-202` · `OW-203` · `OW-204` · `OW-209`, Q4(A) → `OW-208` · `OW-209`, Q5(B) 120s·400 고정 + burst·드라이버 임계값 위임 → `OW-206` · `OW-207`. `[GATE r2]` 의 구조 지시는 `OW-210` 2-2 가 소유한다.

전역 불변식 2건의 소유 사슬 — 제공요건 14 는 1차 `OW-203`(자기 파일) · `OW-206`(`CLAUDE.md`), 2차 `OW-210`. 제공요건 23 은 1차 `OW-200` · `OW-201` · `OW-202`(이번 라운드 신설 상한 게이트) · `OW-204` · `OW-206` · `OW-207` · `OW-208` · `OW-209`(각자 자기 파일), 2차 `OW-210`.
