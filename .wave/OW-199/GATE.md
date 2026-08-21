[GATE]

| # | 항목 | 해결 대상 | class | 답변 | 출처 |
|---|---|---|---|---|---|
| 1 | GPU 없이 T4·T5·T16 완료 기준 | 제공요건 2,5,6,16 | confirmed | (A) 정적 검증만으로 완료 처리 — 파일 존재 + `py_compile` 종료 0 + `bash -n` 종료 0 + fake 워커를 주입한 유닛테스트 통과. GPU 실측은 T1과 함께 후속 웨이브로 이월 | 이 세션 사용자 발언(2026-08-11, "아직 서버 자체가 없음") + T1 제외 결정과의 일관성 |
| 2 | T2 해시 게이트 통과 판정 명령 | 제공요건 1 | confirmed | (C) `pip download --require-hashes --only-binary=:all: --platform manylinux_2_28_x86_64 --python-version 3.12`를 이번 웨이브 게이트로 사용하고, 서버 확보 후 `pip install --require-hashes` 재검증을 T16 프로비저닝 0단계에 남긴다 | 설계 문서 227행 "프로비저닝 0단계"(이미 재실행 지점을 정의) |
| 3 | T21/T23/T24/T25 편입 여부 | 제공요건 9,13,18,21 | user | T23·T24만 이번 웨이브에 편입(T7/T8/T12/T19가 어차피 같은 파일을 손대므로 재편집 회피). T21·T25는 후속 웨이브 | 사용자, 이 세션(2026-08-11) |
| 4 | Colab 산출물 삭제 경계 | 제공요건 19,20 | confirmed | (A) T19 목록 + `runner/remote-worker.py` + `sam3-requirements.lock` + `sam3-build-requirements.lock` 삭제, `vtracer-Cargo.lock`은 유지(결정로그 d1a0803d), `LOCKS.md`는 로컬 락 기준으로 재작성 | 목표 문단("Colab 처리 백엔드를... 로컬 처리로 전환") + git으로 되돌릴 수 있어 저위험 |
| 5 | 설계 문서 (구현 시 확정) 4건 결정 주체 | 제공요건 10,17 | confirmed | (B) `proxy_read_timeout`=120s, TTL 만료 jobId=400은 문서 기본값으로 고정. `limit_req` burst 값과 NVIDIA 드라이버/CUDA 임계값(D21c)은 구현 워커에게 위임 | 설계 문서 263행("120s 수준")·349행("만료 jobId ... 400") 기존 서술 |

## Scope amendment (Q3 반영)

T23(`queuePosition` 1-기반 필드)은 T7(레지스트리 확장)·T8(status 라우트 신설)에 접혀 들어간다. T24(Colab 문구 전수 교체 + "이 창을 닫지 마세요" 경고 삭제 + T19 grep 확장)는 T12(폴링 재작성)·T19(Colab 삭제) 범위에 접혀 들어가며, `scripts/check-public-artifacts.mjs`의 colab 문구 1건도 함께 처리한다. T21(DESIGN.md 계약 개정)·T25(접근성 패키지, 스크린리더 수동 QA 필요)는 이번 웨이브 범위 밖 — carryover로 후속 웨이브에 남긴다.

## Provisional requirements 갱신

25항에 아래 2항목 추가(T23·T24 편입 반영):
26. `app/api/process/status/route.ts` 응답 바디에 1-기반 `queuePosition` 필드가 존재한다.
27. `app/page.tsx`·`components/image-processor.tsx`·`scripts/check-public-artifacts.mjs`에서 대소문자 무시 `colab` 검색이 0건이고, "이 창을 닫지 마세요" 계열 경고 문구가 제거돼 있다.

worker_done: GATE 라운드 1 완료 — 질문 5건 전부 처리(confirmed 4 / user 1), 재질문 라운드 불필요. PLAN으로 넘어간다.
