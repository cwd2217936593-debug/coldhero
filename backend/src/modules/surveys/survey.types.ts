export type SurveyStatus = "draft" | "published" | "closed";

export type QuestionType = "text" | "single" | "multiple";

export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  title: string;
  /** single / multiple 必填 */
  options?: string[];
}

export interface Survey {
  id: number;
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
  status: SurveyStatus;
  creatorId: number;
  createdAt: string;
  updatedAt: string;
  /** 列表接口可选 */
  responseCount?: number;
}

export type SurveyAnswers = Record<string, string | string[]>;

export interface SurveyResponse {
  id: number;
  surveyId: number;
  userId: number | null;
  answers: SurveyAnswers;
  createdAt: string;
}
