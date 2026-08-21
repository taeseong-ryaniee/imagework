[PLAN r4]

웨이브를 6건 이하로 쪼갤 수 없는 이유 — T2~T20 과 GATE Q3 로 편입된 T23·T24 가 sync→async 라는 단일 계약 변경을 공유해서 프로토콜(워커·러너)·상태 머신(레지스트리·라우트)·화면(폴링)·삭제 정리가 같은 릴리스 안에서 동시에 성립해야 하고, 로드맵 19건을 파일 소유권 단위로 최대한 병합한 결과가 11건이다. 라운드 1~3과 태스크 집합·개수는 동일하며(신설·폐기 0), 이번 라운드는 `[GATE r2]` 의 구조 지시 1건 + `[RED r3]` 블로커 3건 + 노트 4건 해소만 반영한다.

이 라운드의 코멘트는 2건이다 — 본 코멘트가 dispatch table 과 `## new_anchors` · `## source_reads` · `## refutations` 를 담고, `## red_response` 와 `## requirement_map` 은 바로 다음 코멘트 `[PLAN r4 cont.1]` 에 있다. Linear 코멘트 1건의 저장 상한(20000자)을 넘어 분할했다(합계 21572자).

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

`[ANALYZE]` 의 `anchor_candidates` 에 없던 앵커 전량. 측정은 `grep -cF -- '<s>' <file>`, 커밋 `7b3e205`, 트리 clean. 라운드 3 신규 승격 1건은 `(r3)` 표시. **라운드 4 신규 도입은 0건이다** — 이번 라운드가 dispatch table 에 올린 `AbortSignal.any`(OW-206·OW-210)와 `colab`(OW-210) 두 문자열은 `[ANALYZE]` `anchor_candidates` 에 각각 2 files/2 hits · 20 files/100 hits 로 이미 등재돼 있어 여기 적을 대상이 아니다.

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

## source_reads

라운드 1~3 목록 + 라운드 4 신규 열람(`(r4)`). 라운드 4 의 열람은 전부 `grep` 계수이며 파일 본문을 편집하지 않았다.

```
components/image-processor.tsx — JobState 유니온과 Colab 카피 2건 위치 확인. r3: 45행이 actionLabelFor, 57행이 statusCopyFor 로 서로 다른 함수임을 sed 로 확인 (N1)
tests/remote-worker-contract.test.ts — 승계·폐기 어서션 구분, vtracer-Cargo.lock 참조 1건. r3: colab 3건이 35·39·40행 colab_runtime_versions 어서션임을 grep -ni 로 확인 (B1)
docs/server-worker.md — r3: 폐기 환경변수 4종 잔재 5건 계수 (N2) (grep only)
README.md — r3: 같은 잔재 1건 계수 (N2) (grep only)
lib/colab-errors.ts — 교체할 Colab 메시지 3건 확인
lib/colab-input.ts — 자기 자신의 ./colab-errors 임포트 줄 확인
lib/process-job-registry.ts — 상태 머신 확장 앵커와 보존할 pending-cancellation 범위 확인
app/api/process/route.ts — AbortSignal.any 결합 위치와 핸들러 팩토리 시그니처 확인. r4: 38행 1건 재계수 (B1)
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
runner/remote-worker.py — 이식 원본 함수·상수 이름, SAM3_SHA256 유일 보유 파일 확인. r4: grep -ci colab = 11 재계수 (B2) (grep only)
~/.gstack/projects/taeseong-ryaniee-imagework/taeseongyi-main-design-20260720-182557.md — D18~D22·D28~D41·프로비저닝 0~7단계 계약 전문
~/.gstack/projects/taeseong-ryaniee-imagework/tasks-eng-review-20260721-095918.jsonl — T1~T20 정의와 files 목록 (run_id 20260721T005918Z-89757 일치 확인)
CLAUDE.md — r4: AbortSignal.any 1건과 폐기 IMAGEWORK_* 1건을 grep -cF / grep -cE 로 계수 (B1 · N1) (grep only)
tests/process-cancel.test.ts — r4: 폐기 IMAGEWORK_* 4건 계수 (N4) (grep only)
runner/sam3-requirements.lock — r4: 3행 Colab base-runtime 주석 원문을 grep -n -i 로 확인 (B2) (grep only)
```

## refutations

라운드 1·2에서 세운 반박 5건 전부 이번 계획에도 그대로 유효하다. 라운드 3·4에서 새로 세운 반박은 없다 — `[GATE r2]` 의 구조 지시는 반박 대상이 아니라 그대로 실행한 지시다.

```
ls docs/ | wc -l — 3 — [ANALYZE] target_state 의 "docs/ (디렉터리) | 존재 | 2개 파일" 을 반박. 실제는 colab-results.md · reverse-proxy.md · server-worker.md 3개다. colab-results.md 는 로드맵 어느 태스크의 files 에도 없어 무주공산이었으므로 OW-208 삭제 목록에 편입하고, 이를 참조하는 README.md 링크 2건 제거를 OW-206 에 넣었다.

D=$(mktemp -d); git check-ignore -v -- "$D" — fatal: ... is outside repository at '/Users/taeseongyi/Desktop/GitHub/imagework' (종료 128) — [ANALYZE] non_git_paths 의 "(none)" 을 반박. OW-200 2-3 의 해시 게이트가 저장소 밖 임시 디렉터리에 pip download 산출물을 내려받으므로 이 웨이브에는 비-git 경로가 1건 존재한다. 라운드 2에서 고정 경로를 mktemp -d 산출 경로로 바꾸고 rm -rf 대상을 그 디렉터리 하나로 한정했다.

git grep -Ilc -i -- colab | grep -v -E '^(colab/imagework\.ipynb|lib/colab-job-runner\.ts|scripts/check-colab-notebook\.mjs|tests/colab-job-runner\.test\.ts|runner/remote-worker\.py|runner/sam3-requirements\.lock|docs/colab-results\.md)$' — 19개 파일(.env.example .gitignore CLAUDE.md README.md app/api/process/cancel/route.ts app/api/process/route.ts app/page.tsx components/image-processor.tsx docs/server-worker.md lib/colab-errors.ts lib/colab-input.ts lib/process-job-registry.ts lib/zip-contract.ts package.json runner/LOCKS.md scripts/check-public-artifacts.mjs tests/check-public-artifacts.test.ts tests/process-cancel.test.ts tests/remote-worker-contract.test.ts) — [GATE] Q4 (A) 의 "git grep -ri colab 0건 달성" 을 반박. (A) 가 열거한 삭제 집합만으로는 19개 파일이 남고, 그 중 lib/colab-errors.ts · lib/colab-input.ts 는 파일명 자체와 16곳의 import 경로다. 0건은 두 모듈 rename 없이 도달 불가이므로 OW-209 를 신설했다. 이 rename 은 설계 문서의 "lib/colab-errors.ts 파일명 유지" 및 "lib/zip-contract.ts 무수정 재사용" 서술과 충돌하므로 OW-209 스펙에서 zip-contract.ts 변경을 import 2줄로 못박았다. 목록 마지막 tests/remote-worker-contract.test.ts 가 라운드 3 블로커 B1 대상이다.

grep -cF -- 'iopath==0.1.10' runner/sam3-requirements.lock — 1 — [GATE] Q2 (C) 의 단일 게이트 명령(pip download --require-hashes --only-binary=:all: --platform manylinux_2_28_x86_64 --python-version 3.12)을 반박. iopath 0.1.10 은 소스 배포만 발행해 --only-binary=:all: 로 받히지 않는다. OW-200 에서 게이트를 2단계로 분해했다 — iopath 제외 사본으로 크로스플랫폼 종료 0 확보 + iopath 는 --platform 없이 --no-binary=:all: 로 해시 확인.

grep -n -F -- 'iopath 0.1.10' runner/LOCKS.md — 24:metadata. iopath 0.1.10 publishes only a source distribution; its exact — [GATE] Q4 (A) 의 sam3-build-requirements.lock 삭제를 부분 반박. 빌드 툴 락은 소스 전용 iopath 를 --no-build-isolation 으로 설치하기 위한 선행 계약이라 로컬 전환 후에도 살아 있다. 옛 파일 삭제는 유지하되 로컬 대응물 runner/sam3-local-build-requirements.lock 신설을 OW-200 에, 2단계 설치 순서를 OW-207 1단계에 넣었다.
```


[PLAN r4 cont.1]

## red_response

실질 편집 8건(OW-200·201·203·204·205·206·207·210), 무수정 3건(OW-202·208·209). 8건 전부 Linear 왕복 대조(`cmp`) 바이트 일치 확인.

### 구조 변경 — `[GATE r2]` 지시

`[GATE r2]` 는 r1·r2·r3 3라운드 연속 블로커의 공통 근본 원인을 "전역 불변식(제공요건 14·23)을 분산 소유로 검증하는 구조" 로 지목하고, **OW-210 을 전역 백스톱으로 재구조** 하라고 지시했다. 그대로 실행했다.

* OW-210 `## 2. Change` 를 2-1(체크 세트 5종)과 **2-2(전역 스윕 2건)** 로 나누고, 2-2 를 이 태스크가 직접 소유하는 완료 판정으로 못박았다 — `git grep -ri colab` 0건, `git grep -F 'AbortSignal.any'` 0건.
* 2-2 에 **사후 수정 권한**을 4개 조건으로 명시했다 — (1) 스윕 출력이 지목한 파일·줄만, `target_files` 밖이어도 수정 가능, (2) 잔존 식별자 제거의 최소 편집만, (3) 금지 행위(테스트 삭제·`skip`·어서션 약화·`git commit`·파일 통째 삭제)는 이 권한으로도 뚫리지 않음, (4) 고친 경로·줄·이유와 어느 태스크의 1차 방어선이 놓쳤는지를 Linear 코멘트와 `worker_done` 에 전부 기록.
* 사후 수정 후 2-1 의 5개 명령 재실행 + 스윕 재실행을 의무화했고, 끝내 0건이 되지 않거나 설계 판단을 요구하면 `--outcome failed` 로 그 파일·줄을 지목해 보고하도록 했다.
* GATE 지시대로 `target_files` 는 **확장하지 않았다**(저장소 전역 `write: true` 없음). 대신 OW-210 `## 3` 의 "예외 없이 무수정" 조항을 2-2 스윕 지목 건에 한해 예외로 열고, 5개 명령 실패는 여전히 사후 수정 대상이 아님을 하위 항목으로 분리했다. `## 3` 금지 행위에 "2-2 권한을 두 스윕 이외의 목적으로 쓰지 않는다" 를 추가했다.
* OW-210 `## 1. Preconditions` 에 두 스윕의 착수 시점 기준선 측정을 추가하고, 0건이 아니어도 블로커가 아님(2-2 소관)을 명시했다.
* 개별 태스크의 로컬 판정은 GATE 지시대로 **전부 유지**했고, 아래 블로커 해소로 오히려 늘렸다. 스펙 문언을 1차/2차 방어선으로 통일해 OW-200·201·203·204·206·207 의 로컬 판정 문구에 "저장소 전역 0건은 OW-210 의 전역 스윕이 2차 방어선으로 확인한다" 를 붙였다.

`target_files` 를 확장하지 않고도 §4 check 4(공유-쓰기 순서)가 깨지지 않는 근거를 계측했다 — dispatch table `deps` 의 이행 폐포에서 OW-210 의 선행 태스크는 **10건, 즉 자신을 뺀 전부**다(`OW-200`~`OW-209`). OW-210 은 웨이브의 유일한 싱크 노드이므로 2-2 가 어느 경로에 쓰든 형제 태스크와 동시 쓰기가 성립하지 않는다.

### `[RED r3]` 블로커 3건

| 블로커 | 조치 | 검증 |
|---|---|---|
| B1 OW-203 — 제공요건 14 에 웨이브 내 회수 경로 없음(`CLAUDE.md:39` 가 OW-203 out-of-scope) | (1) OW-206 전제조건에 `grep -cF -- 'AbortSignal.any' CLAUDE.md` 기대 1 / 종료 0 추가, 2-7 뒤에 완료 판정 블록 신설(기대 `0` / `exit=1`). dispatch table OW-206 `anchors` 에 승격. (2) OW-203 2-1 의 완료 판정을 저장소 전역에서 자기 파일로 좁히고(`grep -cF -- 'AbortSignal.any' app/api/process/route.ts` 기대 `0` / `exit=1`), 나머지 1건의 소유자(OW-206)와 2차 방어선(OW-210)을 스펙 본문에 적었다 | `git grep -n -F 'AbortSignal.any'` = 2건 — `CLAUDE.md:39`, `app/api/process/route.ts:38`. `grep -cF -- 'AbortSignal.any' CLAUDE.md` = 1, 종료 0 |
| B2 OW-201 — 신규 `runner/local-worker.py` 에 `colab` 계측 부재, 회수 경로 없음 | OW-201 2-1 에 이식 금지 항목("`colab_runtime_versions` 등 Colab 런타임 대조 함수·상수·주석은 옮기지 않는다 — 락 SHA-256 상수 3종 대조로 대체")을 넣고, 완료 판정을 `py_compile` + `grep -ci colab runner/local-worker.py` 두 명령으로 확장. 같은 이유로 OW-200 에 2-4b 절을 신설해 신규 락 2종의 `colab` 0건 판정을 추가하고, 2-1 에 출발점 파일 3행 주석을 옮겨 적지 않는다는 지시를 넣었다 | `grep -ci colab runner/remote-worker.py` = 11. `grep -n -i colab runner/sam3-requirements.lock` = `3:# Torch, torchvision, numpy<2, and Pillow are Colab base-runtime invariants and are preflighted separately.` |
| B3 OW-207 — 7단계 정의 자체가 `colab` 리터럴을 유도, 계측·회수 경로 없음 | (1) 7단계 문구에서 리터럴을 지웠다 — "옛 원격 CLI·ADC 관련 요구가 남아 있지 않은지 확인(잔재 점검 + 로그). 점검 명령에도 로그 문구에도 옛 CLI 이름을 문자 그대로 적지 않는다". (2) 완료 판정을 `bash -n` + `grep -ci colab scripts/provision-worker.sh` 두 명령으로 확장. (3) OW-206 2-3 뒤에 `grep -ci colab deploy/imagework.service.example` 기대 `0` / `exit=1` 판정을 신설 | 두 파일 모두 신규 생성 대상이라 편집 전 측정값 없음(`test -e` = 1). 회수 경로는 이제 OW-210 2-2 가 소유한다 |

세 블로커 모두 "잔존을 웨이브 안에서 고칠 태스크가 없다" 가 공통 결함이었고, 위 로컬 계측(1차)과 OW-210 2-2 전역 스윕(2차) 두 층으로 닫았다.

### `[RED r3]` 노트 4건

| 노트 | 조치 |
|---|---|
| N1 OW-206 — 폐기 환경변수 검사가 `CLAUDE.md` 를 안 덮음(측정 1건) | 2-7 완료 판정 블록에 같은 정규식의 `CLAUDE.md` 판정을 넣어 2-5·2-6 과 기준을 맞췄다 |
| N2 `requirement_map` 21행 매핑이 실제 소유와 불일치 | `21 → OW-206 · OW-209` 로 고쳤다. 같은 이유로 `14 → OW-203 · OW-206 · OW-210`, `23` 에 OW-200·OW-206·OW-207 을 추가했다 |
| N3 OW-200 `irreversible` 규칙 문언 긴장 | `false` 를 유지한다. RED 자신이 "실질 위험 0", "뒤집어도 스펙 본문은 바뀌지 않는다" 로 판정했고, 삭제 대상이 그 실행에서 스스로 만든 `$LOCKGATE_DEST` 한 곳뿐이라 기존 데이터 손실 경로가 없다. 되돌릴 수 없는 조작 0건 + 스냅샷 50파일 + `git ls-files` 추적 확인이 근거다 |
| N4 OW-205 — fake `RunnerConfig` 에 폐기 `IMAGEWORK_*` 키 잔존(측정 4건) | 2-4 에 "fake `RunnerConfig` 리터럴에서 폐기된 `IMAGEWORK_*` 키를 함께 지운다" 를 측정값과 함께 넣어 OW-210 에서의 재작업을 없앴다 |

## requirement_map

`[ANALYZE]` 25항 + `[GATE]` 26·27항 전부 매핑. N2 반영으로 14·21·23 행의 소유자를 실제와 맞췄다.

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

GATE 확정 답변 5건도 전부 태스크로 내려갔다 — Q1(A) → OW-201·OW-207 의 `py_compile` / `bash -n` 판정, Q2(C) → OW-200, Q3 T23·T24 편입 → OW-202·OW-203·OW-204·OW-209, Q4(A) → OW-208·OW-209, Q5(B) 120s·400 고정 + burst·드라이버 임계값 위임 → OW-206·OW-207. `[GATE r2]` 의 구조 지시는 OW-210 2-2 로 내려갔다.

전역 불변식 2건의 소유 사슬이 이번 라운드에 확정됐다 — 제공요건 14 는 1차 OW-203(자기 파일)·OW-206(`CLAUDE.md`), 2차 OW-210. 제공요건 23 은 1차 OW-200·OW-201·OW-204·OW-206·OW-207·OW-208·OW-209(각자 자기 파일), 2차 OW-210.
