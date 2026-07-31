/**
 * firebase.config.ts
 *
 * RESPONSABILITÀ UNICA: inizializzare Firebase SDK e gestire il ciclo di vita
 * di AppCheck. Questo file NON contiene logica di business, repository o utility.
 *
 * DIPENDENZE CONSENTITE: solo Firebase SDK packages.
 * NON importare da: components/, repositories/, core/, hooks/.
 *
 * NOTA: Il file services/firebase.ts originale è mantenuto intatto per compatibilità
 * retroattiva. Questo file è il punto di partenza del refactoring enterprise.
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore
} from 'firebase/firestore';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  getToken as getAppCheckToken,
  AppCheck
} from 'firebase/app-check';

// ─── VALIDAZIONE CONFIGURAZIONE ──────────────────────────────────────────────
// Verifica la presenza delle variabili d'ambiente critiche prima di procedere
// con l'inizializzazione. In assenza di chiavi, il modulo esporta null e lascia
// al chiamante la responsabilità di gestire il fallback (es. mock mode).
const REQUIRED_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID'
] as const;

const missingKeys = REQUIRED_ENV_KEYS.filter(key => !import.meta.env[key]);
export const isMissingConfig = missingKeys.length > 0;

if (isMissingConfig) {
  console.warn(
    '[firebase.config] Variabili d\'ambiente Firebase mancanti:',
    missingKeys,
    '— Il modulo non inizializzerà Firebase.'
  );
}

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || 'fitlink-424e8.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '737655151710',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '1:737655151710:web:6802f4348bd8a1085a68cf',
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     || 'G-VQDVN1M3RX',
};

// ─── ISTANZE SDK (null se config mancante) ───────────────────────────────────
let _app:      FirebaseApp | null = null;
let _auth:     Auth        | null = null;
let _db:       Firestore   | null = null;
let _appCheck: AppCheck    | null = null;

/**
 * Promise che si risolve quando AppCheck ha un token valido (o subito se
 * AppCheck non è configurato). TUTTI i fetch Firestore iniziali devono
 * attendere questa promise per evitare errori PERMISSION_DENIED da race
 * conditions durante il bootstrap.
 */
export let appCheckReady: Promise<void> = Promise.resolve();

export let isInitialized = false;

// ─── INIZIALIZZAZIONE ─────────────────────────────────────────────────────────
if (!isMissingConfig) {
  try {
    // Evita re-inizializzazioni in hot-reload (Vite HMR)
    _app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

    // ── 1. AppCheck DEVE essere inizializzato PRIMA di Auth e Firestore ──────
    // Questo previene l'errore "auth/firebase-app-check-token-is-invalid"
    // che si manifesta quando Auth viene agganciato prima che il provider
    // reCAPTCHA abbia emesso il primo token.
    if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
      if (import.meta.env.DEV) {
        // In sviluppo locale, il debug token bypassa la verifica reCAPTCHA.
        // WARNING: non committare mai un token di debug hardcoded in produzione.
        (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN =
          import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || '8f3b2075-8ea5-4f4c-b016-8c4349a46419';
        console.log('[firebase.config] DEV: App Check in debug mode.');
      }

      _appCheck = initializeAppCheck(_app, {
        provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      });

      // Pre-fetch del primo token: viene messo in cache internamente da Firebase SDK.
      // Le query Firestore successive non subiranno latenza aggiuntiva.
      // NOTA: usiamo exponential backoff implicito del SDK; non implementiamo
      // retry aggressivi personalizzati per evitare spam verso Firebase e
      // battery drain su mobile.
      appCheckReady = getAppCheckToken(_appCheck, false)
        .then(() => {
          console.log('[firebase.config] AppCheck token pronto.');
        })
        .catch((err) => {
          // Non rilanciamo: un token AppCheck mancante non deve bloccare l'intera
          // app. Le query Firestore falliranno individualmente e gestite dal
          // chiamante. Logghiamo per Sentry/telemetria futura.
          console.warn('[firebase.config] AppCheck token fetch fallito:', err);
        });
    } else {
      console.warn('[firebase.config] VITE_RECAPTCHA_SITE_KEY assente — AppCheck non attivo.');
    }

    // ── 2. Auth ───────────────────────────────────────────────────────────────
    _auth = getAuth(_app);
    // Persistenza locale: l'utente rimane loggato dopo reload/kill app.
    // NOTA: fire-and-forget intenzionale (allineato a firebase.ts originale L161).
    // La persistenza si applica al primo accesso; non blocchiamo l'init su di essa.
    setPersistence(_auth, browserLocalPersistence);

    // ── 3. Firestore con persistenza multi-tab ────────────────────────────────
    // persistentMultipleTabManager è necessario per evitare errori
    // "failed to get document because the client is offline" in scenari
    // multi-tab (tablet + telefono, o doppio tab browser).
    _db = initializeFirestore(_app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });

    isInitialized = true;

    // ── 4. Visibility wakeup: rinnovo token AppCheck dopo standby ────────────
    // Dopo che il dispositivo torna dalla sospensione, il token AppCheck può
    // essere scaduto → Firestore restituisce PERMISSION_DENIED → schermata
    // bianca. Refresh proattivo al ritorno in primo piano.
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && _appCheck) {
        appCheckReady = getAppCheckToken(_appCheck, true)
          .then(() => console.log('[firebase.config] AppCheck token rinnovato dopo wakeup.'))
          .catch((err) => console.warn('[firebase.config] AppCheck wakeup refresh fallito:', err));
      }
    });

  } catch (err) {
    console.error('[firebase.config] Inizializzazione Firebase fallita:', err);
    isInitialized = false;
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
// I repository importano queste istanze. Non esponiamo l'oggetto _app grezzo.
export const auth     = _auth;
export const db       = _db;
export const appCheck = _appCheck;
