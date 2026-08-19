import cors from "cors";
import { isProd } from "./env.js";


const developmentOrigins = isProd
  ? true
  : [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://192.168.1.103:5173",
    ];


// This handles the case where Origin might be undefined in some environments
export const corsOptions = {
  origin: (origin, cb) => {
    if(isProd) {
        return cb(null, true);
    }

    if (developmentOrigins === true) return cb(null, true);
    if (!origin) return cb(null, true); // allow same-origin / non-browser clients
    return cb(null, developmentOrigins.includes(origin));
  },
  credentials: false,
};