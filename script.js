const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
const speedValue = document.querySelector("#speedValue");
const comboValue = document.querySelector("#comboValue");
const whipButton = document.querySelector("#whipButton");
const resetButton = document.querySelector("#resetButton");
const logoUpload = document.querySelector("#logoUpload");
const logoBuffer = document.createElement("canvas");
const logoBufferCtx = logoBuffer.getContext("2d");
const logoBaseBuffer = document.createElement("canvas");
const logoBaseBufferCtx = logoBaseBuffer.getContext("2d");

const TAU = Math.PI * 2;
const DEFAULT_LOGO_SRC = "./assets/tes-logo-source-20200514.png";
const BGM_SRC = "./assets/bgm.m4a";
const TOP_VISUAL_RADIUS_SCALE = 1.55;
const LOGO_DRAW_TOP_SCALE = -0.92;
const LOGO_DRAW_SIZE_SCALE = 1.64;
const LOGO_VISIBLE_BOTTOM_RATIO = 424 / 480;
const TOP_VISUAL_BOTTOM_SCALE =
  TOP_VISUAL_RADIUS_SCALE *
  (LOGO_DRAW_TOP_SCALE + LOGO_DRAW_SIZE_SCALE * LOGO_VISIBLE_BOTTOM_RATIO);
const TOP_GROUND_GAP = 1;
const VISUAL_ROTATION_SCALE = 0.92;

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  time: 0,
  groundY: 0,
  combo: 0,
  comboTimer: 0,
  logoImage: null,
  logoReady: false,
  render: {
    logoBaseDirty: true,
    logoBaseRadius: 0,
    logoBaseSize: 0,
    turnFrameRadius: 0,
    turnFrameSize: 0,
    turnFrameSteps: 72,
    turnFrames: [],
  },
  pointer: {
    down: false,
    x: 0,
    y: 0,
    points: [],
  },
  whip: {
    auto: false,
    t: 1,
    points: [],
  },
  audio: {
    element: null,
    unlocked: false,
    spinThreshold: 0.75,
  },
  top: {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 88,
    angle: 0,
    spin: 0,
    visualSpin: 0,
    wobble: 0.04,
    lastHit: 0,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distance(a, b, c, d) {
  return Math.hypot(a - c, b - d);
}

function markLogoBaseDirty() {
  state.render.logoBaseDirty = true;
  state.render.turnFrameRadius = 0;
  state.render.turnFrameSize = 0;
  state.render.turnFrames = [];
}

function loadLogo(src) {
  state.logoReady = false;
  markLogoBaseDirty();
  const image = new Image();
  image.onload = () => {
    state.logoImage = image;
    state.logoReady = true;
    markLogoBaseDirty();
  };
  image.src = src;
}

function setupBgm() {
  const audio = new Audio(BGM_SRC);
  audio.preload = "auto";
  state.audio.element = audio;
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = rect.width;
  state.height = rect.height;
  canvas.width = Math.max(1, Math.floor(rect.width * state.dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * state.dpr));
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  state.groundY = state.height * 0.78;
  const nextRadius = clamp(Math.min(state.width, state.height) * 0.15, 64, 116);
  if (Math.abs(nextRadius - state.top.radius) > 0.5) {
    markLogoBaseDirty();
  }
  state.top.radius = nextRadius;

  if (!Number.isFinite(state.top.x) || state.top.x === 0) {
    placeTop();
  } else {
    keepTopOnStage();
  }
}

function placeTop() {
  state.top.x = state.width / 2;
  state.top.y = state.groundY - state.top.radius * TOP_VISUAL_BOTTOM_SCALE - TOP_GROUND_GAP;
}

function resetTop() {
  placeTop();
  Object.assign(state.top, {
    vx: 0,
    vy: 0,
    angle: -0.35,
    spin: 0,
    visualSpin: 0,
    wobble: 0.04,
  });
  state.combo = 0;
  state.comboTimer = 0;
  speedValue.value = "0";
  comboValue.value = "0";
}

function keepTopOnStage() {
  const top = state.top;
  const minX = top.radius * 0.75;
  const maxX = state.width - top.radius * 0.75;
  const floorY = state.groundY - top.radius * TOP_VISUAL_BOTTOM_SCALE - TOP_GROUND_GAP;
  const ceilingY = state.height * 0.34;

  if (top.x < minX || top.x > maxX) {
    top.x = clamp(top.x, minX, maxX);
    top.vx *= -0.56;
    top.spin *= 0.95;
  }

  if (top.y > floorY) {
    top.y = floorY;
    top.vy *= -0.08;
  }

  if (top.y < ceilingY) {
    top.y = ceilingY;
    top.vy *= -0.12;
  }
}

function applyHit(hitX, hitY, velocityX, velocityY, powerBoost = 1) {
  const top = state.top;
  const now = performance.now();
  const frontHitX = top.x;
  const frontHitY = top.y - top.radius * 0.02;
  const hitDistance = distance(hitX, hitY, frontHitX, frontHitY);

  if (hitDistance > top.radius * 1.12 || now - top.lastHit < 95) {
    return false;
  }

  top.lastHit = now;

  const speed = Math.hypot(velocityX, velocityY);
  const power = clamp((speed / 900) * powerBoost, 0.9, 6.2);
  const side = hitX < top.x ? 1 : -1;
  const tangent = Math.sign(velocityX || side) * side;

  top.spin += tangent * power * 4.5;
  top.spin = clamp(top.spin, -48, 48);
  top.vx += velocityX * 0.018 + side * power * 28;
  top.vy += velocityY * 0.003 - power * 6;
  top.vy = clamp(top.vy, -170, 520);
  top.wobble = clamp(top.wobble + power * 0.016, 0.035, 0.24);

  state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
  state.comboTimer = 2.2;
  comboValue.value = state.combo;
  return true;
}

function unlockBgmPlayback() {
  state.audio.unlocked = true;
  syncBgmWithSpin();
}

function syncBgmWithSpin() {
  const audio = state.audio.element;

  if (!audio || !state.audio.unlocked) {
    return;
  }

  if (audio.ended) {
    return;
  }

  if (Math.abs(state.top.spin) > state.audio.spinThreshold && audio.paused) {
    audio.play().catch(() => {
      // Browsers only allow audio after a user gesture; the next gesture will retry.
    });
  } else if (Math.abs(state.top.spin) <= state.audio.spinThreshold && !audio.paused) {
    audio.pause();
  }
}

function triggerAutoWhip() {
  unlockBgmPlayback();
  state.whip.auto = true;
  state.whip.t = 0;
  state.whip.points.length = 0;
}

function updateAutoWhip(dt) {
  const whip = state.whip;

  if (!whip.auto) {
    return;
  }

  whip.t += dt * 2.7;
  const t = clamp(whip.t, 0, 1);
  const top = state.top;
  const fromLeft = Math.sin(state.time * 0.9) > 0;
  const startX = fromLeft ? -40 : state.width + 40;
  const endX = top.x + (fromLeft ? -top.radius * 0.28 : top.radius * 0.28);
  const startY = state.groundY - top.radius * 1.18;
  const endY = top.y - top.radius * 0.04;
  const arc = Math.sin(t * Math.PI);
  const x = lerp(startX, endX, t) + (fromLeft ? 1 : -1) * Math.sin(t * 10) * 28 * arc;
  const y = lerp(startY, endY, t) - arc * state.height * 0.16;
  whip.points.push({ x, y, life: 0.36 });

  if (whip.points.length > 22) {
    whip.points.shift();
  }

  if (t > 0.6 && t < 0.78) {
    const vx = (endX - startX) * 5.4;
    const vy = (endY - startY) * 5.4;
    applyHit(x, y, vx, vy, 1.45);
  }

  if (t >= 1) {
    whip.auto = false;
  }
}

function update(dt) {
  state.time += dt;
  updateAutoWhip(dt);

  const top = state.top;
  top.x += top.vx * dt;
  top.y += top.vy * dt;
  top.vy += 1450 * dt;
  top.vx *= Math.exp(-dt * 1.25);
  top.vy *= Math.exp(-dt * 0.9);
  top.spin *= Math.exp(-dt * 0.095);
  const visualSpinEase = 1 - Math.exp(-dt * (Math.abs(top.spin) > Math.abs(top.visualSpin) ? 18 : 9));
  top.visualSpin = lerp(top.visualSpin, top.spin, visualSpinEase);
  if (Math.abs(top.visualSpin) < 0.005) {
    top.visualSpin = 0;
  }
  top.angle += top.visualSpin * dt * VISUAL_ROTATION_SCALE;
  top.angle %= TAU;
  top.wobble = Math.max(0.018, top.wobble * Math.exp(-dt * 1.25));

  syncBgmWithSpin();

  keepTopOnStage();

  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer === 0 && state.combo !== 0) {
    state.combo = 0;
    comboValue.value = "0";
  }

  state.pointer.points.forEach((point) => {
    point.life -= dt;
  });
  state.pointer.points = state.pointer.points.filter((point) => point.life > 0);

  state.whip.points.forEach((point) => {
    point.life -= dt;
  });
  state.whip.points = state.whip.points.filter((point) => point.life > 0);

  speedValue.value = Math.round(Math.abs(top.visualSpin) * 24);
}

function drawBackdrop() {
  const { width, height, groundY } = state;
  const wall = ctx.createLinearGradient(0, 0, 0, height);
  wall.addColorStop(0, "#181b24");
  wall.addColorStop(0.52, "#11141a");
  wall.addColorStop(1, "#08090d");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, width, height);

  const floor = ctx.createLinearGradient(0, groundY, 0, height);
  floor.addColorStop(0, "#20242d");
  floor.addColorStop(0.52, "#151821");
  floor.addColorStop(1, "#090a0d");
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(width, groundY);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(width, groundY);
  ctx.stroke();
}

function drawFallbackLogo(radius, targetCtx = ctx) {
  targetCtx.save();
  targetCtx.scale(radius / 160, radius / 160);
  targetCtx.fillStyle = "#ff392b";
  targetCtx.beginPath();
  targetCtx.moveTo(0, -140);
  targetCtx.lineTo(103, -74);
  targetCtx.lineTo(103, 14);
  targetCtx.lineTo(17, 138);
  targetCtx.lineTo(0, 150);
  targetCtx.lineTo(-17, 138);
  targetCtx.lineTo(-103, 14);
  targetCtx.lineTo(-103, -74);
  targetCtx.closePath();
  targetCtx.moveTo(-98, -52);
  targetCtx.lineTo(98, -52);
  targetCtx.lineTo(69, -31);
  targetCtx.lineTo(9, -31);
  targetCtx.lineTo(0, -22);
  targetCtx.lineTo(-9, -31);
  targetCtx.lineTo(-69, -31);
  targetCtx.closePath();
  targetCtx.moveTo(-17, -2);
  targetCtx.lineTo(0, 12);
  targetCtx.lineTo(17, -2);
  targetCtx.lineTo(17, 128);
  targetCtx.lineTo(0, 150);
  targetCtx.lineTo(-17, 128);
  targetCtx.closePath();
  targetCtx.fill("evenodd");
  targetCtx.restore();
}

function drawLogo(radius, targetCtx = ctx) {
  targetCtx.save();

  if (state.logoReady && state.logoImage) {
    targetCtx.drawImage(
      state.logoImage,
      -radius * 0.82,
      -radius * 0.92,
      radius * 1.64,
      radius * 1.64,
    );
  } else {
    drawFallbackLogo(radius * 0.82, targetCtx);
  }
  targetCtx.restore();
}

function ensureLogoBase(radius) {
  const bufferSize = Math.ceil(radius * 2.25);
  const needsRedraw =
    state.render.logoBaseDirty ||
    state.render.logoBaseSize !== bufferSize ||
    Math.abs(state.render.logoBaseRadius - radius) > 0.5;

  if (!needsRedraw) {
    return bufferSize;
  }

  logoBaseBuffer.width = bufferSize;
  logoBaseBuffer.height = bufferSize;
  logoBaseBufferCtx.imageSmoothingEnabled = true;
  logoBaseBufferCtx.imageSmoothingQuality = "high";
  logoBaseBufferCtx.clearRect(0, 0, bufferSize, bufferSize);
  logoBaseBufferCtx.save();
  logoBaseBufferCtx.translate(bufferSize / 2, bufferSize / 2);
  drawLogo(radius, logoBaseBufferCtx);
  logoBaseBufferCtx.restore();

  state.render.logoBaseDirty = false;
  state.render.logoBaseRadius = radius;
  state.render.logoBaseSize = bufferSize;
  return bufferSize;
}

function prepareLogoFrameBuffer(size) {
  if (logoBuffer.width !== size || logoBuffer.height !== size) {
    logoBuffer.width = size;
    logoBuffer.height = size;
    logoBufferCtx.imageSmoothingEnabled = true;
    logoBufferCtx.imageSmoothingQuality = "high";
    return;
  }

  logoBufferCtx.clearRect(0, 0, size, size);
}

function drawVerticalLens(targetCtx, x, y, width, height) {
  const halfW = width / 2;
  const halfH = height / 2;

  targetCtx.beginPath();
  targetCtx.moveTo(x, y - halfH);
  targetCtx.bezierCurveTo(x + halfW, y - halfH * 0.88, x + halfW, y + halfH * 0.88, x, y + halfH);
  targetCtx.bezierCurveTo(x - halfW, y + halfH * 0.88, x - halfW, y - halfH * 0.88, x, y - halfH);
  targetCtx.closePath();
}

function drawTurnFrameSide(targetCtx, radius, side, faceScale, edgeAmount, front) {
  if (edgeAmount < 0.04) {
    return;
  }

  const sideSign = Math.sign(side) || 1;
  const faceHalfWidth = radius * 0.82 * faceScale;
  const width = radius * (0.12 + edgeAmount * 0.3);
  const height = radius * (1.58 + edgeAmount * 0.14);
  const x = sideSign * (faceHalfWidth + width * 0.18);
  const gradient = targetCtx.createLinearGradient(x - width, 0, x + width, 0);

  gradient.addColorStop(0, front ? "#281014" : "#080a0f");
  gradient.addColorStop(0.26, sideSign > 0 ? "#ef453e" : "#168d9b");
  gradient.addColorStop(0.54, front ? "#252b34" : "#12161f");
  gradient.addColorStop(0.82, sideSign > 0 ? "#1ec8d7" : "#ef453e");
  gradient.addColorStop(1, "#06070b");

  targetCtx.save();
  targetCtx.globalAlpha = 0.58 + edgeAmount * 0.36;
  drawVerticalLens(targetCtx, x, 0, width, height);
  targetCtx.fillStyle = gradient;
  targetCtx.fill();
  targetCtx.lineWidth = Math.max(1, radius * 0.012);
  targetCtx.strokeStyle = front ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.12)";
  targetCtx.stroke();

  targetCtx.globalAlpha = 0.2 + edgeAmount * 0.32;
  targetCtx.strokeStyle = sideSign > 0 ? "rgba(255, 104, 90, 0.92)" : "rgba(61, 226, 235, 0.82)";
  targetCtx.lineWidth = Math.max(1, radius * 0.01);
  drawVerticalLens(targetCtx, x + sideSign * width * 0.16, 0, width * 0.34, height * 0.92);
  targetCtx.stroke();
  targetCtx.restore();
}

function drawTurnFrameFace(targetCtx, radius, baseSize, angle, faceScale, faceShiftX, front) {
  const turn = Math.cos(angle);
  const side = Math.sin(angle);
  const faceAmount = Math.abs(turn);
  const turnAmount = 1 - faceAmount;
  const sideShade = Math.max(0, side);
  const frontShade = front ? 0 : 0.5;
  const shadeStrength = 0.12 + turnAmount * 0.42 + frontShade * 0.46;

  prepareLogoFrameBuffer(baseSize);
  logoBufferCtx.save();
  logoBufferCtx.drawImage(logoBaseBuffer, 0, 0);
  logoBufferCtx.translate(baseSize / 2, baseSize / 2);

  if (shadeStrength > 0) {
    const shade = logoBufferCtx.createLinearGradient(-radius, 0, radius, 0);
    const edgeShade = turnAmount * shadeStrength * 0.22;
    const leftDark = edgeShade + sideShade * shadeStrength * 0.66 + frontShade * 0.38;
    const rightDark = edgeShade + Math.max(0, -side) * shadeStrength * 0.66 + frontShade * 0.38;
    const highlight = clamp(0.5 + side * 0.24, 0.2, 0.8);

    shade.addColorStop(0, `rgba(0, 0, 0, ${leftDark})`);
    shade.addColorStop(Math.max(0.08, highlight - 0.14), "rgba(0, 0, 0, 0)");
    shade.addColorStop(
      highlight,
      front
        ? `rgba(255, 106, 87, ${shadeStrength * 0.46})`
        : `rgba(40, 224, 232, ${shadeStrength * 0.22})`,
    );
    shade.addColorStop(Math.min(0.92, highlight + 0.14), "rgba(0, 0, 0, 0)");
    shade.addColorStop(1, `rgba(0, 0, 0, ${rightDark})`);

    logoBufferCtx.globalCompositeOperation = "source-atop";
    logoBufferCtx.fillStyle = shade;
    logoBufferCtx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }

  logoBufferCtx.restore();

  targetCtx.save();
  targetCtx.translate(faceShiftX, 0);
  targetCtx.scale(front ? faceScale : -faceScale, 1);
  targetCtx.drawImage(logoBuffer, -baseSize / 2, -baseSize / 2);
  targetCtx.restore();
}

function createTurnFrame(radius, frameSize, angle, baseSize) {
  const frame = document.createElement("canvas");
  const frameCtx = frame.getContext("2d");
  const turn = Math.cos(angle);
  const side = Math.sin(angle);
  const faceAmount = Math.abs(turn);
  const edgeAmount = 1 - faceAmount;
  const front = turn >= 0;
  const faceScale = clamp(0.07 + Math.pow(faceAmount, 0.78) * 0.93, 0.07, 1);
  const faceShiftX = side * radius * 0.11 * edgeAmount;

  frame.width = frameSize;
  frame.height = frameSize;
  frameCtx.imageSmoothingEnabled = true;
  frameCtx.imageSmoothingQuality = "high";
  frameCtx.translate(frameSize / 2, frameSize / 2);

  drawTurnFrameSide(frameCtx, radius, side, faceScale, edgeAmount, front);
  drawTurnFrameFace(frameCtx, radius, baseSize, angle, faceScale, faceShiftX, front);

  if (edgeAmount > 0.08) {
    const sideSign = Math.sign(side) || 1;
    const rimX = faceShiftX + sideSign * radius * 0.82 * faceScale;

    frameCtx.save();
    frameCtx.globalAlpha = 0.18 + edgeAmount * 0.34;
    frameCtx.strokeStyle = sideSign > 0 ? "rgba(255, 226, 218, 0.75)" : "rgba(170, 248, 255, 0.7)";
    frameCtx.lineWidth = Math.max(1, radius * 0.012);
    drawVerticalLens(frameCtx, rimX, 0, radius * 0.05, radius * 1.5);
    frameCtx.stroke();
    frameCtx.restore();
  }

  return {
    canvas: frame,
    size: frameSize,
  };
}

function ensureTurnFrame(radius, angle) {
  const baseSize = ensureLogoBase(radius);
  const frameSize = Math.ceil(radius * 2.7);
  const render = state.render;

  if (
    Math.abs(render.turnFrameRadius - radius) > 0.5 ||
    render.turnFrameSize !== frameSize ||
    render.turnFrames.length !== render.turnFrameSteps
  ) {
    render.turnFrameRadius = radius;
    render.turnFrameSize = frameSize;
    render.turnFrames = new Array(render.turnFrameSteps);
  }

  const normalized = ((angle % TAU) + TAU) % TAU;
  const index = Math.round((normalized / TAU) * render.turnFrameSteps) % render.turnFrameSteps;

  if (!render.turnFrames[index]) {
    render.turnFrames[index] = createTurnFrame(
      radius,
      frameSize,
      (index / render.turnFrameSteps) * TAU,
      baseSize,
    );
  }

  return render.turnFrames[index];
}

function drawLogoTurnFrame(radius, angle, alpha) {
  const frame = ensureTurnFrame(radius, angle);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(frame.canvas, -frame.size / 2, -frame.size / 2);
  ctx.restore();
}

function drawSpinningLogo(radius, spinRatio) {
  const visualSpin = state.top.visualSpin;
  const direction = Math.sign(visualSpin || state.top.spin) || 1;
  const blurSpan = clamp(Math.abs(visualSpin) * 0.011, 0.05, 0.58);
  const samples = spinRatio > 0.78 ? 7 : spinRatio > 0.44 ? 5 : spinRatio > 0.18 ? 3 : 1;

  if (spinRatio > 0.12) {
    const center = (samples - 1) / 2;

    for (let i = 0; i < samples; i += 1) {
      const offsetIndex = i - center;

      if (offsetIndex === 0) {
        continue;
      }

      const distanceFromCenter = Math.abs(offsetIndex) / center;
      const offset = direction * offsetIndex * (blurSpan / center);
      const alpha = spinRatio * 0.12 * (1 - distanceFromCenter * 0.48);
      drawLogoTurnFrame(radius, state.top.angle + offset, alpha);
    }
  }

  drawLogoTurnFrame(radius, state.top.angle, 1);
}

function drawWhip(points, baseColor = "#b27342") {
  if (points.length < 2) {
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      const previous = points[index - 1];
      const cx = (previous.x + point.x) / 2;
      const cy = (previous.y + point.y) / 2;
      ctx.quadraticCurveTo(previous.x, previous.y, cx, cy);
    }
  });
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.64)";
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      const previous = points[index - 1];
      const cx = (previous.x + point.x) / 2;
      const cy = (previous.y + point.y) / 2;
      ctx.quadraticCurveTo(previous.x, previous.y, cx, cy);
    }
  });
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = baseColor;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.restore();
}

function drawTop() {
  const top = state.top;
  const radius = top.radius;
  const spinRatio = clamp(Math.abs(top.visualSpin) / 48, 0, 1);
  const motionRatio = clamp(Math.abs(top.visualSpin) / 3, 0, 1);
  const stability = 1 - spinRatio;
  const wobbleAmount = top.wobble * motionRatio * (0.06 + stability * stability * 0.54);
  const wobble = Math.sin(state.time * 10 + top.angle * 0.55) * wobbleAmount;

  ctx.save();
  ctx.translate(top.x, state.groundY + 3);
  ctx.scale(0.82 + spinRatio * 0.2, 0.11);
  const shadow = ctx.createRadialGradient(0, 0, 5, 0, 0, radius * 1.36);
  shadow.addColorStop(0, "rgba(0,0,0,0.48)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.12, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(top.x, top.y);
  ctx.rotate(wobble);

  drawSpinningLogo(radius * TOP_VISUAL_RADIUS_SCALE, spinRatio);

  ctx.restore();
}

function draw() {
  drawBackdrop();
  drawWhip(state.whip.points, "#c08b51");
  drawWhip(state.pointer.points, "#b27342");
  drawTop();
}

let previous = performance.now();
const MAX_FRAME_DT = 0.05;
const SIMULATION_STEP = 1 / 90;

function frame(now) {
  let remaining = Math.min(MAX_FRAME_DT, (now - previous) / 1000);
  previous = now;

  while (remaining > 0) {
    const step = Math.min(remaining, SIMULATION_STEP);
    update(step);
    remaining -= step;
  }

  draw();
  requestAnimationFrame(frame);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

canvas.addEventListener("pointerdown", (event) => {
  unlockBgmPlayback();
  canvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  state.pointer.down = true;
  state.pointer.x = point.x;
  state.pointer.y = point.y;
  state.pointer.points = [{ x: point.x, y: point.y, life: 0.36 }];
});

canvas.addEventListener("pointermove", (event) => {
  const point = canvasPoint(event);
  const pointer = state.pointer;

  if (!pointer.down) {
    return;
  }

  const movementX = point.x - pointer.x;
  const movementY = point.y - pointer.y;
  const speed = Math.hypot(movementX, movementY) * 60;
  pointer.x = point.x;
  pointer.y = point.y;
  pointer.points.push({ x: point.x, y: point.y, life: 0.36 });

  if (pointer.points.length > 22) {
    pointer.points.shift();
  }

  if (speed > 430) {
    applyHit(point.x, point.y, movementX * 60, movementY * 60);
  }
});

canvas.addEventListener("pointerup", (event) => {
  state.pointer.down = false;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("pointercancel", () => {
  state.pointer.down = false;
});

whipButton.addEventListener("click", triggerAutoWhip);
resetButton.addEventListener("click", () => {
  unlockBgmPlayback();
  resetTop();
});

logoUpload.addEventListener("change", () => {
  const file = logoUpload.files?.[0];
  if (!file) {
    return;
  }

  const image = new Image();
  const url = URL.createObjectURL(file);
  image.onload = () => {
    URL.revokeObjectURL(url);
    state.logoImage = image;
    state.logoReady = true;
    markLogoBaseDirty();
  };
  image.src = url;
});

window.addEventListener("resize", resize);

loadLogo(DEFAULT_LOGO_SRC);
setupBgm();
resize();
resetTop();
requestAnimationFrame(frame);
