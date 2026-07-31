import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Database } from 'lucide-react';
import { useTranslation } from '../../services/i18n';

export type ArchiveStatus = 'idle' | 'running' | 'done';

interface Props {
    status: ArchiveStatus;
}

/**
 * Banner fisso in cima allo schermo che informa l'utente durante la prima
 * archiviazione dei log storici. Appare solo durante 'running' e 'done'.
 * Scompare automaticamente 4 secondi dopo il completamento.
 */
export const ArchiveBanner: React.FC<Props> = ({ status }) => {
    const { t } = useTranslation();

    return (
        <AnimatePresence>
            {status !== 'idle' && (
                <motion.div
                    key={status}
                    initial={{ opacity: 0, y: -70 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -70 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className={`fixed top-0 left-0 right-0 z-[200] px-4 py-3 flex items-center gap-3 shadow-xl safe-area-top
                        ${status === 'running'
                            ? 'bg-amber-500 text-gray-900'
                            : 'bg-green-500 text-white'
                        }`}
                >
                    {status === 'running' ? (
                        <>
                            {/* Spinner */}
                            <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm leading-tight">
                                    {t('archive_banner_title') || 'Ottimizzazione dati in corso…'}
                                </p>
                                <p className="text-xs opacity-80 mt-0.5 truncate">
                                    {t('archive_banner_subtitle') || "Non chiudere l'app. Stiamo comprimendo lo storico allenamenti."}
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm leading-tight">
                                    {t('archive_done_title') || 'Storico ottimizzato!'}
                                </p>
                                <p className="text-xs opacity-80 mt-0.5">
                                    {t('archive_done_subtitle') || 'I tuoi dati storici sono stati salvati correttamente.'}
                                </p>
                            </div>
                            <Database className="w-5 h-5 shrink-0 opacity-60" />
                        </>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};
