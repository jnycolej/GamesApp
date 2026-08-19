import express from "express";

export function createDebugRoutes(rooms) {
    const router = express.Router();

    router.get("/debug/rooms", (_req, res) => {
        try {
            const list = rooms.listCodes
                ? rooms.listCodes()
                : [];
            
            res.json({
                rooms: list,
            });
        } catch (err) {
            console.error("/debug/rooms error", err);

            res.status(500).json({
                rooms: "error",
            });
        }
    });

    return router;
}