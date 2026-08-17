/* DFS redesign — 首页编排（阶段三新增）
 * 依赖（同页 defer，按文档序先行装载）：site.js（window.DFS）、gsap、ScrollTrigger、Lenis。
 * 职责：canvas 粒子节点拓扑 hero / $ whoami 打字机 / 章节号 scramble /
 *       hero pin + ghost 数字视差（桌面）/ 数字滚动 / 磁性按钮 /
 *       章节轨 scroll-spy / Lenis 平滑滚动与搜索浮层协调。
 * 初始化按 idle-until-urgent 分链，canvas 首帧在 LCP 之后。
 * 降级：PRM/saveData → 全部不启动（canvas 换静态底）；触屏 → 无 pin/Lenis/磁性，
 *       粒子减至 1/3 并关连线；dfs:reduce 事件 → 运行中实时销毁。
 */
(function () {
  'use strict';

  var DFS = window.DFS || {
    motionOK: function () {
      return false;
    },
    finePointer: false
  };
  var lenis = null;
  var lenisTicker = null;
  var net = null;

  /* ================ canvas 粒子节点拓扑 ================ */
  function createNet(canvas) {
    var ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return null;

    var fine = DFS.finePointer;
    var count = fine ? 90 : 32;
    var LINK_DIST = 110;
    var POINTER_R = 130;
    var dprCap = fine ? 2 : 1.5;
    var particles = [];
    var raf = null;
    var running = false;
    var w = 0;
    var h = 0;
    var dpr = 1;
    var px = -9999;
    var py = -9999;
    var lastPointerT = 0;
    var slowFrames = 0;
    var lastT = 0;
    var destroyed = false;
    var visible = true;
    var host = canvas.parentElement;
    var accent = { r: 155, g: 184, b: 225 };

    function readAccent() {
      if (destroyed) return;
      /* 读 canvas 自身计算样式：拿到 hero 局部覆盖的冰蓝，而非全局强调色 */
      var v = getComputedStyle(canvas).getPropertyValue('--dfs-acc').trim();
      var m = /^#?([0-9a-f]{6})$/i.exec(v);
      if (m) {
        accent = {
          r: parseInt(m[1].slice(0, 2), 16),
          g: parseInt(m[1].slice(2, 4), 16),
          b: parseInt(m[1].slice(4, 6), 16)
        };
      }
    }

    function resize() {
      if (destroyed) return;
      dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particles.length) {
        seed();
        start();
      }
    }

    function seed() {
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35
        });
      }
    }

    function frame(t) {
      raf = null;
      if (destroyed || !running) return;

      /* 帧预算自限：连续 3 帧 > 34ms → 粒子数 ×0.75（地板 16） */
      if (lastT) {
        if (t - lastT > 34) {
          if (++slowFrames >= 3 && particles.length > 16) {
            particles.length = Math.max(16, Math.floor(particles.length * 0.75));
            slowFrames = 0;
          }
        } else {
          slowFrames = 0;
        }
      }
      lastT = t;

      if (lastPointerT && t - lastPointerT > 700) {
        px = -9999;
        py = -9999;
        lastPointerT = 0;
      }

      ctx.clearRect(0, 0, w, h);
      var n = particles.length;
      var energy = 0;
      var i;
      var j;

      for (i = 0; i < n; i++) {
        var p = particles[i];

        /* 指针斥力 */
        var dx = p.x - px;
        var dy = p.y - py;
        var d2 = dx * dx + dy * dy;
        if (d2 < POINTER_R * POINTER_R && d2 > 0.01) {
          var d = Math.sqrt(d2);
          var f = ((POINTER_R - d) / POINTER_R) * 0.06;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }

        p.vx *= 0.985;
        p.vy *= 0.985;
        energy += p.vx * p.vx + p.vy * p.vy;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        /* 速度映射亮度（igloo: velocity → color） */
        var speed = Math.min(1, Math.hypot(p.vx, p.vy) * 2.2);
        var alpha = 0.35 + speed * 0.5;
        ctx.fillStyle =
          'rgba(' + accent.r + ',' + accent.g + ',' + accent.b + ',' + alpha.toFixed(2) + ')';
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }

      /* 连线（O(n²)，仅桌面） */
      if (fine) {
        for (i = 0; i < n; i++) {
          for (j = i + 1; j < n; j++) {
            var a = particles[i];
            var b = particles[j];
            var lx = a.x - b.x;
            var ly = a.y - b.y;
            var ld2 = lx * lx + ly * ly;
            if (ld2 < LINK_DIST * LINK_DIST) {
              var ld = Math.sqrt(ld2);
              /* 指针邻近的连线增亮 */
              var mx = (a.x + b.x) / 2 - px;
              var my = (a.y + b.y) / 2 - py;
              var near =
                mx * mx + my * my < POINTER_R * POINTER_R * 4 ? 0.14 : 0;
              var la = (1 - ld / LINK_DIST) * 0.14 + near;
              ctx.strokeStyle =
                'rgba(' + accent.r + ',' + accent.g + ',' + accent.b + ',' + la.toFixed(3) + ')';
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }

      /* 无指针输入且粒子已近乎静止时保留最后一帧，避免静态画面持续耗电。 */
      if (px < -9000 && energy / Math.max(n, 1) < 0.0004) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (destroyed || running) return;
      running = true;
      lastT = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }

    function onPointer(e) {
      if (destroyed) return;
      var r = canvas.getBoundingClientRect();
      px = e.clientX - r.left;
      py = e.clientY - r.top;
      lastPointerT = performance.now();
      start();
    }

    function onLeave() {
      if (destroyed) return;
      px = -9999;
      py = -9999;
      lastPointerT = 0;
    }

    readAccent();
    resize();
    seed();

    function onVisibilityChange() {
      if (destroyed) return;
      if (document.hidden) stop();
      else if (visible) start();
    }

    function onThemeMessage(e) {
      if (!destroyed && e.data && e.data.id === 'theme-mode') readAccent();
    }

    window.addEventListener('resize', resize, { passive: true });
    if (fine && host) {
      host.addEventListener('pointermove', onPointer, { passive: true });
      host.addEventListener('pointerleave', onLeave, { passive: true });
    }

    /* 切后台 / 滚出视口即停帧 */
    document.addEventListener('visibilitychange', onVisibilityChange);
    var vio = new IntersectionObserver(function (entries) {
      if (destroyed) return;
      visible = entries[0].isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    });
    vio.observe(canvas);

    /* 暗亮切换（Chirpy postMessage 契约）时重取强调色 */
    window.addEventListener('message', onThemeMessage);

    return {
      start: start,
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        stop();
        vio.disconnect();
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('message', onThemeMessage);
        if (fine && host) {
          host.removeEventListener('pointermove', onPointer);
          host.removeEventListener('pointerleave', onLeave);
        }
        particles = [];
        document.documentElement.classList.remove('dfs-canvas-on');
      }
    };
  }

  /* ================ $ whoami 打字机 ================ */
  function typewriter() {
    var el = document.getElementById('dfs-typer');
    if (!el) return;
    var text = '$ whoami';
    if (!DFS.motionOK()) {
      el.textContent = text;
      el.classList.add('dfs-typer-out');
      return;
    }
    var i = 0;
    el.classList.add('dfs-typer-out');
    (function tick() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(tick, i === 2 ? 350 : 65 + Math.random() * 70);
      }
    })();
  }

  /* ================ 章节号 scramble 解码 ================ */
  var GLYPHS = '01<>/#$%&@!*+=?';

  function scrambleOnce(el) {
    var target = el.getAttribute('data-scramble') || el.textContent.trim();
    if (!DFS.motionOK()) return;
    var anim = document.createElement('span');
    anim.className = 'dfs-scramble-anim';
    anim.setAttribute('aria-hidden', 'true');
    el.appendChild(anim);
    el.classList.add('is-scrambling');
    var frames = 0;
    var total = 18;
    var iv = setInterval(function () {
      var out = '';
      var settled = Math.floor((frames / total) * target.length);
      for (var i = 0; i < target.length; i++) {
        out += i < settled ? target[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      anim.textContent = out;
      if (++frames > total) {
        clearInterval(iv);
        el.classList.remove('is-scrambling');
        anim.remove();
      }
    }, 40);
  }

  function setupScramble() {
    var els = document.querySelectorAll('.dfs-scramble');
    if (!els.length || !('IntersectionObserver' in window)) return;
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          scrambleOnce(entry.target);
          sio.unobserve(entry.target);
        }
      });
    });
    els.forEach(function (el) {
      sio.observe(el);
    });
  }

  /* ================ 数字滚动（HTML 预渲染终值） ================ */
  function setupCounters() {
    var els = document.querySelectorAll('.dfs-count[data-count]');
    if (!els.length) return;
    els.forEach(function (el) {
      /* 读屏拿静态终值，滚动层 aria-hidden */
      var vh = document.createElement('span');
      vh.className = 'dfs-vh';
      vh.textContent = el.textContent;
      el.parentElement.insertBefore(vh, el);
      el.setAttribute('aria-hidden', 'true');
    });

    if (!DFS.motionOK() || !window.gsap || !('IntersectionObserver' in window)) return;

    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        cio.unobserve(el);
        var end = parseInt(el.getAttribute('data-count'), 10) || 0;
        var obj = { v: 0 };
        window.gsap.to(obj, {
          v: end,
          duration: 1.4,
          ease: 'power3.out',
          onUpdate: function () {
            el.textContent = Math.round(obj.v);
          }
        });
      });
    });
    els.forEach(function (el) {
      cio.observe(el);
    });
  }

  /* ================ 磁性按钮 ================ */
  var magnets = [];

  function setupMagnetic() {
    if (!DFS.finePointer || !DFS.motionOK() || !window.gsap) return;
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      var qx = window.gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3.out' });
      var qy = window.gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3.out' });

      function move(e) {
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        qx(dx * 0.3);
        qy(dy * 0.3);
      }

      function leave() {
        window.gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
      }

      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      magnets.push({ el: el, move: move, leave: leave });
    });
  }

  function teardownMagnetic() {
    magnets.forEach(function (m) {
      m.el.removeEventListener('pointermove', m.move);
      m.el.removeEventListener('pointerleave', m.leave);
      m.el.style.transform = '';
    });
    magnets = [];
  }

  /* ================ 章节轨 scroll-spy + 锚点滚动 ================ */
  function setupRail() {
    var rail = document.querySelector('.dfs-rail');
    if (!rail) return;
    var links = rail.querySelectorAll('a');
    var map = {};
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      map[id] = a;
    });

    if ('IntersectionObserver' in window) {
      var spy = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting && map[entry.target.id]) {
              links.forEach(function (a) {
                a.removeAttribute('aria-current');
              });
              map[entry.target.id].setAttribute('aria-current', 'true');
            }
          });
        },
        { rootMargin: '-45% 0px -45% 0px' }
      );
      Object.keys(map).forEach(function (id) {
        var sec = document.getElementById(id);
        if (sec) spy.observe(sec);
      });
    }

    /* 锚点经 Lenis 平滑（无 Lenis 时走原生/CSS smooth） */
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a || !lenis) return;
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, {
        offset: 0,
        onStart: startLenisTicker,
        onComplete: function () {
          var temporaryTabindex = !target.hasAttribute('tabindex');
          if (temporaryTabindex) target.setAttribute('tabindex', '-1');
          try {
            target.focus({ preventScroll: true });
          } catch (err) {
            target.focus();
          }
          if (temporaryTabindex) {
            target.addEventListener(
              'blur',
              function () {
                target.removeAttribute('tabindex');
              },
              { once: true }
            );
          }
        }
      });
      history.pushState(null, '', a.getAttribute('href'));
    });
  }

  /* ================ Lenis + ScrollTrigger + hero pin ================ */
  var lenisTickerActive = false;

  function stopLenisTicker() {
    if (!lenisTickerActive || !lenisTicker || !window.gsap) return;
    window.gsap.ticker.remove(lenisTicker);
    lenisTickerActive = false;
  }

  function startLenisTicker() {
    if (lenisTickerActive || !lenisTicker || !window.gsap) return;
    lenisTickerActive = true;
    window.gsap.ticker.add(lenisTicker);
  }

  function setupScroll() {
    if (!window.gsap || !window.ScrollTrigger) return;
    window.gsap.registerPlugin(window.ScrollTrigger);

    var mm = window.gsap.matchMedia();

    /* 桌面 + 非 PRM：pin hero + ghost 视差 */
    mm.add('(pointer: fine) and (prefers-reduced-motion: no-preference)', function () {
      window.gsap
        .timeline({
          scrollTrigger: {
            trigger: '#hero',
            start: 'top top',
            end: '+=60%',
            pin: true,
            scrub: true
          }
        })
        .to('.dfs-hero-inner', { y: -90, opacity: 0, ease: 'none' }, 0)
        .to('#dfs-net, .dfs-net-fallback', { opacity: 0.3, ease: 'none' }, 0)
        .to('.dfs-scroll-hint', { opacity: 0, ease: 'none' }, 0);

      window.gsap.utils.toArray('.dfs-ghost').forEach(function (el) {
        window.gsap.to(el, {
          yPercent: -28,
          ease: 'none',
          scrollTrigger: {
            trigger: el.parentElement,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true
          }
        });
      });
    });

    /* Lenis：桌面 + 非 PRM */
    if (DFS.finePointer && DFS.motionOK() && window.Lenis) {
      lenis = new window.Lenis({ autoRaf: false });
      document.documentElement.classList.add('lenis');
      lenis.on('scroll', window.ScrollTrigger.update);
      lenisTicker = function (t) {
        if (!lenis) {
          stopLenisTicker();
          return;
        }
        lenis.raf(t * 1000);
        if (lenis.isScrolling !== 'smooth') stopLenisTicker();
      };
      lenis.on('virtual-scroll', startLenisTicker);
      window.gsap.ticker.lagSmoothing(0);
    }

    /* 字体加载完成后校准触发位置 */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        window.ScrollTrigger.refresh();
      });
    }
  }

  /* ================ 搜索浮层协调 ================ */
  function setupSearchWatch() {
    var wrapper = document.getElementById('search-result-wrapper');
    if (!wrapper) return;
    var mo = new MutationObserver(function () {
      var active = !wrapper.classList.contains('d-none');
      document.documentElement.classList.toggle('dfs-search-active', active);
      if (lenis) {
        if (active) {
          lenis.stop();
          stopLenisTicker();
        } else {
          lenis.start();
          if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        }
      }
    });
    mo.observe(wrapper, { attributes: true, attributeFilter: ['class'] });
  }

  /* ================ PRM 运行中切换：全量销毁 ================ */
  document.addEventListener('dfs:reduce', function () {
    if (net) {
      net.destroy();
      net = null;
    }
    stopLenisTicker();
    lenisTicker = null;
    if (lenis) {
      lenis.destroy();
      lenis = null;
      document.documentElement.classList.remove('lenis');
    }
    if (window.ScrollTrigger) {
      window.ScrollTrigger.disable(false, true);
    }
    teardownMagnetic();
    var typer = document.getElementById('dfs-typer');
    if (typer) typer.textContent = '$ whoami';
  });

  /* ================ 启动链（idle-until-urgent） ================ */
  function rIC(fn, timeout) {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(fn, { timeout: timeout || 400 });
    } else {
      setTimeout(fn, 1);
    }
  }

  function boot() {
    /* t0：便宜的即时项 */
    typewriter();
    setupScramble();
    setupRail();
    setupSearchWatch();

    /* GSAP 编排（pin/视差/Lenis）延迟到首次滚动意图：
       pin 会把 #hero 包进 pin-spacer 触发重排，若在静置期执行，
       h1 重绘会产生迟到的 LCP 候选（实测 LCP 8.6s → 修复后回落至首绘）。 */
    var scrollArmed = false;

    function armScroll() {
      if (scrollArmed) return;
      scrollArmed = true;
      ['wheel', 'touchstart', 'keydown', 'scroll'].forEach(function (ev) {
        window.removeEventListener(ev, armScroll);
      });
      setupScroll();
    }

    ['wheel', 'touchstart', 'keydown', 'scroll'].forEach(function (ev) {
      window.addEventListener(ev, armScroll, { passive: true, once: false });
    });
    /* 已有滚动位置（刷新/锚点进入）时立即建 */
    if (window.scrollY > 0) armScroll();

    /* rIC：计数器与磁性 */
    rIC(function () {
      setupCounters();
      setupMagnetic();
    }, 600);

    /* LCP 之后：canvas 首帧（double-rAF 保证首绘已完成） */
    var canvas = document.getElementById('dfs-net');
    if (canvas && DFS.motionOK()) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          rIC(function () {
            if (!DFS.motionOK()) return;
            net = createNet(canvas);
            if (net) {
              document.documentElement.classList.add('dfs-canvas-on');
              net.start();
            }
          }, 800);
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
