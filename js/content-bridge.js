/* ============================================================
 *  content-bridge.js —— 远程内容加载桥
 *  有配置 → 从 Supabase 拉取内容并覆盖到 window.SITE_DATA
 *  没配置 / 拉取失败 → 直接使用 data.js 的本地内容（保证站点永远可用）
 * ========================================================== */
(function () {
  var CFG = window.SUPABASE_CONFIG || {};
  var configured = !!(CFG.url && CFG.anonKey);

  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  /* 深合并：对象逐层合并，数组整体替换（便于后台整段增删） */
  function merge(target, source) {
    if (!source) return target;
    Object.keys(source).forEach(function (key) {
      var sv = source[key];
      if (isPlainObject(sv) && isPlainObject(target[key])) {
        merge(target[key], sv);
      } else if (sv !== undefined) {
        target[key] = Array.isArray(sv) ? sv.slice() : sv;
      }
    });
    return target;
  }

  function apply(payload) {
    if (!payload || typeof payload !== 'object') return;
    window.SITE_DATA = merge(window.SITE_DATA || {}, payload);
    window.__siteContentSource = 'remote';
  }

  window.applySiteContent = apply;

  if (!configured) {
    // 未配置：立刻放行，页面按 data.js 渲染
    window.__siteContentSource = 'local';
    window.__contentReady = Promise.resolve();
    return;
  }

  window.__contentReady = (function () {
    var timeout = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, 3500);
    });
    var load = (async function () {
      try {
        var mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        var client = mod.createClient(CFG.url, CFG.anonKey);
        var res = await client.from('site_content').select('payload').eq('id', 'main').maybeSingle();
        if (res.error) throw res.error;
        if (res.data && res.data.payload && Object.keys(res.data.payload).length) {
          apply(res.data.payload);
        }
      } catch (err) {
        console.warn('[content] 远程内容不可用，回落本地 data.js：', err && err.message ? err.message : err);
        window.__siteContentSource = 'local';
      }
    })();
    // 网络慢时不拖住首屏：最多等 3.5 秒
    return Promise.race([load, timeout]);
  })();
})();
