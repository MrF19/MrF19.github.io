/**
 * MRF - conturi, solduri, bilete si cheltuieli
 * ============================================
 * Se pune in Google Apps Script si se publica ca "Web app". De aici aplicatia
 * isi ia LISTA DE CONTURI (deci poti face si sterge conturi de pe telefon, fara
 * sa mai regenerez eu nimic), si tot aici isi trimit telefoanele soldurile.
 *
 * CUM SE PUNE (o singura data, ~5 minute):
 *  1. Intra pe https://script.google.com si apasa "New project".
 *  2. Sterge tot din editor si lipeste fisierul asta.
 *  3. Apasa Save (iconita de discheta), da-i un nume, ex "MRF".
 *  4. Apasa "Deploy" -> "New deployment".
 *  5. La "Select type" (rotita din stanga) alege "Web app".
 *  6. Completeaza:
 *        Description:  MRF
 *        Execute as:   Me (contul tau)
 *        Who has access:  Anyone            <-- IMPORTANT, altfel telefoanele
 *                                               nu pot citi nimic
 *  7. Apasa "Deploy", accepta permisiunile cerute (e scriptul tau, cere acces
 *     la propriile tale foi de calcul).
 *  8. Copiaza adresa care apare la "Web app URL" - arata cam asa:
 *        https://script.google.com/macros/s/AKfy....../exec
 *     Aia imi trebuie mie.
 *
 * Scriptul isi creeaza singur foaia de calcul la prima folosire, in Drive-ul
 * tau, cu numele "MRF - Conturi". Primul cont de admin se creeaza automat:
 *        utilizator: robert     parola: schimba-ma
 * Schimb-o din foaia de calcul (coloana "Parola") imediat ce intri prima data.
 *
 * DE STIUT, ca sa nu te bazezi gresit pe ea: parolele ajung pe telefon, iar
 * soldurile vin tot de pe telefon - deci cine se pricepe poate trimite alte
 * cifre. E o evidenta buna pentru tine si prieteni, la joaca, nu ceva pe care
 * sa pui bani adevarati.
 */

var NUME_FOAIE = 'MRF - Conturi';
var ADMIN_INITIAL = 'robert';
var PAROLA_INITIALA = 'schimba-ma';

function _ss() {
  var fisiere = DriveApp.getFilesByName(NUME_FOAIE);
  return fisiere.hasNext()
    ? SpreadsheetApp.open(fisiere.next())
    : SpreadsheetApp.create(NUME_FOAIE);
}

function _foaie(nume) {
  var ss = _ss();
  var f = ss.getSheetByName(nume);
  if (!f) {
    f = ss.insertSheet(nume);
    if (nume === 'Conturi') {
      f.appendRow(['Utilizator', 'Parola', 'Monede', 'Admin', 'Creat', 'Cote', 'Moderator']);
      f.appendRow([ADMIN_INITIAL, PAROLA_INITIALA, 1000, 'da', new Date(), 'da', 'da']);
    } else if (nume === 'Sesiuni') {
      f.appendRow(['Utilizator', 'Dispozitiv', 'Ultima activitate']);
    } else if (nume === 'Ascunse') {
      f.appendRow(['Id bilet', 'Sters de', 'Cand']);
    } else if (nume === 'Solduri') {
      f.appendRow(['Utilizator', 'Monede', 'Bilete puse', 'Ultima actualizare']);
    } else if (nume === 'Bilete') {
      f.appendRow(['Utilizator', 'Data', 'Cota', 'Miza', 'Stare', 'Selectii']);
    } else if (nume === 'Cheltuieli') {
      f.appendRow(['Utilizator', 'Data', 'Tip', 'Suma', 'Detalii', 'Sold dupa']);
    } else if (nume === 'Mesaje') {
      // Camera 'toti' e discutia comuna. Pentru discutiile intre doi, camera e
      // numele celor doi puse in ordine alfabetica si lipite cu | (ex.
      // 'alex|robert') - asa iese aceeasi camera indiferent cine scrie primul.
      f.appendRow(['Id', 'Camera', 'De la', 'Text', 'Cand']);
    } else if (nume === 'Blocati') {
      // 'Cine' poate fi un nume de cont sau numarul unui dispozitiv (pentru cei
      // fara cont, care scriu doar in camera comuna).
      f.appendRow(['Cine', 'Blocat de', 'Cand']);
    }
  }
  // Foaia "Conturi" exista deja de dinainte de chat, fara coloana "Moderator".
  // I-o adaugam o singura data, ca sa nu trebuiasca sa umbli tu prin foaie.
  if (nume === 'Conturi' && f.getLastColumn() < 7) {
    f.getRange(1, 7).setValue('Moderator');
  }
  return f;
}

/** Toate conturile, ca lista de obiecte. */
function _conturi() {
  var v = _foaie('Conturi').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var u = String(v[i][0] || '').trim().toLowerCase();
    if (!u) continue;
    out.push({
      rand: i + 1,
      user: u,
      parola: String(v[i][1] || ''),
      monede: Number(v[i][2] || 0),
      admin: String(v[i][3] || '').toLowerCase() === 'da',
      // Coloana "Cote": gol sau "da" inseamna ca vede cotele. Scrii "nu" si
      // vede doar procentele. Adminul o schimba dintr-un buton, din aplicatie.
      cote: String(v[i][5] === undefined || v[i][5] === '' ? 'da' : v[i][5])
              .toLowerCase() !== 'nu',
      // Coloana "Moderator": scrii "da" si poate bloca oameni din chat, fara sa
      // fie admin. Adminul poate mereu, indiferent ce scrie aici.
      moderator: String(v[i][6] || '').toLowerCase() === 'da'
    });
  }
  return out;
}

/** Id-urile biletelor AI pe care le-ai sters. */
function _ascunse() {
  var v = _foaie('Ascunse').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0] || '').trim();
    if (id) out.push(id);
  }
  return out;
}

function _gaseste(user) {
  var toate = _conturi();
  var u = String(user || '').trim().toLowerCase();
  for (var i = 0; i < toate.length; i++) if (toate[i].user === u) return toate[i];
  return null;
}

/** Verifica daca cel care cere e admin cu parola buna. */
function _eAdmin(user, parola) {
  var c = _gaseste(user);
  return !!(c && c.admin && c.parola === String(parola || ''));
}

var ORE_PASTRARE_MESAJE = 24;

/** Numele camerei pentru o discutie intre doi - aceeasi, indiferent cine scrie. */
function _camera(a, b) {
  var x = String(a || '').trim().toLowerCase();
  var y = String(b || '').trim().toLowerCase();
  return (x < y) ? (x + '|' + y) : (y + '|' + x);
}

/** Lista celor blocati (nume de cont sau numar de dispozitiv). */
function _blocati() {
  var v = _foaie('Blocati').getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var c = String(v[i][0] || '').trim().toLowerCase();
    if (c) out.push(c);
  }
  return out;
}

function _eBlocat(cine, dispozitiv) {
  var lista = _blocati();
  var a = String(cine || '').trim().toLowerCase();
  var b = String(dispozitiv || '').trim().toLowerCase();
  for (var i = 0; i < lista.length; i++) {
    if (a && lista[i] === a) return true;
    if (b && lista[i] === b) return true;
  }
  return false;
}

/** Poate bloca: adminul, sau cine are "da" in coloana Moderator. */
function _poateBloca(user, parola) {
  var c = _gaseste(user);
  return !!(c && c.parola === String(parola || '') && (c.admin || c.moderator));
}

/**
 * Sterge mesajele mai vechi de 24 de ore.
 * Se cheama la fiecare citire, deci nu e nevoie de nimic programat separat -
 * oricine deschide chatul curata si pentru ceilalti. Daca nu intra nimeni o
 * saptamana, mesajele stau acolo pana intra cineva; nu deranjeaza pe nimeni.
 */
function _curataMesaje() {
  var f = _foaie('Mesaje');
  var v = f.getDataRange().getValues();
  if (v.length < 2) return;
  var limita = new Date().getTime() - ORE_PASTRARE_MESAJE * 3600 * 1000;
  // stergem de jos in sus, ca sa nu se mute randurile sub noi
  for (var i = v.length - 1; i >= 1; i--) {
    var t = new Date(v[i][4]).getTime();
    if (!t || t < limita) f.deleteRow(i + 1);
  }
}

function _raspuns(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Aplicatia cere de aici lista de conturi:
 *     .../exec?ce=conturi
 * Contul de admin poate cere si restul:
 *     .../exec?ce=tot&user=...&parola=...
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.ce === 'conturi' || !p.ce) {
      var lista = _conturi().map(function (c) {
        return { user: c.user, parola: c.parola, monede: c.monede,
                 admin: c.admin, cote: c.cote, moderator: c.moderator };
      });
      return _raspuns({ ok: true, conturi: lista, ascunse: _ascunse(),
                        la: new Date().toISOString() });
    }
    if (p.ce === 'tot') {
      if (!_eAdmin(p.user, p.parola)) return _raspuns({ ok: false, err: 'nu esti admin' });
      var out = { ok: true, solduri: [], bilete: [], cheltuieli: [] };
      out.sesiuni = [];
      ['Solduri', 'Bilete', 'Cheltuieli', 'Sesiuni'].forEach(function (nume) {
        var v = _foaie(nume).getDataRange().getValues();
        var cheie = nume.toLowerCase();
        for (var i = 1; i < v.length; i++) out[cheie].push(v[i]);
      });
      return _raspuns(out);
    }
    if (p.ce === 'mesaje') {
      _curataMesaje();
      var camera = String(p.camera || 'toti').trim().toLowerCase();
      // La o discutie intre doi, doar cei doi o pot citi - si numai cu parola.
      if (camera !== 'toti') {
        var parti = camera.split('|');
        var cer = String(p.user || '').trim().toLowerCase();
        var contul = _gaseste(cer);
        if (!contul || contul.parola !== String(p.parola || '')) {
          return _raspuns({ ok: false, err: 'trebuie cont ca sa vezi discutia asta' });
        }
        if (parti.indexOf(cer) < 0) {
          return _raspuns({ ok: false, err: 'nu e discutia ta' });
        }
      }
      var dupa = Number(p.dupa || 0);
      var vm = _foaie('Mesaje').getDataRange().getValues();
      var mesaje = [];
      for (var im = 1; im < vm.length; im++) {
        if (String(vm[im][1] || '').toLowerCase() !== camera) continue;
        var idm = Number(vm[im][0] || 0);
        if (idm <= dupa) continue;
        mesaje.push({ id: idm, de_la: String(vm[im][2] || ''),
                      text: String(vm[im][3] || ''),
                      cand: new Date(vm[im][4]).toISOString() });
      }
      return _raspuns({ ok: true, mesaje: mesaje, blocati: _blocati(),
                        ore: ORE_PASTRARE_MESAJE });
    }
    if (p.ce === 'necitite') {
      // Cate mesaje noi sunt in camera comuna, ca sa punem cifra pe buton.
      _curataMesaje();
      var dupa2 = Number(p.dupa || 0), cate = 0;
      var vn = _foaie('Mesaje').getDataRange().getValues();
      for (var iz = 1; iz < vn.length; iz++) {
        if (String(vn[iz][1] || '').toLowerCase() !== 'toti') continue;
        if (Number(vn[iz][0] || 0) > dupa2) cate++;
      }
      return _raspuns({ ok: true, cate: cate });
    }
    return _raspuns({ ok: false, err: 'nu stiu ce vrei' });
  } catch (err) {
    return _raspuns({ ok: false, err: String(err) });
  }
}

/**
 * Aici vin doua feluri de mesaje:
 *   1. administrarea conturilor (doar adminul):
 *        {actiune:'adauga', admin:'robert', parolaAdmin:'...', user:'ion', parola:'1234', monede:1000}
 *        {actiune:'sterge', admin:'robert', parolaAdmin:'...', user:'ion'}
 *        {actiune:'parola', admin:'robert', parolaAdmin:'...', user:'ion', parola:'noua'}
 *        {actiune:'monede', admin:'robert', parolaAdmin:'...', user:'ion', suma:500}
 *        {actiune:'cote',   admin:'robert', parolaAdmin:'...', user:'ion', valoare:'nu'}
 *        (user:'*' schimba cotele pentru toate conturile deodata)
 *   2. raportarea starii unui cont, trimisa de telefon (ca pana acum).
 */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);

    // ── chat: trimiterea unui mesaj ──
    // Camera comuna e deschisa tuturor, si celor fara cont. Discutiile intre
    // doi cer cont si parola de la amandoi. Cine e blocat nu poate scrie
    // nicaieri.
    if (d.actiune === 'mesaj') {
      var cine = String(d.user || '').trim();
      var text = String(d.text || '').trim();
      if (!cine) return _raspuns({ ok: false, err: 'lipseste numele' });
      if (!text) return _raspuns({ ok: false, err: 'mesaj gol' });
      if (text.length > 500) text = text.substring(0, 500);
      var cam = String(d.camera || 'toti').trim().toLowerCase();

      if (_eBlocat(cine, d.dispozitiv)) {
        return _raspuns({ ok: false, err: 'nu mai poti scrie in chat' });
      }
      var contM = _gaseste(cine);
      if (cam !== 'toti') {
        if (!contM || contM.parola !== String(d.parola || '')) {
          return _raspuns({ ok: false, err: 'discutiile private cer cont' });
        }
        var pp = cam.split('|');
        if (pp.indexOf(cine.toLowerCase()) < 0) {
          return _raspuns({ ok: false, err: 'nu e discutia ta' });
        }
        if (!_gaseste(pp[0]) || !_gaseste(pp[1])) {
          return _raspuns({ ok: false, err: 'celalalt nu are cont' });
        }
      } else if (contM && contM.parola !== String(d.parola || '')) {
        // cineva scrie cu numele unui cont care exista, dar fara parola lui
        return _raspuns({ ok: false, err: 'numele asta e al unui cont' });
      }

      var fm = _foaie('Mesaje');
      var ultim = 0;
      var vv2 = fm.getDataRange().getValues();
      for (var iu = 1; iu < vv2.length; iu++) {
        var nid = Number(vv2[iu][0] || 0);
        if (nid > ultim) ultim = nid;
      }
      fm.appendRow([ultim + 1, cam, cine, text, new Date()]);
      return _raspuns({ ok: true, id: ultim + 1 });
    }

    // ── chat: blocare / deblocare (adminul si moderatorii) ──
    if (d.actiune === 'blocheaza' || d.actiune === 'deblocheaza') {
      if (!_poateBloca(d.user, d.parola)) {
        return _raspuns({ ok: false, err: 'n-ai voie sa blochezi' });
      }
      var tinta = String(d.cine || '').trim().toLowerCase();
      if (!tinta) return _raspuns({ ok: false, err: 'lipseste cine' });
      var ct = _gaseste(tinta);
      if (ct && ct.admin) return _raspuns({ ok: false, err: 'nu se blocheaza un admin' });
      var fb2 = _foaie('Blocati');
      var vb = fb2.getDataRange().getValues();
      var randB = -1;
      for (var ib = 1; ib < vb.length; ib++) {
        if (String(vb[ib][0] || '').trim().toLowerCase() === tinta) { randB = ib + 1; break; }
      }
      if (d.actiune === 'blocheaza') {
        if (randB < 0) fb2.appendRow([tinta, String(d.user || ''), new Date()]);
        return _raspuns({ ok: true, mesaj: tinta + ' nu mai poate scrie' });
      }
      if (randB > 0) fb2.deleteRow(randB);
      return _raspuns({ ok: true, mesaj: tinta + ' poate scrie din nou' });
    }

    // ── administrarea conturilor ──
    if (d.actiune) {
      if (!_eAdmin(d.admin, d.parolaAdmin)) return _raspuns({ ok: false, err: 'nu esti admin' });
      var f = _foaie('Conturi');
      var u = String(d.user || '').trim().toLowerCase();
      var peBilete = (d.actiune === 'ascunde_bilet' || d.actiune === 'arata_bilet');
      if (!u && !peBilete) return _raspuns({ ok: false, err: 'lipseste utilizatorul' });
      var existent = u ? _gaseste(u) : null;

      if (d.actiune === 'adauga') {
        if (existent) return _raspuns({ ok: false, err: 'exista deja' });
        f.appendRow([u, String(d.parola || ''), Number(d.monede || 1000), '', new Date()]);
        return _raspuns({ ok: true, mesaj: 'cont creat' });
      }
      if (d.actiune === 'sterge') {
        if (!existent) return _raspuns({ ok: false, err: 'nu exista' });
        if (existent.admin) return _raspuns({ ok: false, err: 'nu se sterge un admin' });
        f.deleteRow(existent.rand);
        return _raspuns({ ok: true, mesaj: 'cont sters' });
      }
      if (d.actiune === 'monede') {
        // Adaugam (sau scadem, daca suma e negativa) monede pentru un cont.
        // Cifra din coloana "Monede" e TOTALUL dat vreodata de tine, nu soldul
        // lui - telefonul lui isi tine soldul singur si adauga doar diferenta
        // fata de ce a vazut ultima oara. Asa poti da monede de oricate ori
        // vrei, fara sa se dubleze si fara sa stergi ce a castigat el.
        if (!existent) return _raspuns({ ok: false, err: 'nu exista' });
        var nou = Number(existent.monede || 0) + Number(d.suma || 0);
        f.getRange(existent.rand, 3).setValue(nou);
        return _raspuns({ ok: true, mesaj: 'total acum ' + nou, total: nou });
      }
      if (d.actiune === 'ascunde_bilet' || d.actiune === 'arata_bilet') {
        // Biletele facute de aplicatie se refac la fiecare rulare, deci nu le
        // putem sterge cu adevarat - dar tinem minte aici pe care le-ai scos,
        // si nu mai apar la nimeni. Se poate si da inapoi, daca te razgandesti.
        var fa = _foaie('Ascunse');
        var idb = String(d.idBilet || '').trim();
        if (!idb) return _raspuns({ ok: false, err: 'lipseste biletul' });
        var vv = fa.getDataRange().getValues();
        var gasit = -1;
        for (var k = 1; k < vv.length; k++) {
          if (String(vv[k][0] || '').trim() === idb) { gasit = k + 1; break; }
        }
        if (d.actiune === 'ascunde_bilet') {
          if (gasit < 0) fa.appendRow([idb, d.admin, new Date()]);
          return _raspuns({ ok: true, mesaj: 'bilet scos' });
        }
        if (gasit > 0) fa.deleteRow(gasit);
        return _raspuns({ ok: true, mesaj: 'bilet adus inapoi' });
      }
      if (d.actiune === 'cote') {
        // Comuta cotele pentru un cont, sau pentru TOATE deodata (user='*').
        // Procentele raman vizibile oricum - se schimba doar cotele.
        var vrea = (String(d.valoare || '').toLowerCase() === 'da') ? 'da' : 'nu';
        if (u === '*') {
          var toti = _conturi();
          for (var z = 0; z < toti.length; z++) {
            f.getRange(toti[z].rand, 6).setValue(vrea);
          }
          return _raspuns({ ok: true, mesaj: 'cote ' + vrea + ' pentru toti' });
        }
        if (!existent) return _raspuns({ ok: false, err: 'nu exista' });
        f.getRange(existent.rand, 6).setValue(vrea);
        return _raspuns({ ok: true, mesaj: 'cote ' + vrea });
      }
      if (d.actiune === 'moderator') {
        // Ii dai cuiva dreptul de a bloca oameni din chat, fara sa-l faci admin.
        if (!existent) return _raspuns({ ok: false, err: 'nu exista' });
        var vreaM = (String(d.valoare || '').toLowerCase() === 'da') ? 'da' : '';
        f.getRange(existent.rand, 7).setValue(vreaM);
        return _raspuns({ ok: true, mesaj: vreaM ? 'poate bloca' : 'nu mai poate bloca' });
      }
      if (d.actiune === 'parola') {
        if (!existent) return _raspuns({ ok: false, err: 'nu exista' });
        f.getRange(existent.rand, 2).setValue(String(d.parola || ''));
        return _raspuns({ ok: true, mesaj: 'parola schimbata' });
      }
      return _raspuns({ ok: false, err: 'actiune necunoscuta' });
    }

    // ── raportarea starii unui cont (de pe telefon) ──
    var user = String(d.user || 'necunoscut');
    var acum = new Date();

    var fs = _foaie('Solduri');
    var valori = fs.getDataRange().getValues();
    var rand = -1;
    for (var i = 1; i < valori.length; i++) {
      if (String(valori[i][0]) === user) { rand = i + 1; break; }
    }
    var linie = [user, Number(d.monede || 0), Number(d.nr_bilete || 0), acum];
    if (rand > 0) fs.getRange(rand, 1, 1, 4).setValues([linie]);
    else fs.appendRow(linie);

    // ── cine e conectat si de pe ce ──
    // Fiecare telefon isi are un numar al lui, generat o data si tinut in
    // memoria aplicatiei. Nu spune nimic despre om sau despre telefon - e doar
    // ca sa se poata deosebi doua aparate intre ele. De aici stim daca acelasi
    // cont e deschis pe doua telefoane, sau daca pe acelasi telefon s-au
    // deschis doua conturi.
    if (d.dispozitiv) {
      var fse = _foaie('Sesiuni');
      var vs = fse.getDataRange().getValues();
      var randS = -1;
      for (var k2 = 1; k2 < vs.length; k2++) {
        if (String(vs[k2][0]) === user && String(vs[k2][1]) === String(d.dispozitiv)) {
          randS = k2 + 1; break;
        }
      }
      var linieS = [user, String(d.dispozitiv), acum];
      if (randS > 0) fse.getRange(randS, 1, 1, 3).setValues([linieS]);
      else fse.appendRow(linieS);
    }

    if (d.bilete && d.bilete.length) {
      var fb = _foaie('Bilete');
      var randuri = d.bilete.map(function (b) {
        return [user, b.data || '', Number(b.cota || 0), Number(b.miza || 0),
                b.stare || '', (b.selectii || []).join(' | ')];
      });
      fb.getRange(fb.getLastRow() + 1, 1, randuri.length, 6).setValues(randuri);
    }

    if (d.miscari && d.miscari.length) {
      var fc = _foaie('Cheltuieli');
      var rc = d.miscari.map(function (m) {
        return [user, m.d || '', m.t || '', Number(m.s || 0), m.info || '',
                Number(m.sold || 0)];
      });
      fc.getRange(fc.getLastRow() + 1, 1, rc.length, 6).setValues(rc);
    }

    return _raspuns({ ok: true });
  } catch (err) {
    return _raspuns({ ok: false, err: String(err) });
  }
}
