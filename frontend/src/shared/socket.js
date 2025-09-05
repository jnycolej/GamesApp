import { io } from "socket.io-client";
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080";
let socket;
export function getSocket() {
    if (!socket) socket = io(API_URL, { transports: ["websocket"], withCredentials: true });
    return socket;
}