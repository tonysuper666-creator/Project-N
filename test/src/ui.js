import { account } from "./account.js?v=260711012";
import { ITEM_DB, LONDON_LOOT, PARIS_LOOT, MOSCOW_LOOT } from "./inventory.js?v=260711012";
import { MISSIONS, missionState, acceptMission, claimMission } from "./missions.js?v=260711012";
import { audio } from "./audio.js?v=260711012";
import { PARTS, MAX_LEVEL, getParts, weaponRarity, tryEnhance, effectiveMods } from "./enhance.js?v=260711012";

// DOM-based menus for the base: vendor (armory), missions, and the deploy
// (area select) door. Opening a panel frees the mouse; closing re-locks the
// game.

// Note:弹药不在商店出售 —— 基地内备用弹无限（锁定 999），部署时按标准装载补满。
const VENDOR_ITEMS = [
  { name: "医疗针剂 ×1", price: 200, give: "med_stim" },
  { name: "数据芯片 ×1", price: 350, give: "data_chip" },
];

// Exchange materials for the gold AK skin.
const GOLD_AK_COST = [{ id: "scrap", qty: 8 }, { id: "data_chip", qty: 3 }];

// Craftable primaries: hand over materials, get the weapon (auto-equipped).
const WEAPON_EXCHANGES = [
  { id: "laser_rifle", tag: "史诗", tagCls: "diff-普通",
    cost: [{ id: "alloy_core", qty: 2 }, { id: "data_chip", qty: 4 }],
    desc: "定向能量武器，扣下扳机即持续不间断的激光光束，弹道笔直、后坐极低。" },
  { id: "sniper", tag: "史诗", tagCls: "diff-普通",
    cost: [{ id: "alloy_core", qty: 2 }, { id: "scrap", qty: 10 }],
    desc: "反器材栓动狙击枪，右键开镜，单发伤害巨高、爆头秒杀。" },
  { id: "minigun", tag: "传说", tagCls: "diff-高危",
    cost: [{ id: "alloy_core", qty: 4 }, { id: "scrap", qty: 12 }, { id: "data_chip", qty: 3 }],
    desc: "重型转膛机枪，持续开火逐渐提高转速与射速，单弹夹 100 发，换弹缓慢。" },
  { id: "laser_sniper", tag: "传说", tagCls: "diff-高危",
    cost: [{ id: "alloy_core", qty: 5 }, { id: "data_chip", qty: 5 }],
    desc: "单发式激光狙击（联狙），右键开镜，瞬发笔直光束、超高单发伤害。" },
];

// Revive tokens: consumed automatically on death to respawn in place.
const REVIVE_COST = [{ id: "scrap", qty: 6 }, { id: "data_chip", qty: 2 }];

const AREAS = [
  { id: "london", name: "行动 · 伦敦沦陷", diff: "普通", reqLevel: 1, loot: LONDON_LOOT,
    desc: "伦敦街区线性推进：逐段刷新更强的敌人（蓝/紫色为精英），尽头大本钟前迎战首领「钢铁首领」。沿途多个弹药补给点。清关铁门开启，击败首领后原地生成撤离点。" },
  { id: "paris", name: "行动 · 巴黎攻防", diff: "高危", reqLevel: 3, loot: PARIS_LOOT,
    desc: "巴黎林荫大道：穿过凯旋门、绕过环岛广场、沿塞纳河推进，敌人更强更多。尽头埃菲尔铁塔前迎战「铁塔守卫者」。火箭筒/连发火箭筒为本图专属掉落。" },
  { id: "moscow", name: "行动 · 莫斯科堡垒", diff: "终极", reqLevel: 8, loot: MOSCOW_LOOT,
    desc: "苏联红场要塞：装甲门→装备库→指挥中心→导弹阵地，敌人数量翻倍、生命值剧增。重装单位把守每一道防线。尽头克里姆林宫前迎战最终首领「红堡守卫者」（HP 7500）。最丰富的战利品掉落，包含钛核心等终极强化材料。" },
];

export function createUI(hooks = {}) {
  const root = document.createElement("div");
  root.id = "menuRoot";
  root.className = "hidden";
  document.body.appendChild(root);
  root.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON" && !e.target.disabled) audio.click();
  });

  let open = false;
  const coins = () => { const d = account.getData(); return d ? d.coins : 0; };

  function close() {
    open = false;
    root.className = "hidden";
    root.innerHTML = "";
    if (hooks.onClose) hooks.onClose();
  }

  function refreshCoins() {
    const c = root.querySelector(".credits b");
    if (c) c.textContent = `◈ ${coins()}`;
  }

  function shell(title, sub) {
    root.className = "";
    root.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "menuPanel";
    panel.innerHTML = `
      <div class="menuHead">
        <div>
          <h2>${title}</h2>
          <p>${sub}</p>
        </div>
        <div class="credits">余额 <b>◈ ${coins()}</b></div>
      </div>
      <div class="menuBody"></div>
      <button class="menuClose">关闭 (Esc)</button>
    `;
    root.appendChild(panel);
    panel.querySelector(".menuClose").addEventListener("click", () => {
      close();
      if (hooks.onResume) hooks.onResume();
    });
    return panel.querySelector(".menuBody");
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add("show"), 10);
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 2200);
  }

  function costText(cost) {
    return cost.map((c) => `${ITEM_DB[c.id].name}×${c.qty}`).join(" + ");
  }
  function canAfford(cost) { return cost.every((c) => account.count(c.id) >= c.qty); }

  // cost as a row of item-icon chips, dimming ones you can't afford.
  function costChips(cost) {
    return `<span class="cost-chips">` + cost.map((c) => {
      const it = ITEM_DB[c.id]; const have = account.count(c.id); const ok = have >= c.qty;
      return `<span class="cost-chip${ok ? "" : " short"}" title="${it.name} ${have}/${c.qty}"><span class="cc-icon">${it.icon}</span><span class="cc-qty">×${c.qty}</span></span>`;
    }).join("") + `</span>`;
  }
  function sectionHead(body, title) {
    const h = document.createElement("div"); h.className = "shopSection"; h.textContent = title; body.appendChild(h);
  }
  // a crafting card: icon + name + tag + stats + cost chips + button
  function craftCard(def, tag, tagCls, cost, ownedText, onBuy) {
    const card = document.createElement("div"); card.className = "craftCard rar-" + def.rarity;
    const stats = Object.entries(def.stats || {}).slice(0, 3).map(([k, v]) => `<span class="cc-stat">${k} <b>${v}</b></span>`).join("");
    card.innerHTML =
      `<div class="cc-icon-lg">${def.icon}</div>` +
      `<div class="cc-main"><div class="cc-name">${def.name} <em class="diff ${tagCls}">${tag}</em></div>` +
      `<div class="cc-desc">${def.desc || ""}</div><div class="cc-stats">${stats}</div>` +
      `<div class="cc-cost">材料 ${costChips(cost)}</div></div>` +
      `<button class="rowBtn deploy cc-btn"></button>`;
    const btn = card.querySelector(".cc-btn");
    const render = () => { btn.textContent = ownedText(); btn.classList.toggle("owned", ownedText() !== "兑换"); };
    render();
    btn.addEventListener("click", () => { if (onBuy(render)) refreshCoins(); });
    return card;
  }

  const RAR_LABEL = { common: "普通", rare: "稀有", epic: "史诗", legend: "传说" };
  let enhanceSel = null; // currently-selected weapon id in the enhance panel

  function ownedWeapons() {
    const d = account.getData();
    const ids = [];
    const push = (id) => { if (id && ITEM_DB[id] && !ids.includes(id)) ids.push(id); };
    for (const k of ["primary", "secondary", "melee"]) push(d.equipment[k]);
    for (const e of d.inventory) { const it = ITEM_DB[e.id]; if (it && (it.type === "primary" || it.type === "secondary" || it.type === "melee")) push(e.id); }
    return ids;
  }

  // Weapon-enhancement panel: pick a weapon, upgrade its 5 parts (materials +
  // probability). Re-renders itself after each attempt.
  function renderEnhance(wrap) {
    wrap.innerHTML = "";
    const weps = ownedWeapons();
    if (!weps.length) { wrap.innerHTML = `<div class="enh-empty">暂无可强化的武器</div>`; return; }
    const d = account.getData();
    if (!enhanceSel || !weps.includes(enhanceSel)) enhanceSel = d.equipment.primary && weps.includes(d.equipment.primary) ? d.equipment.primary : weps[0];

    const sel = document.createElement("div"); sel.className = "enh-sel";
    for (const id of weps) {
      const it = ITEM_DB[id]; const rar = weaponRarity(id);
      const chip = document.createElement("button");
      chip.className = "enh-chip rar-" + rar + (id === enhanceSel ? " on" : "");
      chip.innerHTML = `<span class="enh-chip-ic">${it.icon}</span><span class="enh-chip-nm">${it.name}</span>`;
      chip.addEventListener("click", () => { enhanceSel = id; renderEnhance(wrap); });
      sel.appendChild(chip);
    }
    wrap.appendChild(sel);

    const it = ITEM_DB[enhanceSel];
    const rar = weaponRarity(enhanceSel);
    const mods = effectiveMods(enhanceSel);
    const head = document.createElement("div"); head.className = "enh-head rar-" + rar;
    head.innerHTML = `<span class="enh-ic">${it.icon}</span><div class="enh-hmain">` +
      `<div class="enh-nm">${it.name} <em class="diff enh-rar rar-${rar}">${RAR_LABEL[rar]}</em></div>` +
      `<div class="enh-sum">伤害 ×${mods.damageMul.toFixed(2)} · 射速 ×${(1 / mods.fireRateMul).toFixed(2)} · 弹匣 ×${mods.magMul.toFixed(2)} · 后坐 ×${mods.recoilMul.toFixed(2)} · 稳定 ×${mods.spreadMul.toFixed(2)}</div></div>`;
    wrap.appendChild(head);

    const p = getParts(enhanceSel);
    for (const part of PARTS) {
      const lvl = p[part.key] || 0;
      const maxed = lvl >= MAX_LEVEL;
      const cost = maxed ? [] : part.cost(lvl);
      const chance = maxed ? 0 : part.chance(lvl);
      const row = document.createElement("div"); row.className = "enh-row rar-" + part.tier;
      row.innerHTML = `<span class="enh-pic">${part.icon}</span>` +
        `<div class="enh-info"><div class="enh-pn">${part.label} · ${part.attr} <em class="enh-tier rar-${part.tier}">${RAR_LABEL[part.tier]}级</em></div>` +
        `<div class="enh-lvl"><span class="enh-pips">${"◆".repeat(lvl)}${"◇".repeat(MAX_LEVEL - lvl)}</span> <b>Lv.${lvl}/${MAX_LEVEL}</b></div>` +
        `<div class="enh-cd">${part.desc}</div></div>` +
        `<div class="enh-act">${maxed ? '<div class="enh-max">已满级</div>' : `<div class="enh-cost">${costChips(cost)}</div><div class="enh-ch">成功率 <b>${Math.round(chance * 100)}%</b></div><button class="rowBtn deploy enh-btn">强化</button>`}</div>`;
      if (!maxed) {
        row.querySelector(".enh-btn").addEventListener("click", () => {
          const res = tryEnhance(enhanceSel, part.key);
          if (!res.ok) { toast(res.msg); return; }
          toast(res.msg);
          if (res.success && audio.levelup) audio.levelup();
          if (hooks.onLoadoutChanged) hooks.onLoadoutChanged();
          renderEnhance(wrap); refreshCoins();
        });
      }
      wrap.appendChild(row);
    }
  }

  function openVendor() {
    open = true;
    const body = shell("装备商人 · 军械", "强化武器 · 用材料制造高级武器 · 购买补给与复活币");

    // ===== 武器强化 =====
    sectionHead(body, "🛠️ 武器强化（消耗材料 · 概率成功）");
    const enhWrap = document.createElement("div"); enhWrap.className = "enhWrap"; body.appendChild(enhWrap);
    renderEnhance(enhWrap);

    // ===== 武器制造 =====
    sectionHead(body, "🔧 武器制造");
    const grid = document.createElement("div"); grid.className = "craftGrid"; body.appendChild(grid);
    // gold AK (skin upgrade, treated as a craft)
    const gd = ITEM_DB.ak47_gold;
    grid.appendChild(craftCard(gd, "传说", "diff-高危", GOLD_AK_COST,
      () => (account.getData().skins && account.getData().skins.ak === "gold") ? "已拥有" : "兑换",
      (render) => {
        if (account.getData().skins.ak === "gold") return false;
        if (!canAfford(GOLD_AK_COST)) { toast("材料不足"); return false; }
        for (const c of GOLD_AK_COST) account.take(c.id, c.qty);
        const d2 = account.getData(); d2.skins.ak = "gold";
        if (!d2.inventory.find((x) => x.id === "ak47_gold")) d2.inventory.push({ id: "ak47_gold", qty: 1 });
        d2.equipment.primary = "ak47_gold"; account.save(d2);
        if (window.__PN_SET_AK_SKIN__) window.__PN_SET_AK_SKIN__("gold");
        toast("已兑换：黄金 AK-47 ✦"); render(); return true;
      }));
    for (const wx of WEAPON_EXCHANGES) {
      const def = ITEM_DB[wx.id];
      grid.appendChild(craftCard(def, wx.tag, wx.tagCls, wx.cost,
        () => account.count(wx.id) > 0 ? "已拥有 · 装备" : "兑换",
        (render) => {
          const has = account.count(wx.id) > 0;
          if (!has) { if (!canAfford(wx.cost)) { toast("材料不足"); return false; } for (const c of wx.cost) account.take(c.id, c.qty); }
          const d2 = account.getData();
          if (!d2.inventory.find((x) => x.id === wx.id)) d2.inventory.push({ id: wx.id, qty: 1 });
          d2.equipment.primary = wx.id; account.save(d2);
          if (hooks.onLoadoutChanged) hooks.onLoadoutChanged();
          toast(`已装备：${def.name}`); render(); return true;
        }));
    }

    // ===== 特殊 =====
    sectionHead(body, "✦ 特殊物资");
    const rdef = ITEM_DB.revive_coin;
    const rgrid = document.createElement("div"); rgrid.className = "craftGrid"; body.appendChild(rgrid);
    rgrid.appendChild(craftCard(rdef, "传说", "diff-高危", REVIVE_COST,
      () => `兑换 · 持有 ${account.count("revive_coin")}`,
      (render) => {
        if (!canAfford(REVIVE_COST)) { toast("材料不足"); return false; }
        for (const c of REVIVE_COST) account.take(c.id, c.qty);
        account.addItem("revive_coin", 1); toast("已兑换：复活币 ×1"); render(); return true;
      }));

    // ===== 补给（金币） =====
    sectionHead(body, "◈ 补给（金币购买）");
    for (const item of VENDOR_ITEMS) {
      const def = ITEM_DB[item.give] || { icon: "📦", name: item.name };
      const r = document.createElement("div"); r.className = "shopRow";
      r.innerHTML = `<span class="sr-icon">${def.icon}</span><span class="sr-name">${item.name}</span>
        <span class="sr-price">◈ ${item.price}</span><button class="rowBtn">购买</button>`;
      r.querySelector(".rowBtn").addEventListener("click", () => {
        const d = account.getData();
        if (d.coins >= item.price) {
          d.coins -= item.price;
          if (item.give) { const e = d.inventory.find((x) => x.id === item.give); if (e) e.qty += 1; else d.inventory.push({ id: item.give, qty: 1 }); }
          account.save(d);
          if (item.ammo && hooks.onBuyAmmo) hooks.onBuyAmmo(item.ammo);
          refreshCoins(); toast(`已购买：${item.name}`);
        } else { toast("余额不足"); }
      });
      body.appendChild(r);
    }
  }

  function openMission() {
    open = true;
    const body = shell("任务终端", "接取任务，完成后回来领取奖励");
    for (const m of MISSIONS) {
      const row = document.createElement("div");
      row.className = "listRow tall";
      row.innerHTML = `<div class="rowText"><span class="rowName">${m.name}</span>
        <span class="rowDesc">${m.desc}</span>
        <span class="rowReward">奖励：${m.rewardText}</span></div>
        <button class="rowBtn"></button>`;
      const btn = row.querySelector(".rowBtn");
      const render = () => {
        const st = missionState(m.id);
        if (!st) { btn.textContent = "接取"; btn.disabled = false; btn.classList.remove("deploy"); }
        else if (!st.done) { btn.textContent = `进行中 ${st.progress}/${m.goal}`; btn.disabled = true; }
        else if (!st.claimed) { btn.textContent = "领取奖励"; btn.disabled = false; btn.classList.add("deploy"); }
        else { btn.textContent = "已完成"; btn.disabled = true; btn.classList.remove("deploy"); }
      };
      render();
      btn.addEventListener("click", () => {
        const st = missionState(m.id);
        if (!st) {
          acceptMission(m.id);
          toast(`已接取任务：${m.name}`);
        } else if (st.done && !st.claimed) {
          if (claimMission(m.id)) {
            toast(`任务完成：${m.name} · 获得 ${m.rewardText}`);
            refreshCoins();
          }
        }
        render();
        if (hooks.onMissionsChanged) hooks.onMissionsChanged();
      });
      body.appendChild(row);
    }
  }

  // Build the "possible drops" icon strip for an area (sorted rarest-first).
  function dropStrip(table = LONDON_LOOT) {
    const order = { legend: 0, epic: 1, rare: 2, common: 3 };
    const ids = [...new Set(table.map((e) => e.id))]
      .filter((id) => ITEM_DB[id])
      .sort((a, b) => (order[ITEM_DB[a].rarity] ?? 9) - (order[ITEM_DB[b].rarity] ?? 9));
    const cells = ids.map((id) => {
      const it = ITEM_DB[id];
      return `<span class="drop-cell rar-${it.rarity}" title="${it.name}"><span class="drop-icon">${it.icon}</span></span>`;
    }).join("");
    return `<div class="drop-list"><span class="drop-label">可能掉落</span><div class="drop-cells">${cells}</div></div>`;
  }

  function openDeploy() {
    open = true;
    const body = shell("部署门 · 选择副本", "选择作战区域并出击");
    const lvl = (account.getData() || { level: 1 }).level;
    for (const a of AREAS) {
      const meets = lvl >= a.reqLevel;
      const row = document.createElement("div");
      row.className = "listRow tall";
      row.innerHTML = `<div class="rowText"><span class="rowName">${a.name}
        <em class="diff diff-${a.diff}">${a.diff}</em></span>
        <span class="rowDesc">${a.desc}</span>
        ${dropStrip(a.loot)}
        <span class="rowReward">进入要求：等级 ${a.reqLevel}（当前 Lv.${lvl}）</span></div>
        <button class="rowBtn deploy">${meets ? "部署" : `需要等级 ${a.reqLevel}`}</button>`;
      const btn = row.querySelector(".rowBtn");
      if (!meets) btn.disabled = true;
      btn.addEventListener("click", () => {
        toast(`正在部署到「${a.name}」…`);
        close();
        if (hooks.onDeploy) hooks.onDeploy(a);
        if (hooks.onResume) hooks.onResume();
      });
      body.appendChild(row);
    }
  }

  function openAction(action) {
    if (action === "vendor") openVendor();
    else if (action === "mission") openMission();
    else if (action === "deploy") openDeploy();
  }

  // Post-extraction debrief: what this run earned.
  function showSummary(run) {
    open = true;
    const body = shell("撤离成功 · 行动结算", "本次出击的收获");
    const stats = document.createElement("div");
    stats.className = "sumStats";
    stats.innerHTML =
      `<div class="sumCell"><b>${run.kills}</b><span>击杀</span></div>` +
      `<div class="sumCell"><b>${run.waves}</b><span>清剿波次</span></div>` +
      `<div class="sumCell"><b>◈ ${run.coins}</b><span>金币收入</span></div>` +
      `<div class="sumCell"><b>+${run.xp}</b><span>经验</span></div>`;
    body.appendChild(stats);
    const lootIds = Object.keys(run.loot);
    const lootWrap = document.createElement("div");
    lootWrap.className = "sumLoot";
    if (lootIds.length === 0) {
      lootWrap.innerHTML = `<div class="sumEmpty">本次没有拾取战利品</div>`;
    } else {
      for (const id of lootIds) {
        const item = ITEM_DB[id];
        const cell = document.createElement("div");
        cell.className = "sumItem rar-" + (item ? item.rarity : "common");
        cell.innerHTML = `<span class="si-icon">${item ? item.icon : "❓"}</span>` +
          `<span class="si-name">${item ? item.name : id}</span><span class="si-qty">×${run.loot[id]}</span>`;
        lootWrap.appendChild(cell);
      }
    }
    body.appendChild(lootWrap);
  }

  return { openAction, close, toast, showSummary, isOpen: () => open };
}
