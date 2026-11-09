/* ============================================================
 *  supabase-config.js —— 后台连接配置
 *  把下面两项换成你自己 Supabase 项目的值即可（anon key 可公开，不含写权限）
 *  留空则整站走本地 data.js，不会报错。
 * ========================================================== */
window.SUPABASE_CONFIG = {
  url: '',        // 例：'https://abcdefghijklm.supabase.co'
  anonKey: '',    // 例：'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....'
  bucket: 'media' // 图片存储桶名，与 schema.sql 保持一致
};
