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

  function initBrain() {
    const canvas = document.getElementById("brain");
    const tipsHost = document.getElementById("brain-tips");
    if (!canvas || !FIELDS) return;
    const ctx = canvas.getContext("2d");
    const particles = buildParticles();

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

    // Mouse in canvas coords; null when outside.
    let mouse = null;
    let tiltX = 0, tiltY = 0;
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    canvas.addEventListener("mouseleave", () => { mouse = null; });

    let hovered = null;      // particle under the cursor (or the auto-picked one)
    let neighbours = [];
    let autoAt = 0;          // next time the idle tour picks a topic
    const tips = [];         // { el, p, main, dieAt }

    canvas.addEventListener("click", () => {
      if (!hovered || !mouse) return;
      document.dispatchEvent(new CustomEvent("brain:topic", { detail: { topic: hovered.topic } }));
    });

    function addTip(p, main) {
      const el = document.createElement("div");
      el.className = main ? "tip main" : "tip";
      if (main) {
        el.textContent = p.topic;
        const field = document.createElement("div");
        field.style.cssText = `font:600 11px var(--font);letter-spacing:.05em;text-transform:uppercase;color:${FIELDS[p.field].color};margin-top:2px`;
        field.textContent = FIELDS[p.field].name;
        el.appendChild(field);
      } else {
        el.textContent = p.topic;
        el.style.color = "#bdbdbd";
        el.style.fontSize = "13px";
      }
      tipsHost.appendChild(el);
      tips.push({ el, p, main, dieAt: Infinity });
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
      // Nearby topics whose labels won't collide with ones already placed
      // (labels sit to the right of their triangle, so overlap is mostly vertical).
      const placed = [{ x: p.sx, y: p.sy, gap: 36 }];
      const seen = new Set([p.topic]);
      const candidates = particles
        .filter((q) => q !== p && q.depth > -0.1 && !seen.has(q.topic))
        .map((q) => ({ q, d: (q.sx - p.sx) ** 2 + (q.sy - p.sy) ** 2 }))
        .filter((o) => o.d > 30 * 30 && o.d < 150 * 150)
        .sort((a, b) => a.d - b.d);
      for (const { q } of candidates) {
        if (neighbours.length === 4) break;
        if (seen.has(q.topic)) continue;
        const clear = placed.every((l) => Math.abs(q.sy - l.y) > l.gap || Math.abs(q.sx - l.x) > 220);
        if (!clear) continue;
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
        const d = (p.sx - mouse.x) ** 2 + (p.sy - mouse.y) ** 2;
        if (d < bestD) { bestD = d; best = p; }
      }
      return best;
    }

    let running = true;
    new IntersectionObserver(([entry]) => {
      const was = running;
      running = entry.isIntersecting;
      if (running && !was) requestAnimationFrame(frame);
    }).observe(canvas);

    const t0 = performance.now();
    let last = t0, yaw = 0;

    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const intro = REDUCED ? 1 : clamp(t / 2.6, 0, 1);

      // Keeps turning; slows down while you explore so labels are readable.
      if (!REDUCED) yaw += dt * (mouse ? 0.05 : 0.16);
      const targetX = mouse ? (mouse.y / h - 0.5) * 0.5 : 0;
      const targetY = mouse ? (mouse.x / w - 0.5) * 0.7 : 0;
      tiltX += (targetX - tiltX) * 0.05;
      tiltY += (targetY - tiltY) * 0.05;
      const ry = yaw + tiltY - 0.35, rx = 0.12 + tiltX;
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);

      const unit = Math.min(w, h) * 0.36;
      const ox = w / 2, oy = h * 0.47;
      const breathe = 1 + 0.012 * Math.sin(t * 1.3);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        const k = easeOut(clamp((intro * 1.6 - p.delay * 0.6), 0, 1));
        let x = p.start[0] + (p.pos[0] - p.start[0]) * k;
        let y = p.start[1] + (p.pos[1] - p.start[1]) * k;
        let z = p.start[2] + (p.pos[2] - p.start[2]) * k;
        // Rotate around Y (turntable), then X (tilt).
        let x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
        let y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        const persp = 4 / (4 - z2);
        p.sx = ox + x1 * unit * persp * breathe;
        p.sy = oy - y1 * unit * persp * breathe;
        p.depth = z2;
        p.scale = persp;
        p.visible = p.sx > -20 && p.sx < w + 20 && p.sy > -20 && p.sy < h + 20;
        p.angle += p.spin * dt;
      }

      // Idle tour: no mouse, so light up a front-facing topic every couple of seconds.
      if (mouse && intro >= 1) {
        setHovered(nearestToMouse(), now);
      } else if (!mouse && intro >= 1 && now > autoAt) {
        const front = particles.filter((p) => p.depth > 0.45 && p.visible);
        setHovered(front.length ? pick(front) : null, now);
        autoAt = now + 2400;
      }

      // Constellation lines from the highlighted topic to its neighbours.
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

      const focusField = hovered ? hovered.field : -1;
      for (const p of particles) {
        if (!p.visible) continue;
        let alpha = clamp(0.18 + 0.82 * ((p.depth + 1.1) / 2.2), 0.08, 1);
        // While exploring, the hovered field glows and the rest dims a little.
        if (focusField >= 0) alpha *= p.field === focusField ? 1.1 : 0.55;
        let size = p.size * p.scale;
        if (p === hovered) size *= 2.6;
        else if (neighbours.includes(p)) size *= 1.7;
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.beginPath();
        triangle(ctx, p.sx, p.sy, size, p.angle);
        if (p === hovered || p.filled) { ctx.fillStyle = p === hovered ? FIELDS[p.field].color : p.color; ctx.fill(); }
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p === hovered ? 1.6 : 1;
        ctx.stroke();
      }

      // Pulsing ring around the highlighted topic.
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

      canvas.style.cursor = mouse && hovered ? "pointer" : "crosshair";
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
