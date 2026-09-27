/* Czapki za osiągnięcia (od 4.7.1): każde osiągnięcie Areny odblokowuje jedną czapkę.
   Bez osiągnięcia czapka jest zablokowana (w panelu kłódka, serwer też jej nie przyjmie).

   Ten sam kształt co w akcesoria.js: rysuj(ctx, cx, cy, f, t) — cx, cy = środek ciała
   robala (elipsa 8×10, oczy na cy − 4 po stronie f), f = zwrot, t = czas w s.
   zaGlowa(…) — część za ciałem (wstęgi, ogony, pióropusze). wys — o ile czapka sięga
   wyżej niż zwykła (render podnosi pasek życia i nick). Sama grafika: wolno trygonometrię.
   Lista id musi się zgadzać z CZAPKI w serwer/konta.js (test serwera). */

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
/* Kopuła czapki na czubku głowy: od lewej do prawej krawędzi, wysokość h. */
function kopula(ctx, cx, y, szer, h) {
  ctx.beginPath();
  ctx.moveTo(cx - szer, y);
  ctx.bezierCurveTo(cx - szer, y - h * 1.3, cx + szer, y - h * 1.3, cx + szer, y);
  ctx.closePath();
}
/* Powiewająca wstęga za głową (ogony opaski, szalik). */
function wstega(ctx, x, y, f, t, dl, kolor, grub, faza = 0) {
  ctx.strokeStyle = kolor;
  ctx.lineWidth = grub;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  const k = 6;
  for (let i = 1; i <= k; i++) {
    const u = i / k;
    ctx.lineTo(x - f * dl * u, y + u * 3 + Math.sin(t * 7 + u * 5 + faza) * 2.2 * u);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

export const CZAPKI = [
  {
    id: 'opaska-krwi', osiagniecie: 'pierwsza-krew', nazwa: 'Krwawa opaska', ikona: '🩸', wys: 0,
    zaGlowa(ctx, cx, cy, f, t) {
      wstega(ctx, cx - f * 8, cy - 6, f, t, 11, '#9c0f18', 2.4);
      wstega(ctx, cx - f * 8, cy - 5.5, f, t, 8, '#c81d25', 2, 1.3);
    },
    rysuj(ctx, cx, cy, f) {
      ctx.fillStyle = pion(ctx, cy - 9, cy - 4, '#e0282f', '#8a0c12');
      ctx.beginPath();
      ctx.ellipse(cx, cy - 6.5, 8.6, 2.4, 0, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(cx - 7, cy - 7.8, 14, 0.8);
      // węzeł z tyłu i kropla na czole
      ctx.fillStyle = '#7a0a10';
      kolo(ctx, cx - f * 8.3, cy - 6.3, 1.9);
      ctx.fillStyle = '#ff3b45';
      ctx.beginPath();
      ctx.moveTo(cx + f * 4, cy - 5);
      ctx.quadraticCurveTo(cx + f * 5.4, cy - 2.4, cx + f * 4, cy - 2);
      ctx.quadraticCurveTo(cx + f * 2.6, cy - 2.4, cx + f * 4, cy - 5);
      ctx.fill();
    }
  },
  {
    id: 'czaszka', osiagniecie: 'piec-fragow', nazwa: 'Czapka z czaszką', ikona: '💀', wys: 4,
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 6;
      ctx.fillStyle = pion(ctx, y - 10, y, '#3a3a44', '#15151b');
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.8;
      kopula(ctx, cx, y, 9, 8);
      ctx.fill();
      ctx.stroke();
      // wywinięty brzeg z prążkami
      ctx.fillStyle = '#26262e';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(cx - 9.4, y - 2.6, 18.8, 3.8, 1.6) : ctx.rect(cx - 9.4, y - 2.6, 18.8, 3.8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      for (let i = -8; i <= 8; i += 2) { ctx.beginPath(); ctx.moveTo(cx + i, y - 2.3); ctx.lineTo(cx + i, y + 0.9); ctx.stroke(); }
      // czaszka na froncie
      const sx = cx + f * 3, sy = y - 6.5;
      ctx.fillStyle = '#f2efe6';
      kolo(ctx, sx, sy, 2.7);
      ctx.fillRect(sx - 1.5, sy + 1.4, 3, 2);
      ctx.fillStyle = '#15151b';
      kolo(ctx, sx - 1, sy - 0.2, 0.8);
      kolo(ctx, sx + 1, sy - 0.2, 0.8);
      ctx.fillRect(sx - 0.3, sy + 1.9, 0.6, 1.3);
      // pompon, który podskakuje
      ctx.fillStyle = '#d4232b';
      kolo(ctx, cx - f * 1, y - 11.5 - Math.abs(Math.sin(t * 3)) * 0.8, 2.4);
    }
  },
  {
    id: 'wiking', osiagniecie: 'rzeznik', nazwa: 'Rogi Rzeźnika', ikona: '🪓', wys: 8,
    rysuj(ctx, cx, cy) {
      const y = cy - 6;
      // rogi: grube, zakrzywione do góry, z pierścieniami
      for (const s of [-1, 1]) {
        ctx.fillStyle = pion(ctx, y - 16, y, '#fff6dc', '#c9b58a');
        ctx.strokeStyle = '#6b5a38';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx + s * 6, y - 5);
        ctx.quadraticCurveTo(cx + s * 15, y - 5, cx + s * 14, y - 17);
        ctx.quadraticCurveTo(cx + s * 11, y - 9, cx + s * 5, y - 1.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(107,90,56,0.6)';
        for (const u of [0.35, 0.55, 0.75]) {
          ctx.beginPath();
          ctx.moveTo(cx + s * (6 + 7 * u), y - 4 - 6 * u * u);
          ctx.lineTo(cx + s * (5.5 + 6 * u), y - 1.5 - 7 * u * u);
          ctx.stroke();
        }
      }
      // żelazny hełm z pasem nitów i nosalem
      ctx.fillStyle = poziom(ctx, cx - 9, cx + 9, ['#50565e', '#b9c2cc', '#6a727b']);
      ctx.strokeStyle = '#23272c';
      ctx.lineWidth = 1;
      kopula(ctx, cx, y, 9.2, 8.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3c4148';
      ctx.fillRect(cx - 9.2, y - 2.2, 18.4, 2.6);
      ctx.fillStyle = '#d8dee4';
      for (let i = -7; i <= 7; i += 3.5) kolo(ctx, cx + i, y - 0.9, 0.6);
      ctx.fillStyle = '#3c4148';
      ctx.fillRect(cx - 0.6, y - 9.5, 1.2, 8);
    }
  },
  {
    id: 'wulkan', osiagniecie: 'lawa', nazwa: 'Korona z lawy', ikona: '🌋', wys: 7,
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 7;
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
    id: 'pilot', osiagniecie: 'nalot', nazwa: 'Czapka pilota z goglami', ikona: '✈️', wys: 2,
    zaGlowa(ctx, cx, cy, f, t) {
      wstega(ctx, cx - f * 5, cy + 3, f, t, 13, '#f4efe4', 3);
    },
    rysuj(ctx, cx, cy, f) {
      const y = cy - 5;
      // skórzana pilotka z nausznikiem z tyłu
      ctx.fillStyle = pion(ctx, y - 12, y + 4, '#9a6232', '#5c3719');
      ctx.strokeStyle = '#3a2210';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx + f * 8.8, y - 1);
      ctx.bezierCurveTo(cx + f * 9, y - 13, cx - f * 10, y - 13, cx - f * 9.4, y + 1);
      ctx.lineTo(cx - f * 8, y + 6);
      ctx.lineTo(cx - f * 4.5, y + 5);
      ctx.lineTo(cx - f * 3.5, y - 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.moveTo(cx, y - 9.5); ctx.lineTo(cx - f * 1, y - 1); ctx.stroke();
      // gogle na czole: mosiężne obręcze, niebieskie szkła z odblaskiem
      ctx.fillStyle = '#4a3522';
      ctx.fillRect(cx - 9, y - 4.2, 18, 1.8);
      for (const dx of [1.4, 6.2]) {
        ctx.fillStyle = '#d9a441';
        kolo(ctx, cx + f * dx, y - 3.6, 2.9);
        ctx.fillStyle = pion(ctx, y - 6, y - 1, '#b9f0ff', '#2d8fb8');
        kolo(ctx, cx + f * dx, y - 3.6, 2.1);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        kolo(ctx, cx + f * dx - 0.8, y - 4.4, 0.6);
      }
    }
  },
  {
    id: 'saper', osiagniecie: 'saper', nazwa: 'Kask sapera z dynamitem', ikona: '🧨', wys: 10,
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 6;
      // trzy laski dynamitu przypięte do kasku
      for (const [dx, h] of [[-4, 9], [0, 11], [4, 9]]) {
        ctx.fillStyle = pion(ctx, y - 6 - h, y - 6, '#e8453c', '#9c1c16');
        ctx.fillRect(cx + dx - 1.7, y - 6 - h, 3.4, h);
        ctx.fillStyle = '#f4e3c0';
        ctx.fillRect(cx + dx - 1.7, y - 6 - h * 0.6, 3.4, 1.4);
      }
      // lont z iskrą
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx, y - 17);
      ctx.quadraticCurveTo(cx + f * 3, y - 21, cx + f * 1.5, y - 23);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = t * 9 + i * 1.05;
        ctx.fillStyle = i % 2 ? '#fff4a0' : '#ff9a1a';
        kolo(ctx, cx + f * 1.5 + Math.cos(a) * 2, y - 23 + Math.sin(a) * 2, 0.6);
      }
      ctx.fillStyle = '#fffbe0';
      kolo(ctx, cx + f * 1.5, y - 23, 1.2);
      // żółty kask z daszkiem
      ctx.fillStyle = pion(ctx, y - 9, y, '#ffe04a', '#d99a00');
      ctx.strokeStyle = '#6e4c00';
      ctx.lineWidth = 1;
      kopula(ctx, cx, y, 8.8, 7.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c48a00';
      ctx.beginPath();
      ctx.ellipse(cx + f * 2, y, 11, 1.8, 0, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(cx - 0.6, y - 9, 1.2, 8);
    }
  },
  {
    id: 'kowboj', osiagniecie: 'snajper', nazwa: 'Kapelusz rewolwerowca', ikona: '🤠', wys: 6,
    rysuj(ctx, cx, cy, f) {
      const y = cy - 7;
      // szerokie, podwinięte rondo
      ctx.fillStyle = pion(ctx, y - 3, y + 2, '#a8703a', '#6e4420');
      ctx.strokeStyle = '#3e2410';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx - 15, y - 3.5);
      ctx.quadraticCurveTo(cx - 10, y + 1, cx, y + 1.2);
      ctx.quadraticCurveTo(cx + 10, y + 1, cx + 15, y - 3.5);
      ctx.quadraticCurveTo(cx + 9, y - 1, cx, y - 1.2);
      ctx.quadraticCurveTo(cx - 9, y - 1, cx - 15, y - 3.5);
      ctx.fill();
      ctx.stroke();
      // główka z wgnieceniem
      ctx.fillStyle = pion(ctx, y - 12, y, '#b98048', '#7a4c24');
      ctx.beginPath();
      ctx.moveTo(cx - 7, y - 0.5);
      ctx.lineTo(cx - 6.5, y - 9);
      ctx.quadraticCurveTo(cx - 3, y - 12, cx, y - 9.5);
      ctx.quadraticCurveTo(cx + 3, y - 12, cx + 6.5, y - 9);
      ctx.lineTo(cx + 7, y - 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // opaska z gwiazdą szeryfa
      ctx.fillStyle = '#2e1c0e';
      ctx.fillRect(cx - 6.9, y - 3.6, 13.8, 2.4);
      ctx.fillStyle = '#ffd93b';
      const gx = cx + f * 2.5, gy = y - 2.4;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 1.1 : 2.4;
        ctx.lineTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
  },
  {
    id: 'fajerwerk', osiagniecie: 'kasetowka', nazwa: 'Czapka fajerwerk', ikona: '🎆', wys: 12,
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 7;
      // stożek w paski
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - 7, y + 1);
      ctx.lineTo(cx + f * 1, y - 17);
      ctx.lineTo(cx + 7, y + 1);
      ctx.closePath();
      ctx.clip();
      const kolory = ['#3a6bff', '#ffd93b', '#ff3b8a', '#35e0c0'];
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = kolory[i % 4];
        ctx.fillRect(cx - 9, y + 1 - (i + 1) * 2.4, 18, 2.4);
      }
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 7.5, y, 15, 1.8);
      // wybuch na czubku: iskry rozlatują się i gasną
      const u = (t * 1.2) % 1;
      const kolorWyb = ['#ffd93b', '#ff5a3c', '#7ad7ff', '#b8ff5a'];
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * 6.283 + 0.3;
        ctx.globalAlpha = 1 - u;
        ctx.fillStyle = kolorWyb[i % 4];
        kolo(ctx, cx + f * 1 + Math.cos(a) * (2 + u * 7), y - 17 + Math.sin(a) * (2 + u * 7), 0.9);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff6c0';
      kolo(ctx, cx + f * 1, y - 17, 1.4);
    }
  },
  {
    id: 'rogi', osiagniecie: 'owca', nazwa: 'Rogi prawdziwego GOATa', ikona: '🐐', wys: 6,
    rysuj(ctx, cx, cy, f) {
      const y = cy - 8;
      // dwa skręcone rogi koziorożca: grube u nasady, z żeberkami, zawinięte do tyłu
      for (const s of [0, 1]) {
        const x0 = cx + f * (s ? 4 : -1.5);
        ctx.fillStyle = pion(ctx, y - 14, y + 2, s ? '#fff3d6' : '#e8d6ae', s ? '#b8965e' : '#9a7c4c');
        ctx.strokeStyle = '#4a3c22';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x0 - f * 2.2, y + 1);
        ctx.bezierCurveTo(x0 - f * 3, y - 10, x0 - f * 12, y - 15, x0 - f * 15, y - 6);
        ctx.quadraticCurveTo(x0 - f * 15.5, y - 3, x0 - f * 13.5, y - 2.5);
        ctx.bezierCurveTo(x0 - f * 12, y - 10, x0 - f * 4, y - 7, x0 + f * 2, y + 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(74,60,34,0.55)';
        ctx.lineWidth = 0.7;
        for (let k = 1; k <= 5; k++) {
          const u = k / 6;
          const px = x0 - f * (1 + u * 12.5), py = y - 1 - Math.sin(u * Math.PI) * 9.5;
          ctx.beginPath();
          ctx.moveTo(px - f * 1.4, py - 1.6);
          ctx.lineTo(px + f * 1.2, py + 1.6);
          ctx.stroke();
        }
      }
    }
  },
  {
    id: 'bejsbol', osiagniecie: 'home-run', nazwa: 'Czapka home run', ikona: '🧢', wys: 1,
    rysuj(ctx, cx, cy, f) {
      const y = cy - 6;
      // daszek do przodu
      ctx.fillStyle = '#9a0f16';
      ctx.beginPath();
      ctx.moveTo(cx + f * 5, y - 1.4);
      ctx.quadraticCurveTo(cx + f * 14, y - 2.5, cx + f * 14.5, y + 0.6);
      ctx.quadraticCurveTo(cx + f * 9, y + 1.2, cx + f * 4, y + 0.4);
      ctx.closePath();
      ctx.fill();
      // główka z panelami i guzikiem
      ctx.fillStyle = pion(ctx, y - 10, y, '#ff3b45', '#c01822');
      ctx.strokeStyle = '#6a0a10';
      ctx.lineWidth = 0.9;
      kopula(ctx, cx, y, 8.8, 7.8);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.moveTo(cx, y - 10); ctx.quadraticCurveTo(cx + f * 3, y - 5, cx + f * 3.5, y);
      ctx.moveTo(cx, y - 10); ctx.quadraticCurveTo(cx - f * 3, y - 5, cx - f * 3.5, y);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      kolo(ctx, cx, y - 10, 1.1);
      // logo: białe „G” (GOAT)
      ctx.font = 'bold 6px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G', cx + f * 3.4, y - 4.6);
    }
  },
  {
    id: 'piorun', osiagniecie: 'dublet', nazwa: 'Skrzydlaty hełm gromu', ikona: '⚡', wys: 6,
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 6;
      // skrzydła po bokach, lekko trzepoczą
      const mach = Math.sin(t * 6) * 0.12;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + s * 8, y - 4);
        ctx.rotate(s * (-0.35 + mach));
        ctx.fillStyle = '#f8f8ff';
        ctx.strokeStyle = '#8a9bb0';
        ctx.lineWidth = 0.7;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(s * (3 + i * 1.5), -4 - i * 2.2, 5 - i, 1.6, s * (-0.9 + i * 0.1), 0, 6.283);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
      // srebrny hełm z piorunem
      ctx.fillStyle = poziom(ctx, cx - 9, cx + 9, ['#7e8894', '#e9eef4', '#8c96a2']);
      ctx.strokeStyle = '#3b434c';
      ctx.lineWidth = 1;
      kopula(ctx, cx, y, 9, 8.2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd93b';
      ctx.strokeStyle = '#a86a00';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const px = cx + f * 2.5;
      ctx.moveTo(px + 1, y - 9); ctx.lineTo(px - 1.8, y - 4.4); ctx.lineTo(px + 0.4, y - 4.4);
      ctx.lineTo(px - 1, y - 0.4); ctx.lineTo(px + 2.6, y - 5.6); ctx.lineTo(px + 0.4, y - 5.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // iskry elektryczne co chwilę
      if (Math.sin(t * 13) > 0.6) {
        ctx.strokeStyle = '#9fe7ff';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx - 10, y - 9); ctx.lineTo(cx - 12, y - 12); ctx.lineTo(cx - 10.5, y - 13); ctx.lineTo(cx - 13, y - 16);
        ctx.stroke();
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
    id: 'ninja', osiagniecie: 'ucieczka', nazwa: 'Opaska ninja', ikona: '🥷', wys: 0,
    zaGlowa(ctx, cx, cy, f, t) {
      wstega(ctx, cx - f * 8, cy - 7, f, t, 16, '#1a1a22', 2.6);
      wstega(ctx, cx - f * 8, cy - 6.4, f, t, 12, '#2c2c36', 2.2, 1.7);
    },
    rysuj(ctx, cx, cy, f) {
      ctx.fillStyle = '#1c1c24';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 7, 8.7, 2.3, 0, 0, 6.283);
      ctx.fill();
      // metalowa płytka z wyrytym zawijasem
      const px = cx + f * 3;
      ctx.fillStyle = poziom(ctx, px - 3.5, px + 3.5, ['#8d98a4', '#eef3f8', '#8d98a4']);
      ctx.fillRect(px - 3.5, cy - 9, 7, 4);
      ctx.strokeStyle = '#3a4048';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(px - 3.5, cy - 9, 7, 4);
      ctx.beginPath();
      ctx.arc(px, cy - 7, 1.2, 0, 4.8);
      ctx.stroke();
    }
  },
  {
    id: 'cylinder', osiagniecie: 'zwyciestwo', nazwa: 'Złoty cylinder GOATa', ikona: '🎩', wys: 14,
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 7.5;
      ctx.save();
      ctx.translate(cx, y);
      ctx.rotate(-f * 0.12);
      // rondo i wysoka główka ze złota
      ctx.fillStyle = pion(ctx, -1, 2, '#ffe58a', '#b07a00');
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 2.2, 0, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = poziom(ctx, -7, 7, ['#a86e00', '#ffe27a', '#fff6c9', '#d9a300', '#8a5a00']);
      ctx.strokeStyle = '#5c3a00';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-6.5, -0.5);
      ctx.lineTo(-7.2, -16);
      ctx.quadraticCurveTo(0, -18, 7.2, -16);
      ctx.lineTo(6.5, -0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffe9a0';
      ctx.beginPath();
      ctx.ellipse(0, -16.3, 7.2, 1.5, 0, 0, 6.283);
      ctx.fill();
      // czarna wstęga z czerwonym klejnotem
      ctx.fillStyle = '#1a1210';
      ctx.fillRect(-6.7, -4.6, 13.4, 3);
      ctx.fillStyle = '#ff2a3a';
      kolo(ctx, f * 3, -3.1, 1.3);
      ctx.restore();
      // błysk przelatujący po złocie
      const u = (t * 0.6) % 1;
      if (u < 0.3) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.9 - u * 3) + ')';
        const bx = cx - 5 + u * 35, by = y - 8 - u * 6;
        ctx.beginPath();
        ctx.moveTo(bx, by - 3); ctx.lineTo(bx + 0.8, by); ctx.lineTo(bx, by + 3); ctx.lineTo(bx - 0.8, by);
        ctx.closePath();
        ctx.fill();
      }
    }
  },
  {
    id: 'aureola', osiagniecie: 'na-wlosku', nazwa: 'Aureola z włoskiem', ikona: '😇', wys: 8,
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 17 + Math.sin(t * 2.5) * 1.2;
      ctx.save();
      ctx.shadowColor = 'rgba(255, 230, 120, 0.95)';
      ctx.shadowBlur = 9;
      ctx.strokeStyle = '#ffe36a';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(cx, y, 8, 2.6, 0, 0, 6.283);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#fffbe0';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(cx, y - 0.4, 7.4, 2, 0, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      // jeden włosek na czubku — ledwo przeżył
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + f * 1, cy - 9.8);
      ctx.quadraticCurveTo(cx + f * 3 + Math.sin(t * 3) * 1.5, cy - 13, cx + f * 1.5, cy - 14.5);
      ctx.stroke();
    }
  },
  {
    id: 'rycerz', osiagniecie: 'nietykalny', nazwa: 'Hełm rycerza z pióropuszem', ikona: '🛡️', wys: 9,
    zaGlowa(ctx, cx, cy, f, t) {
      // pióropusz spływa do tyłu
      const kol = ['#2f5bff', '#f4f4ff', '#d4232b'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = kol[i];
        ctx.beginPath();
        ctx.ellipse(cx - f * (7 + i * 2), cy - 16 + i * 2.5 + Math.sin(t * 4 + i) * 0.8, 6.5, 2, f * (0.5 + i * 0.25), 0, 6.283);
        ctx.fill();
      }
    },
    rysuj(ctx, cx, cy, f) {
      const y = cy - 5.5;
      // stalowy hełm z podniesioną przyłbicą
      ctx.fillStyle = poziom(ctx, cx - 9, cx + 9, ['#5b6470', '#dfe6ee', '#7a8490']);
      ctx.strokeStyle = '#262c33';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + f * 8.8, y - 1.4);
      ctx.bezierCurveTo(cx + f * 9.5, y - 14, cx - f * 10, y - 14, cx - f * 9.5, y + 1);
      ctx.lineTo(cx - f * 8.6, y + 7);
      ctx.lineTo(cx - f * 3, y + 6);
      ctx.lineTo(cx - f * 2, y - 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // przyłbica uniesiona nad czołem, ze szczelinami
      ctx.fillStyle = poziom(ctx, cx - 4, cx + 10, ['#8a94a0', '#f2f6fa']);
      ctx.beginPath();
      ctx.moveTo(cx - f * 1.5, y - 1.5);
      ctx.quadraticCurveTo(cx + f * 6, y - 8, cx + f * 11, y - 5);
      ctx.lineTo(cx + f * 9.6, y - 2.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#262c33';
      ctx.lineWidth = 0.6;
      for (const u of [0.4, 0.65, 0.9]) {
        ctx.beginPath();
        ctx.moveTo(cx + f * (-1 + u * 11), y - 2 - u * 3.6);
        ctx.lineTo(cx + f * (-0.5 + u * 10.5), y - 1.2 - u * 2.8);
        ctx.stroke();
      }
      // grzebień na czubku, z którego wyrasta pióropusz
      ctx.fillStyle = '#c9a441';
      ctx.fillRect(cx - f * 2.5 - 1.5, y - 13.5, 3, 3);
    }
  },
  {
    id: 'general', osiagniecie: 'weteran', nazwa: 'Czapka generała', ikona: '🎖️', wys: 4,
    rysuj(ctx, cx, cy, f) {
      const y = cy - 7;
      // czarny, lśniący daszek
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(cx + f * 2, y + 0.5);
      ctx.quadraticCurveTo(cx + f * 11, y, cx + f * 12, y + 2.6);
      ctx.quadraticCurveTo(cx + f * 6, y + 3, cx + f * 1, y + 2);
      ctx.closePath();
      ctx.fill();
      // zielona główka rozszerzająca się ku górze
      ctx.fillStyle = pion(ctx, y - 10, y, '#4f6b3a', '#2c3e20');
      ctx.strokeStyle = '#18230f';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx - 8, y + 1);
      ctx.lineTo(cx - 11, y - 7);
      ctx.quadraticCurveTo(cx, y - 11.5, cx + 11, y - 7);
      ctx.lineTo(cx + 8, y + 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // złoty otok, sznur i gwiazda
      ctx.fillStyle = '#c99a2a';
      ctx.fillRect(cx - 8, y - 2.4, 16, 2.8);
      ctx.strokeStyle = '#ffe07a';
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(cx - 7.5, y - 0.9); ctx.lineTo(cx + 7.5, y - 0.9); ctx.stroke();
      const gx = cx + f * 2.5, gy = y - 6.2;
      ctx.fillStyle = '#ffd93b';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 1.2 : 2.8;
        ctx.lineTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
  },
  {
    id: 'blazen', osiagniecie: 'samoboja', nazwa: 'Czapka błazna', ikona: '🤡', wys: 9,
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 7;
      // trzy miękkie rogi z dzwoneczkami, kołyszą się
      const rogi = [[-1, '#d4232b', -0.9], [0, '#ffd93b', 0], [1, '#2f5bff', 0.9]];
      for (const [s, kol, faza] of rogi) {
        const bujanie = Math.sin(t * 4 + faza) * 1.5;
        const kx = cx + s * 11 + bujanie, ky = y - (s === 0 ? 14 : 8);
        ctx.fillStyle = kol;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx + s * 2.5 - 3.5, y);
        ctx.quadraticCurveTo(cx + s * 5 - 2, y - 11, kx, ky);
        ctx.quadraticCurveTo(cx + s * 7 + 1, y - 5, cx + s * 2.5 + 3.5, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffe36a';
        kolo(ctx, kx, ky + 1.5 + Math.abs(Math.sin(t * 8 + faza)) * 0.6, 1.6);
        ctx.fillStyle = '#8a6a00';
        kolo(ctx, kx, ky + 2.3, 0.5);
      }
      // opaska w romby
      ctx.fillStyle = '#f4efe4';
      ctx.fillRect(cx - 9, y - 1.6, 18, 3);
      ctx.fillStyle = '#d4232b';
      for (let i = -8; i < 8; i += 4) {
        ctx.beginPath();
        ctx.moveTo(cx + i, y); ctx.lineTo(cx + i + 2, y - 1.5); ctx.lineTo(cx + i + 4, y); ctx.lineTo(cx + i + 2, y + 1.4);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
];
