/* ui.js — หน้าจอล้วน ไม่มีสูตรอยู่ในนี้
   โครง HUD: แถบบน=ทรัพยากร · แถบล่าง=ปุ่มมีคีย์ลัด · เลือกของก่อนแล้วคลิกเป้า
   หลัก "โลกบอกก่อนเลข" — แผนที่กินพื้นที่จอ เลขอยู่ขอบ */
(function () {
  var el = function (id) { return document.getElementById(id); };
  var nf = function (n) { return Math.round(n).toLocaleString('th-TH'); };
  var S = CONFIG.states;
  var ORDER = ['healthy', 'unscreened', 'atRisk', 'inProgram', 'knownNCD'];
  var world = null, timer = null, playing = false, speed = 1, sel = -1, pending = null, pendingBuild = null, pendingSite = null;

  /* ---------- sprite (Kenney CC0 · ดู assets/) ---------- */
  var SHEET = { tt: 'assets/tiny_town.png', td: 'assets/tiny_dungeon.png' };
  var SHEET_W = 192, SHEET_H = 176, TS = 16;
  var SPRITE = {
    phc:         { w: 32, h: 32, parts: [['tt',48,0,0],['tt',49,16,0],['tt',84,0,16],['tt',85,16,16]], cross: [16,7,9] },
    HEALTH_POST: { w: 16, h: 32, parts: [['tt',49,0,0],['tt',85,0,16]], cross: [8,7,7] },
    tent:        { w: 16, h: 16, parts: [['tt',104,0,0]], cross: [8,11,6] },
    shop:        { w: 16, h: 16, parts: [['tt',104,0,0]] },
    house:       { w: 16, h: 32, parts: [['tt',53,0,0],['tt',85,0,16]] },
    VHV_HOME:    { w: 16, h: 32, parts: [['tt',53,0,0],['tt',85,0,16]], tag: '#4d9fff' },
    PAVILION:    { w: 16, h: 16, parts: [['tt',67,0,0]] },
    tree:        { w: 16, h: 16, parts: [['tt',28,0,0]] },
    tree2:       { w: 16, h: 16, parts: [['tt',27,0,0]] },
    bush:        { w: 16, h: 16, parts: [['tt',5,0,0]] },
    person:      { w: 16, h: 16, parts: [['td',85,0,0]] },
    elder:       { w: 16, h: 16, parts: [['td',100,0,0]] },
    sick:        { w: 16, h: 16, parts: [['td',98,0,0]], tag: '#d9534f' },
    walker:      { w: 16, h: 16, parts: [['td',99,0,0]] },
    PHC_HUB:     { w: 32, h: 32, parts: [['tt',48,0,0],['tt',49,16,0],['tt',84,0,16],['tt',85,16,16]], cross: [16,7,9] },
    ROAD:        { w: 16, h: 16, parts: [['tt',40,0,0]] }
  };
  var ICON = { MOBILE_SCREEN: 'tent', VHV_AREA: 'walker', CAMPAIGN: 'PAVILION',
               HEALTH_POST: 'HEALTH_POST', VHV_HOME: 'VHV_HOME', PAVILION: 'PAVILION' };

  function spriteBody(sp) {
    var body = '';
    sp.parts.forEach(function (pt) {
      var col = pt[1] % 12, row = Math.floor(pt[1] / 12);
      body += '<image href="' + SHEET[pt[0]] + '" x="' + (pt[2] - col * TS) + '" y="' + (pt[3] - row * TS) +
              '" width="' + SHEET_W + '" height="' + SHEET_H + '"/>';
    });
    if (sp.cross) {
      var cx = sp.cross[0], cy = sp.cross[1], r = sp.cross[2], t = Math.max(1, Math.round(r / 3));
      body += '<rect x="' + (cx - r / 2 - 1) + '" y="' + (cy - r / 2 - 1) + '" width="' + (r + 2) + '" height="' + (r + 2) + '" rx="1.5" fill="#fff"/>' +
              '<rect x="' + (cx - r / 2) + '" y="' + (cy - t / 2) + '" width="' + r + '" height="' + t + '" fill="#1f9d55"/>' +
              '<rect x="' + (cx - t / 2) + '" y="' + (cy - r / 2) + '" width="' + t + '" height="' + r + '" fill="#1f9d55"/>';
    }
    if (sp.tag) body += '<circle cx="' + (sp.w - 3) + '" cy="3" r="2.5" fill="' + sp.tag + '" stroke="#fff" stroke-width="1"/>';
    return body;
  }
  function spriteDefs() {
    var out = ['<defs>'];
    Object.keys(SPRITE).forEach(function (k) {
      var sp = SPRITE[k];
      // ต้อง clip จริง ไม่งั้นชีตทั้งแผ่นทะลุออกมา (เจอมาแล้ว)
      out.push('<clipPath id="cl_' + k + '"><rect width="' + sp.w + '" height="' + sp.h + '"/></clipPath>' +
        '<symbol id="sp_' + k + '" viewBox="0 0 ' + sp.w + ' ' + sp.h + '">' +
        '<g clip-path="url(#cl_' + k + ')">' + spriteBody(sp) + '</g></symbol>');
    });
    return out.join('') + '</defs>';
  }
  function spriteIcon(key) {
    var sp = SPRITE[key]; if (!sp) return '';
    return '<svg viewBox="0 0 ' + sp.w + ' ' + sp.h + '" style="image-rendering:pixelated">' +
           '<clipPath id="ic_' + key + '"><rect width="' + sp.w + '" height="' + sp.h + '"/></clipPath>' +
           '<g clip-path="url(#ic_' + key + ')">' + spriteBody(sp) + '</g></svg>';
  }
  function useSprite(key, x, y, scale, cls) {
    var sp = SPRITE[key]; if (!sp) return '';
    return '<use href="#sp_' + key + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
           '" width="' + (sp.w * scale).toFixed(1) + '" height="' + (sp.h * scale).toFixed(1) + '"' +
           (cls ? ' class="' + cls + '"' : '') + '/>';
  }

  /* ---------- แผนที่ ---------- */
  var HW = 58, HH = 66;
  function hexXY(t) { return { x: HW * 1.5 * t.q, y: HH * (t.r + t.q / 2) }; }
  function hexPath(s) {
    var p = [];
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 180 * (60 * i);
      p.push((s * Math.cos(a)).toFixed(1) + ',' + (s * Math.sin(a)).toFixed(1));
    }
    return p.join(' ');
  }

  function tileSprites(v, acts) {
    var out = [], K = 0.72, bx = -HW * 0.40, by = -14;
    var b = [];
    if (v.phc) b.push('phc');
    Object.keys(v.builds).forEach(function (k) { if (SPRITE[k]) b.push(k); });
    if (v.shop) b.push('shop');
    for (var i = 0, n = Math.max(1, Math.min(2, Math.round(v.total / 80))); i < n; i++) b.push('house');
    if (acts.MOBILE_SCREEN) b.push('tent');

    var cx = bx;
    b.slice(0, 4).forEach(function (k) {
      var sp = SPRITE[k];
      out.push(useSprite(k, cx, by + (32 - sp.h) * K, K));
      cx += sp.w * K + 1.5;
    });

    var ppl = [v.elder >= 0.35 ? 'elder' : 'person'];
    if (missRate(v) > 0.55) ppl.push('person');
    if (v.pop.knownNCD / Math.max(1, v.total) > 0.07) ppl.push('sick');
    var px = bx + 1;
    ppl.slice(0, 3).forEach(function (k) { out.push(useSprite(k, px, by + 25 * K, K * 0.78)); px += 12 * K; });
    if (acts.VHV_AREA) out.push(useSprite('walker', bx + 1, by + 25 * K, K * 0.78, 'walk'));
    return out.join('');
  }

  function drawBoard() {
    var all = world.terrain.concat(world.villages);
    var pts = all.map(function (t) { var o = hexXY(t); return { t: t, x: o.x, y: o.y }; });
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var minX = Math.min.apply(null, xs) - HW, maxX = Math.max.apply(null, xs) + HW;
    var minY = Math.min.apply(null, ys) - HH, maxY = Math.max.apply(null, ys) + HH;

    var act = {};
    world.active.forEach(function (a) {
      coveredBy(world, a).forEach(function (v) { (act[v.id] = act[v.id] || {})[a.id] = true; });
    });
    var aiming = !!(pendingBuild || (pending && pending.range < 99));

    var svg = pts.map(function (p) {
      var t = p.t, tr = 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')';
      if (t.kind) {                                   // ช่องภูมิประเทศ
        var deco = '';
        if (t.site) deco = useSprite(t.site, -12, -10, 0.8);
        else if (t.kind === 'forest') deco = useSprite(t.deco > 0.5 ? 'tree' : 'tree2', -14, -12, 0.78) +
                                        useSprite('tree', 2, -4, 0.6);
        else if (t.kind === 'scrub') deco = useSprite('bush', -6, -6, 0.7);
        return '<g class="hex t' + (t.site ? ' built' : '') + (pendingSite ? ' aim' : '') +
          '" data-col="' + t.col + '" data-row="' + t.row + '" transform="' + tr + '">' +
          '<polygon points="' + hexPath(HW * 0.62) + '" fill="' + CONFIG.terrain[t.kind].color + '"/>' + deco + '</g>';
      }
      if (!t.known) {                                 // หมู่บ้านที่ระบบยังไม่เห็น
        var sv = canSurvey(world, t);
        return '<g class="hex v unknown' + (t.id === sel ? ' on' : '') + (sv ? ' cansurvey' : '') +
          '" data-id="' + t.id + '" transform="' + tr + '">' +
          '<polygon points="' + hexPath(HW * 0.62) + '" fill="#4a535d"/>' +
          useSprite('house', -8, -10, 0.65) +
          (sv ? '<text class="tagsv" y="' + (-HH * 0.34) + '">สำรวจได้</text>' : '') +
          '<text class="vn dim" y="' + (HH * 0.42) + '">' + (sv ? 'แตะเพื่อสำรวจ' : 'ยังไม่อยู่ในระบบ') + '</text></g>';
      }
      var h = heatOf(t);
      var fl = (world.flash || []).indexOf(t.id) > -1 ? ' flash' : '';
      return '<g class="hex v' + (t.id === sel ? ' on' : '') + (aiming ? ' aim' : '') + fl + '" data-id="' + t.id + '" transform="' + tr + '">' +
        '<polygon points="' + hexPath(HW * 0.62) + '" fill="' + h.color + '"/>' +
        '<text class="vn" y="' + (-HH * 0.36) + '">' + t.name.replace('บ้าน', '') + '</text>' +
        tileSprites(t, act[t.id] || {}) +
        '<text class="vp" y="' + (HH * 0.46) + '">' + nf(t.total) + '</text></g>';
    }).join('');

    el('board').innerHTML = '<svg viewBox="' + minX + ' ' + minY + ' ' + (maxX - minX) + ' ' + (maxY - minY) +
      '" preserveAspectRatio="xMidYMid meet">' + spriteDefs() + svg + '</svg>';
  }

  /* ---------- แถบบน ---------- */
  function drawTop() {
    var c = totals(world), A = CONFIG.awareness;
    el('week').textContent = world.tick + '/' + CONFIG.world.totalWeeks;
    el('budget').textContent = nf(world.budget);
    el('staff').textContent = (world.staff - staffUsed(world)) + '/' + world.staff;
    el('awNum').textContent = Math.round(world.awareness);
    el('awBar2').style.width = Math.round(world.awareness) + '%';
    el('awBar2').className = world.awareness > A.panicAbove ? 'panic'
      : world.awareness < A.apathyBelow ? 'apathy' : '';
    el('trNum').textContent = Math.round(world.trust);
    el('trBar').style.width = Math.round(world.trust) + '%';
    var seen = ORDER.reduce(function (s, k) { return s + c[k]; }, 0);
    var allp = world.villages.reduce(function (s, v) { return s + v.total; }, 0);
    el('reach').textContent = nf(seen);
    el('reachPct').textContent = Math.round(seen / allp * 100) + '% ของตำบล';
    var nextIns = CONFIG.inspections.filter(function (i) { return i.week > world.tick; })[0];
    if (nextIns) {
      var left = nextIns.week - world.tick;
      var prog = c.inProgram / nextIns.need.inProgramN;
      var onTrack = prog >= 1;
      el('insName').textContent = nextIns.name.replace('ตรวจราชการ', 'ตรวจ');
      el('insLeft').textContent = 'อีก ' + left + ' สัปดาห์';
      el('insBar').style.width = Math.min(100, prog * 100).toFixed(0) + '%';
      el('insBar').className = 'insfill ' + (onTrack ? 'ok' : left <= 6 ? 'urgent' : '');
      el('insNeed').textContent = 'ในระบบ ' + c.inProgram + ' / ' + nextIns.need.inProgramN + ' คน';
    } else {
      el('insName').textContent = 'ครบรอบตรวจแล้ว'; el('insLeft').textContent = '';
      el('insBar').style.width = '100%'; el('insNeed').textContent = '';
    }
    el('dp').textContent = Math.floor(world.dp);
    var ready = CONFIG.research.some(function (b) {
      for (var i = 0; i < b.nodes.length; i++) {
        if (world.researched[b.nodes[i].id]) continue;
        return b.nodes[i].cost <= world.dp;
      }
      return false;
    });
    el('rdBtn').classList.toggle('ready', ready);
  }

  /* ---------- กราฟสัดส่วนตามเวลา (แบบกราฟโรคใน Plague Inc.) ---------- */
  function drawGraph() {
    var H = world.history, W = CONFIG.world.totalWeeks, GW = 600, GH = 54;
    if (!H.length) { el('graph').innerHTML = ''; return; }
    var acc = {}, paths = [];
    ORDER.forEach(function (k) { acc[k] = []; });

    H.forEach(function (h, i) {
      var tot = ORDER.reduce(function (s, k) { return s + h.c[k]; }, 0) || 1;
      var y = 0;
      ORDER.forEach(function (k) {
        var top = y; y += h.c[k] / tot;
        acc[k].push([h.w / W * GW, top * GH, y * GH]);
      });
    });

    ORDER.forEach(function (k) {
      var pts = acc[k];
      var d = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L') +
              'L' + pts.slice().reverse().map(function (p) { return p[0].toFixed(1) + ',' + p[2].toFixed(1); }).join('L') + 'Z';
      paths.push('<path d="' + d + '" fill="' + S[k].color + '" opacity=".92"/>');
    });

    // เส้นความตื่นตัว ซ้อนบนพื้นที่ (เหมือนเส้น cure ใน Plague Inc.)
    var aw = 'M' + H.map(function (h) {
      return (h.w / W * GW).toFixed(1) + ',' + (GH - h.aw / 100 * GH).toFixed(1);
    }).join('L');
    paths.push('<path d="' + aw + '" fill="none" stroke="#fff" stroke-width="1.6" opacity=".75" stroke-dasharray="3 2"/>');

    var x = world.tick / W * GW;
    paths.push('<line x1="' + x.toFixed(1) + '" y1="0" x2="' + x.toFixed(1) + '" y2="' + GH + '" stroke="#fff" stroke-width="1" opacity=".5"/>');

    el('graph').innerHTML = '<svg viewBox="0 0 ' + GW + ' ' + GH + '" preserveAspectRatio="none">' + paths.join('') + '</svg>';
  }

  /* ---------- แถบล่าง ---------- */
  function slot(kind, item, idx, on, can, cost, sub) {
    return '<button class="slot' + (on ? ' on' : '') + '" data-kind="' + kind + '" data-id="' + item.id + '"' +
      (can ? '' : ' disabled') + '><span class="key">' + idx + '</span>' +
      '<span class="ic">' + spriteIcon(ICON[item.id] || 'house') + '</span>' +
      '<span class="tx"><span class="nm">' + item.name + '</span>' +
      '<span class="cs">' + nf(cost) + ' บ. · ' + sub + '</span></span></button>';
  }
  function drawDock() {
    el('measures').innerHTML = CONFIG.measures.map(function (m, i) {
      var can = m.cost <= world.budget && m.staff + staffUsed(world) <= world.staff;
      return slot('m', m, i + 1, pending && pending.id === m.id, can, m.cost,
        m.staff + ' คน · ' + m.weeks + ' สัปดาห์' + (m.range >= 99 ? ' · ทั้งตำบล' : m.range ? ' · +รอบข้าง' : ''));
    }).join('');
    el('builds').innerHTML = CONFIG.builds.map(function (b, i) {
      var v = sel >= 0 ? world.villages[sel] : null;
      var can = b.cost <= world.budget;
      return slot('b', b, i + 4, pendingBuild && pendingBuild.id === b.id, can, b.cost, 'ถาวร');
    }).join('');
    el('sites').innerHTML = CONFIG.sites.map(function (b, i) {
      return slot('s', b, i + 7, pendingSite && pendingSite.id === b.id, b.cost <= world.budget, b.cost, 'บนที่ว่าง');
    }).join('');
    el('aim').textContent = pendingSite ? '\ud83d\udc49 แตะช่องว่างที่จะสร้าง "' + pendingSite.name + '"'
      : pendingBuild ? '👉 แตะหมู่บ้านที่จะสร้าง “' + pendingBuild.name + '”'
      : pending ? (pending.range >= 99 ? '👉 แตะหมู่บ้านไหนก็ได้ เพื่อเริ่ม “' + pending.name + '” ทั้งตำบล'
                                       : '👉 แตะหมู่บ้านที่จะวาง “' + pending.name + '”') : '';
  }

  /* ---------- แผงหมู่บ้าน ---------- */
  function drawSheet() {
    if (sel < 0) { el('sheet').classList.remove('open'); return; }
    var v = world.villages[sel];
    el('sheet').classList.add('open');
    el('vName').textContent = v.name;
    if (!v.known) {
      var SV = CONFIG.survey;
      el('vMeta').innerHTML = '<span class="bad">ยังไม่อยู่ในระบบ</span> · ห่างตัวตำบล <b>' + v.distTown +
        '</b> ช่อง · ประมาณ ' + nf(v.total) + ' คน';
      el('vCtx').textContent = v.ctx;
      el('vBar').innerHTML = '';
      el('vList').innerHTML = '<li>ระบบยังไม่เคยเก็บข้อมูลหมู่บ้านนี้ — คนอยู่ตรงนั้นมาตลอด แต่ไม่เคยถูกนับ</li>';
      el('vActive').innerHTML = '<button class="go" id="surveyBtn">สำรวจและขึ้นทะเบียน · ' +
        nf(SV.cost) + ' บ. · ' + SV.staff + ' คน</button>';
      el('surveyBtn').onclick = function () {
        var r = surveyVillage(world, v.id);
        if (!r.ok) { alert(r.why); return; }
        drawAll();
      };
      return;
    }
    var tag = (v.phc ? 'มี รพ.สต. ในหมู่บ้าน' : 'ห่าง รพ.สต. <b>' + v.dist + '</b> ช่อง') +
      (v.builds.HEALTH_POST ? ' (เหลือ <b>' + effDist(v) + '</b> หลังมีจุดบริการ)' : '') +
      ' · ห่างตัวตำบล <b>' + v.distTown + '</b> ช่อง · ' + nf(v.total) + ' คน · ผู้สูงอายุ ' + Math.round(v.elder * 100) + '%';
    var bl = Object.keys(v.builds).map(function (b) {
      return CONFIG.builds.filter(function (x) { return x.id === b; })[0].name;
    });
    if (bl.length) tag += ' · <b>มี ' + bl.join(' + ') + '</b>';
    if (v.shop) tag += ' · <span class="bad">ร้านชำ+กลุ่มไลน์ ข่าวลวงแพร่เร็ว</span>';
    el('vMeta').innerHTML = tag;
    el('vCtx').textContent = v.ctx;
    el('vBar').innerHTML = ORDER.map(function (k) {
      return '<span style="width:' + (v.pop[k] / Math.max(1, v.total) * 100).toFixed(1) + '%;background:' + S[k].color + '"></span>';
    }).join('');
    el('vList').innerHTML = ORDER.map(function (k) {
      return '<li><i style="background:' + S[k].color + '"></i>' + S[k].th + '<b>' + nf(v.pop[k]) + '</b></li>';
    }).join('');
    var here = world.active.filter(function (a) {
      return coveredBy(world, a).some(function (x) { return x.id === v.id; });
    });
    el('vActive').innerHTML = here.length
      ? here.map(function (a) { var m = measureById(a.id); return '<span class="chip">' + m.name + ' · เหลือ ' + a.left + ' สัปดาห์</span>'; }).join('')
      : '<span class="chip off">ยังไม่มีมาตรการลงหมู่บ้านนี้</span>';
  }

  /* ---------- บันทึก ---------- */
  var lastWeek = -1;
  function drawLog() {
    var fresh = world.log.filter(function (l) { return l.week > lastWeek; });
    if (fresh.length) {
      lastWeek = world.log[0].week;
      el('log').insertAdjacentHTML('afterbegin', fresh.map(function (l) {
        return '<div class="line"><b>w' + l.week + '</b><span class="ic">' + l.icon + '</span>' + l.text + '</div>';
      }).join(''));
    }
    el('ticker').innerHTML = world.log.slice(0, 3).map(function (l) {
      return '<div><b>w' + l.week + '</b>' + l.text + '</div>';
    }).join('');
  }

  /* บอกว่าควรทำอะไรต่อ — แก้ปัญหา "งงว่าจะทำอะไร" */
  function drawObjective() {
    var c = totals(world), msg = '', tag = 'ทำต่อ';
    var canSv = world.villages.filter(function (v) { return canSurvey(world, v); });
    var nextIns = CONFIG.inspections.filter(function (i) { return i.week > world.tick; })[0];
    var cheapest = 99;
    CONFIG.research.forEach(function (b) {
      for (var i = 0; i < b.nodes.length; i++) {
        if (world.researched[b.nodes[i].id]) continue;
        cheapest = Math.min(cheapest, b.nodes[i].cost); break;
      }
    });

    if (world.tick === 0) {
      tag = 'เริ่มที่นี่';
      msg = 'ตอนนี้ระบบดูแลแค่ <b>บ้านกลาง</b> หมู่บ้านเดียว — กด <b>▶</b> ให้เวลาเดิน แล้ววาง <b>อสม. (ปุ่ม 2)</b> ลงหมู่บ้านนั้นก่อน';
    } else if (world.active.length === 0) {
      msg = 'ยังไม่มีมาตรการไหนเดินอยู่เลย — คนจะหลุดจากระบบไปเรื่อย ๆ · เลือกมาตรการ <b>ปุ่ม 1-3</b> แล้วแตะหมู่บ้าน';
    } else if (world.dp >= cheapest) {
      tag = 'พัฒนาได้';
      msg = 'มีแต้มพัฒนา <b>' + Math.floor(world.dp) + '</b> แต้มแล้ว — กด <b>R</b> เปิดจอพัฒนาระบบ ปลดความสามารถใหม่';
    } else if (canSv.length && world.budget >= CONFIG.survey.cost) {
      tag = 'ขยายได้';
      var best = canSv.sort(function (a, b) { return b.total - a.total; })[0];
      msg = 'ขยายเขตดูแลได้อีก <b>' + canSv.length + '</b> หมู่บ้าน (ขอบเขียวบนแผนที่) — ที่ใหญ่สุดคือ <b>' +
        best.name + ' ' + nf(best.total) + ' คน</b> · แตะแล้วกดสำรวจ';
    } else if (nextIns && c.inProgram < nextIns.need.inProgramN) {
      tag = 'ใกล้ตรวจ';
      msg = '<b>' + nextIns.name + '</b> อีก ' + (nextIns.week - world.tick) + ' สัปดาห์ · ต้องมีคนในระบบติดตาม <b>' +
        nextIns.need.inProgramN + '</b> คน ตอนนี้ได้ <b>' + c.inProgram + '</b> — เร่งวาง อสม. เพิ่ม';
    } else {
      msg = 'ไปได้สวย · ดูหมู่บ้านสีแดงบนแผนที่ว่ายังตามใครไม่ถึง แล้วส่งแรงไปตรงนั้น';
    }
    el('objective').innerHTML = '<span class="tagq">' + tag + '</span><span>' + msg + '</span>';
  }

  function drawAll() { drawBoard(); drawTop(); drawGraph(); drawObjective(); drawDock(); drawSheet(); drawLog(); }

  /* ---------- เวลา ---------- */
  function stop() { if (timer) clearInterval(timer); timer = null; playing = false; el('play').textContent = '▶'; }
  function play() {
    if (world.finished) return;
    playing = true; el('play').textContent = '❚❚';
    timer = setInterval(function () {
      step(world);
      drawAll();
      floatPulses();
      if (world.pendingCard) { var card = world.pendingCard; world.pendingCard = null; stop(); showCard(card); }
      if (world.finished) { stop(); el('play').disabled = true; showSummary(); }
    }, Math.round(CONFIG.world.tickMs / speed));
  }
  function setSpeed(x) {
    speed = x;
    [1, 2, 4].forEach(function (n) { el('sp' + n).classList.toggle('on', n === x); });
    if (playing) { stop(); play(); }
  }

  /* ตัวเลขลอย — ให้รู้สึกว่ากดแล้วมีอะไรเกิดขึ้น */
  function floatPulses() {
    if (!world.pulses.length) return;
    var host = el('pulses');
    world.pulses.forEach(function (p, i) {
      var d = document.createElement('div');
      d.className = 'pulse'; d.textContent = p.t; d.style.color = p.c;
      d.style.animationDelay = (i * 0.12) + 's';
      host.appendChild(d);
      setTimeout(function () { d.remove(); }, 1800 + i * 120);
    });
  }

  /* การ์ดเหตุการณ์ — ฟอร์แมตเดียวกับการ์ดภัยพิบัติ: ผลกระทบ / เสียหายเพิ่ม / ป้องกันได้ / เกร็ดความรู้ */
  function showEventCard(c) {
    var e = c.ev, blocked = c.kind === 'blocked';
    var tone = blocked ? 'ok' : e.good ? 'good' : 'bad';
    var vn = (c.villages || []).slice(0, 4).map(function (id) {
      return world.villages[id].name.replace('บ้าน', '');
    }).join(' · ');
    el('cardIn').innerHTML =
      '<div class="ec ' + tone + '">' +
        '<div class="ec-head"><span class="ec-no">' + (e.no || '') + '</span>' +
          '<span class="ec-ic">' + e.icon + '</span>' +
          '<div><b>' + e.name + '</b><i>' + (blocked ? 'กันไว้ได้' : e.good ? 'เหตุการณ์ดี' : 'เหตุการณ์ร้าย') +
          ' · สัปดาห์ที่ ' + world.tick + '</i></div></div>' +
        '<p class="ec-text">' + e.text + '</p>' +
        (blocked
          ? '<div class="ec-row ok"><b>✅ กันไว้ได้</b><span>แคมเปญสื่อสารของเราออกก่อน คนส่วนใหญ่ไม่หลงเชื่อ · ได้แต้มพัฒนา +1</span></div>'
          : '<div class="ec-row hit"><b>⚡ ผลกระทบ</b><span>' + e.hit + (c.extra ? '<br>' + c.extra.replace(/^ — /, '') : '') + '</span></div>' +
            '<div class="ec-row bad"><b>❌ เสียหายเพิ่มเมื่อ</b><span>' + e.worse + '</span></div>' +
            '<div class="ec-row good"><b>✅ ป้องกันได้</b><span>' + e.guard + '</span></div>') +
        (vn ? '<div class="ec-where">หมู่บ้านที่โดน: ' + vn + (c.villages.length > 4 ? ' และอีก ' + (c.villages.length - 4) + ' แห่ง' : '') + '</div>' : '') +
        '<div class="ec-fact"><b>💡 เกร็ดความรู้</b>' + e.fact + '</div>' +
      '</div><button class="go wide" id="cardOk">รับทราบ</button>';
    el('cardWrap').classList.remove('hide');
    el('cardOk').onclick = function () { el('cardWrap').classList.add('hide'); };
  }

  /* การ์ดผลตรวจราชการ */
  function showCard(c) {
    if (c.kind === 'event' || c.kind === 'blocked') { showEventCard(c); return; }
    el('cardIn').innerHTML = '<div class="card-top ' + (c.ok ? 'ok' : 'bad') + '">' +
      (c.ok ? '✅ ผ่านเกณฑ์' : '❌ ไม่ผ่านเกณฑ์') + '</div>' +
      '<h3>' + c.name + '</h3><p class="meta">สัปดาห์ที่ ' + c.week + '</p>' +
      '<ul class="checks">' + c.lines.map(function (l) {
        return '<li class="' + (l.ok ? 'y' : 'n') + '">' + (l.ok ? '✔' : '✘') + ' ' + l.text + '</li>';
      }).join('') + '</ul>' +
      '<p class="cardmsg">' + c.msg + '</p>' +
      '<button class="go wide" id="cardOk">รับทราบ</button>';
    el('cardWrap').classList.remove('hide');
    el('cardOk').onclick = function () { el('cardWrap').classList.add('hide'); };
  }
  function start(seed) {
    stop(); world = newWorld(seed); sel = -1; pending = null; pendingBuild = null; lastWeek = -1;
    el('play').disabled = false; el('summaryWrap').classList.add('hide');
    el('log').innerHTML = '';
    el('glegend').innerHTML = ORDER.map(function (k) {
      return '<li><i style="background:' + S[k].color + '"></i>' + S[k].th + '</li>';
    }).join('') + '<li><span class="dash"></span>ความตื่นตัว</li>';
    el('heatLegend').innerHTML = CONFIG.heat.map(function (h) {
      return '<span><i style="background:' + h.color + '"></i>' + h.th + '</span>';
    }).join('');
    var kn = world.villages.filter(function (v) { return v.known; }).length;
    pushLog(world, 'เริ่ม', 'ตำบลนี้มี ' + world.villages.length + ' หมู่บ้าน แต่ระบบเห็นอยู่ ' + kn +
      ' แห่ง — ที่เหลือมีคนอยู่จริงแต่ยังไม่เคยถูกนับ · รพ.สต. ' +
      world.villages.filter(function (v) { return v.phc; }).length + ' แห่ง — แตะหมู่บ้านเพื่อดูบริบทของมัน');
    drawAll();
  }

  function showSummary() {
    var c = totals(world);
    var far = world.villages.filter(function (v) { return v.distTown >= 2; });
    var near = world.villages.filter(function (v) { return v.distTown < 2; });
    var fa = far.reduce(function (s, v) { return s + missRate(v); }, 0) / far.length * 100;
    var na = near.reduce(function (s, v) { return s + missRate(v); }, 0) / near.length * 100;
    var worst = world.villages.slice().sort(function (a, b) { return missRate(b) - missRate(a); })[0];
    var g = world.grade || gradeOf(world);
    el('summary').innerHTML = '<div class="gradebox g' + g.g + '"><b>' + g.g + '</b><span>' + g.th +
      '</span><i>' + g.score + ' คะแนน</i></div>' +
      '<div class="sheet-head"><h3>ครบ 1 ปีแล้ว</h3>' +
      '<button class="x" onclick="document.getElementById(\'summaryWrap\').classList.add(\'hide\')">✕</button></div>' +
      '<div class="summary-grid">' +
      '<div>ผู้ป่วยรายใหม่สะสม <b>' + nf(c.knownNCD) + ' คน</b> · คนที่ยังตามไม่ถึง <b>' + nf(c.unscreened + c.atRisk) + ' คน</b></div>' +
      '<div>หมู่บ้านใกล้ตัวตำบล ตามไม่ถึง <b>' + na.toFixed(0) + '%</b> · หมู่บ้านไกล <b>' + fa.toFixed(0) + '%</b>' +
        (fa - na > 8 ? ' — <b>ช่องว่างนี้คือคนที่ระบบมองไม่เห็น</b>' : ' — ช่องว่างแคบ ถือว่าทั่วถึง') + '</div>' +
      '<div>หมู่บ้านที่แย่ที่สุด: <b>' + worst.name + '</b> (' + Math.round(missRate(worst) * 100) + '%) — ' + worst.ctx + '</div>' +
      '<div>ระบบเห็นคน <b>' + g.parts.coverage + '%</b> ของตำบล · อยู่ในระบบติดตาม <b>' + g.parts.inProg +
        '%</b> · ป่วยรายใหม่ตลอดปี <b>' + g.parts.sickAdd + ' คน</b> · ผ่านรอบตรวจ <b>' + g.parts.insPass + '/3</b></div>' +
      '</div><details><summary>ข้อมูลที่ระบบบันทึก (ฟิลด์เตรียมต่อ Digital Twin)</summary><pre>' +
      JSON.stringify(twinLog(world), null, 2) + '</pre></details>';
    el('summaryWrap').classList.remove('hide');
  }

  /* ---------- จอพัฒนาระบบ (skill tree) ---------- */
  function drawResearch() {
    el('dpBig').textContent = Math.floor(world.dp);
    el('rdTree').innerHTML = CONFIG.research.map(function (b) {
      var nodes = b.nodes.map(function (n, i) {
        var done = !!world.researched[n.id];
        var prevOk = i === 0 || !!world.researched[b.nodes[i - 1].id];
        var can = !done && prevOk && n.cost <= world.dp;
        var cls = done ? 'done' : can ? 'can' : prevOk ? 'poor' : 'lock';
        return '<button class="node ' + cls + '" data-id="' + n.id + '"' + (can ? '' : ' disabled') + '>' +
          '<span class="nd-cost">' + (done ? '✓' : n.cost) + '</span>' +
          '<span class="nd-tx"><b>' + n.name + '</b><i>' + n.effect + '</i></span></button>';
      }).join('<div class="nd-link"></div>');
      return '<div class="branch" style="--bc:' + b.color + '"><h4>' + b.icon + ' ' + b.name +
             '<i>' + b.desc + '</i></h4>' + nodes + '</div>';
    }).join('');
  }
  el('rdTree').addEventListener('click', function (e) {
    var b = e.target.closest('.node'); if (!b || b.disabled) return;
    var r = researchNode(world, b.dataset.id);
    if (!r.ok) { alert(r.why); return; }
    drawResearch(); drawAll();
  });
  el('rdBtn').addEventListener('click', function () { drawResearch(); toggle('rdWrap', true); });
  el('rdClose').addEventListener('click', function () { toggle('rdWrap', false); });

  /* ---------- อินพุต ---------- */
  function pickSlot(kind, id) {
    if (kind === 'm') {
      var m = measureById(id);
      pending = (pending && pending.id === m.id) ? null : m; pendingBuild = null; pendingSite = null;
    } else if (kind === 'b') {
      var b = CONFIG.builds.filter(function (x) { return x.id === id; })[0];
      pendingBuild = (pendingBuild && pendingBuild.id === b.id) ? null : b; pending = null; pendingSite = null;
    } else {
      var sd = CONFIG.sites.filter(function (x) { return x.id === id; })[0];
      pendingSite = (pendingSite && pendingSite.id === sd.id) ? null : sd; pending = null; pendingBuild = null;
    }
    drawDock(); drawBoard();
  }
  function onSlotClick(e) {
    var b = e.target.closest('.slot'); if (!b || b.disabled) return;
    pickSlot(b.dataset.kind, b.dataset.id);
  }
  el('measures').addEventListener('click', onSlotClick);
  el('builds').addEventListener('click', onSlotClick);
  el('sites').addEventListener('click', onSlotClick);

  el('board').addEventListener('click', function (e) {
    var tg = e.target.closest('.hex.t');
    if (tg) {
      if (pendingSite) {
        var rs = buildSite(world, pendingSite.id, +tg.dataset.col, +tg.dataset.row);
        if (!rs.ok) { alert(rs.why); return; }
        pendingSite = null; drawAll(); return;
      }
      sel = -1; drawAll(); return;
    }
    var g = e.target.closest('.hex.v'); if (!g) return;
    var id = +g.dataset.id;
    if (!world.villages[id].known) { sel = id; pending = null; pendingBuild = null; drawAll(); return; }
    if (pendingBuild) {
      var rb = buildOne(world, pendingBuild.id, id);
      if (!rb.ok) { alert(rb.why); return; }
      pendingBuild = null; sel = id; drawAll(); return;
    }
    if (pending) {
      var r = placeMeasure(world, pending.id, id);
      if (!r.ok) { alert(r.why); return; }
      pending = null; sel = id; drawAll(); return;
    }
    sel = id; drawAll();
  });

  el('play').addEventListener('click', function () { playing ? stop() : play(); });
  [1, 2, 4].forEach(function (n) { el('sp' + n).addEventListener('click', function () { setSpeed(n); }); });
  el('stepOne').addEventListener('click', function () {
    if (world.finished) return;
    stop(); step(world); drawAll(); floatPulses();
    if (world.pendingCard) { var cd = world.pendingCard; world.pendingCard = null; showCard(cd); }
    if (world.finished) { el('play').disabled = true; showSummary(); }
  });
  el('restart').addEventListener('click', function () { if (confirm('เริ่มใหม่ทั้งหมด?')) start(42); });
  el('sheetClose').addEventListener('click', function () { sel = -1; drawAll(); });

  function toggle(id, on) { el(id).classList.toggle('hide', !on); }
  el('logBtn').addEventListener('click', function () { toggle('logWrap', true); });
  el('logClose').addEventListener('click', function () { toggle('logWrap', false); });
  el('infoBtn').addEventListener('click', function () { toggle('infoWrap', true); });
  el('infoClose').addEventListener('click', function () { toggle('infoWrap', false); });
  [['logWrap'], ['infoWrap'], ['summaryWrap'], ['rdWrap']].forEach(function (x) {
    el(x[0]).addEventListener('click', function (e) { if (e.target === el(x[0])) toggle(x[0], false); });
  });

  el('pick').addEventListener('click', function () {
    var skip = ['สรุป', 'งบ', 'จบ', 'เริ่ม'];
    var picked = world.log.filter(function (l) { return skip.indexOf(l.icon) < 0; }).slice(0, 6);
    if (!picked.length) { alert('ยังไม่มีเรื่องให้คัด ลองเดินเวลาไปก่อน'); return; }
    el('picked').innerHTML = picked.map(function (l) {
      return '<div class="q">สัปดาห์ ' + l.week + ' — ' + l.text + '</div>';
    }).join('') + '<p class="credit">⚠️ เป็นเรื่องจากตำบลสมมุติ ถ้าเอาไปทำคอนเทนต์ต้องบอกว่าเป็นตัวอย่าง ไม่ใช่เคสจริง</p>';
    el('picked').classList.remove('hide');
  });

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT') return;
    var k = e.key;
    if (k === ' ') { e.preventDefault(); playing ? stop() : play(); return; }
    if (k === '+' || k === '=') { setSpeed(speed === 1 ? 2 : 4); return; }
    if (k === '-') { setSpeed(speed === 4 ? 2 : 1); return; }
    if (k >= '1' && k <= '3') pickSlot('m', CONFIG.measures[+k - 1].id);
    else if (k >= '4' && k <= '6') pickSlot('b', CONFIG.builds[+k - 4].id);
    else if (k === 'r' || k === 'R' || k === 'ว') { drawResearch(); toggle('rdWrap', true); }
    else if (k >= '7' && k <= '8') pickSlot('s', CONFIG.sites[+k - 7].id);
    else if (k === 'Escape') { pending = null; pendingBuild = null; pendingSite = null; sel = -1; drawAll(); }
  });

  el('worldName').textContent = CONFIG.world.name.replace(/ตำบลสมมุติ\s*/, '').replace(/"/g, '');
  start(42);
})();
