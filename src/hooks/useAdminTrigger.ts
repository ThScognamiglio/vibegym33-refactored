import { useState, useCallback } from 'react';

export function useAdminTrigger(isAdmin: boolean | undefined) {
  const [adminClicks, setAdminClicks] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);

  const triggerAdmin = useCallback(() => {
    if (!isAdmin) return;
    
    const newCount = adminClicks + 1;
    setAdminClicks(newCount);
    
    if (newCount >= 5) {
      setShowAdmin(true);
      setAdminClicks(0);
    }
    
    setTimeout(() => setAdminClicks(0), 2000);
  }, [isAdmin, adminClicks]);

  return { showAdmin, setShowAdmin, triggerAdmin };
}
