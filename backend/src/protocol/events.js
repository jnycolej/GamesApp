export const ClientEvents = Object.freeze({
  ROOM_CREATE: "room:create",
  PLAYER_JOIN: "player:join",
  PLAYER_RESUME: "player:resume",

  ROOM_GET: "room:get",
  ROOM_LEAVE: "leaveRoom",

  GAME_START_AND_DEAL: "game:startAndDeal",
  GAME_PLAY_CARD: "game:playCard",
  GAME_HISTORY_REQUEST: "game:history:request",

  HAND_GET_MINE: "hand:getMine",
  HAND_GET_OPPONENTS: "hand:getOpponents",

  SCORE_GET_MINE: "score:getMine",
  SCORE_ADJUST: "score:adjust",

  PLAYER_SACRIFICE: "player:sacrifice",
  PLAYER_ACTIVITY: "player:activity",

  EVENT_PROPOSE: "event:propose",
  EVENT_VOTE: "event:vote",

  REACTION_SEND: "reaction:send",
});

export const ServerEvents = Object.freeze({
  ROOM_UPDATED: "room:updated",
  ROOM_EXPIRED: "room:expired",

  PLAYER_UPDATED: "player:updated",
  PLAYER_LEFT: "player:left",

  HOST_CHANGED: "host:changed",

  HAND_UPDATE: "hand:update",
  SCORE_UPDATE: "score:update",

  GAME_UPDATE: "game:update",
  GAME_HISTORY: "game:history",

  EVENT_PROPOSED: "event:proposed",
  EVENT_UPDATED: "event:updated",
  EVENT_RESOLVED: "event:resolved",
  EVENT_COOLDOWN: "event:cooldown",

  REACTION_SHOW: "reaction:show",
});