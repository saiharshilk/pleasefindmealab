/* The hero brain: a slowly rotating 3D cloud of small triangles, one research topic each.
   It fills the whole first screen behind the text. Hover a triangle to see its topic and
   its neighbours, click to search it, drag to spin, scroll or double-click to zoom, Esc to
   reset. Zoomed in, topics get map-style labels. The legend flies to each field's region.
   When nobody is hovering it keeps lighting up topics on its own.
   Also draws the faint drifting triangles behind the whole page (#ambient). */
(function () {
  "use strict";

  const FIELDS = window.BRAIN_FIELDS;
  const PALETTE = ["#8052ff", "#ffb829", "#2ec4a6", "#e040fb", "#4f7cff", "#ffffff"];
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COUNT = 2200;
  const TAU = Math.PI * 2;
  // A triangle's other two corners are its first corner rotated by 120° and 240°.
  const C120 = Math.cos(TAU / 3), S120 = Math.sin(TAU / 3);

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // Every colour used, so particles can be grouped and drawn one colour at a time.
  const COLORS = [...new Set([...PALETTE, ...(FIELDS || []).map((f) => f.color)])];
  const colorIndex = (c) => COLORS.indexOf(c);

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
      const color = Math.random() < 0.7 ? FIELDS[field].color : pick(PALETTE);
      out.push({
        pos, field, color,
        start: randomDirection().map((v) => v * rand(2.5, 5)), // scattered, for the intro
        ci: colorIndex(color),
        topic: deck.order[deck.next++],
        size: rand(2.2, 4.6),
        angle: rand(0, TAU),
        spin: rand(-0.6, 0.6),
        filled: Math.random() < 0.18,
        delay: Math.random() * 0.9,
        sx: 0, sy: 0, bx: 0, by: 0, depth: 0, scale: 1, visible: true,
      });
    }
    return out;
  }

  // Adds a triangle to the current path. (ca, sa) = cos/sin of its rotation.
  function triangle(ctx, x, y, size, ca, sa) {
    const ax = ca * size, ay = sa * size;
    ctx.moveTo(x + ax, y + ay);
    ctx.lineTo(x + ax * C120 - ay * S120, y + ax * S120 + ay * C120);
    ctx.lineTo(x + ax * C120 + ay * S120, y - ax * S120 + ay * C120);
    ctx.closePath();
  }

  // ---------- Brain renderer ----------

  const MIN_ZOOM = 1, MAX_ZOOM = 4.5;
  const BASE_SPIN = 0.16;
  const ALPHA_LEVELS = 10;

  function initBrain() {
    const canvas = document.getElementById("brain");
    const host = canvas && canvas.parentElement;
    const tipsHost = document.getElementById("brain-tips");
    if (!canvas || !FIELDS) return;
    const ctx = canvas.getContext("2d");
    const particles = buildParticles();
    const fieldCi = FIELDS.map((f) => colorIndex(f.color));

    // Centre of each field's region, used to fly the camera there from the legend.
    const centroids = FIELDS.map((_, f) => {
      const mine = particles.filter((p) => p.field === f);
      return [0, 1, 2].map((k) => mine.reduce((s, p) => s + p.pos[k], 0) / mine.length);
    });

    let w = 0, h = 0, dpr = 1;
    function resize() {
      const r = canvas.getBoundingClientRect();
      // The canvas covers the whole first screen, so cap the pixel ratio to keep fill cost down.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    new ResizeObserver(resize).observe(canvas);
    resize();

    // The brain sits right of the headline and is sized to the screen.
    const unitSize = () => Math.min(w * 0.2, h * 0.36);
    const centre = () => ({ x: w * 0.68, y: h * 0.5 });

    // ---- Camera: targets are set by input, the camera eases toward them every frame. ----
    const cam = { yaw: 0, pitch: 0.12, zoom: 1, panX: 0, panY: 0 };
    const target = { zoom: 1, panX: 0, panY: 0 };
    let spinVel = BASE_SPIN;      // rad/s, decays back to BASE_SPIN after a fling
    let lockedField = -1;         // field chosen in the legend
    let yawGoal = null;           // when set, ease yaw here (legend fly-to)

    function clampPan() {
      const lim = unitSize() * (target.zoom - 1) * 1.3;
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
    // Only the brain itself (not the empty space around it) grabs drags and the wheel,
    // so the page still scrolls normally elsewhere.
    function overBrain(m) {
      if (cam.zoom > 1.03) return true;
      const c = centre();
      return Math.hypot(m.x - c.x - cam.panX, (m.y - c.y - cam.panY) * 1.2) < unitSize() * 1.35;
    }

    // ---- Pointer ----
    let mouse = null, drag = null, lastMove = 0;
    const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    // A visible label under the pointer (people click the words, not just the triangle).
    function labelAt(clientX, clientY) {
      for (let i = tips.length - 1; i >= 0; i--) {
        if (tips[i].dieAt !== Infinity) continue;
        const r = tips[i].el.getBoundingClientRect();
        if (clientX >= r.left - 4 && clientX <= r.right + 4 && clientY >= r.top - 4 && clientY <= r.bottom + 4) return tips[i].p.topic;
      }
      return null;
    }

    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const onLabel = labelAt(e.clientX, e.clientY);
      if (!onLabel && !overBrain(local(e))) return;
      canvas.setPointerCapture(e.pointerId);
      mouse = local(e);
      // Remember the topic now: by the time the button comes back up, frames have run
      // and the hover may have moved on.
      const under = onLabel ? null : nearestToMouse();
      const topic = onLabel || (under ? under.topic : null);
      drag = { start: mouse, last: mouse, moved: false, t: performance.now(), topic };
      spinVel = 0;
      yawGoal = null;
    });
    let client = null; // pointer in page coordinates, for hit-testing the HTML labels
    canvas.addEventListener("pointermove", (e) => {
      mouse = local(e);
      client = { x: e.clientX, y: e.clientY };
      if (!drag) return;
      const dx = mouse.x - drag.last.x, dy = mouse.y - drag.last.y;
      if (Math.hypot(mouse.x - drag.start.x, mouse.y - drag.start.y) > 4) drag.moved = true;
      if (!drag.moved) return;
      const now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
      cam.yaw += dx * 0.008;
      cam.pitch = clamp(cam.pitch + dy * 0.006, -1.1, 1.1);
      spinVel = clamp((dx * 0.008) / dt, -6, 6); // fling speed
      drag.last = mouse; drag.t = now; lastMove = now;
    });
    canvas.addEventListener("pointerup", () => {
      if (drag && !drag.moved && drag.topic) {
        document.dispatchEvent(new CustomEvent("brain:topic", { detail: { topic: drag.topic } }));
      }
      // A drag keeps its momentum; one held still before letting go doesn't.
      if (drag && performance.now() - lastMove > 80) spinVel = 0;
      drag = null;
    });
    canvas.addEventListener("pointerleave", () => { if (!drag) { mouse = null; client = null; } });
    canvas.addEventListener("wheel", (e) => {
      const m = local(e);
      if (!overBrain(m)) return;
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // Firefox reports lines
      zoomAt(m.x, m.y, Math.exp(-px * 0.0022));
    }, { passive: false });
    canvas.addEventListener("dblclick", (e) => {
      const m = local(e);
      if (target.zoom >= MAX_ZOOM - 0.01) resetView();
      else zoomAt(m.x, m.y, 2);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !e.target.matches("input, select, textarea") && host.offsetParent) resetView();
    });

    // ---- Field legend ----
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
    let neighbourSet = new Set();
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
        field.textContent = FIELDS[p.field].name;
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
      if (p) {
        // Zooming in makes room for more labels.
        const want = Math.round(4 + (cam.zoom - 1) * 2.5);
        const radius = 150 + (cam.zoom - 1) * 40;
        // Labels sit to the right of their triangle, so overlap is mostly vertical.
        const placed = [{ x: p.sx, y: p.sy, gap: 36 }];
        const seen = new Set([p.topic]);
        const candidates = [];
        for (const q of particles) {
          if (q === p || !q.visible || q.depth <= -0.1 || seen.has(q.topic)) continue;
          const d = (q.sx - p.sx) ** 2 + (q.sy - p.sy) ** 2;
          if (d > 30 * 30 && d < radius * radius) candidates.push({ q, d });
        }
        candidates.sort((a, b) => a.d - b.d);
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
      neighbourSet = new Set(neighbours);
    }

    function nearestToMouse() {
      let best = null, bestD = 18 * 18;
      for (const p of particles) {
        if (!p.visible || p.depth < -0.25) continue;
        if (lockedField >= 0 && p.field !== lockedField) continue;
        // Hit-test where the triangle really is, not where it has shied away to.
        const d = (p.bx - mouse.x) ** 2 + (p.by - mouse.y) ** 2;
        if (d < bestD) { bestD = d; best = p; }
      }
      return best;
    }

    // Map-style labels while zoomed in. Choosing them is the expensive part, so it's done a
    // few times a second; drawing them at their current positions happens every frame.
    let mapLabels = [], mapLabelsAt = 0;
    function chooseMapLabels(focusField, strong) {
      const taken = new Set();
      const cell = (x, y) => `${Math.floor(x / 150)},${Math.floor(y / 22)}`;
      for (const q of [hovered, ...neighbours]) {
        if (!q) continue;
        for (let dx = -1; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) taken.add(cell(q.sx + dx * 150, q.sy + dy * 22));
      }
      // Skip topics already shown by the hover labels, and keep clear of the nav and legend.
      const seen = new Set([hovered, ...neighbours].filter(Boolean).map((q) => q.topic));
      const candidates = particles
        .filter((p) => p.visible && p.depth > 0.1 && p.sy > 100 && p.sy < h - 130 && (!strong || p.field === focusField))
        .sort((a, b) => b.depth - a.depth);
      const out = [];
      for (const p of candidates) {
        if (out.length >= 70) break;
        if (seen.has(p.topic) || p === hovered || neighbourSet.has(p)) continue;
        const a = cell(p.sx, p.sy), b = cell(p.sx + 150, p.sy);
        if (taken.has(a) || taken.has(b)) continue;
        taken.add(a); taken.add(b); seen.add(p.topic);
        out.push(p);
      }
      return out;
    }

    // Reusable draw buckets: one path per (colour, opacity level), stroked or filled in one call.
    const nBuckets = COLORS.length * ALPHA_LEVELS;
    const strokeB = Array.from({ length: nBuckets }, () => []);
    const fillB = Array.from({ length: nBuckets }, () => []);

    let running = true;
    new IntersectionObserver(([entry]) => {
      const was = running;
      running = entry.isIntersecting;
      if (running && !was) { last = performance.now(); requestAnimationFrame(frame); }
    }).observe(canvas);

    const t0 = performance.now();
    let last = t0, introDone = REDUCED;

    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const intro = introDone ? 1 : clamp(t / 2.6, 0, 1);
      // Frame-rate independent easing: the same feel at 60Hz and 120Hz.
      const ease = (rate) => 1 - Math.exp(-rate * dt);

      // ---- Camera ----
      if (yawGoal !== null) {
        cam.yaw += (yawGoal - cam.yaw) * ease(4);
        cam.pitch += (0.12 - cam.pitch) * ease(4);
      } else if (!drag && !REDUCED) {
        // Free spin; slower while hovering so labels stay readable; flings decay back to it.
        const base = lockedField >= 0 ? 0 : mouse && hovered ? 0.04 : BASE_SPIN;
        spinVel += (base - spinVel) * ease(1.5);
        cam.yaw += spinVel * dt;
      }
      cam.zoom += (target.zoom - cam.zoom) * ease(9);

      const breathe = 1 + 0.012 * Math.sin(t * 1.3);
      const ry = cam.yaw - 0.35, rx = cam.pitch;
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      const unit = unitSize();
      const c = centre();

      // When a field is locked, keep its centre in the middle of the brain's spot.
      if (lockedField >= 0) {
        const [x, y, z] = centroids[lockedField];
        const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
        const y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        const persp = 4 / (4 - z2);
        target.panX = -x1 * unit * persp * breathe * target.zoom;
        target.panY = y1 * unit * persp * breathe * target.zoom;
      }
      cam.panX += (target.panX - cam.panX) * ease(9);
      cam.panY += (target.panY - cam.panY) * ease(9);

      const scaleXY = unit * breathe * cam.zoom;
      const ox = c.x + cam.panX, oy = c.y + cam.panY;
      const repel = mouse && !drag ? 60 : 0;
      const sizeZoom = Math.sqrt(cam.zoom);

      for (const p of particles) {
        let x, y, z;
        if (intro < 1) {
          const k = easeOut(clamp(intro * 1.6 - p.delay * 0.6, 0, 1));
          x = p.start[0] + (p.pos[0] - p.start[0]) * k;
          y = p.start[1] + (p.pos[1] - p.start[1]) * k;
          z = p.start[2] + (p.pos[2] - p.start[2]) * k;
        } else {
          x = p.pos[0]; y = p.pos[1]; z = p.pos[2];
        }
        // Rotate around Y (turntable), then X (tilt), then perspective.
        const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
        const y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        const persp = 4 / (4 - z2);
        let px = ox + x1 * scaleXY * persp, py = oy - y1 * scaleXY * persp;
        p.bx = px; p.by = py;
        // Particles shy away from the cursor a little.
        if (repel && z2 > -0.2 && p !== hovered) {
          const dx = px - mouse.x, dy = py - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 > 0.25 && d2 < repel * repel) {
            const d = Math.sqrt(d2), push = (1 - d / repel) * 12;
            px += (dx / d) * push; py += (dy / d) * push;
          }
        }
        p.sx = px; p.sy = py; p.depth = z2; p.scale = persp * sizeZoom;
        p.visible = px > -20 && px < w + 20 && py > -20 && py < h + 20;
        p.angle += p.spin * dt;
      }
      if (intro >= 1) introDone = true;

      if (intro >= 1) {
        // Resting on a label keeps it (and its neighbours) up so it can be clicked.
        if (mouse && !drag) { if (!(client && labelAt(client.x, client.y))) setHovered(nearestToMouse(), now); }
        else if (drag) { if (drag.moved) setHovered(null, now); } // a press that hasn't moved keeps its label
        else if (now > autoAt) {
          // Idle tour: light up a front-facing topic every couple of seconds.
          const front = particles.filter((p) => p.depth > 0.45 && p.visible && (lockedField < 0 || p.field === lockedField));
          setHovered(front.length ? pick(front) : null, now);
          autoAt = now + 2400;
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

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

      // Sort particles into colour/opacity buckets, then draw each bucket as one path.
      for (let i = 0; i < nBuckets; i++) { strokeB[i].length = 0; fillB[i].length = 0; }
      for (const p of particles) {
        if (!p.visible || p === hovered || neighbourSet.has(p)) continue;
        let alpha = clamp(0.18 + 0.82 * ((p.depth + 1.1) / 2.2), 0.08, 1);
        if (focusField >= 0) alpha *= p.field === focusField ? 1.15 : strong ? 0.15 : 0.55;
        const level = clamp(Math.round(alpha * (ALPHA_LEVELS - 1)), 1, ALPHA_LEVELS - 1);
        const ci = strong && p.field === focusField ? fieldCi[p.field] : p.ci;
        const b = ci * ALPHA_LEVELS + level;
        strokeB[b].push(p);
        if (p.filled) fillB[b].push(p);
      }
      ctx.lineWidth = 1;
      for (let b = 0; b < nBuckets; b++) {
        const s = strokeB[b];
        if (!s.length) continue;
        ctx.globalAlpha = (b % ALPHA_LEVELS) / (ALPHA_LEVELS - 1);
        const color = COLORS[(b / ALPHA_LEVELS) | 0];
        ctx.beginPath();
        for (const p of s) triangle(ctx, p.sx, p.sy, p.size * p.scale, Math.cos(p.angle), Math.sin(p.angle));
        ctx.strokeStyle = color;
        ctx.stroke();
        const f = fillB[b];
        if (f.length) {
          ctx.beginPath();
          for (const p of f) triangle(ctx, p.sx, p.sy, p.size * p.scale, Math.cos(p.angle), Math.sin(p.angle));
          ctx.fillStyle = color;
          ctx.fill();
        }
      }

      // Highlighted topic and its neighbours on top, larger.
      for (const p of neighbours) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        triangle(ctx, p.sx, p.sy, p.size * p.scale * 1.7, Math.cos(p.angle), Math.sin(p.angle));
        ctx.strokeStyle = p.color;
        ctx.stroke();
      }
      if (hovered) {
        const col = FIELDS[hovered.field].color;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        triangle(ctx, hovered.sx, hovered.sy, hovered.size * hovered.scale * 2.6, Math.cos(hovered.angle), Math.sin(hovered.angle));
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = col; ctx.stroke();

        const pulse = (now % 1400) / 1400;
        ctx.globalAlpha = 1 - pulse;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(hovered.sx, hovered.sy, 8 + pulse * 22, 0, TAU);
        ctx.stroke();
      }

      // Zoomed in, front-facing topics get faint labels, like place names on a map.
      if (cam.zoom > 1.8) {
        if (now > mapLabelsAt) { mapLabels = chooseMapLabels(focusField, strong); mapLabelsAt = now + 180; }
        const fadeIn = clamp((cam.zoom - 1.8) / 0.8, 0, 1);
        ctx.font = "400 12px Inter, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#bdbdbd";
        for (const p of mapLabels) {
          if (!p.visible || p.depth < 0) continue;
          ctx.globalAlpha = fadeIn * clamp(0.25 + p.depth * 0.6, 0.25, 0.8);
          ctx.fillText(p.topic, p.sx + 8, p.sy);
        }
      } else {
        mapLabels = [];
      }
      ctx.globalAlpha = 1;

      // HTML labels follow their triangles. transform avoids re-laying out the page each frame.
      for (let i = tips.length - 1; i >= 0; i--) {
        const tip = tips[i];
        if (now > tip.dieAt) { tip.el.remove(); tips.splice(i, 1); continue; }
        tip.el.style.transform = `translate3d(${(tip.p.sx + 14).toFixed(1)}px, ${tip.p.sy.toFixed(1)}px, 0) translateY(-50%)`;
      }

      canvas.style.cursor = drag && drag.moved ? "grabbing"
        : mouse && (hovered || (client && labelAt(client.x, client.y))) ? "pointer"
        : mouse && overBrain(mouse) ? "grab" : "default";
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
      ci: colorIndex(pick(PALETTE)), alpha: rand(0.12, 0.4),
    }));
    // Group by colour once; alpha varies a little per triangle, so use a few shared levels.
    for (const b of bits) b.alpha = Math.round(b.alpha * 10) / 10;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    window.addEventListener("resize", resize);
    resize();
    const groups = new Map();
    for (const b of bits) {
      const k = `${b.ci}|${b.alpha}`;
      if (!groups.has(k)) groups.set(k, { color: COLORS[b.ci], alpha: b.alpha, bits: [] });
      groups.get(k).bits.push(b);
    }
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const g of groups.values()) {
        ctx.globalAlpha = g.alpha;
        ctx.strokeStyle = g.color;
        ctx.beginPath();
        for (const b of g.bits) {
          if (!REDUCED) {
            b.x = (b.x + b.vx * dt + 1) % 1;
            b.y = (b.y + b.vy * dt + 1) % 1;
            b.angle += b.spin * dt;
          }
          triangle(ctx, b.x * w, b.y * h, b.size, Math.cos(b.angle), Math.sin(b.angle));
        }
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
