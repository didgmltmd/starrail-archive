# 친구 기능 설정하기 (Supabase)

친구끼리 캐릭터를 보려면 데이터를 올려둘 무료 온라인 저장소가 필요해요.
**앱을 배포하는 사람이 한 번만** 설정하면 되고, 친구들은 설정할 게 없어요.

공유되는 건 캐릭터·광추·성유물 정보뿐이에요. HoYoLAB 로그인 정보는 각자 PC에만 있고 올라가지 않아요.

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에 접속해서 가입하고 로그인해요. GitHub 계정으로 가입해도 돼요.
2. **New project**를 눌러요.
3. 이름은 아무거나(예: `starrail-archive`), 데이터베이스 비밀번호는 아무거나 정해요. 앱에서는 이 비밀번호를 쓰지 않아요.
4. Region은 **Northeast Asia (Seoul)**을 고르고 **Create new project**를 눌러요.
5. 1~2분 기다리면 준비가 끝나요.

## 2. 테이블 만들기

1. 왼쪽 메뉴에서 **SQL Editor**를 열어요.
2. 이 저장소의 `supabase/schema.sql` 내용을 전부 복사해서 붙여넣어요.
3. **Run**을 눌러요. "Success"가 나오면 끝이에요.

## 3. 익명 로그인 켜기

1. 왼쪽 메뉴에서 **Authentication** → **Sign In / Providers**로 가요.
2. **Allow anonymous sign-ins**를 켜고 저장해요.

앱이 설치될 때마다 익명 계정을 하나 만들어서, 각자 자기 데이터만 고칠 수 있게 하는 용도예요.

## 4. 앱에 주소와 키 넣기

1. 왼쪽 메뉴에서 **Project Settings** → **API**(또는 **Data API**)로 가요.
2. 아래 두 값을 복사해요.
   - **Project URL** (예: `https://abcdefgh.supabase.co`)
   - **anon public** 키 (`eyJ...`로 시작하는 긴 문자열)
3. 프로젝트 폴더에 `.env` 파일을 만들고 아래처럼 적어요. `.env.example`을 복사해서 이름을 바꿔도 돼요.

   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

   > anon 키는 앱 안에 들어가도 괜찮은 공개용 키예요. **service_role** 키는 절대 넣지 마세요.

## 5. 다시 빌드하기

```bash
pnpm tauri dev     # 개발 모드로 확인
pnpm tauri build   # 친구들에게 줄 설치 파일 만들기
```

`.env` 값은 빌드할 때 앱 안에 들어가요. 값을 바꿨다면 다시 빌드해야 해요.

## 사용 방법

1. **HoYoLAB 연동** 탭에서 연동해요.
2. **친구** 탭에서 **내 캐릭터 친구에게 공개**를 켜요. 이후 동기화할 때마다 자동으로 갱신돼요.
3. 친구에게 내 UID를 알려주고, 친구의 UID를 받아서 **친구 추가**에 입력해요.

## 문제 해결

- **"이 UID는 다른 기기에서 이미 공개했어요"**: 같은 UID를 다른 PC(또는 앱을 새로 설치하기 전)에서 먼저 공개한 경우예요. 원래 PC에서 공개를 끄거나, Supabase **Table Editor** → `profiles`에서 해당 UID 줄을 지우면 돼요.
- **"익명 로그인이 켜져 있는지 확인"**: 3단계를 다시 확인해 주세요.
- 무료 플랜은 일주일 동안 아무도 쓰지 않으면 프로젝트가 일시정지돼요. Supabase 대시보드에서 **Restore**를 누르면 다시 켜져요.
