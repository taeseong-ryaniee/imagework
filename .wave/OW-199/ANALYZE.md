[ANALYZE]

## Facts

### anchor_candidates

목표 문단에 등장하는 리터럴 토큰 전수. 측정 명령은 `git grep -I -o -F -- "<s>" | wc -l` (hits) 및 `git grep -I -l -F` (files), 대상은 추적 파일만, 실행 커밋 `7b3e205`.

| 문자열 | files | hits |
|---|---|---|
| `Colab` | 17 | 74 |
| `colab` | 20 | 100 |
| `D18` | 0 | 0 |
| `Approach A` | 0 | 0 |
| `stdio` | 1 | 1 |
| `RTX 3090` | 0 | 0 |
| `3090` | 0 | 0 |
| `20MP` | 0 | 0 |
| `hard-cancel` | 0 | 0 |
| `20260721T005918Z-89757` | 0 | 0 |

보충 후보 — 목표 문단이 지시하는 로드맵 T2~T20이 실제로 손대는 식별자. 노드 2가 앵커를 고를 때 목표 문단 토큰만으로는 부족하므로 함께 계측했다.

| 문자열 | files | hits |
|---|---|---|
| `remote-worker` | 6 | 9 |
| `local-worker` | 0 | 0 |
| `local-job-runner` | 0 | 0 |
| `ColabJobRunner` | 4 | 28 |
| `AbortSignal.any` | 2 | 2 |
| `isolatedEnvironment` | 2 | 5 |
| `recoverStaleJobs` | 2 | 3 |
| `check:colab-notebook` | 3 | 5 |
| `createProcessHandler` | 3 | 10 |
| `createCancelHandler` | 3 | 10 |
| `CommandRunner` | 3 | 13 |
| `JobCancelledError` | 5 | 17 |
| `JobTimeoutError` | 3 | 7 |
| `CommandExecutionError` | 4 | 25 |
| `ImageworkInputError` | 6 | 28 |
| `IMAGEWORK_RECOVERY_ROOT` | 7 | 10 |
| `IMAGEWORK_HF_TOKEN` | 5 | 8 |
| `IMAGEWORK_JOB_SCRIPT` | 5 | 8 |
| `IMAGEWORK_MAX_QUEUE_DEPTH` | 7 | 10 |
| `IMAGEWORK_JOB_TIMEOUT_SECONDS` | 5 | 8 |
| `x-imagework-processing-code` | 5 | 5 |
| `IMAGEWORK_RESULT_TTL_SECONDS` | 0 | 0 |
| `queuePosition` | 0 | 0 |
| `registerJob` | 0 | 0 |

0건 앵커 24건 중 9건은 **신규 도입 대상**(`local-worker`, `local-job-runner`, `IMAGEWORK_RESULT_TTL_SECONDS`, `queuePosition` 등)이라 0건이 정상이다. `D18`·`Approach A`·`3090`·`20MP`·`hard-cancel`·`run_id`는 설계 문서에만 있고 저장소에는 없으므로 앵커로 쓸 수 없다.

### target_state

대상 경로는 목표 문단이 지목한 로드맵 T2~T20의 `files` 합집합(출처: `~/.gstack/projects/taeseong-ryaniee-imagework/tasks-eng-review-20260721-095918.jsonl`, 20행, run_id 일치 확인). 측정: `stat -f "%z %Sm"`.

| 경로 | 상태 | 크기 | 최종수정 | 관련 태스크 |
|---|---|---|---|---|
| `runner/sam3-local-requirements.lock` | 없음(신규) | — | — | T3 |
| `runner/local-worker.py` | 없음(신규) | — | — | T3 T4 T5 |
| `lib/local-job-runner.ts` | 없음(신규) | — | — | T6 |
| `app/api/process/status/route.ts` | 없음(신규) | — | — | T8 |
| `app/api/process/result/route.ts` | 없음(신규) | — | — | T9 |
| `tests/local-job-runner.test.ts` | 없음(신규) | — | — | T13 |
| `tests/process-job-registry.test.ts` | 없음(신규) | — | — | T13 |
| `scripts/provision-worker.sh` | 없음(신규) | — | — | T16 |
| `deploy/imagework.service.example` | 없음(신규) | — | — | T17 |
| `tests/remote-worker-contract.test.ts` | 존재 | 3438 | 2026-07-14 14:08 | T3 |
| `lib/process-job-registry.ts` | 존재 | 4744 | 2026-07-14 11:35 | T7 |
| `app/api/process/route.ts` | 존재 | 4088 | 2026-07-28 16:41 | T10 T11 |
| `app/api/process/cancel/route.ts` | 존재 | 2018 | 2026-07-14 13:50 | T11 |
| `components/image-processor.tsx` | 존재 | 22178 | 2026-07-28 17:04 | T12 |
| `tests/image-processor.test.tsx` | 존재 | 18208 | 2026-07-28 16:47 | T13 |
| `tests/process-cancel.test.ts` | 존재 | 10184 | 2026-07-28 16:44 | T13 |
| `lib/colab-errors.ts` | 존재 | 1526 | 2026-07-14 12:07 | T14 |
| `.env.example` | 존재 | 4440 | 2026-07-14 15:50 | T15 |
| `deploy/nginx.conf.example` | 존재 | 1889 | 2026-07-14 13:36 | T17 |
| `docs/server-worker.md` | 존재 | 11158 | 2026-07-14 15:57 | T18 |
| `docs/reverse-proxy.md` | 존재 | 1912 | 2026-07-14 13:36 | T18 |
| `README.md` | 존재 | 7857 | 2026-07-14 16:01 | T18 |
| `CLAUDE.md` | 존재 | 6247 | 2026-07-20 17:52 | T18 |
| `lib/colab-job-runner.ts` | 존재(삭제 대상) | 20466 | 2026-07-28 16:41 | T19 |
| `colab/imagework.ipynb` | 존재(삭제 대상) | 929 | 2026-07-14 13:24 | T19 |
| `scripts/check-colab-notebook.mjs` | 존재(삭제 대상) | 2107 | 2026-07-14 13:23 | T19 |
| `tests/colab-job-runner.test.ts` | 존재(삭제 대상) | 29615 | 2026-07-28 16:43 | T19 |
| `package.json` | 존재 | 1032 | 2026-07-28 17:23 | T19 T20 |
| `runner/` (디렉터리) | 존재 | 5개 파일 | 2026-07-14 18:41 | T2 T3 |
| `scripts/` (디렉터리) | 존재 | 2개 파일 | 2026-07-14 12:54 | T16 |
| `docs/` (디렉터리) | 존재 | 2개 파일 | 2026-07-14 12:54 | T18 |

기준선 측정 — 작업 트리 clean(`git status --porcelain` 무출력), HEAD `7b3e205`. `npx vitest run` = **6 파일 / 68 테스트 전부 통과**, 9.11초. 파일별 내역: `colab-job-runner.test.ts` 27, `image-processor.test.tsx` 17, `process-cancel.test.ts` 11, `zip-contract.test.ts` 8, `check-public-artifacts.test.ts` 4, `remote-worker-contract.test.ts` 1.

호스트 환경 — `nvidia-smi` 없음(darwin 25.5.0). `python3` = 3.9.6(시스템), `/Users/taeseongyi/.local/bin/python3.12` = 3.12.13 + pip 26.1.2 존재. `https://download.pytorch.org/whl/cu128/torch/` HTTP 200 / 0.17초.

### active_conflicts

`orca-workers` 실행 결과 — 이 저장소 `ACTIVE:1 FREE:2`. 유일한 ACTIVE는 본 노드 자신(`term_57d0be8b`, task_24ead6e9dfa9). 대상 파일을 잡은 다른 ACTIVE 워커 **0건 → 충돌 없음**. FREE 2건(`term_240f117d`, `term_9d69c2ac`)은 매칭 태스크 없음.

부수 관측 — `orca-workers`의 정합성 경고에 다른 Run의 태스크 ID 중복 4건이 뜨지만 전부 `completed`/`failed` 상태의 과거 Run(run_11408b9d59c0, run_4dc392a596a8, run_99ef5d263105, run_f156b31549ff)이며 본 웨이브 `run_55563c78426e`와 무관하다.

### carryover

**없음 — 본 웨이브가 첫 웨이브다.** 부모 이슈 OW-199 description에 이전 웨이브 3항목 요약(pass/fail · 귀속 노드 · 이월) 섹션이 존재하지 않음(`orca linear issue OW-199 --full --json` 확인, 코멘트 0건, 자식 이슈 0건, activity 3건 전부 생성/할당/상태변경).

관련 이슈로 OW-198(완료)이 `relatedTo`로 연결돼 있으나 이는 별개 기능(PNG/SVG/ZIP + 드래그 크롭)의 완료 기록이지 이월 항목이 아니다.

### non_git_paths

**`(none)`**

주입 소스 해소 — (1) 부모 이슈 OW-199 description은 주입 키를 스스로 선언하지 않는다(`## Goal (verbatim)` / `## Trigger-threshold reason` / `## Wave state` / `## 블록 사유` / `## 관련` 5개 섹션뿐). (2) 따라서 대상 경로를 관장하는 `CLAUDE.md`로 넘어간다. 대상 경로가 전부 `/Users/taeseongyi/Desktop/GitHub/imagework/` 아래이므로 관장 파일은 `/Users/taeseongyi/Desktop/GitHub/imagework/CLAUDE.md` 1개다(`find . -name CLAUDE.md -not -path "*/node_modules/*"` 결과 1건). 해당 파일에 `## Wave Injection` 섹션 없음(`grep -n "Wave Injection" CLAUDE.md AGENTS.md` 무출력).

**출처 파일: `/Users/taeseongyi/Desktop/GitHub/imagework/CLAUDE.md` — 섹션 부재.**

### skills

**`(none)`**

출처는 위 `non_git_paths`와 동일 — `/Users/taeseongyi/Desktop/GitHub/imagework/CLAUDE.md`, `## Wave Injection` 섹션 부재. `analyze_extra` 키도 같은 이유로 부재이므로 추가 행 없음.

주의 — 저장소 `CLAUDE.md`에는 `## Skill routing` 섹션이 따로 있으나 이는 웨이브 주입 키가 아니라 대화형 스킬 라우팅 규칙이므로 `skills` 값으로 채택하지 않았다.

### snapshot

**`/Users/taeseongyi/.gstack/projects/taeseong-ryaniee-imagework/wave-snapshots/2026-08-11-t2-t20`  —  50개 파일**

측정: `find <dir> -type f | wc -l` = 50. 디렉터리 생성 시각 2026-08-11 10:40(코디네이터가 본 노드 실행 전 생성). 위 `target_state`에 "존재"로 기록된 대상 경로 전부가 스냅샷에 포함돼 있음을 확인했다 — `.env.example`, `app/api/process/route.ts`, `app/api/process/cancel/route.ts`, `components/image-processor.tsx`, `deploy/nginx.conf.example`, `docs/server-worker.md`, `docs/reverse-proxy.md`, `lib/colab-errors.ts`, `lib/colab-job-runner.ts`, `lib/process-job-registry.ts`, `package.json`, `README.md`, `CLAUDE.md`, `colab/imagework.ipynb`, `runner/*`(5), `scripts/*`(2), `tests/*`(6), `DESIGN.md` 포함. 신규 생성 대상 9건은 원본이 없으므로 스냅샷에도 없다(정상).

## Questions

### Q1. 3090 물리 서버 없이 GPU 의존 태스크(T4·T5·T16)의 "완료" 기준을 무엇으로 잡는가?

해결 대상: 제공요건 2, 5, 6, 16

로드맵이 규정한 verify가 이 호스트에서 실행 불가다 — T4 `--self-test` 통과, T5 취소 유예 실측, T16 "서버에서 스크립트 실행, self-test 통과로 비0 종료 없이 완주". 측정: `which nvidia-smi` → not found. T1이 같은 이유로 이미 웨이브에서 제외됐다.

- **(A) 정적 검증만으로 완료 처리** — 파일 존재 + `python3.12 -m py_compile runner/local-worker.py` 종료 0 + `bash -n scripts/provision-worker.sh` 종료 0 + fake 워커를 주입한 `lib/local-job-runner.ts` 유닛 테스트 통과. 측정: `/Users/taeseongyi/.local/bin/python3.12 -m pip --version` → `pip 26.1.2 (python 3.12)` 확인, py_compile은 표준 모듈이라 별도 설치 불요. GPU 실측은 T1 후속 웨이브로 이월.
- **(B) T4·T5·T16을 T1과 함께 후속 웨이브로 제외** — 이번 웨이브를 T2·T3·T6~T15·T17~T20(16건)으로 축소. 단 T6(`local-job-runner.ts`)이 T4의 stdio 프로토콜을 상대하므로 프로토콜 스펙을 문서로 먼저 고정해야 한다.
- **(C) `--self-test`에 CPU 전용 경로를 추가해 이 호스트에서 실행** — torch CPU 빌드로 SAM3 추론을 돌려 경로를 확인. **(unverified)** — 저장소에 torch가 설치돼 있지 않고(`git grep torch` 대상 없음, `package.json`은 Node 의존성뿐) SAM3 체크포인트도 없어 CPU 추론 성립 여부를 측정하지 못했다.

### Q2. T2(torch/torchvision CUDA 휠 해시 고정 검증) 게이트를 이 호스트에서 어떤 명령으로 통과 판정하는가?

해결 대상: 제공요건 1

로드맵 T2의 verify는 "락 파일 초안으로 `pip install --require-hashes` 성공"이다. macOS arm64에서 linux CUDA 휠은 설치 자체가 플랫폼 불일치로 실패한다.

- **(A) `pip download`의 크로스플랫폼 해석으로 대체** — `python3.12 -m pip download --require-hashes --only-binary=:all: --platform manylinux_2_28_x86_64 --python-version 3.12 -r runner/sam3-local-requirements.lock` 종료 0을 게이트로 삼는다. 측정 완료: `python3.12 -m pip download --help`에 `--require-hashes` / `--platform` / `--python-version` / `--only-binary` 4개 플래그 전부 존재(pip 26.1.2), 그리고 `https://download.pytorch.org/whl/cu128/torch/` HTTP 200 / 0.167초로 인덱스 도달 가능.
- **(B) T2를 T1과 함께 후속 웨이브로 이월** — 그러면 T3이 생성하는 `sam3-local-requirements.lock`의 해시가 어떤 방법으로도 검증되지 않은 채 남고, T4·T5가 그 락에 SHA-256 상수로 묶인다.
- **(C) (A)를 이번 웨이브 게이트로 쓰고, 서버 확보 후 `pip install --require-hashes` 재실행을 T16 프로비저닝 0단계에 남긴다** — 설계 문서 227행 "프로비저닝 0단계"가 이미 이 재실행 지점을 정의하고 있음을 확인했다.

### Q3. T21/T23/T24/T25를 이번 웨이브에 접는가, 별도 후속 웨이브로 두는가?

해결 대상: 제공요건 9, 13, 18, 21 (및 신규)

부모 이슈 제목은 이 4건을 "대기"로 규정하지만, 대기 사유였던 두 마이그레이션이 바로 이번 웨이브 T2~T20이다. 목표 문단은 "T2~T20을 이번 웨이브에서 처리한다"로 범위를 명시한다. 파일 충돌 측정 결과:

- T23(`queuePosition` 1-기반 필드) → `app/api/process/status/route.ts`(T8이 신설) + 큐 레지스트리(T7이 확장). `git grep -F queuePosition` = **0건**이므로 T8이 그냥 지나가면 같은 신규 파일을 두 번 편집하게 된다.
- T24(Colab 카피 전수 교체 + "이 창을 닫지 마세요" 삭제 + T19 grep 확장) → `app/page.tsx`(colab 1건) + `components/image-processor.tsx`(colab 2건, T12가 재작성) + 검증 스크립트(`scripts/check-public-artifacts.mjs`, colab 1건). 측정: `grep -ric colab app/ components/` → `app/page.tsx:1`, `app/api/process/cancel/route.ts:2`, `app/api/process/route.ts:8`, `components/image-processor.tsx:2`.
- T25(접근성 패키지) → `components/image-processor.tsx` + `DESIGN.md`. T12가 같은 파일을 재작성한다.
- T21(DESIGN.md 계약 개정) → `DESIGN.md` 단독(16259 bytes, 2026-07-28 17:25). 다른 태스크와 파일 겹침 없음.

또한 설계 문서의 T12 정의는 "본 문서의 '프런트엔드 비동기 대기 화면 설계' 섹션(D28·D31~D36)의 상태 모델·카피·복구·오류 정책을 수용 기준으로 삼는다"이고, T13은 "queued/processing 분리 표시, result-ready 명시적 다운로드, localStorage 복구, 폴링 백오프, 취소 확인 중, TTL 만료 카피"를 테스트 항목으로 못박는다 — 즉 T24·T25의 상당 부분이 이미 T12/T13 수용 기준 안에 들어있다.

- **(A) T23·T24를 이번 웨이브에 접고 T21·T25는 후속** — T23·T24는 T7/T8/T12/T19가 어차피 손대는 파일 안에서 끝나므로 재편집이 0. T21(DESIGN.md 계약)·T25(스크린리더 수동 QA 필요)는 독립 실행 가능.
- **(B) 4건 전부 이번 웨이브에 접는다** — `components/image-processor.tsx` 편집 패스가 1회로 줄지만 웨이브 태스크가 19건 → 23건이 되고, T25 verify가 수동 스크린리더 QA라 자동 검증 불가 항목이 하나 늘어난다.
- **(C) 목표 문단대로 엄격히 T2~T20만** — 대신 T8 신설 시 `queuePosition` 자리를 비워두게 되어 후속 웨이브가 `app/api/process/status/route.ts`·`lib/process-job-registry.ts`·`components/image-processor.tsx` 3개 파일을 재편집한다.

### Q4. Colab 시대 산출물의 삭제 경계를 어디까지로 긋는가?

해결 대상: 제공요건 19, 20

T19의 삭제 목록은 `lib/colab-job-runner.ts`, `colab/imagework.ipynb`, `scripts/check-colab-notebook.mjs`, `tests/colab-job-runner.test.ts`, `package.json` 스크립트 항목 5건이다. **`runner/remote-worker.py`(12501 bytes)는 어떤 태스크의 files에도 없다.** 측정: `git grep -l remote-worker` = 6개 파일(`.env.example`, `CLAUDE.md`, `docs/server-worker.md`, `lib/colab-job-runner.ts`, `tests/colab-job-runner.test.ts`, `tests/remote-worker-contract.test.ts`) — 이 중 4개는 T14/T15/T18/T19/T3이 삭제하거나 재작성한다. 남는 참조는 사실상 `runner/remote-worker.py` 자신뿐이 된다.

`runner/` 하위 나머지도 귀속 미정 — `sam3-requirements.lock`(30700 bytes), `sam3-build-requirements.lock`(559), `vtracer-Cargo.lock`(22392), `LOCKS.md`(2938). 단 `vtracer-Cargo.lock`은 유지가 확정적이다: 결정 로그 `d1a0803d` "Rust 툴체인 제거(마이그레이션 안정화 후)"가 이번 범위 제외를 명시했고, T16 프로비저닝 4단계가 vtracer를 소스 빌드한다.

삭제 규모도 측정했다 — `tests/colab-job-runner.test.ts`는 68개 중 **27개 테스트**를 차지한다. T19 이후 이 호스트에서 실제로 동작 검증 가능한 백엔드 경로는 0이 된다(`nvidia-smi` 없음).

- **(A) T19 목록 + `runner/remote-worker.py` + `sam3-requirements.lock` + `sam3-build-requirements.lock` 삭제, `vtracer-Cargo.lock` 유지, `LOCKS.md`는 로컬 락 기준으로 재작성** — 목표 문단의 "Colab 처리 백엔드를 로컬 처리로 전환"에 가장 충실. `git grep -ri colab` 0건 달성.
- **(B) T19 목록만 삭제하고 `runner/remote-worker.py`와 Colab 시대 락 3종은 3090 프로비저닝 검증까지 보존** — T4가 `remote-worker.py`의 추론 코어를 이식 원본으로 쓰므로 원본을 곁에 두는 편이 안전. 대신 `git grep -ri colab` 0건은 이번 웨이브에서 달성 불가.
- **(C) `lib/colab-job-runner.ts`를 환경 스위치 뒤에 남겨 폴백으로 유지** — 3090 확보 전까지 서비스가 계속 동작. 단 D18 비동기 API로 전환되므로 Colab 러너도 새 registry 상태 머신에 맞춰 재배선해야 하고, 삭제할 코드에 추가 작업이 들어간다.

### Q5. 설계 문서의 `(구현 시 확정)` 자리표시자 4건을 게이트에서 정하는가, 구현 워커에게 위임하는가?

해결 대상: 제공요건 10, 17

설계 문서에 미확정으로 남은 값 — (a) `proxy_read_timeout` 정확값, (b) 각 location 블록의 `limit_req` burst 값, (c) NVIDIA 드라이버/CUDA 최소 버전 임계값과 `nvidia-smi` 파싱 방식(D21c), (d) TTL 만료 jobId 처리. 측정 결과 (a)와 (d)는 문서에 기본값이 이미 서술돼 있다: 263행 "모든 엔드포인트에 `proxy_read_timeout 120s` 수준", 349행 "만료 jobId를 잘못된 jobId와 동일 취급 400". (b)와 (c)는 어떤 기본값도 없다.

- **(A) 전부 구현 워커 위임** — 문서가 명시적으로 "(구현 시 확정)"으로 미룬 항목이므로 워커가 값을 고르고 근거를 커밋 메시지/문서에 남긴다. 노드 4는 "값이 채워지고 문서와 일치"만 검증.
- **(B) (a)·(d)는 문서 기본값(120s / 400)으로 고정하고 (b)·(c)만 워커 위임** — 사용자 노출 계약(HTTP 상태 코드)과 프록시 타임아웃은 게이트에서 못박고, 서버 하드웨어에 종속된 값만 남긴다.
- **(C) 4건 전부 게이트에서 확정** — (c)는 3090 서버가 없어 `nvidia-smi` 실제 출력을 볼 수 없으므로 임계값을 추정으로만 정하게 된다.

## Provisional requirements

1. `runner/sam3-local-requirements.lock` 파일이 존재하고 torch·torchvision·numpy·Pillow가 각각 `--hash=sha256:` 항목과 함께 고정돼 있다.
2. 락 파일 초안에 대해 해시 검증 명령이 종료 코드 0으로 완주한 기록이 남아 있다. *(assumed: Q2에서 `pip download --platform manylinux_2_28_x86_64 --python-version 3.12 --only-binary=:all: --require-hashes` 대체안(A/C)이 채택된다)*
3. `runner/local-worker.py` 파일이 존재하고 `python3.12 -m py_compile` 종료 코드 0을 통과한다.
4. `runner/local-worker.py`가 SAM3 모델을 기동 시 1회 로드하고 작업마다 추론만 수행하는 구조다 — 모델 로드 호출이 작업 루프 바깥에 정확히 1곳 존재한다.
5. `runner/local-worker.py`가 `sam3-local-requirements.lock`의 SHA-256을 상수로 보유하고 불일치 시 기동을 중단한다.
6. `runner/local-worker.py`가 기동 시 fd 1을 dup2로 재지정해 프로토콜 JSON 이외의 stdout 출력이 부모 프로세스에 도달하지 않는다.
7. `runner/local-worker.py`가 SIGUSR1 취소 체크포인트를 2곳 이상 보유하고, 결과 ZIP을 임시 이름으로 쓴 뒤 rename으로 확정한다.
8. `tests/remote-worker-contract.test.ts`가 `runner/local-worker.py`를 대상으로 갱신됐고 통과한다.
9. `lib/local-job-runner.ts` 파일이 존재하고 FIFO 큐·워커 재스폰·서킷브레이커(10분 3회)·`currentJobId` 스코핑 취소·방어적 stdout 파서·GPU flock·기동 시 tmp 스윕 7개 요소를 전부 포함한다.
10. `lib/process-job-registry.ts`가 `queued`/`processing`/`done`/`failed`/`cancelled` 5개 상태와 결과 경로·TTL을 관리하며, 기존 pending-cancellation TTL 동작이 보존된다.
11. `app/api/process/status/route.ts`가 존재하고 GET 요청에 상태별 바디를 반환하며, 미존재·부정 jobId에 400을, processing code 불일치에 거부를 반환한다.
12. `app/api/process/result/route.ts`가 존재하고 done 상태에서 결과 파일을 반환하며, TTL 만료 jobId를 400으로 처리한다. *(assumed: Q5에서 400 고정안이 채택된다 — 미채택 시 워커가 정한 코드로 대체)*
13. `POST /api/process`가 처리 완료를 기다리지 않고 `202` + `{jobId}`를 즉시 반환한다.
14. `git grep -F "AbortSignal.any"` 결과가 0건이고, 취소는 명시적 취소 API 경유로만 발생한다.
15. `components/image-processor.tsx`가 제출 → 상태 폴링 → done 시 결과 다운로드 플로우로 동작하고, 처리 중 취소 버튼이 동작한다.
16. `lib/colab-errors.ts`에 문자열 `Colab`이 0건이고 `JobCancelledError` 메시지가 명시적 취소를 서술한다.
17. `.env.example`에서 `IMAGEWORK_COLAB_*`·`IMAGEWORK_HF_TOKEN`·`IMAGEWORK_RECOVERY_ROOT`·`IMAGEWORK_JOB_SCRIPT`가 제거되고 `IMAGEWORK_WORKER_PYTHON`·`IMAGEWORK_WORKER_SCRIPT`·`IMAGEWORK_MODEL_CACHE`·`IMAGEWORK_VTRACER_BIN`·`IMAGEWORK_RESULT_TTL_SECONDS`가 추가돼 있다.
18. `scripts/provision-worker.sh`가 존재하고 0~7단계를 전부 포함하며 `bash -n` 종료 코드 0을 통과한다.
19. `deploy/imagework.service.example`이 존재하고 `Restart=on-failure`와 journald 로깅을 포함한다.
20. `deploy/nginx.conf.example`에서 옛 7350초 타임아웃 공식이 제거되고, `client_max_body_size 11m`이 `/api/process` 제출 위치에만 남는다.
21. `docs/server-worker.md`·`docs/reverse-proxy.md`·`README.md`·`CLAUDE.md`가 로컬 워커 + 비동기 API 흐름을 서술하고, 이 4개 파일에서 대소문자 무시 `colab` 검색이 0건이다.
22. `lib/colab-job-runner.ts`·`colab/imagework.ipynb`·`scripts/check-colab-notebook.mjs`·`tests/colab-job-runner.test.ts` 4개 파일이 삭제되고 `package.json`에서 `check:colab-notebook` 항목이 제거된다. *(assumed: Q4에서 (A) 또는 (B)가 채택된다 — (C) 채택 시 `lib/colab-job-runner.ts`는 존치)*
23. `git grep -ri colab` 결과가 저장소 전체에서 0건이다. *(assumed: Q4에서 (A)가 채택된다 — (B) 채택 시 `runner/remote-worker.py` 및 관련 락 잔존을 허용)*
24. `npm test`가 전부 통과하고, 통과 테스트 수가 기준선 68건에서 `colab-job-runner.test.ts` 27건을 뺀 41건 이상이다.
25. `npx tsc --noEmit`·`npm run lint`·`npm run check:public-artifacts`·`npm run build` 4개 명령이 각각 종료 코드 0으로 완주한다.
