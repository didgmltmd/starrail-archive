# 자동 업데이트 설정

친구들에게 설치 파일을 **한 번만** 주면, 그다음부터는 앱이 켜질 때 새 버전을 확인하고
"업데이트" 버튼 한 번으로 스스로 업데이트해요. (6시간마다 다시 확인)

새 버전은 GitHub Releases에 올라가고, 앱은 거기 있는 `latest.json`을 보고 판단해요.
업데이트 파일은 서명돼 있어서 다른 사람이 가짜 업데이트를 끼워 넣을 수 없어요.

## 처음 한 번만 하는 설정

### 1. GitHub 저장소 만들기

- GitHub에서 **`starrail-archive`** 라는 이름으로 저장소를 만들어요 (계정: `didgmltmd`).
- 업데이트 파일을 친구들이 받을 수 있어야 하니 **Public** 이어야 해요.
  - 코드를 공개하기 싫으면: 코드는 비공개 저장소에 두고, 릴리스만 올리는 공개 저장소를 따로 두는 방법도 있어요 (필요하면 말해 주세요).
- 다른 이름/계정을 쓰면 `src-tauri/tauri.conf.json`의 `plugins.updater.endpoints` 주소를 같이 바꿔 주세요.

```bash
git remote add origin https://github.com/didgmltmd/starrail-archive.git
git push -u origin master
```

### 2. 서명 키를 GitHub에 등록

서명 키는 이 PC의 `C:\Users\PC-1\.tauri\starrail-archive.key` 에 만들어 뒀어요.
**이 파일은 절대 저장소에 올리거나 남에게 주면 안 돼요.** 잃어버리면 기존 앱들이 새 업데이트를 못 받아요 → 따로 백업해 두세요.

GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret**:

| 이름 | 값 |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `starrail-archive.key` 파일 내용 전체 (메모장으로 열어서 복사) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 비워 둬도 되지만 GitHub는 빈 값을 못 넣으니, 이 항목은 **만들지 않아도 돼요** |
| `VITE_SUPABASE_URL` | 친구 기능용 (docs/FRIENDS_SETUP.md 참고) |
| `VITE_SUPABASE_ANON_KEY` | 친구 기능용 |

## 새 버전 내보내기 (매번)

```bash
pnpm bump 0.2.0          # 버전 숫자 올리기 (항상 이전보다 크게)
git commit -am "v0.2.0"
git tag v0.2.0
git push && git push --tags
```

태그를 올리면 GitHub Actions가 10~15분 동안 빌드해서 Releases에 올려요.
그 뒤로 친구들이 앱을 켜면 오른쪽 아래에 "새 버전 0.2.0 · 업데이트" 안내가 떠요.

## 게임 데이터는 자동이에요

신규 캐릭터, 광추, 성유물, 권장 세팅은 매일 자동으로 갱신돼요 (`.github/workflows/data.yml`).
앱 업데이트 없이도 친구들 앱이 켜질 때 새 데이터를 받아요. 위의 "새 버전 내보내기"는 **앱 기능이 바뀔 때만** 하면 돼요.

## 처음 설치 파일 주기

Releases 페이지의 `StarRail Archive_x.y.z_x64-setup.exe` 링크를 친구에게 보내면 돼요.
처음 실행할 때 Windows가 "PC 보호" 경고를 띄우면 **추가 정보 → 실행** 을 누르라고 알려 주세요.
(코드 서명 인증서가 없어서 생기는 경고예요. 업데이트 때는 다시 안 떠요.)

## 내 PC에서 직접 빌드하기 (선택)

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$HOME\.tauri\starrail-archive.key" -Raw
pnpm tauri build
```

결과물: `src-tauri/target/release/bundle/nsis/`
