/* The hero brain: a slowly rotating 3D cloud of small triangles, one research topic each.
   Hover a triangle to see its topic and its nearest neighbours; click to search it.
   When nobody is hovering it keeps lighting up topics on its own.
   Also draws the faint drifting triangles behind the whole page (#ambient). */
(function () {
  "use strict";

  const FIELDS = window.BRAIN_FIELDS;
  const PALETTE = ["#8052ff", "#ffb829", "#2ec4a6", "#e040fb", "#4f7cff", "#ffffff"];
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COUNT = 2200;
  const TAU = Math.PI * 2;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // ---------- Geometry: brain-shaped point cloud (x = front, y = up, z = side) ----------

  function randomDirection() {
    const u = rand(-1, 1), th = rand(0, TAU), s = Math.sqrt(1 - u * u);
    return [s * Math.cos(th), u, s * Math.sin(th)];
  }

  function cerebrumPoint() {
    const [dx, dy, dz] = randomDirection();
    // Folds: a few interfering waves push the surface in and out like gyri.
    const folds = 1 + 0.055 * Math.sin(7 * dx + 3 * dy) * Math.cos(6 * dz + 2 * dx) + 0.03 * Math.sin(13 * dy + 5 * dz);
    // Mostly on the surface, some a little inside so it reads as a volume.
    const r = folds * (1 - 0.14 * Math.pow(Math.random(), 3));
    let x = 1.15 * dx * r, y = 0.82 * dy * r, z = 0.9 * dz * r;
    if (y < -0.25) y = -0.25 + (y + 0.25) * 0.45; // flatter underside
    if (Math.abs(dz) < 0.2 && dy > 0) { x *= 0.97; y *= 0.9; } // dip along the midline
    z += Math.sign(dz) * 0.07; // gap between hemispheres
    return [x, y, z];
  }

  function cerebellumPoint() {
    const [dx, dy, dz] = randomDirection();
    const ridges = 1 + 0.06 * Math.sin(22 * dy); // horizontal folia
    return [-0.72 + 0.42 * dx * ridges, -0.52 + 0.26 * dy * ridges, 0.62 * dz * ridges];
  }

  function stemPoint() {
    const t = Math.random(), th = rand(0, TAU), rr = 0.13 * Math.sqrt(Math.random());
    const y = -0.42 - t * 0.75;
    return [-0.32 + rr * Math.cos(th) + (y + 0.42) * 0.25, y, rr * Math.sin(th)];
  }

  // Which field a point belongs to, by brain region.
  function regionOf(kind, [x, y]) {
    if (kind === "cerebellum") return 4; // Engineering & Robotics
    if (kind === "stem") return 5;       // Energy & Environment
    if (x > 0.35 && y > -0.2) return 0;  // frontal: Computing & AI
    if (x < -0.4) return 1;              // occipital: Neuro & Imaging
    if (y > 0.15) return 3;              // parietal: Physical Sciences
    return 2;                            // temporal: Life Sciences & Bio
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function buildParticles() {
    const decks = FIELDS.map((f) => ({ order: shuffled(f.topics), next: 0 }));
    const out = [];
    for (let i = 0; i < COUNT; i++) {
      const roll = Math.random();
      const kind = roll < 0.82 ? "cerebrum" : roll < 0.95 ? "cerebellum" : "stem";
      const pos = kind === "cerebrum" ? cerebrumPoint() : kind === "cerebellum" ? cerebellumPoint() : stemPoint();
      const field = regionOf(kind, pos);
      const deck = decks[field];
      if (deck.next >= deck.order.length) { deck.order = shuffled(FIELDS[field].topics); deck.next = 0; }
      const start = randomDirection().map((v) => v * rand(2.5, 5)); // scattered, for the intro
      out.push({
        pos, start, field,
        topic: deck.order[deck.next++],
        color: Math.random() < 0.7 ? FIELDS[field].color : pick(PALETTE),
        size: rand(2.2, 4.6),
        angle: rand(0, TAU),
        spin: rand(-0.6, 0.6),
        filled: Math.random() < 0.18,
        delay: Math.random() * 0.9,
        sx: 0, sy: 0, depth: 0, scale: 1, visible: true,
      });
    }
    return out;
  }

  function triangle(ctx, x, y, size, angle) {
    for (let k = 0; k < 3; k++) {
      const a = angle + (k * TAU) / 3;
      const px = x + Math.cos(a) * size, py = y + Math.sin(a) * size;
      k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // ---------- Brain renderer ----------

  const MIN_ZOOM = 1, MAX_ZOOM = 4.5;
  const BASE_SPIN = 0.16;

  function initBrain() {
    const canvas = document.getElementById("brain");
    const host = canvas && canvas.parentElement;
    const tipsHost = document.getElementById("brain-tips");
    if (!canvas || !FIELDS) return;
    const ctx = canvas.getContext("2d");
    const particles = buildParticles();

    // Centre of each field's region, used to fly the camera there from the legend.
    const centroids = FIELDS.map((_, f) => {
      const mine = particles.filter((p) => p.field === f);
      return [0, 1, 2].map((k) => mine.reduce((s, p) => s + p.pos[k], 0) / mine.length);
    });

    let w = 0, h = 0, dpr = 1;
    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    new ResizeObserver(resize).observe(canvas);
    resize();

    // ---- Camera: yaw/pitch from dragging, zoom + pan from the wheel. Targets are eased toward. ----
    const cam = { yaw: 0, pitch: 0.12, zoom: 1, panX: 0, panY: 0 };
    const target = { zoom: 1, panX: 0, panY: 0 };
    let spinVel = BASE_SPIN;      // rad/s, decays back to BASE_SPIN after a fling
    let lockedField = -1;         // field chosen in the legend
    let yawGoal = null;           // when set, ease yaw here (legend fly-to)

    const unitSize = () => Math.min(w, h) * 0.34;
    const centre = () => ({ x: w / 2, y: h * 0.42 });
    function clampPan() {
      const lim = unitSize() * (target.zoom - 1) * 1.1;
      target.panX = clamp(target.panX, -lim, lim);
      target.panY = clamp(target.panY, -lim, lim);
    }
    // Zoom so the point under (mx, my) stays under the cursor.
    function zoomAt(mx, my, factor) {
      const z = clamp(target.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const c = centre(), k = z / target.zoom;
      target.panX = mx - c.x - (mx - c.x - target.panX) * k;
      target.panY = my - c.y - (my - c.y - target.panY) * k;
      target.zoom = z;
      if (z === MIN_ZOOM) { target.panX = 0; target.panY = 0; }
      clampPan();
    }
    function resetView() {
      target.zoom = 1; target.panX = 0; target.panY = 0;
      lockedField = -1; yawGoal = null; spinVel = BASE_SPIN;
      updateLegend();
    }

    // ---- Pointer ----
    let mouse = null, drag = null, lastMove = 0;
    const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      drag = { start: local(e), last: local(e), moved: false, t: performance.now() };
      spinVel = 0;
      yawGoal = null;
    });
    canvas.addEventListener("pointermove", (e) => {
      mouse = local(e);
      if (!drag) return;
      const dx = mouse.x - drag.last.x, dy = mouse.y - drag.last.y;
      if (Math.hypot(mouse.x - drag.start.x, mouse.y - drag.start.y) > 4) drag.moved = true;
      if (!drag.moved) return;
      const now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
      cam.yaw += dx * 0.008;
      cam.pitch = clamp(cam.pitch + dy * 0.006, -1.1, 1.1);
      spinVel = (dx * 0.008) / dt; // fling speed
      drag.last = mouse; drag.t = now; lastMove = now;
    });
    canvas.addEventListener("pointerup", () => {
      if (drag && !drag.moved && hovered && mouse) {
        document.dispatchEvent(new CustomEvent("brain:topic", { detail: { topic: hovered.topic } }));
      }
      // A drag that ended still keeps its momentum; a held-still release doesn't.
      if (drag && performance.now() - lastMove > 80) spinVel = 0;
      drag = null;
    });
    canvas.addEventListener("pointerleave", () => { if (!drag) mouse = null; });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const m = local(e);
      zoomAt(m.x, m.y, Math.exp(-e.deltaY * 0.0018));
    }, { passive: false });
    canvas.addEventListener("dblclick", (e) => {
      const m = local(e);
      zoomAt(m.x, m.y, target.zoom >= MAX_ZOOM - 0.01 ? 1 / MAX_ZOOM : 2);
    });

    // ---- Controls: zoom buttons and field legend ----
    const controls = document.createElement("div");
    controls.className = "brain-controls";
    controls.innerHTML = `<button type="button" data-z="in" aria-label="Zoom in">+</button>
      <button type="button" data-z="out" aria-label="Zoom out">−</button>
      <button type="button" data-z="reset" aria-label="Reset view">⟲</button>`;
    host.appendChild(controls);
    controls.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const c = centre();
      if (b.dataset.z === "in") zoomAt(c.x, c.y, 1.6);
      else if (b.dataset.z === "out") zoomAt(c.x, c.y, 1 / 1.6);
      else resetView();
    });

    const legend = document.createElement("div");
    legend.className = "brain-legend";
    legend.innerHTML = FIELDS.map((f, i) =>
      `<button type="button" data-field="${i}" style="--c:${f.color}"><i></i>${f.name}</button>`).join("");
    host.appendChild(legend);
    let previewField = -1;
    function updateLegend() {
      legend.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.field === lockedField));
    }
    legend.addEventListener("mouseover", (e) => { const b = e.target.closest("button"); if (b) previewField = +b.dataset.field; });
    legend.addEventListener("mouseleave", () => { previewField = -1; });
    legend.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const f = +b.dataset.field;
      if (lockedField === f) { resetView(); return; }
      lockedField = f;
      // Every region is visible from the side, so turn to a side view (the nearest
      // equivalent angle, to avoid a full spin), stop spinning, and zoom in on it.
      const side = 0.35;
      yawGoal = side + Math.round((cam.yaw - side) / TAU) * TAU;
      spinVel = 0;
      target.zoom = 2.7; // close enough that its topics get labels
      updateLegend();
    });

    // ---- Hover labels ----
    let hovered = null;      // particle under the cursor (or the auto-picked one)
    let neighbours = [];
    let autoAt = 0;          // next time the idle tour picks a topic
    const tips = [];         // { el, p, dieAt }

    function addTip(p, main) {
      const el = document.createElement("div");
      el.className = main ? "tip main" : "tip";
      el.textContent = p.topic;
      if (main) {
        const field = document.createElement("div");
        field.className = "tip-field";
        field.style.color = FIELDS[p.field].color;
        field.textContent = FIELDS[p.field].name + " · click to search";
        el.appendChild(field);
      }
      tipsHost.appendChild(el);
      tips.push({ el, p, dieAt: Infinity });
    }

    // Old labels fade out instead of vanishing, so moving across the brain leaves a trail.
    function retireTips(now) {
      for (const t of tips) if (t.dieAt === Infinity) { t.dieAt = now + 900; t.el.classList.add("fade"); }
    }

    function setHovered(p, now) {
      if (p === hovered) return;
      retireTips(now);
      hovered = p;
      neighbours = [];
      if (!p) return;
      // Zooming in makes room for more labels.
      const want = Math.round(4 + (cam.zoom - 1) * 2.5);
      const radius = 150 + (cam.zoom - 1) * 40;
      // Labels sit to the right of their triangle, so overlap is mostly vertical.
      const placed = [{ x: p.sx, y: p.sy, gap: 36 }];
      const seen = new Set([p.topic]);
      const candidates = particles
        .filter((q) => q !== p && q.visible && q.depth > -0.1 && !seen.has(q.topic))
        .map((q) => ({ q, d: (q.sx - p.sx) ** 2 + (q.sy - p.sy) ** 2 }))
        .filter((o) => o.d > 30 * 30 && o.d < radius * radius)
        .sort((a, b) => a.d - b.d);
      for (const { q } of candidates) {
        if (neighbours.length >= want) break;
        if (seen.has(q.topic)) continue;
        if (!placed.every((l) => Math.abs(q.sy - l.y) > l.gap || Math.abs(q.sx - l.x) > 220)) continue;
        neighbours.push(q);
        seen.add(q.topic);
        placed.push({ x: q.sx, y: q.sy, gap: 22 });
      }
      addTip(p, true);
      for (const q of neighbours) addTip(q, false);
    }

    function nearestToMouse() {
      let best = null, bestD = 18 * 18;
      for (const p of particles) {
        if (!p.visible || p.depth < -0.25) continue;
        if (lockedField >= 0 && p.field !== lockedField) continue;
        const d = (p.sx - mouse.x) ** 2 + (p.sy - mouse.y) ** 2;
        if (d < bestD) { bestD = d; best = p; }
      }
      return best;
    }

    let running = true;
    new IntersectionObserver(([entry]) => {
      const was = running;
      running = entry.isIntersecting;
      if (running && !was) { last = performance.now(); requestAnimationFrame(frame); }
    }).observe(canvas);

    const t0 = performance.now();
    let last = t0;

    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const intro = REDUCED ? 1 : clamp(t / 2.6, 0, 1);

      // ---- Camera easing ----
      if (yawGoal !== null) {
        cam.yaw += (yawGoal - cam.yaw) * 0.06;
        cam.pitch += (0.12 - cam.pitch) * 0.06;
      } else if (!drag && !REDUCED) {
        // Free spin; slower while hovering so labels stay readable; flings decay back to it.
        const base = lockedField >= 0 ? 0 : mouse ? 0.04 : BASE_SPIN;
        spinVel += (base - spinVel) * Math.min(1, dt * 1.5);
        cam.yaw += spinVel * dt;
      }
      cam.zoom += (target.zoom - cam.zoom) * 0.12;

      const breathe = 1 + 0.012 * Math.sin(t * 1.3);
      const ry = cam.yaw - 0.35, rx = cam.pitch;
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      const unit = unitSize();
      const c = centre();

      function project(v, zoom, panX, panY) {
        const [x, y, z] = v;
        const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
        const y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        const persp = 4 / (4 - z2);
        return {
          x: c.x + panX + x1 * unit * persp * breathe * zoom,
          y: c.y + panY - y1 * unit * persp * breathe * zoom,
          depth: z2, persp,
        };
      }

      // When a field is locked, keep its centre in the middle of the view.
      if (lockedField >= 0) {
        const lp = project(centroids[lockedField], 1, 0, 0);
        target.panX = (c.x - lp.x) * target.zoom;
        target.panY = (c.y - lp.y) * target.zoom;
      }
      cam.panX += (target.panX - cam.panX) * 0.12;
      cam.panY += (target.panY - cam.panY) * 0.12;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const repel = mouse && !drag ? 60 : 0;
      for (const p of particles) {
        const k = easeOut(clamp(intro * 1.6 - p.delay * 0.6, 0, 1));
        const pr = project([
          p.start[0] + (p.pos[0] - p.start[0]) * k,
          p.start[1] + (p.pos[1] - p.start[1]) * k,
          p.start[2] + (p.pos[2] - p.start[2]) * k,
        ], cam.zoom, cam.panX, cam.panY);
        let sxp = pr.x, syp = pr.y;
        // Particles shy away from the cursor a little.
        if (repel && pr.depth > -0.2) {
          const dx = sxp - mouse.x, dy = syp - mouse.y, d = Math.hypot(dx, dy);
          if (d > 0.5 && d < repel) {
            const push = (1 - d / repel) * 12;
            sxp += (dx / d) * push; syp += (dy / d) * push;
          }
        }
        p.sx = sxp; p.sy = syp; p.depth = pr.depth; p.scale = pr.persp * Math.sqrt(cam.zoom);
        p.visible = p.sx > -20 && p.sx < w + 20 && p.sy > -20 && p.sy < h + 20;
        p.angle += p.spin * dt;
      }

      if (intro >= 1) {
        if (mouse && !drag) setHovered(nearestToMouse(), now);
        else if (drag) setHovered(null, now);
        else if (now > autoAt) {
          // Idle tour: light up a front-facing topic every couple of seconds.
          const front = particles.filter((p) => p.depth > 0.45 && p.visible && (lockedField < 0 || p.field === lockedField));
          setHovered(front.length ? pick(front) : null, now);
          autoAt = now + 2400;
        }
      }

      if (hovered) {
        ctx.lineWidth = 1;
        for (const q of neighbours) {
          const g = ctx.createLinearGradient(hovered.sx, hovered.sy, q.sx, q.sy);
          g.addColorStop(0, FIELDS[hovered.field].color);
          g.addColorStop(1, "rgba(255,255,255,0.15)");
          ctx.strokeStyle = g;
          ctx.beginPath(); ctx.moveTo(hovered.sx, hovered.sy); ctx.lineTo(q.sx, q.sy); ctx.stroke();
        }
      }

      // Legend preview beats the lock, which beats the hovered field.
      const focusField = previewField >= 0 ? previewField : lockedField >= 0 ? lockedField : hovered ? hovered.field : -1;
      const strong = previewField >= 0 || lockedField >= 0;
      for (const p of particles) {
        if (!p.visible) continue;
        let alpha = clamp(0.18 + 0.82 * ((p.depth + 1.1) / 2.2), 0.08, 1);
        if (focusField >= 0) alpha *= p.field === focusField ? 1.15 : strong ? 0.15 : 0.55;
        let size = p.size * p.scale;
        if (p === hovered) size *= 2.6;
        else if (neighbours.includes(p)) size *= 1.7;
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.beginPath();
        triangle(ctx, p.sx, p.sy, size, p.angle);
        const color = strong && p.field === focusField ? FIELDS[p.field].color : p.color;
        if (p === hovered || p.filled) { ctx.fillStyle = p === hovered ? FIELDS[p.field].color : color; ctx.fill(); }
        ctx.strokeStyle = color;
        ctx.lineWidth = p === hovered ? 1.6 : 1;
        ctx.stroke();
      }

      // Zoomed in, front-facing topics get faint labels, like place names on a map.
      // A coarse grid keeps them from overlapping each other or the hover labels.
      if (cam.zoom > 1.8) {
        const fadeIn = clamp((cam.zoom - 1.8) / 0.8, 0, 1);
        const taken = new Set();
        const cell = (x, y) => `${Math.floor(x / 150)},${Math.floor(y / 22)}`;
        for (const q of [hovered, ...neighbours]) {
          if (!q) continue;
          for (let dx = -1; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) taken.add(cell(q.sx + dx * 150, q.sy + dy * 22));
        }
        const seen = new Set();
        const candidates = particles
          .filter((p) => p.visible && p.depth > 0.1 && (!strong || p.field === focusField))
          .sort((a, b) => b.depth - a.depth);
        ctx.font = "400 12px Inter, sans-serif";
        ctx.textBaseline = "middle";
        let n = 0;
        for (const p of candidates) {
          if (n >= 70) break;
          if (seen.has(p.topic) || p === hovered || neighbours.includes(p)) continue;
          const a = cell(p.sx, p.sy), b = cell(p.sx + 150, p.sy);
          if (taken.has(a) || taken.has(b)) continue;
          taken.add(a); taken.add(b); seen.add(p.topic); n++;
          ctx.globalAlpha = fadeIn * clamp(0.25 + p.depth * 0.6, 0.25, 0.8);
          ctx.fillStyle = "#bdbdbd";
          ctx.fillText(p.topic, p.sx + 8, p.sy);
        }
        ctx.globalAlpha = 1;
      }

      if (hovered) {
        const pulse = (now % 1400) / 1400;
        ctx.globalAlpha = 1 - pulse;
        ctx.strokeStyle = FIELDS[hovered.field].color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(hovered.sx, hovered.sy, 8 + pulse * 22, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Labels follow their triangles as the brain turns.
      for (let i = tips.length - 1; i >= 0; i--) {
        const tip = tips[i];
        if (now > tip.dieAt) { tip.el.remove(); tips.splice(i, 1); continue; }
        tip.el.style.left = tip.p.sx + "px";
        tip.el.style.top = tip.p.sy + "px";
      }

      canvas.style.cursor = drag && drag.moved ? "grabbing" : mouse && hovered ? "pointer" : "grab";
      host.classList.toggle("zoomed", cam.zoom > 1.05);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------- Ambient drifting triangles behind the page ----------

  function initAmbient() {
    const canvas = document.getElementById("ambient");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1;
    const bits = Array.from({ length: 140 }, () => ({
      x: Math.random(), y: Math.random(),
      vx: rand(-0.004, 0.004), vy: rand(-0.006, 0.002),
      size: rand(2, 7), angle: rand(0, TAU), spin: rand(-0.3, 0.3),
      color: pick(PALETTE), alpha: rand(0.12, 0.4),
    }));
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    window.addEventListener("resize", resize);
    resize();
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const b of bits) {
        if (!REDUCED) {
          b.x = (b.x + b.vx * dt + 1) % 1;
          b.y = (b.y + b.vy * dt + 1) % 1;
          b.angle += b.spin * dt;
        }
        ctx.globalAlpha = b.alpha;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        triangle(ctx, b.x * w, b.y * h, b.size, b.angle);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!REDUCED) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  initAmbient();
  initBrain();
})();
