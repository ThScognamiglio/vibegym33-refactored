/**
 * auth.repository.ts
 *
 * RESPONSABILITÀ: operazioni di autenticazione e profilo utente.
 *
 * DIPENDENZE CONSENTITE: firebase.config.ts, firebase/auth, firebase/firestore, types.ts
 * NON importare da: components/, repositories/*altri*, core/, hooks/.
 *
 * NOTA: Questo repository è il successore enterprise delle funzioni signIn,
 * signUp, logout, resetPassword, onAuthStateChanged, updateProfile presenti
 * nel God Object services/firebase.ts (che rimane intatto per compatibilità).
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile as updateAuthProfile,
  onAuthStateChanged as fbOnAuthStateChanged,
  sendPasswordResetEmail,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, appCheckReady } from '../services/firebase.config';
import { User } from '../types';

import { z } from 'zod';
import { validatePayload, UserSchema, ExerciseSchema, BodyMeasurementSchema, WorkoutSchema, WorkoutItemSchema, LogSchema, WorkoutSessionSchema, HistorySnapshotSchema, HistorySnapshotPreviewSchema } from '../schemas';

// ─── HELPER ──────────────────────────────────────────────────────────────────
// Converte un DocumentSnapshot Firestore in un oggetto tipizzato User.
// I campi Timestamp Firebase vengono convertiti in stringhe ISO.
const toUser = (snapshot: any): User => {
  const data = snapshot.data() || {};
  Object.keys(data).forEach(key => {
    if (data[key]?.toDate) data[key] = data[key].toDate().toISOString();
  });
  return { id: snapshot.id, uid: snapshot.id, ...data } as User;
};

// ─── AUTH REPOSITORY ─────────────────────────────────────────────────────────

export const AuthRepository = {

  /**
   * Login con email/password.
   * Attende il token AppCheck prima di eseguire la query su Firestore per
   * prevenire race conditions PERMISSION_DENIED al bootstrap.
   *
   * NOTA firma: l'originale firebase.ts accettava anche (role?, name?) per compatibilità
   * con il Mock API. Questi parametri sono stati rimossi perché non hanno
   * responsabilità nel layer Auth reale (signIn non crea utenti).
   */
  signIn: async (
    email: string,
    password?: string,
    role?: 'pt' | 'client',
    name?: string
  ): Promise<User> => {
    if (!auth || !db) throw new Error('[AuthRepository] Firebase non inizializzato.');
    await appCheckReady;
    const credential = await signInWithEmailAndPassword(auth, email, password || '');
    const userSnap = await getDoc(doc(db, 'users', credential.user.uid));
    if (!userSnap.exists()) throw new Error('[AuthRepository] Profilo utente non trovato.');
    return toUser(userSnap);
  },

  /**
   * Registrazione nuovo utente.
   * Per i PT genera un inviteCode alfanumerico di 8 caratteri.
   * I client partono attivi (isActive: true), i PT inattivi (isActive: false)
   * in attesa di approvazione admin.
   */
  signUp: async (
    email: string,
    password: string,
    role: 'pt' | 'client',
    name: string
  ): Promise<User> => {
    if (!auth || !db) throw new Error('[AuthRepository] Firebase non inizializzato.');
    await appCheckReady;
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;
    await updateAuthProfile(credential.user, { displayName: name });

    const userData: any = {
      uid,
      name,
      email,
      role,
      ptAssigned: null,
      createdAt: serverTimestamp(),
      isActive: role === 'client',
    };

    if (role === 'pt') {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      userData.inviteCode = Array.from(
        { length: 8 },
        () => chars[Math.floor(Math.random() * chars.length)]
      ).join('');
    }

    await setDoc(doc(db, 'users', uid), userData);
    return { ...userData, createdAt: new Date().toISOString() } as User;
  },

  /** Logout. Nessun side effect sul DB. */
  logout: async (): Promise<void> => {
    if (auth) await signOut(auth);
  },

  /**
   * Invia email di reset password.
   * Attende AppCheck per evitare rejection da parte delle Security Rules.
   */
  resetPassword: async (email: string): Promise<void> => {
    if (!auth) throw new Error('[AuthRepository] Firebase Auth non inizializzato.');
    await appCheckReady;
    await sendPasswordResetEmail(auth, email);
  },

  /**
   * Subscription realtime al cambio di stato autenticazione.
   * Usa onSnapshot invece di getDoc per gestire transizioni offline/online:
   * Firestore serve la cache locale immediatamente se la rete è assente.
   *
   * @returns funzione di cleanup da chiamare nell'useEffect/unmount.
   */
  onAuthStateChanged: (callback: (user: User | null) => void): (() => void) => {
    if (!auth || !db) {
      // Allineato a firebase.ts L265: console.warn diagnostico esplicito
      console.warn('[AuthRepository] Auth non inizializzato. Callback triggerata con null.');
      callback(null);
      return () => {};
    }

    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = fbOnAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (!firebaseUser) {
        callback(null);
        return;
      }

      // Attende AppCheck prima di qualsiasi accesso Firestore per prevenire
      // PERMISSION_DENIED al bootstrap.
      await appCheckReady;

      unsubscribeSnapshot = onSnapshot(
        doc(db!, 'users', firebaseUser.uid),
        (snap) => {
          if (snap.exists()) {
            callback(toUser(snap));
          } else {
            callback(null);
          }
        },
        (err) => {
          console.error('[AuthRepository] onSnapshot errore:', err);
          callback(null);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  },

  /**
   * Aggiorna i campi del profilo utente su Firestore.
   * Filtra i valori undefined per evitare errori "Cannot set undefined" di Firebase.
   */
  updateProfile: async (userOrUid: User | string, data: Partial<User>): Promise<User> => {
    if (!db) throw new Error('[AuthRepository] Firestore non inizializzato.');
    const uid = typeof userOrUid === 'string' ? userOrUid : userOrUid.uid;
    const ref = doc(db, 'users', uid);
    const safeData: Record<string, any> = {};
    Object.entries(data).forEach(([key, val]) => {
      if (val !== undefined) safeData[key] = val;
    });
    await updateDoc(ref, safeData);
    const updated = await getDoc(ref);
    return toUser(updated);
  },

  /**
   * Eliminazione irreversibile dell'account Firebase Auth.
   * NOTA: la cancellazione dei dati Firestore è responsabilità di UsersRepository.deleteAccountData().
   * Richiede re-autenticazione per prevenire session hijacking.
   */
  deleteAuthAccount: async (password?: string): Promise<void> => {
    if (!auth) throw new Error('[AuthRepository] Firebase Auth non inizializzato.');
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('[AuthRepository] Nessun utente autenticato.');
    if (password && currentUser.email) {
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, credential);
    }
    await deleteUser(currentUser);
  },
};
