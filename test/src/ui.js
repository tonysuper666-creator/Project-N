import { account } from "./account.js?v=260711002";
import { ITEM_DB } from "./inventory.js?v=260711002";
import { MISSIONS, missionState, acceptMission, claimMission } from "./missions.js?v=260711002";
import { audio } from "./audio.js?v=260711002";

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

const AREAS = [
  { id: "area1", name: "AREA 1 · 密林前哨", diff: "普通", reqLevel: 1,
    desc: "针叶林作战区，银装训练兵波次进攻，每 3 波出现重型单位（必掉 3 件战利品）。击杀掉落材料，小概率掉成品武器；走到撤离点按 E 返回。" },
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

  function openVendor() {
    open = true;
    const body = shell("装备商人 · 军械", "用材料兑换高级武器，或购买补给");

    // --- gold AK exchange ---
    const data = account.getData();
    const owned = data && data.skins && data.skins.ak === "gold";
    const row = document.createElement("div");
    row.className = "listRow tall";
    row.innerHTML = `<div class="rowText"><span class="rowName">黄金 AK-47 <em class="diff diff-高危">传说</em></span>
      <span class="rowDesc">把手中的 AK 升级为金色涂装。材料：${costText(GOLD_AK_COST)}</span></div>
      <button class="rowBtn deploy">${owned ? "已拥有" : "兑换"}</button>`;
    const btn = row.querySelector(".rowBtn");
    if (owned) btn.disabled = true;
    btn.addEventListener("click", () => {
      if (account.getData().skins.ak === "gold") return;
      if (!canAfford(GOLD_AK_COST)) { toast("材料不足"); return; }
      for (const c of GOLD_AK_COST) account.take(c.id, c.qty);
      const d2 = account.getData();
      d2.skins.ak = "gold";
      if (!d2.inventory.find((x) => x.id === "ak47_gold")) d2.inventory.push({ id: "ak47_gold", qty: 1 });
      d2.equipment.primary = "ak47_gold";
      account.save(d2);
      if (window.__PN_SET_AK_SKIN__) window.__PN_SET_AK_SKIN__("gold"); // recolour the in-hand AK live
      btn.textContent = "已拥有"; btn.disabled = true;
      toast("已兑换：黄金 AK-47 ✦");
    });
    body.appendChild(row);

    // --- consumables (coins) ---
    for (const item of VENDOR_ITEMS) {
      const r = document.createElement("div");
      r.className = "listRow";
      r.innerHTML = `<span class="rowName">${item.name}</span>
        <span class="rowMeta">◈ ${item.price}</span>
        <button class="rowBtn">购买</button>`;
      r.querySelector(".rowBtn").addEventListener("click", () => {
        const d = account.getData();
        if (d.coins >= item.price) {
          d.coins -= item.price;
          if (item.give) { const e = d.inventory.find((x) => x.id === item.give); if (e) e.qty += 1; else d.inventory.push({ id: item.give, qty: 1 }); }
          account.save(d);
          if (item.ammo && hooks.onBuyAmmo) hooks.onBuyAmmo(item.ammo); // load it straight into the weapon
          refreshCoins();
          toast(`已购买：${item.name}`);
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
