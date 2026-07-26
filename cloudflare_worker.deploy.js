/* MRF - de lipit in editorul Cloudflare. Explicatiile: cloudflare_worker.js */
const PERMISE = ['https://mrf19.github.io', 'http://127.0.0.1:8900', 'http://127.0.0.1:8901'];
const FSIGN = 'SW9D1eZo', REFER = 'https://www.flashscore.ro/';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36', STAT =
  id => 'https://2.flashscore.ninja/2/x/feed/df_st_1_' + id;
const COTA = id => 'https://global.ds.lsapp.eu/odds/pq_graphql?_hash=oce&eventId=' + id +
                   '&projectId=9&geoIpCode=GB&geoIpSubdivisionCode=GBENG';

/* Amprenta raspunsului - identica cu `amprenta` din pagina. */
function amprenta(t) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/* Cote: pastram doar peste/sub 2,5 pe tot meciul. 500 KB pe meci -> 4 KB. */
function taieCote(text) {
  try {
    const o = JSON.parse(text).data.findOddsByEventId.odds || [], pastrat = [];
    for (const e of o) {
      if (e.bettingType !== 'OVER_UNDER' || e.bettingScope !== 'FULL_TIME') continue;
      const cote = (e.odds || []).filter(x => {
        const h = x.handicap && x.handicap.value;
        return h != null && Math.abs(parseFloat(h) - 2.5) <= 0.01;
      }).map(x => ({ selection: x.selection, value: x.value, active: x.active,
                     handicap: { value: x.handicap.value } }));
      if (cote.length) pastrat.push({ bettingType: 'OVER_UNDER', bettingScope: 'FULL_TIME',
        bookmakerId: e.bookmakerId, odds: cote });
    }
    return JSON.stringify({ data: { findOddsByEventId: { odds: pastrat } } });
  } catch (err) { return text; }
}

export default {
  async fetch(request) {
    const origine = request.headers.get('Origin') || '';
    const cors = { 'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Origin': PERMISE.includes(origine) ? origine : PERMISE[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const ps = new URL(request.url).searchParams;
    const antet = { 'x-fsign': FSIGN, 'Referer': REFER,
                    'User-Agent': request.headers.get('User-Agent') || UA };
    const nu = m => new Response(m, { status: 400, headers: cors });

    /* Un pachet, 40 odata (planul gratuit da 50 de sub-cereri pe pornire). */
    async function pachet(sir, adresa, ttl, taie) {
      const idr = sir.split(',').map(x => x.trim())
                     .filter(x => /^[A-Za-z0-9]{4,16}$/.test(x)).slice(0, 40);
      if (!idr.length) return nu('pachet gol');
      const bucati = await Promise.all(idr.map(async id => {
        try {
          const r = await fetch(adresa(id),
            { headers: antet, cf: { cacheTtl: ttl, cacheEverything: true } });
          if (!r.ok) return [id, null];
          const t = await r.text();
          return [id, taie ? taie(t) : t];
        } catch (e) { return [id, null]; }
      }));
      const out = {};
      for (const [id, t] of bucati) if (t) out[id] = t;
      return new Response(JSON.stringify(out), { headers: { ...cors, 'Content-Type':
        'application/json', 'Cache-Control': 'public, max-age=' + (ttl > 60 ? 300 : 15) } });
    }

    if (ps.get('pachet')) return pachet(ps.get('pachet'), STAT, 30, null);
    if (ps.get('cotepachet')) return pachet(ps.get('cotepachet'), COTA, 300, taieCote);

    const cote = ps.get('cote') || '';
    if (cote) {
      if (!/^[A-Za-z0-9]{4,16}$/.test(cote)) return nu('id nepermis');
      const rc = await fetch(COTA(cote), { headers: antet,
        cf: { cacheTtl: 300, cacheEverything: true } });
      return new Response(await rc.text(), { status: rc.status, headers: { ...cors,
        'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });
    }

    const feed = ps.get('feed') || '';
    if (!(/^f_1_-?\d+_\d+_[a-z]{2}_\d+$/.test(feed) ||
          /^df_(st|sui|sur)_1_[A-Za-z0-9]{4,16}$/.test(feed))) return nu('feed nepermis');

    const taiat = ps.get('doar') === 'scor' && feed.startsWith('f_'), cat = taiat ? 5 : 30;
    const r = await fetch('https://2.flashscore.ninja/2/x/feed/' + feed,
      { headers: antet, cf: { cacheTtl: cat, cacheEverything: true } });
    let text = await r.text();

    if (taiat && r.status === 200) {
      const NEVOIE = ['AA', 'AB', 'AC', 'AO', 'AG', 'AH'], bucati = [];
      for (const bloc of text.split('~')) {
        const m = {};
        for (const p of bloc.split('¬')) {
          const i = p.indexOf('÷');
          if (i > 0) m[p.substring(0, i)] = p.substring(i + 1);
        }
        if (m.AA) bucati.push(NEVOIE.filter(k => k in m)
                                    .map(k => k + '÷' + m[k]).join('¬'));
      }
      if (bucati.length) text = '~' + bucati.join('~');
      // pagina are deja exact asta? un caracter, nu 6,3 KB
      if (ps.get('de') === amprenta(text))
        return new Response('=', { headers: { ...cors, 'Content-Type':
          'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=' + cat } });
    }

    return new Response(text, { status: r.status,
      headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8',
                 'Cache-Control': 'public, max-age=' + cat } });
  },
};
