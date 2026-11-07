const express = require('express'), http = require('http'), { Server } = require('socket.io');
const app = express(), srv = http.createServer(app), io = new Server(srv);
app.use(express.static(__dirname + '/public'));

const rooms = new Map();
const T = { night: 45, day: 150, vote: 30, hunter: 20 };
const rnd = a => a[Math.floor(Math.random() * a.length)];
const uid = () => Math.random().toString(36).slice(2, 9);
const clean = n => String(n || '').trim().slice(0, 14);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => { let c; do c = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join(''); while (rooms.has(c)); return c; };
const newRoom = () => ({ code: newCode(), ph: 'lobby', day: 0, P: [], log: [], dl: 0, acts: {}, win: null, wi: { h: 1, p: 1 }, lg: null, H: [], after: 'day', tm: null, muted: null, lastMute: null, cubNext: false, double: false });
const isW = p => !!p && (p.r === 'wolf' || p.r === 'cub');
const gp = (r, i) => r.P.find(p => p.i === i);
const say = (r, t) => r.log.push({ c: 's', t });
const wolfTally = r => { const t = {}; r.P.filter(p => p.a && isW(p)).forEach(w => { [].concat(r.acts[w.i] || []).forEach(x => { t[x] = (t[x] || 0) + 1; }); }); return t; };
const lead = t => { let b = null, m = 0; for (const k in t) if (t[k] > m) { m = t[k]; b = k; } return b; };
function top(t, random) {
  const e = Object.entries(t); if (!e.length) return null;
  const m = Math.max(...e.map(x => x[1])), c = e.filter(x => x[1] === m).map(x => x[0]);
  return random ? rnd(c) : (c.length === 1 ? c[0] : null);
}

function view(r, p) {
  const over = r.ph === 'over', wolf = isW(p), witch = p.r === 'witch';
  return {
    code: r.code, ph: r.ph, day: r.day, win: r.win, me: p.i, host: r.P[0] === p, left: Math.max(0, r.dl - Date.now()),
    P: r.P.map(q => ({ i: q.i, n: q.n, a: q.a ? 1 : 0, v: q.voice ? 1 : 0, r: over || q === p || (wolf && isW(q)) ? q.r : '' })),
    log: r.log.filter(e => over || e.c === 's' || e.c === 'c' || (e.c === 'w' && wolf) || (e.c === 'd' && !p.a)).slice(-60),
    seen: p.seen, wi: witch ? r.wi : { h: 0, p: 0 }, lg: p.r === 'guard' ? r.lg : null,
    mu: r.muted, dbl: r.double ? 1 : 0, dz: p.r === 'arsonist' ? p.doused : [], lm: p.r === 'mute' ? r.lastMute : null,
    hp: r.H.map(h => h.i), wv: witch ? lead(wolfTally(r)) : null
  };
}
const bc = r => r.P.forEach(p => p.sid && io.to(p.sid).emit('state', view(r, p)));

function go(r, ph) {
  r.ph = ph; r.acts = {}; r.dl = Date.now() + (T[ph] || 0) * 1000; clearTimeout(r.tm);
  if (T[ph]) r.tm = setTimeout(() => nxt(r), T[ph] * 1000);
  bc(r);
}
const VN = { wolf: 'Sói', seer: 'Tiên tri', guard: 'Bảo vệ', witch: 'Phù thủy', hunter: 'Thợ săn', cupid: 'Cupid', mute: 'Kẻ câm', arsonist: 'Kẻ phóng hỏa', cub: 'Sói con', villager: 'Dân làng' };
// Bộ vai cố định theo số người: 5 Tiên tri, 6 Bảo vệ, 7 Phù thủy, 8 Thợ săn + Sói con, 9 Cupid, 10 Kẻ câm, 11 Kẻ phóng hỏa.
function compose(n) {
  const w = n <= 6 ? 1 : n <= 9 ? 2 : 3;
  const wolves = Array(w).fill('wolf'); if (n >= 8) wolves[0] = 'cub';
  const sp = ['seer', 'guard', 'witch', 'hunter', 'cupid', 'mute', 'arsonist'].filter((_, i) => n >= 5 + i);
  return [...wolves, ...sp, ...Array(n - w - sp.length).fill('villager')];
}
function begin(r) {
  const n = r.P.length, comp = compose(n);
  const roles = shuffle([...comp]);
  r.P.forEach((p, i) => { p.r = roles[i]; p.a = true; p.love = null; p.seen = []; p.doused = []; });
  Object.assign(r, { day: 0, log: [], wi: { h: 1, p: 1 }, lg: null, H: [], win: null, muted: null, lastMute: null, cubNext: false, double: false });
  const cnt = {}; comp.forEach(x => cnt[x] = (cnt[x] || 0) + 1);
  say(r, `Ván mới ${n} người: ${Object.entries(cnt).map(([k, v]) => v + ' ' + VN[k]).join(', ')}. Vai được chia ngẫu nhiên cho từng người.`); night(r);
}
function night(r) { r.day++; r.muted = null; r.double = r.cubNext; r.cubNext = false; if (r.double) say(r, 'Sói con đã chết: đêm nay Sói được cắn hai người!');
  say(r, `Đêm ${r.day}: các vai đặc biệt hành động.`); go(r, 'night'); }
function kill(r, p, why) {
  if (!p || !p.a) return; p.a = false; say(r, `${p.n} ${why}.`);
  if (p.r === 'hunter') r.H.push(p);
  if (p.r === 'cub') r.cubNext = true;
  const l = p.love && gp(r, p.love); if (l && l.a) kill(r, l, 'chết theo người yêu');
}
function over(r) {
  const al = r.P.filter(p => p.a), w = al.filter(isW).length, ar = al.some(p => p.r === 'arsonist');
  let win = null;
  if (ar && al.length === 1) win = 'arsonist';
  else if (!ar && w === 0) win = 'village';
  else if (!ar && w >= al.length - w) win = 'wolf';
  if (!win) return false;
  r.win = win; clearTimeout(r.tm); r.ph = 'over'; r.dl = 0;
  say(r, win === 'village' ? 'Dân làng thắng! Toàn bộ Sói đã bị loại.' : win === 'wolf' ? 'Sói thắng! Sói đã chiếm đa số trong làng.' : 'Kẻ phóng hỏa thắng! Cả làng chìm trong biển lửa.'); bc(r); return true;
}
function proceed(r, ph) {
  if (over(r)) return;
  if (r.H.length) { r.after = ph; go(r, 'hunter'); return; }
  if (ph === 'night') night(r); else { if (ph === 'day') say(r, 'Cả làng thảo luận: ai là Sói?'); go(r, ph); }
}
function nxt(r) {
  const al = r.P.filter(p => p.a);
  if (r.ph === 'night') {
    const tl = wolfTally(r), victims = [];
    for (let k = 0; k < (r.double ? 2 : 1); k++) { const v = top(tl, true); if (!v) break; victims.push(v); delete tl[v]; }
    const vic = victims[0], gd = al.find(p => p.r === 'guard'), prot = gd && r.acts[gd.i];
    const wi = al.find(p => p.r === 'witch'), wa = (wi && r.acts[wi.i]) || {}, cu = al.find(p => p.r === 'cupid'), sr = al.find(p => p.r === 'seer');
    r.lg = prot || null;
    if (r.day === 1 && cu && Array.isArray(r.acts[cu.i]) && r.acts[cu.i].length === 2) {
      const [a, b] = r.acts[cu.i].map(i => gp(r, i)); a.love = b.i; b.love = a.i;
      a.seen.push(`Bạn yêu ${b.n}`); b.seen.push(`Bạn yêu ${a.n}`);
    }
    if (sr && r.acts[sr.i]) { const t = gp(r, r.acts[sr.i]); sr.seen.push(`Đêm ${r.day}: ${t.n} ${isW(t) ? 'là Sói' : 'không phải Sói'}`); }
    const saved = wa.s && r.wi.h > 0 && vic; if (saved) r.wi.h--;
    say(r, 'Trời sáng.'); let died = false;
    victims.forEach((v, k) => { if (v === prot || (k === 0 && saved)) return; kill(r, gp(r, v), 'bị Sói cắn chết trong đêm'); died = true; });
    const ar = r.P.find(p => p.a && p.r === 'arsonist'), aa = (ar && r.acts[ar.i]) || {};
    if (ar && aa.ig) { ar.doused.map(i => gp(r, i)).filter(q => q && q.a).forEach(q => { kill(r, q, 'bị thiêu chết'); died = true; }); ar.doused = []; }
    else if (ar && aa.d && !ar.doused.includes(aa.d)) ar.doused.push(aa.d);
    if (wa.pz && r.wi.p > 0) { r.wi.p--; kill(r, gp(r, wa.pz), 'bị đầu độc'); died = true; }
    if (!died) say(r, 'Đêm qua không ai chết.');
    const mt = al.find(p => p.r === 'mute'), mv = mt && mt.a ? gp(r, r.acts[mt.i]) : null;
    r.muted = mv && mv.a ? mv.i : null;
    if (r.muted) { r.lastMute = r.muted; say(r, `${mv.n} bị bịt miệng, không được nói trong ngày hôm nay.`); } else if (mt && mt.a) r.lastMute = null;
    proceed(r, 'day');
  } else if (r.ph === 'day') { say(r, 'Hết giờ thảo luận. Bỏ phiếu treo cổ!'); go(r, 'vote'); }
  else if (r.ph === 'vote') {
    const tally = {}; Object.values(r.acts).forEach(t => tally[t] = (tally[t] || 0) + 1);
    const t = top(tally, false);
    if (t) kill(r, gp(r, t), 'bị treo cổ'); else say(r, 'Phiếu hòa hoặc không ai bỏ phiếu. Không ai bị treo cổ.');
    proceed(r, 'night');
  } else if (r.ph === 'hunter') { r.H = []; proceed(r, r.after); }
}
function done(r) {
  const al = r.P.filter(p => p.a);
  if (r.ph === 'night') {
    const need = r.double ? Math.min(2, al.filter(x => !isW(x)).length) : 1;
    return al.filter(p => isW(p) || ['seer', 'guard', 'witch', 'mute', 'arsonist'].includes(p.r) || (p.r === 'cupid' && r.day === 1))
      .every(p => p.r === 'cupid' ? (r.acts[p.i] || []).length === 2 : isW(p) ? [].concat(r.acts[p.i] || []).length >= need : r.acts[p.i]);
  }
  if (r.ph === 'vote') return al.every(p => r.acts[p.i]);
  return false;
}
function act(r, p, d) {
  const t = gp(r, d.x), ph = r.ph;
  if (ph === 'hunter') { if (r.H.includes(p) && t && t.a) { r.H = r.H.filter(h => h !== p); kill(r, t, 'bị Thợ săn bắn'); proceed(r, r.after); } return; }
  if (!p.a) return;
  if (ph === 'vote') { if (t && t.a && t !== p) { r.acts[p.i] = t.i; done(r) ? nxt(r) : bc(r); } return; }
  if (ph !== 'night') return;
  if (p.r === 'witch') {
    if (d.k === 'save' && r.wi.h > 0) r.acts[p.i] = { s: 1 };
    else if (d.k === 'poison' && t && t.a && r.wi.p > 0) r.acts[p.i] = { pz: t.i };
    else if (d.k === 'skip') r.acts[p.i] = {}; else return;
  } else if (p.r === 'arsonist') {
    if (d.k === 'ignite') r.acts[p.i] = { ig: 1 };
    else if (d.k === 'douse' && t && t.a && t !== p) r.acts[p.i] = { d: t.i };
    else if (d.k === 'skip') r.acts[p.i] = {}; else return;
  } else {
    if (!t || !t.a) return;
    if (isW(p) && !isW(t)) r.acts[p.i] = r.double ? [...[].concat(r.acts[p.i] || []).filter(v => v !== t.i), t.i].slice(-2) : t.i;
    else if (p.r === 'seer' && t !== p) r.acts[p.i] = t.i;
    else if (p.r === 'guard' && t.i !== r.lg) r.acts[p.i] = t.i;
    else if (p.r === 'cupid' && r.day === 1) r.acts[p.i] = [...(r.acts[p.i] || []).filter(v => v !== t.i), t.i].slice(-2);
    else if (p.r === 'mute' && t !== p && t.i !== r.lastMute) r.acts[p.i] = t.i;
    else return;
  }
  done(r) ? nxt(r) : bc(r);
}

io.on('connection', s => {
  const ctx = () => { const r = rooms.get(s.data.room), p = r && gp(r, s.data.pid); return r && p ? [r, p] : []; };
  const err = m => s.emit('err', m);
  const enter = (r, p) => { p.sid = s.id; s.data = { room: r.code, pid: p.i }; bc(r); };
  const mk = (n, tok) => ({ i: uid(), n, tok, sid: null, a: true, r: '', love: null, seen: [], voice: false, doused: [] });

  s.on('create', ({ name, token }) => {
    name = clean(name); if (!name) return err('Hãy nhập tên.');
    const r = newRoom(); rooms.set(r.code, r); const p = mk(name, token); r.P.push(p); enter(r, p);
  });
  s.on('join', ({ code, name, token }) => {
    const r = rooms.get(String(code || '').toUpperCase().trim());
    if (!r) return err('Không tìm thấy phòng.');
    let p = r.P.find(x => x.tok === token);
    if (!p) {
      name = clean(name); if (!name) return err('Hãy nhập tên.');
      if (r.ph !== 'lobby') return err('Ván đang diễn ra, chưa vào được.');
      if (r.P.length >= 12) return err('Phòng đã đủ 12 người.');
      if (r.P.some(x => x.n === name)) return err('Tên này đã có người dùng.');
      p = mk(name, token); r.P.push(p);
    }
    enter(r, p);
  });
  s.on('start', () => {
    const [r, p] = ctx(); if (!r || r.P[0] !== p || !['lobby', 'over'].includes(r.ph)) return;
    if (r.P.length < 5) return err('Cần ít nhất 5 người.');
    begin(r);
  });
  s.on('voice', on => { const [r, p] = ctx(); if (!r) return; p.voice = !!on; bc(r); });
  s.on('sig', ({ to, data } = {}) => { const [r, p] = ctx(); if (!r) return; const t = gp(r, to); if (t && t.sid) io.to(t.sid).emit('sig', { from: p.i, data }); });
  s.on('act', d => { const [r, p] = ctx(); if (r && d) act(r, p, d); });
  s.on('chat', text => {
    const [r, p] = ctx(); if (!r) return;
    text = String(text || '').trim().slice(0, 160); if (!text) return;
    if (r.ph === 'day' && p.i === r.muted) return err('Bạn bị bịt miệng, không được nói hôm nay.');
    let c = 'c';
    if (!['lobby', 'over'].includes(r.ph)) { if (!p.a) c = 'd'; else if (r.ph === 'night') c = isW(p) ? 'w' : null; }
    if (!c) return err('Ban đêm chỉ Sói được nói chuyện.');
    r.log.push({ c, f: p.n, t: text }); bc(r);
  });
  s.on('disconnect', () => {
    const [r, p] = ctx(); if (!r || p.sid !== s.id) return; p.sid = null; p.voice = false;
    if (r.ph === 'lobby') r.P = r.P.filter(x => x !== p);
    if (r.P.every(x => !x.sid)) { clearTimeout(r.tm); rooms.delete(r.code); } else bc(r);
  });
});
srv.listen(process.env.PORT || 3000, () => console.log('Ma Sói chạy tại cổng ' + (process.env.PORT || 3000)));
