// Shelf Defense: Closing Time — pure game logic + data (no rendering, runs in node too)
//
// Every day has two halves:
//   MORNING  customers wander in, pick random stations (shelves, vending machine, soda, microwave...),
//            walk to the counter to pay, then leave through the doors. Restock shelves while they shop.
//   NIGHT    burglars push in from the doors and try to reach the register. Defend it.

// The store is a small square by default; the "Room Expansion" paycheck upgrade grows it.
// COLS/ROWS are live bindings: setRoom() is called before every new Game, so importers see the new size.
export const ROOM_BASE = 9, ROOM_STEP = 2;
export let COLS = ROOM_BASE;      // doors and the counter spawn on a random side (left / top / right)
export let ROWS = ROOM_BASE;
export function setRoom(level = 0) { COLS = ROWS = ROOM_BASE + ROOM_STEP * level; }
// The counter and the doors are ALWAYS on opposite walls: counter top / doors bottom, counter left / doors right, or counter right / doors left.
// false = always counter right, doors left.
export const RANDOM_SIDES = true;
export const WAVES = Infinity;    // endless: nights never stop coming
export const HOURS = ['10 PM', '11 PM', '12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM'];
export const SUB_GAP = 6;         // seconds of calm between the waves of one night
export const NIGHT_DELAY = 3;      // seconds between the store closing and the night starting by itself
export const DAY_LEN = 18;        // seconds during which new customers keep arriving
export const ROUTES = 6;          // how many different routes burglars spread over
export const SHELF_COST = 400;    // path weight of a shelf: burglars only push through when nothing else is open
export const SHELF_HP = 80;
export const START_CASH = 250;       // the store starts as an EMPTY room with this much cash
export const CUSTOMER_WEAR = 3;      // every purchase from a machine wears it like this many shots
export const MAX_STOCK = 6;       // goods a shelf holds
export const START_STOCK = MAX_STOCK;   // the store starts with its shelves fully stocked
export const UNIT_COST = 2;       // price to restock one good
export const TOWER_HP = 70;         // turrets can be bombed / rammed to pieces
export const BOMB_DMG = 30, BOMB_RADIUS = 1.1, BOMB_FUSE = 1.0, DASH_DMG = 22;
export const BOUNCE_RANGE = 2.6;   // how far a hotdog can bounce to the next burglar
export const ICE_TIME = 4.5;       // seconds scattered ice cubes stay on the floor
export const CAN_COLORS = [0xe0463e, 0x3a86ff, 0x2fb67a, 0xffb703, 0xb26bd6, 0xff7aa2];
export const GUM_COLORS = [0xff5a8a, 0x5fe3a1, 0xffcf4a, 0x6fa8ff, 0xb26bd6, 0xffffff, 0xff8c1a];
export const COLA_PUSH_CAP = 3.2;   // max speed (tiles/s) a burglar can be shoved or dragged at

// ---------- Build cards ----------
// 'shelf' is the shelf itself: place a new one on the floor. Tap any shelf to restock it.
export const ITEMS = {
  shelf: { id: 'shelf', kind: 'shelf', name: 'Shelf', cost: 18, color: 0xa0703f, sale: [3, 6],
    desc: 'A fully stocked shelf. Customers buy goods from it by day, burglars smash it by night. Tap a shelf to restock.' },
  cans: { id: 'cans', kind: 'tower', name: 'Vending Machine', cost: 45, range: 2.9, dmg: 8, rate: 1.5, wear: 1 / 150, color: 0xd9534f, sale: [3, 5],
    desc: 'Customers buy drinks from it. At night it shoots 3D cans that scatter on the floor. Overuse wears it out.' },
  sauce: { id: 'sauce', kind: 'tower', name: 'Hot Sauce Lobber', cost: 85, range: 3.7, dmg: 4, rate: 0.6, splash: 1.0, burn: 7, burnTime: 3.2, fireTime: 3, panic: 0.4, wear: 1 / 90, color: 0xf08a24, sale: [2, 4],
    desc: 'Lobs a glob of sauce over the shelves. Splash + burn over time, and burning burglars may panic and run.' },
  soda: { id: 'soda', kind: 'tower', name: 'Soda Fizz', cost: 100, range: 2.7, dmg: 5, rate: 0.7, splash: 1.15, slow: 0.5, slowTime: 2.4, wear: 1 / 110, color: 0x2fb6a6, sale: [3, 5],
    desc: 'Sprays fizzy soda that leaves a trail: splash damage + slows.' },
  micro: { id: 'micro', kind: 'tower', name: 'Microwave', cost: 180, range: 2.3, dmg: 16, rate: 0.55, wear: 1 / 80, color: 0x8e96a8, sale: [5, 8],
    desc: 'Customers heat snacks in it. Zaps EVERY burglar nearby.' },
  mop: { id: 'mop', kind: 'trap', name: 'Mop & Bucket', cost: 20, uses: 12, color: 0xf2c94c,
    desc: 'Floor trap (not a wall). Slips burglars: stun + damage.' },
  hotdog: { id: 'hotdog', kind: 'tower', name: 'Hot Dog Launcher', cost: 130, range: 3.2, dmg: 9, rate: 1.1, bounces: 3, wear: 1 / 120, color: 0xe8a33d, sale: [3, 6],
    desc: 'Customers grab a hot dog. At night it fires hot dogs that BOUNCE from burglar to burglar.' },
  fridge: { id: 'fridge', kind: 'tower', name: 'Fridge', cost: 230, range: 3.2, dmg: 7, rate: 0.9, iceChance: 0.22, wear: 1 / 110, color: 0x9fd8ee, sale: [4, 7],
    desc: 'Customers buy frozen treats. Shoots milk and ice cream (chill + slow) and sometimes ice cubes that scatter on the floor and freeze burglars.' },
};
ITEMS.gum = { id: 'gum', kind: 'tower', name: 'Bubblegum Machine', cost: 120, range: 3.3, dmg: 4.5, rate: 0.55, burst: 5, wear: 1 / 85, color: 0xff7aa2, sale: [3, 5],
  desc: 'Customers buy gumballs. At night it fires 5 gumballs in a row that scatter and bounce across the floor on impact.' };
ITEMS.cola = { id: 'cola', kind: 'tower', name: 'Cola Dispenser', cost: 150, range: 2.8, dmg: 3, rate: 1.8, splash: 0.65, push: 2.6, soak: 4, soakTime: 2.4, wear: 1 / 130, color: 0xd6262b, sale: [3, 5],
  desc: 'Customers fill a cup. At night it sprays fizzy cola that shoves burglars back and keeps soaking them for damage.' };
ITEMS.atm = { id: 'atm', kind: 'tower', name: 'ATM', cost: 260, range: 3.0, dmg: 7, rate: 0.75, swirlR: 1.35, swirlTime: 2.2, swirlDps: 6, wear: 1 / 100, color: 0x2a5db0, sale: [6, 10],
  desc: 'Customers withdraw cash (fees included). At night it shoots receipts that swirl around every burglar nearby, dragging and hurting them.' };
// SKILL ITEMS: one-off tricks (not sellables). The mop is a floor trap; the other two are used at night and go off right where you drop them.
ITEMS.shakecola = { id: 'shakecola', kind: 'skill', name: 'Shaken Cola', cost: 45, fuse: 1.1, radius: 1.9, dmg: 8, push: 8, soak: 3, soakTime: 2.2, color: 0xd6262b,
  desc: 'Night skill. Drop it and it bursts in a huge fizzy splash that blasts every burglar around it away.' };
ITEMS.cigs = { id: 'cigs', kind: 'skill', name: 'Cigarette Pack', cost: 70, count: 20, range: 5.2, spread: 3.4, interval: 0.07, radius: 0.8, dmg: 7, burn: 2.5, burnTime: 1.5, color: 0xd62828,
  desc: 'Night skill. Drop it and it lobs 20 lit cigarettes at the burglars. Each one pops in a small blast when it hits the floor.' };
export const SELLABLES = ['shelf', 'cans', 'gum', 'sauce', 'soda', 'cola', 'hotdog', 'micro', 'atm', 'fridge'];   // shelves + turrets: the things customers buy from
export const SKILLS = ['mop', 'shakecola', 'cigs'];
export const BUILD_ORDER = [...SELLABLES, ...SKILLS];
// Only shelves and the vending machine are available on day one. The rest are bought in the Paycheck Shop.
export const BASE_UNLOCKS = ['shelf', 'cans'];
// Unlocking is paid with the run's own cash (store profit), from the build menu. Each run starts with only the base items.
export const UNLOCKS = { shakecola: 90, cigs: 130, mop: 30, sauce: 60, gum: 70, soda: 80, hotdog: 100, cola: 110, micro: 130, atm: 145, fridge: 160 };
export const MAX_ROOM = 4;
export const RENO_COST = [180, 380, 650, 1000];   // cash price of the next room level (RENOVATE tab)
export const MAX_LEVEL = 3;

// ---------- Enemies ----------
export const ENEMIES = {
  // abil: weights for the random night tricks (bomb = lob a bomb at a turret/shelf, dash = charge in a random direction); cd = seconds between tricks
  sneak:  { name: 'Sneak',   hp: 24,  push: 10, speed: 1.5,  steal: 1, bounty: 4,  armor: 0, cost: 1, abil: { bomb: 3, dash: 1 }, cd: 7 },
  runner: { name: 'Runner',  hp: 14,  push: 8,  speed: 2.5,  steal: 1, bounty: 4,  armor: 0, cost: 1, abil: { bomb: 1, dash: 4 }, cd: 5 },
  vest:   { name: 'Vest',    hp: 45,  push: 16, speed: 1.25,  steal: 1, bounty: 7,  armor: 3, cost: 2, abil: { bomb: 2, dash: 2 }, cd: 7 },
  bruiser:{ name: 'Bruiser', hp: 95,  push: 32, speed: 1.0, steal: 2, bounty: 12, armor: 1, cost: 3, abil: { bomb: 1, dash: 3 }, cd: 6, dashMul: 1.6 },
  boss:   { name: 'Mastermind', hp: 520, push: 70, speed: 0.95, steal: 5, bounty: 80, armor: 2, cost: 0, abil: { bomb: 3, dash: 2 }, cd: 3.5, dashMul: 1.6 },
};

// ---------- Restock upgrades (random per night) ----------
const hasTower = (g, t) => g.towers.some(x => x.type === t);
export const UPGRADES = [
  { id: 'cansdmg', icon: '🥫', name: 'Extended Shelf Life', desc: 'Vending Machine cans hit 30% harder.', apply: g => g.mods.dmg.cans *= 1.3, avail: g => hasTower(g, 'cans') },
  { id: 'cansrate', icon: '⚡', name: 'Stock Boy Speedrun', desc: 'Vending Machines fire 25% faster.', apply: g => g.mods.rate.cans *= 1.25, avail: g => hasTower(g, 'cans') },
  { id: 'burn', icon: '🔥', name: 'Ghost Pepper Batch', desc: 'Burn damage +60% (Hot Sauce).', apply: g => g.mods.burn *= 1.6, avail: g => hasTower(g, 'sauce') },
  { id: 'sauceRate', icon: '🌶️', name: 'Squeeze Bottles', desc: 'Hot Sauce fires 30% faster.', apply: g => g.mods.rate.sauce *= 1.3, avail: g => hasTower(g, 'sauce') },
  { id: 'shaken', icon: '🫧', name: 'Shaken, Not Stirred', desc: 'Soda splash +35% radius and +damage.', apply: g => { g.mods.splash *= 1.35; g.mods.dmg.soda *= 1.25; }, avail: g => hasTower(g, 'soda') },
  { id: 'brainfreeze', icon: '🧊', name: 'Brain Freeze', desc: 'Soda slows much harder.', apply: g => g.mods.slow = Math.min(0.85, g.mods.slow + 0.2), avail: g => hasTower(g, 'soda') },
  { id: 'defrost', icon: '⏱️', name: 'Turbo Defrost', desc: 'Microwaves pulse 35% faster.', apply: g => g.mods.rate.micro *= 1.35, avail: g => hasTower(g, 'micro') },
  { id: 'fork', icon: '🍴', name: 'Metal Fork Inside', desc: 'Microwave damage +40%.', apply: g => g.mods.dmg.micro *= 1.4, avail: g => hasTower(g, 'micro') },
  { id: 'bounce', icon: '🌭', name: 'Extra Long Hot Dogs', desc: 'Hot dogs bounce 2 more times.', apply: g => g.mods.bounce += 2, avail: g => hasTower(g, 'hotdog') },
  { id: 'mustard', icon: '🟡', name: 'Spicy Mustard', desc: 'Hot Dog Launcher damage +35%.', apply: g => g.mods.dmg.hotdog *= 1.35, avail: g => hasTower(g, 'hotdog') },
  { id: 'cold', icon: '❄️', name: 'Deep Freeze', desc: 'Fridges shoot ice cubes +15% more often.', apply: g => g.mods.ice += 0.15, avail: g => hasTower(g, 'fridge') },
  { id: 'dairy', icon: '🥛', name: 'Fresh Dairy', desc: 'Fridge damage +35%.', apply: g => g.mods.dmg.fridge *= 1.35, avail: g => hasTower(g, 'fridge') },
  { id: 'gumpack', icon: '🍬', name: 'Family Size Pack', desc: 'Bubblegum Machines fire 2 more gumballs per burst.', apply: g => g.mods.gumExtra += 2, avail: g => hasTower(g, 'gum') },
  { id: 'gumdmg', icon: '🍭', name: 'Sugar Rush', desc: 'Bubblegum damage +30%.', apply: g => g.mods.dmg.gum *= 1.3, avail: g => hasTower(g, 'gum') },
  { id: 'colafizz', icon: '🍾', name: 'Extra Carbonation', desc: 'Cola shoves 50% harder and soaks 40% more.', apply: g => { g.mods.push *= 1.5; g.mods.soak *= 1.4; }, avail: g => hasTower(g, 'cola') },
  { id: 'colarate', icon: '⛲', name: 'Fountain Pressure', desc: 'Cola Dispensers fire 30% faster.', apply: g => g.mods.rate.cola *= 1.3, avail: g => hasTower(g, 'cola') },
  { id: 'paperjam', icon: '🌀', name: 'Paper Jam', desc: 'ATM receipt swirls last 50% longer and hit 30% harder.', apply: g => { g.mods.swirlTime *= 1.5; g.mods.swirlDmg *= 1.3; }, avail: g => hasTower(g, 'atm') },
  { id: 'atmrate', icon: '💳', name: 'Overdraft Fees', desc: 'ATMs print 30% faster.', apply: g => g.mods.rate.atm *= 1.3, avail: g => hasTower(g, 'atm') },
  { id: 'maint', icon: '🔧', name: 'Maintenance Contract', desc: 'Turrets wear out 40% slower.', apply: g => g.mods.wear *= 0.6, avail: g => g.towers.some(t => t.kind === 'tower') },
  { id: 'casing', icon: '🛡️', name: 'Reinforced Casing', desc: 'Turrets +50% HP vs bombs and dashes (heals them).', apply: g => { g.mods.towerHp *= 1.5; g.towers.forEach(t => { if (t.kind === 'tower') { t.maxhp *= 1.5; t.hp = t.maxhp; } }); }, avail: g => g.towers.some(t => t.kind === 'tower') },
  { id: 'mirror', icon: '🪞', name: 'Convex Mirror', desc: 'All tower range +12%.', apply: g => g.mods.range *= 1.12 },
  { id: 'coffee', icon: '☕', name: 'Bottomless Coffee', desc: 'All towers fire 10% faster.', apply: g => g.mods.rateAll *= 1.1 },
  { id: 'bulk', icon: '📦', name: 'Bulk Order', desc: 'Everything costs 12% less (restocking too).', apply: g => g.mods.cost *= 0.88 },
  { id: 'cash', icon: '💵', name: 'Employee Discount', desc: '+$45 right now.', apply: g => g.cash += 45 },
  { id: 'tips', icon: '🫙', name: 'Tip Jar', desc: 'Burglar bounties +25%.', apply: g => g.mods.cash *= 1.25 },
  { id: 'bestseller', icon: '📈', name: 'Bestseller', desc: 'Customers spend 35% more on every purchase.', apply: g => g.mods.shelfPay *= 1.35 },
  { id: 'rush', icon: '🛒', name: 'Rush Hour', desc: '30% more customers each morning.', apply: g => g.mods.crowd *= 1.3 },
  { id: 'bolts', icon: '🔩', name: 'Bolted Down', desc: 'All shelves +60% HP (heals them).', apply: g => { g.mods.shelfHp *= 1.6; g.shelves.forEach(s => { s.maxhp *= 1.6; s.hp = s.maxhp; }); } },
  { id: 'till', icon: '🧾', name: 'Till Insurance', desc: '+3 Till.', apply: g => { g.lives += 3; g.maxLives += 3; } },
  { id: 'sign', icon: '⚠️', name: 'Wet Floor Sign', desc: 'Mops last +8 slips and stun longer.', apply: g => { g.mods.mopUses += 8; g.mods.mopStun += 0.4; g.traps.forEach(t => t.uses += 8); } },
  { id: 'lucky', icon: '🎟️', name: 'Lucky Scratcher', desc: '+12% chance to crit (x2) with all towers.', apply: g => g.mods.crit += 0.12 },
  { id: 'overtime', icon: '⏫', name: 'Overtime', desc: 'Free level-up on a random tower.', apply: g => { const c = g.towers.filter(t => t.kind === 'tower' && t.level < MAX_LEVEL); const t = c[Math.floor(g.rng() * c.length)]; if (t) { t.level++; g.emit('upgrade', { tower: t }); } }, avail: g => g.towers.some(t => t.kind === 'tower' && t.level < MAX_LEVEL) },
];

// ---------- Permanent "paycheck" upgrades ----------
export const META = [
  { id: 'cash', icon: '💵', name: 'Petty Cash Advance', desc: '+$15 starting cash / level', max: 5, cost: l => 20 + l * 20 },
  { id: 'lives', icon: '🧾', name: 'Till Insurance', desc: '+2 Till / level', max: 3, cost: l => 40 + l * 40 },
  { id: 'dmg', icon: '💪', name: 'Gym Membership', desc: '+6% tower damage / level', max: 5, cost: l => 30 + l * 25 },
  { id: 'disc', icon: '🏷️', name: 'Employee Discount Card', desc: '-4% build costs / level', max: 4, cost: l => 35 + l * 30 },
  { id: 'choice', icon: '📦', name: 'Supplier Connections', desc: '+1 restock card to choose from', max: 2, cost: l => 80 + l * 90 },
  { id: 'reroll', icon: '🔄', name: 'Return Policy', desc: '+1 restock reroll / level', max: 3, cost: l => 40 + l * 40 },
];
// Room expansion: every level makes the (square) store 2 tiles wider and taller. Applies to the next new store.
export const ROOM_UPGRADE = { id: 'room', icon: '📐', name: 'Bigger Starting Store', desc: 'New stores start 2 tiles wider and taller / level (you can also renovate in the build menu)', max: MAX_ROOM, cost: l => 120 + l * 140 };
// Every machine except the starter ones is a one-time purchase.
export const UNLOCK_ICONS = { shakecola: '🍾', cigs: '🚬', mop: '🧹', sauce: '🌶️', gum: '🍬', soda: '🥤', cola: '🍹', hotdog: '🌭', micro: '🍲', atm: '🏧', fridge: '🧊' };
export const UNLOCK_META = Object.keys(UNLOCKS).map(id => ({
  id: 'u_' + id, item: id, icon: UNLOCK_ICONS[id], name: ITEMS[id].name, desc: 'Unlocks this in the build menu.', max: 1, cost: () => UNLOCKS[id],
}));

function mulberry32(a) {
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.get = () => a; f.set = v => { a = v; };   // the generator state can be saved and restored
  return f;
}

const idx = (x, y) => y * COLS + x;
const NB = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const hm = t => { const H = Math.floor(t) % 24, M = Math.floor((t % 1) * 6) * 10; return `${(H + 11) % 12 + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`; };

export class Game {
  constructor(opts = {}) {
    const meta = opts.meta || {};
    this.meta = meta;
    this.room = Math.min(MAX_ROOM, meta.room || 0);
    setRoom(this.room);
    this.seed = opts.seed ?? ((Math.random() * 4294967296) >>> 0);
    this.rng = mulberry32(this.seed);
    this.on = null;
    this.nextId = 1;
    this.time = 0;
    // prep (before opening) -> morning (customers) -> evening (closed, get ready) -> wave (night) -> restock -> prep ...
    this.phase = 'prep';
    this.wave = 0;                  // nights completed
    this.cash = START_CASH + 15 * (meta.cash || 0);
    this.maxLives = 15 + 2 * (meta.lives || 0);
    this.lives = this.maxLives;
    this.kills = 0; this.served = 0; this.sales = 0; this.daySales = 0; this.dayServed = 0; this.paidOut = 0;
    this.rerolls = meta.reroll || 0;
    this.unlocked = new Set(BASE_UNLOCKS); this.nightIn = 0;
    this.mods = {
      dmg: { cans: 1, sauce: 1, soda: 1, micro: 1, hotdog: 1, fridge: 1, gum: 1, cola: 1, atm: 1 }, rate: { cans: 1, sauce: 1, soda: 1, micro: 1, hotdog: 1, fridge: 1, gum: 1, cola: 1, atm: 1 },
      gumExtra: 0, push: 1, soak: 1, swirlTime: 1, swirlDmg: 1,
      bounce: 0, ice: 0, rateAll: 1, range: 1, cost: 1 - 0.04 * (meta.disc || 0), cash: 1.3, burn: 1, splash: 1, slow: 0, crit: 0,
      mopUses: 0, mopStun: 0, globalDmg: 1 + 0.06 * (meta.dmg || 0), shelfPay: 1, crowd: 1, shelfHp: 1, wear: 1, towerHp: 1,
    };
    // blocked: 0 free, 1 permanent wall/prop, 2 tower, 3 shelf (breakable by burglars)
    this.blocked = new Uint8Array(COLS * ROWS);
    this.towers = []; this.traps = []; this.enemies = []; this.projectiles = []; this.customers = []; this.walkers = [];
    this.fires = []; this.bombs = []; this.ice = []; this.swirls = []; this.skills = [];   // sauce puddles, enemy bombs waiting to blow, scattered ice cubes, ATM receipt whirlwinds
    this.shelves = []; this.obstacles = [];
    this.spawnQueue = []; this.waveTime = 0; this.waveTotal = 0; this.subWave = 1; this.subWaves = 1; this.gapT = 0;
    this.dayQueue = []; this.dayTime = 0; this.walkT = 0.5; this.dayWalk = 0;
    this.choices = [];
    this.pathVersion = 0;
    this.daySnap = null;            // the store as it was when the day was opened (a lost night rolls back to it)
    this.spawns = [];
    this.genRoom();
    this.dist = this.flow();
  }

  emit(type, data) { if (this.on) this.on(type, data); }
  get activeSpawns() { return this.spawns.filter(s => this.wave + 1 >= s.from); }
  rint(a, b) { return a + Math.floor(this.rng() * (b - a + 1)); }

  // ---------- random room ----------
  // Long shelf rows run top-to-bottom with a gap in each, so everyone snakes through aisles.
  genRoom() {
    // counter and doors sit on OPPOSITE walls (top/bottom or left/right)
    const OPP = { top: 'bottom', left: 'right', right: 'left' };
    this.counterSide = RANDOM_SIDES ? ['top', 'left', 'right'][this.rint(0, 2)] : 'right';
    this.doorSide = OPP[this.counterSide];
    const len = side => side === 'top' || side === 'bottom' ? COLS : ROWS;
    const cell = (side, p) => side === 'left' ? { x: 0, y: p } : side === 'right' ? { x: COLS - 1, y: p } : side === 'bottom' ? { x: p, y: ROWS - 1 } : { x: p, y: 0 };
    const OUT = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

    // two doors on the door wall; far enough apart for the room size (kept small so this can never loop forever)
    const dl = len(this.doorSide), sep = dl >= 11 ? 4 : 3;
    const d1 = this.rint(2, dl - 3);
    let d2 = d1;
    for (let tries = 0; Math.abs(d2 - d1) < sep && tries < 50; tries++) d2 = this.rint(1, dl - 2);
    if (Math.abs(d2 - d1) < sep) d2 = d1 < dl / 2 ? dl - 2 : 1;
    const [ox, oy] = OUT[this.doorSide];
    this.spawns = [d1, d2].map((p, i) => ({ ...cell(this.doorSide, p), side: this.doorSide, ox, oy, from: i ? 5 : 1 }));
    // the counter: 3 till cells along its wall
    const cl = len(this.counterSide);
    this.counterPos = RANDOM_SIDES ? this.rint(2, cl - 3) : Math.round((cl - 1) / 2);
    this.tills = [-1, 0, 1].map(k => cell(this.counterSide, this.counterPos + k));
    // the store starts EMPTY: no shelves, no machines. Everything is built by the player.
  }
  // cells on the counter / door walls are never buildable
  reserved(x, y) {
    for (const s of [this.counterSide, this.doorSide]) {
      if ((s === 'left' && x === 0) || (s === 'right' && x === COLS - 1) || (s === 'top' && y === 0) || (s === 'bottom' && y === ROWS - 1)) return true;
    }
    return false;
  }
  isTill(x, y) { return this.tills.some(t => t.x === x && t.y === y); }

  // ---------- renovation: grow the store from the build menu (before opening, cash only) ----------
  renovateCost() { return this.room >= MAX_ROOM ? Infinity : Math.round(RENO_COST[this.room] * this.mods.cost); }
  canRenovate() {
    if (this.room >= MAX_ROOM) return { ok: false, reason: 'Fully renovated' };
    if (this.phase !== 'prep') return { ok: false, reason: 'Renovate before opening the store' };
    if (this.renovateCost() > this.cash) return { ok: false, reason: 'Not enough cash' };
    return { ok: true };
  }
  cellOn(side, p) { return side === 'left' ? { x: 0, y: p } : side === 'right' ? { x: COLS - 1, y: p } : side === 'bottom' ? { x: p, y: ROWS - 1 } : { x: p, y: 0 }; }
  // after a renovation the room is bigger, so the counter and the doors slide back to the middle of their walls
  // (the first door dead centre, the second one a few cells beside it). Wall cells are never built on, so nothing is in the way.
  recenter() {
    const horiz = side => side === 'top' || side === 'bottom';
    const cl = horiz(this.counterSide) ? COLS : ROWS, dl = horiz(this.doorSide) ? COLS : ROWS;
    this.counterPos = Math.round((cl - 1) / 2);
    this.tills = [-1, 0, 1].map(k => this.cellOn(this.counterSide, this.counterPos + k));
    const sep = dl >= 11 ? 4 : 3, mid = Math.round((dl - 1) / 2);
    const along = o => horiz(o.side) ? o.x : o.y;
    const dir = this.spawns.length > 1 && along(this.spawns[1]) < along(this.spawns[0]) ? -1 : 1;   // keep the second door on the same side as before
    this.spawns.forEach((o, i) => {
      let p = mid + (i ? dir * sep : 0);
      if (p < 1 || p > dl - 2) p = mid - dir * sep;
      Object.assign(o, this.cellOn(o.side, Math.max(1, Math.min(dl - 2, p))));
    });
  }
  // adds 2 columns on the right and 2 rows at the bottom; everything already built stays where it is
  renovate() {
    if (!this.canRenovate().ok) return false;
    this.cash -= this.renovateCost(); this.room++;
    const oc = COLS, orw = ROWS;
    setRoom(this.room);
    const nb = new Uint8Array(COLS * ROWS);
    for (let y = 0; y < orw; y++) for (let x = 0; x < oc; x++) nb[y * COLS + x] = this.blocked[y * oc + x];
    this.blocked = nb;
    this.recenter();
    this.refreshPaths();
    this.emit('renovate', { level: this.room });
    return true;
  }

  // ---------- unlocks ----------
  isUnlocked(type) { return this.unlocked.has(type); }
  unlockCost(type) { return UNLOCKS[type] ?? 0; }
  unlock(type) {
    if (this.isUnlocked(type) || UNLOCKS[type] === undefined) return false;
    const c = this.unlockCost(type); if (c > this.cash) return false;
    this.cash -= c; this.unlocked.add(type);
    this.emit('unlock', { type }); return true;
  }

  // Machines face an open side: if the neighbour in front is a shelf / machine / wall, turn to a free one.
  // turn a machine a quarter turn (clockwise on screen); it stays that way until turned again
  rotate(t) {
    if (!t || t.kind !== 'tower' || !this.towers.includes(t)) return false;
    const f = (t.facing || 0) + Math.PI / 2;
    t.facing = Math.atan2(Math.sin(f), Math.cos(f)); t.angle = t.facing; t.manual = true;
    this.emit('facing', { tower: t }); return true;
  }
  updateFacing() {
    const dirs = [0, -Math.PI / 2, Math.PI / 2, Math.PI];   // angle convention: atan2(dx, dy), 0 = facing the front (+y)
    for (const t of this.towers) {
      if (t.kind !== 'tower') continue;
      const open = a => {
        const x = t.x + Math.round(Math.sin(a)), y = t.y + Math.round(Math.cos(a));
        return x >= 0 && y >= 0 && x < COLS && y < ROWS && this.blocked[idx(x, y)] === 0;
      };
      const was = t.facing;
      if (t.facing === undefined || (!t.manual && !open(t.facing))) {   // a machine the player turned by hand stays as turned
        const a = dirs.find(open);
        if (a !== undefined) t.facing = a; else if (t.facing === undefined) t.facing = 0;
      }
      if (t.facing !== was) { t.angle = t.facing; this.emit('facing', { tower: t }); }
    }
  }

  // weighted flow field to the counter cells. walls/towers are solid, shelves cost SHELF_COST.
  flow(extra = -1, noise = null) {   // noise: per-cell extra step cost (0..5) -> a different, equally valid way to the register
    const N = COLS * ROWS, B = this.blocked;
    const d = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    for (const t of this.tills) { const i = idx(t.x, t.y); if (!B[i] && i !== extra) d[i] = 0; }
    for (;;) {
      let i = -1, bd = 1e9;
      for (let k = 0; k < N; k++) if (!done[k] && d[k] >= 0 && d[k] < bd) { bd = d[k]; i = k; }
      if (i < 0) break;
      done[i] = 1;
      const cx = i % COLS, cy = (i / COLS) | 0;
      for (const [dx, dy] of NB) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = idx(nx, ny);
        if (done[j] || j === extra || B[j] === 1 || B[j] === 2) continue;
        const nd = bd + (noise ? (B[j] === 3 ? SHELF_COST * 4 : 4 + noise[j]) : (B[j] === 3 ? SHELF_COST : 1));
        if (d[j] < 0 || nd < d[j]) d[j] = nd;
      }
    }
    return d;
  }

  // plain breadth-first walk over free floor (customers never break anything). Returns the cells to
  // step through (excluding the start), [] if already at a goal, or null when unreachable.
  bfs(sx, sy, goal) {
    const B = this.blocked, prev = new Int16Array(COLS * ROWS).fill(-2);
    const s = idx(sx, sy); prev[s] = -1;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const i = q[h], cx = i % COLS, cy = (i / COLS) | 0;
      if (goal(cx, cy)) {
        const out = []; for (let k = i; k !== s; k = prev[k]) out.push([k % COLS, (k / COLS) | 0]);
        return out.reverse();
      }
      for (const [dx, dy] of NB) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = idx(nx, ny);
        if (prev[j] !== -2 || B[j] !== 0) continue;
        prev[j] = i; q.push(j);
      }
    }
    return null;
  }

  unitCost() { return Math.max(1, Math.round(UNIT_COST * this.mods.cost)); }
  costOf(type) { return Math.max(1, Math.round(ITEMS[type].cost * this.mods.cost)); }
  upgradeCost(t) { return t.level >= MAX_LEVEL ? Infinity : Math.round(ITEMS[t.type].cost * (t.level === 1 ? 0.8 : 1.2) * this.mods.cost); }
  sellValue(t) { if (t.kind === 'trap') return Math.floor(this.costOf(t.type) * 0.5 * Math.min(1, t.uses / ITEMS[t.type].uses)); return t.kind === 'shelf' ? Math.floor((t.cost || 0) * 0.5) : Math.floor(t.invested * (t.broken ? 0.3 : 0.7)); }
  towerAt(x, y) { return this.towers.find(t => t.x === x && t.y === y) || null; }
  trapAt(x, y) { return this.traps.find(t => t.x === x && t.y === y) || null; }
  shelfAt(x, y) { return this.shelves.find(s => s.x === x && s.y === y) || null; }
  stat(t, key) {
    const def = ITEMS[t.type], L = t.level - 1, m = this.mods;
    switch (key) {
      case 'dmg': return def.dmg * (1 + 0.35 * L) * (m.dmg[t.type] || 1) * m.globalDmg;
      case 'range': return def.range * (1 + 0.05 * L) * m.range;
      case 'rate': return def.rate * (m.rate[t.type] || 1) * m.rateAll;
    }
  }

  canPlace(type, x, y) {
    const def = ITEMS[type];
    if (!this.isUnlocked(type)) return { ok: false, reason: 'Locked: buy it in the shop' };
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || this.reserved(x, y)) return { ok: false, reason: 'Not buildable here' };
    if (this.spawns.some(s => s.x === x && s.y === y)) return { ok: false, reason: 'Door — keep clear' };
    if (this.blocked[idx(x, y)]) return { ok: false, reason: 'Occupied' };
    if (def.kind === 'skill') {
      if (this.phase !== 'wave') return { ok: false, reason: 'Skill items work at night' };
      if (this.costOf(type) > this.cash) return { ok: false, reason: 'Not enough cash' };
      return { ok: true };
    }
    if (this.trapAt(x, y)) return { ok: false, reason: 'Mop is there' };
    if (this.costOf(type) > this.cash) return { ok: false, reason: 'Not enough cash' };
    if (def.kind === 'trap') return { ok: true };
    for (const e of this.enemies) {
      if (Math.hypot(e.x - x, e.y - y) < 0.75 || (e.tx === x && e.ty === y)) return { ok: false, reason: 'Burglar in the way' };
    }
    for (const c of this.customers) {
      if (Math.hypot(c.x - x, c.y - y) < 0.75 || (c.tx === x && c.ty === y)) return { ok: false, reason: 'Customer in the way' };
    }
    // customers must always be able to walk from every door to the counter without breaking anything
    const d = this.flow(idx(x, y));
    if (this.spawns.some(s => d[idx(s.x, s.y)] < 0 || d[idx(s.x, s.y)] >= SHELF_COST)) return { ok: false, reason: 'Keep an aisle open for customers' };
    for (const e of this.enemies) {
      const cx = Math.min(COLS - 1, Math.max(0, Math.round(e.x))), cy = Math.min(ROWS - 1, Math.max(0, Math.round(e.y)));
      if (d[idx(cx, cy)] < 0) return { ok: false, reason: 'Would trap a burglar' };
    }
    return { ok: true };
  }

  place(type, x, y) {
    if (!this.canPlace(type, x, y).ok) return false;
    const def = ITEMS[type], cost = this.costOf(type);
    this.cash -= cost;
    if (def.kind === 'skill') {
      const sk = { id: this.nextId++, kind: 'skill', type, x, y, t: def.fuse || 0, max: def.fuse || 1, left: def.count || 0, gap: 0, kick: 0 };
      this.skills.push(sk); this.emit('skillPlace', { skill: sk }); return true;
    }
    if (def.kind === 'trap') {
      const t = { id: this.nextId++, type, kind: 'trap', x, y, uses: def.uses + this.mods.mopUses };
      this.traps.push(t); this.emit('place', { tower: t }); return true;
    }
    if (def.kind === 'shelf') {
      const hp = SHELF_HP * this.mods.shelfHp;
      const s = { id: this.nextId++, kind: 'shelf', x, y, v: this.rint(0, 2), units: MAX_STOCK, hp, maxhp: hp, hit: 0, placed: true, cost };
      this.shelves.push(s); this.blocked[idx(x, y)] = 3;
      this.refreshPaths(); this.emit('place', { tower: s }); return true;
    }
    const hp = TOWER_HP * this.mods.towerHp;
    const t = { id: this.nextId++, type, kind: def.kind, x, y, level: 1, cd: 0.3, invested: cost, angle: 0, hp, maxhp: hp, wear: 0, broken: null, warned: false, hit: 0 };
    this.towers.push(t); this.blocked[idx(x, y)] = 2;
    this.refreshPaths(); this.emit('place', { tower: t });
    return true;
  }

  upgrade(t) {
    const c = this.upgradeCost(t);
    if (t.kind !== 'tower' || c > this.cash || t.level >= MAX_LEVEL) return false;
    this.cash -= c; t.invested += c; t.level++;
    this.emit('upgrade', { tower: t }); return true;
  }

  sell(t) {
    this.cash += this.sellValue(t);
    if (t.kind === 'trap') { this.traps = this.traps.filter(x => x !== t); this.emit('trapGone', { trap: t }); return; }
    if (t.kind === 'shelf') {
      if (!t.placed) return;
      this.shelves = this.shelves.filter(x => x !== t); this.blocked[idx(t.x, t.y)] = 0;
    } else {
      this.towers = this.towers.filter(x => x !== t); this.blocked[idx(t.x, t.y)] = 0;
    }
    this.refreshPaths(); this.emit('sell', { tower: t });
  }

  // ---------- wear, damage, service ----------
  // Turrets wear out with every shot; past 55% wear each shot has a growing chance to break them.
  // Bombs and dashes also hurt them. A broken turret does nothing until you REPLACE it.
  wearTower(t, mul = 1) {
    t.wear = Math.min(1, t.wear + ITEMS[t.type].wear * this.mods.wear * mul);
    if (t.wear > 0.7 && !t.warned) { t.warned = true; this.emit('towerWarn', { tower: t }); }
    if (t.wear > 0.55 && this.rng() < (t.wear - 0.55) * 0.14) this.breakTower(t, 'worn');
  }
  hurtTower(t, dmg) {
    if (t.broken) return;
    t.hp -= dmg; t.hit = 0.25;
    this.emit('towerHit', { tower: t });
    if (t.hp <= 0) { t.hp = 0; this.breakTower(t, 'destroyed'); }
  }
  // Worn-out machines stay (replace them). Destroyed ones are gone for good: they vanish and free their tile.
  breakTower(t, why) {
    if (t.broken) return;
    t.broken = why;
    this.emit('towerBreak', { tower: t, why });
    if (why === 'destroyed') {
      this.towers = this.towers.filter(x => x !== t);
      this.blocked[idx(t.x, t.y)] = 0;
      this.refreshPaths();
      this.emit('sell', { tower: t });   // same event as selling: the view removes the model
    }
  }
  serviceCost(t) {
    const need = Math.max(t.wear, 1 - t.hp / t.maxhp);
    return Math.max(2, Math.round(ITEMS[t.type].cost * (0.12 + 0.38 * need) * this.mods.cost));
  }
  needsService(t) { return t.kind === 'tower' && !t.broken && (t.wear > 0.05 || t.hp < t.maxhp - 0.5); }
  service(t) {
    if (!this.needsService(t)) return false;
    const c = this.serviceCost(t); if (c > this.cash) return false;
    this.cash -= c; t.wear = 0; t.hp = t.maxhp; t.warned = false;
    this.emit('service', { tower: t }); return true;
  }
  replaceCost(t) { return Math.max(3, Math.round(ITEMS[t.type].cost * 0.6 * this.mods.cost)); }
  replace(t) {
    if (t.kind !== 'tower' || !t.broken) return false;
    const c = this.replaceCost(t); if (c > this.cash) return false;
    this.cash -= c; t.broken = null; t.wear = 0; t.hp = t.maxhp; t.warned = false; t.cd = 0.5;
    this.emit('replace', { tower: t }); return true;
  }

  // ---------- restocking ----------
  restock(sh) {
    const uc = this.unitCost(), n = Math.min(MAX_STOCK - sh.units, Math.floor(this.cash / uc));
    if (n <= 0) return false;
    this.cash -= n * uc; sh.units += n;
    this.emit('stock', { shelf: sh, shelves: [sh] }); return true;
  }
  restockCost() { return this.shelves.reduce((a, s) => a + (MAX_STOCK - s.units), 0) * this.unitCost(); }
  // all-or-nothing: it only works when you can afford to refill every shelf (use a single shelf for a partial refill)
  restockAll() {
    const uc = this.unitCost(), done = [];
    const need = this.restockCost();
    if (need <= 0 || this.cash < need) return false;
    for (const s of [...this.shelves].filter(s => s.units < MAX_STOCK).sort((a, b) => a.units - b.units)) {
      const n = Math.min(MAX_STOCK - s.units, Math.floor(this.cash / uc));
      if (n <= 0) break;
      this.cash -= n * uc; s.units += n; done.push(s);
    }
    if (done.length) this.emit('stock', { shelves: done });
    return done.length > 0;
  }

  breakShelf(s) {
    this.shelves = this.shelves.filter(x => x !== s);
    this.blocked[idx(s.x, s.y)] = 0;
    this.refreshPaths();
    this.emit('shelfBreak', { shelf: s });
  }

  refreshPaths() {
    this.dist = this.flow();
    const N = COLS * ROWS;   // each burglar sticks to one of several slightly different flow fields, so they spread over different aisles and tills
    if (!this.noise || this.noise[0].length !== N) this.noise = Array.from({ length: ROUTES }, () => Uint8Array.from({ length: N }, () => Math.floor(Math.random() * 6)));
    this.flows = this.noise.map(nz => this.flow(-1, nz));
    this.pathVersion++; this.updateFacing();
  }

  // ---------- clock (for the HUD) ----------
  clock() {
    switch (this.phase) {
      case 'prep': return { icon: '☀', text: hm(7.5) };
      case 'morning': return { icon: '☀', text: hm(8 + 3.8 * Math.min(1, this.dayTime / (DAY_LEN + 20))) };
      case 'evening': return { icon: '🌆', text: hm(18) };
      case 'wave': {
        const left = this.enemies.length + this.spawnQueue.length;
        const p = this.waveTotal ? 1 - left / this.waveTotal : 0;
        return { icon: '🌙', text: hm(22 + 7 * p) };
      }
      case 'won': return { icon: '🌅', text: hm(6) };
      default: return { icon: '🌙', text: hm(5.5) };
    }
  }
  get isNight() { return this.phase === 'wave' || this.phase === 'restock' || this.phase === 'lost'; }

  // ---------- Morning: customers ----------
  makeDay(n) {
    const count = Math.min(45, Math.max(1, Math.round((8 + n * 2.5) * this.mods.crowd)));
    const sp = this.activeSpawns, q = [], gap = DAY_LEN / count;
    let t = 0.5;
    for (let i = 0; i < count; i++) { q.push({ t, spawn: sp[Math.floor(this.rng() * sp.length)] }); t += gap * (0.6 + this.rng() * 0.8); }
    return q;
  }

  // you can't open an empty store: customers need something to buy (a stocked shelf or a working machine)
  canOpen() {
    if (this.phase !== 'prep') return { ok: false, reason: 'The store is already open' };
    if (this.shelves.some(s => s.units > 0) || this.towers.some(t => t.kind === 'tower' && !t.broken)) return { ok: true };
    return { ok: false, reason: this.shelves.length ? 'Restock a shelf before opening' : 'Build a shelf or a machine before opening' };
  }
  startDay() {
    if (!this.canOpen().ok) return false;
    this.daySnap = this.snapshot();
    this.phase = 'morning'; this.dayTime = 0; this.daySales = 0; this.dayServed = 0; this.dayWalk = 0;
    this.dayQueue = this.makeDay(this.wave + 1);
    this.emit('dayStart', { n: this.wave + 1, count: this.dayQueue.length });
    return true;
  }

  // customers choose between groups: the store's shelves count double, each kind of machine once
  pickStops() {
    const groups = new Map();
    const add = (k, e) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); };
    for (const s of this.shelves) if (s.units > 0) add('shelf', s);
    for (const t of this.towers) if (t.kind === 'tower' && !t.broken) add(t.type, t);
    const keys = [...groups.keys()], wt = k => (k === 'shelf' ? 2 : 1);
    if (!keys.length) return [];
    const want = 1 + Math.floor(this.rng() * 3), out = [];
    for (let k = 0; k < want * 4 && out.length < want; k++) {
      let r = this.rng() * keys.reduce((a, b) => a + wt(b), 0), key = keys[0];
      for (const kk of keys) { r -= wt(kk); if (r <= 0) { key = kk; break; } }
      const arr = groups.get(key), e = arr[Math.floor(this.rng() * arr.length)];
      if (!out.includes(e)) out.push(e);
    }
    return out;
  }

  spawnCustomer(s) {
    const c = {
      id: this.nextId++, kind: 'customer', x: s.x + s.ox * 0.9, y: s.y + s.oy * 0.9, tx: s.x, ty: s.y, state: 'enter', door: s,
      stops: this.pickStops(), si: 0, cart: 0, bags: [], path: [], next: '', timer: 0, slot: null, age: 0, paid: false,
      angle: Math.PI / 2, speed: 2.9 + this.rng() * 0.7, look: Math.floor(this.rng() * 100000),
    };
    this.customers.push(c);
    if (!c.stops.length) this.emit('empty', { x: s.x, y: s.y });
  }

  stationAlive(st) { return st.kind === 'shelf' ? this.shelves.includes(st) : this.towers.includes(st) && !st.broken; }

  counterSlot(c) {
    const used = new Set(this.customers.filter(o => o !== c && o.slot !== null).map(o => o.slot));
    let best = 0, bd = 1e9;
    for (let i = 0; i < this.tills.length; i++) { const d = Math.abs(i - 1) + (used.has(i) ? 100 : 0); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  // decide where a customer goes next (always called while standing on a cell)
  planCustomer(c) {
    const cx = Math.round(c.x), cy = Math.round(c.y);
    for (let guard = 0; guard < 12; guard++) {
      if (c.si < c.stops.length) {
        const st = c.stops[c.si];
        const path = this.stationAlive(st) ? this.bfs(cx, cy, (x, y) => Math.abs(x - st.x) + Math.abs(y - st.y) === 1) : null;
        if (!path) { c.si++; continue; }
        c.path = path; c.next = 'browse'; c.state = 'walk'; return;
      }
      if (c.cart > 0 && !c.paid) {
        c.slot = this.counterSlot(c);
        const till = this.tills[c.slot], path = this.bfs(cx, cy, (x, y) => x === till.x && y === till.y);
        if (path) { c.path = path; c.next = 'pay'; c.state = 'walk'; return; }
        c.cart = 0; c.slot = null;
      }
      const path = this.bfs(cx, cy, (x, y) => this.spawns.some(s => s.x === x && s.y === y));
      if (path) { c.path = path; c.next = 'exit'; c.state = 'walk'; c.slot = null; return; }
      c.dead = true; return;
    }
    c.dead = true;
  }

  arriveCustomer(c) {
    if (c.next === 'browse') {
      const st = c.stops[c.si];
      c.state = 'browse'; c.timer = 0.8 + this.rng() * 0.8; c.angle = Math.atan2(st.x - c.x, st.y - c.y);
    } else if (c.next === 'pay') { c.state = 'pay'; c.timer = 0.7 + this.rng() * 0.5; c.angle = Math.PI / 2; }
    else c.state = 'exit';
  }

  buy(c, st) {
    if (!this.stationAlive(st)) return;
    const type = st.kind === 'shelf' ? 'shelf' : st.type, def = ITEMS[type];
    if (st.kind === 'shelf') {
      if (st.units <= 0) { this.emit('soldout', { x: st.x, y: st.y }); return; }
      st.units--;
    }
    const price = Math.max(1, Math.round((def.sale[0] + this.rng() * (def.sale[1] - def.sale[0])) * this.mods.shelfPay));
    c.cart += price; c.bags.push(st.kind === 'shelf' ? CAN_COLORS[(st.id + c.bags.length) % CAN_COLORS.length] : ITEMS[type].color);
    this.emit('buy', { c, id: st.id, x: st.x, y: st.y, kind: type, price });
    if (st.kind === 'tower') this.wearTower(st, CUSTOMER_WEAR);   // customers wear machines out too: overuse can break them
  }

  stepMove(c, dt, tx, ty) {
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), mv = c.speed * dt;
    if (d <= mv) { c.x = tx; c.y = ty; return true; }
    c.x += dx / d * mv; c.y += dy / d * mv; c.angle = Math.atan2(dx, dy); return false;
  }

  moveCustomer(c, dt) {
    c.age += dt;
    if (c.age > 90) { c.dead = true; return; }   // never get stuck forever
    switch (c.state) {
      case 'enter': if (this.stepMove(c, dt, c.door.x, c.door.y)) c.state = 'plan'; break;
      case 'plan': this.planCustomer(c); break;
      case 'walk': {
        if (!c.path.length) { this.arriveCustomer(c); break; }
        const [nx, ny] = c.path[0];
        if (c.x === c.tx && c.y === c.ty && this.blocked[idx(nx, ny)] !== 0) { c.state = 'plan'; break; }   // something got built in the way
        c.tx = nx; c.ty = ny;
        if (this.stepMove(c, dt, nx, ny)) c.path.shift();
        break;
      }
      case 'browse':
        c.timer -= dt;
        if (c.timer <= 0) { this.buy(c, c.stops[c.si]); c.si++; c.state = 'plan'; }
        break;
      case 'pay':
        c.timer -= dt;
        if (c.timer <= 0) {
          if (c.cart > 0) {
            this.cash += c.cart; this.sales += c.cart; this.daySales += c.cart; this.served++; this.dayServed++;
            this.emit('pay', { c, amount: c.cart, x: this.tills[c.slot].x, y: this.tills[c.slot].y });
          }
          c.cart = 0; c.paid = true; c.slot = null; c.state = 'plan';
        }
        break;
      case 'exit': if (this.stepMove(c, dt, c.door.x + c.door.ox * 1.6, c.door.y + c.door.oy * 1.6)) c.dead = true; break;
    }
  }

  // ---------- Night: burglars ----------
  // nights get one more wave every 5 days: nights 1-5 have 1 wave, 6-10 have 2, 11-15 have 3 ...
  nightWaves(n) { return 1 + Math.floor((n - 1) / 5); }
  makeWave(n, scale = 1, boss = true) {
    const pool = ['sneak']; if (n >= 3) pool.push('runner'); if (n >= 5) pool.push('vest'); if (n >= 7) pool.push('bruiser');
    // endless: grows fast early, then settles into steady growth (enemy HP keeps scaling per night)
    let budget = (3 + n * 2.2 + Math.min(n, 12) ** 2 * 0.35 + Math.max(0, n - 12) * 4) * scale;
    const list = [];
    while (budget > 0) {
      const t = pool[Math.floor(this.rng() * pool.length)];
      list.push(t); budget -= ENEMIES[t].cost;
    }
    if (boss && n % 10 === 0) list.splice(Math.floor(list.length * 0.55), 0, 'boss');   // a Mastermind every 10th night
    const gap = Math.max(0.6, 1.25 - n * 0.05);
    let t = 0; const q = [];
    const sp = this.activeSpawns;
    list.forEach((type, i) => {
      q.push({ type, t, spawn: sp[Math.floor(this.rng() * sp.length)] });
      t += gap * (0.7 + this.rng() * 0.6);
    });
    return q;
  }

  startWave() {
    if (this.phase !== 'evening') return false;
    this.phase = 'wave'; this.waveTime = 0;
    const n = this.wave + 1;
    this.subWaves = this.nightWaves(n); this.subWave = 1; this.gapT = 0;
    this.spawnQueue = this.makeWave(n, this.subScale(1), this.subWaves === 1);
    this.waveTotal = this.spawnQueue.length;
    this.emit('waveStart', { n, count: this.spawnQueue.length, sub: 1, subs: this.subWaves });
    return true;
  }
  // with several waves in a night each one is smaller than a full night; the last one is the biggest (and brings the boss)
  subScale(k) { return this.subWaves === 1 ? 1 : 0.5 + 0.15 * (k - 1); }

  spawnEnemy(type, s) {
    const def = ENEMIES[type], n = this.wave + 1;
    const hpMul = type === 'boss' ? 1 + 0.18 * (n - 1) : 1 + 0.15 * (n - 1);
    const e = {
      id: this.nextId++, type, x: s.x + s.ox * 0.9, y: s.y + s.oy * 0.9, hp: def.hp * hpMul, maxhp: def.hp * hpMul,
      speed: def.speed * 0.88, push: def.push, pushT: 0, armor: def.armor, steal: def.steal, bounty: def.bounty,
      tx: s.x, ty: s.y, burn: 0, burnDps: 0, soak: 0, soakDps: 0, kvx: 0, kvy: 0, slow: 0, slowF: 0, stun: 0, slipped: new Set(), iced: new Set(), angle: 0,
      jitter: (this.rng() - 0.5) * 0.0, route: Math.floor(Math.random() * ROUTES),
      flee: 0, wind: 0, pending: null, dash: null, abCd: def.cd * (0.5 + this.rng() * 0.8) * (1.15 - 0.03 * n), dashMul: def.dashMul || 1,
    };
    this.enemies.push(e);
  }

  // ---------- Combat ----------
  damage(e, dmg, pierce = false) {
    if (e.dead) return;
    let crit = false;
    if (this.mods.crit > 0 && this.rng() < this.mods.crit) { dmg *= 2; crit = true; }
    if (!pierce) dmg = Math.max(1, dmg - e.armor);
    e.hp -= dmg; e.flash = 0.12;
    this.emit('hit', { x: e.x, y: e.y, crit });
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    if (e.dead) return;
    e.dead = true; this.kills++;
    const c = Math.round(e.bounty * this.mods.cash);
    this.cash += c;
    this.emit('kill', { enemy: e, cash: c });
  }

  progress(e) {
    const cx = Math.min(COLS - 1, Math.max(0, Math.round(e.x))), cy = Math.min(ROWS - 1, Math.max(0, Math.round(e.y)));
    const d = this.dist[idx(cx, cy)];
    return d < 0 ? 999 : d;
  }

  towerFire(t) {
    const range = this.stat(t, 'range'), dmg = this.stat(t, 'dmg');
    const inRange = [];
    for (const e of this.enemies) if (!e.dead && e.x > -0.5 && e.y > -0.5 && e.x < COLS - 0.5 && e.y < ROWS - 0.5 && Math.hypot(e.x - t.x, e.y - t.y) <= range) inRange.push(e);
    if (!inRange.length) { if (t.facing !== undefined) t.angle = t.facing; return false; }   // idle: face an open side
    if (t.type === 'micro') {
      for (const e of inRange) this.damage(e, dmg);
      this.emit('pulse', { tower: t, r: range });
      return true;
    }
    // prefer enemy closest to the register; sauce prefers un-burnt, soda prefers un-slowed
    let best = null, bs = 1e9;
    for (const e of inRange) {
      let s = this.progress(e) * 10 + e.hp * 0.001;
      if (t.type === 'sauce' && e.burn > 0.5) s += 40;
      if (t.type === 'soda' && e.slow > 0.5) s += 40;
      if (t.type === 'cola' && e.soak > 0.5) s += 15;
      if (t.type === 'atm') s -= 12 * inRange.filter(o => o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= ITEMS.atm.swirlR).length;   // aim where the crowd is
      if (s < bs) { bs = s; best = e; }
    }
    t.angle = Math.atan2(best.x - t.x, best.y - t.y);
    const vend = t.type === 'cans';
    if (t.type === 'sauce') {   // lob: aim where the burglar WILL be, the glob can't turn in the air
      const sp = 5.5, fl = Math.hypot(best.x - t.x, best.y - t.y) / sp;
      let lx = best.x, ly = best.y;
      const mdx = best.tx - best.x, mdy = best.ty - best.y, md = Math.hypot(mdx, mdy);
      if (md > 0.01 && best.stun <= 0) { const mv = Math.min(md, best.speed * (best.slow > 0 ? 1 - best.slowF : 1) * fl); lx += mdx / md * mv; ly += mdy / md * mv; }
      const def = ITEMS.sauce;
      this.projectiles.push({ id: this.nextId++, kind: 'sauce', lob: true, arc: 1.7, x: t.x, y: t.y, h: 0.95, h0: 0.95, sx: t.x, sy: t.y,
        d0: Math.max(0.3, Math.hypot(lx - t.x, ly - t.y)), target: null, tx: lx, ty: ly, speed: sp, dmg, level: t.level, dx: 0, dy: 0,
        burnDps: def.burn * this.mods.burn * this.mods.globalDmg * (1 + 0.35 * (t.level - 1)) });
      this.emit('shoot', { tower: t });
      return true;
    }
    const f = t.facing || 0;
    const front = vend || ['hotdog', 'fridge', 'gum', 'cola', 'atm'].includes(t.type);   // these dispense from a chute on their front side
    const sx = t.x + (front ? Math.sin(f) * 0.32 : 0), sy = t.y + (front ? Math.cos(f) * 0.32 : 0);
    if (t.type === 'fridge') return this.fridgeFire(t, best, dmg, sx, sy);
    const speed = { cans: 10, gum: 8.5, cola: 11, atm: 8 }[t.type] || 9;
    const H0 = { cans: 0.32, gum: 0.4, cola: 0.5, atm: 0.62 }[t.type] ?? 0.8;   // height of the chute / nozzle / slot the shot comes out of
    const d0 = Math.hypot(best.x - sx, best.y - sy);
    const n = t.type === 'gum' ? ITEMS.gum.burst + (this.mods.gumExtra || 0) : 1;   // bubblegum: a burst of gumballs, one after another
    for (let i = 0; i < n; i++) {
      this.projectiles.push({ id: this.nextId++, kind: t.type, x: sx, y: sy, h: H0, h0: H0, sx, sy, d0: Math.max(0.3, d0), target: best,
        tx: best.x, ty: best.y, speed, dmg, level: t.level, dx: 0, dy: 0, delay: i * 0.11,
        color: vend ? CAN_COLORS[Math.floor(this.rng() * CAN_COLORS.length)] : t.type === 'gum' ? GUM_COLORS[Math.floor(this.rng() * GUM_COLORS.length)] : 0,
        bouncesLeft: t.type === 'hotdog' ? ITEMS.hotdog.bounces + (t.level - 1) + this.mods.bounce : 0, bounce: 0, hit: new Set() });
    }
    this.emit('shoot', { tower: t });
    return true;
  }

  // ---------- Fridge: milk, ice cream, and sometimes ice cubes ----------
  fridgeFire(t, best, dmg, sx, sy) {
    const chance = ITEMS.fridge.iceChance + this.mods.ice;
    if (this.rng() < chance) {   // lob a bag of ice cubes: lands, scatters on the floor, freezes burglars
      const sp = 5.5, fl = Math.hypot(best.x - sx, best.y - sy) / sp;
      let lx = best.x, ly = best.y;
      const mdx = best.tx - best.x, mdy = best.ty - best.y, md = Math.hypot(mdx, mdy);
      if (md > 0.01 && best.stun <= 0) { const mv = Math.min(md, best.speed * (best.slow > 0 ? 1 - best.slowF : 1) * fl); lx += mdx / md * mv; ly += mdy / md * mv; }
      this.projectiles.push({ id: this.nextId++, kind: 'ice', lob: true, arc: 1.5, x: sx, y: sy, h: 0.95, h0: 0.95, sx, sy,
        d0: Math.max(0.3, Math.hypot(lx - sx, ly - sy)), target: null, tx: lx, ty: ly, speed: sp, dmg, level: t.level, dx: 0, dy: 0 });
    } else {
      const kind = this.rng() < 0.5 ? 'milk' : 'icecream';
      this.projectiles.push({ id: this.nextId++, kind, x: sx, y: sy, h: 0.8, h0: 0.8, sx, sy, d0: Math.max(0.3, Math.hypot(best.x - sx, best.y - sy)),
        target: best, tx: best.x, ty: best.y, speed: 9, dmg, level: t.level, dx: 0, dy: 0 });
    }
    this.emit('shoot', { tower: t });
    return true;
  }

  chill(e, f, time) { e.slow = Math.max(e.slow, time); e.slowF = Math.max(e.slowF, Math.min(0.85, f)); }
  freeze(e, patch) {
    if (e.dead) return;
    if (patch) { if (e.iced.has(patch.id)) return; e.iced.add(patch.id); }
    e.stun = Math.max(e.stun, e.type === 'boss' ? 0.5 : 1.2);
    e.dash = null; e.wind = 0; e.pending = null;
    this.chill(e, 0.5, 2.2);
    this.emit('freeze', { enemy: e });
  }
  iceBurst(x, y, p) {
    const r = 1.0, cubes = [];
    for (let i = 0; i < 6; i++) { const a = this.rng() * Math.PI * 2, d = Math.sqrt(this.rng()) * r * 0.9; cubes.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, rot: this.rng() * 6.28 }); }
    const patch = { id: this.nextId++, x, y, r, t: ICE_TIME, max: ICE_TIME, cubes };
    this.ice.push(patch);
    for (const e of this.enemies) {
      if (e.dead || Math.hypot(e.x - x, e.y - y) > r) continue;
      this.damage(e, p.dmg * 0.6);
      this.freeze(e, patch);
    }
    this.emit('iceBurst', { x, y, r, cubes, patch });
  }
  creamSplat(x, y, p) {
    const r = 0.85;
    for (const e of this.enemies) {
      if (e.dead || Math.hypot(e.x - x, e.y - y) > r) continue;
      this.damage(e, p.dmg * 0.85);
      if (!e.dead) this.chill(e, 0.4, 2);
    }
    this.emit('splash', { x, y, r });
  }

  // ---------- Hot Dog Launcher: bounces from burglar to burglar ----------
  hotdogHit(p) {
    const e = p.target;
    if (e && !e.dead) { this.damage(e, p.dmg * Math.pow(0.85, p.bounce || 0)); p.hit.add(e.id); }
    if ((p.bouncesLeft || 0) <= 0) return;
    const bx = e ? e.x : p.tx, by = e ? e.y : p.ty;
    let best = null, bd = 1e9;
    for (const o of this.enemies) {
      if (o.dead || p.hit.has(o.id) || o.x < -0.5) continue;
      const d = Math.hypot(o.x - bx, o.y - by);
      if (d <= BOUNCE_RANGE && d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    this.projectiles.push({ id: this.nextId++, kind: 'hotdog', x: bx, y: by, h: p.h, h0: p.h, sx: bx, sy: by, d0: Math.max(0.3, bd), target: best,
      tx: best.x, ty: best.y, speed: 9, dmg: p.dmg, level: p.level, dx: 0, dy: 0, hit: p.hit, bouncesLeft: p.bouncesLeft - 1, bounce: (p.bounce || 0) + 1 });
    this.emit('bounce', { x: bx, y: by });
  }

  splash(x, y, p) {
    const def = ITEMS.soda, r = def.splash * this.mods.splash;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - x, e.y - y) <= r) {
        this.damage(e, p.dmg);
        e.slow = def.slowTime; e.slowF = Math.min(0.85, def.slow + this.mods.slow);
      }
    }
    this.emit('splash', { x, y, r });
  }

  // ---------- Cola Dispenser: shoves burglars back and keeps soaking them ----------
  drench(e, dps, time) {
    e.soakDps = e.soak > 0 ? Math.max(e.soakDps, dps) : dps;
    e.soak = Math.max(e.soak || 0, time);
  }
  // adds knock-back velocity (tiles/s); moveEnemy applies it and it fades out quickly
  shove(e, dx, dy, f, cap = COLA_PUSH_CAP) {
    e.kvx = (e.kvx || 0) + dx * f; e.kvy = (e.kvy || 0) + dy * f;
    const m = Math.hypot(e.kvx, e.kvy);
    if (m > cap) { e.kvx *= cap / m; e.kvy *= cap / m; }
  }
  // ---------- skill items (night) ----------
  stepSkill(sk, dt) {
    const def = ITEMS[sk.type];
    if (sk.kick > 0) sk.kick = Math.max(0, sk.kick - dt * 6);
    if (sk.type === 'shakecola') { sk.t -= dt; if (sk.t <= 0) { sk.done = true; this.colaBlast(sk, def); } return; }
    // cigarette pack: lobs its cigarettes one after another, then disappears
    sk.gap -= dt;
    if (sk.left > 0 && sk.gap <= 0) { sk.gap = def.interval; sk.left--; this.lobCig(sk, def); sk.kick = 1; }
    if (sk.left <= 0) { sk.t += dt; if (sk.t > 0.45) sk.done = true; }
  }
  colaBlast(sk, def) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - sk.x, dy = e.y - sk.y, d = Math.hypot(dx, dy);
      if (d > def.radius) continue;
      this.damage(e, def.dmg * this.mods.globalDmg);
      if (e.dead) continue;
      this.drench(e, def.soak * this.mods.globalDmg, def.soakTime);
      const a = this.rng() * Math.PI * 2, nx = d > 0.05 ? dx / d : Math.cos(a), ny = d > 0.05 ? dy / d : Math.sin(a);   // straight away from the bottle
      this.shove(e, nx, ny, def.push * (1 - 0.5 * d / def.radius) * (e.type === 'boss' ? 0.35 : 1), 9);
      e.dash = null; e.wind = 0; e.pending = null;
    }
    this.emit('colaBlast', { x: sk.x, y: sk.y, r: def.radius });
  }
  lobCig(sk, def) {
    const near = this.enemies.filter(e => !e.dead && e.x > -0.5 && e.y > -0.5 && e.x < COLS - 0.5 && e.y < ROWS - 0.5 && Math.hypot(e.x - sk.x, e.y - sk.y) <= def.range);
    let tx, ty;
    if (near.length) {
      const e = near[Math.floor(this.rng() * near.length)];
      tx = e.x + (e.tx - e.x) * 0.4 + (this.rng() - 0.5) * 1.1; ty = e.y + (e.ty - e.y) * 0.4 + (this.rng() - 0.5) * 1.1;   // a little ahead of where they're walking
    } else {
      const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * def.spread;
      tx = sk.x + Math.cos(a) * r; ty = sk.y + Math.sin(a) * r;
    }
    tx = Math.max(0, Math.min(COLS - 1, tx)); ty = Math.max(0, Math.min(ROWS - 1, ty));
    this.projectiles.push({ id: this.nextId++, kind: 'cig', lob: true, arc: 1.4 + this.rng() * 0.7, x: sk.x, y: sk.y, h: 0.6, h0: 0.6, sx: sk.x, sy: sk.y,
      d0: Math.max(0.5, Math.hypot(tx - sk.x, ty - sk.y)), target: null, tx, ty, speed: 5.5 + this.rng() * 1.5, dmg: def.dmg, level: 1, dx: 0, dy: 0 });
    this.emit('cigLaunch', { skill: sk });
  }
  cigBoom(p) {   // a lit cigarette only pops where it lands on the floor: small blast, sets burglars smouldering
    const def = ITEMS.cigs;
    for (const e of this.enemies) {
      if (e.dead || Math.hypot(e.x - p.tx, e.y - p.ty) > def.radius) continue;
      this.damage(e, def.dmg * this.mods.globalDmg);
      if (!e.dead) this.ignite(e, def.burn * this.mods.globalDmg, def.burnTime);
    }
    this.emit('cigBoom', { x: p.tx, y: p.ty, r: def.radius });
  }
  applyKnock(e, dt) {
    if (!e.kvx && !e.kvy) return;
    const nx = e.x + e.kvx * dt, ny = e.y + e.kvy * dt, cx = Math.round(nx), cy = Math.round(ny);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS || this.blocked[idx(cx, cy)] !== 0) { e.kvx = 0; e.kvy = 0; return; }   // never shove them through walls, shelves or machines
    e.x = nx; e.y = ny;
    const f = Math.exp(-5 * dt); e.kvx *= f; e.kvy *= f;
    if (Math.hypot(e.kvx, e.kvy) < 0.05) { e.kvx = 0; e.kvy = 0; }
  }
  colaHit(p) {
    const e = p.target, def = ITEMS.cola;
    const hx = e && !e.dead ? e.x : p.tx, hy = e && !e.dead ? e.y : p.ty;
    const dps = def.soak * (this.mods.soak ?? 1) * this.mods.globalDmg * (1 + 0.35 * (p.level - 1));
    for (const o of this.enemies) {
      if (o.dead || Math.hypot(o.x - hx, o.y - hy) > def.splash) continue;
      this.damage(o, o === e ? p.dmg : p.dmg * 0.5);
      if (o.dead) continue;
      this.drench(o, dps, def.soakTime);
      this.shove(o, p.dx, p.dy, def.push * (this.mods.push ?? 1) * (o.type === 'boss' ? 0.3 : 1));
    }
    this.emit('colaSplash', { x: hx, y: hy, r: def.splash });
  }

  // ---------- ATM: receipts that start a swirl around every burglar nearby ----------
  receiptHit(p) {
    const e = p.target, def = ITEMS.atm;
    const hx = e && !e.dead ? e.x : p.tx, hy = e && !e.dead ? e.y : p.ty, r = def.swirlR;
    for (const o of this.enemies) {
      if (o.dead || Math.hypot(o.x - hx, o.y - hy) > r) continue;
      this.damage(o, o === e ? p.dmg : p.dmg * 0.5);
    }
    const T = def.swirlTime * (this.mods.swirlTime ?? 1);
    const s = { id: this.nextId++, x: hx, y: hy, r, t: T, max: T, dps: def.swirlDps * (this.mods.swirlDmg ?? 1) * this.mods.globalDmg * (1 + 0.35 * (p.level - 1)) };
    this.swirls.push(s);
    this.emit('swirl', { swirl: s });
  }

  hitProjectile(p) {
    if (p.kind === 'gum') {
      this.emit('gumHit', { x: p.x, y: p.y, dx: p.dx, dy: p.dy, color: p.color });   // the gumball bounces off and scatters on the floor
      if (p.target && !p.target.dead) this.damage(p.target, p.dmg);
      return;
    }
    if (p.kind === 'cig') { this.cigBoom(p); return; }
    if (p.kind === 'cola') { this.colaHit(p); return; }
    if (p.kind === 'atm') { this.receiptHit(p); return; }
    if (p.kind === 'sauce') { this.sauceSplash(p.tx, p.ty, p); return; }
    if (p.kind === 'bomb') { this.plantBomb(p.tx, p.ty); return; }
    if (p.kind === 'ice') { this.iceBurst(p.tx, p.ty, p); return; }
    if (p.kind === 'hotdog') { this.hotdogHit(p); return; }
    const e = p.target;
    if (p.kind === 'milk') { if (e && !e.dead) { this.damage(e, p.dmg); if (!e.dead) this.chill(e, 0.25, 1.6); } return; }
    if (p.kind === 'icecream') { this.creamSplat(e && !e.dead ? e.x : p.tx, e && !e.dead ? e.y : p.ty, p); return; }
    if (p.kind === 'soda') { this.splash(e && !e.dead ? e.x : p.tx, e && !e.dead ? e.y : p.ty, p); return; }
    if (p.kind === 'cans') {
      this.emit('canHit', { x: p.x, y: p.y, dx: p.dx, dy: p.dy, color: p.color });   // the can bounces off and scatters on the floor
      if (e && !e.dead) this.damage(e, p.dmg);
      return;
    }
    if (!e || e.dead) return;
    this.damage(e, p.dmg);
  }

  // ---------- Hot Sauce Lobber ----------
  ignite(e, dps, time) {
    e.burnDps = e.burn > 0 ? Math.max(e.burnDps, dps) : dps;
    e.burn = Math.max(e.burn, time);
  }
  sauceSplash(x, y, p) {
    const def = ITEMS.sauce, r = def.splash;
    for (const e of this.enemies) {
      if (e.dead || Math.hypot(e.x - x, e.y - y) > r) continue;
      this.damage(e, p.dmg);
      if (e.dead) continue;
      this.ignite(e, p.burnDps, def.burnTime);
      if (this.rng() < def.panic * (e.type === 'boss' ? 0.3 : 1)) {   // burning burglars may panic and run back toward the door
        e.flee = 1.5 + this.rng(); e.dash = null; e.wind = 0; e.pending = null;
        this.emit('panic', { enemy: e });
      }
    }
    this.fires.push({ id: this.nextId++, x, y, r: r * 0.85, t: def.fireTime, max: def.fireTime, dps: p.burnDps * 0.8 });
    this.emit('sauceSplash', { x, y, r });
  }

  // ---------- Night tricks: bombs and dashes ----------
  plantBomb(x, y) {
    this.bombs.push({ id: this.nextId++, x, y, t: BOMB_FUSE, max: BOMB_FUSE, r: BOMB_RADIUS });
    this.emit('bombLand', { x, y });
  }
  explode(b) {
    for (const t of [...this.towers]) if (t.kind === 'tower' && Math.hypot(t.x - b.x, t.y - b.y) <= b.r + 0.3) this.hurtTower(t, BOMB_DMG);
    for (const s of [...this.shelves]) {
      if (Math.hypot(s.x - b.x, s.y - b.y) > b.r + 0.3) continue;
      s.hp -= BOMB_DMG; s.hit = 0.3;
      if (s.hp <= 0) this.breakShelf(s);
    }
    for (const tr of [...this.traps]) if (Math.hypot(tr.x - b.x, tr.y - b.y) <= b.r) { this.traps = this.traps.filter(x => x !== tr); this.emit('trapGone', { trap: tr }); }
    this.emit('explode', { x: b.x, y: b.y, r: b.r });
  }
  throwBomb(e, tx, ty) {
    const d0 = Math.max(0.5, Math.hypot(tx - e.x, ty - e.y));
    this.projectiles.push({ id: this.nextId++, kind: 'bomb', lob: true, arc: 1.4, x: e.x, y: e.y, h: 0.9, h0: 0.9, sx: e.x, sy: e.y, d0, target: null, tx, ty, speed: 4.2, dmg: 0, level: 1, dx: 0, dy: 0 });
    this.emit('throw', { enemy: e });
  }
  bombTarget(e) {
    const near = o => Math.hypot(o.x - e.x, o.y - e.y), ok = o => near(o) > 1.1 && near(o) < 4.3;
    const ts = this.towers.filter(t => t.kind === 'tower' && ok(t)), sh = this.shelves.filter(ok);
    const pool = (ts.length && (!sh.length || this.rng() < 0.6) ? ts : sh).sort((a, b) => near(a) - near(b)).slice(0, 3);
    return pool.length ? pool[Math.floor(this.rng() * pool.length)] : null;
  }
  dashDir(e) {
    const hits = [];
    for (const [dx, dy] of NB) {
      for (let k = 1; k <= 4; k++) {
        const x = e.tx + dx * k, y = e.ty + dy * k;
        if (x < 0 || y < 0 || y >= ROWS || x >= COLS || this.reserved(x, y)) break;
        const b = this.blocked[idx(x, y)];
        if (b === 1) break;
        if (b === 2 || b === 3) { hits.push([dx, dy]); break; }
      }
    }
    const pool = hits.length && this.rng() < 0.55 ? hits : NB;
    return pool[Math.floor(this.rng() * pool.length)];
  }
  // called when a burglar arrives on a cell and its trick timer is up
  startTrick(e) {
    const n = this.wave + 1, def = ENEMIES[e.type];
    // bombers are rare early on and get more common every night (none before night 4)
    const bombMul = n < 4 ? 0 : Math.min(2.2, 0.2 + (n - 4) * 0.22);
    const wb = def.abil.bomb * bombMul, wd = def.abil.dash, tot = wb + wd;
    e.abCd = def.cd * (1.15 - 0.03 * n) * (0.7 + this.rng() * 0.7);
    if (tot <= 0 || this.rng() > 0.75) return false;
    if (this.rng() * tot < wb) {
      const tgt = this.bombTarget(e);
      if (!tgt) { e.abCd = 1.5; return false; }
      e.pending = { kind: 'bomb', tx: tgt.x + (this.rng() - 0.5) * 0.7, ty: tgt.y + (this.rng() - 0.5) * 0.7 };
      e.angle = Math.atan2(tgt.x - e.x, tgt.y - e.y); e.wind = 0.55;
    } else {
      const [dx, dy] = this.dashDir(e);
      e.pending = { kind: 'dash', dx, dy, n: 2 + Math.floor(this.rng() * 3) };
      e.angle = Math.atan2(dx, dy); e.wind = 0.45;
    }
    this.emit('windup', { enemy: e, kind: e.pending.kind });
    return true;
  }
  doTrick(e) {
    const p = e.pending; e.pending = null; if (!p) return;
    if (p.kind === 'bomb') this.throwBomb(e, p.tx, p.ty);
    else { e.dash = { dx: p.dx, dy: p.dy, left: p.n, speed: 8.5 }; this.emit('dash', { enemy: e }); }
  }
  endDash(e, stun = 0.35) { e.dash = null; e.stun = Math.max(e.stun, stun); }
  dashStep(e, dt) {
    const D = e.dash; let move = D.speed * dt, guard = 0;
    while (move > 0 && guard++ < 4 && e.dash) {
      const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
      if (d > move) { e.x += dx / d * move; e.y += dy / d * move; e.angle = Math.atan2(dx, dy); return; }
      e.x = e.tx; e.y = e.ty; move -= d;
      if (D.left <= 0) { this.endDash(e); return; }
      const nx = e.tx + D.dx, ny = e.ty + D.dy;
      if (nx < 0 || ny < 0 || ny >= ROWS || nx >= COLS || this.reserved(nx, ny)) { this.emit('dashHit', { enemy: e, x: e.tx, y: e.ty, kind: 0 }); this.endDash(e, 0.5); return; }
      const b = this.blocked[idx(nx, ny)];
      if (b) { this.dashHit(e, nx, ny, b); return; }
      D.left--; e.tx = nx; e.ty = ny; e.angle = Math.atan2(D.dx, D.dy);
    }
  }
  dashHit(e, nx, ny, b) {
    const dmg = DASH_DMG * e.dashMul;
    if (b === 2) { const t = this.towerAt(nx, ny); if (t) this.hurtTower(t, dmg); }
    else if (b === 3) { const sh = this.shelfAt(nx, ny); if (sh) { sh.hp -= dmg; sh.hit = 0.25; if (sh.hp <= 0) this.breakShelf(sh); } }
    this.emit('dashHit', { enemy: e, x: nx, y: ny, kind: b });
    this.endDash(e, 0.8);
  }

  // ---------- Main update ----------
  update(dt) {
    while (dt > 0) { const s = Math.min(dt, 0.04); this.step(s); dt -= s; }
  }

  // ---------- daytime sidewalk: passers-by stroll past the doors, fade in / out at the ends, and some walk in ----------
  // purely cosmetic unless one decides to enter: then it turns into a real customer (a few extra sales per day)
  stepWalkers(dt) {
    const ph = this.phase, day = ph === 'prep' || ph === 'morning' || ph === 'evening';
    if (!this.walkers) this.walkers = [];
    if (!day || !this.spawns || !this.spawns.length) { this.walkers.length = 0; return; }
    const s0 = this.spawns[0], horiz = s0.side === 'bottom', LEN = horiz ? COLS : ROWS, A0 = -0.8, A1 = LEN + 0.2, FADE = 1.1;
    const at = (w, along) => {   // grid position of a walker on its lane
      if (horiz) { w.x = along; w.y = s0.y + w.lane; }
      else { w.x = s0.x + s0.ox * w.lane; w.y = along; }
    };
    if (ph !== 'evening' && this.walkers.length < 7) {
      this.walkT -= dt;
      if (this.walkT <= 0) {
        this.walkT = 1.2 + Math.random() * 2.4;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const w = { id: this.nextId++, kind: 'walker', state: 'walk', bags: [], dir, along: dir > 0 ? A0 : A1, lane: 2.2 + (Math.random() - 0.5) * 0.5,
          speed: 1.2 + Math.random() * 0.9, look: Math.floor(Math.random() * 100000), a: 0, rolled: [], angle: 0, x: 0, y: 0 };
        w.angle = horiz ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
        at(w, w.along); this.walkers.push(w);
      }
    }
    for (const w of this.walkers) {
      const prev = w.along; w.along += w.dir * w.speed * dt;
      w.a = Math.max(0, Math.min(1, Math.min(w.along - A0, A1 - w.along) / FADE));
      at(w, w.along);
      if (ph === 'morning' && this.dayWalk < 8) {
        const sp = this.activeSpawns;
        for (let i = 0; i < sp.length; i++) {
          const s = sp[i], dp = horiz ? s.x : s.y;
          if (w.rolled.includes(i) || (prev - dp) * (w.along - dp) > 0) continue;
          w.rolled.push(i);
          if (Math.random() < 0.3) {   // this one walks in
            this.spawnCustomer(s);
            const c = this.customers[this.customers.length - 1]; c.x = w.x; c.y = w.y; c.angle = w.angle;
            w.gone = true; this.dayWalk++;
            break;
          }
        }
      }
      if ((w.dir > 0 && w.along >= A1) || (w.dir < 0 && w.along <= A0)) w.gone = true;
    }
    this.walkers = this.walkers.filter(w => !w.gone);
  }

  step(dt) {
    this.stepWalkers(dt);
    if (this.phase === 'lost') return;
    this.time += dt;
    if (this.phase === 'morning') {
      this.dayTime += dt;
      while (this.dayQueue.length && this.dayQueue[0].t <= this.dayTime) this.spawnCustomer(this.dayQueue.shift().spawn);
      for (const c of this.customers) if (!c.dead) this.moveCustomer(c, dt);
      this.customers = this.customers.filter(c => !c.dead);
      if (!this.dayQueue.length && !this.customers.length) {
        this.phase = 'evening'; this.nightIn = NIGHT_DELAY;
        this.emit('evening', { sales: this.daySales, served: this.dayServed });
      }
    }
    if (this.phase === 'evening') { this.nightIn -= dt; if (this.nightIn <= 0) this.startWave(); }   // the night starts on its own
    if (this.phase === 'wave') {
      this.waveTime += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveTime) {
        const q = this.spawnQueue.shift(); this.spawnEnemy(q.type, q.spawn);
      }
    }
    for (const sh of this.shelves) if (sh.hit > 0) sh.hit -= dt;
    // towers (they only shoot when burglars are around)
    for (const t of this.towers) {
      if (t.kind !== 'tower') continue;
      if (t.hit > 0) t.hit -= dt;
      if (t.broken) continue;                                  // broken turrets do nothing until replaced
      t.cd -= dt;
      if (t.cd <= 0) { if (this.towerFire(t)) { t.cd = 1 / this.stat(t, 'rate'); this.wearTower(t); } else t.cd = 0.1; }
    }
    // projectiles
    for (const p of this.projectiles) {
      const e = p.target;
      if (!p.lob && e && !e.dead) { p.tx = e.x; p.ty = e.y; }
      if (p.delay > 0) { p.delay -= dt; p.x = p.sx; p.y = p.sy; p.h = p.h0; continue; }   // queued gumballs wait inside the machine
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), mv = p.speed * dt;
      if (d > 0.001) { p.dx = dx / d; p.dy = dy / d; }
      if (d <= mv + 0.05) { p.done = true; this.hitProjectile(p); continue; }
      p.x += dx / d * mv; p.y += dy / d * mv;
      const prog = 1 - Math.min(1, d / p.d0);
      if (p.lob) p.h = p.h0 + Math.sin(prog * Math.PI) * p.arc;                      // lobbed: high arc, lands on the floor
      else if (p.kind === 'cans') p.h = p.h0 + (0.5 - p.h0) * prog + Math.sin(prog * Math.PI) * 0.55;
      else if (p.kind === 'gum') p.h = p.h0 + (0.45 - p.h0) * prog + Math.sin(prog * Math.PI) * 0.4;
      else if (p.kind === 'cola') p.h = p.h0 + (0.5 - p.h0) * prog + Math.sin(prog * Math.PI) * 0.1;
      else if (p.kind === 'atm') p.h = p.h0 + (0.6 - p.h0) * prog + Math.sin(prog * Math.PI) * 0.3;
      else p.h = 0.8 + Math.sin(prog * Math.PI) * (p.kind === 'soda' ? 0.18 : 0.6);
    }
    this.projectiles = this.projectiles.filter(p => !p.done);
    // sauce puddles keep burglars burning; bombs on the floor count down
    for (const f of this.fires) {
      f.t -= dt;
      for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - f.x, e.y - f.y) <= f.r && e.burn < 1.2) this.ignite(e, f.dps, 1.2);
    }
    this.fires = this.fires.filter(f => f.t > 0);
    // scattered ice cubes freeze every burglar that steps on them (once per patch)
    for (const p of this.ice) {
      p.t -= dt;
      for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) <= p.r) this.freeze(e, p);
    }
    this.ice = this.ice.filter(p => p.t > 0);
    // ATM receipt whirlwinds: burglars inside are slowed, dragged around the centre and hurt (armor doesn't help)
    for (const s of this.swirls) {
      s.t -= dt;
      for (const e of this.enemies) {
        const dx = s.x - e.x, dy = s.y - e.y, d = Math.hypot(dx, dy);
        if (e.dead || d > s.r) continue;
        const ux = d > 0.01 ? dx / d : 0, uy = d > 0.01 ? dy / d : 0, w = e.type === 'boss' ? 0.4 : 1;
        this.shove(e, (ux * 4 - uy * 5) * dt, (uy * 4 + ux * 5) * dt, w);   // pull in + spin around
        this.chill(e, 0.4, 0.3);
        e.hp -= s.dps * dt; e.flash = Math.max(e.flash || 0, 0.04);
        if (e.hp <= 0) this.kill(e);
      }
    }
    this.swirls = this.swirls.filter(s => s.t > 0);
    for (const b of this.bombs) { b.t -= dt; if (b.t <= 0) { b.done = true; this.explode(b); } }
    for (const sk of this.skills) this.stepSkill(sk, dt);
    this.skills = this.skills.filter(sk => !sk.done);
    this.bombs = this.bombs.filter(b => !b.done);
    // burglars
    for (const e of this.enemies) { if (!e.dead) this.moveEnemy(e, dt); }
    this.enemies = this.enemies.filter(e => !e.dead);
    if (this.lives <= 0 && this.phase !== 'lost') { this.lives = 0; this.phase = 'lost'; this.emit('lost', {}); return; }
    // night end
    if (this.phase === 'wave' && this.gapT > 0) {      // calm before the next wave of the same night
      this.gapT -= dt;
      if (this.gapT <= 0) {
        this.gapT = 0; this.subWave++; this.waveTime = 0;
        this.spawnQueue = this.makeWave(this.wave + 1, this.subScale(this.subWave), this.subWave === this.subWaves);
        this.waveTotal = this.spawnQueue.length;
        this.emit('subWave', { n: this.wave + 1, sub: this.subWave, subs: this.subWaves, count: this.spawnQueue.length });
      }
    }
    if (this.phase === 'wave' && !this.spawnQueue.length && !this.enemies.length && this.gapT <= 0 && this.subWave < this.subWaves) {
      this.gapT = SUB_GAP; this.emit('subClear', { sub: this.subWave, subs: this.subWaves, gap: SUB_GAP });
    }
    if (this.phase === 'wave' && !this.spawnQueue.length && !this.enemies.length && this.gapT <= 0) {
      this.wave++;
      const bonus = 20 + this.wave * 4;
      this.cash += bonus;
      this.emit('waveClear', { bonus });
      this.phase = 'restock'; this.rollChoices(); this.emit('restock', {});
    }
  }

  moveEnemy(e, dt) {
    // status
    if (e.flash > 0) e.flash -= dt;
    if (e.burn > 0) { e.burn -= dt; e.hp -= e.burnDps * dt; if (e.hp <= 0) { this.kill(e); return; } }
    if (e.soak > 0) { e.soak -= dt; e.hp -= e.soakDps * dt; if (e.hp <= 0) { this.kill(e); return; } }   // cola keeps soaking
    this.applyKnock(e, dt);
    if (e.slow > 0) e.slow -= dt;
    if (e.flee > 0) e.flee -= dt;
    if (e.abCd > 0) e.abCd -= dt;
    if (e.stun > 0) { e.stun -= dt; return; }
    // traps
    for (const tr of this.traps) {
      if (tr.uses > 0 && !e.slipped.has(tr.id) && Math.hypot(e.x - tr.x, e.y - tr.y) < 0.5) {
        e.slipped.add(tr.id); tr.uses--; e.stun = 0.8 + this.mods.mopStun;
        e.dash = null; e.wind = 0; e.pending = null;
        this.emit('slip', { enemy: e, trap: tr });
        this.damage(e, 5 * this.mods.globalDmg, true);
        if (tr.uses <= 0) { this.traps = this.traps.filter(x => x !== tr); this.emit('trapGone', { trap: tr }); }
        return;
      }
    }
    if (e.wind > 0) { e.wind -= dt; if (e.wind <= 0) this.doTrick(e); return; }   // winding up a bomb throw / dash
    if (e.dash) { this.dashStep(e, dt); return; }
    e.pushing = null;
    const fleeing = e.flee > 0;
    let move = e.speed * (e.slow > 0 ? 1 - e.slowF : 1) * (fleeing ? 1.45 : 1) * dt;
    let guard = 0;
    while (move > 0 && guard++ < 4) {
      const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
      if (d > move) { e.x += dx / d * move; e.y += dy / d * move; e.angle = Math.atan2(dx, dy); return; }
      e.x = e.tx; e.y = e.ty; move -= d;
      const cx = e.tx, cy = e.ty;
      if (this.isTill(cx, cy)) { // reached the register
        e.dead = true; this.lives -= e.steal;
        this.emit('leak', { enemy: e }); return;
      }
      if (!fleeing && e.abCd <= 0 && !this.reserved(cx, cy) && this.startTrick(e)) return;
      let best = null, bd = fleeing ? -1 : 1e9;
      const fld = fleeing || !this.flows ? this.dist : (this.flows[e.route] || this.dist);
      const here = fld[idx(cx, cy)];
      for (const [ox, oy] of NB) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = idx(nx, ny), dd = fld[j];
        if (dd < 0 || this.blocked[j] === 1 || this.blocked[j] === 2) continue;
        if (fleeing) { if (this.blocked[j] === 0 && dd > here && dd > bd) { bd = dd; best = [nx, ny]; } }   // panic: run AWAY from the register
        else if (dd < bd) { bd = dd; best = [nx, ny]; }
      }
      if (!best) { if (fleeing) { e.flee = 0; continue; } return; }   // cornered panic -> calm down
      const sh = this.blocked[idx(best[0], best[1])] === 3 ? this.shelfAt(best[0], best[1]) : null;
      if (sh) {   // nowhere else to go: shove the shelf until it breaks
        e.pushing = sh; e.angle = Math.atan2(best[0] - cx, best[1] - cy);
        sh.hp -= e.push * dt; sh.hit = 0.12;
        e.pushT += dt; if (e.pushT > 0.3) { e.pushT = 0; this.emit('push', { shelf: sh, enemy: e }); }
        if (sh.hp <= 0) this.breakShelf(sh);
        return;
      }
      e.tx = best[0]; e.ty = best[1];
    }
  }

  // ---------- Restock (upgrade pick after each night) ----------
  rollChoices() {
    const n = 3 + (this.meta.choice || 0);
    const pool = UPGRADES.filter(u => !u.avail || u.avail(this));
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
    this.choices = out;
  }
  reroll() { if (this.phase !== 'restock' || this.rerolls <= 0) return false; this.rerolls--; this.rollChoices(); return true; }
  pickUpgrade(id) {
    if (this.phase !== 'restock') return false;
    const u = this.choices.find(c => c.id === id); if (!u) return false;
    u.apply(this); this.phase = 'prep'; this.choices = [];
    this.emit('newDay', { n: this.wave + 1 });
    return true;
  }

  // ---------- Save / restore ----------
  // A snapshot is the store between days: layout, machines, cash, upgrades. Customers and burglars are never part of it.
  snapshot() {
    const c = o => JSON.parse(JSON.stringify(o));
    return c({
      v: 3, seed: this.seed, rng: this.rng.get(), room: this.room, wave: this.wave, cash: this.cash, lives: this.lives, maxLives: this.maxLives,
      kills: this.kills, served: this.served, sales: this.sales, paidOut: this.paidOut, rerolls: this.rerolls, unlocked: [...this.unlocked],
      mods: this.mods, nextId: this.nextId, phase: this.phase === 'restock' ? 'restock' : 'prep', choices: this.choices.map(u => u.id),
      counterSide: this.counterSide, doorSide: this.doorSide, counterPos: this.counterPos, tills: this.tills, spawns: this.spawns,
      shelves: this.shelves, towers: this.towers, traps: this.traps,
    });
  }
  restore(s, o = {}) {
    if (s.v !== 3) throw new Error('old save');   // saves from older layouts can't be loaded
    const c = x => JSON.parse(JSON.stringify(x));
    this.room = s.room; setRoom(s.room);
    if (!o.retry) { this.seed = s.seed; this.rng = mulberry32(s.seed); this.rng.set(s.rng); this.paidOut = s.paidOut; }
    this.wave = s.wave; this.cash = s.cash; this.lives = s.lives; this.maxLives = s.maxLives;
    this.kills = s.kills; this.served = s.served; this.sales = s.sales; this.rerolls = s.rerolls;
    this.unlocked = new Set(s.unlocked); this.mods = c(s.mods); this.nextId = Math.max(this.nextId, s.nextId);
    {   // saves made before the Bubblegum / Cola / ATM machines don't have their modifiers yet
      const m = this.mods, one = { cans: 1, sauce: 1, soda: 1, micro: 1, hotdog: 1, fridge: 1, gum: 1, cola: 1, atm: 1 };
      m.dmg = { ...one, ...m.dmg }; m.rate = { ...one, ...m.rate };
      for (const [k, v] of Object.entries({ gumExtra: 0, push: 1, soak: 1, swirlTime: 1, swirlDmg: 1 })) if (m[k] === undefined) m[k] = v;
    }
    this.counterSide = s.counterSide; this.doorSide = s.doorSide; this.counterPos = s.counterPos; this.tills = c(s.tills); this.spawns = c(s.spawns);
    this.shelves = c(s.shelves); this.towers = c(s.towers); this.traps = c(s.traps);
    this.blocked = new Uint8Array(COLS * ROWS);
    for (const sh of this.shelves) this.blocked[idx(sh.x, sh.y)] = 3;
    for (const t of this.towers) this.blocked[idx(t.x, t.y)] = 2;
    this.enemies = []; this.projectiles = []; this.fires = []; this.bombs = []; this.ice = []; this.swirls = []; this.skills = []; this.customers = []; this.walkers = [];
    this.spawnQueue = []; this.gapT = 0; this.subWave = 1; this.subWaves = 1; this.dayQueue = []; this.waveTime = 0; this.dayTime = 0; this.waveTotal = 0; this.nightIn = 0;
    this.phase = s.phase; this.daySnap = null;
    this.choices = (s.choices || []).map(id => UPGRADES.find(u => u.id === id)).filter(Boolean);
    this.refreshPaths();
  }

  // ---------- Losing: roll the day back ----------
  // The store goes back to exactly how it was when you opened that day: same layout, same machines, same cash
  // (money earned from customers and burglars that day is gone). Upgrades and the banked paycheck stay.
  retryDay() {
    if (this.phase !== 'lost') return false;
    if (this.daySnap) this.restore(this.daySnap, { retry: true });
    else {
      this.enemies = []; this.projectiles = []; this.fires = []; this.bombs = []; this.ice = []; this.swirls = []; this.skills = []; this.customers = []; this.walkers = [];
      this.spawnQueue = []; this.gapT = 0; this.subWave = 1; this.subWaves = 1; this.dayQueue = []; this.waveTime = 0; this.dayTime = 0; this.phase = 'prep';
    }
    this.lives = this.maxLives;
    for (const t of this.towers) { t.broken = null; t.wear = 0; t.hp = t.maxhp; t.warned = false; t.cd = 0.5; }
    for (const s of this.shelves) s.hp = s.maxhp;
    this.emit('retry', { n: this.wave + 1 });
    return true;
  }

  // ---------- Results ----------
  paycheck() {
    return this.wave * 12 + Math.floor(this.kills / 5) + Math.floor(this.served / 6);   // only ever grows, so it can be banked night by night
  }
}
