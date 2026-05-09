import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/db/mysql";
import type { Survey, SurveyAnswers, SurveyQuestion, SurveyResponse, SurveyStatus } from "@/modules/surveys/survey.types";

interface SurveyRow extends RowDataPacket {
  id: number;
  title: string;
  description: string | null;
  questions_json: string | SurveyQuestion[] | null;
  status: SurveyStatus;
  creator_id: number;
  created_at: Date;
  updated_at: Date;
  response_count?: number;
}

function parseQuestions(v: unknown): SurveyQuestion[] {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as SurveyQuestion[];
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? (v as SurveyQuestion[]) : [];
}

function rowToSurvey(r: SurveyRow): Survey {
  const out: Survey = {
    id: r.id,
    title: r.title,
    description: r.description,
    questions: parseQuestions(r.questions_json),
    status: r.status,
    creatorId: r.creator_id,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
  if (r.response_count !== undefined) out.responseCount = Number(r.response_count);
  return out;
}

export interface CreateSurveyInput {
  title: string;
  description: string | null;
  questions: SurveyQuestion[];
  status: SurveyStatus;
  creatorId: number;
}

export const surveysRepo = {
  async listPublished(): Promise<Survey[]> {
    const [rows] = await pool.query<SurveyRow[]>(
      `SELECT s.*, (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id) AS response_count
       FROM surveys s WHERE s.status = 'published' ORDER BY s.updated_at DESC`,
    );
    return rows.map(rowToSurvey);
  },

  async listAdmin(opts: { status?: SurveyStatus; limit?: number; offset?: number }) {
    const conds: string[] = [];
    const args: unknown[] = [];
    if (opts.status) {
      conds.push("s.status = ?");
      args.push(opts.status);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const [rows] = await pool.query<SurveyRow[]>(
      `SELECT s.*, (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id) AS response_count
       FROM surveys s ${where} ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const [cnt] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM surveys s ${where}`,
      args,
    );
    return { items: rows.map(rowToSurvey), total: Number((cnt[0] as { c: number }).c) };
  },

  async findById(id: number): Promise<Survey | null> {
    const [rows] = await pool.query<SurveyRow[]>(
      "SELECT * FROM surveys WHERE id = ? LIMIT 1",
      [id],
    );
    return rows[0] ? rowToSurvey(rows[0]) : null;
  },

  async create(input: CreateSurveyInput): Promise<number> {
    const [r] = await pool.execute<ResultSetHeader>(
      `INSERT INTO surveys (title, description, questions_json, status, creator_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.title,
        input.description,
        JSON.stringify(input.questions),
        input.status,
        input.creatorId,
      ],
    );
    return r.insertId;
  },

  async update(id: number, patch: Partial<Pick<CreateSurveyInput, "title" | "description" | "questions" | "status">>): Promise<void> {
    const fields: string[] = [];
    const values: (string | null)[] = [];
    if (patch.title !== undefined) {
      fields.push("title = ?");
      values.push(patch.title);
    }
    if (patch.description !== undefined) {
      fields.push("description = ?");
      values.push(patch.description);
    }
    if (patch.questions !== undefined) {
      fields.push("questions_json = ?");
      values.push(JSON.stringify(patch.questions));
    }
    if (patch.status !== undefined) {
      fields.push("status = ?");
      values.push(patch.status);
    }
    if (!fields.length) return;
    values.push(String(id));
    await pool.execute(`UPDATE surveys SET ${fields.join(", ")} WHERE id = ?`, values);
  },

  async remove(id: number): Promise<void> {
    await pool.execute("DELETE FROM survey_responses WHERE survey_id = ?", [id]);
    await pool.execute("DELETE FROM surveys WHERE id = ?", [id]);
  },

  async countResponses(surveyId: number): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM survey_responses WHERE survey_id = ?",
      [surveyId],
    );
    return Number((rows[0] as { c: number }).c);
  },

  async insertResponse(surveyId: number, userId: number | null, answers: SurveyAnswers): Promise<number> {
    const [r] = await pool.execute<ResultSetHeader>(
      `INSERT INTO survey_responses (survey_id, user_id, answers_json) VALUES (?, ?, ?)`,
      [surveyId, userId, JSON.stringify(answers)],
    );
    return r.insertId;
  },

  async countUserResponses(surveyId: number, userId: number): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM survey_responses WHERE survey_id = ? AND user_id = ?",
      [surveyId, userId],
    );
    return Number((rows[0] as { c: number }).c);
  },

  async listResponses(surveyId: number, page: number, pageSize: number): Promise<{ items: SurveyResponse[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query<RespRow[]>(
      `SELECT id, survey_id, user_id, answers_json, created_at FROM survey_responses
       WHERE survey_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [surveyId, pageSize, offset],
    );
    const [cnt] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM survey_responses WHERE survey_id = ?",
      [surveyId],
    );
    const items: SurveyResponse[] = rows.map((r) => ({
      id: r.id,
      surveyId: r.survey_id,
      userId: r.user_id,
      answers: parseAnswers(r.answers_json),
      createdAt: r.created_at.toISOString(),
    }));
    return { items, total: Number((cnt[0] as { c: number }).c) };
  },
};

interface RespRow extends RowDataPacket {
  id: number;
  survey_id: number;
  user_id: number | null;
  answers_json: string | unknown;
  created_at: Date;
}

function parseAnswers(v: unknown): SurveyAnswers {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as SurveyAnswers;
    } catch {
      return {};
    }
  }
  return (v as SurveyAnswers) ?? {};
}
