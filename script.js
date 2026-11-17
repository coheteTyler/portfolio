(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var INTERVAL = 4000;

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---- Highlight deck ---- */
  var VIDEO_CAP = 8000;
  var freezeMedia = /(?:\?|&)pause=1(?:&|$)/.test(location.search);

  function slideVideo(slide) {
    return slide ? qs("video.slide-video", slide) : null;
  }

  function applyPoster(v) {
    if (!v) return;
    if (v.dataset.poster && !v.getAttribute("poster")) {
      v.setAttribute("poster", v.dataset.poster);
    }
  }

  function hydrateSlide(slide) {
    if (!slide) return;
    qsa("source[data-srcset]", slide).forEach(function (s) {
      s.setAttribute("srcset", s.getAttribute("data-srcset"));
      s.removeAttribute("data-srcset");
    });
    qsa("img[data-src]", slide).forEach(function (img) {
      img.setAttribute("src", img.getAttribute("data-src"));
      img.removeAttribute("data-src");
    });
    if (reduce) {
      qsa("img[data-reduced-src]", slide).forEach(function (img) {
        if (!img.getAttribute("src")) img.setAttribute("src", img.getAttribute("data-reduced-src"));
      });
    }
    applyPoster(slideVideo(slide));
  }

  function ensureVideoReady(slide) {
    if (!slide) return null;
    hydrateSlide(slide);
    var v = slideVideo(slide);
    if (!v) return v;
    applyPoster(v);
    if (v.preload === "none") {
      v.preload = "metadata";
      try { v.load(); } catch (e) {}
    }
    return v;
  }

  function stopSlideVideo(slide) {
    var v = slideVideo(slide);
    if (!v) return;
    v.pause();
    v.loop = false;
    try { if (v.currentTime) v.currentTime = 0; } catch (e) {}
  }

  function playSlideVideo(slide) {
    var v = ensureVideoReady(slide);
    if (!v || reduce || freezeMedia) return;
    v.muted = true;
    v.playsInline = true;
    var play = v.play();
    if (play && play.catch) play.catch(function () {});
  }

  function holdVideoFrame(slide) {
    var v = ensureVideoReady(slide);
    if (!v) return;
    function seek() {
      v.pause();
      try {
        var d = v.duration;
        if (d && isFinite(d) && d > 1) v.currentTime = Math.min(4, d * 0.4);
      } catch (e) {}
    }
    if (v.readyState >= 2) seek();
    else {
      v.addEventListener("loadeddata", seek, { once: true });
      v.addEventListener("canplay", seek, { once: true });
    }
  }

  function initDeck(wrap) {
    var slides = qsa(".slide", wrap);
    var status = qs("[data-deck-status]", wrap);
    var prevBtn = qs("[data-deck-prev]", wrap);
    var nextBtn = qs("[data-deck-next]", wrap);
    var pauseBtn = qs("[data-deck-pause]", wrap);
    var dotsWrap = qs(".deck-dots", wrap);
    var region = qs(".deck", wrap);
    var i = 0;
    var advanceTimer = null;
    var endedHandler = null;
    var endedVideo = null;
    var paused = false;
    var n = slides.length;
    var leavingTimer = null;

    if (!n) return;

    slides.forEach(function (s, idx) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-label", "Go to slide " + (idx + 1));
      b.addEventListener("click", function () { go(idx, true); });
      dotsWrap.appendChild(b);
    });
    var dots = qsa("button", dotsWrap);

    function paramsSlide() {
      var m = /(?:\?|&)slide=(\d+)/.exec(location.search);
      return m ? Math.min(n - 1, Math.max(0, parseInt(m[1], 10))) : 0;
    }

    function clearAdvance() {
      if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
      if (endedHandler && endedVideo) {
        endedVideo.removeEventListener("ended", endedHandler);
      }
      endedHandler = null;
      endedVideo = null;
    }

    function scheduleAdvance() {
      clearAdvance();
      if (reduce || paused) return;
      var v = slideVideo(slides[i]);
      if (v) {
        v.loop = false;
        endedVideo = v;
        endedHandler = function () {
          if (paused) {
            v.loop = true;
            var p = v.play();
            if (p && p.catch) p.catch(function () {});
            return;
          }
          tick();
        };
        v.addEventListener("ended", endedHandler);
        advanceTimer = setTimeout(tick, VIDEO_CAP);
      } else {
        advanceTimer = setTimeout(tick, INTERVAL);
      }
    }

    function go(next, user, dir, instant) {
      next = ((next % n) + n) % n;
      if (next === i && !user && !instant) return;
      var backward = dir === "prev" || next === i - 1 || (i === 0 && next === n - 1 && dir !== "next");
      var cur = slides[i];
      var incoming = slides[next];
      clearTimeout(leavingTimer);
      clearAdvance();
      slides.forEach(function (s) {
        s.classList.remove("is-active", "is-leaving", "is-from-prev", "is-leaving-prev");
        s.setAttribute("aria-hidden", "true");
      });
      if (!reduce && !instant && cur && cur !== incoming) {
        cur.classList.add(backward ? "is-leaving-prev" : "is-leaving");
        if (backward) incoming.classList.add("is-from-prev");
        leavingTimer = setTimeout(function () {
          cur.classList.remove("is-leaving", "is-leaving-prev");
        }, 700);
      }
      if (instant) {
        slides.forEach(function (s) { s.style.transition = "none"; });
      }
      incoming.classList.add("is-active");
      incoming.setAttribute("aria-hidden", "false");
      if (instant) {
        incoming.offsetWidth;
        slides.forEach(function (s) { s.style.transition = ""; });
      }
      if (cur && cur !== incoming) stopSlideVideo(cur);
      i = next;
      if (status) status.textContent = "Highlight " + (i + 1) + " of " + n;
      dots.forEach(function (d, di) { d.setAttribute("aria-selected", di === i ? "true" : "false"); });
      ensureVideoReady(incoming);
      var upcoming = slides[(i + 1) % n];
      if (upcoming) ensureVideoReady(upcoming);
      if (freezeMedia) holdVideoFrame(incoming);
      else if (!reduce) playSlideVideo(incoming);
      if (!paused && !reduce) scheduleAdvance();
    }

    function tick() { go(i + 1, false, "next"); }

    function setPaused(p) {
      paused = p;
      pauseBtn.textContent = p ? "Play" : "Pause";
      pauseBtn.setAttribute("aria-pressed", p ? "true" : "false");
      if (p) {
        clearAdvance();
        var v = slideVideo(slides[i]);
        if (v) v.loop = true;
      } else {
        var v2 = slideVideo(slides[i]);
        if (v2) v2.loop = false;
        if (!reduce) scheduleAdvance();
      }
    }

    prevBtn.addEventListener("click", function () { go(i - 1, true, "prev"); });
    nextBtn.addEventListener("click", function () { go(i + 1, true, "next"); });
    pauseBtn.addEventListener("click", function () { setPaused(!paused); });

    wrap.addEventListener("mouseenter", function () {
      if (!paused) {
        clearAdvance();
        var v = slideVideo(slides[i]);
        if (v) v.loop = true;
      }
    });
    wrap.addEventListener("mouseleave", function () {
      if (!paused && !reduce) {
        var v = slideVideo(slides[i]);
        if (v) v.loop = false;
        scheduleAdvance();
      }
    });
    wrap.addEventListener("focusin", function () {
      if (!paused) {
        clearAdvance();
        var v = slideVideo(slides[i]);
        if (v) v.loop = true;
      }
    });
    wrap.addEventListener("focusout", function (e) {
      if (!wrap.contains(e.relatedTarget) && !paused && !reduce) {
        var v = slideVideo(slides[i]);
        if (v) v.loop = false;
        scheduleAdvance();
      }
    });

    region.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1, true, "prev"); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1, true, "next"); }
    });

    var touchX = null;
    region.addEventListener("touchstart", function (e) {
      if (e.changedTouches[0]) touchX = e.changedTouches[0].clientX;
    }, { passive: true });
    region.addEventListener("touchend", function (e) {
      if (touchX == null || !e.changedTouches[0]) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1), true, dx < 0 ? "next" : "prev");
    });

    if (reduce) slides.forEach(hydrateSlide);
    go(paramsSlide(), false, "next", true);
    if (freezeMedia) setPaused(true);
  }

  function initLazyVideos() {
    var vids = qsa(".project-video video[preload='none']");
    if (!vids.length) return;
    function loadOne(v) {
      if (v.dataset.loaded) return;
      v.dataset.loaded = "1";
      applyPoster(v);
      v.preload = "metadata";
      try { v.load(); } catch (e) {}
    }
    if (!("IntersectionObserver" in window)) {
      vids.forEach(loadOne);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        loadOne(en.target);
        io.unobserve(en.target);
      });
    }, { rootMargin: "240px 0px" });
    vids.forEach(function (v) { io.observe(v); });
  }

  /* ---- Timeline panels ---- */
  function closePanel(item) {
    var btn = qs(".tl-tile", item);
    var panel = item.querySelector(".tl-panel");
    btn.setAttribute("aria-expanded", "false");
    panel.hidden = true;
    item.classList.remove("is-open");
  }

  function openPanel(item, moveFocus) {
    qsa(".tl-item.is-open").forEach(function (other) {
      if (other !== item) closePanel(other);
    });
    var btn = qs(".tl-tile", item);
    var panel = item.querySelector(".tl-panel");
    btn.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    item.classList.add("is-open");
    if (typeof initLazyVideos === "function") {
      /* IO will notice newly visible videos */
      qsa(".project-video video", item).forEach(function (v) {
        applyPoster(v);
        if (!v.dataset.loaded && v.getBoundingClientRect().height) {
          v.dataset.loaded = "1";
          v.preload = "metadata";
          try { v.load(); } catch (e) {}
        }
      });
    }
    if (item.id && history.replaceState) {
      history.replaceState(null, "", "#" + item.id);
    }
    if (moveFocus) btn.focus();
  }

  function toggleItem(item) {
    var open = item.classList.contains("is-open");
    if (open) {
      closePanel(item);
      if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    } else {
      openPanel(item, false);
    }
  }

  function initTimeline() {
    qsa(".tl-item").forEach(function (item) {
      qs(".tl-tile", item).addEventListener("click", function () { toggleItem(item); });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var lb = qs("#lightbox");
      if (lb && !lb.hidden) { closeLightbox(); return; }
      var open = qs(".tl-item.is-open");
      if (open) {
        closePanel(open);
        qs(".tl-tile", open).focus();
        if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
      }
    });

    var openId = (location.hash || "").replace(/^#/, "");
    var q = /(?:\?|&)open=([a-z0-9-]+)/i.exec(location.search);
    if (q) openId = q[1];
    if (openId) {
      var target = document.getElementById(openId);
      if (target && target.classList.contains("tl-item")) {
        openPanel(target, false);
        if (!reduce) target.scrollIntoView({ block: "start" });
      }
    }
    window.addEventListener("hashchange", function () {
      var id = (location.hash || "").replace(/^#/, "");
      var el = document.getElementById(id);
      if (el && el.classList.contains("tl-item")) openPanel(el, true);
    });
  }

  /* ---- 3D viewer controls ---- */
  function initModels() {
    qsa("[data-model-rotate]").forEach(function (btn) {
      var viewer = btn.closest(".model-viewer-wrap") && btn.closest(".model-viewer-wrap").querySelector("model-viewer");
      if (!viewer) return;
      btn.addEventListener("click", function () {
        var on = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        if (on) viewer.setAttribute("auto-rotate", "");
        else viewer.removeAttribute("auto-rotate");
      });
    });
    qsa("[data-model-fs]").forEach(function (btn) {
      var viewer = btn.closest(".model-viewer-wrap") && btn.closest(".model-viewer-wrap").querySelector("model-viewer");
      if (!viewer) return;
      btn.addEventListener("click", function () {
        if (viewer.requestFullscreen) viewer.requestFullscreen();
      });
    });
  }

  /* ---- Video player (ready for approved sources) ---- */
  function youtubeId(url) {
    var m = String(url || "").match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : "";
  }
  function xStatus(url) {
    var m = String(url || "").match(/(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/);
    return m ? m[1] : "";
  }
  function mountPlayer(player) {
    var video = qs("video", player);
    var empty = qs(".player-empty", player);
    var embed = qs(".player-embed", player);
    var fs = qs(".player-fs", player);
    var src = player.getAttribute("data-src") || (video && video.getAttribute("data-src"));
    var yt = youtubeId(player.getAttribute("data-youtube"));
    var xid = xStatus(player.getAttribute("data-x"));
    if (src && video) {
      if (empty) empty.hidden = true;
      video.hidden = false;
      if (!video.querySelector("source")) {
        var s = document.createElement("source");
        s.src = src;
        video.appendChild(s);
      }
      video.setAttribute("preload", "metadata");
      if (fs) {
        fs.disabled = false;
        fs.addEventListener("click", function () {
          if (video.requestFullscreen) video.requestFullscreen();
        });
      }
    } else if ((yt || xid) && embed) {
      if (empty) empty.hidden = true;
      embed.hidden = false;
      var iframe = document.createElement("iframe");
      iframe.setAttribute("title", "Project video");
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("loading", "lazy");
      iframe.src = yt
        ? "https://www.youtube-nocookie.com/embed/" + yt
        : "https://platform.twitter.com/embed/Tweet.html?id=" + xid;
      embed.appendChild(iframe);
      if (fs) {
        fs.disabled = false;
        fs.addEventListener("click", function () {
          if (embed.requestFullscreen) embed.requestFullscreen();
        });
      }
    }
  }

  /* ---- Lightbox ---- */
  var lbState = { items: [], index: 0, restore: null };

  function closeLightbox() {
    var lb = qs("#lightbox");
    if (!lb || lb.hidden) return;
    lb.hidden = true;
    document.body.classList.remove("is-lightbox-open");
    var stage = qs("[data-lightbox-stage]", lb);
    stage.innerHTML = "";
    if (lbState.restore) lbState.restore.focus();
    lbState.restore = null;
  }

  function renderLightbox() {
    var lb = qs("#lightbox");
    var stage = qs("[data-lightbox-stage]", lb);
    var item = lbState.items[lbState.index];
    if (!item) return;
    stage.innerHTML = "";
    var pic = document.createElement("picture");
    if (item.webp) {
      var source = document.createElement("source");
      source.type = "image/webp";
      source.srcset = item.webp;
      pic.appendChild(source);
    }
    var img = document.createElement("img");
    img.src = item.src;
    img.alt = item.alt || "";
    pic.appendChild(img);
    stage.appendChild(pic);
    if (item.caption) {
      var cap = document.createElement("p");
      cap.className = "lightbox-caption";
      cap.id = "lightbox-caption";
      cap.textContent = item.caption;
      stage.appendChild(cap);
      lb.setAttribute("aria-labelledby", "lightbox-caption");
    } else {
      lb.removeAttribute("aria-labelledby");
      lb.setAttribute("aria-label", item.alt || "Photo");
    }
    var multi = lbState.items.length > 1;
    var prev = qs("[data-lightbox-prev]", lb);
    var next = qs("[data-lightbox-next]", lb);
    if (prev) prev.hidden = !multi;
    if (next) next.hidden = !multi;
  }

  function lightboxDelta(d) {
    var n = lbState.items.length;
    if (n < 2) return;
    lbState.index = (lbState.index + d + n) % n;
    renderLightbox();
  }

  function openLightbox(items, index, restore) {
    lbState.items = items;
    lbState.index = index;
    lbState.restore = restore;
    var lb = qs("#lightbox");
    lb.hidden = false;
    document.body.classList.add("is-lightbox-open");
    renderLightbox();
    var close = qs("[data-lightbox-close]", lb);
    if (close) close.focus();
  }

  function initLightbox() {
    var lb = qs("#lightbox");
    if (!lb) return;
    var close = qs("[data-lightbox-close]", lb);
    if (close) close.addEventListener("click", closeLightbox);
    var prev = qs("[data-lightbox-prev]", lb);
    var next = qs("[data-lightbox-next]", lb);
    if (prev) prev.addEventListener("click", function () { lightboxDelta(-1); });
    if (next) next.addEventListener("click", function () { lightboxDelta(1); });
    lb.addEventListener("click", function (e) {
      if (e.target === lb) closeLightbox();
    });
    lb.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); lightboxDelta(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); lightboxDelta(1); }
      if (e.key !== "Tab") return;
      var focusable = qsa("button:not([hidden])", lb);
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
    qsa("[data-gallery]").forEach(function (gal) {
      var btns = qsa("[data-full]", gal);
      var items = btns.map(function (b) {
        var img = b.querySelector("img");
        return {
          src: b.getAttribute("data-full"),
          webp: b.getAttribute("data-full-webp") || "",
          alt: b.getAttribute("data-alt") || (img && img.alt) || "",
          caption: b.getAttribute("data-caption") || ""
        };
      });
      btns.forEach(function (b, idx) {
        b.addEventListener("click", function () {
          openLightbox(items, idx, b);
        });
      });
    });
  }

  /* ---- Active nav + reveal ---- */
  function initNav() {
    var links = qsa(".site-header nav a[href^='#']");
    var secs = links.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); }).filter(Boolean);
    if (!("IntersectionObserver" in window) || !secs.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (l) {
          l.classList.toggle("is-active", l.getAttribute("href") === "#" + en.target.id);
        });
      });
    }, { rootMargin: "-20% 0px -65% 0px", threshold: 0 });
    secs.forEach(function (s) { io.observe(s); });
  }

  /* Clone #tmpl-video-block or #tmpl-model-block into a .tl-panel, set data-src
     or model-viewer[src], then call mountPlayer / initModels / loadModelViewer. */
  function loadModelViewer() {
    if (document.querySelector("script[data-model-viewer]")) return Promise.resolve();
    if (!document.querySelector("model-viewer[src]")) return Promise.resolve();
    return import("./vendor/model-viewer.min.js");
  }

  document.addEventListener("DOMContentLoaded", function () {
    qsa("[data-deck]").forEach(initDeck);
    initTimeline();
    qsa("[data-player]").forEach(mountPlayer);
    initLazyVideos();
    loadModelViewer().then(function () { initModels(); });
    initLightbox();
    initNav();
  });
})();
