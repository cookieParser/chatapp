export const APP_NAME = 'ChatApp';

export const WEBSOCKET_CONFIG = {
  HEARTBEAT_INTERVAL: 30000,
  RECONNECT_BASE_DELAY: 1000,
  RECONNECT_MAX_DELAY: 30000,
  MAX_RECONNECT_ATTEMPTS: 10,
} as const;

export const SOCKET_THROTTLE = {
  TYPING_DEBOUNCE_MS: 300,
  TYPING_THROTTLE_MS: 500, // Emit typing events at most once every 500ms
  TYPING_TIMEOUT_MS: 3000, // Remove typing indicator after 3s of inactivity
  BATCH_RECEIPTS_MS: 500,
  MAX_BATCH_SIZE: 50,
  // Additional throttle settings
  MESSAGE_THROTTLE_MS: 100,
  PRESENCE_UPDATE_MS: 1000,
  SCROLL_THROTTLE_MS: 150,
} as const;

export const MESSAGE_CONFIG = {
  MAX_LENGTH: 4000,
  MAX_ATTACHMENTS: 10,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25, // Fetch 20-30 messages per page for optimal UX
  MAX_PAGE_SIZE: 50,
  INFINITE_SCROLL_THRESHOLD: 100, // px from top to trigger load
} as const;
