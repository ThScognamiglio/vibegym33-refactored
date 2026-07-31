import { Exercise as IExercise } from '../../types';
import { Equipment, normalizeEquipment } from './Equipment';

export class Exercise implements IExercise {
  id: string;
  ptId: string;
  groupId: string;
  name: string;
  description: string;
  equipment: Equipment;
  level: 'beginner' | 'intermediate' | 'advanced';
  measurement?: 'reps' | 'time';
  videoUrl?: string;
  nscaCategory?: string;
  isUnilateral?: boolean;

  constructor(raw: IExercise) {
    this.id = raw.id;
    this.ptId = raw.ptId;
    this.groupId = raw.groupId;
    this.name = raw.name;
    this.description = raw.description;
    this.equipment = raw.equipment;
    this.level = raw.level;
    this.measurement = raw.measurement;
    this.videoUrl = raw.videoUrl;
    this.nscaCategory = raw.nscaCategory;
    this.isUnilateral = raw.isUnilateral;
  }

  get normalizedEquipment(): Equipment {
    return normalizeEquipment(this.equipment);
  }

  get isBodyweight(): boolean {
    return this.normalizedEquipment === Equipment.BODYWEIGHT;
  }
}
