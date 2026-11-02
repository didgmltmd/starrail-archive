# 속도 효과 작성 가이드 (`src/data/speedkits.json`)

파티 시뮬이 쓰는 행동 당기기·속도 버프 데이터다. 새 캐릭터·광추·성유물 세트를 넣을 때 이 지침대로 추가한다.

1. **웹 공략이 아니라 게임 데이터의 한국어 설명을 원본으로 쓴다.**
   `https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/index_new/kr/`의 `characters.json`, `character_skills.json`(스킬, 10레벨 = `params[9]`),
   `character_ranks.json`(성혼), `character_skill_trees.json`(행적, `params[0]`), `light_cone_ranks.json`(중첩별 `params`), `relic_sets.json`에서
   "행동 게이지가 …% 증가", "즉시 행동", "속도가 …% / …pt 증가" 문장을 찾는다.
2. 수치는 설명의 `#n[i]` 자리에 해당 `params` 값을 넣은 그대로 쓴다. 지어내지 않는다.
3. 적 처치·격파·피격처럼 시뮬레이션으로 재현할 수 없는 조건, 소환물·기억 정령의 행동, 고유 상태(반디 완전연소 등)는 넣지 않는다.
4. 형식: `{ "on": "start|passive|skill|basic|ult", "to": "self|ally|team|others|path:<운명의 길 ID>", "kind": "advance|nextAdvance|spdPct|spdFlat|spdOfCaster|countdown|advanceByElation|ahaExtraTurn|ahaSpdPerAllyAttack", "value": 0.5, "dur": 2, "durOn": "owner", "after": true, "rank": 1, "once": true, "notPath": "Shaman", "note": "화면에 보일 짧은 설명" }`.
   광추는 `value`를 중첩 1~5 값 배열로, 성유물 세트는 `pieces`(2/4)를 적는다. 비율은 0~1(50% → 0.5), 속도 pt는 그대로.
   `ahaExtraTurn`은 "아하가 즉시 보너스 턴을 1개 획득"(value 1), `ahaSpdPerAllyAttack`은 "동료가 공격한 후 아하의 속도를 N 증가"(value N, 파티의 환락 캐릭터가 혼자일 때만 계산)에 쓴다. 아하 자체의 속도 공식은 시뮬레이터 코드에 있다.
5. 이미 있는 항목은 게임 데이터와 수치가 같은지만 확인한다. `updatedAt`을 갱신한다.

끝나면 `node scripts/check-speedkits.mjs`로 형식과 ID를 검사한다.
