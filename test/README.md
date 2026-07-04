# Test — Gaia Food App

Test **a zero dipendenze**, con il runner integrato di Node (`node:test` + `node:assert`).
Niente Jest, niente build, niente `node_modules`: coerente con la filosofia dell'app.

## Come si lancia

```bash
npm test              # tutti i test (unit + integrazione) — NON serve un browser
npm run test:watch    # ri-esegue a ogni modifica
npm run test:coverage # con report di copertura
npm run test:e2e      # smoke end-to-end del flusso critico (richiede Chrome, gira a parte)
```

Il runner scopre da solo i file in `test/`. Ogni file gira in un **processo isolato**
(così ognuno può impostare il proprio `GF_DATA_DIR` temporaneo prima di importare `server.js`).

## Cosa copre oggi

| File | Livello | Cosa verifica |
|------|---------|---------------|
| `domain.test.mjs` | Unit (logica pura del server) | `slugify`, `num`/`str`, `EMAIL_RE`, `cleanVideo`/`cleanSeasonal`/`normalizePatch` (difesa da payload malformati), `throttle` (rate-limit), **`custodiSummary`** (credito €8/radicato, commissione €7,80, livelli, stato del seme per età) |
| `api.test.mjs` | Integrazione (HTTP reale su porta effimera + cartella dati usa-e-getta) | login email, sessione/cookie, profilo (nome/città/lingua/notifiche/zona), **referral Custodi**, waitlist, candidature, producers, permessi 401/403, **rate-limit 429**, Google 503 senza client id |
| `staff.test.mjs` | Integrazione (rotte STAFF/admin) | login staff + 429, **producers CRUD** (create/patch/foto/video/delete), **revisione candidature**, GET waitlist, logout |
| `google.test.mjs` | Integrazione (`fetch` mockato) | login Google: successo (utente creato + cookie), `aud` errato, email non verificata, tokeninfo non-ok, rete giù (502), idToken mancante |
| `i18n.test.mjs` | Unit (front-end) | `t()` (fallback di chiave + interpolazione), `setLang()` (switch IT↔EN), `detectLang()` (scelta salvata > lingua dispositivo > EN) |
| `../e2e/smoke.mjs` | **E2E** (Chrome headless, CDP) | flusso reale Splash → pop-up login → email → zona Abruzzo → Home con produttori → sessione riconosciuta dal backend |

Copertura backend (unit+integrazione): `server.js` ~92% righe · `i18n.js` ~100% righe · ~94% complessivo.

## Cosa ha già trovato il testing

- **Reload al primo avvio** (index.html): alla prima visita il service worker, quando prende il
  controllo, ricarica la pagina una volta (`controllerchange → location.reload()`). È un flicker
  una-tantum per l'utente reale; l'E2E lo "scalda" prima di partire. Fix consigliato: ricaricare
  solo su un **aggiornamento** del SW, non al primo claim. (da decidere con Daniele)
- Il `try/catch` attorno a `localStorage` in `detectLang()` è **necessario** (Node 25 ha un
  `localStorage` nativo che lancia senza `--localstorage-file`): confermato da un test.

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

## Prossimi strati possibili (da decidere con Daniele)

- Applicare il **fix del reload SW** al primo avvio (vedi sopra) e coprirlo con un test.
- Altri flussi E2E: dettaglio produttore → salva, ricerca/filtri, sezione Custodi, cambio lingua.
- Verifica **idToken Google** con firma reale (oggi il `fetch` è mockato: è il compromesso giusto
  per non dipendere dalla rete, ma un test "contract" contro un token di prova sarebbe un plus).
