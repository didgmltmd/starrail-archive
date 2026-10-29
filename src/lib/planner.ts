// Enhancement planner: the official HoYoLAB calculator works out the materials and
// also reports what the account owns, so the numbers always match the current game.
import { describeError, isTauri } from "./hoyolab";

export interface CalcAvatar {
  item_id: string;
  item_name: string;
  icon_url: string;
  cur_level: number;
  max_level: number;
  rarity: string;
  damage_type: string;
  avatar_base_type: string;
}

export interface CalcSkill {
  point_id: string;
  point_type: number;
  cur_level: number;
  max_level: number;
  min_level_limit: number;
  item_url: string;
  progress: string;
  anchor: string;
}

export interface CalcEquipment {
  item_id: string;
  item_name: string;
  item_url: string;
  cur_level: number;
  max_level: number;
  rarity: string;
}

export interface CalcDetail {
  avatar: CalcAvatar;
  equipment: CalcEquipment | null;
  skills: CalcSkill[];
  skills_other: CalcSkill[];
  skills_servant?: CalcSkill[] | null;
  skills_special?: CalcSkill[] | null;
}

export interface Material {
  item_id: string;
  item_name: string;
  item_url: string;
  num: number;
  rarity: string;
}

export interface CalcResult {
  avatar_consume: Material[];
  skill_consume: Material[];
  equipment_consume: Material[];
  user_owns_materials: Record<string, number>;
  can_merge_materials?: Material[];
  need_get_materials?: Material[];
  coin_id?: string;
}

export interface Plan {
  level: number;
  /** point_id → target level */
  skills: Record<string, number>;
  lightCone: number;
}

export const CREDIT_ID = "2";
export const LEVEL_STEPS = [1, 20, 30, 40, 50, 60, 70, 80];

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const canPlan = isTauri;

export async function loadAvatars() {
  return invoke<CalcAvatar[]>("calc_avatars", { uid: null });
}

export async function loadDetail(id: string) {
  return invoke<CalcDetail>("calc_detail", { uid: null, itemId: id });
}

/** A trace node with one level counts as learned only when the game says so. */
export function currentLevel(s: CalcSkill) {
  if (s.max_level === 1) return s.progress === "Learned" ? 1 : 0;
  return s.cur_level;
}

export function allSkills(d: CalcDetail) {
  return [...d.skills, ...(d.skills_servant ?? []), ...(d.skills_special ?? []), ...d.skills_other];
}

/** Everything maxed (the usual question: "what does a full build cost?"). */
export function maxPlan(d: CalcDetail): Plan {
  const skills: Record<string, number> = {};
  for (const s of allSkills(d)) skills[s.point_id] = s.max_level;
  return { level: d.avatar.max_level, skills, lightCone: d.equipment?.max_level ?? 0 };
}

/** No change from the current state. */
export function currentPlan(d: CalcDetail): Plan {
  const skills: Record<string, number> = {};
  for (const s of allSkills(d)) skills[s.point_id] = currentLevel(s);
  return { level: d.avatar.cur_level, skills, lightCone: d.equipment?.cur_level ?? 0 };
}

export async function compute(d: CalcDetail, plan: Plan): Promise<CalcResult> {
  const skill_list = allSkills(d)
    .map((s) => ({ item_id: s.point_id, cur_level: currentLevel(s), target_level: plan.skills[s.point_id] ?? currentLevel(s) }))
    .filter((s) => s.target_level > s.cur_level);
  const body: Record<string, unknown> = {
    avatar: { item_id: d.avatar.item_id, cur_level: d.avatar.cur_level, target_level: Math.max(plan.level, d.avatar.cur_level) },
    skill_list,
  };
  if (d.equipment && plan.lightCone > d.equipment.cur_level) {
    body.equipment = { item_id: d.equipment.item_id, cur_level: d.equipment.cur_level, target_level: plan.lightCone };
  }
  return invoke<CalcResult>("calc_compute", { uid: null, body });
}

export interface MaterialLine {
  item: Material;
  need: number;
  owned: number;
  /** Still to farm after using what is owned and what can be crafted */
  missing: number;
  /** Can be covered by crafting from lower-tier materials */
  craftable: number;
}

/** Sums the three cost lists and lines them up with what the account owns. */
export function summarize(r: CalcResult): MaterialLine[] {
  const need = new Map<string, MaterialLine>();
  for (const m of [...r.avatar_consume, ...r.skill_consume, ...r.equipment_consume]) {
    const line = need.get(m.item_id);
    if (line) line.need += m.num;
    else need.set(m.item_id, { item: m, need: m.num, owned: 0, missing: 0, craftable: 0 });
  }
  const missing = new Map((r.need_get_materials ?? []).map((m) => [m.item_id, m.num]));
  const craft = new Map((r.can_merge_materials ?? []).map((m) => [m.item_id, m.num]));
  for (const line of need.values()) {
    line.owned = r.user_owns_materials?.[line.item.item_id] ?? 0;
    line.missing = missing.get(line.item.item_id) ?? 0;
    line.craftable = craft.get(line.item.item_id) ?? 0;
  }
  // Credits first, then rarer items first
  return [...need.values()].sort(
    (a, b) =>
      Number(b.item.item_id === CREDIT_ID) - Number(a.item.item_id === CREDIT_ID) ||
      Number(b.item.rarity) - Number(a.item.rarity) ||
      Number(a.item.item_id) - Number(b.item.item_id),
  );
}

export const errorText = (e: unknown) => describeError(e).message;
