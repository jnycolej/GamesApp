import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import healthRoutes from "./routes/healthRoutes.js";
import { createScheduleRoutes } from "./routes/scheduleRoutes.js";
import { createDebugRoutes } from "./routes/debugRoutes.js";

import { gameSchedules } from "./data/gameSchedules.js";
import { corsOptions } from "./config/cors.js";
import { isProd } from "./config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp({ rooms }) {
    const app = express();

    app.set("trust proxy", 1);

    app.use(cors(corsOptions));

    app.use(healthRoutes);
    app.use(createScheduleRoutes(gameSchedules));
    app.use(createDebugRoutes(rooms));

    if (isProd) {
        const distDir = path.join(
            __dirname,
            "../../frontend-vite/dist",
        );

        app.use(express.static(distDir));

        app.get(/^\/(?!socket\.io\/).*/, (_req, res) => {
            res.sendFile(
                path.join(distDir, "index.html"),
            );
        });
    }

    return app;
}