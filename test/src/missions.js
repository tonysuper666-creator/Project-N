import { account } from "./account.js?v=260711007";

// Mission definitions + per-account progress. Accepted missions live in the
// account data as `missions[id] = { progress, done, claimed }`; unaccepted
// missions simply have no entry.
export const MISSIONS = [
  {
    id: "m_sweep", name: "街头肃清", type: "kill", goal: 20,
    desc: "在伦敦行动中消灭 20 名敌人。",
    reward: { coins: 700, items: [{ id: "scrap", qty: 5 }] },
    rewardText: "₡ 700 + 合金废料 ×5",
  },
  {
    id: "m_intel", name: "回收情报", type: "collect", item: "data_chip", goal: 5,
    desc: "拾取 5 枚数据芯片（击杀掉落）。",
    reward: { coins: 900, items: [{ id: "tac_gloves", qty: 1 }] },
    rewardText: "₡ 900 + 战术手套",
  },
  {
    id: "m_elite", name: "精英猎手", type: "elite", goal: 4,
    desc: "击杀 4 名精英单位（蓝/紫色）。",
    reward: { coins: 1100, items: [{ id: "alloy_core", qty: 1 }] },
    rewardText: "₡ 1100 + 合金核心 ×1",
  },
  {
    id: "m_boss", name: "斩首行动", type: "boss", goal: 1,
    desc: "击败伦敦行动尽头的最终首领「钢铁首领」。",
    reward: { coins: 2000, items: [{ id: "alloy_core", qty: 2 }, { id: "revive_coin", qty: 1 }] },
    rewardText: "₡ 2000 + 合金核心 ×2 + 复活币 ×1",
  },
];

export function missionState(id) {
  const d = account.getData();
  return (d && d.missions && d.missions[id]) || null;
}

export function acceptMission(id) {
  const d = account.getData();
  if (!d || d.missions[id]) return;
  d.missions[id] = { progress: 0, done: false, claimed: false };
  account.save(d);
}

// Advance every accepted, unfinished mission matching `type` (and, for
// collect missions, `itemId`). Returns the defs that just hit their goal.
export function recordProgress(type, itemId = null, qty = 1) {
  const d = account.getData();
  if (!d || !d.missions) return [];
  const completed = [];
  let dirty = false;
  for (const m of MISSIONS) {
    const st = d.missions[m.id];
    if (!st || st.done || m.type !== type) continue;
    if (type === "collect" && m.item !== itemId) continue;
    st.progress = Math.min(m.goal, st.progress + qty);
    dirty = true;
    if (st.progress >= m.goal) {
      st.done = true;
      completed.push(m);
    }
  }
  if (dirty) account.save(d);
  return completed;
}

// Hand out the reward for a finished mission. Returns the def, or null if it
// isn't claimable.
export function claimMission(id) {
  const d = account.getData();
  const st = d && d.missions && d.missions[id];
  const m = MISSIONS.find((x) => x.id === id);
  if (!m || !st || !st.done || st.claimed) return null;
  st.claimed = true;
  d.coins += m.reward.coins;
  account.save(d);
  for (const it of m.reward.items) account.addItem(it.id, it.qty);
  return m;
}

// Accepted missions that still need attention (in progress or unclaimed),
// for the HUD tracker.
export function trackedMissions() {
  const d = account.getData();
  if (!d || !d.missions) return [];
  const out = [];
  for (const m of MISSIONS) {
    const st = d.missions[m.id];
    if (st && !st.claimed) out.push({ def: m, st });
  }
  return out;
}
