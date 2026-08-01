(() => {
  // 只在有鼠标的设备上启用
  if (!window.matchMedia('(pointer: fine)').matches) return;

  // 创建光标 DOM
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';

  const ring = document.createElement('div');
  ring.className = 'cursor-ring';

  function init() {
    document.body.appendChild(dot);
    document.body.appendChild(ring);
    document.documentElement.classList.add('cursor-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 需要显示反馈的元素
  const interactive =
    'a, button, summary, [role="button"], input, select, textarea, label, .lightbox-trigger';

  // 鼠标位置
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;

  document.addEventListener(
    'mousemove',
    (e) => {
      targetX = e.clientX;
      targetY = e.clientY;

      // 圆点直接跟随
      dot.style.left = targetX + 'px';
      dot.style.top = targetY + 'px';

      // 判断是否悬停在交互元素上
      const el = e.target;
      const isHover =
        el && typeof el.closest === 'function' && el.closest(interactive) !== null;

      dot.classList.toggle('is-hover', isHover);
      ring.classList.toggle('is-hover', isHover);
    },
    { passive: true }
  );

  // 按下反馈
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dot.classList.add('is-down');
    ring.classList.add('is-down');
  });

  document.addEventListener('mouseup', () => {
    dot.classList.remove('is-down');
    ring.classList.remove('is-down');
  });

  // 光环平滑跟随（缓冲动画）
  let ringX = targetX;
  let ringY = targetY;

  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = 0.16;

  (function animate() {
    ringX = lerp(ringX, targetX, ease);
    ringY = lerp(ringY, targetY, ease);

    ring.style.left = ringX + 'px';
    ring.style.top = ringY + 'px';

    requestAnimationFrame(animate);
  })();

  // 兼容 Starlight 路由切换
  document.addEventListener('astro:page-load', () => {
    document.documentElement.classList.add('cursor-ready');
  });
})();
