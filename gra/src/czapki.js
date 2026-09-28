/* Czapki za osiągnięcia (4.7.1): Korona Króla GOATów za zdobycie WSZYSTKICH osiągnięć
   (osiagniecie: '*') i trzy czapki za pojedyncze osiągnięcia. Bez osiągnięcia czapka jest
   zablokowana (w panelu kłódka, serwer też jej nie przyjmie).

   Ten sam kształt co w akcesoria.js: rysuj(ctx, cx, cy, f, t) — cx, cy = środek ciała
   robala (elipsa 8×10, oczy na cy − 4 po stronie f), f = zwrot, t = czas w s.
   zaGlowa(…) — część za ciałem (np. promienie). wys — o ile czapka sięga wyżej niż zwykła
   (render podnosi pasek życia i nick). Sama grafika: wolno trygonometrię.
   Lista id i osiągnięć musi się zgadzać z CZAPKI w serwer/konta.js (test serwera). */

const kolo = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); };
const pion = (ctx, y0, y1, a, b) => {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
};
const poziom = (ctx, x0, x1, kolory) => {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  kolory.forEach((k, i) => g.addColorStop(i / (kolory.length - 1), k));
  return g;
};

/* Długi, wygięty w górę i na zewnątrz róg kozła (złoty), s = strona (-1/1). */
function rogKrola(ctx, cx, y, s) {
  const bx = cx + s * 5.5, by = y - 2;
  const tx = cx + s * 16, ty = y - 21;
  ctx.fillStyle = pion(ctx, ty, by, '#fff6c9', '#b8860b');
  ctx.strokeStyle = '#6b4a00';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(bx - s * 2.8, by);
  ctx.quadraticCurveTo(bx - s * 1, by - 17, tx, ty);
  ctx.quadraticCurveTo(bx + s * 4.5, by - 10, bx + s * 3, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // prążki wzdłuż rogu
  ctx.strokeStyle = 'rgba(107, 74, 0, 0.55)';
  ctx.lineWidth = 0.6;
  for (let k = 1; k <= 5; k++) {
    const u = k / 6;
    const px = bx + (tx - bx) * u * u + s * 0.8 * (1 - u), py = by + (ty - by) * u;
    ctx.beginPath();
    ctx.moveTo(px - s * 2 * (1 - u * 0.7), py + 0.6);
    ctx.lineTo(px + s * 1.6 * (1 - u * 0.7), py - 0.8);
    ctx.stroke();
  }
}

/* Róg kozła: gruby u nasady, wyrasta w górę i łukiem zagina się do tyłu (jak u koziorożca),
   z poprzecznymi prążkami. Oś to krzywa Béziera; obrys = oś przesunięta o grubość w obie strony.
   (x, y) = nasada na czubku głowy, f = zwrot robala (róg idzie do tyłu, czyli w stronę −f). */
function rogKozy(ctx, x, y, f, sk, blizszy) {
  const P = [[0, 0], [f * 3.2, -9], [-f * 3.5, -19.5], [-f * 12.5, -17.5]].map(([a, b]) => [x + a * sk, y + b * sk]);
  const punkt = (u) => {
    const v = 1 - u;
    return [
      v * v * v * P[0][0] + 3 * v * v * u * P[1][0] + 3 * v * u * u * P[2][0] + u * u * u * P[3][0],
      v * v * v * P[0][1] + 3 * v * v * u * P[1][1] + 3 * v * u * u * P[2][1] + u * u * u * P[3][1]
    ];
  };
  const N = 18, lewa = [], prawa = [], os = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const [px, py] = punkt(u);
    const [qx, qy] = punkt(Math.min(1, u + 0.02));
    const [rx, ry] = punkt(Math.max(0, u - 0.02));
    let tx = qx - rx, ty = qy - ry;
    const d = Math.hypot(tx, ty) || 1;
    tx /= d; ty /= d;
    const gr = (2.9 * (1 - u) + 0.35) * sk;        // grubość: od nasady do ostrego końca
    lewa.push([px - ty * gr, py + tx * gr]);
    prawa.push([px + ty * gr, py - tx * gr]);
    os.push([px, py, tx, ty, gr]);
  }
  const g = ctx.createLinearGradient(P[0][0], P[0][1], P[3][0], P[3][1]);
  if (blizszy) { g.addColorStop(0, '#7d6a4c'); g.addColorStop(0.45, '#c9b38c'); g.addColorStop(1, '#f4ead2'); }
  else { g.addColorStop(0, '#5e4f38'); g.addColorStop(0.5, '#96805d'); g.addColorStop(1, '#c9b89a'); }
  ctx.fillStyle = g;
  ctx.strokeStyle = blizszy ? '#3d3020' : '#2e2418';
  ctx.lineWidth = 0.75;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(lewa[0][0], lewa[0][1]);
  for (const [a, b] of lewa) ctx.lineTo(a, b);
  for (let i = prawa.length - 1; i >= 0; i--) ctx.lineTo(prawa[i][0], prawa[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // prążki w poprzek rogu (co trzeci punkt osi, do 3/4 długości)
  ctx.strokeStyle = blizszy ? 'rgba(61, 48, 32, 0.6)' : 'rgba(40, 30, 20, 0.55)';
  ctx.lineWidth = 0.6;
  for (let i = 2; i < N * 0.78; i += 3) {
    const [px, py, tx, ty, gr] = os[i];
    ctx.beginPath();
    ctx.moveTo(px - ty * gr * 0.9, py + tx * gr * 0.9);
    ctx.quadraticCurveTo(px + tx * 1.2, py + ty * 1.2, px + ty * gr * 0.9, py - tx * gr * 0.9);
    ctx.stroke();
  }
  // połysk wzdłuż zewnętrznej krawędzi
  if (blizszy) {
    ctx.strokeStyle = 'rgba(255, 250, 235, 0.55)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 1; i < N * 0.85; i++) {
      const [px, py, tx, ty, gr] = os[i];
      const a = px + ty * gr * 0.45, b = py - tx * gr * 0.45;
      if (i === 1) ctx.moveTo(a, b); else ctx.lineTo(a, b);
    }
    ctx.stroke();
  }
}

/* Kozie ucho: płaskie, odstające w bok i lekko opadające; kier = w którą stronę sterczy. */
function uchoKozy(ctx, x, y, kier, sk, kolor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(kier * sk, sk);
  ctx.rotate(0.35);
  ctx.fillStyle = kolor;
  ctx.strokeStyle = '#3d3020';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, -1.8);
  ctx.quadraticCurveTo(6, -3.2, 9.5, 0.4);
  ctx.quadraticCurveTo(5.5, 2.8, 0, 1.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(232, 150, 150, 0.85)';
  ctx.beginPath();
  ctx.moveTo(1.2, -0.7);
  ctx.quadraticCurveTo(5.5, -1.5, 8, 0.3);
  ctx.quadraticCurveTo(5, 1.2, 1.2, 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export const CZAPKI = [
  {
    id: 'krol', osiagniecie: '*', nazwa: 'Korona Króla GOATów', ikona: '👑', wys: 18,
    // promienie chwały obracają się za głową
    zaGlowa(ctx, cx, cy, f, t) {
      const x = cx, y = cy - 18;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.5);
      const puls = 0.55 + Math.sin(t * 2.5) * 0.15;
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        const g = ctx.createLinearGradient(0, 0, 0, -26);
        g.addColorStop(0, 'rgba(255, 220, 90, ' + puls + ')');
        g.addColorStop(1, 'rgba(255, 150, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-1.6, 0);
        ctx.lineTo(0, i % 2 ? -20 : -27);
        ctx.lineTo(1.6, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 9.5;
      // wielkie złote rogi kozła wyrastają zza korony
      rogKrola(ctx, cx, y, -1);
      rogKrola(ctx, cx, y, 1);
      // aksamitna czapa w środku
      ctx.fillStyle = pion(ctx, y - 12, y, '#d42a4a', '#6e0a1e');
      ctx.beginPath();
      ctx.moveTo(cx - 7.5, y);
      ctx.bezierCurveTo(cx - 8, y - 14, cx + 8, y - 14, cx + 7.5, y);
      ctx.closePath();
      ctx.fill();
      // korona: pięć zębów z perłami, obręcz z klejnotami
      ctx.save();
      ctx.shadowColor = 'rgba(255, 210, 60, 0.9)';
      ctx.shadowBlur = 6 + Math.sin(t * 3) * 2;
      ctx.fillStyle = poziom(ctx, cx - 10, cx + 10, ['#a86e00', '#ffe27a', '#fff6c9', '#ffd23a', '#8a5a00']);
      ctx.strokeStyle = '#5c3a00';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx - 10, y + 2);
      const zeby = [[-10, -9], [-7.5, -4], [-5, -12], [-2.5, -4.5], [0, -15], [2.5, -4.5], [5, -12], [7.5, -4], [10, -9]];
      for (const [x, h] of zeby) ctx.lineTo(cx + x, y + h);
      ctx.lineTo(cx + 10, y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#fff8e6';
      for (const [x, h] of [[-10, -9], [-5, -12], [0, -15], [5, -12], [10, -9]]) kolo(ctx, cx + x, y + h - 0.6, 1.3);
      ctx.fillStyle = pion(ctx, y - 1, y + 2.5, '#ffe27a', '#a86e00');
      ctx.fillRect(cx - 10, y - 1, 20, 3.4);
      // klejnoty: rubin w środku pulsuje, szmaragd i szafir po bokach
      const puls = 0.75 + Math.sin(t * 4) * 0.25;
      ctx.save();
      ctx.shadowColor = 'rgba(255, 40, 60, ' + puls + ')';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#ff2a4a';
      ctx.beginPath();
      ctx.moveTo(cx, y - 7.5); ctx.lineTo(cx + 2.6, y - 4.5); ctx.lineTo(cx, y - 1.5); ctx.lineTo(cx - 2.6, y - 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      kolo(ctx, cx - 0.8, y - 5.5, 0.6);
      ctx.fillStyle = '#2fd07a';
      kolo(ctx, cx - 6, y + 0.7, 1.2);
      ctx.fillStyle = '#3f8bff';
      kolo(ctx, cx + 6, y + 0.7, 1.2);
      // iskry krążące wokół korony
      for (let i = 0; i < 4; i++) {
        const a = t * 2.2 + i * Math.PI / 2;
        const sx = cx + Math.cos(a) * 14, sy = y - 7 + Math.sin(a) * 4;
        const r = 1.6 + Math.sin(t * 6 + i) * 0.5;
        ctx.fillStyle = i % 2 ? '#fff6c0' : '#ffd23a';
        ctx.beginPath();
        ctx.moveTo(sx, sy - r * 1.8); ctx.lineTo(sx + r * 0.5, sy); ctx.lineTo(sx, sy + r * 1.8); ctx.lineTo(sx - r * 0.5, sy);
        ctx.closePath();
        ctx.moveTo(sx - r * 1.8, sy); ctx.lineTo(sx, sy + r * 0.5); ctx.lineTo(sx + r * 1.8, sy); ctx.lineTo(sx, sy - r * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
  },
  {
    id: 'irokez', osiagniecie: 'masakra', nazwa: 'Płonący irokez', ikona: '🔥', wys: 10,
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 8.5;
      // grzebień z ognia od czoła do karku; każdy płomyk migocze osobno
      ctx.save();
      ctx.shadowColor = 'rgba(255, 110, 0, 0.9)';
      ctx.shadowBlur = 8;
      for (let i = 0; i < 6; i++) {
        const u = i / 5;
        const x = cx + f * (5 - u * 12);
        const h = 9 + Math.sin(t * 11 + i * 1.7) * 2.2 + (1 - Math.abs(u - 0.4)) * 3;
        const podst = y + Math.abs(u - 0.45) * 3;
        for (const [kol, sk] of [['#d4230a', 1], ['#ff8a1a', 0.72], ['#ffe14a', 0.42]]) {
          ctx.fillStyle = kol;
          ctx.beginPath();
          ctx.moveTo(x - 2.4 * sk, podst);
          ctx.quadraticCurveTo(x - 1.5 * sk - f * 1, podst - h * sk * 0.6, x - f * 2.5 * sk, podst - h * sk);
          ctx.quadraticCurveTo(x + 1.8 * sk, podst - h * sk * 0.5, x + 2.4 * sk, podst);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }
  },
  {
    id: 'wulkan', osiagniecie: 'lawa', nazwa: 'Korona z lawy', ikona: '🌋', wys: 7,
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 8.5;
      ctx.save();
      ctx.shadowColor = 'rgba(255, 90, 0, 0.9)';
      ctx.shadowBlur = 7 + Math.sin(t * 4) * 2;
      // bazaltowa korona z postrzępionymi szczytami
      ctx.fillStyle = pion(ctx, y - 12, y + 2, '#7a5446', '#2e1c16');
      ctx.strokeStyle = '#ff7a1a';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx - 9, y + 2);
      const szczyty = [[-9, -6], [-6, -11], [-3.5, -7], [0, -14], [3.5, -7], [6, -11], [9, -6]];
      for (const [x, h] of szczyty) ctx.lineTo(cx + x, y + h);
      ctx.lineTo(cx + 9, y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // żyły lawy (pulsują)
      const jas = 0.7 + Math.sin(t * 5) * 0.3;
      ctx.strokeStyle = 'rgba(255, ' + Math.round(140 + 80 * jas) + ', 40, 1)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx - 6, y - 9); ctx.lineTo(cx - 4.5, y - 3); ctx.lineTo(cx - 6, y + 1);
      ctx.moveTo(cx, y - 12); ctx.lineTo(cx + 1, y - 5); ctx.lineTo(cx - 0.5, y + 1);
      ctx.moveTo(cx + 6, y - 9); ctx.lineTo(cx + 4.5, y - 3); ctx.lineTo(cx + 5.5, y + 1);
      ctx.stroke();
      ctx.fillStyle = '#ffb020';
      ctx.fillRect(cx - 9, y + 0.6, 18, 1.6);
      // kapiąca lawa i iskry
      for (let i = 0; i < 3; i++) {
        const u = (t * 0.8 + i / 3) % 1;
        ctx.globalAlpha = 1 - u;
        ctx.fillStyle = '#ff7a1a';
        kolo(ctx, cx - 5 + i * 5, y + 2 + u * 7, 1.1 * (1 - u * 0.5));
        ctx.fillStyle = '#ffd93b';
        kolo(ctx, cx - 4 + i * 4 + Math.sin(t * 3 + i) * 2, y - 13 - u * 8, 0.7);
      }
      ctx.globalAlpha = 1;
    }
  },
  {
    id: 'rogi', osiagniecie: 'owca', nazwa: 'Rogi prawdziwego GOATa', ikona: '🐐', wys: 9,
    rysuj(ctx, cx, cy, f) {
      // dwa rogi kozła alpejskiego z czubka głowy: dalszy (ciemniejszy) i bliższy
      rogKozy(ctx, cx + f * 4.2, cy - 8, f, 0.84, false);
      uchoKozy(ctx, cx - f * 5.5, cy - 4.5, -f, 1, '#c8b08a');
      rogKozy(ctx, cx - f * 0.6, cy - 9, f, 0.94, true);
    }
  }
];
