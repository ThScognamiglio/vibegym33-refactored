
import React, { useState, useEffect } from 'react';
import { User, Workout } from '../../types';
import { Button } from '../../components/Button';

import { User as UserIcon, Mail, Ruler, Weight, Target, Unlink, AlertTriangle, Globe, Trash2, Key, X, Download, ChevronDown, ChevronUp, Dumbbell } from 'lucide-react';
import { useTranslation } from '../../services/i18n';
import { ThemeToggle } from '../../components/ThemeToggle';
import { DEFAULT_PLATES, PLATE_COLORS } from '../../core/warmup/plateCalculator';
import { UsersRepository, WorkoutsRepository, AuthRepository } from '../../repositories';

interface Props {
    user: User;
    onUpdate: (user: User) => void;
}

export const ProfileScreen: React.FC<Props> = ({ user, onUpdate }) => {
    const [name, setName] = useState(user.name);
    const [weight, setWeight] = useState(user.weight?.toString() || '');
    const [height, setHeight] = useState(user.height?.toString() || '');
    const [goal, setGoal] = useState(user.goal || '');
    const [loading, setLoading] = useState(false);
    const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    // Export Data states
    const [showExportModal, setShowExportModal] = useState(false);
    const [allPlans, setAllPlans] = useState<Workout[]>([]);
    const [planCount, setPlanCount] = useState(1);
    const [selectAll, setSelectAll] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Plate Settings
    const [availablePlates, setAvailablePlates] = useState<number[]>(() => {
        try {
            const saved = localStorage.getItem('vg_gym_plates');
            return saved ? JSON.parse(saved) : DEFAULT_PLATES;
        } catch { return DEFAULT_PLATES; }
    });

    const { t, language, setLanguage } = useTranslation();

    // Compute days until next export is allowed
    const daysSinceExport = user.lastExportDate
        ? Math.floor((Date.now() - new Date(user.lastExportDate).getTime()) / (1000 * 3600 * 24))
        : 999;
    const canExport = daysSinceExport >= 30;
    const nextExportDate = user.lastExportDate
        ? new Date(new Date(user.lastExportDate).getTime() + 30 * 24 * 3600 * 1000).toLocaleDateString()
        : null;

    // Sincronizza peso con l'ultima vera misurazione in caso di disallineamento sul database
    React.useEffect(() => {
        UsersRepository.getMeasurements(user.uid).then(measurements => {
            if (measurements.length > 0) {
                const sorted = measurements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const latestWeight = sorted.find(m => m.weight && m.weight > 0)?.weight;
                if (latestWeight && latestWeight.toString() !== weight) {
                    setWeight(latestWeight.toString());
                }
            }
        });
    }, [user.uid]);

    // Load plans when export modal opens
    useEffect(() => {
        if (showExportModal && allPlans.length === 0) {
            WorkoutsRepository.getWorkoutsForClient(user.uid)
                .then(plans => {
                    const sorted = plans.sort((a, b) => b.startDate.localeCompare(a.startDate));
                    setAllPlans(sorted);
                    setPlanCount(Math.min(1, sorted.length));
                });
        }
    }, [showExportModal, user.uid, allPlans.length]);

    const handleExport = async () => {
        const count = selectAll ? allPlans.length : Math.min(Math.max(1, planCount), allPlans.length);
        const selectedPlans = allPlans.slice(0, count);
        if (selectedPlans.length === 0) return;
        setIsExporting(true);
        try {
            const data = await UsersRepository.exportClientData(user.uid, selectedPlans.map(p => p.id));
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vibe_gym_export_${user.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            // Update local user to reflect new export date
            onUpdate({ ...user, lastExportDate: new Date().toISOString() });
            setShowExportModal(false);
        } catch (e) {
            console.error('Export failed', e);
        } finally {
            setIsExporting(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const updated = await AuthRepository.updateProfile(user, {
                name,
                weight: weight ? parseFloat(weight) : undefined,
                height: height ? parseFloat(height) : undefined,
                goal
            });
            onUpdate(updated);
            alert(t('success'));
        } catch (e) {
            alert(t('error') || "Error updating profile.");
            console.error('Profile update failed:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleUnlink = async () => {
        try {
            const updatedUser = await UsersRepository.unlinkClientFromPT(user.uid);
            onUpdate(updatedUser);
            setShowUnlinkConfirm(false);
            alert(t('success'));
        } catch (e) {
            alert(t('error'));
        }
    };

    const handleDeleteAccount = async () => {
        setDeleteLoading(true);
        setDeleteError('');
        try {
            await UsersRepository.deleteAccountData(user.uid);
            await AuthRepository.deleteAuthAccount(deletePassword);
            // On success, Firebase Auth will trigger onAuthStateChanged(null) 
            // and the app will redirect to AuthScreen automatically.
        } catch (e: any) {
            console.error("Delete account error:", e);
            if (e.code === 'auth/requires-recent-login') {
                setDeleteError(t('requires_reauth'));
            } else if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
                setDeleteError(t('error'));
            } else {
                setDeleteError(e.message || t('error'));
            }
        } finally {
            setDeleteLoading(false);
        }
    };

    const togglePlate = (plate: number) => {
        const next = availablePlates.includes(plate)
            ? availablePlates.filter(p => p !== plate)
            : [...availablePlates, plate].sort((a, b) => b - a);
        setAvailablePlates(next);
        localStorage.setItem('vg_gym_plates', JSON.stringify(next));
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-hidden transition-colors">
            <div className="bg-white dark:bg-gray-800 p-6 border-b border-gray-100 dark:border-gray-700 shrink-0 flex justify-between items-center transition-colors">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('my_profile')}</h1>
                <div className="flex items-center gap-3">
                    <ThemeToggle />
                    <button
                        onClick={() => setLanguage(language === 'en' ? 'it' : 'en')}
                        className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors border border-gray-200 dark:border-gray-600"
                    >
                        <Globe className="w-3 h-3" /> {language === 'en' ? 'IT' : 'EN'}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="flex flex-col items-center py-6">
                    <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-3 border-4 border-white dark:border-gray-800 shadow-lg transition-colors">
                        <UserIcon className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-gray-900 dark:text-white font-bold text-lg">{user.name}</p>
                    <p className="text-gray-500 dark:text-gray-400 capitalize text-sm">{user.role}</p>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-5 transition-colors">
                    <div>
                        <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 mb-2">
                            <UserIcon className="w-4 h-4" /> {t('full_name')}
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-blue-500 dark:focus:border-blue-500 font-medium text-gray-900 dark:text-white transition-colors"
                        />
                    </div>

                    <div>
                        <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 mb-2">
                            <Mail className="w-4 h-4" /> {t('email')}
                        </label>
                        <input
                            value={user.email}
                            disabled
                            className="w-full p-3 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 cursor-not-allowed font-medium transition-colors"
                        />
                    </div>

                    {user.role === 'client' && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 mb-2">
                                        <Ruler className="w-4 h-4" /> {t('height')} (cm)
                                    </label>
                                    <input
                                        type="number"
                                        min="50"
                                        max="300"
                                        step="1"
                                        value={height}
                                        onChange={(e) => setHeight(e.target.value)}
                                        className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-blue-500 dark:focus:border-blue-500 font-medium text-gray-900 dark:text-white transition-colors"
                                        placeholder="175"
                                    />
                                </div>
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 mb-2">
                                        <Weight className="w-4 h-4" /> {t('weight')} (kg)
                                    </label>
                                    <input
                                        type="number"
                                        min="20"
                                        max="300"
                                        step="0.1"
                                        value={weight}
                                        onChange={(e) => setWeight(e.target.value)}
                                        className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-blue-500 dark:focus:border-blue-500 font-medium text-gray-900 dark:text-white transition-colors"
                                        placeholder="70.5"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 mb-2">
                                    <Target className="w-4 h-4" /> {t('goal')}
                                </label>
                                <select
                                    value={goal}
                                    onChange={(e) => setGoal(e.target.value)}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-blue-500 dark:focus:border-blue-500 font-medium text-gray-900 dark:text-white transition-colors"
                                >
                                    <option value="">{t('select_goal')}</option>
                                    <option value="Lose Weight">{t('lose_weight')}</option>
                                    <option value="Build Muscle">{t('build_muscle')}</option>
                                    <option value="Strength">{t('strength')}</option>
                                    <option value="Endurance">{t('endurance')}</option>
                                </select>
                            </div>
                        </>
                    )}
                </div>

                {/* Gym Equipment Section */}
                {user.role === 'client' && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                            <Dumbbell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">{t('gym_equipment')}</h3>
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{t('available_plates')}</p>
                        </div>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                        {t('available_plates_desc')}
                    </p>

                    <div className="flex flex-wrap gap-2">
                        {DEFAULT_PLATES.map(plate => (
                            <button
                                key={plate}
                                onClick={() => togglePlate(plate)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                                    availablePlates.includes(plate)
                                        ? 'border-transparent text-white shadow-lg shadow-black/10'
                                        : 'bg-gray-50 dark:bg-gray-900 text-gray-400 border-gray-100 dark:border-gray-700 opacity-60'
                                }`}
                                style={availablePlates.includes(plate) ? { backgroundColor: PLATE_COLORS[plate] ?? '#6b7280' } : {}}
                            >
                                <div className={`w-2.5 h-2.5 rounded-full ${availablePlates.includes(plate) ? 'bg-white' : 'bg-gray-300 dark:bg-gray-600'}`} />
                                {plate} kg
                            </button>
                        ))}
                    </div>
                </div>
                )}

                <div className="space-y-3">
                    <Button fullWidth onClick={handleSave} disabled={loading} size="lg">
                        {loading ? t('loading') : t('save_changes')}
                    </Button>

                    {user.role === 'client' && user.ptAssigned && !showUnlinkConfirm && (
                        <Button fullWidth variant="danger" onClick={() => setShowUnlinkConfirm(true)} className="flex items-center justify-center gap-2">
                            <Unlink className="w-4 h-4" /> {t('unlink')}
                        </Button>
                    )}

                    {showUnlinkConfirm && (
                        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-900/50 animate-slide-up transition-colors">
                            <h3 className="text-red-800 dark:text-red-400 font-bold flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-5 h-5" /> {t('unlink_confirm')}
                            </h3>
                            <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                                {t('unlink_desc')}
                            </p>
                            <div className="flex gap-2">
                                <Button fullWidth variant="secondary" onClick={() => setShowUnlinkConfirm(false)} className="dark:bg-gray-700 dark:text-white dark:border-gray-600">{t('cancel')}</Button>
                                <Button fullWidth variant="danger" onClick={handleUnlink}>{t('confirm')}</Button>
                            </div>
                        </div>
                    )}

                    {/* Export Data Button — only for clients */}
                    {user.role === 'client' && (
                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
                            <Button
                                fullWidth
                                variant="secondary"
                                onClick={() => setShowExportModal(true)}
                                className="flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40 border-none shadow-none"
                            >
                                <Download className="w-4 h-4" /> Esporta i miei Dati
                            </Button>
                        </div>
                    )}

                    <div className="pt-6 border-t border-gray-100 dark:border-gray-800 mt-6">
                        <Button
                            fullWidth
                            variant="danger"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="flex items-center justify-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 border-none shadow-none"
                        >
                            <Trash2 className="w-5 h-5" /> {t('delete_account')}
                        </Button>
                    </div>
                </div>

                {/* Modal Esportazione Dati */}
                {showExportModal && (
                    <div className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-indigo-200 dark:border-indigo-900/50 animate-slide-up">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                        <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <h3 className="font-black text-xl text-gray-900 dark:text-white">Esporta i miei Dati</h3>
                                </div>
                                <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>

                            {!canExport ? (
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-center">
                                    <p className="text-amber-800 dark:text-amber-300 font-bold text-sm">⏱ Esportazione già effettuata</p>
                                    <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">Potrai esportare nuovamente il <strong>{nextExportDate}</strong></p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                                        Scarica un file JSON con i tuoi allenamenti, log e misurazioni — pronto per essere analizzato da un'Intelligenza Artificiale o salvato come backup.
                                    </p>

                                    {/* Plan selector */}
                                    <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-4 mb-4 border border-gray-200 dark:border-gray-700">
                                        <p className="text-xs font-bold text-gray-400 uppercase mb-3">Quante schede vuoi includere?</p>

                                        {allPlans.length === 0 ? (
                                            <p className="text-sm text-gray-400 italic">Caricamento schede...</p>
                                        ) : (
                                            <>
                                                {/* Toggle "Tutte" */}
                                                <label className="flex items-center gap-3 cursor-pointer mb-3">
                                                    <div
                                                        onClick={() => setSelectAll(v => !v)}
                                                        className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${selectAll ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                                    >
                                                        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${selectAll ? 'translate-x-4' : ''}`} />
                                                    </div>
                                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Tutte le schede ({allPlans.length})</span>
                                                </label>

                                                {/* Numeric input */}
                                                {!selectAll && (
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={() => setPlanCount(v => Math.max(1, v - 1))}
                                                            className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-white font-bold text-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
                                                        >−</button>
                                                        <span className="text-2xl font-black text-gray-900 dark:text-white w-10 text-center">{Math.min(planCount, allPlans.length)}</span>
                                                        <button
                                                            onClick={() => setPlanCount(v => Math.min(allPlans.length, v + 1))}
                                                            className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-white font-bold text-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
                                                        >+</button>
                                                        <span className="text-xs text-gray-400">su {allPlans.length} disponibili</span>
                                                    </div>
                                                )}

                                                {/* Live preview of selected plans */}
                                                <div className="mt-3 space-y-1">
                                                    {allPlans.slice(0, selectAll ? allPlans.length : Math.min(planCount, allPlans.length)).map((plan, i) => (
                                                        <div key={plan.id} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                            <span className="w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0">{i + 1}</span>
                                                            <span className="font-medium text-gray-700 dark:text-gray-200 truncate">{plan.name}</span>
                                                            <span className="ml-auto shrink-0">{new Date(plan.startDate).toLocaleDateString()} → {new Date(plan.endDate).toLocaleDateString()}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        <Button fullWidth variant="secondary" onClick={() => setShowExportModal(false)} className="dark:bg-gray-700 dark:text-white dark:border-gray-600">Annulla</Button>
                                        <Button
                                            fullWidth
                                            onClick={handleExport}
                                            disabled={isExporting || allPlans.length === 0}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white border-none font-bold"
                                        >
                                            {isExporting ? 'Export...' : 'Scarica JSON'}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Modal Eliminazione Account */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black/50 dark:bg-black/80 dark:backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-red-200 dark:border-red-900/50 animate-slide-up">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                    </div>
                                    <h3 className="font-black text-xl text-gray-900 dark:text-white">{t('delete_account')}</h3>
                                </div>
                                <button onClick={() => {
                                    setShowDeleteConfirm(false);
                                    setDeleteError('');
                                    setDeletePassword('');
                                }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400 dark:hover:text-white" /></button>
                            </div>

                            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3 mb-6">
                                <p>{t('delete_warning_body')}</p>
                                <p className="font-bold text-red-600 dark:text-red-400">{t('delete_irr')}</p>

                                {deleteError && (
                                    <div className="bg-red-50 dark:bg-red-900/30 p-3 rounded-xl border border-red-100 dark:border-red-800 text-red-700 dark:text-red-300 text-xs">
                                        {deleteError}
                                    </div>
                                )}

                                <div className="pt-2">
                                    <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-400 mb-2">
                                        <Key className="w-4 h-4" /> {t('delete_confirm_password')}
                                    </label>
                                    <input
                                        type="password"
                                        value={deletePassword}
                                        onChange={(e) => setDeletePassword(e.target.value)}
                                        placeholder={t('delete_confirm_password_placeholder')}
                                        className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-red-500 dark:focus:border-red-500 font-medium text-gray-900 dark:text-white transition-colors"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">{t('firebase_reauth_hint')}</p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    fullWidth
                                    variant="secondary"
                                    onClick={() => {
                                        setShowDeleteConfirm(false);
                                        setDeleteError('');
                                        setDeletePassword('');
                                    }}
                                    className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-none"
                                >
                                    {t('cancel')}
                                </Button>
                                <Button
                                    fullWidth
                                    variant="danger"
                                    onClick={handleDeleteAccount}
                                    disabled={deleteLoading}
                                    className="flex items-center justify-center gap-2"
                                >
                                    {deleteLoading ? t('loading') : t('delete_permanently')}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="h-20"></div> {/* Spacer for bottom nav */}
            </div>
        </div>
    );
};
