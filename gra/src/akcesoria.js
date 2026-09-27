/* Akcesoria robala (od 4.7): czysto wizualne — nie wchodzą do symulacji ani hasha.

   Wybór jest na koncie (serwer/konta.js, ta sama lista id w AKCESORIA), leci
   w 'dolacz' jako `akc` i w 'nowa.gracze', a render.js rysuje je na robalu.
   Tu wolno trygonometrię i Math.random — to tylko grafika.

   rysuj(ctx, cx, cy, f, t): cx, cy = środek ciała robala, f = zwrot (1 w prawo,
   -1 w lewo), t = czas w s. Ciało to elipsa 8×10, oczy na wysokości cy − 4.
   `tyl: true` = rysowane przed ciałem (np. coś na plecach). */

import { CZAPKI } from './czapki.js';

/* Akcesoria dla każdego (od 4.7). Czapki za osiągnięcia są w czapki.js (od 4.7.1). */
export const PODSTAWOWE = [
  {
    id: 'korona', nazwa: 'Korona Victory Royale', gra: 'Fortnite', ikona: '👑',
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 9;
      const blask = 0.5 + Math.sin(t * 3) * 0.2;
      ctx.save();
      ctx.shadowColor = 'rgba(255, 210, 60, ' + blask + ')';
      ctx.shadowBlur = 8;
      const g = ctx.createLinearGradient(0, y - 10, 0, y + 2);
      g.addColorStop(0, '#fff3a0');
      g.addColorStop(0.5, '#ffc928');
      g.addColorStop(1, '#c98a00');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#7a4d00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 7, y + 2);
      ctx.lineTo(cx - 8, y - 7);
      ctx.lineTo(cx - 4, y - 3);
      ctx.lineTo(cx, y - 10);
      ctx.lineTo(cx + 4, y - 3);
      ctx.lineTo(cx + 8, y - 7);
      ctx.lineTo(cx + 7, y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // klejnoty: niebieski jak V-dolec w środku, czerwone po bokach
      ctx.fillStyle = '#3fa9ff';
      ctx.beginPath(); ctx.arc(cx, y - 1.5, 1.8, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#ff3b4a';
      ctx.beginPath(); ctx.arc(cx - 4.5, y - 0.5, 1.1, 0, 6.283); ctx.arc(cx + 4.5, y - 0.5, 1.1, 0, 6.283); ctx.fill();
    }
  },
  {
    // 4.9: zamiast czapki lamy — okulary przeciwsłoneczne z odblaskiem
    id: 'okulary', nazwa: 'Okulary przeciwsłoneczne', gra: 'Fortnite', ikona: '🕶️',
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 4.2;
      // zausznik do tyłu głowy
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cx + f * 0.2, y - 1.2);
      ctx.lineTo(cx - f * 6.5, y - 0.4);
      ctx.stroke();
      // szkła: ciemne, z fioletowo-niebieskim połyskiem
      for (const ox of [1.2, 5.9]) {
        const x = cx + f * ox;
        const g = ctx.createLinearGradient(x, y - 3, x, y + 3);
        g.addColorStop(0, '#3a2a6a');
        g.addColorStop(0.5, '#0c0c14');
        g.addColorStop(1, '#1d3d6a');
        ctx.fillStyle = g;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x - 3.1, y - 2.4);
        ctx.lineTo(x + 3.1, y - 2.4);
        ctx.quadraticCurveTo(x + 3.2, y + 2.8, x, y + 2.9);
        ctx.quadraticCurveTo(x - 3.2, y + 2.8, x - 3.1, y - 2.4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // mostek
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + f * 4.2, y - 1.6);
      ctx.lineTo(cx + f * 2.9, y - 1.6);
      ctx.stroke();
      // przesuwający się odblask
      const b = ((t * 0.6) % 2);
      if (b < 1) {
        ctx.save();
        ctx.globalAlpha = 0.75 * Math.sin(b * Math.PI);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.9;
        for (const ox of [1.2, 5.9]) {
          const x = cx + f * ox - 2.2 + b * 4;
          ctx.beginPath();
          ctx.moveTo(x, y + 1.6);
          ctx.lineTo(x + 1.6, y - 1.8);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  },
  {
    // 4.9: zamiast kilofa — szeroki uśmiech z rumieńcami
    id: 'buzka', nazwa: 'Szeroki uśmiech', gra: 'Arena', ikona: '😁',
    rysuj(ctx, cx, cy, f, t) {
      const x = cx + f * 3.6, y = cy + 1.4;
      const sz = 3.6 + Math.sin(t * 2.4) * 0.25;
      // rumieńce
      ctx.fillStyle = 'rgba(255, 110, 130, 0.45)';
      ctx.beginPath();
      ctx.ellipse(cx + f * 7.2, cy - 0.3, 1.8, 1.1, 0, 0, 6.283);
      ctx.ellipse(cx - f * 0.6, cy - 0.3, 1.6, 1, 0, 0, 6.283);
      ctx.fill();
      // usta: półksiężyc
      ctx.fillStyle = '#5a0f14';
      ctx.strokeStyle = '#2a0508';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x - sz, y - 0.6);
      ctx.quadraticCurveTo(x, y - 1.4, x + sz, y - 0.6);
      ctx.quadraticCurveTo(x + sz * 0.8, y + sz * 1.05, x, y + sz * 1.05);
      ctx.quadraticCurveTo(x - sz * 0.8, y + sz * 1.05, x - sz, y - 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // zęby i język
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(x - sz, y - 1.4, sz * 2, 1.9);
      ctx.fillStyle = '#ff6f86';
      ctx.beginPath();
      ctx.ellipse(x + f * 0.4, y + sz * 1.05, sz * 0.6, sz * 0.45, 0, 0, 6.283);
      ctx.fill();
      ctx.restore();
    }
  },
  {
    id: 'helm', nazwa: 'Hełm spartański', gra: '0 A.D.', ikona: '🪖',
    rysuj(ctx, cx, cy, f, t) {
      const y = cy - 6;
      // grzebień z końskiego włosia, lekko faluje
      const fal = Math.sin(t * 5) * 0.8;
      ctx.fillStyle = '#c4161c';
      ctx.strokeStyle = '#6e0a0e';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + f * 5, y - 9);
      ctx.quadraticCurveTo(cx - f * 1, y - 21 + fal, cx - f * 12, y - 2);
      ctx.quadraticCurveTo(cx - f * 4, y - 12, cx + f * 5, y - 9);
      ctx.fill();
      ctx.stroke();
      // hełm koryncki z brązu: kopuła, długa osłona karku z tyłu, twarz otwarta z przodu (tam patrzą oczy)
      const g = ctx.createLinearGradient(cx - f * 9, 0, cx + f * 9, 0);
      g.addColorStop(0, '#7a4c14');
      g.addColorStop(0.55, '#e3ab4f');
      g.addColorStop(1, '#a8702a');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#4e320c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + f * 8.7, y - 1);
      ctx.quadraticCurveTo(cx + f * 9, y - 10, cx, y - 10.5);
      ctx.quadraticCurveTo(cx - f * 9.8, y - 10, cx - f * 9.4, y + 2);
      ctx.lineTo(cx - f * 8.4, y + 9);
      ctx.lineTo(cx - f * 3, y + 8);
      ctx.lineTo(cx - f * 1.8, y - 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // brzeg nad oczami i nit na skroni
      ctx.strokeStyle = '#ffd98a';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx - f * 1.8, y - 1.4);
      ctx.lineTo(cx + f * 8.4, y - 1.8);
      ctx.stroke();
      ctx.fillStyle = '#ffe2a0';
      ctx.beginPath(); ctx.arc(cx - f * 5.5, y + 1.5, 0.9, 0, 6.283); ctx.fill();
    }
  },
  {
    id: 'wieniec', nazwa: 'Wieniec laurowy', gra: '0 A.D.', ikona: '🌿',
    rysuj(ctx, cx, cy, f) {
      const y = cy - 8;
      // wstążka z tyłu głowy
      ctx.strokeStyle = '#d23a2a';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cx - f * 8, y + 1);
      ctx.quadraticCurveTo(cx - f * 12, y + 5, cx - f * 11, y + 9);
      ctx.moveTo(cx - f * 8, y + 1);
      ctx.quadraticCurveTo(cx - f * 10, y + 6, cx - f * 8, y + 10);
      ctx.stroke();
      // opaska wieńca dookoła głowy (elipsa) i listki wzdłuż niej, pochylone ku czołu
      ctx.strokeStyle = '#2f7a2c';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(cx, y, 9, 2.8, 0, 0, 6.283);
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * 6.283;
        const lx = cx + Math.cos(a) * 9, ly = y + Math.sin(a) * 2.8 - 1;
        // tylne listki (górna połówka elipsy) ciemniejsze — są dalej
        const tyl = Math.sin(a) < 0;
        ctx.fillStyle = i % 4 === 0 ? '#e6c040' : tyl ? '#3a8a35' : '#5cc253';
        ctx.beginPath();
        ctx.ellipse(lx, ly, 3.1, 1.3, (lx - cx) / 9 * -0.9 * f * f - 0.4 * Math.sign(lx - cx), 0, 6.283);
        ctx.fill();
      }
    }
  }
];

export const AKCESORIA = [...PODSTAWOWE, ...CZAPKI];
export const AKCESORIA_ID = AKCESORIA.map((a) => a.id);
/* Czy wolno założyć: podstawowe zawsze, czapka — gdy zdobyte jej osiągnięcie ({ id: czas });
   osiagniecie '*' = wszystkie z listy `wszystkie` (id osiągnięć z gra/osiagniecia.js). */
export function odblokowane(a, zdobyte, wszystkie = []) {
  if (!a) return false;
  if (!a.osiagniecie) return true;
  if (!zdobyte) return false;
  if (a.osiagniecie === '*') return wszystkie.length > 0 && wszystkie.every((id) => zdobyte[id]);
  return !!zdobyte[a.osiagniecie];
}
export const akcesorium = (id) => AKCESORIA.find((a) => a.id === id) || null;
