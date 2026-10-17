/* sim.js — เครื่องคำนวณล้วน ไม่มีโค้ดหน้าจอ
   🚨 กฎเหล็ก: ห้ามใช้ Math.random() หรือ Date.now() ตัดสินอะไร
   🪤 บั๊กที่เคยเจอ: ถ้าทุกระบบใช้ rng ตัวเดียวต่อ tick ค่าจะสหสัมพันธ์กัน
      จนบางระบบไม่ทำงานเลย — ที่นี่แจก salt คนละตัว · เพิ่มระบบใหม่ต้องแจก salt ใหม่เสมอ */

var SALT = { screen: 1009, enroll: 2027, recover: 3041, dropout: 4051, worsen: 5077,
             newRisk: 6091, event: 7103, make: 9133, hit: 10007, cast: 11027 };

function rngAt(seed, tick, salt) {
  var a = (seed * 374761393 + tick * 668265263 + salt * 2246822519) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ระยะบนกริดหกเหลี่ยม (axial) */
function hexDist(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/* offset (col,row) -> axial (q,r) · odd-q vertical layout */
function toAxial(col, row) { return { q: col, r: row - ((col - (col & 1)) >> 1) }; }

/* ช่องภูมิประเทศ — เติมกริด 10x10 ส่วนที่ไม่ใช่หมู่บ้าน
   ลำน้ำพาดเฉียงกลางแผนที่ ไม่ได้สุ่มล้วน เพื่อให้ภูมิประเทศอ่านเป็นตำบลจริง */
function buildTerrain(seed, villages) {
  var G = CONFIG.grid, taken = {}, out = [];
  villages.forEach(function (v) { taken[v.col + ',' + v.row] = true; });
  var rt = rngAt(seed, 0, SALT.make);
  for (var col = 0; col < G.cols; col++) {
    for (var row = 0; row < G.rows; row++) {
      if (taken[col + ',' + row]) continue;
      var a = toAxial(col, row), x = rt();
      var onRiver = Math.abs((row - 2) - col * 0.55) < 0.7;
      var kind = onRiver ? 'water' : (x < 0.40) ? 'rice' : (x < 0.72) ? 'forest' : 'scrub';
      out.push({ q: a.q, r: a.r, col: col, row: row, kind: kind, deco: rt(), site: null });
    }
  }
  return out;
}

function newWorld(seed) {
  var W = CONFIG.world, mix = CONFIG.startMix;
  var tcAx = toAxial(CONFIG.townCenter.col, CONFIG.townCenter.row);
  var villages = CONFIG.villages.map(function (v, i) {
    var a = toAxial(v.col, v.row);
    return { id: i, name: v.name, col: v.col, row: v.row, q: a.q, r: a.r, phc: !!v.phc, known: !!v.known, elder: v.elder, ctx: v.ctx || '',
             shop: !!v.shop, builds: {}, carry: {}, pop: null, total: v.pop, stunUntil: 0, progWeeks: 0 };
  });

  var phcs = villages.filter(function (v) { return v.phc; });
  villages.forEach(function (v) {
    v.dist = phcs.reduce(function (min, p) { return Math.min(min, hexDist(v, p)); }, 99);
    v.distTown = hexDist(v, tcAx);                // ระยะจากตัวตำบล
  });

  recalcDist({ villages: villages, terrain: [] });
  var SHIFT = CONFIG.startShiftPerDist;
  villages.forEach(function (v) {
    var d = Math.min(v.dist, 3), k;
    var m = {};
    for (k in mix) m[k] = mix[k];
    var move = SHIFT * d;
    m.healthy = Math.max(0.05, m.healthy - move * 0.6);
    m.inProgram = Math.max(0.01, m.inProgram - move * 0.4);
    m.unscreened += move * 0.7;
    m.atRisk += move * 0.3;
    var pop = {}, left = v.total, keys = Object.keys(m);
    keys.forEach(function (key, idx) {
      var n = (idx === keys.length - 1) ? left : Math.round(v.total * m[key]);
      pop[key] = n; left -= n;
    });
    v.pop = pop;
  });

  var rc = rngAt(seed, 0, SALT.cast), cast = [], n = 0;
  villages.forEach(function (v) {
    for (var i = 0; i < CONFIG.castPerVillage && n < NAMES.length; i++) {
      var pool = ['unscreened', 'atRisk', 'healthy', 'inProgram'];
      cast.push({ name: NAMES[n++], vid: v.id, elder: rc() < v.elder,
                  state: pool[Math.floor(rc() * pool.length)], weeks: 0, stunUntil: 0 });
    }
  });

  var w0 = { seed: seed, tick: 0, villages: villages, terrain: buildTerrain(seed, villages), cast: cast,
           budget: W.budget, staff: W.staff, awareness: W.awareness, trust: W.trust,
           apathyStreak: 0, active: [], log: [], fired: {}, finished: false,
           dp: 0, researched: {}, dpGained: 0, history: [], budgetCut: 0,
           inspections: [], pulses: [], flash: [], grade: null, startSick: 0 };
  w0.startSick = totals(w0).knownNCD;
  return w0;
}

/* คิดระยะใหม่ — เรียกทุกครั้งที่มีหมุดบริการเพิ่ม */
function recalcDist(world) {
  var hubs = world.villages.filter(function (v) { return v.phc; }).map(function (v) { return { q: v.q, r: v.r }; });
  (world.terrain || []).forEach(function (t) { if (t.site === 'PHC_HUB') hubs.push({ q: t.q, r: t.r }); });
  var roads = (world.terrain || []).filter(function (t) { return t.site === 'ROAD'; });
  world.villages.forEach(function (v) {
    v.dist = hubs.reduce(function (min, h) { return Math.min(min, hexDist(v, h)); }, 99);
    v.onRoad = roads.some(function (t) { return hexDist(v, t) <= 1; });
  });
}

/* ขึ้นทะเบียนหมู่บ้านเข้าระบบ */
function canSurvey(world, v) {
  if (v.known) return false;
  var R = CONFIG.survey.reach;
  return world.villages.some(function (k) { return k.known && hexDist(k, v) <= R; });
}
function surveyVillage(world, vid) {
  var v = world.villages[vid], S = CONFIG.survey;
  if (v.known) return { ok: false, why: v.name + ' อยู่ในระบบแล้ว' };
  if (!canSurvey(world, v)) return { ok: false, why: v.name + ' อยู่ไกลเกินไป — ต้องขยายจากหมู่บ้านที่ดูแลอยู่ออกไปทีละขั้น' };
  if (S.cost > world.budget) return { ok: false, why: 'งบไม่พอ ต้องใช้ ' + S.cost.toLocaleString('th-TH') };
  if (S.staff + staffUsed(world) > world.staff) return { ok: false, why: 'กำลังคนไม่พอ' };
  world.budget -= S.cost;
  v.known = true;
  world.dp += S.dpBonus;
  var miss = v.pop.unscreened + v.pop.atRisk;
  pushLog(world, 'สำรวจ', 'ขึ้นทะเบียน ' + v.name + ' เข้าระบบแล้ว — เจอคนที่ยังตามไม่ถึงเพิ่มทันที ' +
    miss + ' คน (เขาอยู่ตรงนั้นมาตลอด ระบบเพิ่งเห็น) · ได้แต้มพัฒนา +' + S.dpBonus);
  return { ok: true };
}

/* สร้างบนช่องว่าง */
function buildSite(world, siteId, col, row) {
  var sd = CONFIG.sites.filter(function (x) { return x.id === siteId; })[0];
  var t = world.terrain.filter(function (x) { return x.col === col && x.row === row; })[0];
  if (!sd || !t) return { ok: false, why: 'สร้างตรงนี้ไม่ได้' };
  if (t.site) return { ok: false, why: 'ช่องนี้มีของอยู่แล้ว' };
  if (sd.cost > world.budget) return { ok: false, why: 'งบไม่พอ ต้องใช้ ' + sd.cost.toLocaleString('th-TH') };
  world.budget -= sd.cost;
  t.site = siteId;
  recalcDist(world);
  pushLog(world, sd.icon, 'สร้าง' + sd.name + 'บนที่ว่างแล้ว — ' + sd.effect);
  return { ok: true };
}

function totals(world) {
  var c = { healthy: 0, unscreened: 0, atRisk: 0, inProgram: 0, knownNCD: 0 };
  world.villages.forEach(function (v) { if (!v.known) return; for (var k in c) c[k] += v.pop[k]; });
  return c;
}
function staffUsed(world) { return world.active.reduce(function (s, a) { return s + a.staff; }, 0); }
function measureById(id) { return CONFIG.measures.filter(function (x) { return x.id === id; })[0]; }
function pushLog(world, icon, text) {
  world.log.unshift({ week: world.tick, icon: icon, text: text });
  if (world.log.length > 160) world.log.pop();
}
/* ระยะที่ใช้จริง — จุดบริการสุขภาพชุมชนย่นระยะลง 1 ช่อง ถาวร */
/* ปลดล็อกสายวิจัยแล้วหรือยัง */
function R(world, id) { return !!world.researched[id]; }

function researchNode(world, nodeId) {
  var br = null, idx = -1;
  CONFIG.research.forEach(function (b) {
    b.nodes.forEach(function (n, i) { if (n.id === nodeId) { br = b; idx = i; } });
  });
  if (!br) return { ok: false, why: 'ไม่มีหัวข้อนี้' };
  var node = br.nodes[idx];
  if (world.researched[nodeId]) return { ok: false, why: 'พัฒนาไปแล้ว' };
  if (idx > 0 && !world.researched[br.nodes[idx - 1].id]) {
    return { ok: false, why: 'ต้องพัฒนา "' + br.nodes[idx - 1].name + '" ก่อน' };
  }
  if (node.cost > world.dp) return { ok: false, why: 'แต้มพัฒนาไม่พอ มี ' + Math.floor(world.dp) + ' ต้องใช้ ' + node.cost };
  world.dp -= node.cost;
  world.researched[nodeId] = true;
  pushLog(world, br.icon, 'พัฒนาระบบสำเร็จ: ' + node.name + ' — ' + node.effect);
  return { ok: true };
}

function effDist(v) { return Math.max(0, Math.min(3, v.dist - (v.builds.HEALTH_POST ? 1 : 0))); }

function buildOne(world, id, vid) {
  var b = CONFIG.builds.filter(function (x) { return x.id === id; })[0];
  var v = world.villages[vid];
  if (!b) return { ok: false, why: 'ไม่มีสิ่งปลูกสร้างนี้' };
  if (v.builds[id]) return { ok: false, why: v.name + ' มี' + b.name + 'อยู่แล้ว' };
  if (id === 'HEALTH_POST' && v.phc) return { ok: false, why: v.name + ' มี รพ.สต. อยู่แล้ว ไม่ต้องมีจุดบริการย่อย' };
  if (b.cost > world.budget) return { ok: false, why: 'งบไม่พอ เหลือ ' + world.budget.toLocaleString('th-TH') + ' บาท' };
  world.budget -= b.cost;
  v.builds[id] = true;
  pushLog(world, b.icon, 'สร้าง' + b.name + 'ที่ ' + v.name + ' แล้ว — ของถาวร ไม่หมดอายุ' +
    (id === 'HEALTH_POST' ? ' · ระยะจากบริการของหมู่บ้านนี้ลดเหลือ ' + effDist(v) + ' ช่อง' : ''));
  return { ok: true };
}

function missRate(v) { return (v.pop.unscreened + v.pop.atRisk) / Math.max(1, v.total); }
function heatOf(v) {
  var m = missRate(v);
  for (var i = 0; i < CONFIG.heat.length; i++) if (m <= CONFIG.heat[i].upTo) return CONFIG.heat[i];
  return CONFIG.heat[CONFIG.heat.length - 1];
}

function rangeOf(world, id) {
  var m = measureById(id), r = m.range;
  if (r >= 99) return r;
  if (id === 'MOBILE_SCREEN' && R(world, 'R1')) r += 1;
  if (id === 'VHV_AREA' && R(world, 'F3')) r += 1;
  return r;
}
function coveredBy(world, act) {
  var r = rangeOf(world, act.id);
  if (r >= 99) return world.villages;
  var home = world.villages[act.vid];
  return world.villages.filter(function (v) { return hexDist(v, home) <= r; });
}
function coverSet(world, key) {
  var set = {};
  world.active.forEach(function (a) {
    var m = measureById(a.id);
    if (!m.chance || !m.chance[key]) return;
    coveredBy(world, a).forEach(function (v) { set[v.id] = (set[v.id] || 0) + m.chance[key]; });
  });
  return set;
}
function vhvSet(world) {
  var set = {};
  world.active.forEach(function (a) {
    if (a.id !== 'VHV_AREA') return;
    coveredBy(world, a).forEach(function (v) { set[v.id] = true; });
  });
  return set;
}

function placeMeasure(world, id, vid) {
  var m = measureById(id);
  if (!m) return { ok: false, why: 'ไม่มีมาตรการนี้' };
  if (world.active.some(function (a) { return a.id === id && (m.range >= 99 || a.vid === vid); })) {
    return { ok: false, why: 'มาตรการนี้กำลังทำอยู่ที่นั่นแล้ว' };
  }
  if (m.cost > world.budget) return { ok: false, why: 'งบไม่พอ เหลือ ' + world.budget.toLocaleString('th-TH') + ' บาท' };
  if (m.staff + staffUsed(world) > world.staff) return { ok: false, why: 'กำลังคนไม่พอ ถูกจองอยู่ ' + staffUsed(world) + ' จาก ' + world.staff };
  world.budget -= m.cost;
  var wk = m.weeks + (id === 'MOBILE_SCREEN' && R(world, 'R4') ? 3 : 0);
  world.active.push({ id: id, vid: vid, left: wk, staff: m.staff });
  var rr = rangeOf(world, id);
  var where = (rr >= 99) ? 'ทั้งตำบล' : world.villages[vid].name + (rr ? ' และหมู่บ้านรอบ ' + rr + ' ช่อง' : '');
  pushLog(world, m.icon, 'เริ่ม' + m.name + ' ที่ ' + where + ' — จอง ' + m.staff + ' คน-สัปดาห์ นาน ' + wk + ' สัปดาห์');
  return { ok: true };
}

/* 🪤 ห้ามใช้ Math.round ตรง ๆ กับการไหลรายสัปดาห์
   หมู่บ้านเล็ก (58 คน) ไหลสัปดาห์ละ 0.4 คน ถ้าปัดทุกครั้งจะเป็น 0 ตลอดปี
   = หมู่บ้านไกลซึ่งเล็กที่สุดจะไม่มีอะไรเกิดขึ้นเลย และกลไกรัศมีจะไม่ทำงาน
   จึงเก็บเศษสะสมไว้ต่อหมู่บ้านต่อเส้นทาง แล้วปล่อยออกเมื่อครบ 1 คน */
function moveSome(v, from, to, n) {
  if (!(n > 0)) return 0;
  var key = from + '>' + to;
  v.carry = v.carry || {};
  var acc = (v.carry[key] || 0) + n;
  var whole = Math.floor(acc);
  v.carry[key] = acc - whole;
  whole = Math.max(0, Math.min(whole, v.pop[from]));
  v.pop[from] -= whole; v.pop[to] += whole; return whole;
}

function step(world) {
  if (world.finished) return null;
  world.tick++;
  var t = world.tick, A = CONFIG.awareness, B = CONFIG.base, D = CONFIG.distance;

  if (t > 1 && (t - 1) % 13 === 0) {
    var amt = Math.round(CONFIG.world.budgetPerQuarter * (1 - world.budgetCut));
    world.budget += amt;
    pushLog(world, 'งบ', 'งบงวดใหม่เข้าแล้ว ' + amt.toLocaleString('th-TH') + ' บาท' +
      (world.budgetCut ? ' (ถูกหั่น ' + Math.round(world.budgetCut * 100) + '% จากผลตรวจ)' : ''));
    world.budgetCut = 0;
  }

  var awBonus = 0, trBonus = 0;
  world.active.forEach(function (a) {
    var m = measureById(a.id);
    if (m.awarenessPerTick) awBonus += m.awarenessPerTick;
    if (m.trustPerTick) trBonus += m.trustPerTick;
  });
  world.awareness = clamp(world.awareness + awBonus - A.decayPerTick * (R(world, 'T1') ? 0.5 : 1), 0, 100);
  world.trust = clamp(world.trust + trBonus - 0.2 + (R(world, 'T3') ? 0.35 : 0), 0, 100);

  var panicAt = A.panicAbove + (R(world, 'T4') ? 10 : 0);
  if (world.awareness > panicAt) {
    world.trust = clamp(world.trust - 2.5, 0, 100);
    if (t % 3 === 0) pushLog(world, 'ตื่นตระหนก', 'คนแห่ไปโรงพยาบาลทั้งที่ยังไม่ถึงคิว เจ้าหน้าที่รับไม่ไหว ความเชื่อมั่นเริ่มตก');
  }
  if (world.awareness < A.apathyBelow) {
    world.apathyStreak++;
    if (world.apathyStreak === A.apathyWeeks) pushLog(world, 'เงียบ', 'ไม่มีใครพูดถึงเรื่องสุขภาพมา ' + A.apathyWeeks + ' สัปดาห์ แทบไม่มีใครเดินมาตรวจเอง');
  } else { world.apathyStreak = 0; }
  var apathy = world.apathyStreak >= A.apathyWeeks;

  var awMul = 0.4 + (world.awareness / 100) * 1.2; if (apathy) awMul *= 0.35;
  var trMul = 0.5 + (world.trust / 100) * 0.8;

  var rScreen = rngAt(world.seed, t, SALT.screen), rEnroll = rngAt(world.seed, t, SALT.enroll),
      rRec = rngAt(world.seed, t, SALT.recover), rDrop = rngAt(world.seed, t, SALT.dropout),
      rWorse = rngAt(world.seed, t, SALT.worsen), rNew = rngAt(world.seed, t, SALT.newRisk);

  var screenCov = coverSet(world, 'screen'), enrollCov = coverSet(world, 'enroll'),
      selfCov = coverSet(world, 'selfScreen'), vhv = vhvSet(world);
  var ev = { screened: 0, found: 0, enrolled: 0, recovered: 0, dropped: 0, worsened: 0 };

  var softBase = R(world, 'R2') ? 0.30 : 0;
  world.villages.forEach(function (v) {
    if (!v.known) return;                       // ยังไม่ขึ้นทะเบียน = ระบบยังไม่แตะ
    var d = effDist(v);
    var soften = Math.min(0.75, softBase + (v.onRoad ? 0.5 : 0));
    var dm = D.mul[d] + (1 - D.mul[d]) * soften, dd = 1 + (D.dropMul[d] - 1) * (1 - soften);
    if (vhv[v.id]) { dm = dm + (1 - dm) * D.vhvHelps; dd = 1 + (dd - 1) * (1 - D.vhvHelps); }
    if (v.builds.VHV_HOME) dd = 1 + (dd - 1) * 0.45;          // อสม.ประจำถิ่น คนหลุดน้อยลงถาวร

    var pav = v.builds.PAVILION ? 1.8 : 1;
    var st = v.builds.HEALTH_POST ? CONFIG.builds[0].standing : null;   // เจ้าหน้าที่แวะประจำจุดบริการ
    var scrB = R(world, 'R3') ? 1.35 : 1, enrB = R(world, 'F4') ? 1.35 : 1;
    var pScreen = (B.selfScreen * awMul + (selfCov[v.id] || 0) * awMul * pav + (screenCov[v.id] || 0) * trMul * scrB + (st ? st.screen * trMul : 0)) * dm;
    var pEnroll = (B.enroll * awMul + (enrollCov[v.id] || 0) * trMul * enrB + (st ? st.enroll * trMul : 0)) * dm;
    if (v.stunUntil > t) pEnroll = 0;

    var scr = moveSome(v, 'unscreened', 'healthy', v.pop.unscreened * pScreen * (1 - B.riskFound));
    var fnd = moveSome(v, 'unscreened', 'atRisk', v.pop.unscreened * pScreen * B.riskFound);
    ev.screened += scr + fnd; ev.found += fnd;
    ev.enrolled += moveSome(v, 'atRisk', 'inProgram', v.pop.atRisk * pEnroll);
    ev.worsened += moveSome(v, 'atRisk', 'knownNCD', v.pop.atRisk * B.worsen * (2 - trMul));

    var keep = vhv[v.id] ? measureById('VHV_AREA').chance.keep : 0;
    var dropR = (R(world, 'F1') ? 0.82 : 1) * (R(world, 'F2') ? 0.78 : 1);
    ev.dropped += moveSome(v, 'inProgram', 'atRisk', v.pop.inProgram * B.dropout * (1 - keep) * dd * dropR * (1.6 - trMul));
    v.progWeeks++;
    if (v.progWeeks > B.recoverMinWeeks) ev.recovered += moveSome(v, 'inProgram', 'healthy', v.pop.inProgram * B.recover * trMul);
    moveSome(v, 'healthy', 'atRisk', v.pop.healthy * B.newRisk);
    v.total = Object.keys(v.pop).reduce(function (s, k) { return s + v.pop[k]; }, 0);
  });

  var story = [];
  world.cast.forEach(function (c) {
    var v = world.villages[c.vid]; if (!v.known) return;
    var d = effDist(v);
    var dm = D.mul[d]; if (vhv[v.id]) dm = dm + (1 - dm) * D.vhvHelps;
    var st2 = v.builds.HEALTH_POST ? CONFIG.builds[0].standing : null;
    var pS = (B.selfScreen * awMul + (selfCov[v.id] || 0) * awMul + (screenCov[v.id] || 0) * trMul + (st2 ? st2.screen * trMul : 0)) * dm;
    var pE = (B.enroll * awMul + (enrollCov[v.id] || 0) * trMul + (st2 ? st2.enroll * trMul : 0)) * dm;
    if (c.stunUntil > t) pE = 0;

    if (c.state === 'unscreened' && rScreen() < pS) {
      if (rScreen() < B.riskFound) { c.state = 'atRisk'; story.push({ i: 'ตรวจ', t: c.name + ' (' + v.name + ') ไปตรวจครั้งแรก พบว่าค่าน้ำตาลสูงกว่าเกณฑ์' }); }
      else c.state = 'healthy';
    } else if (c.state === 'atRisk') {
      if (rEnroll() < pE) { c.state = 'inProgram'; c.weeks = 0; story.push({ i: 'เยี่ยม', t: c.name + ' (' + v.name + ') ยอมเข้าระบบติดตาม หลังมีคนไปหาถึงบ้าน' }); }
      else if (rWorse() < B.worsen * (2 - trMul)) { c.state = 'knownNCD'; story.push({ i: 'ป่วย', t: c.name + ' (' + v.name + ') ไม่มีใครตามต่อ จนกลายเป็นผู้ป่วยรายใหม่' }); }
    } else if (c.state === 'inProgram') {
      c.weeks++;
      var keep2 = vhv[v.id] ? 0.65 : 0;
      var dd2 = D.dropMul[d]; if (v.builds.VHV_HOME) dd2 = 1 + (dd2 - 1) * 0.45;
      if (rDrop() < B.dropout * (1 - keep2) * dd2) { c.state = 'atRisk'; story.push({ i: 'หลุด', t: c.name + ' (' + v.name + ') ขาดนัดติดกันสามครั้ง หลุดจากระบบติดตามแล้ว' }); }
      else if (c.weeks >= B.recoverMinWeeks && rRec() < B.recover * trMul) { c.state = 'healthy'; story.push({ i: 'ดีขึ้น', t: c.name + ' (' + v.name + ') คุมน้ำตาลได้ กลับไปอยู่กลุ่มสุขภาพดีแล้ว' }); }
    } else if (c.state === 'healthy' && rNew() < B.newRisk) { c.state = 'atRisk'; }
  });

  if (story.length > 3) {
    pushLog(world, 'สรุป', 'สัปดาห์นี้ทั้งตำบล พบคนเสี่ยงใหม่ ' + ev.found + ' · เข้าระบบ ' + ev.enrolled +
      ' · หลุดจากระบบ ' + ev.dropped + ' · ป่วยรายใหม่ ' + ev.worsened);
  } else { story.forEach(function (s) { pushLog(world, s.i, s.t); }); }

  var rEv = rngAt(world.seed, t, SALT.event), rHit = rngAt(world.seed, t, SALT.hit);
  var shield = world.active.some(function (a) { return a.id === 'CAMPAIGN'; });
  CONFIG.events.forEach(function (e) {
    if (t < e.week[0] || t > e.week[1] || world.fired[e.id] || rEv() >= 0.05) return;
    var shieldP = R(world, 'T2') ? 0.85 : 0.5;
    if (e.rumor && shield && rEv() < shieldP) {
      world.fired[e.id] = true;
      world.dp += CONFIG.dp.perRumorBlocked;
      pushLog(world, 'กัน', 'มีข่าวลวงเรื่อง' + e.name + 'เข้ามา แต่คลิปของเราออกก่อน คนส่วนใหญ่ไม่หลงเชื่อ · ได้แต้มพัฒนา +1');
      world.pendingCard = { kind: 'blocked', ev: e };
      return;
    }
    world.fired[e.id] = true;
    if (e.effect.trust) world.trust = clamp(world.trust + e.effect.trust, 0, 100);
    if (e.effect.awareness) world.awareness = clamp(world.awareness + e.effect.awareness, 0, 100);

    var hitV = world.villages.filter(function (v) {
      if (e.target === 'far') return effDist(v) >= 2;
      if (e.target === 'elder') return v.elder >= 0.30;
      return true;
    });
    var n = 0, extra = '';
    if (e.effect.stunWeeks) {
      hitV.forEach(function (v) {
        var w = e.effect.stunWeeks;
        if (v.shop) w = Math.round(w * CONFIG.shopRumorMul);      // ร้านชำ/กลุ่มไลน์ = ข่าวลวงแพร่เร็วกว่า
        if (v.builds.PAVILION) w = Math.round(w * 0.6);           // ศาลาประชาคมช่วยถ่วง
        v.stunUntil = t + w; n++;
      });
      world.cast.forEach(function (c) {
        if (c.elder && hitV.some(function (v) { return v.id === c.vid; })) c.stunUntil = t + e.effect.stunWeeks;
      });
      extra = ' — ' + n + ' หมู่บ้านดึงคนเข้าระบบไม่ได้ไปอีก ' + e.effect.stunWeeks + ' สัปดาห์';
    }
    if (e.effect.dropNow) {
      hitV.forEach(function (v) {
        var rate = e.effect.dropNow * (v.shop ? CONFIG.shopRumorMul : 1) * (v.builds.PAVILION ? 0.6 : 1);
        n += moveSome(v, 'inProgram', 'atRisk', v.pop.inProgram * Math.min(0.9, rate));
      });
      world.cast.forEach(function (c) { if (c.state === 'inProgram' && rHit() < e.effect.dropNow) c.state = 'atRisk'; });
      extra = ' — คนที่กำลังติดตามอยู่หลุดออกทันที ' + n + ' คน';
    }
    if (e.effect.screenNow) {
      hitV.forEach(function (v) {
        n += moveSome(v, 'unscreened', 'atRisk', v.pop.unscreened * e.effect.screenNow * B.riskFound);
        n += moveSome(v, 'unscreened', 'healthy', v.pop.unscreened * e.effect.screenNow * (1 - B.riskFound));
      });
      extra = ' — ได้ตรวจเพิ่ม ' + n + ' คนในรอบเดียว';
    }
    pushLog(world, e.icon, e.name + ' — ' + e.text + extra);
    world.pendingCard = { kind: 'event', ev: e, extra: extra,
                          villages: hitV.map(function (v) { return v.id; }) };
    world.flash = hitV.map(function (v) { return v.id; });
  });

  world.active = world.active.filter(function (a) {
    a.left--;
    if (a.left <= 0) { pushLog(world, 'จบ', measureById(a.id).name + 'ครบกำหนดแล้ว คืนกำลังคน ' + a.staff + ' คน-สัปดาห์'); return false; }
    return true;
  });

  /* ---- รอบตรวจราชการ ---- */
  CONFIG.inspections.forEach(function (ins) {
    if (ins.week !== t) return;
    var cc = totals(world);
    var seen = cc.healthy + cc.unscreened + cc.atRisk + cc.inProgram + cc.knownNCD;
    var allp = world.villages.reduce(function (a, v) { return a + v.total; }, 0);
    var ok = true, lines = [];
    if (ins.need.inProgramN !== undefined) {
      var p1 = cc.inProgram >= ins.need.inProgramN;
      ok = ok && p1;
      lines.push({ ok: p1, text: 'คนอยู่ในระบบติดตาม ' + cc.inProgram + ' คน (ต้องได้ ' + ins.need.inProgramN + ')' });
    }
    if (ins.need.coveragePct !== undefined) {
      var cov = seen / allp, p2 = cov >= ins.need.coveragePct;
      ok = ok && p2;
      lines.push({ ok: p2, text: 'ระบบดูแลประชากร ' + (cov * 100).toFixed(0) + '% ของตำบล (ต้องได้ ' +
        (ins.need.coveragePct * 100).toFixed(0) + '%)' });
    }
    if (ok) { if (ins.reward.dp) world.dp += ins.reward.dp; }
    else {
      if (ins.penalty.budgetCut) world.budgetCut = ins.penalty.budgetCut;
      if (ins.penalty.trust) world.trust = clamp(world.trust + ins.penalty.trust, 0, 100);
    }
    var rec = { week: t, name: ins.name, ok: ok, lines: lines, kind: 'inspect',
                msg: ok ? ins.pass : ins.fail, final: !!ins.final };
    world.inspections.push(rec);
    world.pendingCard = rec;
    pushLog(world, ok ? 'ผ่าน' : 'ไม่ผ่าน', ins.name + ' — ' + (ok ? ins.pass : ins.fail));
  });

  var DPC = CONFIG.dp, tc = totals(world);
  world.history.push({ w: world.tick, c: tc, aw: Math.round(world.awareness), tr: Math.round(world.trust) });
  var gain = DPC.base + tc.inProgram * DPC.perInProgram +
             Math.max(0, world.trust - 50) * DPC.perTrustOver50 + ev.recovered * DPC.perRecover;
  world.dp += gain; world.dpGained += gain;
  if (ev.enrolled) world.pulses.push({ t: '+' + ev.enrolled + ' เข้าระบบ', c: '#4d9fff' });
  if (ev.recovered) world.pulses.push({ t: '+' + ev.recovered + ' หายดี', c: '#2e9e6b' });
  if (ev.worsened) world.pulses.push({ t: '+' + ev.worsened + ' ป่วยใหม่', c: '#d9534f' });

  if (world.tick >= CONFIG.world.totalWeeks) {
    world.finished = true;
    world.grade = gradeOf(world);
    pushLog(world, 'จบปี', 'ครบ 1 ปีแล้ว — ผลประเมิน ' + world.grade.g + ' (' + world.grade.th + ')');
  }
  return ev;
}

/* เกรดปลายปี — ถ่วงน้ำหนักของที่วัดได้จริง
   ครอบคลุม 40 · อยู่ในระบบ 30 · ไม่ปล่อยให้ป่วยเพิ่ม 20 · ผ่านรอบตรวจ 10 */
function gradeOf(world) {
  var c = totals(world);
  var seen = c.healthy + c.unscreened + c.atRisk + c.inProgram + c.knownNCD;
  var allp = world.villages.reduce(function (s, v) { return s + v.total; }, 0);
  var coverage = seen / allp;                                   // ระบบเห็นคนกี่ %
  var inProg = c.inProgram / allp;   // เทียบประชากรทั้งตำบล ไม่ใช่แค่ส่วนที่ระบบเห็น — เล่นแคบจึงตันเพดาน
  var sickAdd = Math.max(0, c.knownNCD - (world.startSick || 0));
  var sickScore = Math.max(0, 1 - sickAdd / 70);
  var insPass = world.inspections.filter(function (i) { return i.ok; }).length;
  var score = coverage * 52 + Math.min(1, inProg / 0.05) * 24 + sickScore * 14 +
              (insPass / Math.max(1, CONFIG.inspections.length)) * 10;
  var g = CONFIG.grades.filter(function (x) { return score >= x.min; })[0] || CONFIG.grades[CONFIG.grades.length - 1];
  return { g: g.g, th: g.th, score: Math.round(score),
           parts: { coverage: Math.round(coverage * 100), inProg: Math.round(inProg * 100),
                    sickAdd: sickAdd, insPass: insPass } };
}

function twinLog(world) {
  return {
    scenario_id: CONFIG.world.id,
    week: world.tick,
    population_state: totals(world),
    villages: world.villages.filter(function (v) { return v.known; }).map(function (v) {
      return { name: v.name, dist_to_phc: v.dist, effective_dist: effDist(v),
               builds: Object.keys(v.builds), has_shop: !!v.shop,
               pop: v.pop, miss_rate: +missRate(v).toFixed(3) };
    }),
    active_measures: world.active.map(function (a) {
      return { id: a.id, village: measureById(a.id).range >= 99 ? 'ALL' : world.villages[a.vid].name };
    }),
    awareness: Math.round(world.awareness), trust: Math.round(world.trust),
    budget_left: world.budget, staff_committed: staffUsed(world),
    dp: +world.dp.toFixed(1), researched: Object.keys(world.researched),
    expected_result: null, actual_result: null,
    model_version: CONFIG.modelVersion, simulation_seed: world.seed, data_class: 'SYNTHETIC'
  };
}
