/* DFS redesign — 全站微动效（阶段三新增，零依赖，~2KB gzip）
 * 职责：motionOK 单例 / IO 入场 / 指针 3D 倾斜 / 阅读进度条 / 自定义光标
 * 降级铁律：PRM 或 saveData → 全部动效不启动；触屏 → 倾斜/光标不启动；
 * PRM 运行中切换 → 实时销毁。CSS 初态在 html.js + no-preference 双门内，
 * 本文件不执行也不会藏内容。
 */
(function () {
  'use strict';

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var saveData = navigator.connection && navigator.connection.saveData === true;

  function motionOK() {
    return !reduceMQ.matches && !saveData;
  }

  window.DFS = { motionOK: motionOK, finePointer: finePointer, reduceMQ: reduceMQ };

  /* ---- 列表页自动入场：对视口下方的列表项注入 data-reveal ----
   * 只处理视口外元素（视口内元素不动 → 零闪烁）；无 JS 时属性不存在，
   * CSS 初态不命中，内容天然可见。 */
  var AUTO_REVEAL_SEL = [
    '#archives li',
    '.card.categories',
    '#tags > div',
    '.friend-card-item',
    '#related-posts .card'
  ].join(',');

  function markAutoReveals() {
    if (!motionOK()) return;
    var vh = window.innerHeight;
    var i = 0;
    document.querySelectorAll(AUTO_REVEAL_SEL).forEach(function (el) {
      if (el.getBoundingClientRect().top > vh) {
        el.setAttribute('data-reveal', '');
        el.style.setProperty('--i', (i++ % 5).toString());
      }
    });
  }

  /* ---- IO 入场（[data-reveal] → .is-in，只播一次） ---- */
  var io = null;

  function setupReveals() {
    var els = document.querySelectorAll('[data-reveal]:not(.is-in)');
    if (!els.length) return;

    if (!motionOK() || !('IntersectionObserver' in window)) {
      els.forEach(function (el) {
        el.classList.add('is-in');
      });
      return;
    }

    io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    els.forEach(function (el) {
      io.observe(el);
    });
  }

  /* ---- 指针 3D 倾斜（VueUse useParallax 移植：±8°, perspective 800） ---- */
  var tiltEls = [];

  function onTiltMove(e) {
    var el = e.currentTarget;
    var r = el.getBoundingClientRect();
    var nx = (e.clientX - r.left - r.width / 2) / r.width;
    var ny = (e.clientY - r.top - r.height / 2) / r.height;
    el.style.transform =
      'perspective(800px) rotateX(' + (-ny * 16).toFixed(2) + 'deg) rotateY(' + (nx * 16).toFixed(2) + 'deg)';
  }

  function onTiltEnter(e) {
    e.currentTarget.style.willChange = 'transform';
    e.currentTarget.style.transition = 'none';
  }

  function onTiltLeave(e) {
    var el = e.currentTarget;
    el.style.willChange = 'auto';
    el.style.transition = 'transform 0.3s ease-out';
    el.style.transform = '';
  }

  function setupTilt() {
    if (!finePointer || !motionOK()) return;
    document.querySelectorAll('[data-tilt]').forEach(function (el) {
      el.addEventListener('pointermove', onTiltMove);
      el.addEventListener('pointerenter', onTiltEnter);
      el.addEventListener('pointerleave', onTiltLeave);
      tiltEls.push(el);
    });
  }

  function teardownTilt() {
    tiltEls.forEach(function (el) {
      el.removeEventListener('pointermove', onTiltMove);
      el.removeEventListener('pointerenter', onTiltEnter);
      el.removeEventListener('pointerleave', onTiltLeave);
      el.style.transform = '';
      el.style.willChange = 'auto';
    });
    tiltEls = [];
  }

  /* ---- 代码块：Mac 终端窗口 + 点击标题栏折叠 ----
   * 交通灯 + 旋转 chevron + 语言标签；折叠用 grid-template-rows 0fr→1fr
   * （平滑到自然高度、无需魔法数值）。默认展开；超长块（>560px）自动折叠。
   * 保留 Chirpy 的 .code-header>button 复制按钮（ClipboardJS 契约不动）。 */
  var CODE_AUTOFOLD = 560; // px，超过则加载时默认折叠
  var codeSeq = 0;

  function setupCodeBlocks() {
    var wraps = document.querySelectorAll('main article .highlighter-rouge');
    if (!wraps.length) return;

    wraps.forEach(function (wrap) {
      var highlight = wrap.querySelector('.highlight');
      var header = wrap.querySelector('.code-header');
      if (!highlight || !header || wrap.classList.contains('dfs-code')) return;

      wrap.classList.add('dfs-code');
      var bodyId = 'dfs-code-' + ++codeSeq;

      /* 包裹 .highlight 进 grid 折叠结构 */
      var body = document.createElement('div');
      body.className = 'dfs-code-body';
      body.id = bodyId;
      var inner = document.createElement('div');
      inner.className = 'dfs-code-inner';
      wrap.insertBefore(body, highlight);
      inner.appendChild(highlight);
      body.appendChild(inner);

      /* 交通灯 + chevron 注入 code-header 左侧（用 span，避开 clipboard 选择器） */
      var lights = document.createElement('span');
      lights.className = 'dfs-code-lights';
      lights.setAttribute('aria-hidden', 'true');
      lights.innerHTML = '<i></i><i></i><i></i>';

      var chevron = document.createElement('span');
      chevron.className = 'dfs-code-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '›'; // ›

      header.insertBefore(chevron, header.firstChild);
      header.insertBefore(lights, header.firstChild);

      /* 行数徽标（Chirpy rouge-table 行号在 .rouge-gutter pre.lineno） */
      var gutter = highlight.querySelector('.rouge-gutter pre.lineno, pre.lineno');
      var lineCount = gutter
        ? gutter.textContent.trim().split('\n').length
        : highlight.textContent.replace(/\n$/, '').split('\n').length;
      if (lineCount > 1) {
        var badge = document.createElement('span');
        badge.className = 'dfs-code-lines';
        badge.setAttribute('aria-hidden', 'true');
        badge.textContent = lineCount + ' 行';
        header.appendChild(badge);
      }

      /* 标题栏点击折叠：整条 header 可点，但复制按钮除外 */
      header.classList.add('dfs-code-toggle');
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-controls', bodyId);

      function setState(open) {
        wrap.classList.toggle('dfs-code-open', open);
        header.setAttribute('aria-expanded', open ? 'true' : 'false');
      }

      function toggle(e) {
        /* 点复制按钮/其内图标时不折叠 */
        if (e && e.target.closest && e.target.closest('button')) return;
        var willClose = wrap.classList.contains('dfs-code-open');
        setState(!willClose);
        if (willClose) {
          var top = wrap.getBoundingClientRect().top;
          if (top < 0) wrap.scrollIntoView({ block: 'start', behavior: 'auto' });
        }
      }

      header.addEventListener('click', toggle);
      header.addEventListener('keydown', function (e) {
        if (e.target.closest('button')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });

      /* 默认展开；超长块自动折叠 */
      setState(highlight.scrollHeight <= CODE_AUTOFOLD);
    });
  }

  /* ---- 阅读进度条（仅文章页：main > article 存在时注入） ---- */
  var progressEl = null;
  var progressTick = false;

  function onProgressScroll() {
    if (progressTick) return;
    progressTick = true;
    requestAnimationFrame(function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      progressEl.style.transform = 'scaleX(' + (max > 0 ? h.scrollTop / max : 0) + ')';
      progressTick = false;
    });
  }

  function setupProgress() {
    if (!document.querySelector('main article')) return;
    if (document.body.classList.contains('dfs-home')) return;
    progressEl = document.createElement('div');
    progressEl.id = 'dfs-progress';
    progressEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progressEl);
    window.addEventListener('scroll', onProgressScroll, { passive: true });
    onProgressScroll();
  }

  /* ---- 归档年份轻视差（PRM/触屏关） ---- */
  var yearEls = null;
  var yearTick = false;

  function onYearScroll() {
    if (yearTick) return;
    yearTick = true;
    requestAnimationFrame(function () {
      var vh = window.innerHeight;
      yearEls.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom > -100 && r.top < vh + 100) {
          el.style.transform =
            'translateY(' + ((r.top - vh / 2) * -0.06).toFixed(1) + 'px)';
        }
      });
      yearTick = false;
    });
  }

  function setupYearParallax() {
    if (!finePointer || !motionOK()) return;
    var els = document.querySelectorAll('#archives time.year');
    if (!els.length) return;
    yearEls = Array.prototype.slice.call(els);
    window.addEventListener('scroll', onYearScroll, { passive: true });
    onYearScroll();
  }

  function teardownYearParallax() {
    if (!yearEls) return;
    window.removeEventListener('scroll', onYearScroll);
    yearEls.forEach(function (el) {
      el.style.transform = '';
    });
    yearEls = null;
  }

  /* ---- 自定义光标（桌面 fine pointer + motionOK） ---- */
  var cursorEl = null;
  var ringEl = null;
  var cursorRaf = null;
  var cursorLive = false;
  var cx = 0; // 点
  var cy = 0;
  var rx = 0; // 环
  var ry = 0;
  var tx = 0; // 目标
  var ty = 0;
  var HOVER_SEL = 'a, button, [role="button"], input, label, summary';

  function cursorLoop() {
    cx += (tx - cx) * 0.4; // 点：近即时
    cy += (ty - cy) * 0.4;
    rx += (tx - rx) * 0.15; // 环：滞后跟随
    ry += (ty - ry) * 0.15;
    cursorEl.style.translate = cx.toFixed(1) + 'px ' + cy.toFixed(1) + 'px';
    ringEl.style.translate = rx.toFixed(1) + 'px ' + ry.toFixed(1) + 'px';
    cursorRaf = requestAnimationFrame(cursorLoop);
  }

  function onCursorMove(e) {
    tx = e.clientX;
    ty = e.clientY;
    /* 首次出现（含跳转后的新页面）：点与环都直接落在指针处再淡入，
       不从初始坐标插值飞过来 */
    if (!cursorLive) {
      cursorLive = true;
      cx = rx = tx;
      cy = ry = ty;
      cursorEl.style.translate = cx + 'px ' + cy + 'px';
      ringEl.style.translate = rx + 'px ' + ry + 'px';
      cursorEl.classList.add('is-live');
      ringEl.classList.add('is-live');
    }
  }

  /* 拖图片/链接会触发浏览器原生拖放，期间 pointermove 停发、光标冻结。
     自定义光标下这类拖放无意义 —— 直接拦截 dragstart，任何拖动都退化为
     文字选择（pointermove 正常派发，光标正常跟随）。 */
  function blockNativeDrag(e) {
    e.preventDefault();
  }

  /* 按在原生滚动条上（offset 超出内容盒 = 落在滚动条区域）→ 拖动期间
     恢复系统光标；松开复原。解决拖横向滚动条时自定义光标冻结无反馈。 */
  function onCursorDown(e) {
    var t = e.target;
    if (
      t &&
      t.nodeType === 1 &&
      (e.offsetX > t.clientWidth || e.offsetY > t.clientHeight)
    ) {
      document.documentElement.classList.add('dfs-dragging-scroll');
    }
  }

  function onCursorUp() {
    document.documentElement.classList.remove('dfs-dragging-scroll');
  }

  /* 指针离开窗口：隐藏并复位，重新进入时同样直接落点 */
  function onCursorLeaveDoc(e) {
    if (!e.relatedTarget && cursorEl) {
      cursorLive = false;
      cursorEl.classList.remove('is-live', 'is-hover');
      ringEl.classList.remove('is-live', 'is-hover');
    }
  }

  /* 单一 pointerover 按当前目标定态：相邻交互元素间移动时类保持不变，
     过渡不重启 → 无「移除→重加」的闪跳 */
  function onCursorOver(e) {
    var hovering = !!(e.target.closest && e.target.closest(HOVER_SEL));
    cursorEl.classList.toggle('is-hover', hovering);
    ringEl.classList.toggle('is-hover', hovering);
  }

  function setupCursor() {
    if (!finePointer || !motionOK()) return;
    cursorEl = document.createElement('div');
    cursorEl.id = 'dfs-cursor';
    cursorEl.setAttribute('aria-hidden', 'true');
    ringEl = document.createElement('div');
    ringEl.id = 'dfs-cursor-ring';
    ringEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cursorEl);
    document.body.appendChild(ringEl);
    document.documentElement.classList.add('dfs-cursor-on');
    window.addEventListener('pointermove', onCursorMove, { passive: true });
    document.addEventListener('pointerover', onCursorOver, { passive: true });
    document.addEventListener('pointerout', onCursorLeaveDoc, { passive: true });
    document.addEventListener('dragstart', blockNativeDrag);
    document.addEventListener('pointerdown', onCursorDown, { passive: true });
    window.addEventListener('pointerup', onCursorUp, { passive: true });
    cursorRaf = requestAnimationFrame(cursorLoop);
  }

  function teardownCursor() {
    if (!cursorEl) return;
    cancelAnimationFrame(cursorRaf);
    window.removeEventListener('pointermove', onCursorMove);
    document.removeEventListener('pointerover', onCursorOver);
    document.removeEventListener('pointerout', onCursorLeaveDoc);
    document.removeEventListener('dragstart', blockNativeDrag);
    document.removeEventListener('pointerdown', onCursorDown);
    window.removeEventListener('pointerup', onCursorUp);
    document.documentElement.classList.remove('dfs-dragging-scroll');
    document.documentElement.classList.remove('dfs-cursor-on');
    cursorEl.remove();
    if (ringEl) ringEl.remove();
    cursorEl = null;
    ringEl = null;
  }

  /* ---- PRM 运行中切换：实时销毁 ---- */
  reduceMQ.addEventListener('change', function () {
    if (reduceMQ.matches) {
      teardownTilt();
      teardownCursor();
      teardownYearParallax();
      document.querySelectorAll('[data-reveal]').forEach(function (el) {
        el.classList.add('is-in');
      });
      document.dispatchEvent(new CustomEvent('dfs:reduce'));
    }
  });

  function init() {
    markAutoReveals();
    setupReveals();
    setupTilt();
    setupProgress();
    setupCursor();
    setupYearParallax();
    setupCodeBlocks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
