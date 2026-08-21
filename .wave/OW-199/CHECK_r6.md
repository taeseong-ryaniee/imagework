[CHECK r6]

`check_dispatch_table.py`로 `[PLAN r6]` 코멘트의 dispatch table JSON(태스크 11건, OW-200~OW-210)을 재검사.

1. 필수 필드 전체 존재(11개 태스크 × 9개 필드 = 99셀): pass
2. deps 순환 없음: pass
3. id가 테이블 전체에서 유일함: pass
4. target_files 경로를 공유하는 두 태스크 중 하나 이상 write:true면 deps 순서가 있음: pass

4건 전부 통과. RED r6로 진행한다.
