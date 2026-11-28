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
export const MOLO_TIME = 2.6;          // seconds a molotov fire patch lasts (longer when it feeds on an item)
export const FIRE_ITEM_DPS = 2.5;       // damage per second a burning shelf / machine takes
export const FIRE_MAX = 5;             // never more than this many enemy fire patches at once
export const MOTO_DMG = 55;            // the motor bandit slamming into a shelf / machine
export const SMASH_DMG = 30;           // one bat swing
export const DEFLECT_CHANCE = 0.4;     // chance the bat swats away a shot that is about to hit it
export const TOWER_FUSE = 5;        // a broken-down machine that is not replaced within this many seconds explodes
export const BLAST_RADIUS = 1.7, BLAST_DMG = 35, BLAST_ITEM_DMG = 30;
export const BOUNCE_RANGE = 2.6;   // how far a hotdog can bounce to the next burglar
export const ICE_TIME = 4.5;       // seconds scattered ice cubes stay on the floor
export const CAN_COLORS = [0xe0463e, 0x3a86ff, 0x2fb67a, 0xffb703, 0xb26bd6, 0xff7aa2];
export const GUM_COLORS = [0xff5a8a, 0x5fe3a1, 0xffcf4a, 0x6fa8ff, 0xb26bd6, 0xffffff, 0xff8c1a];
export const COLA_PUSH_CAP = 3.2;   // max speed (tiles/s) a burglar can be shoved or dragged at
export const STEEL_REFUND = 0.75;   // share of its price a steel shelf pays back when burglars destroy it
export const FRUIT_DMG = 18, FRUIT_RADIUS = 1.15;   // one scattered fruit explosion
export const STATUE_RANGE = 5;      // the soda statue repairs everything within this many tiles (an 11x11 square around it)
export const STATUE_HEAL = 0.10;    // share of max HP it restores per second to each damaged item
export const STATUE_UNIT_HP = 150;
// ---------- Bosses: one every 10th day, in the LAST wave of the night. They rotate: day 10, 20, 30, 40, then it starts over ----------
export const BOSS_ORDER = ['bombexpert', 'gunslinger', 'motoduo', 'doorrobber'];
export const BOSS_INFO = {
  bombexpert: { title: 'BOMB EXPERT', sub: 'Lobs bombs at your machines and charges in', icon: '💣' },
  gunslinger: { title: 'GUNSLINGER', sub: 'Shotguns whatever blocks him. Calls 3 fast gunners', icon: '🔫' },
  motoduo:    { title: 'RIDING IN TANDEM', sub: 'Drives through the door and wrecks everything', icon: '🏍️' },
  doorrobber: { title: 'DOOR ROBBER', sub: 'His shield door tanks your shots. Slams the floor', icon: '🚪' },
};
export const bossForDay = n => (n > 0 && n % 10 === 0) ? BOSS_ORDER[(n / 10 - 1) % BOSS_ORDER.length] : null;
export const SLAM_DMG = 100;          // Door Robber floor slam: one-shots shelves and machines in the 3x3
export const GUNNER_DMG = 5, GUNNER_RANGE = 2.4;   // gunners shoot machines that are close to them
export const TORNADO_TIME = 7, TORNADO_R = 1.25, TORNADO_ITEM_DPS = 20, TORNADO_MAX = 3;
export const MOTODUO_SMASH = 0.25;   // chance the bike actually wrecks an item it rolls over (it used to be 100%)
export const MOTODUO_RUSH = 42;       // seconds after it parks: the tandem stops playing around and races for the register  // one unit of statue stock repairs this much HP in total

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
ITEMS.gum = { id: 'gum', kind: 'tower', name: 'Bubblegum Machine', cost: 120, range: 3.3, dmg: 3, rate: 0.55, burst: 5, wear: 1 / 85, color: 0xff7aa2, sale: [3, 5],
  desc: 'Customers buy gumballs. At night it fires 5 gumballs in a row that scatter and bounce across the floor on impact.' };
ITEMS.cola = { id: 'cola', kind: 'tower', name: 'Cola Dispenser', cost: 150, range: 2.8, dmg: 3, rate: 1.8, splash: 0.65, push: 2.6, soak: 4, soakTime: 2.4, wear: 1 / 130, color: 0xd6262b, sale: [3, 5],
  desc: 'Customers fill a cup. At night it sprays fizzy cola that shoves burglars back and keeps soaking them for damage.' };
ITEMS.atm = { id: 'atm', kind: 'tower', name: 'ATM', cost: 260, range: 3.0, dmg: 7, rate: 0.75, swirlR: 1.35, swirlTime: 2.2, swirlDps: 6, wear: 1 / 100, color: 0x2a5db0, sale: [6, 10],
  desc: 'Customers withdraw cash (fees included). At night it shoots receipts that swirl around every burglar nearby, dragging and hurting them.' };
ITEMS.water = { id: 'water', kind: 'tower', name: 'Water Dispenser', cost: 130, range: 3.8, dmg: 7, rate: 0.4, count: 3, splash: 1.15, slow: 0.3, slowTime: 1.6, wear: 1 / 110, color: 0x4aa8ff, sale: [2, 4],
  desc: 'Customers fill a cup. At night it lobs 3 drops of water that each splash an area and slow burglars. Slow, but wide.' };
ITEMS.donut = { id: 'donut', kind: 'tower', name: 'Donut Tray', cost: 140, range: 3.6, dmg: 13, rate: 0.75, count: 3, speed: 9, back: 0.9, wear: 1 / 105, color: 0xff7aa2, sale: [3, 5],
  desc: 'Customers grab a donut. At night it throws 3 donuts in a row; a donut that hits a burglar flies back to the tray like a boomerang, hitting again on the way.' };
ITEMS.cereal = { id: 'cereal', kind: 'tower', name: 'Cereal Shelf', cost: 110, range: 3.6, dmg: 14, rate: 0.4, boxHp: 60, boxLife: 5, wear: 1 / 100, color: 0xff9f1c, sale: [3, 5],
  desc: 'Customers grab a box. At night it lobs a giant cereal box ahead of the burglars. It stands as a wall for 5 seconds: they must walk around or smash it.' };
ITEMS.tissue = { id: 'tissue', kind: 'tower', name: 'Tissue Dispenser', cost: 120, range: 4.5, dmg: 14, rate: 1.1, speed: 9.5, chill: 0.4, chillTime: 1.6, wear: 1 / 110, color: 0x8fb4e8, sale: [2, 4],
  desc: 'Customers pull a tissue. Only fires along its own row or column (never omni): a roll of tissue unrolls down the lane and pierces EVERY burglar on it.' };
ITEMS.cerealbox = { id: 'cerealbox', kind: 'shelf', name: 'Cereal Box', cost: 0, hp: 60, cap: 0, color: 0xff9f1c,
  desc: 'A temporary wall made by the Cereal Shelf. It disappears after a few seconds.' };
// SKILL ITEMS: one-off tricks (not sellables). The mop is a floor trap; the other two are used at night and go off right where you drop them.
ITEMS.shakecola = { id: 'shakecola', kind: 'skill', name: 'Shaken Cola', cost: 45, fuse: 1.1, radius: 1.9, dmg: 8, push: 8, soak: 3, soakTime: 2.2, color: 0xd6262b,
  desc: 'Night skill. Drop it and it bursts in a huge fizzy splash that blasts every burglar around it away.' };
ITEMS.cigs = { id: 'cigs', kind: 'skill', name: 'Cigarette Pack', cost: 70, count: 20, range: 5.2, spread: 3.4, interval: 0.07, radius: 0.8, dmg: 7, burn: 2.5, burnTime: 1.5, color: 0xd62828,
  desc: 'Night skill. Drop it and it lobs 20 lit cigarettes at the burglars. Each one pops in a small blast when it hits the floor.' };
// ---- shelf family: all of these are "shelves" (burglars smash them, tap to restock), each with a twist ----
ITEMS.steel = { id: 'steel', kind: 'shelf', name: 'Steel Shelf', cost: 70, hp: 360, cap: MAX_STOCK * 3, foot: 3, onShelves: true, color: 0xaab2c0, sale: [4, 8],
  desc: 'Upgrades a row of 3 shelves into one steel shelf: holds all their stock and is much harder to smash. Pays back 75% of its price when destroyed.' };
ITEMS.fruit = { id: 'fruit', kind: 'shelf', name: 'Fruit Basket Shelf', cost: 40, hp: 80, cap: MAX_STOCK, color: 0xf08a24, sale: [4, 9],
  desc: 'A shelf of fresh fruit. When burglars smash it the fruit rolls out and blows up one by one, hurting everyone nearby.' };
ITEMS.statue = { id: 'statue', kind: 'shelf', name: 'Soda Statue', cost: 150, hp: 220, cap: 6, foot: 3, range: STATUE_RANGE, unitMul: 4, color: 0xd6262b,
  desc: 'A big 3x3 soda statue. While it has stock it keeps repairing every damaged shelf and machine within 5 tiles. Restock it when it runs dry.' };
ITEMS.fence = { id: 'fence', kind: 'shelf', name: 'Security Fence', cost: 10, hp: 140, cap: 0, color: 0xc9ced6,
  desc: 'A cheap, sturdy steel barrier. Burglars have to walk around it or smash through. Use it to build a maze.' };
export const SELLABLES = ['shelf', 'fence', 'cans', 'gum', 'fruit', 'sauce', 'soda', 'cola', 'steel', 'hotdog', 'micro', 'atm', 'statue', 'fridge', 'water', 'donut', 'cereal', 'tissue'];   // shelves + turrets: the things customers buy from
export const SKILLS = ['mop', 'shakecola', 'cigs'];
// Day one: only the shelf, the vending machine and the bubble gum machine. Everything else has to be reached (a day) AND bought (store profit).
export const BASE_UNLOCKS = ['shelf', 'cans', 'gum'];
// Unlocking is paid with the run's own cash (store profit), from the build menu. Each run starts with only the base items.
export const UNLOCKS = { fence: 300, fruit: 400, sauce: 500, mop: 500, soda: 600, steel: 800, shakecola: 900, hotdog: 1000, cola: 1000, water: 1200, cereal: 1200, tissue: 1500, donut: 1800, micro: 1800, cigs: 2000, atm: 2500, fridge: 2500, statue: 3000 };
// The first day each item can be bought, ordered by how strong it is for its price (cheap helpers first, the big machines last):
// 2 items one day, 1 item the next, and so on. Before that day it is locked and cannot be bought, after it you still have to pay its price.
export const UNLOCK_DAY = {
  fence: 2, fruit: 2,
  sauce: 3,
  mop: 4, soda: 4,
  steel: 5,
  hotdog: 6, shakecola: 6,
  cola: 7,
  water: 8, cereal: 8,
  tissue: 9,
  donut: 10, micro: 10,
  cigs: 11,
  atm: 12, fridge: 12,
  statue: 13,
};
// the build menu lists everything in the order it unlocks: day 1 items first, then day 2, day 3 ... (same-day items keep the order above)
const dayKey = id => (UNLOCK_DAY[id] ?? 1) * 100 + (Object.keys(UNLOCK_DAY).indexOf(id) + 1);
export const BUILD_ORDER = [...SELLABLES, ...SKILLS].sort((x, y) => dayKey(x) - dayKey(y));
export const MAX_ROOM = 4;
export const MAX_PERMIT = 12;
export const PERMIT_FOR_RENO = [3, 6, 9, 12];   // store permit level you need for the 1st / 2nd / 3rd / 4th renovation
// how many of each thing you may place before the first renovation; every renovation raises each limit (by half the base, at least 1)
export const ITEM_LIMITS = { shelf: 20, fence: 20, fruit: 8, steel: 4, statue: 1, cans: 6, gum: 4, sauce: 4, soda: 4, cola: 3, hotdog: 3, micro: 2, atm: 2, fridge: 2, mop: 8, water: 3, donut: 3, cereal: 3, tissue: 3 };
export const limitGrow = base => Math.max(1, Math.round(base / 2));
export const RENO_COST = [180, 380, 650, 1000];   // cash price of the next room level (RENOVATE tab)
export const MAX_LEVEL = 3;

// ---------- Enemies ----------
export const ENEMIES = {
  // abil: weights for the random night tricks (bomb = lob a bomb at a turret/shelf, dash = charge in a random direction); cd = seconds between tricks
  sneak:  { name: 'Sneak',   hp: 24,  push: 10, speed: 1.5,  steal: 1, bounty: 4,  armor: 0, cost: 1, abil: { bomb: 3, dash: 1 }, cd: 7 },
  runner: { name: 'Runner',  hp: 14,  push: 8,  speed: 2.5,  steal: 1, bounty: 4,  armor: 0, cost: 1, abil: { bomb: 1, dash: 4 }, cd: 5 },
  vest:   { name: 'Vest',    hp: 45,  push: 16, speed: 1.25,  steal: 1, bounty: 7,  armor: 3, cost: 2, abil: { bomb: 2, dash: 2 }, cd: 7 },
  bruiser:{ name: 'Bruiser', hp: 95,  push: 32, speed: 1.0, steal: 2, bounty: 12, armor: 1, cost: 3, abil: { bomb: 1, dash: 3 }, cd: 6, dashMul: 1.6 },
  // new robbers. noSlow = immune to slow and freeze. molo = molotov throw weight, smash = bat swing weight
  jacket: { name: 'Jacket',  hp: 70,  push: 14, speed: 1.15, steal: 1, bounty: 9,  armor: 1, cost: 2, abil: { bomb: 2, dash: 2 }, cd: 7, noSlow: true },
  molotov:{ name: 'Molotov', hp: 40,  push: 10, speed: 1.3,  steal: 1, bounty: 9,  armor: 0, cost: 2, abil: { molo: 4, dash: 1 }, cd: 5 },
  moto:   { name: 'Motor Bandit', hp: 50, push: 0, speed: 4, steal: 0, bounty: 10, armor: 1, cost: 3, abil: {}, cd: 99 },
  bat:    { name: 'Bat',     hp: 110, push: 24, speed: 1.1,  steal: 2, bounty: 14, armor: 1, cost: 3, abil: { smash: 1 }, cd: 3.2 },
  // ----- BOSSES (boss: true). bk = a custom behaviour handled in bossAct() -----
  bombexpert: { name: 'Bomb Expert', hp: 520, push: 70, speed: 0.95, steal: 5, bounty: 80, armor: 2, cost: 0, abil: { bomb: 3, dash: 2 }, cd: 3.5, dashMul: 1.6, boss: true },
  gunslinger: { name: 'Gunslinger', hp: 600, push: 50, speed: 1.0, steal: 5, bounty: 90, armor: 2, cost: 0, abil: {}, cd: 99, boss: true, bk: 'gunslinger' },
  gunner:     { name: 'Gunner', hp: 30, push: 6, speed: 3.6, steal: 1, bounty: 5, armor: 0, cost: 0, abil: {}, cd: 99, bk: 'gunner' },
  motoduo:    { name: 'Riding in Tandem', hp: 700, push: 0, speed: 3.2, steal: 5, bounty: 100, armor: 2, cost: 0, abil: {}, cd: 99, boss: true, bk: 'motoduo', noSlow: true },
  doorrobber: { name: 'Door Robber', hp: 650, push: 60, speed: 0.8, steal: 6, bounty: 100, armor: 3, cost: 0, abil: {}, cd: 5, boss: true, bk: 'doorrobber', shield: 0.7 },
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
  { id: 'ripefruit', icon: '🍉', name: 'Ripe Fruit', desc: 'Fruit explosions hit 50% harder.', apply: g => g.mods.fruitDmg *= 1.5, avail: g => g.shelves.some(s => s.type === 'fruit') },
  { id: 'statuefast', icon: '🗿', name: 'Fizzy Fix', desc: 'Soda Statues repair 50% faster and stretch their stock further.', apply: g => g.mods.statueRate *= 1.5, avail: g => g.shelves.some(s => s.type === 'statue') },
  { id: 'bigjug', icon: '🚰', name: 'Big Jug', desc: 'Water Dispensers lob 2 more drops per volley.', apply: g => g.mods.waterExtra += 2, avail: g => hasTower(g, 'water') },
  { id: 'coldwater', icon: '💦', name: 'Ice Cold Water', desc: 'Water splashes are 30% wider and hit 20% harder.', apply: g => { g.mods.waterR *= 1.3; g.mods.dmg.water *= 1.2; }, avail: g => hasTower(g, 'water') },
  { id: 'dozen', icon: '🍩', name: "Baker's Dozen", desc: 'Donut Trays throw 1 more donut per volley.', apply: g => g.mods.donutExtra += 1, avail: g => hasTower(g, 'donut') },
  { id: 'glaze', icon: '🍯', name: 'Extra Glaze', desc: 'Donut damage +35%.', apply: g => g.mods.dmg.donut *= 1.35, avail: g => hasTower(g, 'donut') },
  { id: 'familybox', icon: '📦', name: 'Family Size Box', desc: 'Cereal walls last 3 s longer and have 60% more HP.', apply: g => { g.mods.boxLife += 3; g.mods.boxHp *= 1.6; }, avail: g => hasTower(g, 'cereal') },
  { id: 'breakfast', icon: '🥣', name: 'Breakfast Rush', desc: 'Cereal Shelves fire 30% faster.', apply: g => g.mods.rate.cereal *= 1.3, avail: g => hasTower(g, 'cereal') },
  { id: 'triple', icon: '🧻', name: 'Triple Ply', desc: 'Tissue Dispenser damage +35%.', apply: g => g.mods.dmg.tissue *= 1.35, avail: g => hasTower(g, 'tissue') },
  { id: 'quickroll', icon: '📏', name: 'Quick Unroll', desc: 'Tissue Dispensers fire 30% faster.', apply: g => g.mods.rate.tissue *= 1.3, avail: g => hasTower(g, 'tissue') },
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
  { id: 'sign', icon: '⚠️', name: 'Wet Floor Sign', desc: 'Mops last +8 slips and stun longer.', apply: g => { g.mods.mopUses += 8; g.mods.mopStun += 0.4; g.traps.forEach(t => t.uses += 8); } },
  { id: 'lucky', icon: '🎟️', name: 'Lucky Scratcher', desc: '+12% chance to crit (x2) with all towers.', apply: g => g.mods.crit += 0.12 },
  { id: 'overtime', icon: '⏫', name: 'Overtime', desc: 'Free level-up on a random tower.', apply: g => { const c = g.towers.filter(t => t.kind === 'tower' && t.level < MAX_LEVEL); const t = c[Math.floor(g.rng() * c.length)]; if (t) { t.level++; g.emit('upgrade', { tower: t }); } }, avail: g => g.towers.some(t => t.kind === 'tower' && t.level < MAX_LEVEL) },
];

// ---------- Permanent "paycheck" upgrades ----------
export const META = [
  { id: 'cash', icon: '💵', name: 'Petty Cash Advance', desc: '+$15 starting cash / level', max: 5, cost: l => 20 + l * 20 },
  { id: 'dmg', icon: '💪', name: 'Gym Membership', desc: '+6% tower damage / level', max: 5, cost: l => 30 + l * 25 },
  { id: 'disc', icon: '🏷️', name: 'Employee Discount Card', desc: '-4% build costs / level', max: 4, cost: l => 35 + l * 30 },
  { id: 'choice', icon: '📦', name: 'Supplier Connections', desc: '+1 restock card to choose from', max: 2, cost: l => 80 + l * 90 },
  { id: 'reroll', icon: '🔄', name: 'Return Policy', desc: '+1 restock reroll / level', max: 3, cost: l => 40 + l * 40 },
];
// Room expansion: every level makes the (square) store 2 tiles wider and taller. Applies to the next new store.
export const ROOM_UPGRADE = { id: 'room', icon: '📐', name: 'Bigger Starting Store', desc: 'New stores start 2 tiles wider and taller / level (you can also renovate in the build menu)', max: MAX_ROOM, cost: l => 120 + l * 140 };
// Every machine except the starter ones is a one-time purchase.
export const UNLOCK_ICONS = { shakecola: '🍾', cigs: '🚬', mop: '🧹', sauce: '🌶️', gum: '🍬', soda: '🥤', cola: '🍹', hotdog: '🌭', micro: '🍲', atm: '🏧', fridge: '🧊', fence: '🚧', fruit: '🍎', steel: '🗄️', statue: '🗿', water: '🚰', donut: '🍩', cereal: '🥣', tissue: '🧻' };
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
    this.permit = this.room ? PERMIT_FOR_RENO[this.room - 1] : 1;   // a store that starts bigger already has the permit for it
    this.seed = opts.seed ?? ((Math.random() * 4294967296) >>> 0);
    this.rng = mulberry32(this.seed);
    this.on = null;
    this.nextId = 1;
    this.time = 0;
    // prep (before opening) -> morning (customers) -> evening (closed, get ready) -> wave (night) -> restock -> prep ...
    this.phase = 'prep';
    this.wave = 0;                  // nights completed
    this.cash = START_CASH + 15 * (meta.cash || 0);
    this.maxLives = 1;   // one life only: the first burglar that reaches the till ends the run
    this.lives = this.maxLives;
    this.kills = 0; this.served = 0; this.sales = 0; this.daySales = 0; this.dayServed = 0; this.paidOut = 0;
    this.rerolls = meta.reroll || 0;
    this.unlocked = new Set(BASE_UNLOCKS); this.nightIn = 0;
    this.mods = {
      dmg: { cans: 1, sauce: 1, soda: 1, micro: 1, hotdog: 1, fridge: 1, gum: 1, cola: 1, atm: 1, water: 1, donut: 1, cereal: 1, tissue: 1 }, rate: { cans: 1, sauce: 1, soda: 1, micro: 1, hotdog: 1, fridge: 1, gum: 1, cola: 1, atm: 1, water: 1, donut: 1, cereal: 1, tissue: 1 },
      waterExtra: 0, waterR: 1, donutExtra: 0, boxLife: 0, boxHp: 1,
      gumExtra: 0, push: 1, soak: 1, swirlTime: 1, swirlDmg: 1, fruitDmg: 1, statueRate: 1,
      bounce: 0, ice: 0, rateAll: 1, range: 1, cost: 1 - 0.04 * (meta.disc || 0), cash: 1.3, burn: 1, splash: 1, slow: 0, crit: 0,
      mopUses: 0, mopStun: 0, globalDmg: 1 + 0.06 * (meta.dmg || 0), shelfPay: 1, crowd: 1, shelfHp: 1, wear: 1, towerHp: 1,
    };
    // blocked: 0 free, 1 permanent wall/prop, 2 tower, 3 shelf (breakable by burglars)
    this.blocked = new Uint8Array(COLS * ROWS);
    this.towers = []; this.traps = []; this.enemies = []; this.projectiles = []; this.customers = []; this.walkers = [];
    this.fires = []; this.bombs = []; this.ice = []; this.swirls = []; this.skills = []; this.fruits = []; this.donuts = []; this.rolls = []; this.tornados = [];   // sauce puddles, enemy bombs waiting to blow, scattered ice cubes, ATM receipt whirlwinds
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
  // ---------- store permit (STATUS tab): a higher permit is needed before the store may be renovated ----------
  permitCost() { return this.permit >= MAX_PERMIT ? Infinity : Math.round((40 + 35 * this.permit) * this.mods.cost); }
  canUpgradePermit() {
    if (this.permit >= MAX_PERMIT) return { ok: false, reason: 'Permit is maxed' };
    if (this.phase === 'lost') return { ok: false, reason: 'Game over' };
    if (this.permitCost() > this.cash) return { ok: false, reason: 'Not enough cash' };
    return { ok: true };
  }
  upgradePermit() {
    if (!this.canUpgradePermit().ok) return false;
    this.cash -= this.permitCost(); this.permit++;
    this.emit('permit', { level: this.permit }); return true;
  }
  // ---------- how many of an item you may have placed (grows with every renovation) ----------
  countOf(type) {
    const def = ITEMS[type]; if (!def) return 0;
    if (def.kind === 'shelf') return this.shelves.filter(s => (s.type || 'shelf') === type).length;
    if (def.kind === 'trap') return this.traps.filter(t => t.type === type).length;
    return this.towers.filter(t => t.type === type).length;
  }
  limitOf(type) { const b = ITEM_LIMITS[type]; return b === undefined ? Infinity : b + this.room * limitGrow(b); }
  canRenovate() {
    if (this.room >= MAX_ROOM) return { ok: false, reason: 'Fully renovated' };
    if (this.permit < PERMIT_FOR_RENO[this.room]) return { ok: false, reason: `Needs Permit Lv ${PERMIT_FOR_RENO[this.room]}` };
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
  unlockDay(type) { return UNLOCK_DAY[type] ?? 1; }          // the first day it can be bought
  canUnlock(type) { return this.wave + 1 >= this.unlockDay(type); }   // has this day been reached yet?
  unlock(type) {
    if (this.isUnlocked(type) || UNLOCKS[type] === undefined || !this.canUnlock(type)) return false;
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
  flow(extraIn = -1, noise = null) {   // extraIn: one cell index (or a list of them) to treat as solid, for "what if I built here" checks. noise: per-cell extra step cost (0..5) -> a different, equally valid way to the register
    const N = COLS * ROWS, B = this.blocked, ex = new Set(Array.isArray(extraIn) ? extraIn : [extraIn]);
    const d = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    for (const t of this.tills) { const i = idx(t.x, t.y); if (!B[i] && !ex.has(i)) d[i] = 0; }
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
        if (done[j] || ex.has(j) || B[j] === 1 || B[j] === 2) continue;
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
  // big shelves (steel shelf, soda statue) cover several cells; s.x / s.y is their middle cell
  cellsOf(s) { return s.cells || [[s.x, s.y]]; }
  shelfAt(x, y) { return this.shelves.find(s => s.cells ? s.cells.some(c => c[0] === x && c[1] === y) : (s.x === x && s.y === y)) || null; }
  shelfNear(s, x, y) { let m = 1e9; for (const [cx, cy] of this.cellsOf(s)) m = Math.min(m, Math.hypot(cx - x, cy - y)); return m; }
  capOf(s) { const c = ITEMS[s.type || 'shelf'].cap; return c === undefined ? MAX_STOCK : c; }          // how many goods it holds
  unitCostOf(s) { return Math.max(1, Math.round(this.unitCost() * (ITEMS[s.type || 'shelf'].unitMul || 1))); }
  isStation(s) { return s.type !== 'statue' && s.type !== 'fence' && s.type !== 'cerealbox'; }                                       // customers shop here
  // an existing plain shelf row of 3 that contains (x, y), for upgrading to a steel shelf (middle of the row preferred)
  steelWindow(x, y) {
    const plain = (cx, cy) => { const s = this.shelfAt(cx, cy); return s && !s.type && s.placed !== false; };
    for (const [dx, dy, dir] of [[1, 0, 'x'], [0, 1, 'y']]) {
      for (const k of [1, 0, 2]) {
        const cells = [0, 1, 2].map(i => [x + (i - k) * dx, y + (i - k) * dy]);
        if (cells.every(([cx, cy]) => plain(cx, cy))) return { cells, dir };
      }
    }
    return null;
  }
  stat(t, key) {
    const def = ITEMS[t.type], L = t.level - 1, m = this.mods;
    switch (key) {
      case 'dmg': return def.dmg * (1 + 0.35 * L) * (m.dmg[t.type] || 1) * m.globalDmg;
      case 'range': return def.range * (1 + 0.05 * L) * m.range;
      case 'rate': return def.rate * (m.rate[t.type] || 1) * m.rateAll;
    }
  }

  // the steel shelf is built ON TOP of 3 shelves in a row; the soda statue is a 3x3 block (x, y = its middle)
  canPlaceBig(type, x, y, mv) {
    const def = ITEMS[type];
    if (!mv && this.costOf(type) > this.cash) return { ok: false, reason: 'Not enough cash' };
    if (def.onShelves) return this.steelWindow(x, y) ? { ok: true } : { ok: false, reason: 'Needs 3 shelves in a row' };
    const cells = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push([x + dx, y + dy]);
    for (const [cx, cy] of cells) {
      if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS || this.reserved(cx, cy)) return { ok: false, reason: 'Needs a free 3x3 spot' };
      if (this.spawns.some(s => s.x === cx && s.y === cy)) return { ok: false, reason: 'Door — keep clear' };
      if (this.blocked[idx(cx, cy)] || this.trapAt(cx, cy)) return { ok: false, reason: 'Needs a free 3x3 spot' };
    }
    for (const e of this.enemies) if (cells.some(([cx, cy]) => Math.hypot(e.x - cx, e.y - cy) < 0.75 || (e.tx === cx && e.ty === cy))) return { ok: false, reason: 'Burglar in the way' };
    for (const c of this.customers) if (cells.some(([cx, cy]) => Math.hypot(c.x - cx, c.y - cy) < 0.75 || (c.tx === cx && c.ty === cy))) return { ok: false, reason: 'Customer in the way' };
    const d = this.flow(cells.map(([cx, cy]) => idx(cx, cy)));
    if (this.spawns.some(s => d[idx(s.x, s.y)] < 0 || d[idx(s.x, s.y)] >= SHELF_COST)) return { ok: false, reason: 'Keep an aisle open for customers' };
    for (const e of this.enemies) {
      const cx = Math.min(COLS - 1, Math.max(0, Math.round(e.x))), cy = Math.min(ROWS - 1, Math.max(0, Math.round(e.y)));
      if (d[idx(cx, cy)] < 0) return { ok: false, reason: 'Would trap a burglar' };
    }
    return { ok: true };
  }

  canPlace(type, x, y, mv) {   // mv = checking a MOVE of an item you already own: no unlock / limit / cost checks
    const def = ITEMS[type];
    if (!mv && !this.isUnlocked(type)) return { ok: false, reason: 'Locked: buy it in the shop' };
    if (!mv && this.countOf(type) >= this.limitOf(type)) return { ok: false, reason: `Limit reached (${this.limitOf(type)}): renovate for more` };
    if (def.foot > 1) return this.canPlaceBig(type, x, y, mv);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || this.reserved(x, y)) return { ok: false, reason: 'Not buildable here' };
    if (this.spawns.some(s => s.x === x && s.y === y)) return { ok: false, reason: 'Door — keep clear' };
    if (this.blocked[idx(x, y)]) return { ok: false, reason: 'Occupied' };
    if (def.kind === 'skill') {
      if (this.phase !== 'wave') return { ok: false, reason: 'Skill items work at night' };
      if (!mv && this.costOf(type) > this.cash) return { ok: false, reason: 'Not enough cash' };
      return { ok: true };
    }
    if (this.trapAt(x, y)) return { ok: false, reason: 'Mop is there' };
    if (!mv && this.costOf(type) > this.cash) return { ok: false, reason: 'Not enough cash' };
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
      const hp = (def.hp || SHELF_HP) * this.mods.shelfHp;
      const s = { id: this.nextId++, kind: 'shelf', x, y, v: this.rint(0, 2), units: MAX_STOCK, hp, maxhp: hp, hit: 0, placed: true, cost };
      if (type !== 'shelf') { s.type = type; s.units = def.cap; }
      if (type === 'steel') {   // swallow the 3 shelves underneath: their goods move into the steel shelf
        const w = this.steelWindow(x, y), olds = w.cells.map(([cx, cy]) => this.shelfAt(cx, cy));
        s.units = Math.min(def.cap, olds.reduce((a, o) => a + o.units, 0));
        s.cells = w.cells; s.dir = w.dir; s.x = w.cells[1][0]; s.y = w.cells[1][1];
        this.shelves = this.shelves.filter(o => !olds.includes(o));
      } else if (type === 'statue') {
        s.cells = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s.cells.push([x + dx, y + dy]);
        s.pool = 0; s.tick = 0;
      }
      this.shelves.push(s);
      for (const [cx, cy] of this.cellsOf(s)) this.blocked[idx(cx, cy)] = 3;
      this.refreshPaths(); this.emit('place', { tower: s }); return true;
    }
    const hp = TOWER_HP * this.mods.towerHp;
    const t = { id: this.nextId++, type, kind: def.kind, x, y, level: 1, cd: 0.3, invested: cost, angle: 0, hp, maxhp: hp, wear: 0, broken: null, warned: false, hit: 0 };
    this.towers.push(t); this.blocked[idx(x, y)] = 2;
    this.refreshPaths(); this.emit('place', { tower: t });
    return true;
  }

  // ---------- moving items you already own (free): shelves, machines, turrets, mops. The steel shelf is welded together, so it stays. ----------
  canMoveItem(t) { return !!t && (t.kind === 'tower' || t.kind === 'trap' || (t.kind === 'shelf' && t.placed !== false && t.type !== 'steel')) && this.phase !== 'lost'; }
  canMove(t, x, y) {
    if (!this.canMoveItem(t)) return { ok: false, reason: "Can't be moved" };
    if (t.x === x && t.y === y) return { ok: false, reason: 'Already here' };
    const own = t.kind === 'trap' ? [] : this.cellsOf(t), saved = own.map(([cx, cy]) => this.blocked[idx(cx, cy)]);
    own.forEach(([cx, cy]) => { this.blocked[idx(cx, cy)] = 0; });   // its own cells are free while we test the new spot
    const r = this.canPlace(t.type || 'shelf', x, y, true);
    own.forEach(([cx, cy], i) => { this.blocked[idx(cx, cy)] = saved[i]; });
    return r;
  }
  move(t, x, y) {
    if (!this.canMove(t, x, y).ok) return false;
    if (t.kind === 'trap') { t.x = x; t.y = y; this.emit('move', { tower: t }); return true; }
    for (const [cx, cy] of this.cellsOf(t)) this.blocked[idx(cx, cy)] = 0;
    t.x = x; t.y = y;
    if (t.cells) { t.cells = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) t.cells.push([x + dx, y + dy]); }   // soda statue: 3x3 around its middle
    for (const [cx, cy] of this.cellsOf(t)) this.blocked[idx(cx, cy)] = t.kind === 'shelf' ? 3 : 2;
    this.refreshPaths(); this.emit('move', { tower: t }); return true;
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
      this.shelves = this.shelves.filter(x => x !== t); for (const [cx, cy] of this.cellsOf(t)) this.blocked[idx(cx, cy)] = 0;
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
    if (why !== 'destroyed') { t.fuse = TOWER_FUSE; t.fuseSec = TOWER_FUSE; }   // worn out: fix it before the fuse runs out!
    this.emit('towerBreak', { tower: t, why });
    if (why === 'destroyed') {
      this.towers = this.towers.filter(x => x !== t);
      this.blocked[idx(t.x, t.y)] = 0;
      this.refreshPaths();
      this.emit('sell', { tower: t });   // same event as selling: the view removes the model
    }
  }
  // a machine nobody fixed goes off: hurts burglars AND every machine / shelf close to it, then it is gone
  blastTower(t) {
    t.fuse = null;
    this.towers = this.towers.filter(x => x !== t); this.blocked[idx(t.x, t.y)] = 0;
    for (const e of [...this.enemies]) if (!e.dead && Math.hypot(e.x - t.x, e.y - t.y) <= BLAST_RADIUS) this.damage(e, BLAST_DMG * this.mods.globalDmg, true);
    for (const o of [...this.towers]) if (o.kind === 'tower' && Math.hypot(o.x - t.x, o.y - t.y) <= BLAST_RADIUS + 0.3) this.hurtTower(o, BLAST_ITEM_DMG);
    for (const s of [...this.shelves]) {
      if (this.shelfNear(s, t.x, t.y) > BLAST_RADIUS + 0.3) continue;
      s.hp -= BLAST_ITEM_DMG; s.hit = 0.3;
      if (s.hp <= 0) this.breakShelf(s);
    }
    this.refreshPaths();
    this.emit('explode', { x: t.x, y: t.y, r: BLAST_RADIUS });
    this.emit('towerBlast', { tower: t });
    this.emit('sell', { tower: t });   // the view removes the model
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
    this.cash -= c; t.broken = null; t.fuse = null; t.wear = 0; t.hp = t.maxhp; t.warned = false; t.cd = 0.5;
    this.emit('replace', { tower: t }); return true;
  }

  // ---------- restocking ----------
  restock(sh) {
    const uc = this.unitCostOf(sh), n = Math.min(this.capOf(sh) - sh.units, Math.floor(this.cash / uc));
    if (n <= 0) return false;
    this.cash -= n * uc; sh.units += n;
    this.emit('stock', { shelf: sh, shelves: [sh] }); return true;
  }
  restockCost() { return this.shelves.reduce((a, s) => a + (this.capOf(s) - s.units) * this.unitCostOf(s), 0); }
  // all-or-nothing: it only works when you can afford to refill every shelf (use a single shelf for a partial refill)
  restockAll() {
    const done = [];
    const need = this.restockCost();
    if (need <= 0 || this.cash < need) return false;
    for (const s of [...this.shelves].filter(s => s.units < this.capOf(s)).sort((a, b) => a.units - b.units)) {
      const uc = this.unitCostOf(s), n = Math.min(this.capOf(s) - s.units, Math.floor(this.cash / uc));
      if (n <= 0) break;
      this.cash -= n * uc; s.units += n; done.push(s);
    }
    if (done.length) this.emit('stock', { shelves: done });
    return done.length > 0;
  }

  breakShelf(s) {
    this.shelves = this.shelves.filter(x => x !== s);
    for (const [cx, cy] of this.cellsOf(s)) this.blocked[idx(cx, cy)] = 0;
    this.refreshPaths();
    this.emit('shelfBreak', { shelf: s });
    if (s.type === 'steel') {   // the steel pays you back when it goes down
      const amount = Math.round(s.cost * STEEL_REFUND); this.cash += amount;
      this.emit('refund', { x: s.x, y: s.y, amount });
    } else if (s.type === 'fruit') this.scatterFruit(s);
  }

  // ---------- Fruit basket shelf: the fruit rolls out and goes off one by one ----------
  scatterFruit(s) {
    const n = 3 + Math.ceil(s.units / 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng() * 0.8, r = 0.8 + this.rng() * 1.1;
      let tx = s.x + Math.cos(a) * r, ty = s.y + Math.sin(a) * r;
      tx = Math.max(0, Math.min(COLS - 1, tx)); ty = Math.max(0, Math.min(ROWS - 1, ty));
      this.fruits.push({ id: this.nextId++, x: s.x, y: s.y, sx: s.x, sy: s.y, tx, ty, age: 0, land: 0.45, fuse: 0.95 + i * 0.5 + this.rng() * 0.15, kind: i % 4, r: FRUIT_RADIUS,
        dmg: FRUIT_DMG * this.mods.fruitDmg * this.mods.globalDmg, h: 0 });
    }
    this.emit('fruitScatter', { x: s.x, y: s.y, n });
  }
  stepFruits(dt) {
    for (const f of this.fruits) {
      f.age += dt;
      const k = Math.min(1, f.age / f.land);
      f.x = f.sx + (f.tx - f.sx) * k; f.y = f.sy + (f.ty - f.sy) * k;
      f.h = k < 1 ? Math.sin(k * Math.PI) * 0.9 : 0;
      if (f.age >= f.fuse) {
        f.done = true;
        for (const e of [...this.enemies]) { if (!e.dead && Math.hypot(e.x - f.x, e.y - f.y) <= f.r) this.damage(e, f.dmg); }
        this.emit('fruitBoom', { x: f.x, y: f.y, r: f.r, kind: f.kind });
      }
    }
    this.fruits = this.fruits.filter(f => !f.done);
  }

  // ---------- Soda statue: while it has stock it heals everything damaged in its area ----------
  stepStatues(dt) {
    for (const st of this.shelves) {
      if (st.type !== 'statue' || st.units <= 0) continue;
      st.tick = (st.tick || 0) - dt; if (st.tick > 0) continue;
      st.tick = 0.5;
      const items = [...this.shelves, ...this.towers.filter(t => t.kind === 'tower' && !t.broken)], healed = [];
      for (const o of items) {
        if (o.hp >= o.maxhp - 0.01 || Math.abs(o.x - st.x) > STATUE_RANGE || Math.abs(o.y - st.y) > STATUE_RANGE) continue;
        const add = Math.min(o.maxhp - o.hp, o.maxhp * STATUE_HEAL * 0.5 * this.mods.statueRate);
        o.hp += add; st.pool = (st.pool || 0) + add / this.mods.statueRate; healed.push({ x: o.x, y: o.y });
        if (st.pool >= STATUE_UNIT_HP) { st.pool -= STATUE_UNIT_HP; st.units--; if (st.units <= 0) { this.emit('statueDry', { x: st.x, y: st.y }); break; } }
      }
      if (healed.length) this.emit('repair', { statue: st, items: healed });
    }
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
        const p = this.waveTotal ? Math.max(0, Math.min(1, 1 - left / this.waveTotal)) : 0;
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
    if (this.shelves.some(s => s.units > 0 && this.isStation(s)) || this.towers.some(t => t.kind === 'tower' && !t.broken)) return { ok: true };
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
    for (const s of this.shelves) if (s.units > 0 && this.isStation(s)) add('shelf', s);
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

  // a spot on the sidewalk outside door s: 'out' tiles from the wall, 'off' tiles along it (random side when off is omitted)
  sidewalkPoint(s, out, off) {
    const horiz = s.side === 'bottom', LEN = horiz ? COLS : ROWS;
    if (off === undefined) off = (this.rng() < 0.5 ? -1 : 1) * (2.5 + this.rng() * 2);
    let along = (horiz ? s.x : s.y) + off;
    along = Math.max(-0.6, Math.min(LEN - 0.4, along));
    return horiz ? { x: along, y: s.y + s.oy * out } : { x: s.x + s.ox * out, y: along };
  }

  spawnCustomer(s) {
    const sw = this.sidewalkPoint(s, 2.2);
    const c = {
      id: this.nextId++, kind: 'customer', x: sw.x, y: sw.y, tx: s.x, ty: s.y, state: 'enter', door: s,
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
        const cells = st.kind === 'shelf' ? this.cellsOf(st) : [[st.x, st.y]];
        const path = this.stationAlive(st) ? this.bfs(cx, cy, (x, y) => cells.some(([sx, sy]) => Math.abs(x - sx) + Math.abs(y - sy) === 1)) : null;
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
      let fx = st.x, fy = st.y;   // face the nearest cell of a big shelf
      if (st.kind === 'shelf' && st.cells) { let bd = 1e9; for (const [sx, sy] of st.cells) { const d = Math.hypot(sx - c.x, sy - c.y); if (d < bd) { bd = d; fx = sx; fy = sy; } } }
      c.state = 'browse'; c.timer = 0.8 + this.rng() * 0.8; c.angle = Math.atan2(fx - c.x, fy - c.y);
    } else if (c.next === 'pay') { c.state = 'pay'; c.timer = 0.7 + this.rng() * 0.5; c.angle = Math.PI / 2; }
    else c.state = 'exit';
  }

  buy(c, st) {
    if (!this.stationAlive(st)) return;
    const type = st.kind === 'shelf' ? (st.type || 'shelf') : st.type, def = ITEMS[type];
    if (st.kind === 'shelf') {
      if (st.units <= 0) { this.emit('soldout', { x: st.x, y: st.y }); return; }
      st.units--;
    }
    const price = Math.max(1, Math.round((def.sale[0] + this.rng() * (def.sale[1] - def.sale[0])) * this.mods.shelfPay));
    c.cart += price; c.bags.push(st.kind === 'shelf' ? CAN_COLORS[(st.id + c.bags.length) % CAN_COLORS.length] : ITEMS[type].color);
    this.emit('buy', { c, id: st.id, x: st.x, y: st.y, kind: st.kind === 'shelf' ? 'shelf' : type, price });
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
      case 'enter': {   // walk along the sidewalk to the spot in front of the door, then straight in (never cut across the wall)
        if (!c.apr) c.apr = [this.sidewalkPoint(c.door, 2.2, 0)];
        if (c.apr.length) { if (this.stepMove(c, dt, c.apr[0].x, c.apr[0].y)) c.apr.shift(); break; }
        if (this.stepMove(c, dt, c.door.x, c.door.y)) c.state = 'plan'; break;
      }
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
      case 'exit': {   // out the door, then off along the sidewalk
        if (!c.exitPts) c.exitPts = [this.sidewalkPoint(c.door, 2.2, 0), this.sidewalkPoint(c.door, 2.2, (this.rng() < 0.5 ? -1 : 1) * 4.5)];
        if (this.stepMove(c, dt, c.exitPts[0].x, c.exitPts[0].y)) { c.exitPts.shift(); if (!c.exitPts.length) c.dead = true; } break;
      }
    }
  }

  // ---------- Night: burglars ----------
  // one more wave per night every 10 days (with the tier): days 1-9 have 1 wave, 10-19 have 2, 20-29 have 3 ...
  nightWaves(n) { return 1 + this.tierOf(n); }
  // every 10 days the burglars step up a tier: days 1-9 = tier 0, days 10-19 = tier 1, 20-29 = tier 2 ...
  tierOf(n) { return Math.floor(n / 10); }
  get tier() { return this.tierOf(this.wave + 1); }
  makeWave(n, scale = 1, boss = true) {
    const pool = ['sneak']; if (n >= 3) pool.push('runner'); if (n >= 5) pool.push('vest'); if (n >= 7) pool.push('bruiser');
    if (n >= 4) pool.push('jacket'); if (n >= 6) pool.push('molotov'); if (n >= 8) pool.push('moto'); if (n >= 9) pool.push('bat');
    // endless: grows fast early, then settles into steady growth (enemy HP keeps scaling per night)
    // the amount does NOT grow day by day: it is 6 burglars a night, doubled every 10 days (12 from day 10, 24 from day 20, 48 from day 30 ...)
    const count = Math.max(1, Math.round(6 * Math.pow(2, this.tierOf(n)) * scale));
    const list = [];
    for (let i = 0; i < count; i++) list.push(pool[Math.floor(this.rng() * pool.length)]);
    const bk = boss ? bossForDay(n) : null;
    if (bk) list.splice(Math.floor(list.length * 0.55), 0, bk);   // a boss every 10th night, in the last wave: Bomb Expert, Gunslinger, Riding in Tandem, Door Robber
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

  // at = optional exact start (motor riders jumping off the bike): { x, y, tx, ty, hop }
  spawnEnemy(type, s, at) {
    const def = ENEMIES[type], n = this.wave + 1, out = (type === 'moto' || type === 'motoduo') ? 5.5 : 0.9;
    const tier = this.tierOf(n);
    const st0 = at ? null : (out > 2 ? { x: s.x + s.ox * out, y: s.y + s.oy * out } : this.sidewalkPoint(s, 2.2));   // burglars come along the sidewalk (bikes ride in from the street)
    const hpMul = (def.boss ? 1 + 0.18 * (n - 1) : 1 + 0.15 * (n - 1)) * (1 + 0.35 * tier);   // +35% HP per tier
    const e = {
      id: this.nextId++, type, x: at ? at.x : st0.x, y: at ? at.y : st0.y, hp: def.hp * hpMul, maxhp: def.hp * hpMul,
      speed: def.speed * 0.88 * Math.min(1.5, 1 + 0.06 * tier), push: def.push * (1 + 0.2 * tier), pushT: 0, armor: def.armor + Math.floor((tier + 1) / 2), steal: def.steal, bounty: Math.round(def.bounty * (1 + 0.1 * tier)), tier,   // faster, shove harder, tougher armor, a bit more bounty
      tx: at ? at.tx : s.x, ty: at ? at.ty : s.y, noSlow: !!def.noSlow, burn: 0, burnDps: 0, soak: 0, soakDps: 0, kvx: 0, kvy: 0, slow: 0, slowF: 0, stun: 0, slipped: new Set(), iced: new Set(), angle: 0,
      jitter: (this.rng() - 0.5) * 0.0, route: Math.floor(Math.random() * ROUTES),
      flee: 0, wind: 0, pending: null, dash: null, abCd: def.cd * (0.5 + this.rng() * 0.8) * (1.15 - 0.03 * n), dashMul: def.dashMul || 1,
    };
    e.boss = !!def.boss; e.bk = def.bk || null;
    if (st0) e.apr = [this.sidewalkPoint(s, 2.2, 0)];   // sidewalk first, then in through the door
    if (def.shield) { e.shield = e.shieldMax = e.maxhp * def.shield; }   // Door Robber: the door soaks shots until it breaks
    if (e.bk === 'gunslinger') { e.sumCd = 2.5; e.gunFor = null; e.gunT = 0; }
    if (e.bk === 'gunner') e.gunCd = 0.4 + this.rng() * 0.6;
    if (e.bk === 'motoduo') { e.ms = 'enter'; e.mt = 0; e.mh = Math.atan2(-s.ox, -s.oy); e.angle = e.mh; e.life = 0; e.door = s; e.cycle = 0; e.hitSlow = 0; e.sumCd = 0; e.wp = null; e.wpT = 0; e.pk = null; e.tornDone = false; e.parked = false; e.spin = false; }
    if (e.boss && !at) this.emit('bossSpawn', { enemy: e, info: BOSS_INFO[type] });
    if (type === 'moto') { e.moto = 'ride'; e.mdx = -s.ox; e.mdy = -s.oy; e.angle = Math.atan2(e.mdx, e.mdy); e.door = s; e.crossed = false; }
    if (at && at.hop) { e.hop = { t: 0.5, max: 0.5, sx: at.x, sy: at.y }; e.angle = Math.atan2(at.tx - at.x, at.ty - at.y); e.air = 0; }
    this.enemies.push(e);
    return e;
  }

  // ---------- Combat ----------
  damage(e, dmg, pierce = false) {
    if (e.dead) return;
    let crit = false;
    if (this.mods.crit > 0 && this.rng() < this.mods.crit) { dmg *= 2; crit = true; }
    if (!pierce) dmg = Math.max(1, dmg - e.armor);
    if (e.shield > 0) {   // the shield door tanks it (burning / soaking / swirls go straight through)
      e.shield -= dmg; e.flash = 0.05;
      this.emit('shieldHit', { enemy: e, x: e.x, y: e.y });
      if (e.shield <= 0) {
        const over = -e.shield; e.shield = 0; e.speed *= 1.2; e.abCd = Math.min(e.abCd, 1.5);
        this.emit('shieldBreak', { enemy: e, x: e.x, y: e.y });
        if (over > 0) { e.hp -= over; if (e.hp <= 0) this.kill(e); }
      }
      return;
    }
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
    if (e.type === 'molotov') this.molotovFire(e.x, e.y, 2, true);   // the Molotov robber bursts into a 2x2 fire
    else if (e.type === 'moto') this.motoRiders(e);             // shot off the bike: the two riders still bail out
  }

  progress(e) {
    const cx = Math.min(COLS - 1, Math.max(0, Math.round(e.x))), cy = Math.min(ROWS - 1, Math.max(0, Math.round(e.y)));
    const d = this.dist[idx(cx, cy)];
    return d < 0 ? 999 : d;
  }

  towerFire(t) {
    const range = this.stat(t, 'range'), dmg = this.stat(t, 'dmg');
    if (t.type === 'water') { const hot = this.fireTarget(t, range); if (hot) return this.waterDouse(t, hot, dmg); }   // fires come first
    const inRange = [];
    for (const e of this.enemies) if (!e.dead && e.x > -0.5 && e.y > -0.5 && e.x < COLS - 0.5 && e.y < ROWS - 0.5 && Math.hypot(e.x - t.x, e.y - t.y) <= range) inRange.push(e);
    if (!inRange.length) { if (t.facing !== undefined) t.angle = t.facing; return false; }   // idle: face an open side
    if (t.type === 'tissue') return this.tissueFire(t, inRange, dmg);   // only along its own row / column
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
    const front = vend || ['hotdog', 'fridge', 'gum', 'cola', 'atm', 'water', 'donut', 'cereal'].includes(t.type);   // these dispense from a chute on their front side
    const sx = t.x + (front ? Math.sin(f) * 0.32 : 0), sy = t.y + (front ? Math.cos(f) * 0.32 : 0);
    if (t.type === 'fridge') return this.fridgeFire(t, best, dmg, sx, sy);
    if (t.type === 'water') return this.waterFire(t, inRange, dmg, sx, sy);
    if (t.type === 'donut') return this.donutFire(t, inRange, dmg, sx, sy);
    if (t.type === 'cereal') return this.cerealFire(t, inRange, dmg, sx, sy);
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

  chill(e, f, time) { if (e.noSlow) return; e.slow = Math.max(e.slow, time); e.slowF = Math.max(e.slowF, Math.min(0.85, f)); }
  freeze(e, patch) {
    if (e.dead) return;
    if (patch) { if (e.iced.has(patch.id)) return; e.iced.add(patch.id); }
    if (e.noSlow) { this.emit('immune', { enemy: e }); return; }   // the puffer jacket shrugs off the cold
    e.stun = Math.max(e.stun, e.boss ? 0.5 : 1.2);
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
        if (!e.noSlow) { e.slow = def.slowTime; e.slowF = Math.min(0.85, def.slow + this.mods.slow); }
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
      this.shove(e, nx, ny, def.push * (1 - 0.5 * d / def.radius) * (e.boss ? 0.35 : 1), 9);
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
    if (e.bk === 'motoduo') { e.kvx = 0; e.kvy = 0; return; }   // a motorbike doesn't get shoved
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
      this.shove(o, p.dx, p.dy, def.push * (this.mods.push ?? 1) * (o.boss ? 0.3 : 1));
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

  // ---------- Water Dispenser: 3 slow lobbed drops, each one an AoE splash ----------
  waterFire(t, inRange, dmg, sx, sy) {
    const def = ITEMS.water, n = def.count + this.mods.waterExtra, sp = 4.4;
    const sorted = [...inRange].sort((a, b) => this.progress(a) - this.progress(b));
    for (let i = 0; i < n; i++) {
      const e = sorted[i % sorted.length], delay = i * 0.3, fl = Math.hypot(e.x - sx, e.y - sy) / sp + delay;
      let lx = e.x, ly = e.y;
      const mdx = e.tx - e.x, mdy = e.ty - e.y, md = Math.hypot(mdx, mdy);
      if (md > 0.01 && e.stun <= 0) { const mv = Math.min(md, e.speed * (e.slow > 0 ? 1 - e.slowF : 1) * fl); lx += mdx / md * mv; ly += mdy / md * mv; }
      if (i >= sorted.length) { lx += (this.rng() - 0.5) * 1.1; ly += (this.rng() - 0.5) * 1.1; }   // more drops than burglars: spread them around
      lx = Math.max(0, Math.min(COLS - 1, lx)); ly = Math.max(0, Math.min(ROWS - 1, ly));
      this.projectiles.push({ id: this.nextId++, kind: 'water', lob: true, arc: 1.5, x: sx, y: sy, h: 1.0, h0: 1.0, sx, sy, d0: Math.max(0.3, Math.hypot(lx - sx, ly - sy)),
        target: null, tx: lx, ty: ly, speed: sp, dmg, level: t.level, dx: 0, dy: 0, delay });
    }
    this.emit('shoot', { tower: t });
    return true;
  }
  // the Water Dispenser puts out enemy fire before it does anything else: burning patches first, then burning items
  fireTarget(t, range) {
    let best = null, bs = -1;
    for (const f of this.fires) {
      if (!f.foe || f.t <= 0) continue;
      const d = Math.hypot(f.x - t.x, f.y - t.y); if (d > range) continue;
      const sc = 100 + this.fireItems(f.x, f.y, f.half).length * 10 - d; if (sc > bs) { bs = sc; best = { x: f.x, y: f.y }; }
    }
    if (best) return best;
    for (const it of [...this.towers.filter(x => x.kind === 'tower'), ...this.shelves]) {
      if (!(it.burning > 0)) continue;
      const d = Math.hypot(it.x - t.x, it.y - t.y); if (d > range) continue;
      if (bs < 0 || d < bs) { bs = d; best = { x: it.x, y: it.y }; }
    }
    return best;
  }
  waterDouse(t, hot, dmg) {
    const def = ITEMS.water, n = def.count + this.mods.waterExtra, sp = 4.4, f = t.facing || 0;
    const sx = t.x + Math.sin(f) * 0.32, sy = t.y + Math.cos(f) * 0.32;
    t.angle = Math.atan2(hot.x - t.x, hot.y - t.y);
    for (let i = 0; i < n; i++) {
      const lx = hot.x + (i ? (this.rng() - 0.5) * 0.9 : 0), ly = hot.y + (i ? (this.rng() - 0.5) * 0.9 : 0), delay = i * 0.25;
      this.projectiles.push({ id: this.nextId++, kind: 'water', lob: true, arc: 1.5, x: sx, y: sy, h: 1.0, h0: 1.0, sx, sy, d0: Math.max(0.3, Math.hypot(lx - sx, ly - sy)),
        target: null, tx: lx, ty: ly, speed: sp, dmg, level: t.level, dx: 0, dy: 0, delay });
    }
    this.emit('shoot', { tower: t });
    return true;
  }
  waterSplash(p) {
    const def = ITEMS.water, r = def.splash * this.mods.waterR;
    for (const f of this.fires) if (f.foe && Math.hypot(f.x - p.tx, f.y - p.ty) <= r + f.half) f.t -= 1.4;   // every drop soaks the patch
    for (const it of [...this.towers.filter(x => x.kind === 'tower'), ...this.shelves]) if (it.burning > 0 && Math.hypot(it.x - p.tx, it.y - p.ty) <= r + 0.6) { it.burning = 0; it.burnMul = 1; }
    for (const e of this.enemies) {
      if (e.dead || Math.hypot(e.x - p.tx, e.y - p.ty) > r) continue;
      this.damage(e, p.dmg);
      if (!e.dead) this.chill(e, def.slow, def.slowTime);
    }
    this.emit('waterSplash', { x: p.tx, y: p.ty, r });
  }

  // ---------- Donut Tray: 2 boomerang donuts ----------
  donutFire(t, inRange, dmg, sx, sy) {
    const def = ITEMS.donut, n = def.count + this.mods.donutExtra;
    const sorted = [...inRange].sort((a, b) => this.progress(a) - this.progress(b));
    for (let i = 0; i < n; i++) {
      const e = sorted[Math.min(i, sorted.length - 1)];
      this.donuts.push({ id: this.nextId++, kind: 'donut', tower: t, x: sx, y: sy, sx, sy, h: 0.62, target: e, tx: e.x, ty: e.y, speed: def.speed, dmg, back: def.back,
        phase: 'out', delay: i * 0.3, age: 0, hit: new Set(), dx: 0, dy: 1, side: i % 2 ? -1 : 1, k: 0, len: 1, bx: 0, by: 0 });
    }
    this.emit('shoot', { tower: t });
    return true;
  }
  stepDonuts(dt) {
    for (const d of this.donuts) {
      const tw = d.tower;
      if (!this.towers.includes(tw) || tw.broken) { d.done = true; continue; }
      const f = tw.facing || 0, hx = tw.x + Math.sin(f) * 0.32, hy = tw.y + Math.cos(f) * 0.32;   // the tray's chute
      if (d.delay > 0) { d.delay -= dt; d.x = hx; d.y = hy; d.h = 0.62; continue; }   // waiting inside the tray
      d.age += dt; d.h = 0.62 + Math.sin(d.age * 6) * 0.04;
      if (d.age > 5) { d.done = true; continue; }
      const strike = (r, mul) => {
        for (const e of this.enemies) {
          if (e.dead || d.hit.has(e.id) || e.x < -0.5 || e.y < -0.5 || e.x > COLS - 0.5 || e.y > ROWS - 0.5) continue;
          if (Math.hypot(e.x - d.x, e.y - d.y) <= r) { d.hit.add(e.id); this.damage(e, d.dmg * mul); this.emit('donutHit', { x: d.x, y: d.y, h: d.h }); return true; }
        }
        return false;
      };
      if (d.phase === 'out') {
        const tg = d.target && !d.target.dead ? d.target : null;
        if (tg) { d.tx = tg.x; d.ty = tg.y; }
        const dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.hypot(dx, dy), mv = d.speed * dt;
        if (dist > 0.001) { d.dx = dx / dist; d.dy = dy / dist; }
        let turn = false;
        if (dist <= mv + 0.05) { d.x = d.tx; d.y = d.ty; strike(0.6, 1); turn = true; }   // reached the target (or where it died)
        else { d.x += dx / dist * mv; d.y += dy / dist * mv; if (strike(0.4, 1)) turn = true; }   // anything in the way stops it too
        if (turn) { d.phase = 'back'; d.bx = d.x; d.by = d.y; d.k = 0; d.len = Math.max(0.5, Math.hypot(hx - d.x, hy - d.y)); d.hit = new Set(); }
      } else {   // boomerang: curve back to the tray, hitting whatever is on the way
        d.k = Math.min(1, d.k + d.speed * 1.05 * dt / d.len);
        const px = -(hy - d.by), py = hx - d.bx, pl = Math.hypot(px, py) || 1, bulge = Math.sin(d.k * Math.PI) * 0.7 * d.side;
        const nx = d.bx + (hx - d.bx) * d.k + px / pl * bulge, ny = d.by + (hy - d.by) * d.k + py / pl * bulge;
        if (Math.hypot(nx - d.x, ny - d.y) > 0.001) { d.dx = nx - d.x; d.dy = ny - d.y; }
        d.x = nx; d.y = ny;
        strike(0.4, d.back);
        if (d.k >= 1) { d.done = true; this.emit('donutCatch', { tower: tw }); }
      }
    }
    this.donuts = this.donuts.filter(d => !d.done);
  }

  // ---------- Cereal Shelf: lobs a box that lands as a temporary wall ----------
  boxCellOk(x, y, pending) {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS && !this.reserved(x, y) && this.blocked[idx(x, y)] === 0 && !this.isTill(x, y)
      && !this.spawns.some(s => s.x === x && s.y === y) && !(pending && pending.has(x + ',' + y));
  }
  // a free cell on the burglar's way, a little ahead of where it is walking
  cerealCell(e, pending) {
    const fld = (this.flows && this.flows[e.route]) || this.dist, cand = [];
    let cx = e.tx, cy = e.ty;
    for (let k = 0; k < 4; k++) {
      let best = null, bd = fld[idx(cx, cy)];
      for (const [ox, oy] of NB) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = idx(nx, ny), dd = fld[j];
        if (dd < 0 || this.blocked[j] === 1 || this.blocked[j] === 2) continue;
        if (dd < bd) { bd = dd; best = [nx, ny]; }
      }
      if (!best) break;
      cx = best[0]; cy = best[1]; cand.push([cx, cy]);
    }
    for (const [x, y] of cand) if (this.boxCellOk(x, y, pending)) return { x, y };
    if (this.boxCellOk(e.tx, e.ty, pending) && Math.hypot(e.x - e.tx, e.y - e.ty) > 0.5) return { x: e.tx, y: e.ty };
    return null;
  }
  cerealFire(t, inRange, dmg, sx, sy) {
    const pending = new Set(this.projectiles.filter(p => p.kind === 'cereal').map(p => Math.round(p.tx) + ',' + Math.round(p.ty)));
    const sorted = [...inRange].sort((a, b) => this.progress(a) - this.progress(b));
    for (const e of sorted) {
      const c = this.cerealCell(e, pending); if (!c) continue;
      this.projectiles.push({ id: this.nextId++, kind: 'cereal', lob: true, arc: 1.6, x: sx, y: sy, h: 1.2, h0: 1.2, sx, sy, d0: Math.max(0.3, Math.hypot(c.x - sx, c.y - sy)),
        target: null, tx: c.x, ty: c.y, speed: 3.6, dmg, level: t.level, dx: 0, dy: 0, variant: Math.floor(this.rng() * 4) });
      this.emit('shoot', { tower: t });
      return true;
    }
    return false;   // nowhere useful to drop a box right now
  }
  cerealLand(p) {
    const def = ITEMS.cereal, cx = Math.round(p.tx), cy = Math.round(p.ty);
    for (const e of [...this.enemies]) {   // the falling box bonks anyone under it (full damage + stun) and shakes those near it (half)
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.tx, e.y - p.ty);
      if (d <= 0.75) { this.damage(e, p.dmg); if (!e.dead) e.stun = Math.max(e.stun, 0.45); }
      else if (d <= 1.3) this.damage(e, p.dmg * 0.5);
    }
    if (!this.boxCellOk(cx, cy)) { this.emit('cerealPoof', { x: p.tx, y: p.ty }); return; }
    const life = def.boxLife + this.mods.boxLife, hp = def.boxHp * this.mods.boxHp;
    const s = { id: this.nextId++, kind: 'shelf', type: 'cerealbox', x: cx, y: cy, v: p.variant || 0, units: 0, hp, maxhp: hp, hit: 0, placed: false, cost: 0, ttl: life, ttlMax: life, age: 0 };
    this.shelves.push(s); this.blocked[idx(cx, cy)] = 3;
    for (const e of this.enemies) {   // burglars that were walking INTO this cell turn back to the cell they are in
      if (e.dead || e.tx !== cx || e.ty !== cy || Math.hypot(e.x - cx, e.y - cy) <= 0.45) continue;
      e.tx = Math.max(0, Math.min(COLS - 1, Math.round(e.x))); e.ty = Math.max(0, Math.min(ROWS - 1, Math.round(e.y)));
    }
    this.refreshPaths();
    this.emit('cerealLand', { shelf: s });
  }
  stepBoxes(dt) {
    for (const s of [...this.shelves]) {
      if (s.ttl === undefined) continue;
      s.ttl -= dt; s.age = (s.age || 0) + dt;
      if (s.ttl <= 0) this.expireBox(s);
    }
  }
  expireBox(s) {
    this.shelves = this.shelves.filter(x => x !== s);
    this.blocked[idx(s.x, s.y)] = 0;
    this.refreshPaths();
    this.emit('boxGone', { shelf: s });
  }

  // ---------- Tissue Dispenser: only shoots along its own row / column, the roll pierces everyone ----------
  tissueFire(t, inRange, dmg) {
    const LANE = 0.55, dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], score = [0, 0, 0, 0];
    for (const e of inRange) {
      const dx = e.x - t.x, dy = e.y - t.y;
      for (let i = 0; i < 4; i++) {
        const [ox, oy] = dirs[i], along = dx * ox + dy * oy, side = Math.abs(dx * oy - dy * ox);
        if (along > 0.3 && side <= LANE) score[i] += 1 + 0.001 / (1 + this.progress(e));
      }
    }
    let bi = -1, bs = 0; for (let i = 0; i < 4; i++) if (score[i] > bs) { bs = score[i]; bi = i; }
    if (bi < 0) { if (t.facing !== undefined) t.angle = t.facing; return false; }   // nobody on its lane: stay quiet
    const [ox, oy] = dirs[bi], def = ITEMS.tissue, range = this.stat(t, 'range');
    t.angle = Math.atan2(ox, oy);
    this.rolls.push({ id: this.nextId++, kind: 'tissue', x: t.x + ox * 0.35, y: t.y + oy * 0.35, dx: ox, dy: oy, sx: t.x + ox * 0.35, sy: t.y + oy * 0.35, dist: 0, max: range, speed: def.speed, dmg, hit: new Set(), n: 0 });
    this.emit('shoot', { tower: t });
    return true;
  }
  stepRolls(dt) {
    const def = ITEMS.tissue;
    for (const r of this.rolls) {
      const mv = r.speed * dt; r.x += r.dx * mv; r.y += r.dy * mv; r.dist += mv;
      for (const e of this.enemies) {
        if (e.dead || r.hit.has(e.id)) continue;
        const rx = e.x - r.x, ry = e.y - r.y, along = rx * r.dx + ry * r.dy, side = Math.abs(rx * r.dy - ry * r.dx);
        if (side > 0.5 || Math.abs(along) > 0.5) continue;
        r.hit.add(e.id); this.damage(e, r.dmg * Math.pow(0.97, r.n)); r.n++;
        if (!e.dead) this.chill(e, def.chill, def.chillTime);
        this.emit('tissueHit', { x: e.x, y: e.y });
      }
      if (r.dist >= r.max || r.x < -0.8 || r.y < -0.8 || r.x > COLS - 0.2 || r.y > ROWS - 0.2) {
        r.done = true;   // end of the lane / end of the room: the paper scatters and leaves a trail
        this.emit('tissueEnd', { sx: r.sx, sy: r.sy, x: Math.max(0, Math.min(COLS - 1, r.x)), y: Math.max(0, Math.min(ROWS - 1, r.y)), dx: r.dx, dy: r.dy });
      }
    }
    this.rolls = this.rolls.filter(r => !r.done);
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
    if (p.kind === 'water') { this.waterSplash(p); return; }
    if (p.kind === 'cereal') { this.cerealLand(p); return; }
    if (p.kind === 'sauce') { this.sauceSplash(p.tx, p.ty, p); return; }
    if (p.kind === 'bomb') { this.plantBomb(p.tx, p.ty); return; }
    if (p.kind === 'molo') { this.molotovFire(p.tx, p.ty, 2); return; }
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
      if (this.rng() < def.panic * (e.boss ? 0.3 : 1)) {   // burning burglars may panic and run back toward the door
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
      if (this.shelfNear(s, b.x, b.y) > b.r + 0.3) continue;
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
  // ---------- Molotov: fire patches that burn shelves and machines (not burglars) ----------
  throwMolotov(e, tx, ty) {
    const d0 = Math.max(0.5, Math.hypot(tx - e.x, ty - e.y));
    this.projectiles.push({ id: this.nextId++, kind: 'molo', lob: true, arc: 1.4, x: e.x, y: e.y, h: 0.9, h0: 0.9, sx: e.x, sy: e.y, d0, target: null, tx, ty, speed: 4.2, dmg: 0, level: 1, dx: 0, dy: 0 });
    this.emit('throw', { enemy: e, kind: 'molo' });
  }
  // shelves / machines whose cells sit inside a square patch centred on (cx, cy)
  fireItems(cx, cy, half) {
    const out = [];
    for (const t of this.towers) if (t.kind === 'tower' && !t.broken && Math.abs(t.x - cx) < half && Math.abs(t.y - cy) < half) out.push(t);
    for (const s of this.shelves) if (this.cellsOf(s).some(([x, y]) => Math.abs(x - cx) < half && Math.abs(y - cy) < half)) out.push(s);
    return out;
  }
  // size = patch width in cells (2 = 2x2, 3 = 3x3). If it lands on an item it feeds on it: one size bigger, hotter and longer.
  molotovFire(x, y, size, fixed = false) {   // fixed: stay exactly this size (the burst when a Molotov robber dies)
    const snap = sz => sz % 2 === 1 ? [Math.round(x), Math.round(y)] : [Math.floor(x) + 0.5, Math.floor(y) + 0.5];
    let [cx, cy] = snap(size), items = this.fireItems(cx, cy, size / 2);
    const fueled = items.length > 0;
    if (fueled && size < 3 && !fixed) { size += 1; [cx, cy] = snap(size); items = this.fireItems(cx, cy, size / 2); }
    if (this.fires.filter(f => f.foe).length < FIRE_MAX) {
      this.fires.push({ id: this.nextId++, x: cx, y: cy, r: size / 2, half: size / 2, size, foe: true, fueled, t: MOLO_TIME * (fueled ? 1.2 : 1), max: MOLO_TIME * (fueled ? 1.2 : 1), dps: 0, tick: 0 });
    }
    for (const it of items) this.igniteItem(it, fueled ? 1.3 : 1);
    this.emit('molotovSplash', { x: cx, y: cy, r: size / 2, size, fueled });
  }
  igniteItem(it, mul) { it.burning = 1.5; it.burnMul = Math.max(it.burnMul || 1, mul); }
  burnItem(it) {
    const dmg = FIRE_ITEM_DPS * 0.5 * (it.burnMul || 1);
    if (it.kind === 'tower') {
      if (it.broken) return;
      it.hp -= dmg; it.hit = 0.25;
      if (it.hp <= 0) { it.hp = 0; this.breakTower(it, 'destroyed'); }
    } else { it.hp -= dmg; it.hit = 0.2; if (it.hp <= 0) this.breakShelf(it); }
  }
  stepFoeFires(dt) {
    for (const f of this.fires) {   // a patch keeps lighting whatever stands in it
      if (!f.foe) continue;
      f.tick += dt;
      if (f.tick >= 0.5) { f.tick -= 0.5; for (const it of this.fireItems(f.x, f.y, f.half)) this.igniteItem(it, f.fueled ? 1.3 : 1); }
    }
    for (const it of [...this.towers.filter(t => t.kind === 'tower'), ...this.shelves]) {   // burning items take damage and the flames creep to a neighbour
      if (!(it.burning > 0)) continue;
      it.burning -= dt; it.bt = (it.bt || 0) + dt;
      if (it.burning <= 0) { it.burnMul = 1; continue; }
      if (it.bt < 0.5) continue;
      it.bt -= 0.5; this.burnItem(it);
      if (this.rng() < 0.07 * (it.burnMul || 1)) {
        const [ox, oy] = NB[Math.floor(this.rng() * 4)], nx = it.x + ox, ny = it.y + oy;
        if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && !this.reserved(nx, ny)) this.molotovFire(nx, ny, 2);
      }
    }
  }

  // ---------- Bat: swats away shots that are about to hit it, smashes the closest item ----------
  tryDeflect(p) {
    const e = p.target;
    if (!e || e.dead || e.type !== 'bat' || p.lob || p.kind === 'bomb' || p.kind === 'molo') return false;
    if (e.stun > 0 || e.wind > 0 || e.dash || this.rng() > DEFLECT_CHANCE) return false;
    e.swing = 0.3; e.angle = Math.atan2(-(p.dx || 0), -(p.dy || 0)) + Math.PI;
    this.emit('deflect', { enemy: e, x: e.x, y: e.y, dx: -(p.dx || 0), dy: -(p.dy || 0), kind: p.kind });
    return true;
  }
  smashTarget(e) {
    let best = null, bd = 1.7;
    for (const t of this.towers) if (t.kind === 'tower' && !t.broken) { const d = Math.hypot(t.x - e.x, t.y - e.y); if (d < bd) { bd = d; best = t; } }
    for (const s of this.shelves) { const d = this.shelfNear(s, e.x, e.y); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  smash(e, tgt) {
    e.swing = 0.3;
    const alive = tgt.kind === 'tower' ? this.towers.includes(tgt) && !tgt.broken : this.shelves.includes(tgt);
    if (!alive) return;
    const dmg = SMASH_DMG * (e.dashMul || 1);
    if (tgt.kind === 'tower') this.hurtTower(tgt, dmg); else { tgt.hp -= dmg; tgt.hit = 0.25; if (tgt.hp <= 0) this.breakShelf(tgt); }
    this.emit('smash', { enemy: e, x: tgt.x, y: tgt.y, kind: tgt.kind === 'tower' ? 2 : 3 });
    e.stun = Math.max(e.stun, 0.25);
  }

  // ---------- Motor bandit: rides in from outside, smashes through the door, crashes into the first item, riders jump off ----------
  onDoorWall(x, y) { const s = this.doorSide; return (s === 'left' && x === 0) || (s === 'right' && x === COLS - 1) || (s === 'top' && y === 0) || (s === 'bottom' && y === ROWS - 1); }
  motoStep(e, dt) {
    if (e.moto === 'crash') { e.crashT -= dt; if (e.crashT <= 0) { this.motoRiders(e); e.dead = true; } return; }
    let move = 11 * dt;
    while (move > 0 && e.moto === 'ride') {
      const st = Math.min(0.25, move); move -= st;
      const nx = e.x + e.mdx * st, ny = e.y + e.mdy * st, cx = Math.round(nx), cy = Math.round(ny);
      if (!e.crossed && (nx - e.door.x) * e.mdx + (ny - e.door.y) * e.mdy >= 0) { e.crossed = true; this.emit('doorCrash', { x: e.door.x, y: e.door.y, side: e.door.side }); }
      const inside = cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS;
      const wall = inside && this.reserved(cx, cy) && !this.onDoorWall(cx, cy);
      const item = inside && !this.reserved(cx, cy) && this.blocked[idx(cx, cy)] !== 0;
      const out = !inside && e.crossed;
      if (wall || item || out) {
        const px = Math.min(COLS - 1, Math.max(0, Math.round(e.x))), py = Math.min(ROWS - 1, Math.max(0, Math.round(e.y)));
        e.x = e.tx = px; e.y = e.ty = py;
        let kind = 0;
        if (item) {
          const t = this.towerAt(cx, cy), sh = this.shelfAt(cx, cy);
          if (t && t.kind === 'tower') { this.hurtTower(t, MOTO_DMG); kind = 2; }
          else if (sh) { sh.hp -= MOTO_DMG; sh.hit = 0.3; kind = 3; if (sh.hp <= 0) this.breakShelf(sh); }
        }
        e.moto = 'crash'; e.crashT = 0.9;
        this.emit('motoCrash', { x: item || wall ? cx : px, y: item || wall ? cy : py, ex: px, ey: py, kind });
        return;
      }
      e.x = nx; e.y = ny;
    }
  }
  motoRiders(e) {
    if (e.ridersOut) return; e.ridersOut = true;
    const cx = Math.min(COLS - 1, Math.max(0, Math.round(e.x))), cy = Math.min(ROWS - 1, Math.max(0, Math.round(e.y)));
    const ok = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !this.reserved(x, y) && this.blocked[idx(x, y)] === 0 && !this.isTill(x, y);
    const cand = [];
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) if (ok(cx + dx, cy + dy)) cand.push([cx + dx, cy + dy]);
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    for (let i = 0; i < 2; i++) {
      const c = cand.length ? cand[i % cand.length] : [e.door.x, e.door.y];
      this.spawnEnemy(this.rng() < 0.6 ? 'sneak' : 'runner', e.door, { x: cx, y: cy, tx: c[0], ty: c[1], hop: true });
    }
    this.emit('riders', { x: cx, y: cy });
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
    if (e.bk === 'doorrobber') {   // floor slam: marks a 3x3 and brings the door down on it
      e.abCd = def.cd * (0.8 + this.rng() * 0.5) * Math.pow(0.92, this.tierOf(n)) * (e.shield > 0 ? 1 : 0.7);
      const c = this.slamTarget(e); if (!c) { e.abCd = 1.2; return false; }
      e.pending = { kind: 'slam', cx: c.x, cy: c.y }; e.angle = Math.atan2(c.x - e.x, c.y - e.y); e.wind = 0.95;
      this.emit('slamWarn', { x: c.x, y: c.y, t: e.wind, enemy: e });
      this.emit('windup', { enemy: e, kind: 'slam' }); return true;
    }
    // bombers are rare early on and get more common every night (none before night 4)
    const bombMul = n < 4 ? 0 : Math.min(2.2, 0.2 + (n - 4) * 0.22);
    const wb = (def.abil.bomb || 0) * bombMul, wd = def.abil.dash || 0, wm = def.abil.molo || 0, ws = def.abil.smash || 0, tot = wb + wd + wm + ws;
    e.abCd = def.cd * (1.15 - 0.03 * n) * (0.7 + this.rng() * 0.7) * Math.pow(0.92, this.tierOf(n));   // tricks come 8% sooner per tier
    if (tot <= 0 || this.rng() > 0.75) return false;
    let r = this.rng() * tot;
    if (r < wb) {
      const tgt = this.bombTarget(e);
      if (!tgt) { e.abCd = 1.5; return false; }
      e.pending = { kind: 'bomb', tx: tgt.x + (this.rng() - 0.5) * 0.7, ty: tgt.y + (this.rng() - 0.5) * 0.7 };
      e.angle = Math.atan2(tgt.x - e.x, tgt.y - e.y); e.wind = 0.55;
    } else if ((r -= wb) < wm) {                       // molotov
      const tgt = this.bombTarget(e);
      if (!tgt) { e.abCd = 1.5; return false; }
      e.pending = { kind: 'molo', tx: tgt.x + (this.rng() - 0.5) * 0.7, ty: tgt.y + (this.rng() - 0.5) * 0.7 };
      e.angle = Math.atan2(tgt.x - e.x, tgt.y - e.y); e.wind = 0.6;
    } else if ((r -= wm) < ws) {                       // bat swing at the closest item
      const tgt = this.smashTarget(e);
      if (!tgt) { e.abCd = 0.8; return false; }
      e.pending = { kind: 'smash', tgt };
      e.angle = Math.atan2(tgt.x - e.x, tgt.y - e.y); e.wind = 0.5;
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
    else if (p.kind === 'molo') this.throwMolotov(e, p.tx, p.ty);
    else if (p.kind === 'smash') this.smash(e, p.tgt);
    else if (p.kind === 'slam') this.slam(e, p.cx, p.cy);
    else if (p.kind === 'summon') this.summonGunners(e, p.n);
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


  // ================= BOSSES =================
  // returns true when the boss is busy (the normal walk is skipped this frame)
  bossAct(e, dt) {
    switch (e.bk) {
      case 'gunner': return this.gunnerAct(e, dt);
      case 'gunslinger': {
        if (e.wind > 0) return false;
        e.sumCd -= dt;
        if (e.sumCd <= 0) {
          const alive = this.enemies.filter(o => !o.dead && o.owner === e.id).length, n = Math.min(3, 6 - alive);
          e.sumCd = n > 0 ? 18 : 3;
          if (n > 0) { e.pending = { kind: 'summon', n }; e.wind = 0.8; e.angle = Math.PI; this.emit('windup', { enemy: e, kind: 'summon' }); return true; }
        }
        return false;
      }
      case 'motoduo': this.motoBoss(e, dt); return true;
    }
    return false;
  }
  freeCellsAround(cx, cy) {
    const ok = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !this.reserved(x, y) && this.blocked[idx(x, y)] === 0 && !this.isTill(x, y);
    const cand = [];
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) if (ok(cx + dx, cy + dy)) cand.push([cx + dx, cy + dy]);
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    return cand;
  }
  // ---------- Gunslinger ----------
  // whatever blocks his way (a shelf, a cereal box, a fence...) is shot: one shotgun blast, guaranteed destroyed
  gunslingerBlast(e, sh, dt) {
    if (e.gunFor !== sh) { e.gunFor = sh; e.gunT = 0.45; this.emit('aim', { enemy: e, x: sh.x, y: sh.y }); }
    e.pushing = sh; e.angle = Math.atan2(sh.x - e.x, sh.y - e.y);
    e.gunT -= dt;
    if (e.gunT > 0) return;
    this.emit('shotgun', { enemy: e, x: e.x, y: e.y, tx: sh.x, ty: sh.y });
    if (this.shelves.includes(sh)) { sh.hp = 0; this.breakShelf(sh); }
    e.gunFor = null; e.pushing = null; e.stun = Math.max(e.stun, 0.3);
  }
  summonGunners(e, n) {
    const cells = this.freeCellsAround(Math.round(e.x), Math.round(e.y));
    for (let i = 0; i < n; i++) {
      const c = cells.length ? cells[i % cells.length] : [e.tx, e.ty];
      const g = this.spawnEnemy('gunner', this.activeSpawns[0] || this.spawns[0], { x: e.x, y: e.y, tx: c[0], ty: c[1], hop: true });
      g.owner = e.id;
    }
    this.emit('summon', { enemy: e, x: e.x, y: e.y, label: 'GUNNERS!' });
  }
  // gunners run fast and shoot any machine close to them
  gunnerAct(e, dt) {
    e.gunCd -= dt;
    if (e.gunCd > 0 || e.hop || e.stun > 0) return false;
    let best = null, bd = GUNNER_RANGE;
    for (const t of this.towers) { if (t.kind !== 'tower' || t.broken) continue; const d = Math.hypot(t.x - e.x, t.y - e.y); if (d < bd) { bd = d; best = t; } }
    if (!best) { e.gunCd = 0.2; return false; }
    e.gunCd = 1.0 + this.rng() * 0.4;
    this.emit('gunShot', { enemy: e, x: e.x, y: e.y, tx: best.x, ty: best.y });
    this.hurtTower(best, GUNNER_DMG);
    return false;   // and keeps running
  }
  // ---------- Door Robber ----------
  // the 3x3 that covers the most machines / shelves near him (center cell)
  slamTarget(e) {
    const items = [...this.towers.filter(t => t.kind === 'tower' && !t.broken), ...this.shelves];
    let best = null, bs = 0;
    for (const it of items) {
      if (this.shelfNear(it, e.x, e.y) > 3.2 && Math.hypot(it.x - e.x, it.y - e.y) > 3.2) continue;
      const cx = Math.max(1, Math.min(COLS - 2, it.x)), cy = Math.max(1, Math.min(ROWS - 2, it.y));
      let n = 0;
      for (const o of items) if (this.cellsOf(o).some(([x, y]) => Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1)) n++;
      const sc = n * 10 - Math.hypot(cx - e.x, cy - e.y);
      if (sc > bs || !best) { bs = sc; best = { x: cx, y: cy }; }
    }
    return best;
  }
  slam(e, cx, cy) {
    const inBox = (x, y) => Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1;
    for (const t of [...this.towers]) if (t.kind === 'tower' && !t.broken && inBox(t.x, t.y)) this.hurtTower(t, SLAM_DMG);
    for (const s of [...this.shelves]) if (this.cellsOf(s).some(([x, y]) => inBox(x, y))) { s.hp -= SLAM_DMG; s.hit = 0.3; if (s.hp <= 0) this.breakShelf(s); }
    for (const tr of [...this.traps]) if (inBox(tr.x, tr.y)) { this.traps = this.traps.filter(x => x !== tr); this.emit('trapGone', { trap: tr }); }
    this.refreshPaths();
    this.emit('slam', { enemy: e, x: cx, y: cy });
    e.stun = Math.max(e.stun, 0.6);
  }
  // ---------- Riding in Tandem ----------
  roamBounds() {
    const B = { x0: 0, y0: 0, x1: COLS - 1, y1: ROWS - 1 };
    for (const sd of [this.counterSide, this.doorSide]) { if (sd === 'left') B.x0 = 1; else if (sd === 'right') B.x1 = COLS - 2; else if (sd === 'top') B.y0 = 1; else B.y1 = ROWS - 2; }
    return B;
  }
  motoSteer(e, tx, ty, dt, turn, sp) {
    let d = Math.atan2(tx - e.x, ty - e.y) - e.mh; d = Math.atan2(Math.sin(d), Math.cos(d));
    e.mh += Math.max(-turn * dt, Math.min(turn * dt, d));
    e.x += Math.sin(e.mh) * sp * dt; e.y += Math.cos(e.mh) * sp * dt; e.angle = e.mh;
  }
  // everything the bike touches is destroyed: machines, shelves, cereal boxes, mops
  motoSmash(e) {
    const pts = [[e.x, e.y], [e.x + Math.sin(e.mh) * 0.55, e.y + Math.cos(e.mh) * 0.55]];
    if (!e.smashMem) e.smashMem = {};
    for (const [px, py] of pts) {
      const cx = Math.round(px), cy = Math.round(py);
      if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS || this.reserved(cx, cy)) continue;
      const b = this.blocked[idx(cx, cy)];
      if (b !== 2 && b !== 3) continue;
      const key = cx + ',' + cy;
      if (e.smashMem[key] !== undefined && e.life - e.smashMem[key] < 4) continue;   // already rolled for this tile: roll again only after a few seconds
      e.smashMem[key] = e.life;
      if (this.rng() >= MOTODUO_SMASH) { e.hitSlow = 0.15; continue; }               // it clips the item and swerves on: nothing breaks
      if (b === 2) { const t = this.towerAt(cx, cy); if (t) { t.hp = 0; t.broken = null; this.breakTower(t, 'destroyed'); } }
      else { const sh = this.shelfAt(cx, cy); if (sh) this.breakShelf(sh); }
      this.emit('bossSmash', { enemy: e, x: cx, y: cy }); e.hitSlow = 0.3;
    }
    for (const tr of [...this.traps]) if (Math.hypot(tr.x - e.x, tr.y - e.y) < 0.6) { this.traps = this.traps.filter(x => x !== tr); this.emit('trapGone', { trap: tr }); }
  }
  motoWaypoint(e, B) {
    const items = [...this.towers.filter(t => t.kind === 'tower'), ...this.shelves];
    if (items.length && this.rng() < 0.15) { const it = items[Math.floor(this.rng() * items.length)]; e.wp = { x: it.x, y: it.y }; }
    else e.wp = { x: B.x0 + this.rng() * (B.x1 - B.x0), y: B.y0 + this.rng() * (B.y1 - B.y0) };
    e.wpT = 3.5;
  }
  summonMotos(e, n) {
    const alive = this.enemies.filter(o => !o.dead && o.type === 'moto').length;
    n = Math.min(n, 6 - alive);
    for (let i = 0; i < n; i++) this.spawnEnemy('moto', this.activeSpawns[Math.floor(this.rng() * this.activeSpawns.length)]);
    if (n > 0) this.emit('summon', { enemy: e, x: e.x, y: e.y, label: 'MOTOR ROBBERS!' });
  }
  spawnTornado(x, y) {
    if (this.tornados.length >= TORNADO_MAX) this.tornados.shift();
    this.tornados.push({ id: this.nextId++, x, y, t: TORNADO_TIME, max: TORNADO_TIME, r: TORNADO_R, tick: 0, wt: 0, dx: 0, dy: 0 });
    this.emit('tornado', { x, y });
  }
  // state machine: enter -> goPark -> parked (calls 2 motor robbers) -> roam -> spin (dust tornado) -> roam -> park ... -> rush the register
  motoBoss(e, dt) {
    e.life += dt; e.mt -= dt; e.wpT -= dt;
    if (e.hitSlow > 0) e.hitSlow -= dt;
    const B = this.roamBounds(), sp = e.speed * (e.hitSlow > 0 ? 0.45 : 1);
    e.spin = false; e.parked = false;
    const inside = e.x >= B.x0 && e.x <= B.x1 && e.y >= B.y0 && e.y <= B.y1;
    if (e.ms !== 'enter' && e.ms !== 'rush') { e.x = Math.max(B.x0, Math.min(B.x1, e.x)); e.y = Math.max(B.y0, Math.min(B.y1, e.y)); }
    if (e.ms === 'enter') {   // straight through the door
      if (!e.crossed && (e.x - e.door.x) * -e.door.ox + (e.y - e.door.y) * -e.door.oy >= 0) { e.crossed = true; this.emit('doorCrash', { x: e.door.x, y: e.door.y, side: e.door.side }); }
      e.x += Math.sin(e.mh) * sp * 1.7 * dt; e.y += Math.cos(e.mh) * sp * 1.7 * dt;
      if (inside) { e.ms = 'goPark'; const c = this.freeCellsAround(Math.round(B.x0 + this.rng() * (B.x1 - B.x0)), Math.round(B.y0 + this.rng() * (B.y1 - B.y0)))[0]; e.pk = c ? { x: c[0], y: c[1] } : { x: e.x, y: e.y }; }
    } else if (e.ms === 'goPark') {
      this.motoSteer(e, e.pk.x, e.pk.y, dt, 4, sp);
      if (Math.hypot(e.pk.x - e.x, e.pk.y - e.y) < 0.3) { e.ms = 'parked'; e.mt = 2.6; this.emit('park', { enemy: e, x: e.x, y: e.y }); this.summonMotos(e, 2); }
    } else if (e.ms === 'parked') {
      e.parked = true;
      if (e.mt <= 0) { e.ms = 'roam'; e.mt = 8; this.motoWaypoint(e, B); }
    } else if (e.ms === 'roam') {   // free driving: it turns any way it likes
      if (!e.wp || e.wpT <= 0 || Math.hypot(e.wp.x - e.x, e.wp.y - e.y) < 0.6) this.motoWaypoint(e, B);
      this.motoSteer(e, e.wp.x, e.wp.y, dt, 3.4, sp);
      if (e.mt <= 0) { e.ms = 'spin'; e.mt = 1.7; e.tornDone = false; this.emit('spinStart', { enemy: e, x: e.x, y: e.y }); }
    } else if (e.ms === 'spin') {   // rotate attack: the bike whirls on the spot and kicks up a dust tornado
      e.spin = true; e.mh += 13 * dt; e.angle = e.mh;
      if (!e.tornDone && e.mt <= 1.0) { e.tornDone = true; this.spawnTornado(e.x, e.y); }
      if (e.mt <= 0) { e.spin = false; e.cycle++; if (e.cycle % 2 === 0) { e.ms = 'goPark'; const c = this.freeCellsAround(Math.round(B.x0 + this.rng() * (B.x1 - B.x0)), Math.round(B.y0 + this.rng() * (B.y1 - B.y0)))[0]; e.pk = c ? { x: c[0], y: c[1] } : { x: e.x, y: e.y }; } else { e.ms = 'roam'; e.mt = 8; this.motoWaypoint(e, B); } }
    } else if (e.ms === 'rush') {
      let till = this.tills[0], bd = 1e9;
      for (const t of this.tills) { const d = Math.hypot(t.x - e.x, t.y - e.y); if (d < bd) { bd = d; till = t; } }
      this.motoSteer(e, till.x, till.y, dt, 5, sp * 1.5);
      if (bd < 0.7) { e.dead = true; this.lives -= e.steal; this.emit('leak', { enemy: e }); return; }
    }
    if (e.ms !== 'rush' && e.ms !== 'enter' && e.life > MOTODUO_RUSH + 8) { e.ms = 'rush'; this.emit('summon', { enemy: e, x: e.x, y: e.y, label: 'GOING FOR THE TILL!' }); }
    if (e.ms !== 'enter' && !e.parked) this.motoSmash(e);
    e.tx = Math.max(0, Math.min(COLS - 1, Math.round(e.x))); e.ty = Math.max(0, Math.min(ROWS - 1, Math.round(e.y)));
  }
  stepTornados(dt) {
    for (const tn of this.tornados) {
      tn.t -= dt; tn.wt -= dt;
      if (tn.wt <= 0) {   // drifts towards the nearest machine or shelf
        tn.wt = 1.2; let best = null, bd = 6;
        for (const it of [...this.towers.filter(t => t.kind === 'tower' && !t.broken), ...this.shelves]) { const d = Math.hypot(it.x - tn.x, it.y - tn.y); if (d < bd && d > 0.3) { bd = d; best = it; } }
        const a = best ? Math.atan2(best.y - tn.y, best.x - tn.x) + (this.rng() - 0.5) * 0.8 : this.rng() * Math.PI * 2;
        tn.dx = Math.cos(a) * 1.3; tn.dy = Math.sin(a) * 1.3;
      }
      tn.x = Math.max(1, Math.min(COLS - 2, tn.x + tn.dx * dt)); tn.y = Math.max(1, Math.min(ROWS - 2, tn.y + tn.dy * dt));
      tn.tick += dt;
      if (tn.tick >= 0.4) {
        tn.tick -= 0.4; const dmg = TORNADO_ITEM_DPS * 0.4;
        for (const t of [...this.towers]) if (t.kind === 'tower' && !t.broken && Math.hypot(t.x - tn.x, t.y - tn.y) <= tn.r + 0.3) this.hurtTower(t, dmg);
        for (const s of [...this.shelves]) if (this.shelfNear(s, tn.x, tn.y) <= tn.r + 0.3) { s.hp -= dmg; s.hit = 0.3; if (s.hp <= 0) this.breakShelf(s); }
      }
    }
    this.tornados = this.tornados.filter(t => t.t > 0);
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
    if (this.fruits.length) this.stepFruits(dt);
    if (this.phase !== 'lost') this.stepStatues(dt);
    // towers (they only shoot when burglars are around)
    for (const t of this.towers) {
      if (t.kind !== 'tower') continue;
      if (t.hit > 0) t.hit -= dt;
      if (t.broken) {                                          // broken turrets do nothing until replaced... and blow up if left alone
        if (t.fuse != null) {
          t.fuse -= dt;
          if (Math.ceil(t.fuse) < t.fuseSec && t.fuse > 0) { t.fuseSec = Math.ceil(t.fuse); this.emit('towerFuse', { tower: t, left: t.fuseSec }); }
          if (t.fuse <= 0) this.blastTower(t);
        }
        continue;
      }
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
      if (d <= mv + 0.05) { p.done = true; if (!this.tryDeflect(p)) this.hitProjectile(p); continue; }
      p.x += dx / d * mv; p.y += dy / d * mv;
      const prog = 1 - Math.min(1, d / p.d0);
      if (p.kind === 'cereal' || p.kind === 'water') p.h = p.h0 + ((p.kind === 'cereal' ? 0.5 : 0.1) - p.h0) * prog + Math.sin(prog * Math.PI) * p.arc;   // lands on the floor
      else if (p.lob) p.h = p.h0 + Math.sin(prog * Math.PI) * p.arc;                      // lobbed: high arc, lands on the floor
      else if (p.kind === 'cans') p.h = p.h0 + (0.5 - p.h0) * prog + Math.sin(prog * Math.PI) * 0.55;
      else if (p.kind === 'gum') p.h = p.h0 + (0.45 - p.h0) * prog + Math.sin(prog * Math.PI) * 0.4;
      else if (p.kind === 'cola') p.h = p.h0 + (0.5 - p.h0) * prog + Math.sin(prog * Math.PI) * 0.1;
      else if (p.kind === 'atm') p.h = p.h0 + (0.6 - p.h0) * prog + Math.sin(prog * Math.PI) * 0.3;
      else p.h = 0.8 + Math.sin(prog * Math.PI) * (p.kind === 'soda' ? 0.18 : 0.6);
    }
    this.projectiles = this.projectiles.filter(p => !p.done);
    this.stepDonuts(dt); this.stepRolls(dt); this.stepBoxes(dt);
    // sauce puddles keep burglars burning; bombs on the floor count down
    this.stepFoeFires(dt); this.stepTornados(dt);
    for (const f of this.fires) {
      f.t -= dt;
      if (f.foe) continue;   // molotov fire hurts the store, not the burglars
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
        const ux = d > 0.01 ? dx / d : 0, uy = d > 0.01 ? dy / d : 0, w = e.boss ? 0.4 : 1;
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
    if (e.swing > 0) e.swing -= dt;
    if (e.hop) {   // a rider jumping off the motorbike
      const H = e.hop; H.t -= dt; const k = 1 - Math.max(0, H.t) / H.max;
      e.x = H.sx + (e.tx - H.sx) * k; e.y = H.sy + (e.ty - H.sy) * k; e.air = Math.sin(k * Math.PI);
      if (H.t <= 0) { e.hop = null; e.air = 0; e.x = e.tx; e.y = e.ty; }
      return;
    }
    if (e.moto) { this.motoStep(e, dt); return; }
    if (e.stun > 0) { e.stun -= dt; return; }
    // traps
    for (const tr of this.traps) {
      if (e.bk !== 'motoduo' && tr.uses > 0 && !e.slipped.has(tr.id) && Math.hypot(e.x - tr.x, e.y - tr.y) < 0.5) {
        e.slipped.add(tr.id); tr.uses--; e.stun = 0.8 + this.mods.mopStun;
        e.dash = null; e.wind = 0; e.pending = null;
        this.emit('slip', { enemy: e, trap: tr });
        this.damage(e, 5 * this.mods.globalDmg, true);
        if (tr.uses <= 0) { this.traps = this.traps.filter(x => x !== tr); this.emit('trapGone', { trap: tr }); }
        return;
      }
    }
    if (e.bk && this.bossAct(e, dt)) return;
    if (e.wind > 0) { e.wind -= dt; if (e.wind <= 0) this.doTrick(e); return; }   // winding up a bomb throw / dash
    if (e.dash) { this.dashStep(e, dt); return; }
    const wasPush = e.pushing; e.pushing = null; if (!wasPush) e.gunFor = null;
    const fleeing = e.flee > 0;
    let move = e.speed * (e.slow > 0 ? 1 - e.slowF : 1) * (fleeing ? 1.45 : 1) * dt;
    if (e.apr && e.apr.length) {   // still on the sidewalk: walk to the spot in front of the door, then straight in
      const a = e.apr[0], ax = a.x - e.x, ay = a.y - e.y, ad = Math.hypot(ax, ay);
      if (ad > move) { e.x += ax / ad * move; e.y += ay / ad * move; e.angle = Math.atan2(ax, ay); return; }
      e.x = a.x; e.y = a.y; e.apr.shift(); return;
    }
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
      if (sh && e.bk === 'gunslinger') { this.gunslingerBlast(e, sh, dt); return; }   // he doesn't shove: he shoots it
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
      v: 3, seed: this.seed, rng: this.rng.get(), room: this.room, permit: this.permit, wave: this.wave, cash: this.cash, lives: this.lives, maxLives: this.maxLives,
      kills: this.kills, served: this.served, sales: this.sales, paidOut: this.paidOut, rerolls: this.rerolls, unlocked: [...this.unlocked],
      mods: this.mods, nextId: this.nextId, phase: this.phase === 'restock' ? 'restock' : 'prep', choices: this.choices.map(u => u.id),
      counterSide: this.counterSide, doorSide: this.doorSide, counterPos: this.counterPos, tills: this.tills, spawns: this.spawns,
      shelves: this.shelves.filter(s => s.ttl === undefined), towers: this.towers, traps: this.traps,
    });
  }
  restore(s, o = {}) {
    if (s.v !== 3) throw new Error('old save');   // saves from older layouts can't be loaded
    const c = x => JSON.parse(JSON.stringify(x));
    this.room = s.room; setRoom(s.room);
    this.permit = s.permit ?? (s.room ? PERMIT_FOR_RENO[s.room - 1] : 1);   // older saves: just enough permit for the size they already have
    if (!o.retry) { this.seed = s.seed; this.rng = mulberry32(s.seed); this.rng.set(s.rng); this.paidOut = s.paidOut; }
    this.wave = s.wave; this.cash = s.cash; this.maxLives = 1; this.lives = Math.min(1, s.lives);   // older saves had a stack of Till: it is one life now
    this.kills = s.kills; this.served = s.served; this.sales = s.sales; this.rerolls = s.rerolls;
    this.unlocked = new Set(s.unlocked); this.mods = c(s.mods); this.nextId = Math.max(this.nextId, s.nextId);
    {   // saves made before the Bubblegum / Cola / ATM machines don't have their modifiers yet
      const m = this.mods, one = { cans: 1, sauce: 1, soda: 1, micro: 1, hotdog: 1, fridge: 1, gum: 1, cola: 1, atm: 1, water: 1, donut: 1, cereal: 1, tissue: 1 };
      m.dmg = { ...one, ...m.dmg }; m.rate = { ...one, ...m.rate };
      for (const [k, v] of Object.entries({ gumExtra: 0, push: 1, soak: 1, swirlTime: 1, swirlDmg: 1, fruitDmg: 1, statueRate: 1, waterExtra: 0, waterR: 1, donutExtra: 0, boxLife: 0, boxHp: 1 })) if (m[k] === undefined) m[k] = v;
    }
    this.counterSide = s.counterSide; this.doorSide = s.doorSide; this.counterPos = s.counterPos; this.tills = c(s.tills); this.spawns = c(s.spawns);
    this.shelves = c(s.shelves); this.towers = c(s.towers); this.traps = c(s.traps);
    this.blocked = new Uint8Array(COLS * ROWS);
    for (const sh of this.shelves) for (const [cx, cy] of this.cellsOf(sh)) this.blocked[idx(cx, cy)] = 3;
    for (const t of this.towers) this.blocked[idx(t.x, t.y)] = 2;
    this.enemies = []; this.projectiles = []; this.fires = []; this.bombs = []; this.ice = []; this.swirls = []; this.skills = []; this.fruits = []; this.donuts = []; this.rolls = []; this.tornados = []; this.customers = []; this.walkers = [];
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
      this.enemies = []; this.projectiles = []; this.fires = []; this.bombs = []; this.ice = []; this.swirls = []; this.skills = []; this.fruits = []; this.donuts = []; this.rolls = []; this.tornados = []; this.customers = []; this.walkers = [];
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
