import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';

/* ---------------- LEGALE · Termini (#/termini) e Privacy (#/privacy) ----------------
   Pagine referenziate dai link legali del login (prima erano rotte).
   Testo portato 1:1 dalla bozza del sito (sito/termini.html, sito/privacy.html):
   è una BOZZA-MODELLO — le voci "da definire" vanno completate coi dati reali del
   titolare + revisione legale prima della pubblicazione e dell'invio agli store.
   (Gli store richiedono un URL privacy valido: quando il sito è online, questi testi
   e quelli del sito vanno tenuti allineati.) */

function page(title, updated, intro, sections) {
  return {
    html: `<div class="screen no-nav legal">
      <style>
      .legal .scroll{ padding:0 20px 26px; }
      .legal .lg-h1{ font-family:var(--serif); font-size:28px; font-weight:600; letter-spacing:-.02em; color:var(--ink); margin-top:6px; }
      .legal .lg-upd{ font-size:12px; color:var(--faint); margin-top:6px; }
      .legal .lg-note{ margin-top:14px; padding:12px 14px; background:var(--terra-pale); border:1px solid var(--terra); border-radius:12px;
        font-size:12.5px; line-height:1.55; color:var(--terra-deep); }
      .legal .lg-sec{ margin-top:20px; }
      .legal .lg-sec h2{ font-family:var(--serif); font-size:17px; font-weight:600; color:var(--ink); margin-bottom:6px; }
      .legal .lg-sec p{ font-size:14px; line-height:1.65; color:var(--ink-soft); }
      .legal .lg-sec p + p{ margin-top:8px; }
      .legal .lg-sec b{ color:var(--ink); }
      .legal em.dd{ font-style:normal; color:var(--terra-deep); font-weight:600; }
      </style>
      ${StatusBar()}
      <div class="toprow">
        <button class="iconbtn" data-back aria-label="Indietro">${Icon('arrow-left', { size: 18 })}</button>
        <span class="loc" style="flex:1;justify-content:center"><b>${title}</b></span>
        <span style="width:40px;flex:none"></span>
      </div>
      <div class="scroll">
        <h1 class="lg-h1">${title}</h1>
        <div class="lg-upd">Ultimo aggiornamento: <em class="dd">data — da definire</em></div>
        <div class="lg-note">${intro}</div>
        ${sections.map(s => `<section class="lg-sec"><h2>${s.h}</h2>${s.p.map(x => `<p>${x}</p>`).join('')}</section>`).join('')}
      </div>
    </div>`,
    onMount(el) {
      const b = el.querySelector('[data-back]');
      if (b) b.onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/'; };
    },
  };
}

const DD = t => `<em class="dd">${t}</em>`;

export function Termini() {
  return page('Termini di servizio', true,
    `Bozza-modello: le voci ${DD('da definire')} vanno completate coi dati reali del titolare e con una revisione legale prima della pubblicazione e dell'invio agli store.`,
    [
      { h: '1. Chi siamo e cosa facciamo', p: [
        `Gaia Food, gestito da ${DD('ragione sociale — da definire')} (“noi”), è un servizio che ti aiuta a trovare e contattare produttori veri di cibo, verificati di persona sul campo, vicino a te.`,
        `Mettiamo in contatto le persone con i produttori: <b>non vendiamo cibo e non gestiamo pagamenti</b> tra te e il produttore.`,
      ] },
      { h: '2. Cosa significa “verificato sul campo”', p: [
        `Il bollino “Verificato sul campo” indica che il nostro tecnologo alimentare ha visitato di persona il produttore alla data mostrata, con ri-controlli periodici. È un controllo in buona fede, <b>non una certificazione legale</b> né una garanzia su ogni singolo prodotto.`,
      ] },
      { h: '3. Account', p: [
        `Per usare Gaia Food ti registri con email o con Google. Sei responsabile della veridicità dei dati e della custodia delle credenziali.`,
      ] },
      { h: '4. Contatti e ritiro / consegna', p: [
        `I contatti e gli orari sono forniti dai produttori; il rapporto d'acquisto è <b>direttamente tra te e il produttore</b>. La consegna a domicilio, dove indicata “in arrivo”, non è ancora attiva.`,
        `Non siamo parte della transazione e non rispondiamo della qualità, sicurezza o disponibilità dei prodotti, salvo quanto previsto dalla legge.`,
      ] },
      { h: '5. Produttori', p: [
        `I produttori che si candidano dichiarano di poter pubblicare i propri dati e contenuti e ci autorizzano a mostrarli. Possiamo sospendere o rimuovere un produttore (es. verifica non superata o revocata).`,
      ] },
      { h: '6. Contatti', p: [
        `Per qualsiasi richiesta sui presenti Termini scrivi a ${DD('email — da definire')}.`,
      ] },
    ]);
}

export function Privacy() {
  return page('Informativa Privacy', true,
    `Bozza-modello: le voci ${DD('da definire')} vanno completate con i dati reali del titolare prima della pubblicazione e prima dell'invio agli store (Apple App Store / Google Play richiedono un URL di privacy valido). Si consiglia una revisione legale.`,
    [
      { h: '1. Titolare del trattamento', p: [
        `Il titolare del trattamento è ${DD('Ragione sociale — da definire')}, con sede in ${DD('indirizzo — da definire')}, P.IVA ${DD('da definire')}. Per richieste sulla privacy scrivi a ${DD('email privacy — da definire')}.`,
      ] },
      { h: '2. Quali dati raccogliamo', p: [
        `<b>Posizione</b> — solo se dai il consenso, e solo per mostrarti i produttori verificati più vicini. Puoi anche scegliere la zona a mano. Nessun tracciamento degli spostamenti.`,
        `<b>Dati dell'account</b> — email, numero di telefono o identificativo Google (a seconda del metodo scelto).`,
        `<b>Le tue preferenze</b> — produttori salvati, zona, filtri: conservati per migliorare la tua esperienza (in parte sul tuo dispositivo).`,
        `<b>Dati tecnici minimi</b> — informazioni di base sul dispositivo e log necessari al funzionamento e alla sicurezza.`,
        `Per i produttori che si candidano: dati dell'azienda, categorie, foto e contatti che scelgono di pubblicare.`,
      ] },
      { h: '3. Perché li trattiamo', p: [
        `Mostrarti i produttori veri vicino a te e farti contattare/raggiungere il produttore; gestire account, salvataggi e funzioni; garantire sicurezza e prevenire abusi.`,
        `<b>Non vendiamo i tuoi dati e non facciamo profilazione pubblicitaria.</b>`,
      ] },
      { h: '4. Base giuridica (GDPR)', p: [
        `Trattiamo i dati sulla base del tuo <b>consenso</b> (es. posizione), dell'<b>esecuzione del servizio</b> che richiedi e del <b>legittimo interesse</b> a mantenere il servizio sicuro.`,
      ] },
      { h: '5. I tuoi diritti', p: [
        `Puoi chiedere accesso, rettifica, cancellazione dei tuoi dati e la revoca del consenso in ogni momento, scrivendo a ${DD('email privacy — da definire')}.`,
      ] },
    ]);
}
