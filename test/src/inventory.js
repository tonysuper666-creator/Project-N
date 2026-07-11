import { account } from "./account.js?v=260711001";

// Item database. Equip-able types: primary / secondary / melee / armor / gear.
// "material" items are non-equippable (stackable resources / consumables).
export const ITEM_DB = {
  ak47_black: { name: "AK-47", type: "primary", rarity: "common", icon: "🔫", stats: { 伤害: 38, 射速: 600, 稳定: 65 }, desc: "制式突击步枪（默认黑色涂装）。" },
  ak47_gold: { name: "黄金 AK-47", type: "primary", rarity: "legend", icon: "🔫", stats: { 伤害: 42, 射速: 600, 稳定: 70 }, desc: "传说级金枪，可在商人处用材料兑换。" },
  smg_proto: { name: "原型冲锋枪", type: "primary", rarity: "epic", icon: "🔫", stats: { 伤害: 9, 射速: 900 }, desc: "实验型高射速冲锋枪，Area 区域掉落。装备为主武器后即可使用。" },
  pistol_std: { name: "制式手枪", type: "secondary", rarity: "common", icon: "🔫", stats: { 伤害: 26, 射速: 300 }, desc: "可靠的副武器。" },
  combat_knife: { name: "作战匕首", type: "melee", rarity: "common", icon: "🗡️", stats: { 伤害: 150 }, desc: "近身致命。" },
  nano_armor: { name: "纳米护甲", type: "armor", rarity: "epic", icon: "🛡️", stats: { 减伤: "30%" }, desc: "装备后受到的伤害降低 30%。" },
  tac_gloves: { name: "战术手套", type: "gear", rarity: "rare", icon: "🧤", stats: { 换弹: "+15%" }, desc: "装备后换弹速度提升 15%。" },
  med_stim: { name: "医疗针剂", type: "material", rarity: "common", icon: "💉", stats: {}, desc: "消耗品，回复生命。" },
  scrap: { name: "合金废料", type: "material", rarity: "common", icon: "⚙️", stats: {}, desc: "通用制造材料，可在商人处兑换武器。" },
  data_chip: { name: "数据芯片", type: "material", rarity: "rare", icon: "💾", stats: {}, desc: "用于解锁与升级。" },
};

// Drop table for Area enemies: mostly materials, small chance of a finished
// weapon. Returns { id, qty }.
const LOOT_TABLE = [
  { id: "scrap", min: 1, max: 3, w: 52 },
  { id: "data_chip", min: 1, max: 1, w: 24 },
  { id: "med_stim", min: 1, max: 1, w: 13 },
  { id: "smg_proto", min: 1, max: 1, w: 8 }, // small chance: finished weapon
  { id: "ak47_gold", min: 1, max: 1, w: 3 }, // rare: gold AK directly
];
export function rollLoot() {
  const total = LOOT_TABLE.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of LOOT_TABLE) {
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
