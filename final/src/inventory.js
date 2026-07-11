import { account } from "./account.js?v=260711012";

// Item database. Equip-able types: primary / secondary / melee / armor / gear.
// "material" items are non-equippable (stackable resources / consumables).
export const ITEM_DB = {
  ak47_black: { name: "AK-47", type: "primary", rarity: "common", icon: "🔫", stats: { 伤害: 38, 射速: 600, 稳定: 65 }, desc: "制式突击步枪（默认黑色涂装）。" },
  ak47_gold: { name: "黄金 AK-47", type: "primary", rarity: "legend", icon: "🔫", stats: { 伤害: 42, 射速: 600, 稳定: 70 }, desc: "传说级金枪，可在商人处用材料兑换。" },
  smg_proto: { name: "原型冲锋枪", type: "primary", rarity: "epic", icon: "🔫", stats: { 伤害: 9, 射速: 900 }, desc: "实验型高射速冲锋枪，Area 区域掉落。装备为主武器后即可使用。" },
  laser_rifle: { name: "激光步枪", type: "primary", rarity: "epic", icon: "🔫", stats: { 伤害: 13, 射速: 720, 射程: 160 }, desc: "定向能量武器，弹道笔直、后坐极低、射程远。装备为主武器后即可使用。" },
  minigun: { name: "加特林", type: "primary", rarity: "legend", icon: "🔫", stats: { 伤害: 8, 射速: 1200, 弹匣: 120 }, desc: "重型转膛机枪，超高射速与弹匣，换弹缓慢。装备为主武器后即可使用。" },
  sniper: { name: "反器材狙击枪", type: "primary", rarity: "epic", icon: "🎯", stats: { 伤害: 150, 弹匣: 5, 射程: 320 }, desc: "栓动反器材步枪，右键开镜，单发伤害巨高，爆头几乎秒杀。装备为主武器后即可使用。" },
  laser_sniper: { name: "激光狙击枪", type: "primary", rarity: "legend", icon: "🎯", stats: { 伤害: 95, 弹匣: 12, 射程: 340 }, desc: "单发式激光狙击（联狙），右键开镜，按住 4 连发瞬发光束。装备为主武器后即可使用。" },
  rocket: { name: "火箭筒", type: "primary", rarity: "epic", icon: "🚀", stats: { 爆炸伤害: 200, 弹匣: 1, 范围: "6.5m" }, desc: "单发爆炸武器，高 AOE 伤害、弹速快下坠少。巴黎行动专属掉落。装备为主武器后即可使用。" },
  auto_rocket: { name: "连发火箭筒", type: "primary", rarity: "legend", icon: "🚀", stats: { 爆炸伤害: 85, 弹匣: 8, 范围: "4.5m" }, desc: "连发爆炸武器，射速快、弹速慢下坠大，靠数量覆盖。巴黎行动专属掉落。装备为主武器后即可使用。" },
  pistol_std: { name: "制式手枪", type: "secondary", rarity: "common", icon: "🔫", stats: { 伤害: 26, 射速: 300 }, desc: "可靠的副武器。" },
  combat_knife: { name: "作战匕首", type: "melee", rarity: "common", icon: "🗡️", stats: { 伤害: 150 }, desc: "近身致命。" },
  // --- armor tiers (single armor slot; escalating mitigation "护甲属性等级") ---
  combat_vest: { name: "战术背心", type: "armor", rarity: "common", icon: "🦺", stats: { 减伤: "12%" }, mit: 0.12, desc: "入门级防护背心，装备后受到的伤害降低 12%。" },
  combat_helm: { name: "作战头盔", type: "armor", rarity: "rare", icon: "🪖", stats: { 减伤: "18%" }, mit: 0.18, desc: "装备后受到的伤害降低 18%。" },
  kevlar_vest: { name: "防弹背心", type: "armor", rarity: "rare", icon: "🦺", stats: { 减伤: "24%" }, mit: 0.24, desc: "凯夫拉复合防弹衣，装备后受到的伤害降低 24%。" },
  nano_armor: { name: "纳米护甲", type: "armor", rarity: "epic", icon: "🛡️", stats: { 减伤: "32%" }, mit: 0.32, desc: "自适应纳米装甲，装备后受到的伤害降低 32%。" },
  power_armor: { name: "动力装甲", type: "armor", rarity: "legend", icon: "🛡️", stats: { 减伤: "45%", 生命上限: "+20" }, mit: 0.45, hpBonus: 20, desc: "外骨骼动力装甲，装备后受到的伤害降低 45%，并提升 20 点生命上限。传说级防护。" },
  tac_gloves: { name: "战术手套", type: "gear", rarity: "rare", icon: "🧤", stats: { 换弹: "+15%" }, reloadMul: 0.85, desc: "装备后换弹速度提升 15%。" },
  combat_pack: { name: "战术背包", type: "gear", rarity: "epic", icon: "🎒", stats: { 换弹: "+25%" }, reloadMul: 0.75, desc: "装备后换弹速度提升 25%。" },
  exo_frame: { name: "外骨骼框架", type: "gear", rarity: "legend", icon: "🦾", stats: { 换弹: "+38%" }, reloadMul: 0.62, desc: "负重外骨骼，装备后换弹速度提升 38%。传说级装备。" },
  med_stim: { name: "医疗针剂", type: "material", rarity: "common", icon: "💉", stats: {}, desc: "消耗品，回复生命。" },
  scrap: { name: "合金废料", type: "material", rarity: "common", icon: "⚙️", stats: {}, desc: "通用制造材料，可在商人处兑换武器。" },
  alloy_core: { name: "合金核心", type: "material", rarity: "epic", icon: "🔩", stats: {}, desc: "高级制造材料，稀有掉落。" },
  data_chip: { name: "数据芯片", type: "material", rarity: "rare", icon: "💾", stats: {}, desc: "用于解锁与升级。" },
  // --- weapon-enhancement materials (map drops) ---
  upgrade_module: { name: "强化模块", type: "material", rarity: "rare", icon: "🔧", stats: {}, desc: "武器强化材料，用于强化弹匣 / 枪管 / 枪口 / 枪托部位。地图敌人掉落。" },
  weapon_core: { name: "武器核心", type: "material", rarity: "epic", icon: "🔋", stats: {}, desc: "高级强化材料，用于强化枪芯（伤害）部位。稀有掉落，越强化成功率越低。" },
  revive_coin: { name: "复活币", type: "material", rarity: "legend", icon: "🪙", stats: {}, desc: "阵亡时自动消耗一枚，在原地满血复活。可在商人处购买。" },
};

// Armor damage-mitigation lookup (fraction of incoming damage removed).
export function armorMit(id) { const it = ITEM_DB[id]; return it && it.mit ? it.mit : 0; }
// Gear reload-time multiplier (<1 = faster).
export function gearReloadMul(id) { const it = ITEM_DB[id]; return it && it.reloadMul ? it.reloadMul : 1; }

// Per-map drop tables. London: rifles/snipers/lasers. Paris: adds the rocket
// launchers (exclusive) as its signature drops.
export const LONDON_LOOT = [
  { id: "scrap", min: 1, max: 4, w: 38 },
  { id: "data_chip", min: 1, max: 2, w: 18 },
  { id: "upgrade_module", min: 1, max: 2, w: 16 }, // enhancement material
  { id: "med_stim", min: 1, max: 1, w: 11 },
  { id: "alloy_core", min: 1, max: 1, w: 7 }, // premium crafting material
  { id: "combat_vest", min: 1, max: 1, w: 6 }, // armor: light vest
  { id: "combat_helm", min: 1, max: 1, w: 5 }, // armor: helmet
  { id: "weapon_core", min: 1, max: 1, w: 5 }, // core-enhancement material
  { id: "tac_gloves", min: 1, max: 1, w: 4 }, // gear: gloves
  { id: "smg_proto", min: 1, max: 1, w: 4 }, // weapon: SMG
  { id: "kevlar_vest", min: 1, max: 1, w: 4 }, // armor: kevlar
  { id: "laser_rifle", min: 1, max: 1, w: 3 }, // weapon: laser rifle
  { id: "sniper", min: 1, max: 1, w: 3 }, // weapon: sniper rifle
  { id: "combat_pack", min: 1, max: 1, w: 2 }, // gear: tactical pack
  { id: "ak47_gold", min: 1, max: 1, w: 2 }, // rare: gold AK directly
  { id: "laser_sniper", min: 1, max: 1, w: 1 }, // legendary: laser sniper
  { id: "minigun", min: 1, max: 1, w: 1 }, // legendary: gatling
];
export const PARIS_LOOT = [
  { id: "scrap", min: 1, max: 5, w: 34 },
  { id: "upgrade_module", min: 1, max: 3, w: 18 }, // richer enhancement drops
  { id: "data_chip", min: 1, max: 2, w: 16 },
  { id: "med_stim", min: 1, max: 1, w: 10 },
  { id: "alloy_core", min: 1, max: 2, w: 9 }, // richer materials
  { id: "weapon_core", min: 1, max: 2, w: 8 }, // more core-enhancement mats
  { id: "rocket", min: 1, max: 1, w: 6 }, // Paris-exclusive: rocket launcher
  { id: "nano_armor", min: 1, max: 1, w: 4 }, // armor: nano
  { id: "combat_pack", min: 1, max: 1, w: 4 }, // gear
  { id: "kevlar_vest", min: 1, max: 1, w: 3 }, // armor: kevlar
  { id: "laser_rifle", min: 1, max: 1, w: 3 },
  { id: "sniper", min: 1, max: 1, w: 3 },
  { id: "auto_rocket", min: 1, max: 1, w: 2 }, // Paris-exclusive: auto rocket
  { id: "exo_frame", min: 1, max: 1, w: 2 }, // legendary gear
  { id: "power_armor", min: 1, max: 1, w: 2 }, // legendary armor
  { id: "minigun", min: 1, max: 1, w: 1 },
];
// Moscow is the hardest campaign (richest drops, highest tier rewards)
export const MOSCOW_LOOT = [
  { id: "scrap", min: 1, max: 6, w: 28 },
  { id: "upgrade_module", min: 1, max: 4, w: 20 }, // most abundant enhancement
  { id: "weapon_core", min: 1, max: 3, w: 16 }, // core-enhancement focused
  { id: "alloy_core", min: 1, max: 3, w: 14 }, // richest material drops
  { id: "data_chip", min: 1, max: 2, w: 12 },
  { id: "med_stim", min: 1, max: 1, w: 9 },
  { id: "titan_core", min: 1, max: 1, w: 7 }, // Moscow-exclusive: ultra-premium material
  { id: "power_armor", min: 1, max: 1, w: 5 }, // legendary armor
  { id: "exo_frame", min: 1, max: 1, w: 5 }, // legendary gear
  { id: "laser_rifle", min: 1, max: 1, w: 4 },
  { id: "sniper", min: 1, max: 1, w: 4 },
  { id: "auto_rocket", min: 1, max: 1, w: 3 },
  { id: "minigun", min: 1, max: 1, w: 2 },
  { id: "ak47_gold", min: 1, max: 1, w: 2 }, // rare weapon variant
  { id: "laser_sniper", min: 1, max: 1, w: 1 }, // legendary: laser sniper
];
// Back-compat alias (older references)
export const LOOT_TABLE = LONDON_LOOT;
export function rollLoot(table = LONDON_LOOT) {
  const total = table.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of table) {
    r -= e.w;
    if (r <= 0) return { id: e.id, qty: e.min + Math.floor(Math.random() * (e.max - e.min + 1)) };
  }
  return { id: "scrap", qty: 1 };
}
export const RARITY_COLOR = { common: "#9fb3c8", rare: "#4aa3ff", epic: "#b06bff", legend: "#ffce3a" };

const SLOTS = [
  { key: "primary", label: "主武器" },
  { key: "secondary", label: "副武器" },
  { key: "melee", label: "近战" },
  { key: "armor", label: "护甲" },
  { key: "gear", label: "装备" },
];
const RARITY_LABEL = { common: "普通", rare: "稀有", epic: "史诗", legend: "传说" };

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// Render the backpack into `root`. Re-renders itself on equip/unequip.
export function renderInventory(root) {
  const data = account.getData();
  if (!data) { root.innerHTML = "<p style='padding:20px'>未登录</p>"; return; }
  root.innerHTML = "";

  // attributes strip (personal stats)
  const attr = el("div", "inv-attrs");
  attr.innerHTML =
    `<div class="attr"><span>等级</span><b>Lv.${data.level}</b></div>` +
    `<div class="attr"><span>金币</span><b class="coin">◈ ${data.coins}</b></div>` +
    `<div class="attr"><span>击杀</span><b>${data.stats.kills}</b></div>` +
    `<div class="attr"><span>出击</span><b>${data.stats.runs}</b></div>`;
  root.appendChild(attr);

  const wrap = el("div", "inv-wrap");
  // --- left: equipment slots ---
  const left = el("div", "inv-equip");
  left.appendChild(el("h3", null, "装备"));
  for (const s of SLOTS) {
    const id = data.equipment[s.key];
    const item = id ? ITEM_DB[id] : null;
    const slot = el("div", "equip-slot" + (item ? " filled rar-" + item.rarity : ""));
    slot.innerHTML = `<div class="slot-label">${s.label}</div>` +
      (item ? `<div class="slot-icon">${item.icon}</div><div class="slot-name">${item.name}</div>` : `<div class="slot-empty">空</div>`);
    if (item) {
      slot.title = "点击卸下";
      slot.addEventListener("click", () => { unequip(s.key); renderInventory(root); });
      slot.addEventListener("mouseenter", () => showDetail(id));
    }
    left.appendChild(slot);
  }
  wrap.appendChild(left);

  // --- right: item grid ---
  const right = el("div", "inv-grid-wrap");
  right.appendChild(el("h3", null, `背包 <span class="inv-count">${data.inventory.length}</span>`));
  const grid = el("div", "inv-grid");
  data.inventory.forEach((entry) => {
    const item = ITEM_DB[entry.id];
    if (!item) return;
    const equippable = item.type !== "material";
    const equipped = equippable && data.equipment[item.type] === entry.id;
    const cell = el("div", "inv-cell rar-" + item.rarity + (equipped ? " equipped" : ""));
    cell.innerHTML = `<div class="cell-icon">${item.icon}</div>` +
      (entry.qty > 1 ? `<div class="cell-qty">${entry.qty}</div>` : "") +
      (equipped ? `<div class="cell-eq">E</div>` : "");
    cell.addEventListener("mouseenter", () => showDetail(entry.id));
    cell.addEventListener("click", () => {
      if (equippable) { equip(entry.id); renderInventory(root); }
    });
    grid.appendChild(cell);
  });
  right.appendChild(grid);
  wrap.appendChild(right);

  // --- detail panel ---
  const detail = el("div", "inv-detail");
  detail.id = "invDetail";
  detail.innerHTML = `<div class="det-hint">悬停查看 · 点击武器/护甲装备，点装备槽卸下</div>`;
  wrap.appendChild(detail);

  root.appendChild(wrap);
}

function showDetail(id) {
  const item = ITEM_DB[id];
  const d = document.getElementById("invDetail");
  if (!item || !d) return;
  const stats = Object.entries(item.stats).map(([k, v]) => `<div class="det-stat"><span>${k}</span><b>${v}</b></div>`).join("");
  d.innerHTML =
    `<div class="det-head rar-${item.rarity}"><span class="det-icon">${item.icon}</span>` +
    `<div><div class="det-name">${item.name}</div><div class="det-rar">${RARITY_LABEL[item.rarity]} · ${typeLabel(item.type)}</div></div></div>` +
    `<div class="det-stats">${stats || ""}</div>` +
    `<div class="det-desc">${item.desc}</div>`;
}
function typeLabel(t) {
  return { primary: "主武器", secondary: "副武器", melee: "近战", armor: "护甲", gear: "装备", material: "材料" }[t] || t;
}

function equip(id) {
  const item = ITEM_DB[id];
  if (!item || item.type === "material") return;
  const data = account.getData();
  data.equipment[item.type] = id;
  account.save(data);
}
function unequip(slotKey) {
  const data = account.getData();
  data.equipment[slotKey] = null;
  account.save(data);
}
