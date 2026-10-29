# 메타 데이터 주간 조사 지침

AI 에이전트가 매주 이 지침대로 조사해서 `src/data/meta.json`을 갱신해요.
앱은 켤 때 이 파일을 받아서 엔드 컨텐츠 탭(이번 기간 정보, 추천 파티, 육성 추천)과
세팅 점검 탭(이잘키 기준, 파티별 세팅)에 보여줘요.

## 절대 규칙

1. **출처 없는 내용은 넣지 않는다.** 모든 항목에 실제로 열어 본 웹 페이지의 `sources`(제목, URL, 확인 날짜)를 붙인다.
2. **추측하지 않는다.** 출처끼리 다르거나 확실하지 않으면 그 항목은 빼고 `notes`에 "확인 안 됨"으로 남긴다.
3. **수치를 지어내지 않는다.** 이잘키 수치, 클리어율, 사용률은 출처에 적힌 값만 쓴다. 클리어 확률은 계산하지 않는다.
4. 캐릭터는 `src/data/game.json`의 `characters` ID(예: "1308")로 적는다. 이름 → ID는 그 파일에서 찾는다. 없는 캐릭터는 이름만 `notes`에 적는다.
5. 성유물 세트는 `game.json`의 `relicSets` ID(예: "117"), 스탯은 아래 키를 쓴다.
6. 기존 `meta.json`에서 출처가 여전히 유효한 항목은 유지하고, 기간이 끝난 로테이션 정보는 교체한다.
7. 한국어로 쓴다 (게임 내 한국어 명칭 우선).
8. `note`, `reason`, `summary`는 앱 화면에 그대로 보이는 설명이다. **출처 사이트 이름(Game8, Prydwen 등)이나 "~에 따르면" 같은 말은 쓰지 않는다.**
   플레이어에게 필요한 정보만 짧게 쓴다 (예: "허구 노드 1(푸가 버프) 추천. 종말 후반 기믹에도 유리."). 출처는 `sources`에만 둔다.

스탯 키: `HP, ATK, DEF, SPD, HP_P, ATK_P, DEF_P, CR, CD, BE, OHB, ERR, EHR, RES, Physical_DMG, Fire_DMG, Ice_DMG, Thunder_DMG, Wind_DMG, Quantum_DMG, Imaginary_DMG`
퍼센트 스탯은 비율로 쓴다 (치명타 확률 70% → `0.7`, 속도는 그대로 `134`).
속성 키: `Physical, Fire, Ice, Thunder, Wind, Quantum, Imaginary`

## 조사 항목

1. **이번 기간 로테이션** (`rotations.moc / pf / as`): 기간 이름, 시작·종료일, 전반/후반 적 약점 속성, 주요 적, 기간 버프 요약.
   각 구간의 대표 보스/정예 적 이미지(`bosses`, 로테이션당 최대 6개)도 넣는다. 이미지는 붕괴: 스타레일 Fandom 위키
   (`https://honkai-star-rail.fandom.com/wiki/<적_이름>`)의 대표 이미지(static.wikia.nocookie.net 직접 링크, `/revision/latest` 형태)를 쓰고,
   실제로 열리는지 확인한 주소만 넣는다. 못 찾으면 넣지 않는다.
   ※ 2026-10 기준 Fandom 이미지는 봇 차단 때문에 앱에서 열리지 않아 `--check-images`를 통과하지 못한다.
     통과하는 다른 직접 이미지 주소가 없으면 `bosses`는 비워 둔다 (차단 우회 금지).
2. **추천 파티** (`teams`): 지금 메타에서 많이 쓰이는 파티. 멤버, 대체 가능 멤버, 어느 컨텐츠(moc/pf/as)에 맞는지, 짧은 설명.
3. **이잘키 기준** (`benchmarks`): 캐릭터별로 "이 정도면 잘 키웠다"고 커뮤니티에서 통용되는 스탯 기준. 성혼 조건이 있으면 `eidolon`에 적는다.
4. **파티별·돌파별 세팅** (`teamBuilds`): "평소엔 A 세트를 쓰지만 B 파티에선 C를 쓴다", "성혼 2부터는 속도 대신 …" 같은 예외 세팅.
5. **육성 우선 추천** (`buildPriority`): 이번/다음 기간에 특히 가치가 높은 캐릭터와 이유.

참고할 만한 출처: Prydwen, Game8, HoYoLAB 공식 공지, 나무위키, 아카라이브·인벤 공략글, 공식 유튜브/트위터.

## 형식 (`src/data/meta.json`)

```json
{
  "version": 1,
  "updatedAt": "2026-10-30",
  "gameVersion": "x.y",
  "notes": ["확인하지 못한 것 등"],
  "rotations": {
    "moc": {
      "name": "내세로의 도하",
      "begin": "2026-09-28",
      "end": "2026-11-02",
      "summary": "기간 버프 요약",
      "bosses": [
        { "name": "적 이름", "side": "전반", "image": "https://static.wikia.nocookie.net/houkai-star-rail/images/...", "page": "https://honkai-star-rail.fandom.com/wiki/..." }
      ],
      "sides": [
        { "label": "전반", "weaknesses": ["Fire", "Ice"], "enemies": ["적 이름"] },
        { "label": "후반", "weaknesses": ["Quantum"], "enemies": ["적 이름"] }
      ],
      "sources": [{ "title": "페이지 제목", "url": "https://...", "checked": "2026-10-30" }]
    }
  },
  "teams": [
    {
      "id": "acheron-jiaoqiu",
      "name": "아케론 공허 파티",
      "members": ["1308", "1218", "1406", "1304"],
      "alternatives": { "1406": ["1307"] },
      "modes": ["moc", "as"],
      "note": "왜 좋은지 한두 문장",
      "sources": [{ "title": "...", "url": "...", "checked": "..." }]
    }
  ],
  "benchmarks": {
    "1308": {
      "stats": { "CR": 0.7, "CD": 1.4, "SPD": 134 },
      "eidolon": 0,
      "note": "기준 설명",
      "sources": [{ "title": "...", "url": "...", "checked": "..." }]
    }
  },
  "teamBuilds": [
    {
      "charId": "1309",
      "when": "어벤츄린 추가 공격 파티",
      "relicSets": [["117", "117"]],
      "ornamentSets": ["324"],
      "mains": { "BODY": ["ATK_P"], "FOOT": ["SPD"] },
      "note": "평소 세팅과 무엇이 다른지",
      "sources": [{ "title": "...", "url": "...", "checked": "..." }]
    }
  ],
  "buildPriority": [
    { "charId": "1218", "modes": ["moc"], "reason": "이유", "sources": [{ "title": "...", "url": "...", "checked": "..." }] }
  ]
}
```

## 속도 효과 (`src/data/speedkits.json`)

파티 속도 시뮬 탭이 쓰는 행동 당기기·속도 버프 데이터다. 매주 새 캐릭터·광추·성유물 세트가 생겼는지 보고 추가한다.

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

끝나면 `node scripts/check-meta.mjs --check-images`로 형식, ID, 보스 이미지(그리고 speedkits.json 형식)가 실제로 열리는지 검사하고, 통과하면 커밋한다.
