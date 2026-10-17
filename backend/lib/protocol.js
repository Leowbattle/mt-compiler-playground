export const OPEN = 1;

/** Send a JSON frame to a WebSocket if it is still open. */
export function send(ws, frame) {
  if (ws.readyState === OPEN) {
    ws.send(JSON.stringify(frame));
  }
}
