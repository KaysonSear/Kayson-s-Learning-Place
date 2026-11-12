import type { DrillAnswer, DrillAttempt } from './cloud-types.ts';

export interface SourceSection {
  title: string;
  markdown: string;
  html: string;
}
export interface Point extends SourceSection {
  id: number;
  chapter: number;
  cluster: string;
  search: string;
}
export interface Chapter extends SourceSection {
  id: number;
  pointIds: number[];
  labId: string;
}
export interface Cluster extends SourceSection {
  id: string;
  chapter: number;
}
export type Stage = 'a' | 'b';
export interface QuestionRef { id: string; pointId: number; stage: Stage; revision?: string }
interface QuestionCopy { prompt: string; hint: string; explanation: string; code?: string; sourceTable?: boolean }
export type Exercise =
  | { kind: 'input'; answer: string | string[] }
  | { kind: 'choice'; options: string[]; answer: number }
  | { kind: 'order'; options: string[]; answer: number[] }
  | { kind: 'match'; options: string[]; items: string[]; answer: number[] };
export type Question = QuestionRef & QuestionCopy & Exercise;
export type AuthoredExercise = { prompt: string } & Extract<Exercise, { kind: 'input' | 'choice' }>;
export type InteractiveExercise = QuestionCopy & Exercise;
export interface DrillQuestion {
  id: number;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  legacyOptionMap: number[];
  optionIds?: string[];
  legacyOptionIds?: {1: string[]; 2: string[]};
  legacyGrade?: {revision:string; correctId:string; correctLabel:string; retired?:Record<string,string>};
  revision?: string;
  sourceTable?: boolean;
}
export interface Library {
  version: 1;
  title: string;
  standard: 'C23';
  sourceHash: string;
  chapters: Chapter[];
  clusters: Cluster[];
  points: Point[];
  extras: SourceSection[];
  questions: Question[];
  drillQuestions: DrillQuestion[];
  counts: Record<'chapters' | 'clusters' | 'points' | 'questions' | 'drillQuestions' | 'diagrams', number>;
}
export interface Evidence { time: number; day: string }
export interface PointProgress {
  base: Evidence | null;
  transfer: Evidence | null;
  attempts: number;
  reviewStep: number;
  due: number;
  needsWork: boolean;
  last?: number;
  reviewDay?: string;
}
export interface Grade { correct: boolean; assisted: boolean; skipped: boolean }
export interface RoundAnswer extends Grade { questionId: string; pointId: number }
export interface Attempt extends RoundAnswer { stage: Stage; time: number; revision?: string }
export type AnswerValue = string | number | (number | null)[] | null;
export interface Draft {
  value: AnswerValue;
  assisted: boolean;
  submitted: boolean;
  everWrong: boolean;
  correct?: boolean;
  skipped?: boolean;
  showHint?: boolean;
}
export interface Scope { chapter?: number | null; pointId?: number | null }
export interface Session {
  queue: string[];
  index: number;
  answers: RoundAnswer[];
  current: Draft;
  scope: Scope;
  started: number;
}
export type DrillMode = 'sequence' | 'random';
export interface DrillRound {
  mode: DrillMode;
  order: number[];
  current: number;
  answers: Record<number, number>;
  finished: boolean;
  optionVersion: 2;
  roundId?: string;
  answerInfo?: Record<number, DrillAnswer>;
}
export interface Progress {
  schemaVersion: 1;
  updatedAt: number;
  points: Record<number, PointProgress>;
  history: Attempt[];
  labs: Record<string, number>;
  settings: { reduceMotion: boolean; textSize: number };
  session: Session | null;
  lastPoint: number | null;
  rounds: number;
  drill?: DrillRound | null;
  drillAttempts?: DrillAttempt[];
}
