# 친구 서버 (이 PC)

친구끼리 캐릭터·엔드 컨텐츠 기록을 보려면, 공개한 데이터를 모아 두는 서버가 하나 필요해요.
이 서버는 **방장 PC(이 PC)** 에서 돌아가요.

## 동작 방식

- `server/index.mjs` 가 이 PC 안에서만 열리는 작은 서버(127.0.0.1:8787)를 켜요. 공유기 포트를 열 필요가 없어요.
- Cloudflare 무료 터널(`cloudflared`)이 바깥 주소(`https://xxxx.trycloudflare.com`)를 만들어 이 서버로 연결해요.
- 이 주소는 서버를 다시 켤 때마다 바뀌어서, 서버가 바뀐 주소를 GitHub 저장소의 `server` 브랜치 `server.json`에 자동으로 올려요. 친구들 앱은 그걸 보고 접속해요.
- 저장 위치: `%LOCALAPPDATA%\StarRailArchiveServer` (`profiles\UID.json`, 로그 `server.log`)

## 보안

- 저장되는 건 친구들이 "공개"를 켠 게임 데이터(캐릭터, 광추, 성유물, 엔드 컨텐츠 기록)뿐이에요. HoYoLAB 로그인 정보는 오가지 않아요.
- 한 UID는 처음 공개한 기기만 수정·삭제할 수 있어요 (기기별 비밀 키, 서버에는 해시만 저장).
- 요청 횟수 제한, 크기 제한(4MB)이 있어요.
- 주소를 아는 사람은 공개된 UID의 데이터를 읽을 수 있어요 (Supabase 방식과 같은 수준).

## 켜고 끄기

```powershell
powershell -ExecutionPolicy Bypass -File server\start.ps1       # 켜기 (백그라운드)
powershell -ExecutionPolicy Bypass -File server\stop.ps1        # 끄기
powershell -ExecutionPolicy Bypass -File server\autostart.ps1   # Windows 로그인 시 자동으로 켜기
powershell -ExecutionPolicy Bypass -File server\autostart.ps1 -Remove   # 자동 시작 끄기
```

필요한 것: Node.js, cloudflared, GitHub CLI(`gh`, 로그인 상태). 이 PC에는 셋 다 있어요.

## PC가 꺼져 있으면?

친구 앱은 마지막으로 받아 둔 친구 데이터를 그대로 보여주고, 공개(업로드)는 다음 동기화 때 다시 시도해요.
PC가 다시 켜지고 서버가 올라오면(자동 시작을 켜 뒀다면 로그인 직후) 정상으로 돌아와요.

## 나중에 바꾸고 싶다면

- 개인 도메인이 있으면 Cloudflare "named tunnel"로 고정 주소를 쓸 수 있어요 (주소 공개 단계가 필요 없어짐).
- PC를 계속 켜 두기 어렵다면 Supabase 같은 무료 클라우드 DB로 옮길 수 있어요.
