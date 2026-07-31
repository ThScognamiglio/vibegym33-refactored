import { Workout as IWorkout } from '../../types';

export class Workout implements IWorkout {
  id: string;
  ptId: string;
  clientId: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE';
  startDate: string;
  endDate: string;

  constructor(raw: IWorkout) {
    this.id = raw.id;
    this.ptId = raw.ptId;
    this.clientId = raw.clientId;
    this.name = raw.name;
    this.status = raw.status;
    this.startDate = raw.startDate;
    this.endDate = raw.endDate;
  }

  get isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
