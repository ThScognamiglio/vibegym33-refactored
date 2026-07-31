import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionsRepository } from '../repositories/sessions.repository';
import * as firestore from 'firebase/firestore';
import * as logsRepo from '../repositories/logs.repository';

vi.mock('firebase/firestore', () => {
    return {
        collection: vi.fn(),
        doc: vi.fn(),
        getDoc: vi.fn(),
        getDocs: vi.fn(),
        addDoc: vi.fn(),
        updateDoc: vi.fn(),
        deleteDoc: vi.fn(),
        setDoc: vi.fn(),
        query: vi.fn(),
        where: vi.fn(),
        orderBy: vi.fn(),
        writeBatch: vi.fn(() => ({
            delete: vi.fn(),
            commit: vi.fn()
        })),
        serverTimestamp: vi.fn(),
        Timestamp: vi.fn(),
    };
});

vi.mock('../services/firebase.config', () => ({
    db: {} // dummy db
}));

vi.mock('../repositories/logs.repository', () => ({
    invalidateLogsCache: vi.fn(),
}));

describe('SessionsRepository.cleanupTodaySession', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should delete skipped logs and deduplicate real logs keeping the highest weight', async () => {
        const todayStr = '2026-06-10';
        vi.setSystemTime(new Date(`${todayStr}T12:00:00Z`));

        // Mock data for logs
        const mockLogs = [
            { id: 'log1', data: () => ({ workoutId: 'plan1', exerciseId: 'ex1', seriesNo: 1, weight: 10, reps: 10, completed: true }), ref: 'ref1' },
            { id: 'log2', data: () => ({ workoutId: 'plan1', exerciseId: 'ex1', seriesNo: 1, weight: 15, reps: 10, completed: true }), ref: 'ref2' }, // Duplicato con peso maggiore
            { id: 'log3', data: () => ({ workoutId: 'plan1', exerciseId: 'ex1', seriesNo: 2, weight: 12, reps: 8, completed: false }), ref: 'ref3' }, // Skippato
            { id: 'log4', data: () => ({ workoutId: 'plan2', exerciseId: 'ex2', seriesNo: 1, weight: 20, reps: 5, completed: true }), ref: 'ref4' }, // Altro piano (ignorato)
        ];

        // Mock data for sessions
        const mockSessions = [
            { id: 'sess1', data: () => ({ workoutId: 'plan1', volume: 0, sets: 0, timestamp: { seconds: 200 } }), ref: 'sessRef1' },
            { id: 'sess2', data: () => ({ workoutId: 'plan1', volume: 0, sets: 0, timestamp: { seconds: 100 } }), ref: 'sessRef2' }, // Sessione più vecchia (verrà eliminata)
        ];

        vi.mocked(firestore.getDoc).mockResolvedValue({
            exists: () => true,
            data: () => ({ ptId: 'test-pt', weight: 80 })
        } as any);

        let callCount = 0;
        vi.mocked(firestore.getDocs).mockImplementation(async (queryOrCollection: any) => {
            callCount++;
            if (callCount === 1) return { docs: mockLogs } as any; // First call: get logs
            if (callCount === 2) return { // Second call: exercises
                forEach: (cb: any) => {
                    cb({ id: 'ex1', data: () => ({ equipment: 'barbell', isUnilateral: false }) });
                    cb({ id: 'ex2', data: () => ({ equipment: 'machine', isUnilateral: false }) });
                }
            } as any;
            if (callCount === 3) return { docs: mockSessions } as any; // Third call: get sessions
            return { docs: [] } as any;
        });

        const result = await SessionsRepository.cleanupTodaySession('test-user', 'plan1');

        // deletedLogs = log1 (duplicato, peso minore) + log3 (skippato)
        expect(result.deletedLogs).toBe(2);
        
        // deleteDoc should be called for log1, log3, and sess2
        expect(firestore.deleteDoc).toHaveBeenCalledTimes(3);
        expect(firestore.deleteDoc).toHaveBeenCalledWith('ref1');
        expect(firestore.deleteDoc).toHaveBeenCalledWith('ref3');
        expect(firestore.deleteDoc).toHaveBeenCalledWith('sessRef2');

        // cleanLogs is only log2 (15 * 10 = 150)
        expect(result.cleanSets).toBe(1);
        expect(result.cleanVolume).toBe(150);

        // check re-indexing (log2 had seriesNo 1, and only 1 remains, so no reindex should be needed)
        expect(firestore.updateDoc).not.toHaveBeenCalled();

        // check session update
        expect(firestore.setDoc).toHaveBeenCalledWith('sessRef1', { volume: 150, sets: 1 }, { merge: true });

        // Check cache invalidation
        expect(logsRepo.invalidateLogsCache).toHaveBeenCalled();
    });

    it('should reindex seriesNo if gaps exist', async () => {
        const todayStr = '2026-06-10';
        vi.setSystemTime(new Date(`${todayStr}T12:00:00Z`));

        // Mock data for logs
        const mockLogs = [
            { id: 'log1', data: () => ({ workoutId: 'plan1', exerciseId: 'ex1', seriesNo: 2, weight: 10, reps: 10, completed: true }), ref: 'ref1' },
            { id: 'log2', data: () => ({ workoutId: 'plan1', exerciseId: 'ex1', seriesNo: 4, weight: 15, reps: 10, completed: true }), ref: 'ref2' },
        ];

        vi.mocked(firestore.getDoc).mockResolvedValue({
            exists: () => true,
            data: () => ({ ptId: 'test-pt', weight: 80 })
        } as any);

        let callCount = 0;
        vi.mocked(firestore.getDocs).mockImplementation(async (queryOrCollection: any) => {
            callCount++;
            if (callCount === 1) return { docs: mockLogs } as any; // First call: get logs
            if (callCount === 2) return { // Second call: exercises
                forEach: (cb: any) => {
                    // Mock un esercizio a corpo libero per coprire il ramo if
                    cb({ id: 'ex1', data: () => ({ equipment: 'bodyweight', isUnilateral: false }) });
                    cb({ id: 'ex2', data: () => ({ equipment: 'barbell', isUnilateral: false }) });
                }
            } as any;
            if (callCount === 3) return { docs: [] } as any; // Third call: get sessions
            return { docs: [] } as any;
        });

        await SessionsRepository.cleanupTodaySession('test-user', 'plan1');

        // log1 should have seriesNo updated to 1
        expect(firestore.updateDoc).toHaveBeenCalledWith(undefined, { seriesNo: 1 });
        // log2 should have seriesNo updated to 2
        expect(firestore.updateDoc).toHaveBeenCalledWith(undefined, { seriesNo: 2 });
        expect(firestore.updateDoc).toHaveBeenCalledTimes(2);
    });
});
