/* Shared dot fields for the four figures.
   One module: tone-sampled dots, a field per part, a pulsing accent,
   a spring that steps aside for the pointer, still under reduced motion,
   and paused while the canvas is offscreen. */
(function () {
  var BLUE = "#0e3cc9";
  var SPARK = "#6f97ff";
  var PAPER = "#f3efe4";
  var OMEGA = 7.4;
  var ZETA = 0.7;
  var SPRING = OMEGA * OMEGA;
  var DAMP = 2 * ZETA * OMEGA;
  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var handsCache = {};

  function reduced() {
    return reduceQuery.matches;
  }

  function hash(n) {
    var x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function loadGray(src) {
    if (!handsCache[src]) {
      handsCache[src] = new Promise(function (resolve, reject) {
        var image = new Image();
        image.onload = function () {
          var w = image.naturalWidth;
          var h = image.naturalHeight;
          var scratch = document.createElement("canvas");
          scratch.width = w;
          scratch.height = h;
          var ctx = scratch.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(image, 0, 0);
          var pixels = ctx.getImageData(0, 0, w, h).data;
          var gray = new Float32Array(w * h);
          var i;
          for (i = 0; i < gray.length; i++) gray[i] = pixels[i * 4] / 255;
          resolve({ width: w, height: h, gray: detail(gray, w, h) });
        };
        image.onerror = function () { reject(new Error(src)); };
        image.src = src;
      });
    }
    return handsCache[src];
  }

  function detail(gray, w, h) {
    var blur = new Float32Array(gray.length);
    var r = 2;
    var y, x, yy, xx, sum, n, idx;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        sum = 0;
        n = 0;
        for (yy = y - r; yy <= y + r; yy++) {
          if (yy < 0 || yy >= h) continue;
          for (xx = x - r; xx <= x + r; xx++) {
            if (xx < 0 || xx >= w) continue;
            sum += gray[yy * w + xx];
            n++;
          }
        }
        blur[y * w + x] = sum / n;
      }
    }
    var out = new Float32Array(gray.length);
    for (idx = 0; idx < gray.length; idx++) {
      out[idx] = Math.max(0, Math.min(1, gray[idx] + 1.4 * (gray[idx] - blur[idx])));
    }
    return out;
  }

  function sampleHands(source) {
    var w = source.width;
    var h = source.height;
    var gray = source.gray;
    var column = new Float64Array(w);
    var y, x;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) column[x] += gray[y * w + x];
    }
    var a = Math.floor(w * 0.3);
    var b = Math.floor(w * 0.7);
    var gap = a;
    var best = Infinity;
    for (x = a; x < b; x++) {
      if (column[x] < best) { best = column[x]; gap = x; }
    }
    var split = gap / w;
    var cols = 200;
    var rows = Math.max(8, Math.round(cols * h / w));
    var dots = [];
    var spacing = 1 / cols;
    var row, col, nx, ny, ix, iy, t, tone, keep, group, scale, mn, k;
    var ox = [3, -3, 0, 0, 2, -2];
    var oy = [0, 0, 3, -3, 2, 2];
    for (row = 0; row < rows; row++) {
      for (col = 0; col < cols; col++) {
        nx = (col + 0.5) / cols;
        ny = (row + 0.5) / rows;
        ix = Math.min(w - 1, (nx * (w - 1)) | 0);
        iy = Math.min(h - 1, (ny * (h - 1)) | 0);
        t = gray[iy * w + ix];
        mn = t;
        for (k = 0; k < ox.length; k++) {
          var sx = Math.max(0, Math.min(w - 1, ix + ox[k]));
          var sy = Math.max(0, Math.min(h - 1, iy + oy[k]));
          if (gray[sy * w + sx] < mn) mn = gray[sy * w + sx];
        }
        var rim = mn < 0.1 && t > 0.28;
        if (t < 0.24 && !rim) continue;
        tone = Math.max(0, Math.min(1, (t - 0.2) / 0.6));
        keep = rim ? 0.82 : 0.1 + tone * 0.26;
        if (hash(row * 1009 + col * 17) > keep) continue;
        group = nx < split ? 0 : 1;
        scale = (group === 0 ? 1.0 : 0.72) * (rim ? 1.08 : 1);
        dots.push(dot(nx, ny, tone, group, scale, spacing, 0, 0, 0, 0, 0, 0, group === 0 ? 1 : -1, 0));
      }
    }
    var tipY = 0.46;
    var sparkN = 36;
    var i, ang, ring;
    for (i = 0; i < sparkN; i++) {
      ang = (i / sparkN) * Math.PI * 2;
      ring = 0.25 + (i % 4) * 0.16;
      dots.push(dot(
        split + Math.cos(ang) * 0.012 * ring,
        tipY + Math.sin(ang) * 0.012 * ring * (w / h),
        1, 2, 1.1, spacing * 1.4,
        0, 0, 0, 0, 0, 0, 0, 1
      ));
    }
    return {
      dots: dots,
      aspect: h / w,
      gap: { x: split, y: tipY },
      leanReach: 0.32
    };
  }

  function dot(nx, ny, tone, group, scale, spacing, kind, spin, pivotX, pivotY, orbit, baseAng, lean, accent) {
    return {
      nx: nx, ny: ny, tone: tone, group: group, scale: scale, spacing: spacing,
      kind: kind, spin: spin, pivotX: pivotX, pivotY: pivotY,
      orbit: orbit, baseAng: baseAng, lean: lean, accent: accent, bob: 0
    };
  }

  function polar(cx, cy, radius, angle, aspect) {
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius / aspect
    };
  }

  function addGear(dots, cx, cy, radius, teeth, group, scale, phase, spin, aspect) {
    var tooth = radius * 0.28;
    var inner = radius - tooth;
    var spacing = radius / 14;
    var i, a, k, s, u, p, r;
    var rimN = Math.max(64, Math.round((Math.PI * 2 * inner) / (spacing * 0.85)));
    for (i = 0; i < rimN; i++) {
      a = (i / rimN) * Math.PI * 2;
      p = polar(cx, cy, inner, a, aspect);
      dots.push(dot(p.x, p.y, 0.82, group, scale, spacing, 1, spin, cx, cy, 0, 0, 0, 0));
      p = polar(cx, cy, inner * 0.9, a, aspect);
      dots.push(dot(p.x, p.y, 0.55, group, scale * 0.85, spacing, 1, spin, cx, cy, 0, 0, 0, 0));
    }
    for (i = 0; i < teeth; i++) {
      var a0 = phase + (i / teeth) * Math.PI * 2;
      var half = (Math.PI / teeth) * 0.28;
      for (k = 0; k < 5; k++) {
        a = a0 - half + (2 * half) * (k / 4);
        for (s = 0; s < 6; s++) {
          r = inner + tooth * (s / 5);
          p = polar(cx, cy, r, a, aspect);
          dots.push(dot(p.x, p.y, 0.95, group, scale, spacing * 0.85, 1, spin, cx, cy, 0, 0, 0, 0));
        }
      }
    }
    for (s = 0; s < 4; s++) {
      a = phase + s * Math.PI / 2 + 0.35;
      for (u = 0.28; u <= 0.82; u += 0.06) {
        p = polar(cx, cy, inner * u, a, aspect);
        dots.push(dot(p.x, p.y, 0.75, group, scale, spacing, 1, spin, cx, cy, 0, 0, 0, 0));
        p = polar(cx, cy, inner * u, a + 0.07, aspect);
        dots.push(dot(p.x, p.y, 0.6, group, scale * 0.9, spacing, 1, spin, cx, cy, 0, 0, 0, 0));
      }
    }
    for (i = 0; i < 20; i++) {
      a = (i / 20) * Math.PI * 2;
      p = polar(cx, cy, radius * 0.16, a, aspect);
      dots.push(dot(p.x, p.y, 0.9, group, scale, spacing, 1, spin, cx, cy, 0, 0, 0, 0));
    }
  }

  function gearScene() {
    var aspect = 0.48;
    var raw = [0.115, 0.142, 0.126, 0.102];
    var teeth = [10, 12, 11, 9];
    var scales = [1.05, 0.82, 1.0, 0.78];
    var dots = [];
    var cursor = raw[0];
    var rawCenters = [cursor];
    var i, dist, spin, phase;
    for (i = 0; i < raw.length - 1; i++) {
      dist = (raw[i] + raw[i + 1]) * 0.78;
      cursor += dist;
      rawCenters.push(cursor);
    }
    var span = rawCenters[rawCenters.length - 1] + raw[raw.length - 1];
    var fit = 0.9 / span;
    var radii = raw.map(function (r) { return r * fit; });
    var centers = rawCenters.map(function (c) { return 0.05 + c * fit; });
    var cy = 0.54;
    var meshSpeed = 0.055;
    for (i = 0; i < radii.length; i++) {
      spin = (i % 2 === 0 ? 1 : -1) * meshSpeed / radii[i];
      phase = i % 2 === 0 ? 0 : Math.PI / teeth[i];
      addGear(dots, centers[i], cy, radii[i], teeth[i], i, scales[i], phase, spin, aspect);
    }
    var spacing = radii[1] / 14;
    for (x = centers[0] - radii[0] * 0.2; x <= centers[3] + radii[3] * 0.2; x += 0.012) {
      dots.push(dot(x, cy, 0.7, 4, 0.7, spacing, 0, 0, 0, 0, 0, 0, 0, 0));
    }
    var mesh = (centers[1] + centers[2]) / 2;
    for (i = 0; i < 22; i++) {
      var ang = (i / 22) * Math.PI * 2;
      var ring = 0.45 + (i % 3) * 0.2;
      dots.push(dot(
        mesh + Math.cos(ang) * 0.008 * ring,
        cy - 0.02 + Math.sin(ang) * 0.008 * ring / aspect,
        1, 5, 1.2, spacing, 0, 0, 0, 0, 0, 0, 0, 1
      ));
    }
    return { dots: dots, aspect: aspect, gap: null, leanReach: 0 };
  }

  function screwScene() {
    var aspect = 0.78;
    var cx = 0.5;
    var dots = [];
    var spacing = 0.011;
    var i, a, u, y, rad, k, rr, z, tone, side, t;
    var turns = 2.5;
    var steps = 78;
    for (i = 0; i < steps; i++) {
      u = i / (steps - 1);
      a = u * turns * Math.PI * 2;
      y = 0.08 + u * 0.5;
      rad = 0.2 * (0.42 + 0.58 * Math.sin(u * Math.PI));
      for (k = 0; k < 5; k++) {
        rr = rad * (0.5 + k * 0.125);
        z = Math.sin(a);
        tone = 0.45 + 0.5 * (z * 0.5 + 0.5);
        dots.push(dot(cx, y, tone, 0, 0.9, spacing * (k === 4 ? 0.8 : 1), 2, 0.55, cx, y, rr, a, 0, 0));
        dots[dots.length - 1].bob = 0.008;
      }
    }
    for (y = 0.1; y <= 0.8; y += 0.014) {
      dots.push(dot(cx, y, 0.85, 0, 1.05, spacing, 0, 0, cx, y, 0, 0, 0, 0));
    }
    var baseY = 0.8;
    for (side = 0; side < 4; side++) {
      var x0 = cx + [-0.24, 0.24, -0.13, 0.13][side];
      var x1 = cx + [-0.07, 0.07, -0.035, 0.035][side];
      var y1 = 0.56;
      for (t = 0; t <= 1; t += 0.045) {
        var px = x0 + (x1 - x0) * t;
        var py = baseY + (y1 - baseY) * t;
        dots.push(dot(px, py, 0.85, 0, 1.1, spacing * 0.8, 0, 0, 0, 0, 0, 0, 0, 0));
        dots.push(dot(px + 0.008, py, 0.6, 0, 0.9, spacing, 0, 0, 0, 0, 0, 0, 0, 0));
      }
    }
    for (i = 0; i < 96; i++) {
      a = (i / 96) * Math.PI * 2;
      dots.push(dot(cx + Math.cos(a) * 0.28, baseY + Math.sin(a) * 0.28 / aspect * 0.32, 0.9, 1, 1.15, spacing, 0, 0, 0, 0, 0, 0, 0, 0));
    }
    for (i = 0; i < 56; i++) {
      a = (i / 56) * Math.PI * 2;
      dots.push(dot(cx + Math.cos(a) * 0.18, baseY + Math.sin(a) * 0.18 / aspect * 0.32, 0.55, 1, 0.9, spacing, 0, 0, 0, 0, 0, 0, 0, 0));
    }
    for (side = -1; side <= 1; side++) {
      for (k = 0; k < 5; k++) {
        dots.push(dot(cx + side * 0.045, 0.045 - k * 0.012, 0.8, 3, 1, spacing, 0, 0, 0, 0, 0, 0, 0, 1));
      }
    }
    return { dots: dots, aspect: aspect, gap: null, leanReach: 0 };
  }

  function ring(dots, cx, cy, radius, count, aspect) {
    var i, a, p;
    for (i = 0; i < count; i++) {
      a = (i / count) * Math.PI * 2;
      p = polar(cx, cy, radius, a, aspect);
      dots.push(dot(p.x, p.y, 0.75, 8, 0.7, 0.01, 0, 0, 0, 0, 0, 0, 0, 0));
    }
  }

  function square(dots, cx, cy, half, perSide, aspect) {
    var i, t, x, y;
    var yHalf = half / aspect;
    for (i = 0; i < perSide; i++) {
      t = (i / perSide) * 2 - 1;
      x = cx + t * half;
      dots.push(dot(x, cy - yHalf, 0.75, 8, 0.7, 0.01, 0, 0, 0, 0, 0, 0, 0, 0));
      dots.push(dot(x, cy + yHalf, 0.75, 8, 0.7, 0.01, 0, 0, 0, 0, 0, 0, 0, 0));
      y = cy + t * yHalf;
      dots.push(dot(cx - half, y, 0.75, 8, 0.7, 0.01, 0, 0, 0, 0, 0, 0, 0, 0));
      dots.push(dot(cx + half, y, 0.75, 8, 0.7, 0.01, 0, 0, 0, 0, 0, 0, 0, 0));
    }
  }

  function place(dots, box) {
    var target = 0.0044;
    var cell = target / Math.max(box.w, 0.001);
    var used = {};
    var out = [];
    var i, d, key, spacing;
    for (i = 0; i < dots.length; i++) {
      d = dots[i];
      key = ((d.nx / cell) | 0) + ":" + ((d.ny / cell) | 0);
      if (used[key]) continue;
      used[key] = 1;
      spacing = d.spacing * box.w;
      if (spacing < target * 0.75) spacing = target * 0.75;
      out.push({
        nx: box.x + d.nx * box.w,
        ny: box.y + d.ny * box.h,
        tone: d.tone,
        group: d.group,
        scale: d.scale,
        spacing: spacing,
        kind: d.kind,
        spin: d.spin,
        pivotX: box.x + (d.pivotX || 0) * box.w,
        pivotY: box.y + (d.pivotY || 0) * box.h,
        orbit: (d.orbit || 0) * box.w,
        baseAng: d.baseAng || 0,
        lean: d.lean || 0,
        accent: d.accent || 0,
        bob: (d.bob || 0) * box.h
      });
    }
    return out;
  }

  function fitBox(dots) {
    var minX = 1, minY = 1, maxX = 0, maxY = 0, i, d;
    for (i = 0; i < dots.length; i++) {
      d = dots[i];
      if (d.accent) continue;
      if (d.nx < minX) minX = d.nx;
      if (d.ny < minY) minY = d.ny;
      if (d.nx > maxX) maxX = d.nx;
      if (d.ny > maxY) maxY = d.ny;
    }
    var w = Math.max(0.001, maxX - minX);
    var h = Math.max(0.001, maxY - minY);
    return {
      minX: minX, minY: minY, w: w, h: h,
      dots: dots.map(function (d) {
        var copy = {};
        var key;
        for (key in d) copy[key] = d[key];
        copy.nx = (d.nx - minX) / w;
        copy.ny = (d.ny - minY) / h;
        copy.pivotX = ((d.pivotX || 0) - minX) / w;
        copy.pivotY = ((d.pivotY || 0) - minY) / h;
        copy.orbit = (d.orbit || 0) / w;
        copy.spacing = d.spacing / w;
        return copy;
      })
    };
  }

  function vitruvianScene(hands, gears, screw) {
    var aspect = 1;
    var dots = [];
    ring(dots, 0.5, 0.5, 0.4, 160, aspect);
    square(dots, 0.5, 0.5, 0.4, 40, aspect);
    var handArt = fitBox(hands.dots.filter(function (d) { return !d.accent; }));
    var handBox = { x: 0.33, y: 0.22, w: 0.34, h: 0.34 * 0.482 };
    var placedHands = place(handArt.dots, handBox);
    var gearArt = fitBox(gears.dots.filter(function (d) { return d.group === 1; }));
    var gearBox = { x: 0.24, y: 0.52, w: 0.22, h: 0.22 };
    var screwArt = fitBox(screw.dots.filter(function (d) { return !d.accent; }));
    var screwBox = { x: 0.55, y: 0.5, w: 0.22, h: 0.22 * 0.78 };
    dots = dots.concat(placedHands, place(gearArt.dots, gearBox), place(screwArt.dots, screwBox));
    var gap = {
      x: handBox.x + ((hands.gap.x - handArt.minX) / handArt.w) * handBox.w,
      y: handBox.y + ((hands.gap.y - handArt.minY) / handArt.h) * handBox.h
    };
    for (var i = 0; i < 16; i++) {
      var ang = (i / 16) * Math.PI * 2;
      dots.push(dot(
        gap.x + Math.cos(ang) * 0.012,
        gap.y + Math.sin(ang) * 0.012,
        1, 2, 1, 0.008, 0, 0, 0, 0, 0, 0, 0, 1
      ));
    }
    return { dots: dots, aspect: aspect, gap: gap, leanReach: 0.1 };
  }

  function mount(canvas, scene) {
    var parent = canvas.parentElement;
    var context = canvas.getContext("2d", { alpha: false });
    var dots = scene.dots;
    var n = dots.length;
    var nx = new Float32Array(n);
    var ny = new Float32Array(n);
    var tone = new Float32Array(n);
    var scale = new Float32Array(n);
    var spacing = new Float32Array(n);
    var kind = new Uint8Array(n);
    var spin = new Float32Array(n);
    var pivotX = new Float32Array(n);
    var pivotY = new Float32Array(n);
    var orbit = new Float32Array(n);
    var baseAng = new Float32Array(n);
    var lean = new Int8Array(n);
    var accent = new Uint8Array(n);
    var bob = new Float32Array(n);
    var x = new Float32Array(n);
    var y = new Float32Array(n);
    var vx = new Float32Array(n);
    var vy = new Float32Array(n);
    var phase = new Float32Array(n);
    var i;
    for (i = 0; i < n; i++) {
      var d = dots[i];
      nx[i] = d.nx; ny[i] = d.ny; tone[i] = d.tone; scale[i] = d.scale;
      spacing[i] = d.spacing; kind[i] = d.kind || 0; spin[i] = d.spin || 0;
      pivotX[i] = d.pivotX || 0; pivotY[i] = d.pivotY || 0;
      orbit[i] = d.orbit || 0; baseAng[i] = d.baseAng || 0;
      lean[i] = d.lean || 0; accent[i] = d.accent || 0; bob[i] = d.bob || 0;
      phase[i] = hash(i + 3) * Math.PI * 2;
    }
    parent.style.aspectRatio = "1 / " + scene.aspect;
    var cssW = 0;
    var cssH = 0;
    var pointerX = 0;
    var pointerY = 0;
    var active = false;
    var pressed = false;
    var running = false;
    var raf = 0;
    var last = 0;
    var seen = false;
    var workTimes = [];
    var gap = scene.gap;
    var leanReach = scene.leanReach || 0;
    var hx = new Float32Array(n);
    var hy = new Float32Array(n);

    function placeHome(time, width, height, withLean) {
      var i, ang, c, s, dx, dy, gx, gy, dist, reach, pushIn;
      var still = reduced();
      var leanOn = withLean && !still && gap && active;
      if (leanOn) {
        gx = gap.x * width - pointerX;
        gy = gap.y * height - pointerY;
        dist = Math.hypot(gx, gy);
        reach = leanReach * width;
        pushIn = dist < reach ? (1 - dist / reach) * reach * 0.12 : 0;
      } else {
        pushIn = 0;
      }
      for (i = 0; i < n; i++) {
        if (!still && kind[i] === 1) {
          ang = spin[i] * time;
          c = Math.cos(ang);
          s = Math.sin(ang);
          dx = (nx[i] - pivotX[i]) * width;
          dy = (ny[i] - pivotY[i]) * height;
          hx[i] = pivotX[i] * width + dx * c - dy * s;
          hy[i] = pivotY[i] * height + dx * s + dy * c;
        } else if (kind[i] === 2) {
          ang = baseAng[i] + (still ? 0 : spin[i] * time);
          hx[i] = (pivotX[i] + Math.cos(ang) * orbit[i]) * width;
          hy[i] = ny[i] * height - (still ? 0 : Math.sin(time * 0.7) * bob[i] * height);
        } else {
          hx[i] = nx[i] * width;
          hy[i] = ny[i] * height;
        }
        if (pushIn && lean[i]) hx[i] += pushIn * lean[i];
      }
    }

    function layout() {
      var width = canvas.clientWidth;
      var height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var pw = Math.round(width * dpr);
      var ph = Math.round(height * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      var sx = cssW > 0 ? width / cssW : 1;
      var sy = cssH > 0 ? height / cssH : 1;
      cssW = width;
      cssH = height;
      placeHome(0, width, height, false);
      for (var i = 0; i < n; i++) {
        if (!seen) {
          x[i] = hx[i];
          y[i] = hy[i];
        } else {
          x[i] *= sx;
          y[i] *= sy;
          vx[i] *= sx;
          vy[i] *= sy;
        }
      }
      seen = true;
      draw(0);
    }

    function step(dt, time) {
      var reach = Math.max(64, cssW * 0.22);
      var force = cssW * 0.075 * SPRING;
      placeHome(time, cssW, cssH, true);
      for (var i = 0; i < n; i++) {
        var px = 0;
        var py = 0;
        if (active) {
          var dx = x[i] - pointerX;
          var dy = y[i] - pointerY;
          var dist = Math.hypot(dx, dy);
          if (dist < reach && dist > 0.4) {
            var fall = 1 - dist / reach;
            var mag = force * fall * fall;
            px = (dx / dist) * mag;
            py = (dy / dist) * mag;
          }
        }
        var ax = (hx[i] - x[i]) * SPRING - vx[i] * DAMP + px;
        var ay = (hy[i] - y[i]) * SPRING - vy[i] * DAMP + py;
        vx[i] += ax * dt;
        vy[i] += ay * dt;
        x[i] += vx[i] * dt;
        y[i] += vy[i] * dt;
      }
    }

    function draw(time) {
      if (cssW < 2) return;
      context.fillStyle = PAPER;
      context.fillRect(0, 0, cssW, cssH);
      context.beginPath();
      var i, r, pulse;
      for (i = 0; i < n; i++) {
        if (accent[i]) continue;
        var pitch = cssW * spacing[i];
        r = pitch * (0.18 + tone[i] * 0.24) * scale[i];
        if (r < 0.72) r = 0.72;
        if (r > pitch * 0.48) r = pitch * 0.48;
        context.moveTo(x[i] + r, y[i]);
        context.arc(x[i], y[i], Math.max(0.4, r), 0, Math.PI * 2);
      }
      context.fillStyle = BLUE;
      context.fill();
      context.beginPath();
      pulse = reduced() ? 1 : 0.75 + Math.sin(time * 2.6) * 0.25;
      var any = false;
      for (i = 0; i < n; i++) {
        if (!accent[i]) continue;
        any = true;
        r = cssW * spacing[i] * 0.34 * scale[i] * (0.85 + pulse * 0.4);
        context.moveTo(x[i] + r, y[i]);
        context.arc(x[i], y[i], Math.max(0.6, r), 0, Math.PI * 2);
      }
      if (any) {
        context.fillStyle = SPARK;
        context.globalAlpha = reduced() ? 1 : 0.7 + pulse * 0.3;
        context.fill();
        context.globalAlpha = 1;
      }
    }

    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min(0.032, (now - last) / 1000) : 0.016;
      last = now;
      var t0 = performance.now();
      var time = now / 1000;
      step(dt, time);
      draw(time);
      workTimes.push(performance.now() - t0);
      if (workTimes.length > 40) workTimes.shift();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduced()) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function setPointer(event) {
      var rect = canvas.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
    }

    canvas.addEventListener("pointerdown", function (event) {
      if (reduced()) return;
      pressed = true;
      canvas.setPointerCapture(event.pointerId);
      setPointer(event);
      active = true;
    });
    canvas.addEventListener("pointermove", function (event) {
      if (reduced()) return;
      if (event.pointerType === "mouse" || pressed) {
        setPointer(event);
        active = true;
      }
    });
    canvas.addEventListener("pointerup", function (event) {
      pressed = false;
      if (event.pointerType !== "mouse") active = false;
    });
    canvas.addEventListener("pointercancel", function () {
      pressed = false;
      active = false;
    });
    canvas.addEventListener("pointerleave", function (event) {
      if (event.pointerType === "mouse") active = false;
      pressed = false;
    });

    new ResizeObserver(layout).observe(parent);
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start();
      else stop();
    }, { threshold: 0.08 }).observe(canvas);

    layout();
    var key = canvas.id || canvas.getAttribute("data-field");
    window.__dots = window.__dots || {};
    window.__dots[key] = function () {
      var max = 0;
      var sum = 0;
      var k;
      for (k = 0; k < workTimes.length; k++) {
        sum += workTimes[k];
        if (workTimes[k] > max) max = workTimes[k];
      }
      placeHome(0, cssW, cssH, false);
      var shift = 0;
      for (k = 0; k < n; k++) shift += Math.abs(x[k] - hx[k]) + Math.abs(y[k] - hy[k]);
      return {
        count: n,
        work: workTimes.slice(),
        avg: workTimes.length ? sum / workTimes.length : 0,
        max: max,
        shift: n ? shift / n : 0,
        width: cssW,
        height: cssH
      };
    };
    window.__dots.ready = Object.keys(window.__dots).filter(function (name) { return name !== "ready"; }).length;
  }

  function boot() {
    var nodes = document.querySelectorAll("canvas[data-field]");
    if (!nodes.length) return;
    var gears = gearScene();
    var screw = screwScene();
    var pending = 0;
    function finish() { pending--; }
    Array.prototype.forEach.call(nodes, function (canvas) {
      var field = canvas.getAttribute("data-field");
      if (field === "gears") mount(canvas, gears);
      else if (field === "screw") mount(canvas, screw);
      else if (field === "hands" || field === "vitruvian") {
        pending++;
        loadGray(canvas.getAttribute("data-src") || "variations/fig2/hands.png").then(function (source) {
          var hands = sampleHands(source);
          if (field === "hands") mount(canvas, hands);
          else mount(canvas, vitruvianScene(hands, gears, screw));
          finish();
        }).catch(function () {
          canvas.setAttribute("aria-label", "The figure could not be loaded.");
          finish();
        });
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
