// Sets the app version everywhere it lives. Usage: pnpm bump 0.2.0
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("사용법: pnpm bump 0.2.0");
  process.exit(1);
}

const edit = (path, fn) => writeFileSync(path, fn(readFileSync(path, "utf8")));

edit("package.json", (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`));
edit("src-tauri/tauri.conf.json", (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`));
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]+"/m, `version = "${version}"`));

console.log(`버전을 ${version}(으)로 바꿨어요. 이제:`);
console.log(`  git commit -am "chore: v${version} 릴리스"`);
console.log(`  git tag v${version}`);
console.log(`  git push && git push --tags`);
