/**
 * 路由总入口
 * --------------------------------
 * 后续模块（auth / chat / sensors / faults / reports / surveys ...）
 * 在此处统一挂载，避免 server.ts 越来越臃肿。
 */

import { Router } from "express";
import { healthRouter } from "@/routes/health";
import { authRouter } from "@/modules/auth/auth.routes";
import { usersRouter } from "@/modules/users/users.routes";
import { zonesRouter } from "@/modules/zones/zones.routes";
import { sensorsRouter } from "@/modules/sensors/sensors.routes";
import { notificationsRouter } from "@/modules/notifications/notifications.routes";
import { chatRouter } from "@/modules/chat/chat.routes";
import { faultsRouter } from "@/modules/fault/fault.routes";
import { reportsRouter } from "@/modules/reports/reports.routes";
import { surveysRouter } from "@/modules/surveys/survey.routes";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/zones", zonesRouter);
apiRouter.use("/sensors", sensorsRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/chat", chatRouter);
apiRouter.use("/fault-reports", faultsRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/surveys", surveysRouter);
