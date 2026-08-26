export const ErrorCodes = Object.freeze({
  // Protocol / connection
  INCOMPATIBLE_PROTOCOL_VERSION: "version_protocol_version",

  // Room / session
  ROOM_NOT_FOUND: "room_not_found",
  NOT_IN_ROOM: "not_in_room",
  PLAYER_NOT_FOUND: "player_not_found",
  MISSING_RECONNECT_TOKEN: "missing_reconnect_token",
  ADD_PLAYER_FAILED: "add_player_failed",
  CREATE_FAILED: "create_failed",
  JOIN_FAILED: "join_failed",
  LEAVE_FAILED: "leave_failed",
  NO_HAND: "no_hand",

  // Game actions
  ACTION_IN_PROGRESS: "action_in_progress",
  LOCKED: "locked",
  GAME_NOT_PLAYING: "game_not_playing",
  INVALID_DELTA: "invalid_delta",
  MISSING_CARD: "missing_card",
  SACRIFICE_FAILED: "sacrifice_failed",
  CARD_NOT_IN_HAND: "card_not_in_hand",

  // Game event voting
  COOLDOWN: "cooldown",
  EVENT_ALREADY_PENDING: "event_already_pending",
  INVALID_EVENT: "invalid_event",
  NO_VOTERS: "no_voters",
  NO_PENDING_EVENT: "no_pending_event",
  EVENT_ID_MISMATCH: "event_id_mismatch",
  VOTE_EXPIRED: "vote_expired",
  INVALID_VOTE: "invalid_vote",
  PROPOSER_CANNOT_VOTE: "proposer_cannot_vote",

  // Reactions
  REACTION_COOLDOWN: "reaction_cooldown",
  INVALID_REACTION: "invalid_reaction",

  // General
  SERVER_ERROR: "server_error",
  NOT_PLAYING: "not_playing",
  BAD_DELTA: "bad_delta",
  BAD_INDEX: "bad_index",
  REQUEST_IN_PROGRESS: "request_in_progress",


  //Game start errors
  NOT_HOST: "not_host",
  NOT_ENOUGH_PLAYERS: "not_enough_players",
  BAD_INVITE_TOKEN: "bad_token",
  INVITE_TOKEN_EXPIRED: "token_expired",
  NO_INVITE: "no_invite"

});