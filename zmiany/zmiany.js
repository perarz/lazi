/* Rysuje historię z /wersja.js — bez innerHTML, same węzły tekstowe. */
(function () {
  var w = window.WERSJA_STRONY;
  if (!w) return;
  document.getElementById('obecna').textContent = 'v' + w.numer + ' (' + w.data + ')';
  var lista = document.getElementById('lista');
  w.historia.forEach(function (h, i) {
    var sek = document.createElement('section');
    sek.className = 'wpis' + (i === 0 ? ' najnowszy' : '');
    var nag = document.createElement('div');
    nag.className = 'wpis-nag';
    var nr = document.createElement('span');
    nr.className = 'nr';
    nr.textContent = 'v' + h.wersja;
    var tyt = document.createElement('h2');
    tyt.textContent = h.tytul;
    var data = document.createElement('time');
    data.textContent = h.data;
    nag.append(nr, tyt, data);
    var ul = document.createElement('ul');
    h.zmiany.forEach(function (z) {
      var li = document.createElement('li');
      li.textContent = z;
      ul.appendChild(li);
    });
    sek.append(nag, ul);
    lista.appendChild(sek);
  });
})();
