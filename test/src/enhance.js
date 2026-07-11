import { account } from "./account.js?v=260711010";

// ===========================================================================
// Weapon enhancement system.
// Every weapon starts 普通 (common). Enhancing individual PARTS consumes
// map-dropped materials, has a per-level SUCCESS PROBABILITY (falls as the
// level climbs), and raises the weapon's displayed rarity:
//   弹匣 (mag)   -> 稀有 (rare)
//   枪芯 (core)  -> 史诗 (epic)   [damage]
//   枪管/枪口/枪托 (barrel/muzzle/stock) -> 传说 (legend) [firerate/recoil/stability]
// The weapon's rarity is the HIGHEST tier among its enhanced parts.
// ===========================================================================

export const MAX_LEVEL = 5;
const TIER_RANK = { common: 0, rare: 1, epic: 2, legend: 3 };

// Part definitions. `cost(level)` = materials to go level -> level+1.
// `chance(level)` = success probability of that attempt (falls with level).
export const PARTS = [
  { key: "mag", label: "弹匣", attr: "弹匣容量", tier: "rare", icon: "🧲", desc: "扩容弹匣，提升单弹夹载弹量。",
    cost: (l) => [{ id: "upgrade_module", qty: 1 + l }],
    chance: (l) => Math.max(0.35, 0.92 - l * 0.06) },
  { key: "core", label: "枪芯", attr: "伤害", tier: "epic", icon: "🔋", desc: "强化能量枪芯，提升武器伤害。",
    cost: (l) => [{ id: "weapon_core", qty: 1 + l }, { id: "alloy_core", qty: 1 }],
    chance: (l) => Math.max(0.28, 0.82 - l * 0.10) },
  { key: "barrel", label: "枪管", attr: "射速", tier: "legend", icon: "🛠️", desc: "改造枪管，提升射速 / 开火节奏。",
    cost: (l) => [{ id: "upgrade_module", qty: 2 + l }, { id: "scrap", qty: 3 }],
    chance: (l) => Math.max(0.22, 0.78 - l * 0.11) },
  { key: "muzzle", label: "枪口", attr: "后坐力", tier: "legend", icon: "🌀", desc: "加装枪口制退器，降低后坐力。",
    cost: (l) => [{ id: "upgrade_module", qty: 2 + l }, { id: "scrap", qty: 3 }],
    chance: (l) => Math.max(0.22, 0.78 - l * 0.11) },
  { key: "stock", label: "枪托", attr: "画面稳定", tier: "legend", icon: "🔩", desc: "更换战术枪托，提升画面稳定 / 精度。",
    cost: (l) => [{ id: "upgrade_module", qty: 2 + l }, { id: "scrap", qty: 3 }],
    chance: (l) => Math.max(0.22, 0.78 - l * 0.11) },
];
export const PART_BY_KEY = Object.fromEntries(PARTS.map((p) => [p.key, p]));

// Read a weapon's stored part levels ({} defaults to all-zero).
export function getParts(weaponId) {
  const d = account.getData();
  const e = (d && d.enhance && d.enhance[weaponId]) || {};
  return { mag: e.mag || 0, core: e.core || 0, barrel: e.barrel || 0, muzzle: e.muzzle || 0, stock: e.stock || 0 };
}

// Derived rarity from the parts that have been enhanced (highest tier wins).
export function weaponRarity(weaponId) {
  const p = getParts(weaponId);
  let best = "common";
  for (const part of PARTS) {
    if ((p[part.key] || 0) > 0 && TIER_RANK[part.tier] > TIER_RANK[best]) best = part.tier;
  }
  return best;
}

// Effective stat multipliers for the live weapon systems to apply.
export function effectiveMods(weaponId) {
  const p = getParts(weaponId);
  return {
    magMul: 1 + 0.15 * p.mag,        // +15% mag / level
    damageMul: 1 + 0.12 * p.core,    // +12% damage / level
    fireRateMul: Math.pow(0.94, p.barrel), // faster cadence
    recoilMul: Math.pow(0.90, p.muzzle),   // less recoil / kick
    spreadMul: Math.pow(0.90, p.stock),    // tighter spread / steadier
    levels: p,
  };
}

function canAfford(cost) { return cost.every((c) => account.count(c.id) >= c.qty); }

// Attempt to enhance one part by one level.
// Returns { ok, success, msg }.
export function tryEnhance(weaponId, partKey) {
  const part = PART_BY_KEY[partKey];
  if (!part) return { ok: false, msg: "未知部位" };
  const p = getParts(weaponId);
  const lvl = p[partKey] || 0;
  if (lvl >= MAX_LEVEL) return { ok: false, msg: "该部位已满级" };
  const cost = part.cost(lvl);
  if (!canAfford(cost)) return { ok: false, msg: "强化材料不足" };
  for (const c of cost) account.take(c.id, c.qty);
  const success = Math.random() < part.chance(lvl);
  const d = account.getData();
  if (!d.enhance) d.enhance = {};
  if (!d.enhance[weaponId]) d.enhance[weaponId] = {};
  if (success) d.enhance[weaponId][partKey] = lvl + 1;
  account.save(d);
  return { ok: true, success, msg: success ? `强化成功！${part.label} → Lv.${lvl + 1}` : `强化失败，材料已消耗（成功率 ${Math.round(part.chance(lvl) * 100)}%）` };
}
