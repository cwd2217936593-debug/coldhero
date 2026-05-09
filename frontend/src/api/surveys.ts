import { api } from "@/api/client";
import type {
  ApiResp,
  Survey,
  SurveyAnswers,
  SurveyAdminListResp,
  SurveyQuestion,
  SurveyResponseListResp,
  SurveyStatus,
  SurveySummaryResp,
} from "@/api/types";

export interface CreateSurveyDto {
  title: string;
  description?: string | null;
  questions: SurveyQuestion[];
  status?: SurveyStatus;
}

export interface UpdateSurveyDto {
  title?: string;
  description?: string | null;
  questions?: SurveyQuestion[];
  status?: SurveyStatus;
}

export async function listPublishedSurveys(): Promise<Survey[]> {
  const r = await api.get<ApiResp<Survey[]>>("/surveys/published");
  return r.data.data;
}

export interface ListSurveysAdminParams {
  status?: SurveyStatus;
  page?: number;
  pageSize?: number;
}

export async function listSurveysAdmin(params: ListSurveysAdminParams = {}): Promise<SurveyAdminListResp> {
  const r = await api.get<ApiResp<SurveyAdminListResp>>("/surveys/admin", { params });
  return r.data.data;
}

export async function getSurvey(id: number): Promise<Survey> {
  const r = await api.get<ApiResp<Survey>>(`/surveys/${id}`);
  return r.data.data;
}

export async function createSurvey(dto: CreateSurveyDto): Promise<Survey> {
  const r = await api.post<ApiResp<Survey>>("/surveys", dto);
  return r.data.data;
}

export async function updateSurvey(id: number, dto: UpdateSurveyDto): Promise<Survey> {
  const r = await api.patch<ApiResp<Survey>>(`/surveys/${id}`, dto);
  return r.data.data;
}

export async function deleteSurvey(id: number): Promise<void> {
  await api.delete(`/surveys/${id}`);
}

export async function submitSurveyAnswers(surveyId: number, answers: SurveyAnswers): Promise<unknown> {
  const r = await api.post<ApiResp<unknown>>(`/surveys/${surveyId}/responses`, { answers });
  return r.data.data;
}

export async function listSurveyResponses(
  surveyId: number,
  params: { page?: number; pageSize?: number } = {},
): Promise<SurveyResponseListResp> {
  const r = await api.get<ApiResp<SurveyResponseListResp>>(`/surveys/${surveyId}/responses`, { params });
  return r.data.data;
}

export async function getSurveySummary(surveyId: number): Promise<SurveySummaryResp> {
  const r = await api.get<ApiResp<SurveySummaryResp>>(`/surveys/${surveyId}/summary`);
  return r.data.data;
}
