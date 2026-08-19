import express from "express";

const router = express.Router();

router.get("/healthz", (_req, res) => {
    res.send("ok");
});

export default router;