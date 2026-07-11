import { account } from "./account.js?v=260711004";

// Mission definitions + per-account progress. Accepted missions live in the
// account data as `missions[id] = { progress, done, claimed }`; unaccepted
// missions simply have no entry.
export const MISSIONS = [
  {
    id: "m_outpost", name: "清剿前哨", type: "kill", goal: 12,
    desc: "在 Area 1 消灭 12 名训练兵。",
    reward: { coins: 600, items: [{ id: "scrap", qty: 4 }] },
    rewardText: "₡ 600 + 合金废料 ×4",
  },
  {
    id: "m_data", name: "回收数据", type: "collect", item: "data_chip", goal: 3,
    desc: "拾取 3 枚数据芯片（Area 1 击杀掉落）。",
    reward: { coins: 850, items: [{ id: "tac_gloves", qty: 1 }] },
    rewardText: "₡ 850 + 战术手套",
  },
  {
    id: "m_waves", name: "波次防御", type: "wave", goal: 5,
    desc: "在 Area 1 累计清剿 5 个波次（每 3 波会出现重型单位）。",
    reward: { coins: 1200, items: [{ id: "data_chip", qty: 2 }] },
    rewardText: "₡ 1200 + 数据芯片 ×2",
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
