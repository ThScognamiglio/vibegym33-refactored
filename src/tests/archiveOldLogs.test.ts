import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogsRepository } from '../repositories/logs.repository';

// ─── Firebase/app mock ────────────────────────────────────────────────────────
// Necessario per evitare che firebase.config.ts esegua initializeApp() reale.
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}));

// ─── Firebase/app-check mock ──────────────────────────────────────────────────
// Evita la chiamata a ReCaptchaV3Provider che richiede il DOM e una chiave reale.
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(),
  ReCaptchaV3Provider: vi.fn(),
  getToken: vi.fn(() => Promise.resolve({ token: 'mock-token' })),
}));

// ─── Firebase/auth mock ───────────────────────────────────────────────────────
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  setPersistence: vi.fn(() => Promise.resolve()),
  browserLocalPersistence: {},
}));

// ─── Firebase/firestore mock ──────────────────────────────────────────────────
// Include TUTTE le funzioni usate sia dal repository che da firebase.config.ts
// durante l'inizializzazione, altrimenti Vitest lancia un errore di export
// mancante prima ancora di eseguire i test.
vi.mock('firebase/firestore', () => ({
  // Usate da firebase.config.ts (inizializzazione Firestore)
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
  // Usate da logs.repository.ts (operazioni CRUD)
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
  })),
  serverTimestamp: vi.fn(() => ({ _seconds: 0, _nanoseconds: 0 })),
  Timestamp: {
    fromDate: vi.fn((d: Date) => ({ toDate: () => d })),
    now: vi.fn(() => ({ toDate: () => new Date() })),
  },
  getFirestore: vi.fn(() => ({})),
}));

describe('LogsRepository.archiveOldLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip archiving if already executed today', async () => {
    // Arrange
    const { getDoc } = await import('firebase/firestore');
    const today = new Date().toISOString().split('T')[0];
    
    // Mock user document returning today's date for lastArchiveDate
    (getDoc as any).mockResolvedValueOnce({
      data: () => ({ lastArchiveDate: today, archivingInProgress: false })
    });

    // Act
    const result = await LogsRepository.archiveOldLogs('user123', true);

    // Assert
    expect(result.archivedMonths).toBe(0);
    expect(result.deletedDocs).toBe(0);
    // updateDoc should not be called
    const { updateDoc } = await import('firebase/firestore');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('should skip archiving if archiving is already in progress (anti-concurrency)', async () => {
    // Arrange
    const { getDoc } = await import('firebase/firestore');
    
    (getDoc as any).mockResolvedValueOnce({
      data: () => ({ lastArchiveDate: '2023-01-01', archivingInProgress: true })
    });

    // Act
    const result = await LogsRepository.archiveOldLogs('user123', true);

    // Assert
    expect(result.archivedMonths).toBe(0);
    expect(result.deletedDocs).toBe(0);
    const { updateDoc } = await import('firebase/firestore');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('should handle missing user document gracefully', async () => {
    const { getDoc, getDocs } = await import('firebase/firestore');

    // Documento utente assente → data() ritorna undefined
    // Il repository fa: userData = userSnap.data() || {} → {}
    // Nessun guard scatta, quindi procede a cercare log vecchi
    (getDoc as any).mockResolvedValueOnce({
      data: () => undefined
    });

    // Simula zero log da archiviare (snapshot vuota)
    (getDocs as any).mockResolvedValueOnce({
      empty: true,
      docs: [],
    });

    const result = await LogsRepository.archiveOldLogs('user123', true);
    expect(result).toBeDefined();
    expect(result.archivedMonths).toBe(0);
    expect(result.deletedDocs).toBe(0);
  });
});
