
import React, { useEffect, useState } from 'react';
import { User } from '../../types';

import { useTranslation } from '../../services/i18n';
import { X, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { UsersRepository } from '../../repositories';

interface Props {
  onClose: () => void;
}

export const AdminPanel: React.FC<Props> = ({ onClose }) => {
  const [pts, setPts] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    loadPts();
  }, []);

  const loadPts = async () => {
    const users = await UsersRepository.getAllPTs();
    setPts(users);
  };

  const toggleStatus = async (user: User) => {
    const newStatus = !user.isActive;
    await UsersRepository.toggleUserStatus(user.uid, newStatus);
    // Optimistic update
    setPts(prev => prev.map(u => u.uid === user.uid ? { ...u, isActive: newStatus } : u));
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
       <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
             <h2 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                 <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                 {t('admin_panel')}
             </h2>
             <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500">
                 <X className="w-5 h-5" />
             </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
             <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">{t('manage_pts')}</h3>
             {pts.length === 0 ? (
                 <p className="text-gray-400 text-center py-4">No PTs found.</p>
             ) : (
                 pts.map(pt => (
                     <div key={pt.uid} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                         <div>
                             <p className="font-bold text-gray-900 dark:text-white">{pt.name}</p>
                             <p className="text-xs text-gray-500 dark:text-gray-400">{pt.email}</p>
                             <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${pt.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                 {pt.isActive ? <UserCheck className="w-3 h-3"/> : <UserX className="w-3 h-3"/>}
                                 {pt.isActive ? t('active') : t('inactive')}
                             </div>
                         </div>
                         
                         <button
                            onClick={() => toggleStatus(pt)}
                            className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2  focus-visible:ring-white/75 ${
                                pt.isActive ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                         >
                            <span
                                aria-hidden="true"
                                className={`${pt.isActive ? 'translate-x-6' : 'translate-x-0'}
                                    pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out`}
                            />
                         </button>
                     </div>
                 ))
             )}
          </div>
       </div>
    </div>
  );
};
