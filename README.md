# StarRail Archive

붕괴: 스타레일 보유 캐릭터와 성유물 세팅을 인게임 화면처럼 보여주고, 세팅 점검과 파밍 추천을 해주는 데스크톱 앱입니다. (Tauri + React)

## 실행

```bash
pnpm install
pnpm tauri dev        # 앱 실행 (개발 모드)
pnpm dev              # 브라우저에서 화면만 확인 (http://localhost:1420)
pnpm tauri build      # 설치 파일(.exe/.msi) 만들기
```

## 게임 데이터 갱신

캐릭터, 광추, 성유물 세트 정보(한국어)는 [StarRailRes](https://github.com/Mar-7th/StarRailRes)에서 가져옵니다.
새 캐릭터가 나오면 아래 명령으로 `src/data/game.json`을 갱신하세요. 이미지는 실행 중에 같은 저장소에서 불러옵니다.

```bash
pnpm sync:gamedata
```

## 기능

- **캐릭터 / 보유 캐릭터**: 인게임 스타일 화면, 일러스트, 속성·광추·성유물
- **HoYoLAB 연동**: 앱 안에서 로그인 → 보유 캐릭터 전체 불러오기. 로그인 정보는 Windows 자격 증명에 저장
- **세팅 점검 / 파밍 추천**: 캐릭터별 권장 세팅(hsr-optimizer 기준 + 직접 정리한 세트)과 비교해 점수, 문제점, 돌아야 할 동굴/차원장식 순위. 등급 필터, 육성 제외 캐릭터 지정
- **엔드 컨텐츠**: 혼돈의 기억 / 허구 이야기 / 종말의 환영 이번·지난 기간 기록 (HoYoLAB 실제 기록: 별, 점수, 사용 파티, 버프, 보스)
- **친구**: UID로 친구 추가, 서로 공개한 캐릭터와 엔드 컨텐츠 기록 보기 → 설정: [docs/FRIENDS_SETUP.md](docs/FRIENDS_SETUP.md)
- **자동 업데이트**: GitHub Releases에 새 버전을 올리면 앱이 알아서 업데이트 → 설정: [docs/UPDATES.md](docs/UPDATES.md)

## 동기화 주기

- 앱을 켤 때 마지막 동기화가 30분보다 오래됐으면 자동 동기화
- 켜 둔 동안 1시간마다 자동 동기화, 상단의 동기화 버튼으로 언제든 수동 동기화
- 친구 화면의 데이터는 그 친구가 마지막으로 동기화한 시점 기준

## 데이터 자동 갱신

GitHub Actions(`.github/workflows/data.yml`)가 매일 새벽 4시(KST)에 게임 데이터와 권장 세팅을 다시 받아 저장소에 올려요.
설치된 앱은 켤 때 저장소의 최신 `src/data/game.json`, `builds.json`을 받아 쓰기 때문에 **신규 캐릭터·성유물이 나와도 앱 업데이트가 필요 없어요.**
(인터넷이 안 되면 마지막으로 받은 데이터, 그것도 없으면 앱에 들어 있는 데이터를 써요.)

## 권장 세팅 데이터 수동 갱신

```bash
pnpm sync:builds     # hsr-optimizer에서 캐릭터별 권장 주옵/부옵/세트 다시 받기
```

## 구조

```
src/
  App.tsx              화면 전체 구성, 왼쪽 메뉴 탭 전환
  components/Shell.tsx 상단 바, 왼쪽 메뉴, 창 버튼, 배경
  pages/               캐릭터 / 보유 캐릭터 / 세팅 점검 / 파밍 추천 / 친구 / 연동 화면
  data/game.json       게임 데이터 (sync:gamedata로 생성)
  data/builds.json     캐릭터별 권장 세팅 (sync:builds로 생성), builds.ts에서 보정
  data/mock.ts         연동 전에 쓰는 샘플 계정
  lib/hoyolab.ts       HoYoLAB 응답 → 앱 데이터 변환
  lib/useAccount.ts    연동 상태, 자동 동기화
  lib/audit.ts         성유물 점수, 세팅 점검
  lib/farming.ts       파밍 우선순위
  lib/friends.ts       친구 공유 (Supabase)
src-tauri/             데스크톱 앱 (Rust) — src/hoyolab.rs: 로그인 창, 쿠키 저장, HoYoLAB API
```
