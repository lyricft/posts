(() => {
  const SELECTOR = [
    '.sl-markdown-content img',
    '.markdown img',
    'article img',
    'main img',
    '.prose img',
  ].join(',');

  const state = {
    pointers: new Map(),
    viewportW: 0,
    viewportH: 0,
    scale: 1,
    minScale: 1,
    maxScale: 6,
    baseScale: 1,
    tx: 0,
    ty: 0,
    dragStartX: 0,
    dragStartY: 0,
    dragStartTx: 0,
    dragStartTy: 0,
    moved: false,
    pinchDist: 0,
    pinchStartScale: 1,
    downTarget: null,
  };

  let root = null;
  let canvas = null;
  let imageEl = null;
  let zoomLabel = null;
  let loadTimer = null;
  let downloadBtn = null;
  let toastEl = null;
  let sourceUrl = '';
  let toastTimer = null;
  let prevBtn = null;
  let nextBtn = null;
  let counterEl = null;
  let gallery = [];
  let currentIndex = -1;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  // 图片扩展名 <-> MIME 映射，用于纠正 CDN 转换后的真实格式
  const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|svg|bmp|heic|tiff?)$/i;
  const EXT_BY_TYPE = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/avif': '.avif',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
  };

  // 从多种来源解析图片真实地址，兼容懒加载图片
  function resolveSrc(img) {
    const attrs = ['data-original', 'data-lazy-src', 'data-src'];
    for (const name of attrs) {
      const val = img.getAttribute(name);
      if (val && val.trim()) return val.trim();
    }
    if (img.currentSrc && img.currentSrc.trim()) return img.currentSrc;
    const src = img.getAttribute('src');
    if (src && src.trim()) return src;
    if (img.src && img.src.trim()) return img.src;
    return '';
  }

  /**
   * 从图片地址推断下载用的文件名。
   * 兼容图床在末尾追加 `/webp`、`?imageView2/...` 这类转换后缀的情况。
   */
  function guessFileName(url, alt) {
    let name = '';

    try {
      const parts = new URL(url, location.href).pathname.split('/').filter(Boolean);

      // 从后往前找第一个像图片文件名的片段
      for (let i = parts.length - 1; i >= 0; i--) {
        let seg = parts[i];
        try {
          seg = decodeURIComponent(seg);
        } catch (_) {}

        if (IMAGE_EXT_RE.test(seg)) {
          name = seg;
          break;
        }
      }

      // 退而求其次：取最后一段（如 /photo/12345 这类无扩展名的地址）
      if (!name && parts.length) {
        const last = parts[parts.length - 1];
        try {
          name = decodeURIComponent(last);
        } catch (_) {
          name = last;
        }
      }
    } catch (_) {}

    if (!name && alt && alt.trim()) name = alt.trim();
    if (!name) name = 'image';

    // 去掉 Windows / macOS / Linux 下的非法文件名字符
    name = name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').trim();
    if (!name) name = 'image';

    // 名字太长时保留扩展名截断
    if (name.length > 120) {
      const dot = name.lastIndexOf('.');
      name =
        dot > 0 && name.length - dot <= 10
          ? name.slice(0, 120 - (name.length - dot)) + name.slice(dot)
          : name.slice(0, 120);
    }

    if (!IMAGE_EXT_RE.test(name)) name += '.jpg';

    return name;
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      if (toastEl) toastEl.classList.remove('is-visible');
      toastTimer = null;
    }, 2600);
  }

  function setDownloadBusy(busy) {
    if (!downloadBtn) return;
    downloadBtn.classList.toggle('is-busy', busy);
    downloadBtn.disabled = busy;
    downloadBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function saveViaBlob(blob, fileName) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    a.remove();

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }

  function openInNewTab(url, fileName) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** 下载当前图片：优先取回字节直接保存，跨域受限时退回新标签页打开 */
  async function downloadImage() {
    if (!sourceUrl || !downloadBtn) return;

    const baseName = guessFileName(sourceUrl, imageEl?.alt || '');
    setDownloadBusy(true);
    showToast('正在准备下载…');

    let timer = null;

    try {
      const controller = new AbortController();
      timer = window.setTimeout(() => controller.abort(), 20000);

      const res = await fetch(sourceUrl, {
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();

      // CDN 常把原图转成 webp 但保留 .JPG 文件名，按真实 MIME 修正扩展名
      const realExt = EXT_BY_TYPE[blob.type];
      let fileName = baseName;

      if (realExt && !fileName.toLowerCase().endsWith(realExt)) {
        fileName = fileName.replace(/\.[a-z0-9]+$/i, '') + realExt;
      }

      saveViaBlob(blob, fileName);
      showToast('已开始下载');
    } catch (_) {
      // 跨域策略（无 Access-Control-Allow-Origin）会走到这里
      openInNewTab(sourceUrl, baseName);
      showToast('已在新标签页打开，右键或长按图片保存');
    } finally {
      if (timer) clearTimeout(timer);
      setDownloadBusy(false);
    }
  }

  function init() {
    document.querySelectorAll(SELECTOR).forEach((img) => {
      if (img.dataset.lightboxAttached) return;
      if (img.closest('a') || img.hasAttribute('data-lightbox-ignore')) return;
      if (img.closest('.image-viewer')) return;

      img.dataset.lightboxAttached = 'true';
      img.classList.add('lightbox-trigger');
      img.addEventListener('click', (e) => {
        e.preventDefault();
        open(img);
      });
    });
  }

  /** 收集当前页面所有可点击放大的图片，按 DOM 顺序作为浏览序列 */
  function collectGallery() {
    return Array.from(document.querySelectorAll('.lightbox-trigger')).filter(
      (img) => !img.closest('.image-viewer')
    );
  }

  function setGallery(source) {
    gallery = collectGallery();
    currentIndex = gallery.indexOf(source);

    // 兜底：图片不在序列里时，把它当作只有一张的图库
    if (currentIndex === -1) {
      gallery = [source];
      currentIndex = 0;
    }
  }

  function updateNav() {
    const multiple = gallery.length > 1;

    if (prevBtn) {
      const off = !multiple || currentIndex <= 0;
      prevBtn.disabled = off;
      prevBtn.setAttribute('aria-disabled', off ? 'true' : 'false');
    }

    if (nextBtn) {
      const off = !multiple || currentIndex >= gallery.length - 1;
      nextBtn.disabled = off;
      nextBtn.setAttribute('aria-disabled', off ? 'true' : 'false');
    }

    if (counterEl) {
      counterEl.textContent = multiple ? `${currentIndex + 1} / ${gallery.length}` : '';
      counterEl.hidden = !multiple;
    }
  }

  function navigate(delta) {
    if (!root || gallery.length < 2) return;

    const target = currentIndex + delta;
    if (target < 0 || target >= gallery.length) return;

    currentIndex = target;
    loadSource(gallery[currentIndex]);
  }

  /** 把某张图片装进当前灯箱；首次打开和切换图片共用这段逻辑 */
  function loadSource(source) {
    if (!root || !imageEl) return;

    if (loadTimer) {
      clearTimeout(loadTimer);
      loadTimer = null;
    }

    root.classList.remove('is-error');
    root.classList.add('is-swapping');
    imageEl.style.opacity = '0.25';
    imageEl.style.maxWidth = '';
    imageEl.style.maxHeight = '';
    imageEl.removeAttribute('srcset');
    imageEl.alt = source.alt || '';

    // 下载始终指向原图，而不是 srcset 命中的小尺寸变体
    sourceUrl = resolveSrc(source);

    updateNav();

    if (!sourceUrl) {
      finishLoad(false);
      return;
    }

    // 复制响应式图片源（如果有）
    const srcset = source.getAttribute('srcset');
    if (srcset) imageEl.setAttribute('srcset', srcset);

    imageEl.src = sourceUrl;

    // 安全后备：如果 load 事件意外丢失，2.5 秒后自动恢复
    loadTimer = window.setTimeout(() => {
      if (!root || !root.contains(imageEl)) return;

      const iw = imageEl.naturalWidth;
      const ih = imageEl.naturalHeight;

      if (imageEl.complete && (iw === 0 || ih === 0)) {
        finishLoad(false);
      } else if (iw > 0 && ih > 0) {
        finishLoad(true);
      }
    }, 2500);
  }

  function open(source) {
    close();

    const viewer = document.createElement('div');
    viewer.className = 'image-viewer';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-label', '图片查看器');

    const safeAlt = (source.alt || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    viewer.innerHTML = `
      <div class="image-viewer__loader" aria-label="加载中"></div>
      <div class="image-viewer__error">图片加载失败</div>

      <div class="image-viewer__canvas">
        <img class="image-viewer__img" alt="${safeAlt}" />
      </div>

      <button class="image-viewer__nav image-viewer__nav--prev" type="button" aria-label="上一张 (←)" title="上一张 (←)">
        <svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></svg>
      </button>

      <button class="image-viewer__nav image-viewer__nav--next" type="button" aria-label="下一张 (→)" title="下一张 (→)">
        <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
      </button>

      <div class="image-viewer__counter" aria-hidden="true"></div>

      <div class="image-viewer__toast" role="status" aria-live="polite"></div>

      <div class="image-viewer__toolbar" role="toolbar" aria-label="图片查看器">
        <button class="image-viewer__btn image-viewer__btn--close" type="button" aria-label="关闭 (Esc)">
          <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>

        <span class="image-viewer__divider"></span>

        <button class="image-viewer__btn image-viewer__btn--zoom-out" type="button" aria-label="缩小">
          <svg viewBox="0 0 24 24"><path d="M8 12h8"/></svg>
        </button>

        <span class="image-viewer__zoom" aria-live="polite">100%</span>

        <button class="image-viewer__btn image-viewer__btn--zoom-in" type="button" aria-label="放大">
          <svg viewBox="0 0 24 24"><path d="M12 8v8M8 12h8"/></svg>
        </button>

        <button class="image-viewer__btn image-viewer__btn--reset" type="button" aria-label="适应窗口 / 重置">
          <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
        </button>

        <span class="image-viewer__divider"></span>

        <button class="image-viewer__btn image-viewer__btn--download" type="button" aria-label="下载图片" title="下载图片">
          <svg viewBox="0 0 24 24"><path d="M12 3v11m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
        </button>
      </div>
    `;

    root = viewer;
    canvas = viewer.querySelector('.image-viewer__canvas');
    imageEl = viewer.querySelector('.image-viewer__img');
    zoomLabel = viewer.querySelector('.image-viewer__zoom');
    toastEl = viewer.querySelector('.image-viewer__toast');
    prevBtn = viewer.querySelector('.image-viewer__nav--prev');
    nextBtn = viewer.querySelector('.image-viewer__nav--next');
    counterEl = viewer.querySelector('.image-viewer__counter');

    document.body.appendChild(viewer);
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const closeBtn = viewer.querySelector('.image-viewer__btn--close');
    const zoomInBtn = viewer.querySelector('.image-viewer__btn--zoom-in');
    const zoomOutBtn = viewer.querySelector('.image-viewer__btn--zoom-out');
    const resetBtn = viewer.querySelector('.image-viewer__btn--reset');
    downloadBtn = viewer.querySelector('.image-viewer__btn--download');

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });

    zoomInBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      zoomAt(window.innerWidth / 2, window.innerHeight / 2, state.scale * 1.4, true);
    });

    zoomOutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      zoomAt(window.innerWidth / 2, window.innerHeight / 2, state.scale / 1.4, true);
    });

    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetView();
    });

    downloadBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadImage();
    });

    prevBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(-1);
    });

    nextBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(1);
    });

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const rect = canvas.getBoundingClientRect();
    state.viewportW = rect.width || window.innerWidth;
    state.viewportH = rect.height || window.innerHeight;

    imageEl.addEventListener('load', onImageLoad);
    imageEl.addEventListener('error', onImageError);

    // 建立浏览序列（上一张 / 下一张），再装载当前图片
    setGallery(source);
    loadSource(source);

    closeBtn.focus();
  }

  function finishLoad(success) {
    if (!root || !imageEl) return;
    if (!root.contains(imageEl)) return;

    if (loadTimer) {
      clearTimeout(loadTimer);
      loadTimer = null;
    }

    root.classList.remove('is-swapping');

    const rect = canvas?.getBoundingClientRect() || { width: 0, height: 0 };
    state.viewportW = rect.width || window.innerWidth;
    state.viewportH = rect.height || window.innerHeight;

    const iw = imageEl.naturalWidth || imageEl.offsetWidth || 0;
    const ih = imageEl.naturalHeight || imageEl.offsetHeight || 0;

    if (!success || iw <= 0 || ih <= 0) {
      root.classList.add('is-error');
      root.classList.add('is-loaded');
      imageEl.style.opacity = '0.15';
      return;
    }

    imageEl.style.opacity = '';

    if (iw > 1 && ih > 1) {
      state.baseScale = Math.max(
        0.02,
        Math.min(1, (state.viewportW - 48) / iw, (state.viewportH - 48) / ih)
      );
      state.minScale = state.baseScale;
      state.maxScale = Math.max(4, state.baseScale * 6);
    } else {
      // 无固定尺寸的图片（如部分 SVG）
      state.baseScale = 1;
      state.minScale = 0.1;
      state.maxScale = 6;
      imageEl.style.maxWidth = '80vw';
      imageEl.style.maxHeight = '80vh';
    }

    resetView();
    root.classList.add('is-loaded');
  }

  function onImageLoad() {
    finishLoad(true);
  }

  function onImageError() {
    finishLoad(false);
  }

  function close() {
    if (loadTimer) {
      clearTimeout(loadTimer);
      loadTimer = null;
    }

    if (!root) return;

    const old = root;
    root = null;
    canvas = null;
    imageEl = null;
    zoomLabel = null;
    downloadBtn = null;
    toastEl = null;
    prevBtn = null;
    nextBtn = null;
    counterEl = null;
    sourceUrl = '';
    currentIndex = -1;

    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    state.pointers.clear();

    old.classList.add('image-viewer--closing');
    old.addEventListener('animationend', () => old.remove(), { once: true });
    window.setTimeout(() => old.remove(), 300);

    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  function resetView() {
    state.scale = state.baseScale;
    state.tx = 0;
    state.ty = 0;
    clampBounds();
    setTransform(true);
  }

  function setTransform(animate = false) {
    if (!imageEl) return;

    imageEl.style.transition = animate
      ? 'transform 180ms cubic-bezier(.2,0,.2,1)'
      : 'none';

    imageEl.style.transform = `translate3d(${state.tx}px, ${state.ty}px, 0) scale(${state.scale})`;

    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
    }
  }

  function clampBounds() {
    if (!canvas || !imageEl) return;

    const rect = canvas.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;

    const iw = imageEl.naturalWidth || imageEl.offsetWidth || imageEl.getBoundingClientRect().width || 300;
    const ih = imageEl.naturalHeight || imageEl.offsetHeight || imageEl.getBoundingClientRect().height || 150;

    const sw = iw * state.scale;
    const sh = ih * state.scale;

    const maxX = Math.max(0, (sw - vw) / 2);
    const maxY = Math.max(0, (sh - vh) / 2);

    state.tx = clamp(state.tx, -maxX, maxX);
    state.ty = clamp(state.ty, -maxY, maxY);
  }

  function clampScale(v) {
    return clamp(v, state.minScale, state.maxScale);
  }

  function zoomAt(clientX, clientY, nextScale, animate) {
    if (!canvas || !imageEl) return;

    nextScale = clampScale(nextScale);

    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const iw = imageEl.naturalWidth || imageEl.offsetWidth || rect.width;
    const ih = imageEl.naturalHeight || imageEl.offsetHeight || rect.height;

    const px = (clientX - cx - state.tx) / state.scale + iw / 2;
    const py = (clientY - cy - state.ty) / state.scale + ih / 2;

    state.scale = nextScale;
    state.tx = clientX - cx - (px - iw / 2) * nextScale;
    state.ty = clientY - cy - (py - ih / 2) * nextScale;

    clampBounds();
    setTransform(animate);
  }

  function toggleZoomAt(clientX, clientY) {
    if (state.scale > state.baseScale * 1.05) {
      zoomAt(clientX, clientY, state.baseScale, true);
    } else {
      zoomAt(clientX, clientY, clampScale(state.baseScale * 2.5), true);
    }
  }

  function panBy(dx, dy) {
    state.tx += dx;
    state.ty += dy;
    clampBounds();
    setTransform(false);
  }

  /* ---------- 指针 / 拖拽 / 捏合 ---------- */
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    state.downTarget = e.target;

    if (state.pointers.size === 1) {
      state.dragStartX = e.clientX;
      state.dragStartY = e.clientY;
      state.dragStartTx = state.tx;
      state.dragStartTy = state.ty;
      state.moved = false;
      canvas.classList.add('is-dragging');
    } else if (state.pointers.size === 2) {
      state.moved = true;
      const pts = [...state.pointers.values()];
      state.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      state.pinchStartScale = state.scale;
    }
  }

  function onPointerMove(e) {
    if (!state.pointers.has(e.pointerId)) return;
    if (!canvas) return;

    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (state.pointers.size === 1) {
      const dx = e.clientX - state.dragStartX;
      const dy = e.clientY - state.dragStartY;

      if (!state.moved && Math.hypot(dx, dy) > 4) {
        state.moved = true;
      }

      if (state.moved) {
        state.tx = state.dragStartTx + dx;
        state.ty = state.dragStartTy + dy;
        clampBounds();
        setTransform(false);
      }
    } else if (state.pointers.size === 2) {
      state.moved = true;

      const pts = [...state.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

      if (state.pinchDist > 0 && dist > 0) {
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const nextScale = clampScale(state.pinchStartScale * (dist / state.pinchDist));
        zoomAt(midX, midY, nextScale, false);
      }

      state.pinchDist = dist;
    }
  }

  function onPointerUp(e) {
    const had = state.pointers.delete(e.pointerId);
    if (!had) return;

    try {
      canvas?.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (state.pointers.size < 2) {
      state.pinchDist = 0;
    }

    if (state.pointers.size === 1) {
      const remaining = [...state.pointers.values()][0];
      state.dragStartX = remaining.x;
      state.dragStartY = remaining.y;
      state.dragStartTx = state.tx;
      state.dragStartTy = state.ty;
      state.moved = true;
    }

    if (state.pointers.size === 0) {
      canvas?.classList.remove('is-dragging');

      if (!state.moved) {
        const target = state.downTarget || e.target;

        if (target === imageEl || (imageEl && imageEl.contains(target))) {
          toggleZoomAt(e.clientX, e.clientY);
        } else {
          close();
        }
      }

      state.moved = false;
    }
  }

  function onWheel(e) {
    e.preventDefault();

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nextScale = clampScale(state.scale * factor);
    zoomAt(e.clientX, e.clientY, nextScale, false);
  }

  /* ---------- 键盘快捷键 ---------- */
  document.addEventListener('keydown', (e) => {
    if (!root) return;

    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case '+':
      case '=':
        e.preventDefault();
        zoomAt(window.innerWidth / 2, window.innerHeight / 2, state.scale * 1.4, true);
        break;
      case '-':
      case '_':
        e.preventDefault();
        zoomAt(window.innerWidth / 2, window.innerHeight / 2, state.scale / 1.4, true);
        break;
      case '0':
        e.preventDefault();
        resetView();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        // Shift + ← 平移图片，单独按 ← 切换上一张
        if (e.shiftKey) panBy(60, 0);
        else navigate(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (e.shiftKey) panBy(-60, 0);
        else navigate(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        panBy(0, 60);
        break;
      case 'ArrowDown':
        e.preventDefault();
        panBy(0, -60);
        break;
    }
  });

  /* ---------- 初始化 ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 兼容 Astro View Transitions / 客户端路由
  document.addEventListener('astro:page-load', init);
})();
