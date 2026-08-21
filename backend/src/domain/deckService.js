import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RARITY_TO_WEIGHT = Object.freeze({
  common: 5,
  semicommon: 4,
  uncommon: 3,
  unusual: 2,
  rare: 1,
});

function getDeckPath(gameType) {
    switch(gameType) {
        case "baseball": 
            return path.join( __dirname, "../data/baseballDeck.json");
        case "basketball":
            return path.join( __dirname, "../data/basketballDeck.json");
        case "football":
        default:
            return path.join( __dirname, "../data/footballDeck.json",);
    }
}

export function loadDeck(gameType) {
    const file = getDeckPath(gameType);

    if (!fs.existsSync(file)) {
        throw new Error(
            `Deck file not found: ${file}`,
        );
    }

    const raw = JSON.parse(
        fs.readFileSync(file, "utf8"),
    );

    return raw.map((card) => {
        const points = Number.isFinite(card.points)
            ? card.points
            : card.points != null
                ? Number(card.points)
                : 0;
        
        const description = 
            card.description ??
            card.title ??
            card.name ??
            "";

        const penalty =
            card.penalty ?? "";
        
        let rawWeight;

        if (card.weight != null) {
            const parsed = Number(card.weight);

            rawWeight = Number.isFinite(parsed)
                ? parsed
                : 1;
        } else if (card.rarity) {
            const rarity = String(card.rarity).toLowerCase();

            rawWeight = RARITY_TO_WEIGHT[rarity] ?? 1;
        } else {
            rawWeight = 1;
        }

        const weight = Math.max(
            1,
            Math.floor(rawWeight),
        );

        return {
            id: card.id ?? crypto.randomUUID(),
            description,
            penalty,
            points,
            title: card.title ?? description ?? "Card",
            text: card.text ?? description ?? "",
            meta: {
                ...(card.meta || {}),
                penalty,
                points,
            },
            rarity: card.rarity ?? null,
            weight,
        };   
    });
}

export function drawCard(room) {
    if (!room) {
        throw new Error(
            "drawCard called with no room",
        );
    }

    if (!room.deckBase) {
        room.deckBase = loadDeck(room.gameType || "football");
    }

    const base = room.deckBase;

    if (!base?.length) {
        throw new Error(
            "No base deck loaded",
        );
    }

    const totalWeight = 
        base.reduce((sum, card) =>  
            sum + (card.weight || 1),
            0,
        );
    
    let random = Math.random() * totalWeight;

    let template = base[0];

    for (const card of base) {
        random -=
            card.weight || 1;
        
        if (random <= 0) {
            template = card;
            break;
        }
    }

    const instanceId = 
        crypto.randomUUID();
    
    return {
        ...template,

        id: instanceId,
        instanceId,

        templateId:
            template.id,
    };

}