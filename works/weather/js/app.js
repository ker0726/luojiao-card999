/* ============================================================
 * 天气助手 — 前端主逻辑
 * 数据：Open-Meteo（直连）· 和风天气/高德（经服务端代理，Key 不落地前端）
 * ============================================================ */
'use strict';

/* ---------- 小工具 ---------- */
const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 配额满则忽略 */ } },
};
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* 客户端令牌桶限流：容量 10，每 150ms 回填 1 个（≈6.7 QPS，低于 10） */
let tokens = 10, lastRefill = Date.now();
async function throttle() {
  for (;;) {
    const now = Date.now();
    tokens = Math.min(10, tokens + (now - lastRefill) / 150);
    lastRefill = now;
    if (tokens >= 1) { tokens -= 1; return; }
    await new Promise(r => setTimeout(r, 60));
  }
}
async function fetchJSON(url, timeoutMs = 8000) {
  await throttle();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('请求超时');
    throw e;
  } finally { clearTimeout(t); }
}
/* Open-Meteo 三级链路：浏览器直连 → 服务端代理（直连被网络阻断时）→ localStorage 旧缓存 */
async function omJSON(url, opts = {}) {
  let direct = null;
  try { direct = await cachedJSON(url, { ttlMs: opts.ttlMs, lsKey: null }); } catch { }
  if (direct) {
    if (opts.lsKey) store.set(opts.lsKey, { ts: Date.now(), data: direct });
    return direct;
  }
  try {
    const u = new URL(url);
    const viaProxy = await cachedJSON(`/api/om?host=${u.host}&path=${encodeURIComponent(u.pathname + u.search)}`, { ttlMs: opts.ttlMs, lsKey: null });
    if (opts.lsKey) store.set(opts.lsKey, { ts: Date.now(), data: viaProxy });
    return viaProxy;
  } catch { }
  if (opts.lsKey) {
    const snap = store.get(opts.lsKey, null);
    if (snap) return { ...snap.data, __offline: true };
  }
  throw new Error('数据源不可达');
}
/* 内存 + 离线两级缓存 */
const memCache = new Map();
async function cachedJSON(url, { ttlMs = 600000, lsKey = null } = {}) {
  const hit = memCache.get(url);
  if (hit && Date.now() < hit.exp) return hit.data;
  try {
    const data = await fetchJSON(url);
    memCache.set(url, { exp: Date.now() + ttlMs, data });
    if (lsKey) store.set(lsKey, { ts: Date.now(), data });
    return data;
  } catch (e) {
    if (lsKey) {
      const snap = store.get(lsKey, null);
      if (snap) return { ...snap, __offline: true };
    }
    throw e;
  }
}

/* ---------- WMO 天气代码 ---------- */
const WMO = {
  0: ['晴', '☀️', 'clear'], 1: ['晴间多云', '🌤️', 'clear'], 2: ['多云', '⛅', 'cloud'], 3: ['阴', '☁️', 'cloud'],
  45: ['雾', '🌫️', 'fog'], 48: ['雾凇', '🌫️', 'fog'],
  51: ['毛毛雨', '🌦️', 'rain'], 53: ['毛毛雨', '🌦️', 'rain'], 55: ['浓毛毛雨', '🌧️', 'rain'],
  56: ['冻毛毛雨', '🌧️', 'rain'], 57: ['冻毛毛雨', '🌧️', 'rain'],
  61: ['小雨', '🌦️', 'rain'], 63: ['中雨', '🌧️', 'rain'], 65: ['大雨', '🌧️', 'rain'],
  66: ['冻雨', '🌧️', 'rain'], 67: ['强冻雨', '🌧️', 'rain'],
  71: ['小雪', '🌨️', 'snow'], 73: ['中雪', '🌨️', 'snow'], 75: ['大雪', '❄️', 'snow'], 77: ['雪粒', '🌨️', 'snow'],
  80: ['阵雨', '🌦️', 'rain'], 81: ['阵雨', '🌧️', 'rain'], 82: ['强阵雨', '⛈️', 'rain'],
  85: ['阵雪', '🌨️', 'snow'], 86: ['阵雪', '❄️', 'snow'],
  95: ['雷阵雨', '⛈️', 'rain'], 96: ['雷雨伴冰雹', '⛈️', 'rain'], 99: ['雷雨伴冰雹', '⛈️', 'rain'],
};
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
function wmo(code, isDay = 1) {
  const e = WMO[code] || ['未知', '🌡️', 'cloud'];
  let icon = e[1];
  if (!isDay && e[2] === 'clear') icon = '🌙';
  return { text: e[0], icon, kind: e[2] };
}
const WIND_DIRS = ['北', '东北偏北', '东北', '东北偏东', '东', '东南偏东', '东南', '东南偏南', '南', '西南偏南', '西南', '西南偏西', '西', '西北偏西', '西北', '西北偏北'];
function windDir(d) { return WIND_DIRS[Math.round(((d % 360) / 22.5)) % 16] + '风'; }
function uvLevel(u) { return u < 3 ? '弱' : u < 6 ? '中等' : u < 8 ? '强' : u < 11 ? '很强' : '极强'; }
function hhmm(iso) { return (iso || '').slice(11, 16); }
function weekday(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(y, m - 1, d).getDay()];
}
const locKey = (loc) => loc.lat.toFixed(3) + ',' + loc.lon.toFixed(3);

/* ---------- 状态 ---------- */
const state = {
  loc: null,
  snap: null,            // 当前渲染的快照（含 __offline / __calibrating 标记）
  unit: store.get('wx:unit', 'c'),
  theme: store.get('wx:theme', 'auto'),
  cities: store.get('wx:cities', []),
  active: store.get('wx:active', 0),
  proxy: { hefeng: false, amap: false },
  omDownUntil: 0, // Open-Meteo 熔断：备源成功后 5 分钟内跳过 OM 直连，切城秒出
  keyWarned: false,
  outfit: store.get('wx:outfit', { gender: 'f', style: 'casual' }),
};
const fmtT = (v) => v === null || v === undefined || !isFinite(v) ? '--' : Math.round(state.unit === 'f' ? v * 9 / 5 + 32 : v);

/* ---------- 主题 / 单位 ---------- */
function applyTheme() {
  const dark = state.theme === 'dark' || (state.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.dataset.theme = dark ? 'dark' : 'light';
  $('#themeBtn').textContent = state.theme === 'auto' ? '🌗' : state.theme === 'dark' ? '🌙' : '☀️';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => state.theme === 'auto' && applyTheme());
$('#themeBtn').onclick = () => {
  state.theme = state.theme === 'auto' ? 'dark' : state.theme === 'dark' ? 'light' : 'auto';
  store.set('wx:theme', state.theme); applyTheme();
};
$('#unitBtn').onclick = () => {
  state.unit = state.unit === 'c' ? 'f' : 'c';
  store.set('wx:unit', state.unit);
  $('#unitBtn').textContent = state.unit === 'c' ? '°C' : '°F';
  if (state.snap) renderAll(state.snap);
};

/* ---------- 提示条 ---------- */
let noticeTimer = null;
function setNotice(html, kind = 'info', autoHideMs = 0) {
  const bar = $('#noticeBar');
  bar.className = 'notice-bar' + (kind === 'warn' ? ' warn' : '');
  bar.innerHTML = html + ' <button class="nb-close" aria-label="关闭">✕</button>';
  bar.hidden = false;
  bar.querySelector('.nb-close').onclick = () => { bar.hidden = true; };
  clearTimeout(noticeTimer);
  if (autoHideMs) noticeTimer = setTimeout(() => { bar.hidden = true; }, autoHideMs);
}
const hideNotice = () => { $('#noticeBar').hidden = true; };

/* 轻提示 toast：每个操作都有明确反馈 */
function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

/* ---------- 天气背景 ---------- */
let bgTimer = null;
function setWeatherBg(kind, isDay) {
  const cls = ['w-clear', 'w-clear-night', 'w-cloud', 'w-rain', 'w-snow', 'w-fog'];
  let c = 'w-cloud';
  if (kind === 'clear') c = isDay ? 'w-clear' : 'w-clear-night';
  else if (kind === 'rain') c = 'w-rain';
  else if (kind === 'snow') c = 'w-snow';
  else if (kind === 'fog') c = 'w-fog';
  else if (kind === 'cloud') c = 'w-cloud';
  document.body.classList.remove(...cls);
  document.body.classList.add(c);
  const fx = $('#bgFx'); fx.innerHTML = ''; clearInterval(bgTimer);
  const rnd = (a, b) => a + Math.random() * (b - a);
  if (c === 'w-cloud' || c === 'w-clear' || c === 'w-clear-night') {
    for (let i = 0; i < 3; i++) {
      const cl = document.createElement('div'); cl.className = 'cloud';
      cl.style.cssText = `top:${8 + i * 22}%;width:${rnd(180, 320)}px;height:${rnd(60, 110)}px;animation-duration:${rnd(50, 90)}s;animation-delay:-${rnd(0, 60)}s;opacity:${c === 'w-clear-night' ? .5 : 1}`;
      fx.appendChild(cl);
    }
  }
  const makeFall = (maker, n, gap) => {
    maker(n);
    bgTimer = setInterval(() => maker(n), gap);
  };
  if (c === 'w-rain') makeFall((n) => {
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div'); d.className = 'drop';
      d.style.cssText = `left:${rnd(0, 100)}%;animation-delay:-${rnd(0, 1)}s;opacity:${rnd(.3, .8)}`;
      fx.appendChild(d); setTimeout(() => d.remove(), 1200);
    }
  }, 26, 220);
  if (c === 'w-snow') makeFall((n) => {
    for (let i = 0; i < n; i++) {
      const f = document.createElement('div'); f.className = 'flake'; f.textContent = '❄';
      f.style.cssText = `left:${rnd(0, 100)}%;font-size:${rnd(10, 18)}px;animation-duration:${rnd(5, 9)}s;animation-delay:-${rnd(0, 8)}s;opacity:${rnd(.4, .9)}`;
      fx.appendChild(f); setTimeout(() => f.remove(), 9500);
    }
  }, 6, 1500);
}

/* ---------- API URL ---------- */
const FORECAST_URL = (loc, model = 'best_match') =>
  `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
  `&model=${model}&timezone=auto&forecast_days=16` +
  `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,precipitation,wind_speed_10m,wind_direction_10m,pressure_msl,cloud_cover` +
  `&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,visibility,uv_index` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset`;
const MINUTELY_URL = (loc) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&timezone=auto&minutely_15=precipitation&forecast_minutely_15=8`;
const AIR_URL = (loc) =>
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.lat}&longitude=${loc.lon}&timezone=auto&current=pm10,pm2_5,ozone,nitrogen_dioxide,us_aqi`;
const SEARCH_URL = (q) => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=zh&format=json`;
const REVERSE_URL = (lat, lon) => `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`;

/* ---------- 和风 / 高德代理 ---------- */
async function hfProxy(ep) {
  if (!state.proxy.hefeng) return null;
  try {
    const r = await fetchJSON(`/api/qweather/${ep}?lat=${state.loc.lat}&lon=${state.loc.lon}`);
    if (r.ok) return r.data;
    if (r.reason === 'KEY_INVALID' && !state.keyWarned) {
      state.keyWarned = true;
      setNotice('⚠️ 和风天气 Key 无效或欠费，分钟级降水/预警/生活指数已自动降级为 Open-Meteo 模型数据。', 'warn', 12000);
    }
    return null;
  } catch { return null; }
}
async function amapIP() {
  if (!state.proxy.amap) return null;
  try { const r = await fetchJSON('/api/amap/ip'); return r.ok ? r.data : null; } catch { return null; }
}

/* ---------- 中国天气网应急备源（主链路全部不可达时启用） ---------- */
const CN_CODE_MAP = [
  ['雷', 95], ['冰雹', 96], ['雨夹雪', 68], ['冻雨', 56], ['沙尘', 45], ['扬沙', 45], ['浮尘', 45],
  ['暴雨', 65], ['大雨', 65], ['中雨', 63], ['阵雨', 80], ['小雨', 61], ['雨', 61],
  ['暴雪', 75], ['大雪', 75], ['中雪', 73], ['小雪', 71], ['阵雪', 85], ['雪', 71],
  ['雾', 45], ['霾', 45], ['阴', 3], ['多云', 2], ['晴', 0],
];
const cnCode = (t) => { t = t || ''; for (const [k, v] of CN_CODE_MAP) if (t.includes(k)) return v; return 3; };
const cnPP = (t) => { t = t || ''; if (/暴雨|大雨/.test(t)) return 90; if (/中雨|阵雨|中雪|大雪/.test(t)) return 80; if (/雷/.test(t)) return 75; if (/小雨|小雪|雨夹雪/.test(t)) return 65; if (/雾|冻雨/.test(t)) return 40; if (/阴/.test(t)) return 25; if (/多云/.test(t)) return 15; return 8; };
const cnCloud = (t) => { t = t || ''; if (/晴/.test(t)) return 8; if (/多云/.test(t)) return 45; if (/阴/.test(t)) return 92; return 100; };
const cnMM = (t) => { t = t || ''; if (/暴雨/.test(t)) return 20; if (/大雨/.test(t)) return 8; if (/中雨|雷/.test(t)) return 2.5; if (/阵雨|小雨|雨/.test(t)) return 0.6; if (/雪/.test(t)) return 1; return 0; };
const cnSR = (month) => {
  const sr = [7.2, 7.0, 6.5, 6.2, 5.5, 5.3, 5.4, 5.7, 6.0, 6.3, 6.7, 7.1][month - 1];
  const ss = [17.5, 18.1, 18.5, 18.8, 19.2, 19.5, 19.5, 19.1, 18.4, 17.7, 17.3, 17.3][month - 1];
  const f = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  return [f(sr), f(ss)];
};
async function buildCNSnapshot(loc) {
  const name = (loc.name && !/位置|城市/.test(loc.name)) ? loc.name : (loc.admin || '');
  const r = await fetchJSON(`/api/cnweather?name=${encodeURIComponent(name)}`, 10000);
  if (!r.ok) throw new Error('CN_SOURCE_' + (r.reason || 'FAIL'));
  const d = r.data, sk = d.sk || {}, now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  const mkDate = (day, base) => { // day < 昨天 → 跨月
    const dt = new Date(base.getFullYear(), base.getMonth(), day, 12);
    if (day < base.getDate() - 1) dt.setMonth(dt.getMonth() + 1);
    return dt;
  };
  // 逐小时（3 小时级，展平 1d/23d/45d/67d）
  const flat = [];
  if (d.hour3) for (const k of ['1d', '23d', '45d', '67d']) {
    const v = d.hour3[k];
    if (Array.isArray(v)) for (const x of v) flat.push(...(Array.isArray(x) ? x : [x]));
  }
  const H = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], visibility: [], uv_index: [] };
  const hourRows = [];
  for (const e of flat) {
    const p = String(e).split(',');
    if (p.length < 5) continue;
    const dm = p[0].match(/(\d+)日(\d+)时/);
    if (!dm) continue;
    const dt = mkDate(+dm[1], now); dt.setHours(+dm[2], 0, 0, 0);
    if (dt.getTime() < now.getTime() - 2 * 3600e3) continue;
    const t = parseFloat(p[3]);
    if (!isFinite(t)) continue;
    hourRows.push({ dt, t, code: cnCode(p[2]), pp: cnPP(p[2]), mm: cnMM(p[2]) });
  }
  hourRows.sort((a, b) => a.dt - b.dt); // 各天数组顺序不保证单调，按时间排序
  for (const r of hourRows) {
    H.time.push(iso(r.dt)); H.temperature_2m.push(r.t); H.apparent_temperature.push(r.t);
    H.weather_code.push(r.code); H.precipitation_probability.push(r.pp); H.precipitation.push(r.mm);
    H.visibility.push(10000); H.uv_index.push(2);
  }
  // 7 天
  const days = (d.days || []).slice(0, 7);
  const [srT, ssT] = cnSR(now.getMonth() + 1);
  const D = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], uv_index_max: [], sunrise: [], sunset: [] };
  days.forEach((dy, i) => {
    const dt = mkDate(dy.day, now);
    const ds = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    D.time.push(ds); D.weather_code.push(cnCode(dy.text));
    D.temperature_2m_max.push(dy.hi); D.temperature_2m_min.push(dy.lo);
    D.precipitation_probability_max.push(cnPP(dy.text));
    D.uv_index_max.push(/雨|雪/.test(dy.text) ? 1 : 3);
    D.sunrise.push(`${ds}T${srT}`); D.sunset.push(`${ds}T${ssT}`);
  });
  if (!H.time.length || !D.time.length) throw new Error('CN_SOURCE_PARSE');
  const isDay = now.getHours() >= 6 && now.getHours() < 18 ? 1 : 0;
  const t = parseFloat(sk.temp);
  const aqiV = sk.aqi ? Math.round(parseFloat(sk.aqi) * 1.35) : null;
  return {
    ts: Date.now(), offline: false, __backup: true, nowIdx: 0, domestic: null,
    loc, hf: {}, minutely15: null,
    current: {
      time: iso(now), temperature_2m: isFinite(t) ? t : D.temperature_2m_max[0] - 2,
      apparent_temperature: isFinite(t) ? t : D.temperature_2m_max[0] - 2,
      relative_humidity_2m: parseInt(sk.SD) || 50, is_day: isDay,
      weather_code: cnCode(sk.weather), precipitation: parseFloat(sk.rain) || 0,
      wind_speed_10m: parseFloat(sk.wse) || 5, wind_direction_10m: 0,
      pressure_msl: parseFloat(sk.qy) || 1013, cloud_cover: cnCloud(sk.weather),
    },
    hourly: H, daily: D,
    aqi: aqiV != null ? { us_aqi: aqiV, pm2_5: parseFloat(sk.aqi_pm25) || 0, pm10: 0, ozone: 0, nitrogen_dioxide: 0 } : null,
  };
}

/* ---------- 合理性闸门（本项目灵魂之一） ---------- */
function validateSnapshot(s, prevSnap) {
  const errs = [];
  const c = s.current;
  if (!c || !isFinite(c.temperature_2m)) return ['missing'];
  if (c.temperature_2m < -55 || c.temperature_2m > 55) errs.push('temp_range');
  if (c.apparent_temperature < -60 || c.apparent_temperature > 65) errs.push('feels_range');
  const T = s.hourly.temperature_2m || [];
  for (let i = 0; i < Math.min(T.length - 1, 48); i++) {
    if (isFinite(T[i]) && isFinite(T[i + 1]) && Math.abs(T[i + 1] - T[i]) > 15) { errs.push('hourly_jump'); break; }
  }
  const { temperature_2m_max: MX, temperature_2m_min: MN } = s.daily;
  for (let i = 0; i < Math.min(MX.length, MN.length); i++) {
    if (MX[i] < MN[i] || MX[i] > 60 || MN[i] < -60) { errs.push('daily_sanity'); break; }
  }
  // 与上一时次对比：45 分钟内温差 >15℃ 视为异常突变
  if (prevSnap && prevSnap.current && Date.now() - prevSnap.ts < 45 * 60000) {
    if (Math.abs(prevSnap.current.temperature_2m - c.temperature_2m) > 15) errs.push('temp_jump');
  }
  return errs;
}
/* 调试钩子：window.WX_DEBUG.injectTemp(50) 可验证闸门（验收标准 3） */
window.WX_DEBUG = {
  injectTemp(v) {
    if (!state.snap) return console.warn('无快照');
    const bad = JSON.parse(JSON.stringify(state.snap));
    bad.current.temperature_2m = v;
    bad.hourly.temperature_2m[bad.nowIdx] = v;
    const errs = validateSnapshot(bad, state.snap);
    console.log('[WX_DEBUG] 注入温度', v, '→ 闸门判定:', errs);
    if (errs.length) { showCalibrating(); return errs; }
    return errs;
  },
};

/* ---------- 拉取并构建快照 ---------- */
async function fetchSnapshot(loc) {
  const key = locKey(loc);
  // OM 熔断中：直接走中国天气网备源（避免每次切城都等直连+代理超时）
  if (Date.now() < state.omDownUntil) return await buildCNSnapshot(loc);
  const [fRes, aRes, mRes, hfNowRes, hfWarnRes, hfMinRes, hfIdxRes] = await Promise.allSettled([
    omJSON(FORECAST_URL(loc), { ttlMs: 10 * 60000, lsKey: 'wx:fc:' + key }),      // 实况 10 分钟
    omJSON(AIR_URL(loc), { ttlMs: 30 * 60000, lsKey: 'wx:aq:' + key }),
    omJSON(MINUTELY_URL(loc), { ttlMs: 10 * 60000, lsKey: 'wx:m15:' + key }),
    hfProxy('now'), hfProxy('warning'), hfProxy('minutely'), hfProxy('indices'),
  ]);
  if (fRes.status !== 'fulfilled') {
    // 主链路（直连→服务端代理→本地缓存）全部失败 → 中国天气网应急备源，并熔断 OM 5 分钟
    state.omDownUntil = Date.now() + 5 * 60000;
    return await buildCNSnapshot(loc);
  }
  state.omDownUntil = 0;
  const raw = fRes.value;
  const offline = !!raw.__offline;
  const nowIdx = Math.max(0, (raw.hourly.time || []).findIndex(t => t >= raw.current.time.slice(0, 13) + ':00'));
  const slice = (arr, n = 48) => (arr || []).slice(nowIdx, nowIdx + n);
  const m15 = mRes.status === 'fulfilled' && mRes.value.minutely_15 ? {
    time: (mRes.value.minutely_15.time || []).slice(0, 8),
    precip: (mRes.value.minutely_15.precipitation || []).slice(0, 8),
  } : null;

  const snap = {
    ts: offline ? (raw.ts || Date.now()) : Date.now(),
    offline, loc,
    current: raw.current,
    nowIdx,
    hourly: {
      time: slice(raw.hourly.time),
      temperature_2m: slice(raw.hourly.temperature_2m),
      apparent_temperature: slice(raw.hourly.apparent_temperature),
      precipitation_probability: slice(raw.hourly.precipitation_probability),
      precipitation: slice(raw.hourly.precipitation),
      weather_code: slice(raw.hourly.weather_code),
      visibility: slice(raw.hourly.visibility),
      uv_index: slice(raw.hourly.uv_index),
    },
    daily: {
      time: (raw.daily.time || []).slice(0, 16),
      weather_code: (raw.daily.weather_code || []).slice(0, 16),
      temperature_2m_max: (raw.daily.temperature_2m_max || []).slice(0, 16),
      temperature_2m_min: (raw.daily.temperature_2m_min || []).slice(0, 16),
      precipitation_probability_max: (raw.daily.precipitation_probability_max || []).slice(0, 16),
      uv_index_max: (raw.daily.uv_index_max || []).slice(0, 16),
      sunrise: (raw.daily.sunrise || []).slice(0, 16),
      sunset: (raw.daily.sunset || []).slice(0, 16),
    },
    minutely15: m15,
    aqi: aRes.status === 'fulfilled' && !aRes.value.__offline ? aRes.value.current : null,
    hf: {
      now: hfNowRes.status === 'fulfilled' ? hfNowRes.value : null,
      warning: hfWarnRes.status === 'fulfilled' && hfWarnRes.value ? (hfWarnRes.value.warning || []) : null,
      minutely: hfMinRes.status === 'fulfilled' ? hfMinRes.value : null,
      indices: hfIdxRes.status === 'fulfilled' && hfIdxRes.value ? (hfIdxRes.value.daily || []) : null,
    },
  };
  return snap;
}

/* ---------- 双源交叉校验（和风 vs Open-Meteo） ---------- */
function crossCheck(snap) {
  const hf = snap.hf.now;
  if (!hf || !hf.now) return;
  const hfT = parseFloat(hf.now.temp);
  const omT = snap.current.temperature_2m;
  if (!isFinite(hfT)) return;
  const hfText = (hf.now.text || '');
  const hfWet = /雨|雪|雷|雹/.test(hfText);
  const omWet = RAIN_CODES.has(snap.current.weather_code) || SNOW_CODES.has(snap.current.weather_code);
  let adopt = false;
  if (Math.abs(hfT - omT) > 5) {
    setNotice(`⚖️ 两个数据源对该地气温分歧较大（Open-Meteo ${fmtT(omT)}° / 和风天气 ${fmtT(hfT)}°），已优先采用国内源并持续观察。`, 'warn', 15000);
    adopt = true;
  } else if (hfWet !== omWet) {
    setNotice(`⚖️ 数据源对天气现象判断不一致（Open-Meteo「${wmo(snap.current.weather_code, snap.current.is_day).text}」/ 和风「${hfText}」），已优先采用国内源。`, 'warn', 15000);
    adopt = true;
  }
  if (adopt) {
    snap.domestic = {
      temp: hfT,
      feels: parseFloat(hf.now.feelsLike),
      text: hfText,
      code: hf.now.icon,
      windDir: hf.now.windDir, windScale: hf.now.windScale, windSpeed: hf.now.windSpeed,
      humidity: parseInt(hf.now.humidity),
    };
  }
}

/* ---------- 渲染 ---------- */
/* 启动页：首次渲染后淡出（保证至少展示 900ms，避免一闪而过） */
const SPLASH_TS = Date.now();
let splashDone = false;
function hideSplash() {
  if (splashDone) return;
  splashDone = true;
  const el = $('#splash');
  if (!el) return;
  const wait = Math.max(0, 250 - (Date.now() - SPLASH_TS));
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 500); }, wait);
}

function renderAll(snap) {
  state.snap = snap;
  hideSplash();
  $('#skeleton').style.display = 'none';
  $('#errorBox').hidden = true;
  $('#content').hidden = false;
  const cur = snap.domestic
    ? { ...snap.current, temperature_2m: snap.domestic.temp, apparent_temperature: snap.domestic.feels ?? snap.current.apparent_temperature }
    : snap.current;
  const w = wmo(snap.current.weather_code, snap.current.is_day);
  setWeatherBg(w.kind, snap.current.is_day);

  // 实况卡
  $('#curIcon').textContent = w.icon;
  $('#curTemp').textContent = fmtT(cur.temperature_2m);
  $('#curDeg').textContent = state.unit === 'f' ? '°F' : '°C';
  $('#curDesc').textContent = (snap.domestic ? snap.domestic.text : w.text) + ` · ${snap.loc.name}`;
  // 右侧 2×2 信息块：平衡大温度的视觉重量（体感/最高/最低/今日降水概率）
  const ppToday = Math.round(snap.daily.precipitation_probability_max?.[0] ?? 0);
  $('#currentSide').innerHTML = `
    <div class="cs-item"><span class="cs-label">体感</span><span class="cs-val">${fmtT(cur.apparent_temperature)}°<button class="why-btn" id="feelsWhy" title="为什么体感和气温不同？">?</button></span></div>
    <div class="cs-item"><span class="cs-label">最高</span><span class="cs-val">${fmtT(snap.daily.temperature_2m_max[0])}°</span></div>
    <div class="cs-item"><span class="cs-label">最低</span><span class="cs-val">${fmtT(snap.daily.temperature_2m_min[0])}°</span></div>
    <div class="cs-item"><span class="cs-label">降水概率</span><span class="cs-val">${ppToday}%</span></div>`;
  // 快速指标三小格（湿度 / 风 / 气压），丰富首屏大卡、填补纵向空间
  const wd = windDir(snap.current.wind_direction_10m);
  const quick = [
    { ic: '💧', label: '湿度', val: Math.round(snap.current.relative_humidity_2m) + '%' },
    { ic: '🌬', label: '风', val: `${wd} ${Math.round(snap.current.wind_speed_10m)} km/h` },
    { ic: '🧭', label: '气压', val: Math.round(snap.current.pressure_msl) + ' hPa' },
  ];
  $('#currentQuick').innerHTML = quick.map((q) => `<div class="q-item"><span class="q-ic">${q.ic}</span><span class="q-val">${q.val}</span><span class="q-label">${q.label}</span></div>`).join('');
  $('#conclusion').textContent = buildConclusion(snap);
  $('#feelsWhy').title = '体感温度综合考虑了湿度、风速与日照：湿度高时更闷热，风大时更寒冷。';
  const diff = (cur.apparent_temperature ?? cur.temperature_2m) - cur.temperature_2m;
  $('#feelsWhy').onclick = () => setNotice(
    diff >= 2 ? `💡 体感比气温高约 ${Math.abs(Math.round(diff))}°：主要因为湿度较大（当前 ${Math.round(snap.current.relative_humidity_2m)}%），人体散热变慢，感觉更闷热。`
      : diff <= -2 ? `💡 体感比气温低约 ${Math.abs(Math.round(diff))}°：主要因为风力较大（当前 ${Math.round(snap.current.wind_speed_10m)} km/h），带走体表热量，感觉更冷。`
        : '💡 当前湿度与风力适中，体感温度与气温基本一致。',
    'info', 12000);

  // 数据来源角标（简洁版）
  const srcs = snap.__backup ? ['中国天气网（备源）'] : ['Open-Meteo'];
  if (!snap.__backup && snap.hf.now) srcs.push('和风天气');
  const t = new Date(snap.ts);
  $('#curSource').textContent = `数据更新于 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} · 来源 ${srcs.join(' / ')}`;

  renderMinutes(snap);
  renderHourly(snap);
  renderDaily(snap);
  renderAQI(snap);
  renderIndices(snap);
  renderOutfit(snap);
  renderGrid(snap);
  renderAlerts(snap);
  renderRadar(snap);
  evalNotify(snap);

  if (snap.offline) setNotice(`📴 当前为离线数据，更新于 ${hhmm('2000-01-01T' + new Date(snap.ts).toTimeString().slice(0, 8))} 前后，恢复网络后自动刷新。`, 'warn');
  else if (snap.__calibrating) setNotice('⚠️ 主数据源返回异常值，已触发数据校准：当前展示的是备用源/缓存数据。', 'warn');
  else if (snap.__backup) setNotice('🛟 实时主数据源暂时不可达，当前为中国天气网备源数据（精度稍低），恢复后自动切回。', 'warn', 15000);
  else hideNotice();
}

/* 一句话结论 */
function buildConclusion(s) {
  const c = s.current, H = s.hourly;
  const today = H.time[0].slice(0, 10);
  const tomorrow = s.daily.time[1] || '';
  const omWet = RAIN_CODES.has(c.weather_code) || SNOW_CODES.has(c.weather_code) || c.precipitation > 0.08;
  const todayIdx = [];
  for (let i = 0; i < H.time.length; i++) if (H.time[i].slice(0, 10) === today) todayIdx.push(i);

  if (omWet) {
    let stop = null;
    for (const i of todayIdx) if (i > s.nowIdx && (H.precipitation_probability[i] || 0) < 40 && (H.precipitation[i] || 0) < 0.1) { stop = i; break; }
    const kind = SNOW_CODES.has(c.weather_code) ? '下雪' : '在下雨';
    return stop ? `现在正${kind}，预计 ${hhmm(H.time[stop])} 前后转好，出门带伞，路滑注意安全。`
      : `现在正${kind}且可能持续，出门务必带伞。`;
  }
  for (const i of todayIdx) {
    if (i > s.nowIdx && ((H.precipitation_probability[i] || 0) >= 50 || (H.precipitation[i] || 0) >= 0.3)) {
      return `预计今天 ${hhmm(H.time[i])} 前后可能有雨（降水概率 ${Math.round(H.precipitation_probability[i] || 0)}%），出门建议带伞。`;
    }
  }
  if (tomorrow) {
    const H2all = null; // 逐小时已含明天时段（48h 窗口）
    for (let i = 0; i < H.time.length; i++) {
      if (H.time[i].slice(0, 10) === tomorrow && ((H.precipitation_probability[i] || 0) >= 50 || (H.precipitation[i] || 0) >= 0.3)) {
        return `今天基本无雨；明天 ${hhmm(H.time[i])} 前后可能有雨，届时记得带伞。`;
      }
    }
  }
  const feelsMin = Math.min(...(H.apparent_temperature || []).slice(0, 24).filter(isFinite));
  const t = feelsMin < 5 ? '，早晚体感较冷，注意添衣' : feelsMin > 32 ? '，体感闷热，注意防暑补水' : '';
  return `未来 24 小时降水概率低，可以不带伞${t}。`;
}

/* 分钟级降水条 */
function renderMinutes(s) {
  const tag = $('#minuteTag'), sum = $('#minuteSummary'), strip = $('#minuteStrip');
  let steps = [], label = '';
  const hfM = s.hf.minutely;
  if (hfM && hfM.minutely_5m && hfM.minutely_5m.length) {
    steps = hfM.minutely_5m.slice(0, 24).map(x => ({ t: x.time.slice(11, 16), p: parseFloat(x.precip) || 0 }));
    label = '雷达 · 5 分钟级';
  } else if (s.minutely15 && s.minutely15.precip && s.minutely15.precip.length) {
    steps = s.minutely15.time.map((t, i) => ({ t: t.slice(11, 16), p: s.minutely15.precip[i] || 0 }));
    label = '模型 · 15 分钟级';
  } else if (s.hourly.precipitation && s.hourly.precipitation.length) {
    steps = s.hourly.time.slice(0, 2).map((t, i) => ({ t: t.slice(11, 16), p: s.hourly.precipitation[i] || 0 }));
    label = '小时级（降级显示）';
  }
  if (!steps.length) { tag.textContent = '暂无数据'; strip.innerHTML = ''; return; }
  tag.textContent = label;
  const wet = steps.filter(x => x.p >= 0.08);
  let summary;
  if (!wet.length) summary = '未来 2 小时无降水，放心出门 🙌';
  else if (steps[0].p >= 0.08) {
    const stop = steps.find(x => x.p < 0.08);
    summary = `现在正在下，预计 ${stop ? stop.t + ' 前后' : '2 小时内不会'}停${SNOW_CODES.has(s.current.weather_code) ? '（雪）' : ''}，出门带伞。`;
  } else {
    const start = wet[0];
    const kind = start.p >= 1 ? '较大的降雨' : start.p >= 0.25 ? '降雨' : '零星小雨';
    summary = `预计 ${start.t} 开始有${kind}（2 小时内），要出门的话趁早或带伞。`;
  }
  sum.textContent = hfM && hfM.minutely && hfM.minutely.summary && !wet.length ? '未来 2 小时无降水，放心出门 🙌（' + hfM.minutely.summary + '）' : summary;
  const max = Math.max(0.5, ...steps.map(x => x.p));
  strip.innerHTML = steps.map((x, i) => {
    const h = Math.max(6, Math.min(100, (x.p / max) * 100));
    const cls = i === 0 ? ' now-mark' : '';
    const wet = x.p >= 0.05;
    return `<div class="m-bar${cls}" title="${x.t} · ${x.p.toFixed(1)} mm"><div class="fill" style="height:${wet ? h : 0}%"></div>${wet ? '' : '<div class="dot"></div>'}</div>`;
  }).join('');
  const first = steps[0].t, last = steps[steps.length - 1].t;
  strip.insertAdjacentHTML('afterend', `<div class="m-scale"><span>${first}</span><span>${steps[Math.floor(steps.length / 2)].t}</span><span>${last}</span></div>`);
  const old = strip.parentElement.querySelector('.m-scale:not(:last-child)');
  if (old) old.remove();
}

/* 逐小时图表（SVG） */
function renderHourly(s) {
  const H = s.hourly, N = H.time.length, CW = 56;
  const W = N * CW, HGT = 226;
  const temps = H.temperature_2m;
  let tMin = Math.min(...temps), tMax = Math.max(...temps);
  if (!isFinite(tMin) || !isFinite(tMax)) { tMin = 0; tMax = 1; }
  if (tMax - tMin < 4) { tMin -= 2; tMax += 2; }
  const y = (v) => 118 - ((v - tMin) / (tMax - tMin)) * 78; // 温度线区域 40~118
  const pts = temps.map((v, i) => `${i * CW + CW / 2},${y(v)}`).join(' ');
  const area = `M0,${HGT} L` + pts.replace(/ /g, ' L') + ` L${W},${HGT} Z`;
  let svg = `<svg width="${W}" height="${HGT}" viewBox="0 0 ${W} ${HGT}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6fed" stop-opacity=".22"/><stop offset="1" stop-color="#2f6fed" stop-opacity="0"/></linearGradient></defs>`;
  // 日期分隔线
  const firstDate = H.time[0].slice(0, 10);
  for (let i = 0; i < N; i++) {
    if (i > 0 && H.time[i].slice(0, 10) !== H.time[i - 1].slice(0, 10)) {
      svg += `<line x1="${i * CW}" y1="20" x2="${i * CW}" y2="186" stroke="var(--line)" stroke-dasharray="4 4"/><text x="${i * CW + 6}" y="16" font-size="10" fill="var(--text-2)">${H.time[i].slice(5, 10).replace('-', '/')} ${weekday(H.time[i])}</text>`;
    }
  }
  // 降水概率柱
  for (let i = 0; i < N; i++) {
    const p = H.precipitation_probability[i];
    if (p >= 5) {
      const bh = Math.max(3, (p / 100) * 44);
      svg += `<rect x="${i * CW + CW / 2 - 9}" y="${188 - bh}" width="18" height="${bh}" rx="3" fill="#3b82f6" opacity=".75"/>`;
      if (p >= 30) svg += `<text x="${i * CW + CW / 2}" y="${188 - bh - 4}" text-anchor="middle" font-size="10" fill="#3b82f6">${Math.round(p)}%</text>`;
    }
  }
  svg += `<path d="${area}" fill="url(#tg)"/>`;
  svg += `<polyline points="${pts}" fill="none" stroke="#2f6fed" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  const dot = s.nowIdx === 0 ? 0 : -1; // 当前小时高亮
  // 温度标注（每 3 小时）+ 圆点
  for (let i = 0; i < N; i++) {
    if (i === 0) svg += `<circle cx="${CW / 2}" cy="${y(temps[i])}" r="4" fill="#2f6fed" stroke="#fff" stroke-width="1.5"/>`;
    if (i % 3 === 0) svg += `<text x="${i * CW + CW / 2}" y="${y(temps[i]) - 9}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text)">${fmtT(temps[i])}°</text>`;
  }
  // 小时标签
  for (let i = 0; i < N; i += 3) {
    svg += `<text x="${i * CW + CW / 2}" y="205" text-anchor="middle" font-size="10.5" fill="var(--text-2)">${i === 0 ? '现在' : H.time[i].slice(11, 16)}</text>`;
  }
  svg += '</svg>';
  $('#hourChart').innerHTML = svg;

  // 悬停详情
  const wrap = $('#hourScroll'), tip = $('#hourTip');
  wrap.onmousemove = (ev) => {
    const rect = $('#hourChart').getBoundingClientRect();
    const i = Math.max(0, Math.min(N - 1, Math.floor((ev.clientX - rect.left) / CW)));
    tip.hidden = false;
    tip.style.left = Math.max(4, Math.min(wrap.clientWidth - 150, i * CW - wrap.scrollLeft + 4)) + 'px';
    const w = wmo(H.weather_code[i], 1);
    tip.innerHTML = `<b>${i === 0 ? '现在' : H.time[i].slice(5, 16).replace('T', ' ')}</b> ${w.icon} ${w.text}<br>🌡 ${fmtT(temps[i])}° · 体感 ${fmtT(H.apparent_temperature[i])}°<br>💧 ${Math.round(H.precipitation_probability[i] || 0)}% · ${(H.precipitation[i] || 0).toFixed(1)} mm`;
  };
  wrap.onmouseleave = () => { tip.hidden = true; };
  wrap.onscroll = () => { tip.hidden = true; };
}

/* 7 天预报：温度折线图 + 逐日明细 + 长期趋势 */
function renderDaily(s) {
  const D = s.daily, N = 7;
  const mins = D.temperature_2m_min.slice(0, N), maxs = D.temperature_2m_max.slice(0, N);
  const gMin = Math.min(...mins), gMax = Math.max(...maxs), span = Math.max(1, gMax - gMin);

  // 7 天高低温折线图（平滑曲线）
  const CW = 92, W = CW * N, Hc = 140, padT = 32, padB = 24;
  const y = v => padT + (gMax - v) / span * (Hc - padT - padB);
  const x = i => i * CW + CW / 2;
  const smooth = pts => pts.reduce((d, p, i, a) => {
    if (!i) return `M${p.x},${p.y.toFixed(1)}`;
    const q = a[i - 1], cx = ((q.x + p.x) / 2).toFixed(1);
    return d + ` C${cx},${q.y.toFixed(1)} ${cx},${p.y.toFixed(1)} ${p.x},${p.y.toFixed(1)}`;
  }, '');
  const hiPts = maxs.map((v, i) => ({ x: x(i), y: y(v) }));
  const loPts = mins.map((v, i) => ({ x: x(i), y: y(v) }));
  let svg = `<svg viewBox="0 0 ${W} ${Hc}" width="${W}" height="${Hc}" role="img" aria-label="未来 7 天最高最低气温折线图">`;
  svg += `<path class="dc-line-hi" d="${smooth(hiPts)}"/><path class="dc-line-lo" d="${smooth(loPts)}"/>`;
  hiPts.forEach((p, i) => { svg += `<circle class="dc-dot-hi" cx="${p.x}" cy="${p.y.toFixed(1)}" r="3.5"/><text class="dc-val-hi" x="${p.x}" y="${(p.y - 10).toFixed(1)}">${fmtT(maxs[i])}°</text>`; });
  loPts.forEach((p, i) => { svg += `<circle class="dc-dot-lo" cx="${p.x}" cy="${p.y.toFixed(1)}" r="3.5"/><text class="dc-val-lo" x="${p.x}" y="${(p.y + 19).toFixed(1)}">${fmtT(mins[i])}°</text>`; });
  svg += '</svg>';
  $('#dailyChart').innerHTML = svg;

  $('#dailyList').innerHTML = D.time.slice(0, N).map((t, i) => {
    const w = wmo(D.weather_code[i], 1);
    const l = ((mins[i] - gMin) / span) * 100, r = ((maxs[i] - gMin) / span) * 100;
    const pp = D.precipitation_probability_max[i];
    return `<div class="day-row" title="${w.text}">
      <div class="d-name">${i === 0 ? '今天' : i === 1 ? '明天' : weekday(t)}<small>${t.slice(5, 10).replace('-', '/')}</small></div>
      <div class="d-icon">${w.icon}</div>
      <div class="d-pp">${pp >= 30 ? '🌧 ' + Math.round(pp) + '%' : ''}</div>
      <div class="range-wrap"><span>${fmtT(mins[i])}°</span><div class="range-track"><div class="range-fill" style="left:${l}%;width:${Math.max(6, r - l)}%"></div></div><span>${fmtT(maxs[i])}°</span></div>
    </div>`;
  }).join('');
  // 8–16 天只给趋势
  if (D.time.length > 7) {
    const fut = D.time.slice(7), fMax = D.temperature_2m_max.slice(7), fMin = D.temperature_2m_min.slice(7), fPP = D.precipitation_probability_max.slice(7);
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const dMax = avg(fMax) - avg(maxs), dMin = avg(fMin) - avg(mins);
    const wetDays = fPP.filter(p => p >= 50).length;
    const dir = (d) => d > 1.5 ? `偏暖约 ${Math.round(d)}°` : d < -1.5 ? `偏冷约 ${Math.round(-d)}°` : '与本周接近';
    $('#trendText').textContent = `8–16 天整体较本周${dir(dMax)}（夜间${dir(dMin)}），期间降水概率较高的日子约 ${wetDays} 天。仅反映冷暖/干湿走向，具体逐日温度会有较大出入。`;
    $('#trendNote').hidden = false;
  } else $('#trendNote').hidden = true;
}

/* AQI */
const AQI_LEVELS = [
  [50, '优', '#16a34a', '空气很好，放心开窗通风、户外活动。'],
  [100, '良', '#eab308', '空气可以接受；极少数异常敏感人群应减少户外活动。'],
  [150, '轻度污染', '#f97316', '儿童、老人及心脏病/呼吸疾病患者应减少长时间户外锻炼。'],
  [200, '中度污染', '#ef4444', '敏感人群症状可能加剧，外出建议佩戴口罩；减少户外运动。'],
  [300, '重度污染', '#a855f7', '所有人应减少户外活动，外出佩戴防护口罩，关闭门窗。'],
  [Infinity, '严重污染', '#7f1d1d', '尽量避免外出，必须出行请做好防护（N95 及以上口罩）。'],
];
function renderAQI(s) {
  const box = $('#aqiInline');
  if (!box) return;
  if (!s.aqi || s.aqi.us_aqi === undefined || s.aqi.us_aqi === null) { box.hidden = true; box.innerHTML = ''; return; }
  const v = Math.round(s.aqi.us_aqi);
  const lv = AQI_LEVELS.find(x => v <= x[0]);
  box.innerHTML = `
    <div class="aqi-ring-sm" style="background:${lv[2]}"><span class="v">${v}</span><span class="l">${lv[1]}</span></div>
    <div class="aqi-inline-txt">
      ${lv[3]}
      <span class="pollen">PM2.5 ${Math.round(s.aqi.pm2_5 || 0)} · PM10 ${Math.round(s.aqi.pm10 || 0)} · O₃ ${Math.round(s.aqi.ozone || 0)} · NO₂ ${Math.round(s.aqi.nitrogen_dioxide || 0)} µg/m³　<small>US AQI · Open-Meteo（CAMS）</small></span>
    </div>`;
  box.hidden = false;
}

/* 生活指数：和风优先，否则本地规则翻译成人话 */
function renderIndices(s) {
  const list = $('#indicesList'), src = $('#indicesSource');
  const hi = s.hf.indices;
  let items = [];
  if (hi && hi.length) {
    src.textContent = '和风天气';
    const icons = { '洗车指数': '🚗', '旅游指数': '🧳', '运动指数': '🏃', '紫外线指数': '🧴', '交通指数': '🚌' };
    items = hi.filter(x => x.name !== '穿衣指数').slice(0, 6).map(x => ({ ic: icons[x.name] || '📌', t: x.name.replace('指数', ''), d: x.text }));
  } else {
    src.textContent = '基于实况生成';
    const c = s.current, D = s.daily;
    const feels = s.domestic ? s.domestic.feels : c.apparent_temperature;
    const ppToday = D.precipitation_probability_max[0] || 0;
    const pp3 = Math.max(...D.precipitation_probability_max.slice(0, 3));
    const uv = D.uv_index_max[0] || 0;
    const aqiV = s.aqi && s.aqi.us_aqi ? s.aqi.us_aqi : 0;
    // 穿衣 / 带伞建议已由「今日穿搭」卡覆盖，这里只保留互补项
    items = [
      { ic: '🧴', t: '防晒', d: uv >= 8 ? `紫外线很强（${uvLevel(uv)}），防晒霜+帽子+墨镜。` : uv >= 5 ? `紫外线较强（${uvLevel(uv)}），出门涂防晒霜。` : `紫外线${uvLevel(uv)}，常规防护即可。` },
      { ic: '🏃', t: '运动', d: ppToday >= 60 ? '有雨，建议改室内运动。' : aqiV > 150 ? '空气较差，减少户外剧烈运动。' : feels > 35 ? '高温，避免正午户外运动，注意补水。' : feels < -10 ? '严寒，户外运动请做好保暖防护。' : '天气条件不错，适合户外运动。' },
      { ic: '🚗', t: '洗车', d: pp3 >= 50 ? '未来几天有雨，洗了也白洗，再等等。' : '未来几天降雨概率低，适合洗车。' },
      { ic: '🧺', t: '晾晒', d: ppToday >= 40 || c.relative_humidity_2m > 85 ? '湿度大或有雨，晾晒条件差。' : '天气干燥晴好，适合晾晒。' },
      { ic: '🌼', t: '过敏', d: [3, 4, 5].includes(new Date().getMonth() + 1) ? '正值花粉季，敏感人群外出可戴口罩、回家及时清洗鼻腔。' : '非花粉高峰期，一般无需特别防护。' },
    ];
  }
  list.innerHTML = items.map(x => `<div class="idx"><div class="ic">${x.ic}</div><div><div class="t">${x.t}</div><div class="d">${x.d}</div></div></div>`).join('');
}

/* 九宫格 */
function renderGrid(s) {
  const c = s.current, i = s.nowIdx, D = s.daily;
  const vis = (s.hourly.visibility && s.hourly.visibility[0]) ? (s.hourly.visibility[0] / 1000) : null;
  const windDirTxt = s.domestic ? (s.domestic.windDir || '') + (s.domestic.windScale ? ' ' + s.domestic.windScale + ' 级' : '') : windDir(c.wind_direction_10m) + ' ' + Math.round(c.wind_speed_10m) + ' km/h';
  const cells = [
    ['湿度', Math.round(s.domestic ? s.domestic.humidity : c.relative_humidity_2m) + '%', '相对湿度'],
    ['风速风向', windDirTxt, '地面 10 米'],
    ['气压', Math.round(c.pressure_msl) + ' hPa', '海平面气压'],
    ['能见度', vis ? (vis >= 10 ? '> 10 km' : vis.toFixed(1) + ' km') : '--', vis && vis < 1 ? '大雾，出行注意' : ''],
    ['紫外线', D.uv_index_max[0] != null ? `${uvLevel(D.uv_index_max[0])} (${(D.uv_index_max[0]).toFixed(1)})` : '--', '今日最大'],
    ['日出日落', `${hhmm(D.sunrise[0])} / ${hhmm(D.sunset[0])}`, '今日'],
  ];
  $('#gridBody').innerHTML = cells.map(([k, v, sub]) => `<div class="g-cell"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join('');
}

/* 今日穿搭：性别 + 风格，按体感温度分档；冷了提醒添衣、空气差提醒少出门 */
function renderOutfit(s) {
  const g = state.outfit.gender, st = state.outfit.style;
  const skirt = g === 'f';
  const c = s.current, D = s.daily;
  const feels = s.domestic && s.domestic.feels != null ? s.domestic.feels : c.apparent_temperature;
  const f = feels;
  const aqiV = s.aqi && s.aqi.us_aqi != null ? s.aqi.us_aqi : 0;
  const ppToday = D.precipitation_probability_max[0] || 0;
  const wet = RAIN_CODES.has(c.weather_code) || SNOW_CODES.has(c.weather_code) || c.precipitation > 0.08;
  const wind = c.wind_speed_10m || 0;
  const uv = D.uv_index_max[0] || 0;
  const pick = (sport, work, casual) => st === 'sport' ? sport : st === 'work' ? work : casual;

  let items = [];
  if (f >= 28) items = [
    { ic: '👕', t: pick('速干短袖', '透气薄衬衫', '短袖 T 恤') },
    { ic: skirt ? '👗' : '🩳', t: skirt ? (st === 'work' ? '轻薄连衣裙' : '短裙或薄长裤') : '轻薄短裤' },
    { ic: '🕶️', t: '太阳镜 / 遮阳帽' },
  ];
  else if (f >= 22) items = [
    { ic: '👕', t: pick('速干短袖', '薄衬衫', '短袖或薄长袖') },
    { ic: skirt ? '👖' : '👖', t: skirt ? (st === 'work' ? '西裤/半身裙' : '薄长裤或裙装') : '薄长裤' },
    { ic: '🧥', t: st === 'work' ? '轻薄西装外套' : '薄外套备一件，早晚披' },
  ];
  else if (f >= 16) items = [
    { ic: '👕', t: pick('长袖速干衣', '长袖衬衫', '长袖 T 恤/薄卫衣') },
    { ic: '👖', t: skirt ? (st === 'work' ? '西裤/过膝裙+打底' : '长裤或裙装配打底裤') : '长裤' },
    { ic: '🧥', t: st === 'work' ? '西装/薄大衣' : '夹克或薄风衣' },
  ];
  else if (f >= 9) items = [
    { ic: '🧶', t: pick('运动卫衣', '针织衫/衬衫+针织背心', '毛衣或加绒卫衣') },
    { ic: '👖', t: skirt ? '加绒打底袜/厚裤袜' : '厚长裤（怕冷选加绒）' },
    { ic: '🧥', t: st === 'work' ? '呢子大衣' : '风衣或夹棉外套' },
  ];
  else if (f >= 2) items = [
    { ic: '🧶', t: '毛衣 + 保暖内搭' },
    { ic: '👖', t: skirt ? '厚裙+加绒打底袜' : '加绒长裤' },
    { ic: '🧥', t: st === 'work' ? '厚呢大衣' : '夹棉服/厚外套' },
    { ic: '🧣', t: '围巾，护住脖子真的很顶用' },
  ];
  else if (f >= -5) items = [
    { ic: '🧊', t: '保暖内衣别嫌麻烦' },
    { ic: '🧥', t: '羽绒服/厚棉服' + (st === 'sport' ? '（运动可选轻量羽绒）' : '') },
    { ic: '👖', t: skirt ? '厚裙+双层打底袜' : '加绒裤/羽绒裤' },
    { ic: '🧣', t: '帽子 + 围巾 + 手套三件套' },
  ];
  else items = [
    { ic: '🥶', t: '这种天气，保暖内衣 + 羽绒服全套安排' },
    { ic: '👖', t: skirt ? '厚毛呢裙+双层加绒袜' : '加绒裤，风大的话外面再套羽绒裤' },
    { ic: '🧣', t: '帽子围巾手套，一样都不能少' },
    { ic: '🥾', t: '穿防滑保暖的鞋，路面可能结冰' },
  ];

  // 条件加项
  if (ppToday >= 50 || wet) items.push({ ic: '☂️', t: '今天有雨，带伞出门，鞋选好走路的' });
  if (wind >= 30) items.push({ ic: '🌬️', t: `风不小（约 ${Math.round(wind)} km/h），外层选防风的更挡风` });
  if (uv >= 6) items.push({ ic: '🧴', t: `紫外线${uvLevel(uv)}，出门前 20 分钟涂防晒` });
  if (aqiV > 150) items.push({ ic: '😷', t: '空气不太好，外出戴好口罩（KN95 更稳）' });

  $('#outfitBody').innerHTML = items.map(x => `<div class="o-item"><span class="oi">${x.ic}</span>${x.t}</div>`).join('');

  // 暖心提示：挑最重要的 1–2 条
  const cares = [];
  const dMax = D.temperature_2m_max || [];
  if (dMax.length > 1 && dMax[1] - dMax[0] <= -5) cares.push(`明天要降温约 ${Math.round(dMax[0] - dMax[1])}℃，今晚记得把厚衣服放在床头。`);
  if (f < 5) cares.push('天冷了，出门前喝杯热水暖暖手，围巾手套别落下，别冻着自己。');
  else if (f >= 32) cares.push('今天闷热，多喝水多休息，正午尽量待在阴凉处。');
  if (aqiV > 150) cares.push('今天空气质量不太好，能不出门就少出门，窗户先关一关，回家记得洗手洗脸，照顾好自己 ❤️');
  if (s.hf.warning && s.hf.warning.some(w => /红色|橙色/.test(w.title || ''))) cares.push('有高等级气象预警，非必要不外出，安全第一。');
  const careBox = $('#outfitCare');
  if (cares.length) {
    careBox.hidden = false;
    careBox.innerHTML = `<span class="oc-tag">🤍 暖心提示</span>` + cares.slice(0, 2).map(x => `<div>${x}</div>`).join('');
  } else careBox.hidden = true;
}

/* 预警（和风） */
function alertLevel(txt) {
  if (/红色/.test(txt)) return 'red';
  if (/橙色/.test(txt)) return 'orange';
  if (/黄色/.test(txt)) return 'yellow';
  return 'blue';
}
function renderAlerts(s) {
  const wrap = $('#alertsWrap');
  const list = s.hf.warning;
  if (!list || !list.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
  const readSet = new Set(store.get('wx:alertRead', []));
  wrap.hidden = false;
  wrap.innerHTML = list.map(a => {
    const lv = alertLevel(a.title || a.type || '');
    const id = (a.location ? a.location + ':' : '') + (a.pubtime || a.publishTime || a.title);
    const dismissed = readSet.has(id);
    return `<div class="alert alert-${lv}" data-id="${id}" ${dismissed ? 'hidden' : ''}>
      <div class="a-head"><span>⚠️ ${a.title || a.type + '预警'}</span></div>
      <div class="a-meta">发布单位：${a.source || '—'} · 生效：${(a.startTime || '').slice(5, 16).replace('T', ' ')} 起${a.endTime ? '，至 ' + a.endTime.slice(5, 16).replace('T', ' ') : ''}</div>
      <details><summary>查看详情与防御指南</summary><div class="a-text">${(a.text || '').replace(/\n/g, '<br>')}</div></details>
      <button class="a-dismiss">我知道了，收起</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.a-dismiss').forEach(btn => {
    btn.onclick = () => {
      const el = btn.closest('.alert');
      readSet.add(el.dataset.id);
      store.set('wx:alertRead', [...readSet]);
      el.hidden = true;
    };
  });
}

/* ---------- 定位（三步降级） ---------- */
function setLocatePending(msg) { $('#errorBox').hidden = true; $('#skeleton').style.display = ''; $('#content').hidden = true; if (msg) setNotice(msg, 'info', 6000); }
async function locate() {
  setLocatePending();
  // 第 1 步：浏览器定位
  try {
    const pos = await new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('no-geolocation'));
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 5 * 60000, enableHighAccuracy: true });
    });
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    let name = '当前位置';
    try {
      const rg = await fetchJSON(REVERSE_URL(lat, lon), 6000);
      name = rg.city || rg.locality || rg.principalSubdivision || '当前位置';
    } catch { /* 反查失败不影响定位本身 */ }
    if (accuracy > 5000) setNotice(`📡 定位较粗略（误差约 ±${(accuracy / 1000).toFixed(0)} km），如不准确可手动搜索城市。`, 'info', 8000);
    return upsertCityAndShow({ name, lat, lon, admin: '', country: '定位' });
  } catch (e1) {
    // 第 2 步：IP 定位（高德优先，geojs 兜底）
    const amap = await amapIP();
    if (amap && amap.rectangle) {
      const [x1, y1, x2, y2] = amap.rectangle.split(',').map(Number);
      const lat = +((y1 + y2) / 2).toFixed(4), lon = +((x1 + x2) / 2).toFixed(4);
      let name = (amap.city && amap.city !== '市辖区' && amap.city !== '') ? String(amap.city).replace('市', '') : String(amap.province || '').replace('市', '');
      // 高德 adcode → 城市名校验（解决飘城市问题）
      if (state.proxy.amap && amap.adcode) {
        try { const w = await fetchJSON(`/api/amap/weather?adcode=${amap.adcode}`); if (w.ok && w.data && w.data.lives && w.data.lives[0]) name = w.data.lives[0].city.replace('市', ''); } catch { }
      }
      return upsertCityAndShow({ name: name || '我所在城市', lat, lon, admin: amap.province || '', country: '中国' });
    }
    try {
      const g = await fetchJSON('https://get.geojs.io/v1/ip/geo.json', 6000);
      const lat = parseFloat(g.latitude), lon = parseFloat(g.longitude);
      if (isFinite(lat) && isFinite(lon)) {
        return upsertCityAndShow({ name: g.city || g.region || '我所在城市', lat, lon, admin: g.region || '', country: g.country || '' });
      }
    } catch { }
    // 第 3 步：手动选城市
    showError('未能获取你的位置（可能拒绝了定位权限，或网络不可用）。可以重试，或直接搜索城市：');
    $('#searchInput').focus();
    return null;
  }
}
function showError(msg) {
  hideSplash();
  $('#skeleton').style.display = 'none';
  $('#content').hidden = true;
  $('#errorMsg').textContent = msg;
  $('#errorBox').hidden = false;
  // 网络类失败自动重试一次（服务重启窗口/网络抖动时用户无感恢复）
  if (/网络|重试/.test(msg) && !state._autoRetried && state.loc) {
    state._autoRetried = true;
    setTimeout(() => {
      if ($('#errorBox').hidden) return; // 用户已手动恢复
      setNotice('🔄 已自动重试…', 'info', 4000);
      showLocation(state.loc);
    }, 6000);
  }
}

/* ---------- 城市管理 ---------- */
function upsertCityAndShow(city) {
  const i = state.cities.findIndex(c => Math.abs(c.lat - city.lat) < 0.05 && Math.abs(c.lon - city.lon) < 0.05);
  if (i === -1) { state.cities.push(city); state.active = state.cities.length - 1; }
  else state.active = i;
  store.set('wx:cities', state.cities.slice(-8)); store.set('wx:active', state.active);
  renderTabs();
  return showLocation(state.cities[state.active]);
}
function renderTabs() {
  const nav = $('#cityTabs');
  nav.innerHTML = state.cities.map((c, i) =>
    `<button class="city-tab ${i === state.active ? 'active' : ''}" data-i="${i}">${c.name}<span class="rm" data-rm="${i}" title="移除" style="${state.cities.length > 1 ? '' : 'display:none'}">✕</span></button>`
  ).join('') + `<button class="city-tab add" id="tabAdd">＋</button>`;
  nav.querySelectorAll('.city-tab[data-i]').forEach(b => {
    b.onclick = (ev) => {
      if (ev.target.dataset.rm !== undefined) return;
      state.active = +b.dataset.i; store.set('wx:active', state.active);
      renderTabs(); showLocation(state.cities[state.active]);
    };
  });
  nav.querySelectorAll('[data-rm]').forEach(b => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const i = +b.dataset.rm;
      state.cities.splice(i, 1);
      state.active = Math.min(state.active, state.cities.length - 1);
      store.set('wx:cities', state.cities); store.set('wx:active', state.active);
      renderTabs();
      if (state.cities.length) showLocation(state.cities[state.active]);
    };
  });
  $('#tabAdd').onclick = () => $('#searchInput').focus();
}

/* ---------- 加载与渲染入口 ---------- */
async function showLocation(loc) {
  state.loc = loc;
  renderTabs();
  $('#errorBox').hidden = true;
  $('#skeleton').style.display = '';
  $('#content').hidden = true;
  hideNotice();
  const key = locKey(loc);
  // 1 秒首屏：先画本地缓存快照，再静默刷新
  const cached = store.get('wx:snap:' + key, null);
  if (cached && Date.now() - cached.ts < 6 * 3600 * 1000) {
    // 缓存秒开：30 分钟内不标"离线"，只是先行渲染、随后静默刷新
    const stale = Date.now() - cached.ts > 30 * 60000;
    renderAll({ ...cached.data, ts: cached.ts, offline: stale });
  }
  try {
    let snap = await fetchSnapshot(loc);
    crossCheck(snap);
    // 合理性闸门：主源异常 → 备用源（ECMWF IFS）→ 上次缓存
    let errs = validateSnapshot(snap, cached);
    if (errs.length) {
      console.warn('[闸门] 主源校验失败:', errs, '尝试备用源…');
      try {
        const raw2 = await omJSON(FORECAST_URL(loc, 'ecmwf_ifs025'));
        const snap2 = await buildFromRaw(raw2, snap);
        if (!validateSnapshot(snap2, cached).length) {
          snap = snap2;
          snap.__calibrating = true;
        } else throw new Error('backup also invalid');
      } catch {
        if (cached) { showCalibrating(); return; }
        showError('数据源返回了异常数值（已触发安全校验），且没有可用的历史缓存。请稍后重试。');
        return;
      }
    }
    if (!snap.offline) store.set('wx:snap:' + key, { ts: snap.ts, data: snap });
    state._autoRetried = false;
    renderAll(snap);
  } catch (e) {
    console.warn('[数据] 获取失败，已降级:', e && e.message);
    if (cached) renderAll({ ...cached.data, ts: cached.ts, offline: true });
    else showError('天气数据加载失败（网络问题或服务暂时不可用）。请检查网络后重试。');
  }
}
function showCalibrating() {
  const cached = state.loc ? store.get('wx:snap:' + locKey(state.loc), null) : null;
  if (cached) {
    renderAll({ ...cached.data, ts: cached.ts, offline: false, __calibrating: true });
  } else showError('数据源返回了异常数值，安全校验未通过。请稍后重试。');
}
async function buildFromRaw(raw, templateSnap) {
  const nowIdx = Math.max(0, (raw.hourly.time || []).findIndex(t => t >= raw.current.time.slice(0, 13) + ':00'));
  const slice = (arr, n = 48) => (arr || []).slice(nowIdx, nowIdx + n);
  return { ...templateSnap, current: raw.current, nowIdx, offline: false, __calibrating: false, domestic: null,
    hourly: {
      time: slice(raw.hourly.time), temperature_2m: slice(raw.hourly.temperature_2m),
      apparent_temperature: slice(raw.hourly.apparent_temperature), precipitation_probability: slice(raw.hourly.precipitation_probability),
      precipitation: slice(raw.hourly.precipitation), weather_code: slice(raw.hourly.weather_code),
      visibility: slice(raw.hourly.visibility), uv_index: slice(raw.hourly.uv_index),
    },
    daily: {
      time: raw.daily.time.slice(0, 16), weather_code: raw.daily.weather_code.slice(0, 16),
      temperature_2m_max: raw.daily.temperature_2m_max.slice(0, 16), temperature_2m_min: raw.daily.temperature_2m_min.slice(0, 16),
      precipitation_probability_max: raw.daily.precipitation_probability_max.slice(0, 16), uv_index_max: raw.daily.uv_index_max.slice(0, 16),
      sunrise: raw.daily.sunrise.slice(0, 16), sunset: raw.daily.sunset.slice(0, 16),
    } };
}

/* ---------- 城市搜索（中文+拼音，防重名；空输入展示热门城市） ---------- */
const HOT_CITIES = [
  { name: '北京', py: 'beijing', lat: 39.9042, lon: 116.4074, admin: '北京市', country: '中国' },
  { name: '上海', py: 'shanghai', lat: 31.2304, lon: 121.4737, admin: '上海市', country: '中国' },
  { name: '广州', py: 'guangzhou', lat: 23.1291, lon: 113.2644, admin: '广东省', country: '中国' },
  { name: '深圳', py: 'shenzhen', lat: 22.5431, lon: 114.0579, admin: '广东省', country: '中国' },
  { name: '杭州', py: 'hangzhou', lat: 30.2741, lon: 120.1551, admin: '浙江省', country: '中国' },
  { name: '成都', py: 'chengdu', lat: 30.5728, lon: 104.0668, admin: '四川省', country: '中国' },
  { name: '重庆', py: 'chongqing', lat: 29.563, lon: 106.5516, admin: '重庆市', country: '中国' },
  { name: '武汉', py: 'wuhan', lat: 30.5928, lon: 114.3055, admin: '湖北省', country: '中国' },
  { name: '西安', py: 'xian', lat: 34.3416, lon: 108.9398, admin: '陕西省', country: '中国' },
  { name: '南京', py: 'nanjing', lat: 32.0603, lon: 118.7969, admin: '江苏省', country: '中国' },
  { name: '天津', py: 'tianjin', lat: 39.3434, lon: 117.3616, admin: '天津市', country: '中国' },
  { name: '香港', py: 'xianggang hongkong', lat: 22.3193, lon: 114.1694, admin: '中国香港', country: '中国' },
];
/* 本地城市库：搜索接口不可用时兜底（拼音可搜） */
const LOCAL_CITIES = [
  ...HOT_CITIES,
  { name: '苏州', py: 'suzhou', lat: 31.2989, lon: 120.5853, admin: '江苏省', country: '中国' },
  { name: '郑州', py: 'zhengzhou', lat: 34.7466, lon: 113.6254, admin: '河南省', country: '中国' },
  { name: '长沙', py: 'changsha', lat: 28.2282, lon: 112.9388, admin: '湖南省', country: '中国' },
  { name: '沈阳', py: 'shenyang', lat: 41.8057, lon: 123.4315, admin: '辽宁省', country: '中国' },
  { name: '哈尔滨', py: 'haerbin', lat: 45.8038, lon: 126.535, admin: '黑龙江省', country: '中国' },
  { name: '昆明', py: 'kunming', lat: 25.0389, lon: 102.7183, admin: '云南省', country: '中国' },
  { name: '厦门', py: 'xiamen', lat: 24.4798, lon: 118.0894, admin: '福建省', country: '中国' },
  { name: '青岛', py: 'qingdao', lat: 36.0671, lon: 120.3826, admin: '山东省', country: '中国' },
  { name: '大连', py: 'dalian', lat: 38.914, lon: 121.6147, admin: '辽宁省', country: '中国' },
  { name: '合肥', py: 'hefei', lat: 31.8206, lon: 117.2272, admin: '安徽省', country: '中国' },
  { name: '福州', py: 'fuzhou', lat: 26.0745, lon: 119.2965, admin: '福建省', country: '中国' },
  { name: '济南', py: 'jinan', lat: 36.6512, lon: 117.1201, admin: '山东省', country: '中国' },
  { name: '宁波', py: 'ningbo', lat: 29.8683, lon: 121.544, admin: '浙江省', country: '中国' },
  { name: '无锡', py: 'wuxi', lat: 31.4912, lon: 120.3119, admin: '江苏省', country: '中国' },
  { name: '佛山', py: 'foshan', lat: 23.0218, lon: 113.1219, admin: '广东省', country: '中国' },
  { name: '东莞', py: 'dongguan', lat: 23.0207, lon: 113.7518, admin: '广东省', country: '中国' },
  { name: '石家庄', py: 'shijiazhuang', lat: 38.0428, lon: 114.5149, admin: '河北省', country: '中国' },
  { name: '太原', py: 'taiyuan', lat: 37.8706, lon: 112.5489, admin: '山西省', country: '中国' },
  { name: '南昌', py: 'nanchang', lat: 28.6829, lon: 115.8579, admin: '江西省', country: '中国' },
  { name: '贵阳', py: 'guiyang', lat: 26.6470, lon: 106.6302, admin: '贵州省', country: '中国' },
  { name: '南宁', py: 'nanning', lat: 22.8170, lon: 108.3665, admin: '广西壮族自治区', country: '中国' },
  { name: '兰州', py: 'lanzhou', lat: 36.0611, lon: 103.8343, admin: '甘肃省', country: '中国' },
  { name: '乌鲁木齐', py: 'wulumuqi urumqi', lat: 43.8256, lon: 87.6168, admin: '新疆维吾尔自治区', country: '中国' },
  { name: '澳门', py: 'aomen macao', lat: 22.1987, lon: 113.5439, admin: '中国澳门', country: '中国' },
  { name: '台北', py: 'taibei taipei', lat: 25.0330, lon: 121.5654, admin: '中国台湾', country: '中国' },
];
function localSearch(q) {
  const s = q.toLowerCase();
  return LOCAL_CITIES.filter(c => c.name.includes(q) || c.py.includes(s) || c.py.split(' ').some(p => p.startsWith(s)))
    .map(c => ({ label: c.name, sub: [c.admin, c.country].filter(Boolean).join(' · '), city: c }));
}
let searchItems = [], searchActive = -1;
const escReg = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function dropShow(html) { const d = $('#searchDrop'); d.innerHTML = html; d.hidden = false; }
function bindDropOpts() {
  $('#searchDrop').querySelectorAll('.opt').forEach(el => {
    el.onclick = () => chooseCity(searchItems[+el.dataset.i]);
  });
}
function renderDropOptions(items, q) {
  searchItems = items; searchActive = -1;
  let re = null;
  if (q) { try { re = new RegExp('(' + escReg(q) + ')', 'gi'); } catch { } }
  const html = items.map((it, i) => {
    const name = re ? it.label.replace(re, '<mark>$1</mark>') : it.label;
    return `<div class="opt" data-i="${i}"><span>${name}</span><span class="sub">${it.sub}</span></div>`;
  }).join('');
  dropShow(`<div class="hot-title">${q ? '搜索结果' : '🔥 热门城市'}</div><div class="${q ? '' : 'hot-grid'}">${html}</div>`);
  bindDropOpts();
}
function showHotCities() {
  renderDropOptions(HOT_CITIES.map(c => ({ label: c.name, sub: [c.admin, c.country].filter(Boolean).join(' · '), city: c })), '');
}
function chooseCity(it) {
  if (!it) return;
  const c = it.city;
  $('#searchDrop').hidden = true;
  $('#searchInput').value = '';
  const i = state.cities.findIndex(x => Math.abs(x.lat - c.lat) < 0.05 && Math.abs(x.lon - c.lon) < 0.05);
  if (i !== -1) {
    state.active = i; store.set('wx:active', i); renderTabs();
    toast(`「${c.name}」已经在你的城市列表里啦，帮你切换过去 👌`);
    showLocation(state.cities[i]);
  } else {
    toast(`✅ 已添加「${c.name}」，穿搭建议也会按当地天气更新`);
    upsertCityAndShow(c);
  }
}
const doSearch = debounce(async (qRaw) => {
  const q = qRaw.trim();
  if (!q) { showHotCities(); return; }
  dropShow('<div class="empty">搜索中…</div>');
  try {
    const r = await Promise.race([omJSON(SEARCH_URL(q), { ttlMs: 3600000 }), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 6000))]);
    const list = r.results || [];
    if (!list.length) throw new Error('empty');
    renderDropOptions(list.map(c => ({ label: c.name, sub: [c.admin1, c.country].filter(Boolean).join(' · '), city: { name: c.name, lat: +c.latitude.toFixed(4), lon: +c.longitude.toFixed(4), admin: c.admin1 || '', country: c.country || '' } })), q);
  } catch {
    // 搜索接口不可用/超时：本地城市库兜底（支持中文与拼音）
    const local = localSearch(q);
    if (local.length) {
      renderDropOptions(local, q);
      const t = $('#searchDrop .hot-title'); if (t) t.textContent = '搜索结果（离线库）';
    } else {
      searchItems = [];
      dropShow('<div class="empty">没有找到相关城市，换个说法试试（支持中文或拼音）。</div>');
    }
  }
}, 250);
const searchInput = $('#searchInput');
/* 打开搜索下拉：focus / 按下 / 点击 三重触发，确保任何点击方式都能弹出 */
const openSearch = () => {
  if (!searchInput.value.trim()) showHotCities();
  else if ($('#searchDrop').hidden) doSearch(searchInput.value);
};
searchInput.addEventListener('input', (e) => doSearch(e.target.value));
searchInput.addEventListener('focus', openSearch);
searchInput.addEventListener('mousedown', openSearch);
searchInput.addEventListener('click', openSearch);
searchInput.addEventListener('keydown', (e) => {
  const drop = $('#searchDrop');
  if (drop.hidden || !searchItems.length) {
    if (e.key === 'Escape') drop.hidden = true;
    return;
  }
  const opts = drop.querySelectorAll('.opt');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    searchActive = e.key === 'ArrowDown' ? (searchActive + 1) % searchItems.length : (searchActive - 1 + searchItems.length) % searchItems.length;
    opts.forEach((o, i) => o.classList.toggle('active', i === searchActive));
    if (opts[searchActive]) opts[searchActive].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    (opts[Math.max(0, searchActive)] || opts[0])?.click();
  } else if (e.key === 'Escape') {
    drop.hidden = true;
  }
});
document.addEventListener('click', (e) => { if (!$('#searchBox').contains(e.target)) $('#searchDrop').hidden = true; });

/* ---------- 其他按钮 ---------- */
$('#locateBtn').onclick = () => locate();
$('#retryBtn').onclick = () => state.loc ? showLocation(state.loc) : locate();
$('#pickCityBtn').onclick = () => { $('#errorBox').hidden = true; $('#searchInput').focus(); };
window.addEventListener('online', () => { if (state.loc) showLocation(state.loc); });
window.addEventListener('offline', () => setNotice('📴 网络已断开，展示的是最近缓存数据。', 'warn'));

/* ============================================================
 * P2 增强：降水雷达云图（RainViewer 公开 API，免 Key）
 * ============================================================ */
const RV_API = 'https://api.rainviewer.com/public/weather-maps.json';
const RV_HOST = 'https://tilecache.rainviewer.com';
const rv = { frames: [], idx: 0, zoom: 7, playing: true, timer: null, imgs: new Map(), metaTs: 0, key: '', failUntil: 0 };

function latLonToWorldPx(lat, lon, z) {
  const n = 256 * 2 ** z;
  const rad = lat * Math.PI / 180;
  return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n];
}
function rvImg(url) {
  if (rv.imgs.has(url)) return rv.imgs.get(url);
  const im = new Image(); im.decoding = 'async'; im.src = url;
  rv.imgs.set(url, im); return im;
}
async function rvMeta() {
  if (rv._meta && Date.now() - rv.metaTs < 5 * 60000) return rv._meta;
  const m = await fetchJSON(RV_API, 8000);
  rv._meta = m; rv.metaTs = Date.now();
  return m;
}
async function renderRadar(snap) {
  const body = $('#radarBody'); if (!body || !snap || !snap.loc) return;
  if (Date.now() < rv.failUntil) return;
  const z = rv.zoom;
  const key = locKey(snap.loc) + ':' + z;
  if (rv.key === key && $('#radarCvs') && Date.now() - rv.metaTs < 10 * 60000) return; // 已就绪且未过期
  try {
    const meta = await rvMeta();
    const past = (meta.radar && meta.radar.past) || [];
    const nowc = (meta.radar && meta.radar.nowcast) || [];
    rv.frames = [...past.slice(-5), ...nowc.slice(0, 3)].map(f => ({ ...f, __fc: nowc.includes(f) }));
    if (!rv.frames.length) throw new Error('no frames');
    // 以城市为中心的逻辑画布（1024x640，3:2），按瓦片拼图
    const W = 1024, H = 640, T = 256;
    const [wx, wy] = latLonToWorldPx(snap.loc.lat, snap.loc.lon, z);
    const left = wx - W / 2, top = wy - H / 2;
    const n = 2 ** z;
    const x0 = Math.floor(left / T), x1 = Math.floor((left + W) / T);
    const y0 = Math.floor(top / T), y1 = Math.floor((top + H) / T);
    // 预生成每帧每瓦片 URL 与几何信息（供离屏拼装）
    rv.frames.forEach(f => {
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const wxp = (((tx % n) + n) % n), wyp = (((ty % n) + n) % n);
        f['__u' + wxp + '_' + wyp] = `${RV_HOST}${f.path}/256/${z}/${wxp}/${wyp}/2/1_1.png`;
      }
      f.__geo = { left, top, x0, x1, y0, y1 };
    });
    // 主 canvas 只放当前帧：逐帧单独用离屏拼装太重，改为「每帧拼到离屏 canvas」缓存
    body.innerHTML = '<canvas id="radarCvs" width="' + W + '" height="' + H + '" aria-label="降水雷达图"></canvas>';
    const cvs = $('#radarCvs');
    const loadFrame = (f) => new Promise((resolve) => {
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const octx = off.getContext('2d');
      const g = f.__geo; let pending = (g.x1 - g.x0 + 1) * (g.y1 - g.y0 + 1);
      const done = () => { if (--pending <= 0) resolve(off); };
      for (let ty = g.y0; ty <= g.y1; ty++) for (let tx = g.x0; tx <= g.x1; tx++) {
        const wxp = (((tx % n) + n) % n), wyp = (((ty % n) + n) % n);
        const im = rvImg(f['__u' + wxp + '_' + wyp]);
        const paint = () => { if (im.complete && im.naturalWidth) octx.drawImage(im, tx * T - g.left, ty * T - g.top); done(); };
        if (im.complete) paint(); else { im.onload = paint; im.onerror = done; }
      }
    });
    // 先出当前帧（最新一帧实测雷达），再后台补齐其余帧
    const nowPos = Math.max(0, rv.frames.filter(f => !f.__fc).length - 1);
    rv.idx = nowPos;
    const first = await loadFrame(rv.frames[nowPos]);
    const ctx = cvs.getContext('2d');
    const show = (off, f) => {
      ctx.clearRect(0, 0, W, H); ctx.drawImage(off, 0, 0);
      const t = new Date(f.time * 1000);
      $('#radarTime').textContent = (f.__fc ? '预报 ' : '') + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
    };
    show(first, rv.frames[nowPos]);
    rv.key = key;
    for (let i = 0; i < rv.frames.length; i++) {
      if (i === nowPos) continue;
      const off = await loadFrame(rv.frames[i]);
      rv.frames[i].__off = off;
    }
    if (!rv.timer) rv.timer = setInterval(() => {
      if (!rv.playing || !rv.frames.length) return;
      rv.idx = (rv.idx + 1) % rv.frames.length;
      const f = rv.frames[rv.idx];
      const cvs2 = $('#radarCvs'); if (!cvs2) { clearInterval(rv.timer); rv.timer = null; return; }
      const c2 = cvs2.getContext('2d');
      if (f.__off) {
        c2.clearRect(0, 0, W, H); c2.drawImage(f.__off, 0, 0);
        const t = new Date(f.time * 1000);
        $('#radarTime').textContent = (f.__fc ? '预报 ' : '') + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
      }
    }, 700);
  } catch (e) {
    console.warn('[雷达] 不可用:', e && e.message);
    rv.failUntil = Date.now() + 5 * 60000;
    body.innerHTML = '<div class="radar-fallback muted">📡 雷达数据暂时不可用（可能是网络原因），稍后刷新页面自动重试。</div>';
  }
}

/* ---------- 分享卡片（Canvas 本地绘制，无外部依赖） ---------- */
function buildShareCard(s) {
  const W = 720, H = 960;
  const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d');
  const w = wmo(s.current.weather_code, s.current.is_day);
  const grads = {
    clear: ['#3f8fe0', '#8fd0ff'], rain: ['#39527a', '#6b8cae'], snow: ['#6d87ab', '#b8c9dd'],
    cloud: ['#4f6f96', '#93b3cf'], fog: ['#68727d', '#a3adb8'],
  };
  const gc = grads[w.kind] || grads.cloud;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, gc[0]); g.addColorStop(1, gc[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 顶部装饰圆
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.beginPath(); ctx.arc(W - 90, 130, 190, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(60, H - 160, 150, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  // 品牌行
  ctx.font = '500 26px system-ui, "Microsoft YaHei", sans-serif';
  ctx.globalAlpha = .85; ctx.fillText('🌤 天气助手', W / 2, 78); ctx.globalAlpha = 1;
  // 城市 + 日期
  ctx.font = '700 44px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText(s.loc.name, W / 2, 150);
  const d = new Date(s.ts);
  ctx.font = '400 24px system-ui, "Microsoft YaHei", sans-serif'; ctx.globalAlpha = .85;
  ctx.fillText(`${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]}`, W / 2, 192);
  ctx.globalAlpha = 1;
  // 图标 + 温度
  ctx.font = '170px serif'; ctx.fillText(w.icon, W / 2, 400);
  ctx.font = '200 150px system-ui, sans-serif';
  ctx.fillText(Math.round(s.current.temperature_2m) + '°', W / 2, 560);
  ctx.font = '500 34px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText((s.domestic ? s.domestic.text : w.text) + ' · 体感 ' + Math.round(s.current.apparent_temperature ?? s.current.temperature_2m) + '°', W / 2, 615);
  // 指标行
  ctx.font = '400 24px system-ui, "Microsoft YaHei", sans-serif'; ctx.globalAlpha = .9;
  ctx.fillText(`湿度 ${Math.round(s.current.relative_humidity_2m)}%      ${windDir(s.current.wind_direction_10m)} ${Math.round(s.current.wind_speed_10m)}km/h      最高 ${fmtT(s.daily.temperature_2m_max[0])}° 最低 ${fmtT(s.daily.temperature_2m_min[0])}°`, W / 2, 668);
  ctx.globalAlpha = 1;
  // 未来三天
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(90, 706); ctx.lineTo(W - 90, 706); ctx.stroke();
  ctx.font = '400 26px system-ui, "Microsoft YaHei", sans-serif';
  const days = s.daily.time.slice(1, 4);
  days.forEach((iso, i) => {
    const y = 756 + i * 52;
    const dw = wmo(s.daily.weather_code[i + 1], 1);
    const label = i === 0 ? '明天' : i === 1 ? '后天' : weekday(iso);
    ctx.textAlign = 'left';  ctx.fillText(label, 100, y);
    ctx.textAlign = 'center'; ctx.fillText(dw.icon, W / 2 - 60, y);
    ctx.textAlign = 'right'; ctx.fillText(`${fmtT(s.daily.temperature_2m_max[i + 1])}° / ${fmtT(s.daily.temperature_2m_min[i + 1])}°`, W - 100, y);
  });
  // 底部标语
  ctx.textAlign = 'center'; ctx.globalAlpha = .8;
  ctx.font = '400 26px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText('知你冷暖，陪你走过每个晴天雨天', W / 2, H - 70);
  ctx.font = '400 19px system-ui, sans-serif'; ctx.globalAlpha = .6;
  ctx.fillText(`数据更新于 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, W / 2, H - 36);
  return cvs.toDataURL('image/png');
}
function openShare() {
  const s = state.snap;
  if (!s || !s.current) return toast('天气数据还未就绪，稍等一下');
  try {
    const url = buildShareCard(s);
    document.querySelectorAll('.share-mask').forEach(m => m.remove());
    const mask = document.createElement('div'); mask.className = 'share-mask';
    mask.innerHTML = `<div class="share-modal" role="dialog" aria-label="分享卡片"><h3>分享卡片已生成</h3><img alt="天气分享卡片"><div class="share-actions"><button class="btn btn-primary" id="shareSave">保存图片</button><button class="btn" id="shareClose">关闭</button></div></div>`;
    mask.querySelector('img').src = url;
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
    mask.querySelector('#shareSave').onclick = () => {
      const a = document.createElement('a');
      a.download = `天气卡片-${s.loc.name}.png`; a.href = url; a.click();
      toast('图片已保存，快去分享吧 ✨');
    };
    mask.querySelector('#shareClose').onclick = () => mask.remove();
  } catch (e) { console.warn(e); toast('卡片生成失败，请重试'); }
}

/* ---------- 恶劣天气提醒（Notification） ---------- */
state.notify = store.get('wx:notify', false);
function syncNotifyBtn() {
  const b = $('#notifyBtn');
  b.textContent = state.notify ? '🔔' : '🔕';
  b.title = state.notify ? '已开启恶劣天气提醒，点击关闭' : '开启恶劣天气提醒';
}
async function toggleNotify() {
  if (!('Notification' in window)) return toast('当前浏览器不支持通知提醒');
  if (state.notify) {
    state.notify = false; store.set('wx:notify', false); syncNotifyBtn();
    return toast('已关闭恶劣天气提醒');
  }
  let perm = Notification.permission;
  if (perm === 'denied') return setNotice('🔕 通知权限已被浏览器禁用：请点击地址栏左侧锁图标 → 通知 → 允许，然后重新开启。', 'warn', 15000);
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm === 'granted') {
    state.notify = true; store.set('wx:notify', true); syncNotifyBtn();
    state._notified = null; evalNotify(state.snap);
    toast('已开启恶劣天气提醒 🔔');
  } else toast('未授权通知，提醒未开启');
}
function evalNotify(s) {
  if (!s || !s.loc || !state.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const key = locKey(s.loc);
  if (state._notified === key) return; // 每个城市每次会话只提醒一次
  const rs = [];
  const c = s.current;
  if (c.precipitation > 0.08 || RAIN_CODES.has(c.weather_code) || SNOW_CODES.has(c.weather_code)) rs.push(SNOW_CODES.has(c.weather_code) ? '正在下雪，出行注意保暖防滑' : '正在降水，出门记得带伞');
  if (s.hf.warning && s.hf.warning.length) rs.push('有生效中的气象预警：' + (s.hf.warning[0].title || '请注意防范'));
  if (c.temperature_2m <= 0) rs.push('气温在冰点附近，注意防寒保暖');
  if (c.temperature_2m >= 35) rs.push('高温天气，注意防暑补水');
  if (s.aqi && s.aqi.us_aqi != null && s.aqi.us_aqi > 150) rs.push('空气质量较差（AQI ' + Math.round(s.aqi.us_aqi) + '），建议减少户外活动');
  if (!rs.length) return;
  state._notified = key;
  try { new Notification('天气助手 · 温馨提醒', { body: rs.join('；') + '。', tag: 'wx-' + key }); } catch { /* 部分环境静默失败 */ }
}

/* ---------- file:// 打开保护 ---------- */
// 直接双击 HTML（file:// 协议）时，接口与代理均无法工作。
// 策略：探测本地服务 → 在线则自动跳转到 http://localhost:8787；离线则给出明确指引而非报错。
async function guardFileProtocol() {
  if (location.protocol !== 'file:') return true;
  const probe = fetch('http://localhost:8787/api/health?t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' })
    .then(() => true).catch(() => false);
  const up = await Promise.race([probe, new Promise(r => setTimeout(() => r(false), 3000))]);
  if (up) {
    location.replace('http://localhost:8787/' + (location.hash || ''));
    return false;
  }
  hideSplash();
  showError('检测到你是直接双击打开的 HTML 文件，这种方式无法获取天气数据。请双击项目文件夹里的「start-weather.bat」一键启动，或确认服务运行后访问 http://localhost:8787 。');
  return false;
}

/* ---------- 启动 ---------- */
(async function boot() {
  if (!(await guardFileProtocol())) return;
  applyTheme();
  setTimeout(hideSplash, 1000); // 启动页最多停留 1 秒，即使数据未就绪也先进入界面
  $('#unitBtn').textContent = state.unit === 'c' ? '°C' : '°F';
  // 穿搭偏好：性别 / 风格（持久化到本地，切换即时重渲染）
  const bindSeg = (id, key) => {
    const seg = $(id);
    const sync = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === state.outfit[key]));
    seg.querySelectorAll('button').forEach(b => b.onclick = () => {
      state.outfit[key] = b.dataset.v;
      store.set('wx:outfit', state.outfit);
      sync();
      if (state.snap) renderOutfit(state.snap);
      toast('已按你的偏好更新穿搭建议 ✨');
    });
    sync();
  };
  bindSeg('#outfitGender', 'gender');
  bindSeg('#outfitStyle', 'style');
  // P2：分享 / 天气提醒 / 雷达控件
  $('#shareBtn').onclick = openShare;
  syncNotifyBtn();
  $('#notifyBtn').onclick = toggleNotify;
  $('#radarZoom').querySelectorAll('button').forEach(b => b.onclick = () => {
    rv.zoom = +b.dataset.z; rv.key = '';
    $('#radarZoom').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (state.snap) renderRadar(state.snap);
  });
  $('#radarPlay').onclick = () => {
    rv.playing = !rv.playing;
    $('#radarPlay').textContent = rv.playing ? '⏸' : '▶';
    toast(rv.playing ? '雷达动画已播放' : '雷达动画已暂停');
  };
  renderTabs();
  // 探测服务端代理是否可用（本地 node server.js 时启用和风/高德）
  try {
    const k = await Promise.race([fetchJSON('/api/keys', 2500), new Promise((_, r) => setTimeout(() => r(new Error('no-proxy')), 2500))]);
    if (k && k.ok) state.proxy = { hefeng: !!k.hefeng, amap: !!k.amap };
  } catch { /* 静态托管环境：纯 Open-Meteo 模式 */ }

  if (state.cities.length) {
    const i = Math.min(state.active, state.cities.length - 1);
    state.active = i;
    await showLocation(state.cities[i]);
  } else {
    await locate();
  }
})();
