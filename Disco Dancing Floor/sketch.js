let video;
let bodyPose;
let poses = [];

// ---- 等高线 ----
let contourLayer;
let resolution = 12;
let baseLevels = 8;

// ---- 音频 ----
let song;
let fft;
let isAudioLoaded = false;
let smoothedEnergy = 0;

// ---- 舞台灯 ----
let stageLights = [];
let lightSource;

// ---- 每个人 ----
let peopleData = new Map();

const MAX_COMET_POINTS = 25;
const MAX_DIAMONDS_PER_PERSON = 18;

const COLORS = [
  { hue: 0 },
  { hue: 60 },
  { hue: 180 },
  { hue: 280 }
];

// ---- preload ----
function preload() {
  bodyPose = ml5.bodyPose();
  song = loadSound(
    'funky-disco-155292.mp3',
    () => isAudioLoaded = true,
    () => isAudioLoaded = false
  );
}

// ---- setup ----
function setup() {
  createCanvas(640, 480);
  pixelDensity(1);
  frameRate(30);

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  bodyPose.detectStart(video, res => poses = res);

  fft = new p5.FFT(0.8, 128);
  if (isAudioLoaded) {
    fft.setInput(song);
    song.amp(0.5);
  }

  contourLayer = createGraphics(width, height);

  lightSource = { x: width / 2, y: 0 };
  for (let i = 0; i < 3; i++) {
    stageLights.push({
      angle: random(TWO_PI),
      length: random(260, 360),
      width: random(80, 120),
      speed: random(0.01, 0.02),
      color: color(random(150,255), random(150,255), random(150,255))
    });
  }
}

// ---- 音频能量 ----
function getAudioEnergy() {
  let energy = 0;

  if (isAudioLoaded && song.isPlaying()) {
    let spectrum = fft.analyze();
    let bass = 0;
    for (let i = 0; i < 12; i++) bass += spectrum[i];
    energy = constrain((bass / 12 / 255) * 2.2, 0, 1);
  } else {
    energy = sin(frameCount * 0.02) * 0.3 + 0.3;
  }

  smoothedEnergy = lerp(smoothedEnergy, energy, 0.08);
  return smoothedEnergy;
}

// ---- 等高线 ----
function drawContoursIntoLayer(audioEnergy) {
  let g = contourLayer;
  g.clear();
  g.noFill();

  let dynamicLevels = floor(baseLevels * (0.7 + audioEnergy * 0.8));
  dynamicLevels = constrain(dynamicLevels, 5, 12);

  g.stroke(255);
  g.strokeWeight(1 + audioEnergy * 1.5);

  let freq = 1 + audioEnergy * 0.6;
  let t = frameCount * 0.005;

  for (let l = 0; l < dynamicLevels; l++) {
    let threshold = l / dynamicLevels;
    let offset = sin(t + l * 0.5) * audioEnergy * 0.18;
    let th = threshold + offset;

    for (let y = 0; y < height; y += resolution) {
      for (let x = 0; x < width; x += resolution) {
        let c = [
          getNoise(x, y, freq, t),
          getNoise(x + resolution, y, freq, t),
          getNoise(x + resolution, y + resolution, freq, t),
          getNoise(x, y + resolution, freq, t)
        ];
        drawContourSegmentToLayer(g, x, y, resolution, c, th);
      }
    }
  }
}

function getNoise(x, y, freq, t) {
  let n1 = noise(x * 0.003 * freq, y * 0.003 * freq, t);
  let n2 = noise((x + 80) * 0.006 * freq, (y + 120) * 0.006 * freq, t * 1.2);
  return n1 * 0.6 + n2 * 0.4;
}

function drawContourSegmentToLayer(g, x, y, s, c, th) {
  let p = [];
  if ((c[0] < th) !== (c[1] < th)) p.push({ x: x + s * ((th - c[0]) / (c[1] - c[0])), y });
  if ((c[1] < th) !== (c[2] < th)) p.push({ x: x + s, y: y + s * ((th - c[1]) / (c[2] - c[1])) });
  if ((c[2] < th) !== (c[3] < th)) p.push({ x: x + s * (1 - (th - c[2]) / (c[3] - c[2])), y: y + s });
  if ((c[3] < th) !== (c[0] < th)) p.push({ x, y: y + s * (1 - (th - c[3]) / (c[0] - c[3])) });
  if (p.length === 2) g.line(p[0].x, p[0].y, p[1].x, p[1].y);
}

// ---- 关键点 ----
function getKeypoint(pose, name) {
  let k = pose.keypoints.find(k => k.name === name);
  if (k && k.confidence > 0.3) return { x: width - k.x, y: k.y };
  return null;
}

function getBodyBox(pose) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let kp of pose.keypoints) {
    if (!kp || kp.confidence < 0.3) continue;
    let x = width - kp.x;
    let y = kp.y;
    minX = min(minX, x); maxX = max(maxX, x);
    minY = min(minY, y); maxY = max(maxY, y);
  }
  if (minX === Infinity) return null;
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX
  };
}

function getPoseId(pose) {
  let n = getKeypoint(pose, 'nose');
  if (!n) return null;
  return `${floor(n.x / 50)}_${floor(n.y / 50)}`;
}

// ---- 霓虹线 ----
function drawNeonLine(x1, y1, x2, y2, col) {
  push();
  blendMode(ADD);
  stroke(red(col), green(col), blue(col), 30);
  strokeWeight(26);
  line(x1, y1, x2, y2);
  stroke(red(col), green(col), blue(col), 90);
  strokeWeight(12);
  line(x1, y1, x2, y2);
  stroke(col);
  strokeWeight(4);
  line(x1, y1, x2, y2);
  blendMode(BLEND);
  pop();
}

// ---- 头部霓虹圈：亮度和手臂完全一致 ----
function drawNeonCircle(x, y, d, col) {
  let r = d * 0.9;

  push();
  blendMode(ADD);
  noFill();

  // 外圈 glow（和手臂同一组 alpha / 粗细）
  stroke(red(col), green(col), blue(col), 30);
  strokeWeight(26);
  circle(x, y, r);

  // 中间亮圈
  stroke(red(col), green(col), blue(col), 90);
  strokeWeight(12);
  circle(x, y, r);

  // 最内层细亮圈
  stroke(col);
  strokeWeight(4);
  circle(x, y, r * 0.9);

  blendMode(BLEND);
  pop();
}

// ---- 菱形 ----
function spawnFloatingDiamond(arr, cx, cy, bw, baseHue) {
  if (arr.length >= MAX_DIAMONDS_PER_PERSON) return;
  let a = random(TWO_PI);
  let d = random(bw * 0.6, bw * 1.2);
  arr.push({
    x: cx + cos(a) * d, y: cy + sin(a) * d,
    size: random(26, 46), angle: random(TWO_PI),
    rotSpeed: random(-0.02,0.02), floatSpeed: random(0.01,0.02),
    age: 0, max: int(random(100,160)),
    hue: baseHue + random(-30,30),
    oA: a, oD: d, cx, cy
  });
}

function drawFloatingDiamonds(arr) {
  push();
  colorMode(HSB,360,100,100,255);
  for (let i = arr.length - 1; i >= 0; i--) {
    let d = arr[i]; d.age++;
    if (d.age > d.max) { arr.splice(i,1); continue; }
    let t = d.age / d.max;
    d.oA += d.floatSpeed;
    d.x = d.cx + cos(d.oA) * d.oD;
    d.y = d.cy + sin(d.oA) * d.oD + sin(frameCount*0.02) * 3;
    d.angle += d.rotSpeed;
    let a = 200 * sin(t * PI);
    push();
    translate(d.x, d.y);
    rotate(d.angle);
    fill(d.hue,80,100,a*0.6);
    noStroke();
    quad(0,-d.size, d.size,0, 0,d.size, -d.size,0);
    pop();
  }
  pop();
}

// ---- 光轨 ----
function updateCometTrail(trail, pos) {
  if (!pos) return;
  if (!trail.length || dist(pos.x,pos.y,trail.at(-1).x,trail.at(-1).y) > 3)
    trail.push({ ...pos, time: frameCount });
  if (trail.length > MAX_COMET_POINTS) trail.shift();
}

function drawCometTrail(trail, hue) {
  if (trail.length < 2) return;

  push();
  blendMode(ADD);
  colorMode(HSB,360,100,100,255);

  for (let i = 1; i < trail.length; i++) {
    let p0 = trail[i - 1];
    let p1 = trail[i];
    let t = i / (trail.length - 1);
    let ageFade = 1 - constrain((frameCount - p1.time) / 40, 0, 0.7);

    let w = lerp(4, 20, t) * ageFade;
    let baseAlpha = lerp(40, 220, t) * ageFade;

    stroke(hue, 70, 90, baseAlpha * 0.3);
    strokeWeight(w * 2.0);
    line(p0.x, p0.y, p1.x, p1.y);

    stroke(hue, 90, 100, baseAlpha * 0.6);
    strokeWeight(w * 1.2);
    line(p0.x, p0.y, p1.x, p1.y);

    stroke(hue, 100, 100, baseAlpha);
    strokeWeight(w * 0.6);
    line(p0.x, p0.y, p1.x, p1.y);
  }

  blendMode(BLEND);
  colorMode(RGB,255);
  pop();
}

// ---- 骨架 ----
function drawPersonSkeleton(pose, col) {
  const pairs = [
    ['left_shoulder','left_elbow'],
    ['left_elbow','left_wrist'],
    ['right_shoulder','right_elbow'],
    ['right_elbow','right_wrist'],
    ['left_hip','left_knee'],
    ['left_knee','left_ankle'],
    ['right_hip','right_knee'],
    ['right_knee','right_ankle']
  ];
  pairs.forEach(([aName,bName])=>{
    let a = getKeypoint(pose,aName);
    let b = getKeypoint(pose,bName);
    if (a && b) drawNeonLine(a.x,a.y,b.x,b.y,col);
  });

  let nose = getKeypoint(pose,'nose');
  let sL = getKeypoint(pose,'left_shoulder');
  let sR = getKeypoint(pose,'right_shoulder');
  if (nose && sL && sR) {
    let r = dist(nose.x,nose.y,(sL.x+sR.x)/2,(sL.y+sR.y)/2) * 1.2;
    drawNeonCircle(nose.x,nose.y,r,col);
  }
}

// ---- 舞台灯 ----
function drawStageLights(energy) {
  stageLights.forEach(l=>{
    l.angle += l.speed * (1 + energy);
    fill(red(l.color), green(l.color), blue(l.color), 130);
    noStroke();
    push(); translate(lightSource.x,lightSource.y); rotate(l.angle);
    triangle(0,0,l.length,-l.width/2,l.length,l.width/2);
    pop();
  });
}

// ---- draw ----
function draw() {
  let hasPerson = poses.length > 0;

  if (isAudioLoaded) {
    if (hasPerson && !song.isPlaying()) song.loop();
    if (!hasPerson && song.isPlaying()) song.pause();
  }

  if (!hasPerson) {
    background(0);
    image(video,0,0,width,height);
    peopleData.clear();
    fill(255); textAlign(CENTER); textSize(22);
    text("请站在镜头前",width/2,height/2);
    return;
  }

  background(0);
  let energy = getAudioEnergy();

  drawStageLights(energy);

  if (frameCount % 4 === 0) drawContoursIntoLayer(energy);
  tint(255,map(energy,0,1,60,140));
  image(contourLayer,0,0);
  noTint();

  let now = new Set();

  poses.forEach((pose,i)=>{
    let id = getPoseId(pose);
    if (!id) return;
    now.add(id);

    if (!peopleData.has(id)) {
      peopleData.set(id,{
        diamonds:[],
        leftTrail:[],
        rightTrail:[],
        colorIndex: i % COLORS.length
      });
    }

    let d = peopleData.get(id);
    let hue = COLORS[d.colorIndex].hue;

    colorMode(HSB,360,100,100);
    let col = color((hue + frameCount*0.6)%360,100,100);
    colorMode(RGB);

    let box = getBodyBox(pose);
    if (box && frameCount % 18 === 0) {
      let n = energy > 0.6 ? 2 : 1;
      for (let k = 0; k < n; k++)
        spawnFloatingDiamond(d.diamonds,box.centerX,box.centerY,box.width,hue);
    }

    drawFloatingDiamonds(d.diamonds);

    let lw = getKeypoint(pose,'left_wrist');
    let rw = getKeypoint(pose,'right_wrist');
    updateCometTrail(d.leftTrail,lw);
    updateCometTrail(d.rightTrail,rw);

    drawPersonSkeleton(pose,col);
    drawCometTrail(d.leftTrail,hue);
    drawCometTrail(d.rightTrail,hue+180);
  });

  for (let id of peopleData.keys()) {
    if (!now.has(id)) peopleData.delete(id);
  }
}
