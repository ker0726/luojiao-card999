/* ============================================================
 *  supabase-config.js —— 后台连接配置
 *  把下面两项换成你自己 Supabase 项目的值即可（anon key 可公开，不含写权限）
 *  留空则整站走本地 data.js，不会报错。
 * ========================================================== */
window.SUPABASE_CONFIG = {
  url: 'https://ffjhzplbmdsghwrvejbw.supabase.co',
  anonKey: 'sb_publishable_J3-qI-IrDIj3W_aL3Q7WwQ_r39o449q',
  bucket: 'media' // 图片存储桶名，与 schema.sql 保持一致
};
