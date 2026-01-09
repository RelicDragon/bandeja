export interface BasicUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  level: number;
  socialLevel: number;
  gender: string;
  approvedLevel: boolean;
  isTrainer: boolean;
}
