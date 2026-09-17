/**
 * supabase-js throws while creating a client on Node without a global WebSocket unless a realtime
 * transport is supplied. Server-side clients pass a stand-in; it must let the client be created and
 * must fail loudly if a realtime socket is ever opened.
 */
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { serverRealtimeOptions } from "@/lib/supabase/server_realtime";

describe("serverRealtimeOptions", () => {
  it("lets a server-side client be created and refuses to open a socket", () => {
    const client = createClient("https://example.supabase.co", "sb_publishable_test", { auth: { persistSession: false }, realtime: serverRealtimeOptions });
    expect(client.storage).toBeDefined();
    const Transport = serverRealtimeOptions.transport as unknown as new () => unknown;
    expect(() => new Transport()).toThrow(/Realtime is not used/);
  });
});
