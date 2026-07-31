
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    updateProfile as updateAuthProfile,
    onAuthStateChanged,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence,
    deleteUser,
    reauthenticateWithCredential,
    EmailAuthProvider
} from 'firebase/auth';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    Timestamp,
    writeBatch,
    deleteDoc,
    onSnapshot
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider, getToken as getAppCheckToken } from 'firebase/app-check';
import { User, Exercise, Workout, Log, ClientExerciseSummary, WorkoutItem, ClientPlanSummary, BodyMeasurement, WorkoutSession, HistorySnapshot, HistorySnapshotPreview } from '../types';
import { api as mockApi } from './mockFirebase';

// Validate config before init
const requiredKeys = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID'];
const missingKeys = requiredKeys.filter(key => !import.meta.env[key]);

// Auto-switch to mock if keys are missing or if explicitly requested via .env
const AUTO_MOCK = missingKeys.length > 0;
const USE_MOCK_ENV = import.meta.env.VITE_USE_MOCK === 'true';
const USE_MOCK = AUTO_MOCK || USE_MOCK_ENV;

if (AUTO_MOCK) {
    console.warn("⚠️ Firebase config missing. Switching to MOCK MODE for demo purposes.", missingKeys);
    console.info("Please add these variables to your Netlify dashboard to activate REAL Firebase.");
    (window as any).IS_MOCK_MODE = true;
}

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "fitlink-424e8.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "737655151710",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:737655151710:web:6802f4348bd8a1085a68cf",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-VQDVN1M3RX"
};

let app: any, auth: any, db: any, appCheck: any;
let initializationSuccessful = false;

// Promise that resolves when App Check has a valid token (or immediately if disabled).
// All initial Firestore data loads must await this to avoid PERMISSION_DENIED races.
let appCheckReady: Promise<void> = Promise.resolve();

// ─── IN-MEMORY CACHE ─────────────────────────────────────────────────────────
// Evita riletture ridondanti su Firestore nella stessa sessione browser.
// La cache si azzera ad ogni reload della pagina (è puramente in memoria).
// Ogni entry scade dopo CACHE_TTL_MS millisecondi dalla sua creazione.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minuti

interface CacheEntry<T> { data: T; fetchedAt: number; }
const _cache: {
    logs?:      CacheEntry<Log[]>            & { clientId: string };
    sessions?:  CacheEntry<WorkoutSession[]> & { userId: string };
    exercises?: CacheEntry<Exercise[]>       & { ptId: string };
} = {};

const isCacheValid = (entry?: CacheEntry<any>): boolean =>
    !!entry && (Date.now() - entry.fetchedAt) < CACHE_TTL_MS;
const invalidateLogsCache     = () => { delete _cache.logs; };
const invalidateSessionsCache = () => { delete _cache.sessions; };
// ─────────────────────────────────────────────────────────────────────────────

// ─── HELPER: parseDate ───────────────────────────────────────────────────────
// Robusto per date in formato ISO ("YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ssZ")
// e formato locale italiano DD/MM/YYYY prodotto da vecchi log.
const parseDate = (dateStr: any): Date => {
    if (!dateStr) return new Date(0);
    if (dateStr instanceof Date) return dateStr;
    if (typeof dateStr === 'string' && dateStr.includes('/')) {
        const [d, m, y] = dateStr.split('/').map(Number);
        return new Date(y, m - 1, d);
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date(0) : d;
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── HELPERS: Archive month ranges ───────────────────────────────────────────
// Restituisce tutti i mesi "YYYY-MM" nell'intervallo [fromDate, toDate).
function getPastMonths(fromDate: Date, toDate: Date = new Date()): string[] {
    const months: string[] = [];
    const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    while (d < toDate) {
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        d.setMonth(d.getMonth() + 1);
    }
    return months;
}

// Calcola i mesi che sicuramente sono già stati archiviati (più vecchi di 30 gg)
// partendo dalla data di inizio piano.
function getArchivedMonthsForPlan(planStartDate: string): string[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return getPastMonths(parseDate(planStartDate), cutoff);
}
// ─────────────────────────────────────────────────────────────────────────────

// Only initialize REAL Firebase if not in mock mode or if we have keys
if (!USE_MOCK) {
    try {
        app = initializeApp(firebaseConfig);

        // Inizializza App Check PRIMA di qualsiasi altro servizio Firebase (Auth/Firestore).
        // Questo previene l'errore "auth/firebase-app-check-token-is-invalid" in produzione,
        // causato dall'inizializzazione di Auth prima che il provider App Check sia agganciato.
        if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
            if (import.meta.env.DEV) {
                (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = "8f3b2075-8ea5-4f4c-b016-8c4349a46419";
                console.log('🔧 DEV mode: App Check in debug mode using custom token.');
            }
            appCheck = initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
                isTokenAutoRefreshEnabled: true
            });
            // Prefetch the first token so it's cached before any Firestore query fires.
            appCheckReady = getAppCheckToken(appCheck, /* forceRefresh */ false)
                .then(() => {
                    console.log('✅ App Check token ready — Firestore queries can proceed.');
                })
                .catch((err) => {
                    console.warn('⚠️ App Check token fetch failed. Queries may be rejected by Firestore rules.', err);
                });
        } else {
            console.warn('⚠️ Missing VITE_RECAPTCHA_SITE_KEY. App Check not initialized.');
        }

        auth = getAuth(app);
        
        // Attiva persistenza Auth
        setPersistence(auth, browserLocalPersistence);

        // Inizializza Firestore con persistenza locale avanzata
        db = initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager()
            })
        });

        initializationSuccessful = true;

        // ─── STANDBY WAKEUP: refresh App Check token when page becomes visible ──
        // After standby, the App Check token may be expired → Firestore returns
        // PERMISSION_DENIED → blank screen. Proactively refresh it on wakeup.
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible' && appCheck) {
                appCheckReady = getAppCheckToken(appCheck, /* forceRefresh */ true)
                    .then(() => console.log('✅ App Check token refreshed after wakeup'))
                    .catch((err) => console.warn('⚠️ App Check wakeup refresh failed', err));
            }
        });
        // ─────────────────────────────────────────────────────────────────────────

    } catch (e) {
        console.error("Firebase initialization failed severely:", e);
        console.warn("Falling back to MOCK MODE due to initialization failure.");
        (window as any).IS_MOCK_MODE = true;
        initializationSuccessful = false;
    }
} else {
    // If mock mode is active, we don't try to initialize Firebase to avoid crashes
    initializationSuccessful = false;
}

const convertDoc = <T>(doc: any): T => {
    const data = doc.data();
    if (!data) return { id: doc.id, uid: doc.id } as any as T;
    Object.keys(data).forEach(key => {
        if (data[key] instanceof Timestamp) {
            data[key] = data[key].toDate().toISOString();
        }
    });
    return { id: doc.id, uid: doc.id, ...data } as T;
};

const realApi = {
    signIn: async (email: string, password?: string, role?: 'pt' | 'client', name?: string) => {
        if (!auth) throw new Error("Firebase Auth not initialized. Using Mock API instead might work.");
        if (!password) throw new Error("Password is required");
        try {
            // Attende che il token App Check sia pronto prima del login
            await appCheckReady;
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const uid = userCredential.user.uid;
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
                return convertDoc<User>(userDoc);
            } else {
                throw new Error("User profile not found");
            }
        } catch (error: any) {
            throw error;
        }
    },

    signUp: async (email: string, password: string, role: 'pt' | 'client', name: string) => {
        if (!auth) throw new Error("Firebase Auth not initialized.");
        // Attende che il token App Check sia pronto prima della registrazione
        await appCheckReady;
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        await updateAuthProfile(userCredential.user, { displayName: name });
        const userData: any = {
            uid,
            name,
            email,
            role,
            ptAssigned: null,
            createdAt: serverTimestamp(),
            // NEW: PTs start inactive (false), Clients start active (true)
            isActive: role === 'client'
        };
        if (role === 'pt') {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            userData.inviteCode = code;
        }
        await setDoc(doc(db, 'users', uid), userData);
        return { ...userData, createdAt: new Date().toISOString() } as User;
    },

    logout: async () => {
        if (auth) await signOut(auth);
    },

    resetPassword: async (email: string) => {
        if (auth) {
            await appCheckReady;
            await sendPasswordResetEmail(auth, email);
        }
    },

    onAuthStateChanged: (callback: (user: User | null) => void) => {
        if (!auth || !initializationSuccessful) {
            console.warn("Auth not initialized. Callback triggered with null.");
            callback(null);
            return () => { };
        }

        let unsubscribeSnapshot: (() => void) | null = null;

        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser: any) => {
            // Pulisci snapshot precedente se esiste
            if (unsubscribeSnapshot) {
                unsubscribeSnapshot();
                unsubscribeSnapshot = null;
            }

            if (firebaseUser) {
                // CRITICAL: wait for App Check token before any Firestore access.
                // Without this, all getDocs/onSnapshot calls may fail with PERMISSION_DENIED
                // because the reCAPTCHA token hasn't been fetched yet.
                await appCheckReady;

                // Usiamo onSnapshot invece di getDoc per gestire i passaggi offline/online
                // Questo legge istantaneamente dalla cache locale se internet è assente
                unsubscribeSnapshot = onSnapshot(doc(db, 'users', firebaseUser.uid),
                    (snapshot) => {
                        if (snapshot.exists()) {
                            callback(convertDoc<User>(snapshot));
                        } else {
                            // Documento non trovato - forse l'utente è stato eliminato?
                            callback(null);
                        }
                    },
                    (error) => {
                        console.error("Auth snapshot error:", error);
                        // In caso di errore (es. permessi App Check), sblocchiamo comunque il caricamento per mostrare il login
                        callback(null);
                    }
                );
            } else {
                callback(null);
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeSnapshot) unsubscribeSnapshot();
        };
    },

    updateProfile: async (user: User, data: Partial<User>) => {
        const ref = doc(db, 'users', user.uid);
        const safeData: any = {};
        Object.keys(data).forEach(key => {
            const val = (data as any)[key];
            if (val !== undefined) safeData[key] = val;
        });
        await updateDoc(ref, safeData);
        const updated = await getDoc(ref);
        return convertDoc<User>(updated);
    },

    // ADMIN FUNCTIONS
    getAllPTs: async () => {
        const q = query(collection(db, 'users'), where('role', '==', 'pt'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => convertDoc<User>(d));
    },

    toggleUserStatus: async (targetUid: string, isActive: boolean) => {
        await updateDoc(doc(db, 'users', targetUid), { isActive });
    },
    // END ADMIN FUNCTIONS

    linkClientToPT: async (clientUid: string, inviteCode: string) => {
        const cleanCode = inviteCode.trim().toUpperCase();
        const q = query(collection(db, 'users'), where('role', '==', 'pt'), where('inviteCode', '==', cleanCode));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            throw new Error("Invalid Invite Code. Please check with your PT.");
        }
        const pt = convertDoc<User>(querySnapshot.docs[0]);
        await updateDoc(doc(db, 'users', clientUid), { ptAssigned: pt.uid });
        const clientDoc = await getDoc(doc(db, 'users', clientUid));
        return convertDoc<User>(clientDoc);
    },

    unlinkClientFromPT: async (clientUid: string) => {
        await updateDoc(doc(db, 'users', clientUid), { ptAssigned: null });
        const clientDoc = await getDoc(doc(db, 'users', clientUid));
        return convertDoc<User>(clientDoc);
    },

    getClientsForPT: async (ptId: string) => {
        const q = query(collection(db, 'users'), where('ptAssigned', '==', ptId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => convertDoc<User>(d));
    },

    getExercises: async (ptId?: string) => {
        const cacheKey = ptId || '__all__';
        if (isCacheValid(_cache.exercises) && _cache.exercises!.ptId === cacheKey) {
            return _cache.exercises!.data;
        }
        let result: Exercise[];
        if (!ptId) {
            const q = query(collection(db, 'exercises'));
            const snapshot = await getDocs(q);
            result = snapshot.docs.map(d => convertDoc<Exercise>(d));
        } else {
            const q = query(collection(db, 'exercises'), where('ptId', '==', ptId));
            const snapshot = await getDocs(q);
            result = snapshot.docs.map(d => convertDoc<Exercise>(d));
        }
        _cache.exercises = { ptId: cacheKey, data: result, fetchedAt: Date.now() };
        return result;
    },

    createExercise: async (ptId: string, data: Omit<Exercise, 'id' | 'ptId'>) => {
        const docRef = await addDoc(collection(db, 'exercises'), {
            ...data,
            ptId,
            createdAt: serverTimestamp()
        });
        return { id: docRef.id, ptId, ...data } as Exercise;
    },

    updateExercise: async (exerciseId: string, data: Partial<Exercise>) => {
        const safeData: any = {};
        Object.keys(data).forEach(key => {
            const val = (data as any)[key];
            if (val !== undefined) safeData[key] = val;
        });
        await updateDoc(doc(db, 'exercises', exerciseId), safeData);
    },

    deleteExercise: async (exerciseId: string) => {
        await deleteDoc(doc(db, 'exercises', exerciseId));
    },

    createWorkout: async (ptId: string, clientId: string, name: string, items: { exerciseId: string, dayIndex: number, sets: number, reps: number, restSeconds: number, supersetGroup?: string }[], endDate?: string) => {
        const batch = writeBatch(db);
        const workoutRef = doc(collection(db, 'workouts'));
        const workoutData = {
            ptId,
            clientId,
            name,
            status: 'ACTIVE',
            startDate: new Date().toISOString(),
            endDate: endDate || new Date(Date.now() + 86400000 * 30).toISOString(),
            createdAt: serverTimestamp()
        };
        batch.set(workoutRef, workoutData);
        items.forEach((item, index) => {
            const itemRef = doc(collection(db, `workouts/${workoutRef.id}/items`));
            batch.set(itemRef, {
                workoutId: workoutRef.id,
                exerciseId: item.exerciseId,
                dayIndex: item.dayIndex,
                sets: item.sets,
                reps: item.reps,
                restSeconds: item.restSeconds,
                orderIndex: index,
                supersetGroup: item.supersetGroup || null
            });
        });
        await batch.commit();
        return { id: workoutRef.id, ...workoutData } as Workout;
    },

    updateWorkoutPlan: async (workoutId: string, name: string, items: { exerciseId: string, dayIndex: number, sets: number, reps: number, restSeconds: number, supersetGroup?: string }[], endDate: string) => {
        const MAX_BATCH_OPS = 499;
        let batch = writeBatch(db);
        let opsCount = 0;

        const commitBatchIfNeeded = async () => {
            if (opsCount >= MAX_BATCH_OPS) {
                await batch.commit();
                batch = writeBatch(db);
                opsCount = 0;
            }
        };

        const workoutRef = doc(db, 'workouts', workoutId);

        // 1. Update Workout Metadata
        batch.update(workoutRef, {
            name,
            endDate,
            updatedAt: serverTimestamp()
        });
        opsCount++;
        await commitBatchIfNeeded();

        // 2. Delete existing items
        const oldItemsSnapshot = await getDocs(collection(db, `workouts/${workoutId}/items`));
        for (const doc of oldItemsSnapshot.docs) {
            batch.delete(doc.ref);
            opsCount++;
            await commitBatchIfNeeded();
        }

        // 3. Create new Items
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const itemRef = doc(collection(db, `workouts/${workoutRef.id}/items`));
            batch.set(itemRef, {
                workoutId: workoutRef.id,
                exerciseId: item.exerciseId,
                dayIndex: item.dayIndex,
                sets: item.sets,
                reps: item.reps,
                restSeconds: item.restSeconds,
                orderIndex: index,
                supersetGroup: item.supersetGroup || null
            });
            opsCount++;
            await commitBatchIfNeeded();
        }

        if (opsCount > 0) {
            await batch.commit();
        }
    },

    getActivePlan: async (clientId: string) => {
        const q = query(
            collection(db, 'workouts'),
            where('clientId', '==', clientId),
            where('status', '==', 'ACTIVE')
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        const workouts = snapshot.docs.map(d => convertDoc<Workout>(d));
        workouts.sort((a, b) => b.startDate.localeCompare(a.startDate));
        return workouts[0];
    },

    // Helper to fetch a specific workout
    getWorkout: async (workoutId: string) => {
        const docRef = await getDoc(doc(db, 'workouts', workoutId));
        if (!docRef.exists()) return null;
        return convertDoc<Workout>(docRef);
    },

    getWorkoutsForClient: async (clientId: string) => {
        const q = query(collection(db, 'workouts'), where('clientId', '==', clientId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => convertDoc<Workout>(d));
    },

    getPlanItems: async (workoutId: string) => {
        const q = query(collection(db, `workouts/${workoutId}/items`), orderBy('orderIndex', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => convertDoc<WorkoutItem>(d));
    },

    logSet: async (log: Omit<Log, 'id'>) => {
        const docRef = await addDoc(collection(db, `users/${log.userId}/logs`), {
            ...log,
            timestamp: serverTimestamp()
        });
        invalidateLogsCache();
        return docRef.id;
    },

    deleteLog: async (userId: string, logId: string) => {
        await deleteDoc(doc(db, `users/${userId}/logs/${logId}`));
        invalidateLogsCache();
    },

    updateLog: async (userId: string, logId: string, data: Partial<Log>) => {
        await updateDoc(doc(db, `users/${userId}/logs/${logId}`), data);
    },

    getAllLogsForClient: async (clientId: string, fullHistory = false): Promise<Log[]> => {
        // 1. Controlla cache in-memory
        if (isCacheValid(_cache.logs) && _cache.logs!.clientId === clientId) {
            console.log('📦 Cache hit: logs');
            return _cache.logs!.data;
        }

        // 2. HOT DATA: ultimi 30 giorni (documenti singoli, modificabili)
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const hotCutoffStr = cutoff.toISOString().split('T')[0];
        const hotSnap = await getDocs(query(
            collection(db, `users/${clientId}/logs`),
            where('date', '>=', hotCutoffStr),
            orderBy('date', 'desc')
        ));
        const hotLogs = hotSnap.docs.map(d => convertDoc<Log>(d));

        // 3. COLD DATA: blob mensili archiviati
        let coldLogs: Log[] = [];
        if (fullHistory) {
            // Legge TUTTI i blob storici archiviati (costo irrisorio: ~1 read per ogni mese di vita dell'utente)
            const snapshotCol = await getDocs(collection(db, `users/${clientId}/history_snapshot`));
            snapshotCol.forEach(snap => {
                coldLogs = coldLogs.concat((snap.data() as HistorySnapshot).logs);
            });
        }

        // 4. Unisci, deduplica e sanitizza
        const rawLogs = [...hotLogs, ...coldLogs].sort((a, b) =>
            parseDate(b.date).getTime() - parseDate(a.date).getTime()
        );
        const seen = new Set<string>();
        const cleanLogs: Log[] = [];
        rawLogs.forEach(log => {
            if (log.completed === false || log.id?.startsWith('temp_skip_')) return;
            const day = String(log.date).split('T')[0];
            const key = `${day}_${log.workoutId}_${log.exerciseId}_${log.seriesNo}`;
            if (!seen.has(key)) { seen.add(key); cleanLogs.push(log); }
        });

        // 5. Salva in cache
        _cache.logs = { clientId, data: cleanLogs, fetchedAt: Date.now() };
        return cleanLogs;
    },

    getSessionLogs: async (userId: string, workoutId: string, exerciseId: string) => {
        const today = new Date().toISOString().split('T')[0];
        const tomorrowOffset = new Date();
        tomorrowOffset.setDate(tomorrowOffset.getDate() + 1);
        const tomorrow = tomorrowOffset.toISOString().split('T')[0];

        const q = query(
            collection(db, `users/${userId}/logs`),
            where('date', '>=', today),
            where('date', '<', tomorrow)
        );
        const snapshot = await getDocs(q);
        const logs = snapshot.docs
            .map(d => convertDoc<Log>(d))
            .filter(l => l.workoutId === workoutId && l.exerciseId === exerciseId);
        return logs.sort((a, b) => a.seriesNo - b.seriesNo);
    },

    getWorkoutTodayLogs: async (userId: string, workoutId: string) => {
        const today = new Date().toISOString().split('T')[0];
        const tomorrowOffset = new Date();
        tomorrowOffset.setDate(tomorrowOffset.getDate() + 1);
        const tomorrow = tomorrowOffset.toISOString().split('T')[0];

        const q = query(
            collection(db, `users/${userId}/logs`),
            where('date', '>=', today),
            where('date', '<', tomorrow)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(d => convertDoc<Log>(d))
            .filter(l => l.workoutId === workoutId);
    },

    getLastPerformance: async (userId: string, exerciseId: string) => {
        const today = new Date().toISOString().split('T')[0];

        // 1. Cerca prima nei log HOT
        const qHot = query(
            collection(db, `users/${userId}/logs`),
            where('exerciseId', '==', exerciseId),
            where('date', '<', today),
            orderBy('date', 'desc'),
            limit(20)
        );
        const hotSnap = await getDocs(qHot);

        let logs: Log[] = [];
        if (!hotSnap.empty) {
            logs = hotSnap.docs.map(d => convertDoc<Log>(d));
        } else {
            // 2. Fallback: cerca nei blob COLD degli ultimi 4 mesi
            const monthsToCheck = getPastMonths(
                (() => { const d = new Date(); d.setMonth(d.getMonth() - 4); return d; })(),
                new Date()
            );
            for (const month of monthsToCheck.reverse()) {
                const snap = await getDoc(doc(db, `users/${userId}/history_snapshot`, month));
                if (!snap.exists()) continue;
                const coldLogs = (snap.data() as HistorySnapshot).logs
                    .filter(l => l.exerciseId === exerciseId && l.date < today)
                    .slice(0, 20);
                if (coldLogs.length > 0) { logs = coldLogs; break; }
            }
        }

        if (logs.length === 0) return null;
        const lastDate = logs[0].date.split('T')[0];
        return logs.filter(l => l.date.split('T')[0] === lastDate).sort((a, b) => a.seriesNo - b.seriesNo);
    },

    getClientExerciseSummaries: async (clientId: string, providedLogs?: Log[]) => {
        // Se i log sono già stati scaricati (es. per la cronologia), riusiamoli per non sprecare quota
        const logs = providedLogs || await realApi.getAllLogsForClient(clientId);
        const exMap: Record<string, ClientExerciseSummary> = {};
        logs.forEach(log => {
            if (!exMap[log.exerciseId]) {
                exMap[log.exerciseId] = {
                    exerciseId: log.exerciseId,
                    totalSessions: 0,
                    totalReps: 0,
                    avgWeight: 0,
                    pr: 0,
                    lastUpdated: ''
                };
            }
            const entry = exMap[log.exerciseId];
            entry.totalReps += log.reps;
            if (log.weight > entry.pr) entry.pr = log.weight;
            entry.lastUpdated = log.date > entry.lastUpdated ? log.date : entry.lastUpdated;
        });
        return Object.values(exMap);
    },

    getClientPlanSummary: async (clientId: string, providedLogs?: Log[], providedSessions?: WorkoutSession[]): Promise<ClientPlanSummary | null> => {
        const activePlan = await realApi.getActivePlan(clientId);
        if (!activePlan) return null;

        let items: WorkoutItem[];
        let sessions: WorkoutSession[];

        // 1. HOT: query sui log del piano (documenti singoli, ultimi 30 gg)
        const [hotLogsSnap, fetchedItems] = await Promise.all([
            getDocs(query(collection(db, `users/${clientId}/logs`), where('workoutId', '==', activePlan.id))),
            realApi.getPlanItems(activePlan.id)
        ]);
        let planLogs: Log[] = hotLogsSnap.docs.map(d => convertDoc<Log>(d));
        items = fetchedItems;

        // 2. COLD: legge i blob dei mesi archiviati dalla data di inizio piano
        const archivedMonths = getArchivedMonthsForPlan(activePlan.startDate);
        if (archivedMonths.length > 0) {
            const coldSnaps = await Promise.all(
                archivedMonths.map(m => getDoc(doc(db, `users/${clientId}/history_snapshot`, m)))
            );
            coldSnaps.forEach(snap => {
                if (!snap.exists()) return;
                const coldPlanLogs = (snap.data() as HistorySnapshot).logs
                    .filter(l => l.workoutId === activePlan.id);
                planLogs = planLogs.concat(coldPlanLogs);
            });
        }

        // 3. Sessioni
        if (providedSessions) {
            sessions = providedSessions.filter(s => s.workoutId === activePlan.id);
        } else {
            const sessionsSnap = await getDocs(
                query(collection(db, `users/${clientId}/sessions`), where('workoutId', '==', activePlan.id))
            );
            sessions = sessionsSnap.docs.map(d => convertDoc<WorkoutSession>(d));
        }

        // 4. Calcolo aderenza
        const uniquePlanDays = new Set(items.map(i => i.dayIndex)).size || 1;
        const uniqueLogDates = new Set(planLogs
            .filter(l => l.completed !== false)
            .map(l => String(l.date).split('T')[0])
        );
        const uniqueSessionDates = new Set(sessions.map(s => String(s.date).split('T')[0]));
        const completedSessions = Math.max(uniqueSessionDates.size, uniqueLogDates.size);

        const startDate = parseDate(activePlan.startDate);
        const endDate   = parseDate(activePlan.endDate);
        const now = new Date();

        if (now < startDate) {
            return { planId: activePlan.id, totalSessionsCompleted: completedSessions, adherencePercent: 0, avgWeeklyVolume: 0 };
        }

        const targetDate = (now > endDate && !isNaN(endDate.getTime())) ? endDate : now;
        const daysElapsed = Math.floor((targetDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;
        const weeksElapsed = Math.max(0.1, daysElapsed / 7);
        const expectedSessions = Math.max(1, Math.ceil(weeksElapsed * uniquePlanDays));
        const safeExpected = isNaN(expectedSessions) || expectedSessions <= 0 ? 1 : expectedSessions;

        let totalVolume = 0;
        planLogs.filter(l => l.completed !== false && !l.id?.startsWith('temp_skip_'))
            .forEach(l => totalVolume += (l.reps * l.weight));

        return {
            planId: activePlan.id,
            adherencePercent: Math.min(100, Math.round((completedSessions / safeExpected) * 100)),
            avgWeeklyVolume: Math.round(totalVolume / Math.max(1, weeksElapsed)),
            totalSessionsCompleted: completedSessions
        };
    },



    addMeasurement: async (data: Omit<BodyMeasurement, 'id'>) => {
        await addDoc(collection(db, `users/${data.userId}/measurements`), data);
    },

    getMeasurements: async (userId: string) => {
        const q = query(collection(db, `users/${userId}/measurements`), orderBy('date', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => convertDoc<BodyMeasurement>(d));
    },

    saveSessionSummary: async (session: Omit<WorkoutSession, 'id'> & { id?: string }) => {
        // Firebase rejected undefined values, so we must clean the object
        const { id, ...sessionData } = session;

        if (id) {
            const docRef = doc(db, `users/${session.userId}/sessions`, id);
            await setDoc(docRef, {
                ...sessionData,
                timestamp: serverTimestamp()
            }, { merge: true });
            invalidateSessionsCache();
            return id;
        } else {
            const docRef = await addDoc(collection(db, `users/${session.userId}/sessions`), {
                ...sessionData,
                timestamp: serverTimestamp()
            });
            invalidateSessionsCache();
            return docRef.id;
        }
    },

    /**
     * Cleanup one-shot: elimina log skippati (completed=false) di oggi e
     * de-duplica i log reali con lo stesso (exerciseId, seriesNo).
     * Poi aggiorna il WorkoutSession di oggi con i totali ricalcolati dai log puliti.
     * Da usare solo per sanare dati inquinati da sessioni di test o bug precedenti.
     */
    cleanupTodaySession: async (userId: string, workoutId: string): Promise<{ deletedLogs: number, cleanSets: number, cleanVolume: number }> => {
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

        // 1. Fetch all today's logs for this workout
        const logsQ = query(
            collection(db, `users/${userId}/logs`),
            where('date', '>=', today),
            where('date', '<', tomorrow)
        );
        const logsSnap = await getDocs(logsQ);
        const allTodayLogs = logsSnap.docs
            .map(d => ({ ref: d.ref, data: convertDoc<Log>(d) }))
            .filter(({ data }) => data.workoutId === workoutId);

        // 2. Separate skips (completed=false) from real logs
        const skipLogs = allTodayLogs.filter(({ data }) => data.completed === false);
        const realLogs = allTodayLogs.filter(({ data }) => data.completed !== false);

        // 3. De-duplicate real logs: per (exerciseId, seriesNo) keep only the one with highest weight
        //    (handles the case where multiple test sessions created identical logs)
        const seen = new Map<string, typeof realLogs[0]>();
        const duplicatesToDelete: typeof realLogs = [];

        realLogs.forEach(entry => {
            const key = `${entry.data.exerciseId}_${entry.data.seriesNo}`;
            if (!seen.has(key)) {
                seen.set(key, entry);
            } else {
                // Keep the one with higher weight; mark the other for deletion
                const existing = seen.get(key)!;
                if (entry.data.weight > existing.data.weight) {
                    duplicatesToDelete.push(existing);
                    seen.set(key, entry);
                } else {
                    duplicatesToDelete.push(entry);
                }
            }
        });

        // 4. Delete skip logs + duplicate real logs
        const toDelete = [...skipLogs, ...duplicatesToDelete];
        await Promise.all(toDelete.map(({ ref }) => deleteDoc(ref)));

        // 5. Get clean remaining logs (in-memory, no extra read)
        const cleanLogs = Array.from(seen.values()).map(e => e.data);
        const cleanVolume = cleanLogs.reduce((acc, l) => acc + (l.weight * l.reps), 0);
        const cleanSets = cleanLogs.length;

        // 6. Re-index seriesNo per exercise and update in Firebase
        const byExercise: Record<string, Log[]> = {};
        cleanLogs.forEach(l => {
            if (!byExercise[l.exerciseId]) byExercise[l.exerciseId] = [];
            byExercise[l.exerciseId].push(l);
        });
        const reindexPromises: Promise<void>[] = [];
        Object.values(byExercise).forEach(exLogs => {
            exLogs.sort((a, b) => a.seriesNo - b.seriesNo);
            exLogs.forEach((log, i) => {
                if (log.seriesNo !== i + 1) {
                    reindexPromises.push(realApi.updateLog(userId, log.id, { seriesNo: i + 1 }));
                }
            });
        });
        await Promise.all(reindexPromises);

        // 7. Update the session summary for today (delete extras, update the remaining one)
        const sessQ = query(
            collection(db, `users/${userId}/sessions`),
            where('date', '>=', today),
            where('date', '<', tomorrow)
        );
        const sessSnap = await getDocs(sessQ);
        const todaySessions = sessSnap.docs
            .filter(d => d.data().workoutId === workoutId)
            .sort((a, b) => (b.data().timestamp?.seconds || 0) - (a.data().timestamp?.seconds || 0));

        if (todaySessions.length > 0) {
            // Keep the most recent session, delete the others
            const [latest, ...oldSessions] = todaySessions;
            await Promise.all(oldSessions.map(d => deleteDoc(d.ref)));
            // Update the latest with correct totals
            await setDoc(latest.ref, { volume: cleanVolume, sets: cleanSets }, { merge: true });
        }

        return { deletedLogs: toDelete.length, cleanSets, cleanVolume };
    },

    getTodaySessions: async (userId: string, workoutId: string): Promise<WorkoutSession[]> => {
        const today = new Date().toISOString().split('T')[0];
        const tomorrowOffset = new Date();
        tomorrowOffset.setDate(tomorrowOffset.getDate() + 1);
        const tomorrow = tomorrowOffset.toISOString().split('T')[0];

        const q = query(
            collection(db, `users/${userId}/sessions`),
            where('date', '>=', today),
            where('date', '<', tomorrow)
        );
        const snapshot = await getDocs(q);
        const sessions = snapshot.docs
            .map(d => convertDoc<WorkoutSession>(d))
            .filter(s => s.workoutId === workoutId);

        // Return latest created/updated first so duplicates don't shadow recent edits
        return sessions.reverse();
    },

    getAllSessionsForClient: async (userId: string): Promise<WorkoutSession[]> => {
        if (isCacheValid(_cache.sessions) && _cache.sessions!.userId === userId) {
            console.log('📦 Cache hit: sessions');
            return _cache.sessions!.data;
        }
        const q = query(
            collection(db, `users/${userId}/sessions`),
            orderBy('date', 'desc')
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(d => convertDoc<WorkoutSession>(d));
        _cache.sessions = { userId, data, fetchedAt: Date.now() };
        return data;
    },

    // ─── ARCHIVIO IBRIDO: archivia log > 30 giorni in blob mensili ──────────────────
    archiveOldLogs: async (userId: string, dryRun = false): Promise<{ archivedMonths: number; deletedDocs: number; dryRun: boolean }> => {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data() || {};
        const today = new Date().toISOString().split('T')[0];

        // — THROTTLE: max 1 volta al giorno —
        if (userData.lastArchiveDate === today) {
            console.log('✅ Archive: già eseguita oggi, skip.');
            return { archivedMonths: 0, deletedDocs: 0, dryRun };
        }

        // — LOCK ANTI-CONCORRENZA (impedisce due device paralleli) —
        if (userData.archivingInProgress === true) {
            console.warn('⚠️ Archive: già in corso su altro device, abort.');
            return { archivedMonths: 0, deletedDocs: 0, dryRun };
        }
        if (!dryRun) await updateDoc(userRef, { archivingInProgress: true });

        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 30);
            const cutoffStr = cutoff.toISOString().split('T')[0];

            // Leggi i log da archiviare
            const oldLogsSnap = await getDocs(query(
                collection(db, `users/${userId}/logs`),
                where('date', '<', cutoffStr),
                orderBy('date', 'asc')
            ));

            if (oldLogsSnap.empty) {
                if (!dryRun) await updateDoc(userRef, { archivingInProgress: false, lastArchiveDate: today });
                return { archivedMonths: 0, deletedDocs: 0, dryRun };
            }

            // Raggruppa per mese
            const byMonth: Record<string, { docs: typeof oldLogsSnap.docs; logs: any[] }> = {};
            oldLogsSnap.docs.forEach(d => {
                const data = d.data();
                const month = String(data.date).substring(0, 7);
                if (!byMonth[month]) byMonth[month] = { docs: [], logs: [] };
                byMonth[month].docs.push(d);
                byMonth[month].logs.push({
                    id: d.id,
                    date: data.date,
                    exerciseId: data.exerciseId,
                    workoutId: data.workoutId,
                    reps: data.reps,
                    weight: data.weight,
                    seriesNo: data.seriesNo,
                    completed: data.completed ?? true,
                    rpe: data.rpe,
                    note: data.note,
                });
            });

            let totalDeletedDocs = 0;
            let archivedMonths = 0;

            for (const [month, { docs, logs }] of Object.entries(byMonth)) {
                const snapshotRef = doc(db, `users/${userId}/history_snapshot`, month);
                const previewRef  = doc(db, `users/${userId}/history_snapshot_preview`, month);

                // FASE A: Leggi snapshot esistente (idempotente — per riprese dopo crash)
                const existingSnap = await getDoc(snapshotRef);
                let mergedLogs = logs;
                if (existingSnap.exists()) {
                    const existingLogs: any[] = existingSnap.data().logs || [];
                    const existingIds = new Set(existingLogs.map((l: any) => l.id));
                    mergedLogs = [...existingLogs, ...logs.filter(l => !existingIds.has(l.id))];
                }

                if (!dryRun) {
                    // FASE B: Scrivi snapshot
                    await setDoc(snapshotRef, {
                        month,
                        archivedAt: new Date().toISOString(),
                        logCount: mergedLogs.length,
                        logs: mergedLogs,
                    });

                    // FASE C: Verifica integrità prima di cancellare gli originali
                    const verifySnap = await getDoc(snapshotRef);
                    if (!verifySnap.exists() || verifySnap.data().logCount !== mergedLogs.length) {
                        console.error(`❌ Archive: verifica fallita per ${month}. Originali NON cancellati.`);
                        continue;
                    }

                    // FASE D: Scrivi preview leggera (solo date attive, nessun peso/reps)
                    const activeDates = [...new Set(
                        mergedLogs
                            .filter(l => l.completed !== false)
                            .map(l => String(l.date).split('T')[0])
                    )].sort();
                    await setDoc(previewRef, { month, activeDates });

                    // FASE E: Cancella originali in batch
                    const BATCH_SIZE = 490;
                    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
                        const batch = writeBatch(db);
                        docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
                        await batch.commit();
                        totalDeletedDocs += Math.min(BATCH_SIZE, docs.length - i);
                    }
                    invalidateLogsCache();
                }

                archivedMonths++;
                console.log(`✅ Archive: mese ${month} ${dryRun ? '(dry-run)' : 'archiviato'} (${mergedLogs.length} log).`);
            }

            if (!dryRun) {
                await updateDoc(userRef, { archivingInProgress: false, lastArchiveDate: today });
            }
            return { archivedMonths, deletedDocs: totalDeletedDocs, dryRun };

        } catch (err) {
            console.error('❌ Archive: errore imprevisto.', err);
            if (!dryRun) await updateDoc(userRef, { archivingInProgress: false }).catch(() => {});
            throw err;
        }
    },
    // ───────────────────────────────────────────────────────────────────────────

    deleteAccountAndData: async (password?: string) => {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("Utente non autenticato.");

        const uid = currentUser.uid;

        // 1. Re-authentication se richiesta
        if (password && currentUser.email) {
            const credential = EmailAuthProvider.credential(currentUser.email, password);
            await reauthenticateWithCredential(currentUser, credential);
        }

        // 2. Recupero riferimenti da eliminare e disassociare
        const logsSnap = await getDocs(collection(db, `users/${uid}/logs`));
        const measurementsSnap = await getDocs(collection(db, `users/${uid}/measurements`));
        const sessionsSnap = await getDocs(collection(db, `users/${uid}/sessions`));
        const clientsSnap = await getDocs(query(collection(db, 'users'), where('ptAssigned', '==', uid)));

        // 3. Eliminazioni a scaglioni (batch max 500 ops)
        let currentBatch = writeBatch(db);
        let opCount = 0;

        const commitAndReset = async () => {
            if (opCount > 0) {
                await currentBatch.commit();
                currentBatch = writeBatch(db);
                opCount = 0;
            }
        };

        const addDeleteOp = async (ref: any) => {
            currentBatch.delete(ref);
            opCount++;
            if (opCount >= 490) await commitAndReset();
        };

        const addUpdateOp = async (ref: any, data: any) => {
            currentBatch.update(ref, data);
            opCount++;
            if (opCount >= 490) await commitAndReset();
        };

        for (const d of logsSnap.docs) await addDeleteOp(d.ref);
        for (const d of measurementsSnap.docs) await addDeleteOp(d.ref);
        for (const d of sessionsSnap.docs) await addDeleteOp(d.ref);
        for (const d of clientsSnap.docs) await addUpdateOp(d.ref, { ptAssigned: null });

        // Elimina blob archiviati (history_snapshot e history_snapshot_preview)
        const snapshotMonthsSnap = await getDocs(collection(db, `users/${uid}/history_snapshot`));
        const previewMonthsSnap  = await getDocs(collection(db, `users/${uid}/history_snapshot_preview`));
        for (const d of snapshotMonthsSnap.docs) await addDeleteOp(d.ref);
        for (const d of previewMonthsSnap.docs)  await addDeleteOp(d.ref);

        // Elimina Documento Utente Principale
        await addDeleteOp(doc(db, 'users', uid));

        // Esegui eventuali op finali non ancora committate
        await commitAndReset();

        // 4. Elimina identità Firebase Auth
        await deleteUser(currentUser);
    },

    exportClientData: async (userId: string, planIds: string[]): Promise<object> => {
        // Fetch selected plans metadata
        const plansData = await Promise.all(planIds.map(async (planId) => {
            const planDoc = await getDoc(doc(db, 'workouts', planId));
            if (!planDoc.exists()) return null;
            const plan = convertDoc<Workout>(planDoc);

            // Fetch plan items (exercises in plan)
            const itemsSnap = await getDocs(
                query(collection(db, `workouts/${planId}/items`), orderBy('orderIndex', 'asc'))
            );
            const items = itemsSnap.docs.map(d => convertDoc<WorkoutItem>(d));

            // Fetch logs for this plan
            const logsSnap = await getDocs(
                query(collection(db, `users/${userId}/logs`), where('workoutId', '==', planId))
            );
            const logs = logsSnap.docs.map(d => convertDoc<Log>(d))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Fetch sessions for this plan
            const sessionsSnap = await getDocs(
                query(collection(db, `users/${userId}/sessions`), where('workoutId', '==', planId))
            );
            const sessions = sessionsSnap.docs.map(d => convertDoc<WorkoutSession>(d))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            return { ...plan, items, logs, sessions };
        }));

        // Fetch all measurements (always full history)
        const measurementsSnap = await getDocs(
            query(collection(db, `users/${userId}/measurements`), orderBy('date', 'asc'))
        );
        const measurements = measurementsSnap.docs.map(d => convertDoc<BodyMeasurement>(d));

        // Stamp lastExportDate on the user document
        await updateDoc(doc(db, 'users', userId), { lastExportDate: new Date().toISOString() });

        return {
            export_meta: {
                generated_at: new Date().toISOString(),
                app: 'Vibe Gym',
                plans_included: planIds.length,
            },
            plans: plansData.filter(Boolean),
            measurements,
        };
    }
};

export const api = (USE_MOCK || !initializationSuccessful) ? mockApi : realApi;
export const isMockMode = (USE_MOCK || !initializationSuccessful);
export { auth, db };