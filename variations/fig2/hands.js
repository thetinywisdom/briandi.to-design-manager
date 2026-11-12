/* Fig 2. Four dot studies of the same two hands.
   Vanilla, no build. Each canvas samples variations/fig2/hands.png,
   keeps a home position per dot, and runs a spring in requestAnimationFrame. */
(function () {
  var BLUE = "#0e3cc9";
  var SPARK = "#6f97ff";
  var PAPER = "#f6f4ef";
  var RAMP = [".", ":", "-", "=", "+", "*", "#", "%"];

  /* Slightly underdamped. A displaced dot settles inside about 0.7s. */
  var OMEGA = 7.4;
  var ZETA = 0.7;
  var SPRING = OMEGA * OMEGA;
  var DAMP = 2 * ZETA * OMEGA;

  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var shared = null;

  function reduced() {
    return reduceQuery.matches;
  }

  function loadSource() {
    if (shared) return shared;
    shared = new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        var width = image.naturalWidth;
        var height = image.naturalHeight;
        var scratch = document.createElement("canvas");
        scratch.width = width;
        scratch.height = height;
        var context = scratch.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        var pixels = context.getImageData(0, 0, width, height).data;
        var gray = new Uint8Array(width * height);
        for (var i = 0; i < gray.length; i++) gray[i] = pixels[i * 4];
        resolve({ width: width, height: height, gray: gray, gap: findGap(gray, width, height) });
      };
      image.onerror = function () {
        reject(new Error("Could not load the hands plate"));
      };
      image.src = "hands.png";
    });
    return shared;
  }

  function findGap(gray, width, height) {
    var column = new Float64Array(width);
    var y, x, i;
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) column[x] += gray[y * width + x];
    }
    var start = Math.floor(width * 0.34);
    var end = Math.floor(width * 0.66);
    var split = Math.floor(width / 2);
    var best = Infinity;
    for (x = start; x < end; x++) {
      if (column[x] < best) {
        best = column[x];
        split = x;
      }
    }
    function tipFrom(x, step) {
      var guard = 0;
      while (x > 1 && x < width - 2 && guard < 80) {
        var rows = [];
        for (var yy = 0; yy < height; yy++) {
          if (gray[yy * width + x] > 70) rows.push(yy);
        }
        if (rows.length > 4) {
          return { x: x / width, y: rows[rows.length >> 1] / height };
        }
        x += step;
        guard++;
      }
      return { x: split / width, y: 0.45 };
    }
    var left = tipFrom(split - 1, -1);
    var right = tipFrom(split + 1, 1);
    return {
      split: split / width,
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2,
      left: left,
      right: right
    };
  }

  function toneAt(source, x, y) {
    var ix = Math.max(0, Math.min(source.width - 1, Math.round(x)));
    var iy = Math.max(0, Math.min(source.height - 1, Math.round(y)));
    return source.gray[iy * source.width + ix] / 255;
  }

  /* Average a small neighbourhood. A pinhole in the source does not drop the dot. */
  function cellTone(source, nx, ny, halfX, halfY) {
    var cx = nx * (source.width - 1);
    var cy = ny * (source.height - 1);
    var max = 0;
    var sum = 0;
    var n = 0;
    for (var oy = -1; oy <= 1; oy++) {
      for (var ox = -1; ox <= 1; ox++) {
        var t = toneAt(source, cx + ox * halfX * source.width, cy + oy * halfY * source.height);
        if (t > max) max = t;
        sum += t;
        n++;
      }
    }
    if (max < 0.2) return 0;
    return sum / n;
  }

  function makeParticles(count) {
    return {
      n: count,
      nx: new Float32Array(count),
      ny: new Float32Array(count),
      x: new Float32Array(count),
      y: new Float32Array(count),
      vx: new Float32Array(count),
      vy: new Float32Array(count),
      baseX: new Float32Array(count),
      baseY: new Float32Array(count),
      radius: new Float32Array(count),
      phase: new Float32Array(count),
      group: new Uint8Array(count),
      glyph: new Uint8Array(count),
      flicker: new Float32Array(count),
      flickerTo: new Int8Array(count)
    };
  }

  function pushDot(bag, index, nx, ny, tone, group, glyph) {
    bag.nx[index] = nx;
    bag.ny[index] = ny;
    bag.phase[index] = (nx * 12.3 + ny * 7.1) % (Math.PI * 2);
    bag.group[index] = group;
    bag.glyph[index] = glyph;
    bag.flickerTo[index] = glyph;
    return tone;
  }

  function sampleHalftone(source) {
    var cols = 168;
    var rows = Math.max(12, Math.round(cols * source.height / source.width));
    var halfX = 0.45 / cols;
    var halfY = 0.45 / rows;
    var found = [];
    var row, col, nx, ny, tone;
    for (row = 0; row < rows; row++) {
      for (col = 0; col < cols; col++) {
        nx = (col + 0.5) / cols;
        ny = (row + 0.5) / rows;
        tone = cellTone(source, nx, ny, halfX, halfY);
        if (tone < 0.16) continue;
        found.push(nx, ny, tone, nx < source.gap.split ? 0 : 1);
      }
    }
    return pack(found, cols);
  }

  function sampleContour(source) {
    var width = source.width;
    var height = source.height;
    var gray = source.gray;
    var mag = new Float32Array(width * height);
    var y, x, index, gx, gy;
    for (y = 1; y < height - 1; y++) {
      for (x = 1; x < width - 1; x++) {
        index = y * width + x;
        gx = gray[index + 1] - gray[index - 1];
        gy = gray[index + width] - gray[index - width];
        mag[index] = Math.hypot(gx, gy);
      }
    }
    var found = [];
    var stride = 2;
    for (y = 1; y < height - 1; y += stride) {
      for (x = 1; x < width - 1; x += stride) {
        index = y * width + x;
        if (mag[index] < 34) continue;
        var nx = x / (width - 1);
        var ny = y / (height - 1);
        found.push(nx, ny, 0.9, nx < source.gap.split ? 0 : 1, 0);
      }
    }
    for (y = 2; y < height - 2; y += 4) {
      for (x = 2; x < width - 2; x += 4) {
        if (gray[y * width + x] < 175) continue;
        if (((x * 3 + y * 5) % 4) !== 0) continue;
        nx = x / (width - 1);
        ny = y / (height - 1);
        found.push(nx, ny, 0.4, nx < source.gap.split ? 0 : 1, 1);
      }
    }
    return packFlat(found);
  }

  function sampleAscii(source) {
    var cols = 58;
    var rows = Math.max(10, Math.round(cols * source.height / source.width));
    var found = [];
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var nx = (col + 0.5) / cols;
        var ny = (row + 0.5) / rows;
        var halfX = 0.72 / cols;
        var halfY = 0.72 / rows;
        var cx = nx * (source.width - 1);
        var cy = ny * (source.height - 1);
        var max = 0;
        var sum = 0;
        var n = 0;
        for (var oy = -1; oy <= 1; oy++) {
          for (var ox = -1; ox <= 1; ox++) {
            var t = toneAt(source, cx + ox * halfX * source.width, cy + oy * halfY * source.height);
            if (t > max) max = t;
            if (t > 0.12) { sum += t; n++; }
          }
        }
        if (max < 0.22) continue;
        var tone = n ? sum / n : max;
        var glyph = Math.max(0, Math.min(7, Math.round(((tone - 0.12) / 0.48) * 7)));
        found.push(nx, ny, tone, nx < source.gap.split ? 0 : 1, glyph);
      }
    }
    return packFlat(found);
  }

  function sampleDepth(source) {
    var cols = 132;
    var rows = Math.max(12, Math.round(cols * source.height / source.width));
    var found = [];
    var row, col, nx, ny, tone;
    for (row = 0; row < rows; row++) {
      for (col = 0; col < cols; col++) {
        nx = (col + 0.5) / cols;
        ny = (row + 0.5) / rows;
        tone = cellTone(source, nx, ny, 0.5 / cols, 0.5 / rows);
        if (tone < 0.18) continue;
        found.push(nx, ny, tone, nx < source.gap.split ? 0 : 1, 0);
      }
    }
    var count = 56;
    for (var i = 0; i < count; i++) {
      var angle = (i / count) * Math.PI * 2 + (i % 3) * 0.15;
      var ring = 0.22 + (i % 4) * 0.12;
      var nxr = Math.cos(angle) * 0.012 * ring;
      var nyr = Math.sin(angle) * 0.012 * ring * (source.width / source.height);
      found.push(source.gap.x + nxr, source.gap.y + nyr, 1, 2, 0);
    }
    return packFlat(found);
  }

  function pack(found) {
    var count = found.length / 4;
    var bag = makeParticles(count);
    for (var i = 0; i < count; i++) {
      pushDot(bag, i, found[i * 4], found[i * 4 + 1], found[i * 4 + 2], found[i * 4 + 3], 0);
      bag.radius[i] = found[i * 4 + 2];
    }
    return bag;
  }

  function packFlat(found) {
    var count = found.length / 5;
    var bag = makeParticles(count);
    for (var i = 0; i < count; i++) {
      pushDot(bag, i, found[i * 5], found[i * 5 + 1], found[i * 5 + 2], found[i * 5 + 3], found[i * 5 + 4]);
      bag.radius[i] = found[i * 5 + 2];
    }
    return bag;
  }

  function mount(canvas) {
    var mode = canvas.getAttribute("data-mode");
    var parent = canvas.parentElement;
    var context = canvas.getContext("2d", { alpha: false });
    var particles = null;
    var source = null;
    var cssWidth = 0;
    var cssHeight = 0;
    var gapX = 0;
    var gapY = 0;
    var pointerX = 0;
    var pointerY = 0;
    var active = false;
    var pressed = false;
    var running = false;
    var raf = 0;
    var last = 0;
    var atlas = null;
    var seen = false;
    var workTimes = [];

    function layout() {
      var width = canvas.clientWidth;
      var height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var pixelWidth = Math.round(width * dpr);
      var pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      var scaleX = cssWidth > 0 ? width / cssWidth : 1;
      var scaleY = cssHeight > 0 ? height / cssHeight : 1;
      cssWidth = width;
      cssHeight = height;
      if (source) {
        gapX = source.gap.x * width;
        gapY = source.gap.y * height;
      }
      if (!particles) return;
      for (var i = 0; i < particles.n; i++) {
        var nextX = particles.nx[i] * width;
        var nextY = particles.ny[i] * height;
        if (mode === "depth" && particles.group[i] === 1) nextY += width * 0.004;
        if (!seen) {
          particles.x[i] = nextX;
          particles.y[i] = nextY;
        } else {
          particles.x[i] *= scaleX;
          particles.y[i] *= scaleY;
          particles.vx[i] *= scaleX;
          particles.vy[i] *= scaleY;
        }
        particles.baseX[i] = nextX;
        particles.baseY[i] = nextY;
      }
      if (!seen) seen = true;
      atlas = null;
      draw(0);
    }

    function step(dt) {
      var reach = Math.max(72, cssWidth * 0.24);
      var push = cssWidth * 0.09 * SPRING;
      var drift = 0;
      if (mode === "depth" && active) {
        var gdx = pointerX - gapX;
        var gdy = pointerY - gapY;
        var gapDist = Math.hypot(gdx, gdy);
        var gapReach = cssWidth * 0.3;
        if (gapDist < gapReach) drift = (1 - gapDist / gapReach) * cssWidth * 0.03;
      }
      var gentle = reduced() ? 0.22 : 1;
      for (var i = 0; i < particles.n; i++) {
        var hx = particles.baseX[i];
        var hy = particles.baseY[i];
        if (drift) {
          if (particles.group[i] === 0) hx += drift;
          else if (particles.group[i] === 1) hx -= drift;
        }
        var px = 0;
        var py = 0;
        if (active && gentle > 0) {
          var dx = particles.x[i] - pointerX;
          var dy = particles.y[i] - pointerY;
          var dist = Math.hypot(dx, dy);
          if (dist < reach && dist > 0.4) {
            var fall = 1 - dist / reach;
            var mag = push * fall * fall * gentle;
            px = (dx / dist) * mag;
            py = (dy / dist) * mag;
          }
        }
        var ax = (hx - particles.x[i]) * SPRING - particles.vx[i] * DAMP + px;
        var ay = (hy - particles.y[i]) * SPRING - particles.vy[i] * DAMP + py;
        particles.vx[i] += ax * dt;
        particles.vy[i] += ay * dt;
        particles.x[i] += particles.vx[i] * dt;
        particles.y[i] += particles.vy[i] * dt;
        if (mode === "ascii" && particles.flicker[i] > 0) {
          particles.flicker[i] -= dt;
        } else if (mode === "ascii" && !reduced() && Math.random() < dt * 0.08) {
          var glyph = particles.glyph[i];
          var next = glyph + (Math.random() < 0.5 ? -1 : 1);
          if (next < 0) next = 1;
          if (next > 7) next = 6;
          particles.flickerTo[i] = next;
          particles.flicker[i] = 0.22;
        }
      }
    }

    function radiusFor(i, time) {
      var pitch = cssWidth / (mode === "ascii" ? 58 : mode === "depth" ? 132 : mode === "contour" ? 200 : 168);
      var tone = particles.radius[i];
      var breathe = reduced() ? 0 : Math.sin(time * 0.95 + particles.phase[i]) * 0.045;
      if (mode === "halftone") return pitch * (0.28 + tone * 0.7) * (1 + breathe);
      if (mode === "contour") {
        var line = particles.glyph[i] === 1 ? 0.34 : 0.58;
        return Math.max(0.7, pitch * line);
      }
      if (mode === "depth") {
        if (particles.group[i] === 2) {
          var pulse = reduced() ? 1 : 1 + Math.sin(time * 2.6) * 0.32;
          return pitch * 0.95 * pulse;
        }
        var scale = particles.group[i] === 0 ? 1.05 : 0.58;
        return pitch * (0.3 + tone * 0.55) * scale;
      }
      return pitch * 0.4;
    }

    function ensureAtlas() {
      if (atlas) return atlas;
      var size = 64;
      var sheet = document.createElement("canvas");
      sheet.width = size * 8;
      sheet.height = size;
      var g = sheet.getContext("2d");
      g.fillStyle = BLUE;
      g.font = "600 " + Math.round(size * 0.68) + "px \"Cascadia Mono\", ui-monospace, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      for (var i = 0; i < RAMP.length; i++) {
        g.fillText(RAMP[i], size * i + size / 2, size * 0.54);
      }
      atlas = sheet;
      return atlas;
    }

    function draw(time) {
      if (!particles || cssWidth < 2) return;
      context.fillStyle = PAPER;
      context.fillRect(0, 0, cssWidth, cssHeight);
      if (mode === "ascii") {
        var sheet = ensureAtlas();
        var cell = cssWidth / 58;
        var glyphSize = cell * 0.98;
        for (var i = 0; i < particles.n; i++) {
          var glyph = particles.flicker[i] > 0 ? particles.flickerTo[i] : particles.glyph[i];
          context.drawImage(
            sheet,
            glyph * 64, 0, 64, 64,
            particles.x[i] - glyphSize / 2,
            particles.y[i] - glyphSize / 2,
            glyphSize,
            glyphSize
          );
        }
        return;
      }
      var amp = (mode === "contour" && !reduced()) ? Math.max(0.15, cssWidth * 0.0007) : 0;
      context.beginPath();
      context.fillStyle = BLUE;
      for (var i = 0; i < particles.n; i++) {
        if (particles.group[i] === 2) continue;
        var r = radiusFor(i, time);
        var jx = amp ? Math.sin(time * 2.1 + particles.phase[i]) * amp : 0;
        var jy = amp ? Math.cos(time * 1.7 + particles.phase[i] * 1.3) * amp : 0;
        var dx = particles.x[i] + jx;
        var dy = particles.y[i] + jy;
        context.moveTo(dx + r, dy);
        context.arc(dx, dy, r, 0, Math.PI * 2);
      }
      context.fill();
      if (mode === "depth") {
        context.beginPath();
        for (i = 0; i < particles.n; i++) {
          if (particles.group[i] !== 2) continue;
          r = radiusFor(i, time);
          context.moveTo(particles.x[i] + r, particles.y[i]);
          context.arc(particles.x[i], particles.y[i], r, 0, Math.PI * 2);
        }
        context.fillStyle = SPARK;
        context.globalAlpha = reduced() ? 1 : 0.72 + Math.sin(time * 2.6) * 0.28;
        context.fill();
        context.globalAlpha = 1;
      }
    }

    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min(0.032, (now - last) / 1000) : 0.016;
      last = now;
      var started = performance.now();
        if (!reduced()) step(dt);
      draw(now / 1000);
      var work = performance.now() - started;
      workTimes.push(work);
      if (workTimes.length > 40) workTimes.shift();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduced() || !particles) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function onPointer(event, down) {
      if (reduced()) return;
      var rect = canvas.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      if (down) pressed = true;
      if (event.pointerType === "mouse" || pressed) active = true;
    }

    canvas.addEventListener("pointerdown", function (event) {
      if (reduced()) return;
      canvas.setPointerCapture(event.pointerId);
      onPointer(event, true);
    });
    canvas.addEventListener("pointermove", function (event) {
      if (event.pointerType === "mouse" || pressed) onPointer(event, false);
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

    var observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start();
      else stop();
    }, { threshold: 0.08 });

    var resize = new ResizeObserver(function () { layout(); });
    resize.observe(parent);

    loadSource().then(function (loaded) {
      source = loaded;
      parent.style.aspectRatio = loaded.width + " / " + loaded.height;
      if (mode === "halftone") particles = sampleHalftone(loaded);
      else if (mode === "contour") particles = sampleContour(loaded);
      else if (mode === "ascii") particles = sampleAscii(loaded);
      else particles = sampleDepth(loaded);
      layout();
      draw(0);
      observer.observe(canvas);
      register(mode, function () {
        var farLeft = 0;
        var farRight = 0;
        var farLeftN = 0;
        var farRightN = 0;
        var shift = 0;
        var split = source.gap.split;
        for (var i = 0; i < particles.n; i++) {
          var dx = particles.x[i] - particles.baseX[i];
          shift += Math.abs(dx);
          if (particles.nx[i] < split - 0.16) { farLeft += dx; farLeftN++; }
          else if (particles.nx[i] > split + 0.16) { farRight += dx; farRightN++; }
        }
        return {
          count: particles.n,
          work: workTimes.slice(),
          gap: { x: gapX, y: gapY },
          width: cssWidth,
          height: cssHeight,
          shift: particles.n ? shift / particles.n : 0,
          farShift: [farLeftN ? farLeft / farLeftN : 0, farRightN ? farRight / farRightN : 0]
        };
      });
    }).catch(function () {
      canvas.setAttribute("aria-label", "The hands study could not be loaded.");
    });

    document.fonts.ready.then(function () {
      atlas = null;
      if (particles) draw(0);
    });

    if (reduceQuery.addEventListener) {
      reduceQuery.addEventListener("change", function () {
        if (reduced()) {
          stop();
          active = false;
          if (particles) {
            for (var i = 0; i < particles.n; i++) {
              particles.x[i] = particles.baseX[i];
              particles.y[i] = particles.baseY[i];
              particles.vx[i] = 0;
              particles.vy[i] = 0;
            }
            draw(0);
          }
        } else if (canvas.getBoundingClientRect().top < window.innerHeight) {
          start();
        }
      });
    }
  }

  var readers = {};
  function register(mode, read) {
    readers[mode] = read;
    window.__fig2 = window.__fig2 || {};
    window.__fig2[mode] = read;
    window.__fig2.ready = Object.keys(readers).length;
  }

  function boot() {
    var plates = document.querySelectorAll("canvas[data-mode]");
    for (var i = 0; i < plates.length; i++) mount(plates[i]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
