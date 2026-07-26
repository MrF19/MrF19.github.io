/* Service worker-ul aplicatiei MRF.

   DE CE EXISTA
   ------------
   Chrome pe Android NU stie `new Notification(...)` - arunca eroare si iti
   spune sa folosesti `ServiceWorkerRegistration.showNotification()`. Pe iPhone,
   notificarile nu exista deloc pentru o pagina obisnuita, si merg numai daca
   aplicatia e pusa pe ecranul de start SI notificarea vine tot de aici.
   Deci pe amandoua telefoanele drumul trece prin fisierul asta.

   Gasit pe 18 august 2026: scrisesem notificarea cu `new Notification()`, care
   merge pe calculator si NU merge pe telefon. El a apasat butonul si i-a scris
   "aparatul asta nu stie notificari".

   CE NU FACE
   ----------
   NU tine nimic in memorie (fara cache): paginile aplicatiei se schimba de
   cateva ori pe zi, iar un service worker care le tine ar arata versiuni
   vechi si ar fi greu de dat afara. Aici e doar pentru notificari.

   CE URMEAZA
   ----------
   Cand adaugam push adevarat prin Firebase (ca sa vina anuntul si cu
   aplicatia inchisa), tot aici se adauga ascultatorul de `push`. Deocamdata
   notificarile pleaca din pagina, cat timp aplicatia e deschisa.
*/

self.addEventListener('install', function (e) {
  // intra in functiune imediat, fara sa astepte inchiderea filelor vechi
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

/* Apesi pe notificare -> deschidem aplicatia, sau o aducem in fata daca e
   deja deschisa undeva. Fara asta, apasarea nu face nimic si pare stricata. */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var unde = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (lista) {
        for (var i = 0; i < lista.length; i++) {
          if ('focus' in lista[i]) return lista[i].focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(unde);
      })
  );
});

/* ASCULTATORUL DE `fetch` - fara el nu se instaleaza aplicatia adevarata.
   Chrome pe Android considera un site "instalabil" doar daca are manifest,
   iconita de 192, si un service worker CU ascultator de fetch. Daca lipseste,
   "Adauga pe ecran" face o simpla scurtatura - care arata la fel, dar ruleaza
   intr-un browser redus, fara notificari. Exact ce a patit el pe 18 august
   2026: aplicatia instalata ii spunea ca aparatul "nu stie notificari".

   Nu tinem nimic in memorie si nu schimbam nimic: lasam cererea sa treaca mai
   departe, neatinsa. Rolul lui e doar sa existe. Un service worker care ar
   pastra paginile ar fi chiar rau aici - se genereaza de cateva ori pe zi si
   ai ramane cu versiuni vechi. */
self.addEventListener('fetch', function (e) {
  // fara raspuns din partea noastra = merge exact ca fara service worker
  return;
});
