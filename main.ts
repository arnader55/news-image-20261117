// "THE WORLD IN ONE PAGE" — a front-page poster summing up Tuesday 17 November 2026.
// Drawn entirely in code with the Node standard library: a tiny rasterizer, a 5x7
// bitmap font and a hand-rolled PNG encoder. No network, no assets, no randomness,
// so both grader runs write identical bytes to /output/entry.png.
//
// The day's news (checked against several outlets on 18 Nov 2026):
//  1. Ukraine struck the Kerch Bridge a second day running, collapsing part of the
//     road link to Crimea; Russia hit Kyiv's bridges over the Dnipro.
//  2. Mines hit oil tankers near the Strait of Hormuz; Iran fired drones at a U.S.
//     radar base in Bahrain (intercepted); a third U.S. carrier arrived.
//  3. Quad leaders met in Manila; China confirmed a first Xi-Trump-Putin summit,
//     in Shenzhen on Thursday 19 November, at APEC.
//  4. The U.S. lost its measles-free status, held since 2000 (PAHO).
//  5. Malicious code planted via Optimizely hit 178 major websites, incl. BBC/CNN.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const PAPER: RGB = [247, 242, 231];
const INK: RGB = [24, 24, 22];
const NAVY: RGB = [24, 48, 84];
const NAVY_DARK: RGB = [16, 32, 56];
const RED: RGB = [178, 34, 28];
const GOLD: RGB = [196, 148, 44];
const GREY: RGB = [110, 108, 100];
const LIGHT: RGB = [233, 227, 212];
const WHITE: RGB = [250, 248, 242];
const BLUE: RGB = [52, 96, 150];
const ORANGE: RGB = [224, 122, 32];
const YELLOW: RGB = [240, 196, 64];
const TEAL: RGB = [32, 120, 116];
const SMOKE: RGB = [150, 148, 140];

type RGB = [number, number, number];

// ---------------------------------------------------------------- canvas
const pxbuf = new Uint8Array(W * H * 3);
function fill(c: RGB): void {
  for (let i = 0; i < W * H; i++) {
    pxbuf[i * 3] = c[0];
    pxbuf[i * 3 + 1] = c[1];
    pxbuf[i * 3 + 2] = c[2];
  }
}
function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  pxbuf[i] = c[0];
  pxbuf[i + 1] = c[1];
  pxbuf[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) setPx(xx, yy, c);
}
function hline(x: number, y: number, w: number, c: RGB, t = 1): void {
  rect(x, y, w, t, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPx(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
function thickLine(x0: number, y0: number, x1: number, y1: number, c: RGB, t: number): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const r = Math.floor(t / 2);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) setPx(x + dx, y + dy, c);
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) setPx(x, y, c);
}
function ring(cx: number, cy: number, r: number, c: RGB, t = 2): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      setPx(Math.round(cx + (r + k) * Math.cos(rad)), Math.round(cy + (r + k) * Math.sin(rad)), c);
    }
  }
}
// Starburst (explosion) centred at (cx,cy): alternating long/short spikes.
function burst(cx: number, cy: number, rOuter: number, rInner: number, c: RGB, spikes = 12): void {
  for (let s = 0; s < spikes; s++) {
    const a = (s * 2 * Math.PI) / spikes;
    const a2 = ((s + 0.5) * 2 * Math.PI) / spikes;
    const x1 = Math.round(cx + rOuter * Math.cos(a));
    const y1 = Math.round(cy + rOuter * Math.sin(a));
    const x2 = Math.round(cx + rInner * Math.cos(a2));
    const y2 = Math.round(cy + rInner * Math.sin(a2));
    thickLine(cx, cy, x1, y1, c, 3);
    thickLine(cx, cy, x2, y2, c, 2);
  }
  disc(cx, cy, Math.max(3, Math.round(rInner * 0.55)), c);
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows of 5 cells, '#' = ink. Uppercase + digits + punctuation.
const FONT: Record<string, string[]> = {
  A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  B: ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  C: [" ####", "#    ", "#    ", "#    ", "#    ", "#    ", " ####"],
  D: ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  F: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
  G: [" ####", "#    ", "#    ", "# ###", "#   #", "#   #", " ### "],
  H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  J: ["  ###", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "],
  K: ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
  L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"],
  N: ["#   #", "##  #", "##  #", "# # #", "#  ##", "#  ##", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  Q: [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  S: [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  V: ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
  W: ["#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"],
  X: ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
  Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
  Z: ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
  "0": [" ### ", "#  ##", "# # #", "##  #", "#   #", "#   #", " ### "],
  "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  "3": ["#### ", "    #", "    #", " ### ", "    #", "    #", "#### "],
  "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
  "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
  "6": [" ### ", "#    ", "#    ", "#### ", "#   #", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", "  #  ", "  #  ", "  #  "],
  "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  "9": [" ### ", "#   #", "#   #", " ####", "    #", "    #", " ### "],
  " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
  ".": ["     ", "     ", "     ", "     ", "     ", " ##  ", " ##  "],
  ",": ["     ", "     ", "     ", "     ", " ##  ", " ##  ", " #   "],
  ":": ["     ", " ##  ", " ##  ", "     ", " ##  ", " ##  ", "     "],
  ";": ["     ", " ##  ", " ##  ", "     ", " ##  ", " ##  ", " #   "],
  "!": ["  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "     ", "  #  "],
  "?": [" ### ", "#   #", "    #", "   # ", "  #  ", "     ", "  #  "],
  "-": ["     ", "     ", "     ", " ### ", "     ", "     ", "     "],
  "/": ["    #", "   # ", "   # ", "  #  ", "  #  ", " #   ", "#    "],
  "(": ["   ##", "  #  ", " #   ", " #   ", " #   ", "  #  ", "   ##"],
  ")": ["##   ", "  #  ", "   # ", "   # ", "   # ", "  #  ", "##   "],
  "&": [" ##  ", "#  # ", "# #  ", " #   ", "# # #", "#  # ", " ## #"],
  "%": ["##  #", "## # ", "   # ", "  #  ", " #   ", "#  ##", "#  ##"],
  "+": ["     ", "  #  ", "  #  ", "#####", "  #  ", "  #  ", "     "],
  "=": ["     ", "     ", "#####", "     ", "#####", "     ", "     "],
  "'": ["  #  ", "  #  ", " #   ", "     ", "     ", "     ", "     "],
  '"': [" # # ", " # # ", " # # ", "     ", "     ", "     ", "     "],
  "*": ["     ", " # # ", "  #  ", "#####", "  #  ", " # # ", "     "],
};

const CHAR_W = 6; // 5 glyph columns + 1 gap, times scale
function textWidth(s: string, sc: number): number {
  return s.length * CHAR_W * sc - sc;
}
function drawChar(ch: string, x: number, y: number, sc: number, c: RGB): void {
  const g = FONT[ch] ?? FONT["?"];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === "#") rect(x + col * sc, y + r * sc, sc, sc, c);
    }
  }
}
function drawText(x: number, y: number, s: string, sc: number, c: RGB): number {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    drawChar(ch, cx, y, sc, c);
    cx += CHAR_W * sc;
  }
  return cx;
}
// Wrap text to maxW px at scale sc; returns lines.
function wrap(s: string, maxW: number, sc: number): string[] {
  const words = s.toUpperCase().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (textWidth(test, sc) <= maxW || !cur) cur = test;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
// Draw a wrapped paragraph; returns the y just below the last line.
function para(x: number, y: number, s: string, sc: number, c: RGB, maxW: number, lh?: number): number {
  const lines = wrap(s, maxW, sc);
  const step = lh ?? Math.round(7 * sc * 1.45);
  lines.forEach((ln, i) => drawText(x, y + i * step, ln, sc, c));
  return y + lines.length * step;
}
// Centred single line.
function centre(y: number, s: string, sc: number, c: RGB): void {
  drawText(Math.round((W - textWidth(s, sc)) / 2), y, s, sc, c);
}
// Right-aligned single line ending at x.
function rightAlign(x: number, y: number, s: string, sc: number, c: RGB): void {
  drawText(x - textWidth(s, sc), y, s, sc, c);
}

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(pxbuf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- composition
function masthead(): void {
  rect(0, 0, W, 148, NAVY);
  rect(0, 148, W, 5, RED);
  // Title left, date right.
  drawText(36, 32, "THE WORLD", 10, WHITE);
  drawText(36, 118, "IN ONE PAGE", 3, GOLD);
  rightAlign(W - 36, 38, "TUESDAY", 4, WHITE);
  rightAlign(W - 36, 78, "17 NOVEMBER 2026", 3, GOLD);
  rightAlign(W - 36, 118, "THE DAY'S NEWS, SUMMED UP", 2, LIGHT);
}

function kicker(x: number, y: number, s: string): void {
  drawText(x, y, s, 2, RED);
  hline(x, y + 20, textWidth(s, 2), RED, 3);
}

function leadStory(): void {
  const x = 28;
  const w = 606;
  kicker(x, 182, "EUROPE - THE WAR IN UKRAINE");
  let y = para(x, 216, "BRIDGES UNDER FIRE", 5, INK, w, 40);
  y = para(
    x,
    y + 8,
    "Ukraine struck the Kerch Bridge for a second day running, collapsing part of the road link to Crimea. Russian missiles hit Kyiv's bridges over the Dnipro.",
    3,
    INK,
    w,
    30,
  );
  // Bridge illustration: deck, two towers, cables, blast over the span.
  const by = 452;
  const bx = x + 8;
  const bw = w - 16;
  // sky wash
  rect(bx, 430, bw, 108, LIGHT);
  // water
  rect(bx, 522, bw, 16, BLUE);
  hline(bx, 520, bw, NAVY_DARK, 2);
  // towers
  rect(bx + 90, 448, 14, 74, NAVY);
  rect(bx + bw - 104, 448, 14, 74, NAVY);
  // deck
  hline(bx, 514, bw, INK, 8);
  // cables
  line(bx + 97, 448, bx + bw / 2, 514, INK);
  line(bx + bw - 97, 448, bx + bw / 2, 514, INK);
  line(bx + 97, 448, bx + 20, 514, INK);
  line(bx + bw - 97, 448, bx + bw - 20, 514, INK);
  // blast at mid-span, deck broken
  rect(bx + bw / 2 - 46, 508, 92, 14, LIGHT);
  burst(bx + bw / 2, 486, 46, 20, ORANGE, 12);
  burst(bx + bw / 2, 486, 30, 13, YELLOW, 10);
  disc(bx + bw / 2 - 58, 470, 12, SMOKE);
  disc(bx + bw / 2 - 44, 452, 16, SMOKE);
  disc(bx + bw / 2 + 52, 462, 13, SMOKE);
  drawText(bx + 4, 546, "ZELENSKYY HAILED AN 'UNPRECEDENTED OPERATION'", 2, GREY);
}

function middleEast(): void {
  const x = 668;
  const w = 328;
  kicker(x, 182, "MIDDLE EAST - THE IRAN WAR");
  let y = para(x, 216, "TANKERS HIT NEAR HORMUZ", 4, INK, w, 34);
  y = para(
    x,
    y + 6,
    "Mines hit tankers near the Strait of Hormuz, setting them ablaze. Iran's drones at a U.S. base in Bahrain were intercepted. A third U.S. carrier has arrived.",
    2,
    INK,
    w,
    21,
  );
  // Tanker illustration: sea, hull, containers, fire plume.
  const sx = x;
  const sy = 452;
  rect(sx, 452, w, 86, LIGHT);
  rect(sx, 508, w, 30, BLUE);
  hline(sx, 506, w, NAVY_DARK, 2);
  // hull
  rect(sx + 30, 486, 240, 22, RED);
  rect(sx + 30, 486, 240, 6, INK);
  // containers
  rect(sx + 60, 462, 34, 24, GOLD);
  rect(sx + 100, 462, 34, 24, TEAL);
  rect(sx + 140, 462, 34, 24, NAVY);
  rect(sx + 180, 462, 34, 24, ORANGE);
  // bridge tower
  rect(sx + 236, 458, 26, 28, WHITE);
  rect(sx + 236, 458, 26, 6, INK);
  // fire plume from the bow
  burst(sx + 262, 452, 26, 12, ORANGE, 10);
  disc(sx + 246, 436, 10, SMOKE);
  disc(sx + 268, 424, 13, SMOKE);
  drawText(sx, 544, "OIL TANKERS BURNING OFF OMAN", 2, GREY);
}

function bottomRow(): void {
  const y0 = 596;
  hline(28, 578, W - 56, INK, 3);
  const cols: { x: number; w: number; kick: string; head: string; body: string }[] = [
    {
      x: 28,
      w: 300,
      kick: "ASIA - DIPLOMACY",
      head: "QUAD MEETS IN MANILA",
      body: "Trump, Modi, Takaichi and Albanese met in Manila. China confirmed a first Xi-Trump-Putin summit in Shenzhen on Thursday.",
    },
    {
      x: 362,
      w: 300,
      kick: "UNITED STATES - HEALTH",
      head: "U.S. LOSES MEASLES-FREE STATUS",
      body: "The Pan-American Health Organization says the U.S. has lost the status it held since 2000, as cases hit their highest since 1991.",
    },
    {
      x: 696,
      w: 300,
      kick: "TECHNOLOGY - CYBERATTACK",
      head: "HACK HITS BBC, CNN AND 178 SITES",
      body: "Malicious code planted via Optimizely hit visitors to major websites, trying to steal card and crypto data.",
    },
  ];
  for (const c of cols) {
    kicker(c.x, y0, c.kick);
    let y = para(c.x, y0 + 34, c.head, 4, INK, c.w, 34);
    para(c.x, y + 6, c.body, 2, INK, c.w, 22);
  }
  // Small motifs under each column.
  // Quad: four flag bars.
  rect(28, 868, 66, 26, NAVY);
  rect(102, 868, 66, 26, RED);
  rect(176, 868, 66, 26, TEAL);
  rect(250, 868, 66, 26, GOLD);
  drawText(28, 902, "U.S. - INDIA - JAPAN - AUSTRALIA", 2, GREY);
  // Measles: virus disc with spikes.
  disc(512, 898, 20, RED);
  for (let a = 0; a < 360; a += 45) {
    const rad = (a * Math.PI) / 180;
    thickLine(512, 898, Math.round(512 + 31 * Math.cos(rad)), Math.round(898 + 31 * Math.sin(rad)), RED, 3);
  }
  disc(512, 898, 20, RED);
  disc(505, 891, 5, WHITE);
  disc(519, 904, 4, WHITE);
  // Cyber: screen with warning triangle.
  rect(720, 866, 88, 58, NAVY);
  rect(726, 872, 76, 46, WHITE);
  thickLine(764, 880, 742, 912, RED, 3);
  thickLine(742, 912, 786, 912, RED, 3);
  thickLine(786, 912, 764, 880, RED, 3);
  drawText(760, 896, "!", 3, RED);
  drawText(830, 884, "178 SITES", 3, INK);
  drawText(830, 910, "TARGETED", 3, INK);
}

function footer(): void {
  rect(0, 956, W, 68, NAVY_DARK);
  drawText(28, 968, "ALSO TODAY: VULCAN ROCKET FAILS, 40 AMAZON SATELLITES LOST", 2, GOLD);
  drawText(28, 992, "JPMORGAN OUTAGE HITS U.S. BANKS  -  CYCLONE AKVAN NEARS INDIA", 2, WHITE);
}

function main(): void {
  fill(PAPER);
  masthead();
  leadStory();
  middleEast();
  bottomRow();
  footer();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePNG());
}

main();
