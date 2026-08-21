[CHECK r4]

`check_dispatch_table.py`로 `[PLAN r4]` 코멘트의 dispatch table JSON(태스크 11건, OW-200~OW-210, OW-210 전역 백스톱 재구조 반영)을 재검사. 사용자 지시 라운드(§8 자율 재시도 캡 미적용).

1. 필수 필드 전체 존재(11개 태스크 × 9개 필드 = 99셀): pass
2. deps 순환 없음: pass
3. id가 테이블 전체에서 유일함: pass
4. target_files 경로를 공유하는 두 태스크 중 하나 이상 write:true면 deps 순서가 있음: pass

4건 전부 통과. RED r4로 진행한다.
