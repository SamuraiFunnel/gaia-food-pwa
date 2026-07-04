# Deploy online — Gaia Food App (PWA)

Guida al deploy della PWA Gaia Food. Spiega **il vincolo tecnico**, le **tre opzioni** di
architettura, e i **passi concreti** per pubblicare l'opzione consigliata (A) su Vercel.

> Questi file (`vercel.json`, `.gitignore`, questo README) sono stati aggiunti **senza
> toccare** nessun file esistente dell'app. Dove serve modificare file esistenti, qui trovi
> **istruzioni**, non modifiche già applicate.

---

## 0. Com'è fatta l'app (in breve)

- **Frontend statico**: `index.html` + `css/` + `js/` + `assets/` + `data/*.json`.
  Vanilla JS, no build step. Carica MapLibre e i font Google da CDN.
- **Backend** `server.js`: server Node http nativo (zero dipendenze), porta `4324`. Fa due cose:
  1. serve lo statico;
  2. espone le API `/api/*`:
     - `GET /api/producers` → elenco produttori (pubblico, **lettura**);
     - `POST/PUT/DELETE /api/producers...` e upload foto → **scrittura** (admin / verificatore "Sasha");
     - `POST /api/login`, `/api/logout`, `GET /api/me` → auth a ruoli, password in `data/config.json`.
- **Persistenza**: le **scritture** finiscono su file dentro la cartella app:
  `data/producers.json` (i produttori) e `assets/photos/producers/` (le foto caricate).
  Le sessioni sono **in memoria** (un riavvio le perde).

### Punto chiave del frontend (è quello che rende l'opzione A indolore)

In `js/store.js`, `fetchData()` chiama **prima** `./api/producers`; se la chiamata fallisce
(es. su un host statico senza backend), **fa fallback su `./data/producers.json`**.
Quindi su Vercel, senza backend, l'app pubblica funziona già in **sola lettura** leggendo il
JSON statico. Nessuna modifica necessaria per andare online in lettura.

---

## 1. IL VINCOLO — perché non basta "buttare server.js su Vercel"

Vercel è **serverless** e il filesystem a runtime è **read-only / effimero**:
- non puoi scrivere su `data/producers.json` né salvare foto su `assets/photos/producers/`;
  ogni `writeFileSync` fallisce o viene perso al termine dell'invocazione;
- le **sessioni in memoria** (`new Map()`) non sopravvivono tra invocazioni serverless
  (ogni richiesta può girare su un'istanza diversa): il login admin si "smonterebbe".

Conseguenza: **la parte di SCRITTURA di `server.js` non funziona così com'è su Vercel.**
La parte di **lettura** (servire statico + `GET /api/producers`) invece sì.

---

## 2. LE TRE OPZIONI

### (A) CONSIGLIATA — Frontend statico su Vercel, editing separato  ⭐ pilota

- **Pubblico**: l'app va su Vercel come **sito statico**. Legge `data/producers.json`
  read-only (via fallback già esistente). HTTPS automatico → PWA installabile. Zero costo.
- **Editing (admin/Sasha)**: l'area riservata che SCRIVE gira **altrove**:
  - più semplice: **in locale** (`node server.js` sul Mac di Daniele) quando si aggiungono/verificano
    produttori; oppure
  - su un **piccolo host Node** (Render/Railway, vedi opzione C) usato solo come "back-office".
- **Flusso di pubblicazione dei dati**: si edita dove gira il backend → questo aggiorna
  `data/producers.json` (e le foto) → si fa **commit + push** del JSON/foto aggiornati →
  Vercel **ri-deploya** e l'app pubblica mostra i nuovi produttori.
- **Pro**: gratis, semplice, sicuro (nessuna API di scrittura esposta al pubblico),
  niente database da gestire. **Contro**: aggiornare i produttori richiede un
  commit/redeploy (non è "live" istantaneo). Per un pilota va benissimo.

> È l'opzione che i file di questa cartella (`vercel.json`) abilitano direttamente.

### (B) API come Vercel Serverless Functions + storage esterno

- Le rotte `/api/*` diventano **funzioni** in `app/api/` (runtime Node di Vercel) e la
  persistenza passa a uno **storage esterno**:
  - produttori → **Vercel KV / Postgres** oppure **Supabase** (Postgres + Storage per le foto);
  - foto → **Vercel Blob** o **Supabase Storage** (no filesystem locale);
  - sessioni → token **firmato/JWT** o store su KV (niente `Map` in memoria).
- **Pro**: editing **live** in produzione, tutto su un solo dominio. **Contro**: richiede
  **riscrivere** la logica di `server.js` in funzioni serverless + integrare un DB/Storage
  (lavoro non banale, possibili costi oltre il free tier). Da fare quando il pilota è validato.
- **Nota**: è un cambio che tocca file esistenti / ne aggiunge in `api/` → fuori dallo scope
  "solo file nuovi, non modificare l'esistente" di questo pacchetto. Documentato come rotta futura.

### (C) Host unico Node che esegue `server.js` così com'è

- Deploy del **server intero** (statico + API + scritture) su un host con filesystem
  persistente: **Render**, **Railway**, **Fly.io** (Docker o buildpack Node).
- Comando d'avvio: `node server.js` (legge `PORT` dall'ambiente — già supportato:
  `const PORT = process.env.PORT || 4324`).
- **Pro**: zero refactor, l'app gira identica al locale, editing live. **Contro**: il
  filesystem di questi host è **effimero su redeploy** (Render free/Railway: i file scritti
  si perdono a ogni deploy o riavvio, a meno di un **volume persistente** a pagamento);
  non è una PWA su CDN globale come Vercel. Buono come **back-office** dell'opzione A.

**Raccomandazione**: parti con **(A)**. Quando i produttori reali aumentano e serve editing
live in produzione, evolvi verso **(B)**. La **(C)** è utile fin da subito come ambiente di
editing comodo che alimenta il JSON dell'opzione A.

---

## 3. Pubblicare l'opzione (A) su Vercel — passi concreti

### Prerequisiti
- Account Vercel (free) e Vercel CLI: `npm i -g vercel` (oppure deploy dal sito).
- Il repo git è il monorepo **`Samurai Suite`**; questa app vive in
  `Samurai Body/Gaia Food App/app/`. Su Vercel imposterai questa come **Root Directory**.

### Deploy da dashboard Vercel (consigliato)
1. **Importa il progetto** da GitHub (o connetti il repo) su https://vercel.com/new.
2. **Root Directory** → seleziona `Samurai Body/Gaia Food App/app`.
3. **Framework Preset** → **Other** (è statico, niente build).
   - Build Command: *(vuoto)*
   - Output Directory: *(vuoto / `.`)*  — Vercel serve i file così come sono.
4. `vercel.json` (in questa cartella) è già configurato: header per `.webmanifest`, `sw.js`
   no-cache, cache statica, e **rewrite SPA** che manda i path "non-file" su `index.html`.
5. **Deploy**. Otterrai un dominio `*.vercel.app` in HTTPS.

### Deploy da CLI (alternativa)
```bash
cd "Samurai Body/Gaia Food App/app"
vercel        # primo deploy: rispondi alle domande, scope = la root di questa cartella
vercel --prod # promuove a produzione
```

### Aggiornare i produttori (flusso opzione A)
1. In locale: `node server.js`, apri `http://localhost:4324`, entra nell'area riservata,
   aggiungi/verifica produttori e foto → si aggiornano `data/producers.json` e
   `assets/photos/producers/`.
2. **Importante (foto)**: `.gitignore` esclude `assets/photos/producers/` (sono caricate a
   runtime). Se vuoi che le foto dei produttori reali compaiano sull'app pubblica, devi
   **versionarle** comunque. Due strade:
   - togli/eccettua quella riga del `.gitignore` per le foto che vuoi pubblicare, **oppure**
   - referenzia le foto già presenti in `assets/photos/*.png` (quelle del demo, versionate).
3. `git add` del `data/producers.json` (e foto da pubblicare) → `commit` → `push`.
   Vercel ri-deploya in automatico; l'app pubblica mostra i dati aggiornati.

---

## 4. Password in variabili d'ambiente (NON in chiaro nel repo)

**Problema attuale**: le password stanno in chiaro in `data/config.json`
(`adminPassword`, `verifierPassword`). Quel file è servito come statico → su un host
pubblico **chiunque potrebbe leggerlo** a `…/data/config.json`. **Da NON pubblicare così.**

Per l'opzione **A** (app pubblica statica, sola lettura) la cosa più sicura è **non pubblicare
affatto le password**: l'editing gira in locale/back-office, non sul dominio pubblico.

### Istruzioni (da applicare tu, non applicate qui)
- **Non committare `data/config.json` con password vere.** Tienilo solo in locale, oppure
  committa solo un placeholder (es. `data/config.example.json`) e aggiungi `data/config.json`
  al `.gitignore`.
- **Modifica consigliata a `server.js`** (back-office locale o host Node, opz. C): leggere le
  password da **env-var** invece che dal file. Sostituisci la funzione `config()` /
  l'uso di `cfg.adminPassword` con qualcosa come:

  ```js
  // invece di leggere data/config.json:
  const config = () => ({
    adminPassword: process.env.GF_ADMIN_PASSWORD,
    verifierPassword: process.env.GF_VERIFIER_PASSWORD,
  });
  ```

  e avvia con le variabili impostate:
  ```bash
  GF_ADMIN_PASSWORD='...' GF_VERIFIER_PASSWORD='...' node server.js
  ```
- **Su Render/Railway (opzione C)**: imposta `GF_ADMIN_PASSWORD` e `GF_VERIFIER_PASSWORD`
  nelle **Environment Variables** del servizio (mai nel repo). In locale usa un file `.env`
  (già ignorato da `.gitignore`); per leggerlo senza dipendenze: `node --env-file=.env server.js`.
- **Cambia le password di default** (`gaia-admin-2026`, `sasha-2026`): erano placeholder.

> Riassunto: nell'opzione A il pubblico non vede password perché l'API di scrittura non è
> online. Se un giorno esponi l'editing (opz. B/C), allora le password **devono** stare in
> env-var, e `data/config.json` con password vere **non** deve essere pubblico.

---

## 5. Nota PWA (HTTPS, installabilità)

- **HTTPS è obbligatorio** per service worker + installazione PWA. Vercel lo dà automatico
  sul dominio `*.vercel.app` (e su domini custom). ✓
- Il **service worker** (`sw.js`) è registrato in `index.html` con path relativo `./sw.js`;
  servito dalla root, ha scope `/`. `vercel.json` gli mette `Cache-Control: max-age=0` così
  gli aggiornamenti arrivano subito (e `Service-Worker-Allowed: /`).
- **Manifest**: `manifest.webmanifest` è servito con
  `Content-Type: application/manifest+json` (impostato in `vercel.json`). `display: standalone`,
  `start_url: ./`, icona 512×512 → requisiti minimi di installabilità soddisfatti.
- **Limite icone (consiglio, non bloccante)**: il manifest ha **una sola icona** 512×512 con
  `purpose: "any maskable"`. Per un'installazione più pulita su Android/Chrome aggiungi
  un'icona **192×192** e separa `any` da `maskable`. Modifica da fare in `manifest.webmanifest`
  (file esistente → non toccato qui).
- **Dipendenze CDN**: MapLibre e i font Google sono caricati da CDN esterne. Online funzionano;
  **offline** (primo avvio senza rete) la mappa/i font potrebbero non caricarsi perché il
  service worker non li mette in cache (lascia passare le origin esterne). Non bloccante per il go-live.

---

## 6. Checklist pre-lancio

- [ ] **Password fuori dal pubblico**: `data/config.json` con password vere NON è raggiungibile
      online (opzione A) oppure è stato spostato in env-var (opzione B/C). Default cambiate.
- [ ] **Root Directory** su Vercel = `Samurai Body/Gaia Food App/app`, preset **Other**, build vuota.
- [ ] **`vercel.json` valido** e presente (header webmanifest, sw no-cache, rewrite SPA). ✓
- [ ] **App carica in sola lettura**: aprendo il dominio Vercel, i produttori compaiono
      (fallback su `data/producers.json` ok, anche con `/api/producers` assente).
- [ ] **HTTPS attivo** e **PWA installabile** (prompt "Aggiungi a schermata Home" su mobile).
- [ ] **Service worker** si registra senza errori (DevTools → Application → Service Workers).
- [ ] **Manifest** parsato senza warning bloccanti (DevTools → Application → Manifest).
- [ ] **Dati reali**: `data/producers.json` contiene i produttori da mostrare; le **foto**
      referenziate esistono e sono versionate (attenzione alla riga `.gitignore` su
      `assets/photos/producers/`).
- [ ] **Mappa**: i tile MapLibre si caricano online (verifica console per errori CDN/CORS).
- [ ] **Smoke test mobile**: ricerca, filtri categoria, dettaglio produttore, salva preferiti.
- [ ] **Editing**: definito DOVE si aggiornano i produttori (locale / host Node) e il flusso
      commit→push→redeploy è chiaro a chi cura i dati.
