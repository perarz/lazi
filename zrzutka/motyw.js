/* Ustawia motyw przed pierwszym malowaniem, żeby wejście prosto na #0ad
   nie mignęło najpierw Fortnite'em. Reszta logiki jest w app.js. */
(function () {
  if (/^#0ad$/i.test(location.hash)) document.documentElement.setAttribute('data-motyw', 'zeroad');
})();
