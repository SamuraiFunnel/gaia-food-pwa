# Test — Gaia Food App

Test **a zero dipendenze**, con il runner integrato di Node (`node:test` + `node:assert`).
Niente Jest, niente build, niente `node_modules`: coerente con la filosofia dell'app.

## Come si lancia

```bash
npm test              # tutti i test (unit + integrazione)
npm run test:watch    # ri-esegue a ogni modifica
npm run test:coverage # con report di copertura
```

Il runner scopre da solo i file in `test/`. Ogni file gira in un **processo isolato**
(così ognuno può impostare il proprio `GF_DATA_DIR` temporaneo prima di importare `server.js`).

## Cosa copre oggi

| File | Livello | Cosa verifica |
|------|---------|---------------|
| `domain.test.mjs` | Unit (logica pura del server) | `slugify`, `num`/`str`, `EMAIL_RE`, `cleanVideo`/`cleanSeasonal`/`normalizePatch` (difesa da payload malformati), `throttle` (rate-limit), **`custodiSummary`** (credito €8/radicato, commissione €7,80, livelli, stato del seme per età) |
| `api.test.mjs` | Integrazione (HTTP reale su porta effimera + cartella dati usa-e-getta) | login email, sessione/cookie, profilo (nome/città/lingua/notifiche/zona), **referral Custodi**, waitlist, candidature, producers, permessi 401/403, **rate-limit 429**, Google 503 senza client id |
| `i18n.test.mjs` | Unit (front-end) | `t()` (fallback di chiave + interpolazione), `setLang()` (switch IT↔EN), `detectLang()` (scelta salvata > lingua dispositivo > EN) |

Copertura attuale: `i18n.js` ~100% righe · `server.js` ~74% righe.

## Come è testabile il server senza dipendenze

`server.js` si mette in ascolto **solo** se eseguito direttamente (`require.main === module`).
Quando è importato da un test esporta l'handler HTTP e le funzioni pure:

```js
process.env.GF_DATA_DIR = tempDir;              // dati isolati, non tocca ./data reale
const { requestHandler, custodiSummary } = await import('../server.js');
const server = http.createServer(requestHandler).listen(0); // porta effimera
```

## Isolamento del rate-limiting

I bucket del rate-limit sono in memoria e per-IP. Nei test che ne dipendono si passa un
`x-forwarded-for` diverso per test → bucket indipendenti, nessun accoppiamento tra test.

## Prossimi strati (da decidere con Daniele)

- Rotte **staff/admin** (mutazioni producers, revisione candidature, upload foto/video): richiedono sessione staff → coprire con login admin nei test di integrazione.
- **E2E UI** dei flussi critici (splash → login pop-up → home → dettaglio produttore → salva): formalizzare gli script CDP esistenti in un test ripetibile.
- Verifica **idToken Google** con `fetch` mockato (percorso di successo, oggi coperto solo il 503).
