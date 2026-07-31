# Vibe Gym Enterprise Architecture & Coaching Engine — Master Report

## 1. Executive Technical Overview

Il presente report documenta l'analisi architetturale e la roadmap di transizione per il sistema Vibe Gym, passando da un'architettura React monolitica accoppiata a Firebase a un sistema "Offline-First Enterprise-Grade" basato su Domain-Driven Design (DDD).

### 1.1 Problemi Architetturali Attuali e Debito Tecnico
L'attuale codebase presenta un elevato grado di accoppiamento infrastrutturale. Il file `firebase.ts` agisce come un *God Object* (Service Locator), mescolando l'inizializzazione del client, l'accesso ai dati (Repositories), le regole di business e l'orchestrazione degli analytics. I componenti React gestiscono logica di dominio complessa (orchestrazione, mutazioni, calcoli di volume), causando rendering inefficienti e impossibilità di esecuzione di unit test isolati.

### 1.2 Rischi di Scalabilità e Race Conditions
L'assenza di un layer di astrazione per il fetching dei dati e per le mutazioni ottimistiche espone il sistema a race conditions, specialmente durante transizioni di rete intermittenti. Le operazioni di batching (`archiveOldLogs`) rischiano di incorrere nei limiti fisici dei documenti Firestore (1MB max), portando a fallimenti irreversibili durante il salvataggio dei log storici.

### 1.3 Problemi Offline/PWA e Limiti Cache
L'uso di Tailwind via CDN e l'assenza di una coda di persistenza offline locale (IndexedDB) annullano le capacità PWA. L'impiego del Service Worker con `autoUpdate` o aggiornamenti incondizionati durante una sessione attiva provoca il reload silente del contesto JS (FOUC o perdita di stato). Safari su iOS introduce eviction asincrone della memoria quando l'app è in background, distruggendo lo stato non persistito del workout.

### 1.4 Sicurezza, Validazione Runtime e iOS Edge Cases
TypeScript offre sicurezza a tempo di compilazione, ma i payload restituiti da Firestore non sono validati a runtime. Questo introduce la possibilità di corruzione del dominio client-side (es. documenti legacy con schemi incompleti). Manca una definizione rigorosa delle Firestore Security Rules, esponendo a rischi di enumerazione utenti e alterazione dei dati.

---

## 2. Enterprise Folder Architecture

La codebase adotterà una separazione rigorosa delle responsabilità. Ogni violazione dei *dependency boundaries* tra i layer verrà considerata un anti-pattern bloccante in fase di CI.

```text
src/
 ├── app/           # Entry point, router configuration, global providers.
 ├── core/          # Domain Models (Entities, Value Objects). Nessuna dipendenza da React/Firebase.
 ├── services/      # IO esterno, API esterne, configurazione SDK (es. Firebase init).
 ├── repositories/  # Livello di astrazione dati (Firestore). Ritorna DTOs.
 ├── hooks/         # React hooks puramente funzionali (astrazioni UI e state).
 ├── features/      # Moduli verticali indipendenti (es. WorkoutLogger, PTDashboard).
 ├── components/    # Componenti UI presentazionali "dumb", riutilizzabili.
 ├── date/          # Date & Timezone Engine (formattazione, analytics temporali).
 ├── utils/         # Funzioni helper pure (matematica pura, formatter stringhe).
 ├── types/         # Interfacce TypeScript globali e type definitions.
 ├── schemas/       # Zod schemas per la validazione runtime.
 ├── offline/       # Sync Engine, IndexedDB queue, conflict resolution.
 ├── workers/       # Web/Service Workers per calcoli in background o cache.
 ├── ai/            # Deterministic Coaching Engine & AI Recommendations.
 ├── tests/         # Unit, integration, E2E e utilities per testing.
 └── config/        # Environment variables validation, costanti globali.
```

### 2.1 Regole di Dipendenza
*   `core/` non può importare nulla al di fuori di `types/` e `utils/`.
*   `components/` non può importare da `repositories/` (deve passare tramite `hooks/` o state manager).
*   `repositories/` dipende da `schemas/` per la validazione dei DTO.

---

## 3. Data Validation & Runtime Safety Layer

### 3.1 Zod Architecture
Ogni interazione di lettura/scrittura con Firestore è vincolata al passaggio attraverso un layer di validazione **Zod**. `any` è vietato nei payload di I/O.
1.  **Repository Fetch:** Firestore restituisce dati raw (un-typed).
2.  **Schema Parsing:** Il Repository passa il payload raw allo schema Zod corrispondente (es. `WorkoutSessionSchema.parse(rawData)`).
3.  **Domain Mapping:** Il DTO validato viene mappato in una Domain Entity per l'uso nell'applicazione.

### 3.2 Backward Compatibility e Fallback Strategy
Gli schemi Zod devono implementare valori di default e trasformazioni per i campi aggiunti nelle nuove versioni (`.catch()` o `.default()`), assicurando che i documenti legacy creati con vecchie versioni dell'app non causino crash a runtime. Eventuali payload corrotti in modo irrecuperabile devono generare log verso Sentry senza bloccare l'intero stream di dati (omissione parziale via `z.array().catch()`).

---

## 4. Firebase & Repository Refactor

### 4.1 Distruzione del God Object
Il file `firebase.ts` viene eliminato. Le responsabilità sono così distribuite:
*   `services/firebase.config.ts`: Solo inizializzazione di App, Auth, Firestore e AppCheck.
*   `repositories/workout.repository.ts`: Espone metodi CRUD specifici (`getById`, `listByUser`, `save`, `upsert`, `softDelete`).

### 4.2 Offline Sync e Conflict Resolution
L'architettura abbandona la delega totale alla persistenza nativa di Firestore in favore di una gestione esplicita. Le scritture in offline vengono salvate in una tabella IndexedDB (via Dexie).
*   **Optimistic Updates:** La UI si aggiorna istantaneamente assumendo il successo della scrittura.
*   **Retry Policy:** L'`offline/SyncEngine` implementa un Exponential Backoff per i tentativi di sincronizzazione falliti.

### 4.3 Transaction Strategy e Batching
Qualsiasi operazione che modifichi aggregati multipli (es. terminare un workout e aggiornare l'historical PR) deve avvenire in una *Firestore Transaction* per garantire atomicità.

---

## 5. Offline-First Infrastructure

La PWA è declassata da "Sito Cacheato" a "Runtime Infrastructure Layer".

### 5.1 Service Worker Lifecycle & Workout Lock
*   **Registrazione:** `vite-plugin-pwa` configurato con `registerType: 'prompt'`.
*   **Workout Lock:** La funzione `onNeedRefresh` del Service Worker deve verificare uno stato persistente (Zustand/IndexedDB) `isWorkoutActive`. Se true, il prompt di aggiornamento è soppresso fino al completamento della sessione. Un SW non deve mai causare reload non richiesti.

### 5.2 Strategie di Cache Rigorose (Workbox)
*   **Cache First:** App Shell, CSS compilato, icone UI, font, manifest.
*   **Stale While Revalidate (SWR):** SDK Firebase, moduli JS non critici.
*   **Network First:** Payload Analytics, configurazioni PT, metriche di fatturazione.
*   **Background Sync:** Code IndexedDB gestite localmente, con `SyncManager` API per il retry in background.
*   **Versioning:** Implementazione di `CACHE_VERSION` iniettato a build time per invalidazione forzata.

### 5.3 Persisted Workout Session e App Kill
Per gestire la *memory eviction* asincrona di iOS Safari e l'uccisione intenzionale dell'app:
Ogni variazione di stato durante un workout (RPE draft, tick del timer, completamento set) è serializzata sincronicamente su IndexedDB (tabella `activeSession`). Al "Cold Start", l'app verifica l'esistenza di uno stato sospeso e offre il resume immediato.

---

## 6. Tailwind Enterprise Migration

### 6.1 Transizione da CDN a PostCSS
Il runtime CDN di Tailwind viene rimosso definitivamente.
*   **Purge Config (`tailwind.config.js`):**
    `content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]`
    La configurazione evita rigidamente path assoluti o wildcard che includano `node_modules`, prevenendo CSS bloat e rallentamenti in CI.
*   **Safelist Dinamica:** Componenti UI che calcolano classi a runtime (es. sfondi basati su RPE) devono registrare le interpolazioni nella `safelist` del config.
*   **FOUC Prevention:** Il file generato `index.css` è sottoposto a caching aggressivo (Cache First) nel Service Worker. Anche offline o con ritardi di parsing JS, l'app si renderizza interamente stilizzata.

---

## 7. Date & Timezone Engine

### 7.1 Refactoring Modulare (Cartella `/date`)
Il monolite `date.utils.ts` è suddiviso:
*   `formatting.ts`: Funzioni pure per conversione stringhe UI (es. "Oggi", "Lunedì").
*   `ranges.ts`: Logica di limite (inizio mese, fine mese, settimana corrente).
*   `timezone.ts`: Conversione esplicita UTC ↔ Locale per evitare spostamenti di giorni dovuti ai salvataggi a cavallo della mezzanotte (*Midnight Rollover*).
*   `analytics.ts`: Calcoli di differenza giorni, grouping per i grafici.

### 7.2 Timestamp Authority
Nessuna affidabilità è data all'orologio del client. I documenti persistiti su Firestore usano `serverTimestamp()`. IndexedDB usa timestamp locali solo per ordinamento deterministico della coda offline (Last Write Wins a parità di risoluzione conflitti).

---

## 8. Workout Domain Model

### 8.1 Entità e Value Objects (`/core/domain/`)
*   `Exercise`: Entità che modella la configurazione. Contiene `EquipmentType` (enum stretto: `barbell`, `dumbbell`, `machine`, `cable`, `kettlebell`, `bodyweight`, `other`).
*   `WorkoutSession`: Aggregato radice. Contiene liste di `WorkoutLog`.
*   `PersonalRecord`: Entità derivata o inserita manualmente, immutabile per singola entry.
*   **Unilateral Logic:** Se `isUnilateral === true`, l'aggregato di volume calcola deterministicamente `weight * 2 * reps`.
*   **Historical Consistency:** I parametri modificatori di volume (come il peso corporeo in calisthenics) vengono cristallizzati come "frozen metadata" (`bodyweightAtLog`) al momento del salvataggio. Le alterazioni future dell'anagrafica non retroagiscono sui grafici storici.

---

## 9. Calisthenics Engine

### 9.1 Logica del Peso Corporeo
*   Volume Formula: `(bodyweightAtLog + zavorra) * reps`.
*   Se l'atleta non imposta il peso nel profilo, subentra un *Fallback Strategy* (70kg uomo/60kg donna) silenzioso, per non bloccare l'allenamento, accoppiato a un banner UI post-workout.
*   **Workload Score:** La UI omette la visualizzazione del tonnellaggio lordo e mostra la "Zavorra", prevenendo sfiducia psicologica dovuta a delta matematici enormi rispetto ai pesi liberi.

### 9.2 Progression Thresholds
I limiti di ipertrofia per esercizi a corpo libero sono dinamici e dipendenti da `groupId`:
*   Pulling: 12 reps
*   Pushing: 20 reps
*   Legs: 15 reps
Sopra tali soglie (Hypertrophy Caps), l'AI smette di suggerire rep extra e forza l'indicazione di inserimento zavorra. Questi parametri saranno strutturati per poter essere sovrascritti a livello di singolo `UserProfile` in futuro.

---

## 10. Warm-Up Smart Engine

### 10.1 Strategy Pattern Implementation
L'engine `/core/warmup` rigetta i flussi condizionali massivi in favore di classi specifiche:
*   `BarbellStrategy`: Utilizza l'algoritmo Greedy.
*   `DumbbellStrategy` / `MachineStrategy`: Utilizzano salti lineari basati su un *rounding ruleset*.

### 10.2 Algoritmo Greedy a Dischi
Il *subset optimization problem* per i dischi del bilanciere è affrontato con un approccio Greedy decrescente (dal piatto maggiore al minore), evitando DP (Dynamic Programming) per questioni di budget computazionale.
*   **Principio del Non-Svuotamento:** Il set restituisce il *Delta Render* ("aggiungi 5kg", "sostituisci 10 con 20"), minimizzando l'operatività in palestra.
*   **Fallback:** In caso di impossibilità matematica di calcolo (set di dischi incompleto), l'engine esegue un fallback a percentuali generiche ignorando i piatti disponibili, con annesso warning loggato.

---

## 11. Personal Records Engine

### 11.1 Architettura PR (Collection e Fallback)
Il PR non è un dato calcolato al volo sulla base intera del database. È gestito nella collection isolata `personalRecords`.
*   **PR Source Hierarchy:** `Stored_PR > Epley_30d > Null`. L'applicativo espone a UI la fonte di verità con highest confidence score.
*   **Staleness Detection:** L'engine esegue `EpleyEstimate` sugli ultimi 30 giorni. Se `EpleyEstimate > Stored_PR * 1.05`, il PR in DB viene flaggato come *Stale* ("Da Rivalutare"), forzando il *Confidence Score* verso il basso.

### 11.2 Gestione Inconsistenze
*   Anomalie a basse ripetizioni (es. 1 rep max loggata casualmente) richiedono un filtro di *Historical Validation* contro il PR storicizzato per evitare falsi positivi massivi nell'AI.
*   L'invalidazione dei PR avviene in modo asincrono, aggiornando la cache di React Query al variare dei Log.

---

## 12. AI Coaching Engine

### 12.1 Deterministic Scenarios
Separazione assoluta tra "Prediction" e "Deterministic Rules":
*   **Inverse Epley:** La formula `Target_Weight = PR / (1 + Target_Reps / 30)` definisce la baseline.
*   **Scenario A (Under-Training):** Suggerisce incremento conservativo.
*   **Scenario B1/B2 (Optimal Zone):** Valuta il fattore RPE. Se RPE è basso (<6) pur essendo nella zona ottimale, suggerisce test del PR.
*   **Scenario C (Over-Performance):** Alert per superamento del limite teorico.

### 12.2 Explainability e Protezioni
*   **No Mutation Rule:** L'engine di raccomandazione genera DTO informativi in sola lettura. Non può in nessun caso mutare il draft di input dell'utente (il placeholder UI usa esclusivamente il dato dell'ultima sessione reale).
*   **Formula Extensibility:** L'engine non vincolerà l'intera app alla sola formula di Epley. L'architettura prevede interfacce astratte (`StrengthEstimator`) che permetteranno l'impiego futuro di Brzycki, Lombardi o modelli adattivi individuali.

---

## 13. State Management & Data Fetching

### 13.1 React Query (TanStack)
I pattern `useEffect` combinati con callback Firebase locali sono deprecati.
*   **Query Key Architecture:** `['workoutLogs', userId, exerciseId]` per invalidazione puntuale.
*   **Ottimismo:** L'utilizzo intensivo di `onMutate` permette l'Optimistic Update delle UI (es. aggiungere un set) eseguendo un rollback automatico (grazie all'`onError` che usa il context) in caso di fallimento della transazione offline.
*   **Garbage Collection:** `staleTime` impostato a 5 minuti per evitare fetch continui. `gcTime` ottimizzato per dispositivi con poca memoria.

### 13.2 Global State Segmentato (Zustand)
Stati UI temporanei e transienti (il timer del workout attivo, l'apertura delle modali, flag di offline) vivono in architetture Zustand. I dati di dominio (Logs, PR) non devono mai essere duplicati nello store globale.

---

## 14. Performance & Bundle Strategy

### 14.1 Bundle Budgets
Il JavaScript dell'applicativo raggiungerà limiti critici senza *Code Splitting*.
*   **Route Splitting:** `React.lazy` per la separazione tra PTDashboard e Client App.
*   **Library Isolation:** Librerie massicce (Recharts, d3, date-fns) verranno lazy-caricate solo al mount dei relativi componenti di visualizzazione grafica o di analytics.
*   **Render Optimization:** L'utilizzo rigoroso di `React.memo` (accompagnato da funzioni stabilizzate con `useCallback`) sulle righe dei workout sets prevenirà *re-render cascade* durante il logging frenetico a fine serie. Future ottimizzazioni prevedono la *Virtualization* (`@tanstack/react-virtual`) per lo storico infinito dei Log.

---

## 15. Accessibility & UX Hardening

### 15.1 Compliance A11Y
*   **Keyboard & Screen Reader:** Semantic HTML form, label associate via `htmlFor`, e applicazione rigorosa degli `aria-label` nei bottoni iconografici.
*   **Reduced Motion:** Le animazioni di Framer Motion (`LazyMotion`) si disattiveranno o si ridurranno drasticamente per dispositivi in modalità risparmio energetico o utenti con preferenza `prefers-reduced-motion`.
*   **Focus Trap:** Implementazione nei modali di PR e logger extra-peso.
*   **Loading & Offline States:** Nessun tasto submit dovrà essere premibile due volte (*double tap submit prevention*). Nessuna operazione in corso dovrà risultare "fantasma" senza skeleton loading o indicatori di sync in coda.

---

## 16. CI/CD & Quality Gates

La Continuous Integration deve bloccare qualsiasi merge su `main` che minacci l'integrità del sistema.
*   **Pipeline Required Checks:**
    1.  `npm run lint`
    2.  `tsc --noEmit` (Controllo tipizzazione statico stringente)
    3.  `npm test` (Suite di unit ed integration test)
    4.  `npm run build` (Prevenzione fallimenti di sintesi)
*   **Preview Deploys:** Ogni Pull Request autogenera un ambiente Netlify Preview temporaneo, fondamentale per consentire verifiche PWA su device fisici prima dell'approvazione.
*   **Bundle Size Checks:** Introduzione di action per fallire se il main chunk eccede i 300KB (gzipped).

---

## 17. Enterprise Testing Strategy

Un'architettura finanziariamente e operativamente scalabile esige layer isolati di test.
*   **Unit Tests:** Focalizzati in `/core` per assicurare che formule di tonnellaggio, Epley, e Plate Calculator funzionino senza mock asincroni.
*   **Repository Integration Tests:** Utilizzano l'emulatore Firestore per validare le mutazioni transazionali.
*   **Offline/IndexedDB Tests:** Validano il merge delle logiche di coda simulando fail di rete e ricaricamenti applicativi.
*   **Timezone & Fake Timers:** Test su `date/` simulando orologi di sistema per provare i *midnight rollover* tra UTC e la timezone del browser.
*   **E2E (Futuro):** Implementazione Playwright per validare i "critical paths" (Login → Inizia Workout → Log Set → Chiudi App → Riapri → Verifica persistenza locale).

---

## 18. Internationalization (i18n)

### 18.1 Architettura Traduzioni
Il file `i18n.tsx` attuale migrerà verso standard avanzati:
*   **Dynamic Placeholders & Pluralization:** Gestione nativa delle stringhe interpolate (es. "Sei al {pct}% del tuo PR").
*   **Fallback Detection:** Logica di de-escalation a `en-US` se il key match `it-IT` fallisce, per garantire UI priva di token esposti ("missing_key").
*   **Namespacing:** Caricamento *lazy* dei dizionari diviso per contesti (es. `auth.json`, `workout.json`) per limitare il peso iniziale del fetch.

---

## 19. Security Hardening

L'infrastruttura di sicurezza deve considerare l'intero applicativo come una "banca di dati sanitari/biometrici".
*   **Firestore Rules:** Stesura rigorosa in `firestore.rules`.
    *   Validazioni a livello di schema (tipizzazione in cloud).
    *   Ownership Checks (solo il `userId` proprietario o un `ptId` autorizzato con permessi elevati può scrivere).
    *   Prevenzione Query Aggregate non filtrate.
*   **Abuse Prevention & AppCheck:** Implementazione di Rate Limiting pattern (sia lato funzioni serverless che database rules) e mitigazione dei Replay Attacks accoppiati ai token AppCheck.
*   **Auth Token Lifecycle:** Rigorosa invalidazione in caso di logoff e re-authentication boundaries sulle funzioni distruttive.

---

## 20. Future Scalability Roadmap

### 20.1 Architettura Estensibile
L'adozione di questo Master Report sblocca le seguenti evoluzioni sicure:
*   **Analytics Engine Disaccoppiato:** Spostamento totale delle aggregazioni di massa (storici annuali) su Cloud Functions/BigQuery.
*   **Wearable Integrations:** Interfacciamento con API salute per tracking recupero fisiologico incrociato con i log di forza.
*   **Edge Compute Readiness:** Avvicinamento del runtime di AI Coaching ai nodi perimetrali (Edge Functions) per latenza zero.
*   **Multi-Device Synchronization:** Grazie al sistema IndexedDB + ServerTimestamps + UUIDs, abilitazione nativa all'utilizzo concorrente tra tablet e smartphone senza lock-in.
*   **Export/GDPR Compliancy:** Costruzione del sistema di Retention, Hard Deletion e portabilità dei dati in file CSV asincroni.
