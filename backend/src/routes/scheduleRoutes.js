import express from "express";

export function createScheduleRoutes(gameSchedules) {
    const router = express.Router();

    router.get("/api/schedules", (_req, res) => {
        console.log("SCHEDULE REQUEST RECEIVED");
        res.json(gameSchedules);
    });

    return router;
}