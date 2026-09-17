/**
 * The app never uses Supabase Realtime. supabase-js 2.116 throws while creating a client on
 * Node.js versions without a global WebSocket (Node 20 and below) unless a transport is supplied,
 * so every server-side client passes this option. The stand-in fails loudly if anything ever tries
 * to open a realtime socket from the server. Browser clients keep the browser's own WebSocket.
 */
class RealtimeNotUsedOnServer {
  constructor() {
    throw new Error("Supabase Realtime is not used by this app on the server; no WebSocket transport is configured.");
  }
}

// `never` keeps the stand-in assignable to realtime-js's constructor type without importing it.
export const serverRealtimeOptions = { transport: RealtimeNotUsedOnServer as never };
