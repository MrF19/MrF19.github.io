/* Intermediarul pentru scorurile live.
   Se pune la Cloudflare (Workers & Pages -> Create Worker -> Edit code).

   DE CE EXISTA
   ------------
   Feedul cu scorurile cere antetul `x-fsign`. Browserul nu-l poate trimite
   catre alt site: cand pui un antet neobisnuit, intreaba intai serverul daca
   are voie, iar la intrebarea aia feedul nu raspunde. Deci telefonul nu poate
   cere direct.
   Intermediarul asta primeste cererea de la telefon, pune el antetul, si
   trimite raspunsul inapoi cu voie de citire pentru site-ul nostru.

   CAT COSTA: nimic. Cloudflare da 100.000 de cereri pe zi gratuit. Pagina
   cere la 5 secunde cat stai pe "Live" si la 15 in rest, dar numai cat se
   joaca ceva si numai cat te uiti la ea - cu ecranul stins nu cere nimic.
   Catre Flashscore pleaca cel mult 12 pe minut, oricati am fi: copia se tine
   5 secunde aici si toti primesc aceeasi copie.

   CE LASA SA TREACA: feedurile de scoruri ale zilei (f_1_<zi>_...),
   statisticile si sumarul unui meci, si cotele - fiecare si la bucata, si in
   pachet (?pachet= / ?cotepachet=). Nimic altceva. Daca cineva gaseste adresa
   si incearca sa treaca altceva prin ea, primeste refuz - ca sa nu ajunga
   intermediarul nostru unealta pentru altii.
*/

/* AMPRENTA RASPUNSULUI, ca sa nu trimitem de doua ori acelasi lucru.
   Masurat pe 22 august 2026, seara, cu 87 de meciuri in joc: 90 de cereri la o
   secunda distanta au adus O SINGURA data ceva nou. Feedul sta pe loc; se misca
   doar cand pica un gol.
   Deci pagina poate intreba des FARA sa plateasca: trimite amprenta a ce are
   (`&de=`), iar daca nimic nu s-a schimbat primeste un singur caracter in loc
   de 6,3 KB. La o cerere pe secunda, datele scad de la 22 MB pe ora la sub 1.
   Nu folosim ETag/304: pagina cere cu `cache:'no-store'`, si atunci browserul
   nu mai trimite `If-None-Match`. Asa tinem socoteala noi, si merge sigur.
   Functia trebuie sa fie IDENTICA in pagina - vezi `amprenta` din
   10_Genereaza_html.py. */
function amprenta(t) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/* COTELE UNUI MECI PENTRU DETALII: ?cotele=<idMeci> (14 septembrie 2026).
   El intra pe Flashscore si pentru "cotele si miscarea lor". Raspunsul lor are
   ~590 KB (toate pietele, toate casele, pe reprize); pagina arata 1X2, sansa
   dubla, ambele marcheaza si peste/sub 1,5-2,5-3,5 pe tot meciul, la fiecare
   casa, cu cota de ACUM (value) si cea de DESCHIDERE (opening). ~8 KB.
   Forma: {case:{id:nume}, piete:[{t:'1x2'|'sd'|'gg'|'ou', b:idCasa,
           o:[[cine, acum, deschidere, activ]]}]}
     cine: la 1x2/sd id-ul participantului (primul = gazda) sau 'x';
           la gg 'da'/'nu'; la ou 'p2.5' / 's2.5' etc. */
const PIETE = { HOME_DRAW_AWAY: '1x2', DOUBLE_CHANCE: 'sd', BOTH_TEAMS_TO_SCORE: 'gg', OVER_UNDER: 'ou' };
function taieCoteleMeciului(text) {
  try {
    const f = JSON.parse(text).data.findOddsByEventId, out = { case: {}, piete: [] };
    for (const b of ((f.settings || {}).bookmakers || [])) {
      if (b.bookmaker) out.case[b.bookmaker.id] = b.bookmaker.name;
    }
    for (const e of (f.odds || [])) {
      const t = PIETE[e.bettingType];
      if (!t || e.bettingScope !== 'FULL_TIME') continue;
      const o = [];
      for (const x of (e.odds || [])) {
        const h = x.handicap && x.handicap.value;
        if (t === 'ou' && !['1.5', '2.5', '3.5'].includes(String(h))) continue;
        const cine = t === 'gg' ? (x.bothTeamsToScore ? 'da' : 'nu')
                   : t === 'ou' ? (x.selection === 'OVER' ? 'p' : 's') + h
                   : (x.eventParticipantId || 'x');
        o.push([cine, x.value, x.opening, x.active ? 1 : 0]);
      }
      if (o.length) out.piete.push({ t, b: e.bookmakerId, o });
    }
    return JSON.stringify(out);
  } catch (err) { return null; }
}

/* ECHIPELE OFICIALE: df_li_1_<id> (14 septembrie 2026). Scoatem pozele si
   adresele de profil, pe care pagina nu le foloseste: 11 KB -> ~5 KB.
   Inainte de anunt feedul vine gol - si asa ramane. */
const FARA_LI = new Set(['LPG', 'LPI', 'LPL', 'LPX', 'LPZ', 'LPY', 'LPQ', 'NU']);
function taieFormatia(text) {
  return text.split('~').map(b => b.split('¬')
    .filter(p => !FARA_LI.has(p.split('÷')[0])).join('¬')).join('~');
}

/* GOLGHETERII: tt_<turneu>_<etapa> (14 septembrie 2026) - aceleasi doua id-uri
   ca la clasament. Pastram locul (UA), jucatorul (UF), golurile (UJ), pasele
   decisive (UK), echipa (UU) si id-ul ei (UT): 21 KB -> ~7 KB. */
const CU_TT = ['UA', 'UF', 'UJ', 'UK', 'UU', 'UT'];
function taieGolgheteri(text) {
  const out = [];
  for (const bloc of text.split('~')) {
    const m = {};
    for (const p of bloc.split('¬')) {
      const i = p.indexOf('÷');
      if (i > 0) m[p.substring(0, i)] = p.substring(i + 1);
    }
    if (m.UA) out.push(CU_TT.filter(k => k in m).map(k => k + '÷' + m[k]).join('¬'));
  }
  return out.length ? '~' + out.join('~') : text;
}

const COTE_ADRESA = id => 'https://global.ds.lsapp.eu/odds/pq_graphql?_hash=oce' +
  '&eventId=' + id + '&projectId=9&geoIpCode=GB&geoIpSubdivisionCode=GBENG';

const PERMISE = [
  'https://mrf19.github.io',
  'http://127.0.0.1:8900',
  'http://127.0.0.1:8901',
  'http://127.0.0.1:8902',   // previzualizarea (14 septembrie 2026)
];

export default {
  async fetch(request) {
    const origine = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': PERMISE.includes(origine) ? origine : PERMISE[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const u = new URL(request.url);
    const feed = u.searchParams.get('feed') || '';

    /* COTELE UNUI MECI: ?cote=<idMeci>
       El, 21 august 2026: "doar 539 din 1.355 sunt cotate de bet365
       deocamdata, multe apar live". Are dreptate, si asta schimba unde merita
       cerut: bet365 pune pret cand meciul intra in direct - adica exact la
       meciurile pe care le urmareste observatorul.
       Reperul semnalelor era pana acum modelul nostru la doua treimi din
       meciuri, desi pretul pietei e mai bun (modelul masurat -2,3%).
       Adresa e pe alt server decat feedurile de scor, deci trebuie lasata
       separat. Se cere cel mult o data pe meci, si o tinem 5 minute: cota nu
       se misca atat de repede incat sa merite mai des. */
    /* UN PACHET DE STATISTICI, INTR-O SINGURA PORNIRE: ?pachet=id1,id2,...
       El, 21 august 2026: "porneste-l odata cu serverul si lasa-l pornit si
       avem putine cereri". Un worker nu poate sta pornit - ruleaza o data
       pentru fiecare cerere, de aia se si numara invocarile. Dar ideea duce
       fix aici: daca o pornire poate aduce UN meci, sa aduca douazeci.
       Masurat inainte: serverul facea ~42.239 de cereri pe zi, adica aproape
       tot ce se vedea in panou. Cu pachetul, o tura inseamna o pornire in loc
       de douazeci.
       Limita gratuita e 50 de sub-cereri pe pornire, deci taiem la 40 si
       serverul trimite mai multe pachete daca are nevoie. */
    const pachet = u.searchParams.get('pachet') || '';
    if (pachet) {
      const idr = pachet.split(',').map(x => x.trim())
                        .filter(x => /^[A-Za-z0-9]{4,16}$/.test(x)).slice(0, 40);
      if (!idr.length) {
        return new Response('pachet gol', { status: 400, headers: cors });
      }
      const antet = {
        'x-fsign': 'SW9D1eZo',
        'Referer': 'https://www.flashscore.ro/',
        'User-Agent': request.headers.get('User-Agent') ||
                      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
      };
      const bucati = await Promise.all(idr.map(async id => {
        try {
          const r = await fetch(
            'https://2.flashscore.ninja/2/x/feed/df_st_1_' + id,
            { headers: antet, cf: { cacheTtl: 30, cacheEverything: true } });
          return [id, r.ok ? await r.text() : null];
        } catch (e) {
          return [id, null];
        }
      }));
      const out = {};
      for (const [id, t] of bucati) if (t) out[id] = t;
      return new Response(JSON.stringify(out), {
        headers: { ...cors, 'Content-Type': 'application/json',
                   'Cache-Control': 'public, max-age=15' },
      });
    }

    /* UN PACHET DE COTE: ?cotepachet=id1,id2,...
       El, 21 august 2026, dupa ce statisticile au trecut pe pachet: "da" - sa
       treaca si cotele.
       Erau ultimele care mai mergeau meci cu meci: o cerere pe meci, la zece
       minute. Nu costau mult - copia se tine cinci minute si e aceeasi pentru
       toate telefoanele - dar erau singurele ramase in tiparul vechi.
       Aceeasi socoteala ca la statistici: 40 odata, fiindca Cloudflare da 50
       de sub-cereri pe pornire.
       Raspunsul iese la fel: {id: textul primit}, si pagina il desface. */
    const cotepachet = u.searchParams.get('cotepachet') || '';
    if (cotepachet) {
      const idr = cotepachet.split(',').map(x => x.trim())
                        .filter(x => /^[A-Za-z0-9]{4,16}$/.test(x)).slice(0, 40);
      if (!idr.length) {
        return new Response('pachet gol', { status: 400, headers: cors });
      }
      const antet = {
        'x-fsign': 'SW9D1eZo',
        'Referer': 'https://www.flashscore.ro/',
        'User-Agent': request.headers.get('User-Agent') ||
                      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
      };
      /* TAIEM RASPUNSUL, ca la `&doar=scor`. Masurat pe 8 meciuri in joc,
         21 august 2026: raspunsul intreg are 3,89 MB (~500 KB pe meci!),
         fiindca aduce TOATE pietele, de la TOATE casele, si pe meci si pe
         reprize - iar noi citim o singura linie, peste/sub 2,5 pe tot meciul.
         Taiat la ce se citeste: 30,6 KB. De 130 de ori mai putin.
         Pastram exact campurile pe care le cauta si pagina, si observator.py
         (bettingType, bettingScope, bookmakerId, selection, value, active,
         handicap.value) - deci desfacerea lor merge NESCHIMBATA. Verificat pe
         aceleasi meciuri: 2,01 / 2,01 / 1,98 / 3,47 goluri, si inainte si
         dupa taiere. */
      const taieCote = (text) => {
        try {
          const o = JSON.parse(text).data.findOddsByEventId.odds || [];
          const pastrat = [];
          for (const e of o) {
            if (e.bettingType !== 'OVER_UNDER' || e.bettingScope !== 'FULL_TIME') continue;
            const cote = [];
            for (const x of (e.odds || [])) {
              const h = x.handicap && x.handicap.value;
              if (h === undefined || h === null || Math.abs(parseFloat(h) - 2.5) > 0.01) continue;
              cote.push({ selection: x.selection, value: x.value,
                          active: x.active, handicap: { value: h } });
            }
            if (cote.length) pastrat.push({
              bettingType: 'OVER_UNDER', bettingScope: 'FULL_TIME',
              bookmakerId: e.bookmakerId, odds: cote });
          }
          return JSON.stringify({ data: { findOddsByEventId: { odds: pastrat } } });
        } catch (err) {
          return text;        // forma neasteptata: dam mai departe ce am primit
        }
      };
      const bucati = await Promise.all(idr.map(async id => {
        try {
          const r = await fetch(
            'https://global.ds.lsapp.eu/odds/pq_graphql?_hash=oce' +
            '&eventId=' + id +
            '&projectId=9&geoIpCode=GB&geoIpSubdivisionCode=GBENG',
            { headers: antet, cf: { cacheTtl: 300, cacheEverything: true } });
          return [id, r.ok ? taieCote(await r.text()) : null];
        } catch (e) {
          return [id, null];
        }
      }));
      const out = {};
      for (const [id, t] of bucati) if (t) out[id] = t;
      return new Response(JSON.stringify(out), {
        headers: { ...cors, 'Content-Type': 'application/json',
                   'Cache-Control': 'public, max-age=300' },
      });
    }

    const cote = u.searchParams.get('cote') || '';
    if (cote) {
      if (!/^[A-Za-z0-9]{4,16}$/.test(cote)) {
        return new Response('id nepermis', { status: 400, headers: cors });
      }
      const adr = 'https://global.ds.lsapp.eu/odds/pq_graphql?_hash=oce' +
                  '&eventId=' + cote +
                  '&projectId=9&geoIpCode=GB&geoIpSubdivisionCode=GBENG';
      const rc = await fetch(adr, {
        headers: {
          'x-fsign': 'SW9D1eZo',
          'Referer': 'https://www.flashscore.ro/',
          'User-Agent': request.headers.get('User-Agent') ||
                        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
        },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      return new Response(await rc.text(), {
        status: rc.status,
        headers: { ...cors, 'Content-Type': 'application/json',
                   'Cache-Control': 'public, max-age=300' },
      });
    }

    const cotele = u.searchParams.get('cotele') || '';
    if (cotele) {
      if (!/^[A-Za-z0-9]{4,16}$/.test(cotele)) {
        return new Response('id nepermis', { status: 400, headers: cors });
      }
      const rc = await fetch(COTE_ADRESA(cotele), {
        headers: {
          'x-fsign': 'SW9D1eZo',
          'Referer': 'https://www.flashscore.ro/',
          'User-Agent': request.headers.get('User-Agent') ||
                        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
        },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      const t = rc.ok ? taieCoteleMeciului(await rc.text()) : null;
      return new Response(t || '{}', {
        status: t ? 200 : 502,
        headers: { ...cors, 'Content-Type': 'application/json',
                   'Cache-Control': 'public, max-age=' + (t ? 300 : 30) },
      });
    }

    /* Ce lasam sa treaca, si nimic altceva:
         f_1_<zi>_<mod>_en_1   lista zilei, cu scorurile - o cerere, toata ziua
         df_st_1_<id>          statisticile unui meci (posesie, suturi, cornere)
         df_sui_1_<id>         sumarul: goluri, cartonase, schimbari
         df_sur_1_<id>         scorul pe reprize, arbitru, stadion
       Ultimele trei se cer DOAR cand deschizi un meci, deci una pe meci
       deschis. Restul e refuzat, ca sa nu ajunga intermediarul unealta
       pentru altceva. */
    /* to_<turneu>_<etapa>_1 = CLASAMENTUL unei ligi (14 septembrie 2026, el:
       "nu putem face clasamentele sa fie live si sa nu asteptam rularea de la
       22?"). Pagina il cere cand deschizi clasamentul sau fisa unei echipe si
       dupa ce se termina un meci din liga. Se tine 2 minute aici, deci la
       Flashscore pleaca cel mult o cerere la doua minute pe liga. */
    const clasament = /^to_[A-Za-z0-9]{4,16}_[A-Za-z0-9]{4,16}_1$/.test(feed);
    /* tt_<turneu>_<etapa> = golgheterii, cerut cand deschizi fila (tinut 15 min);
       df_li_1_<id> = echipele oficiale, cerut cand deschizi un meci apropiat
       (tinut 1 min). 14 septembrie 2026 - vezi taieGolgheteri / taieFormatia. */
    const golgheteri = /^tt_[A-Za-z0-9]{4,16}_[A-Za-z0-9]{4,16}$/.test(feed);
    const formatia = /^df_li_1_[A-Za-z0-9]{4,16}$/.test(feed);
    /* r_1_1 = DOAR ce s-a schimbat in ultimele momente (goluri, stare, ceas),
       sub 1 KB, proaspat. Masurat 14 septembrie 2026: feedul zilei se schimba
       o data la ~3 minute (e o copie tinuta de ei, age=162 s), iar r_1_1 a
       adus golul la 2 s dupa site-ul lor, fata de 30 s prin feedul zilei.
       Se tine 1 s aici: la Flashscore pleaca cel mult o cerere pe secunda. */
    const schimbari = feed === 'r_1_1';
    const bun = /^f_1_-?\d+_\d+_[a-z]{2}_\d+$/.test(feed) ||
                /^df_(st|sui|sur)_1_[A-Za-z0-9]{4,16}$/.test(feed) ||
                clasament || golgheteri || formatia || schimbari;
    if (!bun) {
      return new Response('feed nepermis', { status: 400, headers: cors });
    }

    /* `&doar=scor` taie feedul zilei la ce foloseste aplicatia.
       Feedul intreg are 250 KB (46 KB comprimat) fiindca aduce numele
       echipelor, siglele, competitiile, cotele - lucruri pe care noi le avem
       deja in pagina, scrise la generare. Din el luam sase campuri:
           AA id-ul   AB starea   AC ce repriza   AO ceasul   AG/AH golurile
       Atat inseamna 10 KB, 2,5 KB comprimat - de 18 ori mai putin.
       Iese in ACEEASI scriere (`~` intre meciuri, `¬` intre campuri), deci
       aceeasi bucata de cod din pagina il desface, si o pagina veche care
       nu stie de `doar` primeste mai departe feedul intreg. */
    const taiat = u.searchParams.get('doar') === 'scor' && feed.startsWith('f_');

    /* Cat il tinem: 5 secunde cand e taiat, 30 altfel.
       El, 17 august 2026: "vreau sa am cat mai rapid scorul dar sa nu am
       nici problema sa fiu blocat".
       Cinci e cat cere si pagina, deci nimeni nu asteapta degeaba o copie
       veche. La Flashscore ajung cel mult douasprezece cereri pe minut,
       oricat de multe telefoane ar fi deschise - toate primesc aceeasi copie
       de aici. Mai jos n-are rost: masurat pe 17 august, cu 17 meciuri in
       joc, feedul aducea ceva nou cam o data pe minut. */
    const cat = taiat ? 5 : schimbari ? 1 : clasament ? 120 : golgheteri ? 900 : formatia ? 60 : 30;

    const adresa = 'https://2.flashscore.ninja/2/x/feed/' + feed;
    const r = await fetch(adresa, {
      headers: {
        'x-fsign': 'SW9D1eZo',
        'Referer': 'https://www.flashscore.ro/',
        'User-Agent': request.headers.get('User-Agent') ||
                      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
      },
      cf: { cacheTtl: cat, cacheEverything: true },
    });

    let text = await r.text();
    if (r.status === 200 && formatia) text = taieFormatia(text);
    if (r.status === 200 && golgheteri) text = taieGolgheteri(text);

    if (taiat && r.status === 200) {
      /* AJ / AK = cartonasele rosii ale gazdelor / oaspetilor (14 septembrie
         2026, el: "daca o echipa ia rosu sa apara in dreptul ei rosu"). Apar
         doar la meciurile cu rosu, deci adauga aproape nimic. */
      const NEVOIE = ['AA', 'AB', 'AC', 'AO', 'AG', 'AH', 'AJ', 'AK'];
      const bucati = [];
      for (const bloc of text.split('~')) {
        const m = {};
        for (const p of bloc.split('¬')) {
          const i = p.indexOf('÷');
          if (i > 0) m[p.substring(0, i)] = p.substring(i + 1);
        }
        if (!m.AA) continue;
        bucati.push(NEVOIE.filter((k) => k in m)
                          .map((k) => k + '÷' + m[k]).join('¬'));
      }
      // daca taierea n-a gasit nimic, dam feedul intreg mai departe:
      // mai bine mult decat gol
      if (bucati.length) text = '~' + bucati.join('~');
    }

    /* Daca pagina are deja exact asta, ii spunem doar atat. Un singur caracter
       in loc de tot feedul. Numai la feedul taiat: acolo se cere des. */
    if (taiat && r.status === 200 && u.searchParams.get('de') === amprenta(text)) {
      return new Response('=', {
        headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8',
                   'Cache-Control': 'public, max-age=' + cat },
      });
    }

    return new Response(text, {
      status: r.status,
      headers: {
        ...cors,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=' + cat,
      },
    });
  },
};
