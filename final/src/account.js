// Local account system. Accounts + per-account data (inventory, equipment,
// stats, coins) are stored in localStorage. No real security — passwords are
// only lightly hashed since everything lives on the player's machine.

const ACC_KEY = "pn_accounts_v1";
const SESS_KEY = "pn_session_v1";

function readAll() {
  try { return JSON.parse(localStorage.getItem(ACC_KEY)) || {}; } catch { return {}; }
}
function writeAll(a) { localStorage.setItem(ACC_KEY, JSON.stringify(a)); }

// tiny non-crypto hash (djb2) — local-only obfuscation, not security
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// XP needed to go from `level` to `level + 1`.
export const xpNeed = (level) => 80 + level * 40;

// Starter loadout so the backpack isn't empty while there's no game content yet.
function defaultData() {
  return {
    level: 1,
    xp: 0,
    missions: {}, // accepted missions: id -> { progress, done, claimed }
    coins: 500,
    skins: { ak: "black" }, // in-hand AK skin; "gold" is earned from the merchant
    equipment: { primary: "ak47_black", secondary: "pistol_std", melee: "combat_knife", armor: null, gear: null },
    inventory: [
      { id: "ak47_black", qty: 1 },
      { id: "pistol_std", qty: 1 },
      { id: "combat_knife", qty: 1 },
      { id: "nano_armor", qty: 1 },
      { id: "tac_gloves", qty: 1 },
      { id: "med_stim", qty: 3 },
      { id: "scrap", qty: 6 },
      { id: "data_chip", qty: 1 },
    ],
    stats: { kills: 0, deaths: 0, runs: 0 },
  };
}

export const account = {
  register(user, pass) {
    user = (user || "").trim();
    if (user.length < 2) return { ok: false, msg: "用户名至少 2 个字符" };
    if ((pass || "").length < 3) return { ok: false, msg: "密码至少 3 位" };
    const all = readAll();
    if (all[user]) return { ok: false, msg: "该用户名已存在" };
    all[user] = { passHash: hash(pass), created: Date.now(), data: defaultData() };
    writeAll(all);
    localStorage.setItem(SESS_KEY, user);
    return { ok: true };
  },
  login(user, pass) {
    user = (user || "").trim();
    const all = readAll();
    const a = all[user];
    if (!a) return { ok: false, msg: "用户不存在" };
    if (a.passHash !== hash(pass)) return { ok: false, msg: "密码错误" };
    localStorage.setItem(SESS_KEY, user);
    return { ok: true };
  },
  logout() { localStorage.removeItem(SESS_KEY); },
  current() { return localStorage.getItem(SESS_KEY); },
  list() { return Object.keys(readAll()); },
  getData() {
    const u = this.current();
    if (!u) return null;
    const all = readAll();
    const d = all[u] && all[u].data;
    if (!d) return null;
    // migrate older saves
    if (d.level == null) d.level = 1;
    if (d.xp == null) d.xp = 0;
    if (!d.missions) d.missions = {};
    if (!d.skins) d.skins = { ak: "black" };
    if (!d.stats) d.stats = { kills: 0, deaths: 0, runs: 0 };
    return d;
  },
  // Grant coins + XP (kills, wave bonuses). Handles level-ups; returns the
  // number of levels gained so the caller can celebrate.
  award(coins = 0, xp = 0) {
    const d = this.getData();
    if (!d) return 0;
    d.coins += coins;
    d.xp += xp;
    let ups = 0;
    while (d.xp >= xpNeed(d.level)) {
      d.xp -= xpNeed(d.level);
      d.level += 1;
      ups += 1;
    }
    this.save(d);
    return ups;
  },
  save(data) {
    const u = this.current();
    if (!u) return;
    const all = readAll();
    if (all[u]) { all[u].data = data; writeAll(all); }
  },
  addItem(id, qty = 1) {
    const d = this.getData();
    if (!d) return;
    const e = d.inventory.find((x) => x.id === id);
    if (e) e.qty += qty; else d.inventory.push({ id, qty });
    this.save(d);
  },
  take(id, qty = 1) {
    const d = this.getData();
    if (!d) return false;
    const e = d.inventory.find((x) => x.id === id);
    if (!e || e.qty < qty) return false;
    e.qty -= qty;
    if (e.qty <= 0) d.inventory = d.inventory.filter((x) => x.id !== id);
    this.save(d);
    return true;
  },
  count(id) {
    const d = this.getData();
    const e = d && d.inventory.find((x) => x.id === id);
    return e ? e.qty : 0;
  },
};
