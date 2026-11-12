import type { Attempt, DrillRound, Progress, Session } from './types.ts';

export interface DrillAnswer {
  optionId: string;
  revision: string;
  correct: boolean;
  label: string;
  correctLabel: string;
}

export interface DrillAttempt extends DrillAnswer {
  operationId: string;
  roundId: string;
  questionId: number;
}

export interface DrillPosition {
  mode: DrillRound['mode'];
  order?: number[];
  current: number;
  finished: boolean;
}

export interface CloudChange {
  time: number;
  session?: Session | null;
  attempts?: Attempt[];
  completedRounds?: number;
  labs?: Progress['labs'];
  settings?: Partial<Progress['settings']>;
  lastPoint?: number | null;
  drill?: {
    roundId: string;
    start?: DrillPosition & {order: number[]};
    position?: DrillPosition;
    answer?: {questionId: number; answer: DrillAnswer};
  };
  /** A mistake-book answer outside any drill round (logged under REVIEW_ROUND). */
  review?: {questionId: number; answer: DrillAnswer};
}

export interface CloudOperation {
  id: string;
  change: CloudChange;
}

export interface AcceptedOperation extends CloudOperation {
  seq: number;
}

export type CloudResponse =
  | {initialized: false}
  | {initialized: true; seed?: Progress; operations: AcceptedOperation[]; more: boolean};
