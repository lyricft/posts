/**
 * 为 .photo-flow 图片流提供逐张淡入与失败重试。
 *
 * 占位高度由 CSS 无条件提供（不依赖本脚本），这里只负责：
 *   1. 打总开关 .pf-ready —— 开启微光扫动与图片淡入
 *   2. 图片载入后给父级 <p> 加 .is-loaded，撤掉占位
 *   3. 失败时自动重试一次（图床偶发超时很常见），仍失败则标记 .is-error
 */
(() => {
  const SELECTOR = '.photo-flow';
  const MAX_RETRY = 1;
  const RETRY_DELAY = 1200;

  function holderOf(img) {
    return img.closest('p') || img.parentElement || img;
  }

  function reveal(img) {
    const holder = holderOf(img);
    holder.classList.remove('is-error');
    holder.classList.add('is-loaded');
    img.classList.add('is-loaded');
  }

  function markError(img) {
    holderOf(img).classList.add('is-error');
  }

  function retryOrFail(img) {
    if (img.classList.contains('is-loaded')) return;

    const tried = Number(img.dataset.pfRetry || '0');
    const url = img.getAttribute('src') || '';

    if (tried >= MAX_RETRY || !url) {
      markError(img);
      return;
    }

    img.dataset.pfRetry = String(tried + 1);

    window.setTimeout(() => {
      if (!img.isConnected || img.classList.contains('is-loaded')) return;

      // 加一个参数绕开失败响应的缓存
      const sep = url.includes('?') ? '&' : '?';
      img.src = `${url}${sep}pf_retry=${tried + 1}`;
    }, RETRY_DELAY);
  }

  /**
   * 延后两帧再揭示。
   * 已缓存 / 秒开的图片如果在同一帧里直接加类，浏览器来不及渲染「隐藏」这一帧，
   * 过渡会被跳过、图片直接出现。等两帧让它先画出占位态，淡入才看得见。
   */
  function revealNextFrame(img) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => reveal(img));
    });
  }

  function bind(img) {
    if (img.dataset.pfBound) return;
    img.dataset.pfBound = 'true';

    img.addEventListener('load', () => reveal(img));
    img.addEventListener('error', () => retryOrFail(img));

    // 已经处理完的图片：仍然走一次淡入，而不是直接闪现
    if (img.complete) {
      if (img.naturalWidth > 0) revealNextFrame(img);
      else retryOrFail(img);
    }
  }

  function init() {
    const containers = document.querySelectorAll(SELECTOR);
    if (!containers.length) return;

    containers.forEach((container) => {
      // 先开总开关，再处理图片，避免已缓存的图片先闪现再淡入
      container.classList.add('pf-ready');
      container.querySelectorAll('img').forEach(bind);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 兼容 Astro View Transitions / 客户端路由
  document.addEventListener('astro:page-load', init);
})();
