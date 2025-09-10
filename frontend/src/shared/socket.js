import { io } from "socket.io-client";

const isBrowser = typeof window !== "undefined";
const isProd = isBrowser && window.location.protocol === "https:";
const API_URL = isProd
    ? window.location.origin
    : (process.env.REACT_APP_API_URL || "http://localhost:8080");

let socket;
export function getSocket() {
    if (!socket) {
        socket = io(API_URL, {
            withCredentials:true,
            path: "/socket.io",
        });
    }
    return socket;
}