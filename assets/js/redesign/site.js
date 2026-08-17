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
  }

  function onTiltLeave(e) {
    var el = e.currentTarget;
    el.style.willChange = 'auto';
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
    var blocks = [];
    document.querySelectorAll('main article .highlighter-rouge').forEach(function (wrap) {
      var highlight = wrap.querySelector('.highlight');
      var header = wrap.querySelector('.code-header');
      if (highlight && header && !wrap.classList.contains('dfs-code')) {
        blocks.push({ wrap: wrap, highlight: highlight, header: header, height: highlight.scrollHeight });
      }
    });
    if (!blocks.length) return;

    /* 先完成全部测量，再统一写 DOM，避免长文中 mutate -> measure 的强制布局循环。 */
    blocks.forEach(function (block) {
      var wrap = block.wrap;
      var highlight = block.highlight;
      var header = block.header;

      wrap.classList.add('dfs-code');
      var blockNumber = ++codeSeq;
      var bodyId = 'dfs-code-' + blockNumber;

      /* 包裹 .highlight 进 grid 折叠结构 */
      var body = document.createElement('div');
      body.className = 'dfs-code-body';
      body.id = bodyId;
      var inner = document.createElement('div');
      inner.className = 'dfs-code-inner';
      wrap.insertBefore(body, highlight);
      inner.appendChild(highlight);
      body.appendChild(inner);

      /* 独立折叠按钮嵌在 span 中，避开 Chirpy 的 .code-header>button 复制契约。 */
      var toggleWrap = document.createElement('span');
      toggleWrap.className = 'dfs-code-toggle-wrap';
      var toggleButton = document.createElement('button');
      toggleButton.className = 'dfs-code-toggle';
      toggleButton.type = 'button';
      toggleButton.setAttribute('aria-controls', bodyId);

      var lights = document.createElement('span');
      lights.className = 'dfs-code-lights';
      lights.setAttribute('aria-hidden', 'true');
      lights.innerHTML = '<i></i><i></i><i></i>';

      var chevron = document.createElement('span');
      chevron.className = 'dfs-code-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '›'; // ›

      toggleButton.appendChild(lights);
      toggleButton.appendChild(chevron);
      toggleWrap.appendChild(toggleButton);
      header.insertBefore(toggleWrap, header.firstChild);

      /* 行数徽标（Chirpy rouge-table 行号在 .rouge-gutter pre.lineno） */
      var gutter = highlight.querySelector('.rouge-gutter pre.lineno, pre.lineno');
      var lineCount = gutter
        ? gutter.textContent.trim().split('\n').length
        : highlight.textContent.replace(/\n$/, '').split('\n').length;
      var languageEl = header.querySelector('span[data-label-text]');
      var language = languageEl ? languageEl.getAttribute('data-label-text') : '';
      var badge = document.createElement('span');
      badge.className = 'dfs-code-lines';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = lineCount + ' 行';
      header.appendChild(badge);

      var hideTimer = null;
      var zh = /^zh\b/i.test(document.documentElement.lang || '');
      var codeName = zh
        ? '第 ' + blockNumber + ' 个' + (language ? ' ' + language : '') + ' 代码块，共 ' + lineCount + ' 行'
        : 'code block ' + blockNumber + (language ? ', ' + language : '') + ', ' + lineCount + ' lines';

      function hideClosedBody() {
        if (!wrap.classList.contains('dfs-code-open')) body.hidden = true;
      }

      function setState(open, instant) {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }

        if (open) {
          body.hidden = false;
          body.removeAttribute('aria-hidden');
          body.removeAttribute('inert');
          if (!instant) body.offsetHeight;
        } else {
          body.setAttribute('aria-hidden', 'true');
          body.setAttribute('inert', '');
        }

        wrap.classList.toggle('dfs-code-open', open);
        toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggleButton.setAttribute(
          'aria-label',
          zh
            ? (open ? '收起' : '展开') + codeName
            : (open ? 'Collapse ' : 'Expand ') + codeName
        );

        if (!open) {
          if (instant) body.hidden = true;
          else hideTimer = setTimeout(hideClosedBody, 350);
        }
      }

      function toggle() {
        var willClose = wrap.classList.contains('dfs-code-open');
        setState(!willClose, false);
        if (willClose) {
          var top = wrap.getBoundingClientRect().top;
          if (top < 0) wrap.scrollIntoView({ block: 'start', behavior: 'auto' });
        }
      }

      body.addEventListener('transitionend', function (e) {
        if (e.target === body && e.propertyName === 'grid-template-rows') hideClosedBody();
      });
      toggleButton.addEventListener('click', toggle);

      /* 默认展开；超长块自动折叠 */
      setState(block.height <= CODE_AUTOFOLD, true);
    });
  }

  /* ---- 上游主题控件：补齐名称、搜索播报与移动侧栏状态 ---- */
  function setupAccessibleControls() {
    var zh = /^zh\b/i.test(document.documentElement.lang || '');

    document.querySelectorAll('.toc-trigger').forEach(function (button) {
      if (!button.hasAttribute('aria-label') && !button.textContent.trim()) {
        button.setAttribute('aria-label', zh ? '打开文章目录' : 'Open table of contents');
      }
    });

    var tocClose = document.getElementById('toc-popup-close');
    if (tocClose && !tocClose.hasAttribute('aria-label')) {
      tocClose.setAttribute('aria-label', zh ? '关闭文章目录' : 'Close table of contents');
    }

    document.querySelectorAll('a.anchor').forEach(function (anchor) {
      if (anchor.hasAttribute('aria-label')) return;
      var heading = anchor.closest('h2, h3, h4, h5, h6');
      var title = heading ? heading.textContent.trim() : '';
      anchor.setAttribute(
        'aria-label',
        title
          ? zh
            ? title + ' 的固定链接'
            : 'Permanent link to ' + title
          : zh
            ? '章节固定链接'
            : 'Permanent link to this section'
      );
    });

    var backToTop = document.getElementById('back-to-top');
    if (backToTop && !backToTop.hasAttribute('aria-label')) {
      backToTop.setAttribute('aria-label', zh ? '返回顶部' : 'Back to top');
    }

    document.querySelectorAll('#sidebar .nav-item.active .nav-link').forEach(function (link) {
      link.setAttribute('aria-current', 'page');
    });

    var results = document.getElementById('search-results');
    var input = document.getElementById('search-input');
    var cancel = document.getElementById('search-cancel');
    var searchTrigger = document.getElementById('search-trigger');
    var resultWrapper = document.getElementById('search-result-wrapper');
    if (results && input) {
      results.removeAttribute('role');
      results.removeAttribute('aria-live');
      results.removeAttribute('aria-atomic');

      var searchStatus = document.createElement('p');
      searchStatus.className = 'dfs-vh';
      searchStatus.setAttribute('role', 'status');
      searchStatus.setAttribute('aria-live', 'polite');
      searchStatus.setAttribute('aria-atomic', 'true');
      results.parentNode.insertBefore(searchStatus, results);

      function announceResults() {
        if (!input.value.trim()) {
          searchStatus.textContent = '';
          return;
        }
        var count = results.querySelectorAll('article').length;
        searchStatus.textContent = count
          ? zh
            ? '找到 ' + count + ' 项结果'
            : count + (count === 1 ? ' result found' : ' results found')
          : zh
            ? '没有找到结果'
            : 'No results found';
      }

      new MutationObserver(announceResults).observe(results, { childList: true });
    }

    if (cancel && input && searchTrigger) {
      var mobileSearchMQ = window.matchMedia('(max-width: 849px)');
      cancel.addEventListener('click', function () {
        input.value = '';
        requestAnimationFrame(function () {
          if (mobileSearchMQ.matches) searchTrigger.focus();
          else input.focus();
        });
      });

      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var mobileOpen = cancel.classList.contains('d-block');
        var desktopResultsOpen =
          resultWrapper && !resultWrapper.classList.contains('d-none');
        if (!mobileOpen && !desktopResultsOpen) return;
        e.preventDefault();
        if (mobileOpen) {
          cancel.click();
        } else {
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        }
      });
    }
  }

  function setupMobileSidebar() {
    var sidebar = document.getElementById('sidebar');
    var trigger = document.getElementById('sidebar-trigger');
    var mask = document.getElementById('mask');
    var mainWrapper = document.getElementById('main-wrapper');
    if (!sidebar || !trigger || !mask || !mainWrapper) return;
    /* 加密产物自行管理全页 dialog 与背景 inert，不能被主题侧栏状态覆盖。 */
    if (document.querySelector('.decrypt-overlay[data-pagecrypt-protected]')) return;

    /* Chirpy 7.3.1 abstracts/_breakpoints.scss: lg = 850px. */
    var mobileMQ = window.matchMedia('(max-width: 849px)');
    var returnFocus = false;
    var wasModalOpen = false;

    trigger.setAttribute('aria-controls', 'sidebar');

    function focusSidebar() {
      var current =
        sidebar.querySelector('.nav-item.active a') || sidebar.querySelector('a, button');
      if (current) current.focus();
    }

    function getFocusableItems() {
      return Array.prototype.filter.call(
        sidebar.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        function (el) {
          return !el.hasAttribute('hidden') && !el.closest('[hidden]');
        }
      );
    }

    function syncSidebar() {
      var mobile = mobileMQ.matches;
      var open = !mobile || document.body.hasAttribute('sidebar-display');
      var modalOpen = mobile && open;
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');

      if (mobile && !open) {
        sidebar.setAttribute('inert', '');
        sidebar.setAttribute('aria-hidden', 'true');
      } else {
        sidebar.removeAttribute('inert');
        sidebar.removeAttribute('aria-hidden');
      }

      if (modalOpen) {
        sidebar.setAttribute('role', 'dialog');
        sidebar.setAttribute('aria-modal', 'true');
      } else {
        sidebar.removeAttribute('role');
        sidebar.removeAttribute('aria-modal');
      }

      if (modalOpen && !wasModalOpen) focusSidebar();

      if (modalOpen) {
        mainWrapper.setAttribute('inert', '');
        mainWrapper.setAttribute('aria-hidden', 'true');
      } else {
        mainWrapper.removeAttribute('inert');
        mainWrapper.removeAttribute('aria-hidden');
      }

      if (mobile && !open && wasModalOpen && returnFocus) {
        requestAnimationFrame(function () {
          trigger.focus();
        });
      }

      wasModalOpen = modalOpen;
      if (!open) returnFocus = false;
    }

    trigger.addEventListener('click', function () {
      returnFocus = true;
    });
    mask.addEventListener('click', function () {
      returnFocus = true;
    });
    document.addEventListener('keydown', function (e) {
      if (!mobileMQ.matches || !document.body.hasAttribute('sidebar-display')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        returnFocus = true;
        mask.click();
        return;
      }

      if (e.key !== 'Tab') return;
      var items = getFocusableItems();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      var active = document.activeElement;

      if (!sidebar.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    });

    new MutationObserver(syncSidebar).observe(document.body, {
      attributes: true,
      attributeFilter: ['sidebar-display']
    });
    if (mobileMQ.addEventListener) mobileMQ.addEventListener('change', syncSidebar);
    else mobileMQ.addListener(syncSidebar);
    syncSidebar();
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

  /* ---- PRM 运行中切换：实时销毁 ---- */
  function onReduceChange() {
    if (reduceMQ.matches) {
      teardownTilt();
      teardownYearParallax();
      document.querySelectorAll('[data-reveal]').forEach(function (el) {
        el.classList.add('is-in');
      });
      document.dispatchEvent(new CustomEvent('dfs:reduce'));
    }
  }

  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduceChange);
  else reduceMQ.addListener(onReduceChange);

  function failOpenReveals(err) {
    if (window.__dfsRevealFallback) {
      clearTimeout(window.__dfsRevealFallback);
      window.__dfsRevealFallback = null;
    }
    document.documentElement.classList.remove('js');
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      el.classList.add('is-in');
    });
    if (window.console && console.error) console.error('[DFS] enhancement init failed', err);
  }

  function init() {
    try {
      markAutoReveals();
      setupReveals();
      setupTilt();
      setupProgress();
      setupYearParallax();
      setupCodeBlocks();
      setupAccessibleControls();
      setupMobileSidebar();
      if (window.__dfsRevealFallback) {
        clearTimeout(window.__dfsRevealFallback);
        window.__dfsRevealFallback = null;
      }
    } catch (err) {
      failOpenReveals(err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
