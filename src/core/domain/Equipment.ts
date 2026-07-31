export enum Equipment {
  BARBELL = 'barbell',
  DUMBBELL = 'dumbbell',
  MACHINE = 'machine',
  CABLE = 'cable',
  KETTLEBELL = 'kettlebell',
  BODYWEIGHT = 'bodyweight',
  OTHER = 'other',
}

export function normalizeEquipment(eq: string | undefined | null): Equipment {
  if (!eq) return Equipment.OTHER;
  const clean = eq.trim().toLowerCase();
  if (clean.includes('barbell') || clean === 'bar' || clean === 'bilanciere') {
    return Equipment.BARBELL;
  }
  if (clean.includes('dumbbell') || clean === 'db' || clean === 'manubrio' || clean === 'manubri') {
    return Equipment.DUMBBELL;
  }
  if (clean.includes('machine') || clean === 'macchina' || clean === 'pressa' || clean === 'leg extension' || clean === 'pectoral') {
    return Equipment.MACHINE;
  }
  if (clean.includes('cable') || clean === 'cavi' || clean === 'cavo') {
    return Equipment.CABLE;
  }
  if (clean.includes('kettlebell') || clean === 'kb') {
    return Equipment.KETTLEBELL;
  }
  if (clean.includes('bodyweight') || clean === 'corpo libero' || clean === 'corpolibero' || clean === 'body' || clean === 'barba') {
    return Equipment.BODYWEIGHT;
  }
  
  // Direct matching fallback
  switch (clean) {
    case 'barbell': return Equipment.BARBELL;
    case 'dumbbell': return Equipment.DUMBBELL;
    case 'machine': return Equipment.MACHINE;
    case 'cable': return Equipment.CABLE;
    case 'kettlebell': return Equipment.KETTLEBELL;
    case 'bodyweight': return Equipment.BODYWEIGHT;
    default: return Equipment.OTHER;
  }
}
