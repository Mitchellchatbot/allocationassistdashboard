import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// A fake Supabase client: records auth subscriptions and profile queries.
type Cb = (event: string, session: unknown) => unknown;
const subs: Cb[] = [];
let profileQueries = 0;
let profileRow: unknown = null;
// Per-call overrides for the profile query, used in order; then profileRow.
let responses: Array<() => Promise<{ data: unknown; error?: unknown }>> = [];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Cb) => { subs.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => {
        profileQueries++;
        const next = responses.shift();
        return next ? next() : { data: profileRow, error: null };
      } }) }),
    }),
  },
}));
vi.mock("@/lib/query-persist", () => ({ clearQueryCachePersist: () => {} }));

const session = (id: string, email: string) => ({ user: { id, email } });
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); });

describe("useAuth shared store", () => {
  beforeEach(() => {
    vi.resetModules();
    subs.length = 0;
    profileQueries = 0;
    responses = [];
    profileRow = { role: "admin", allowed_pages: ["/"], full_name: "Ada" };
  });

  it("runs one profile query when Supabase reports the same sign-in twice", async () => {
    const { useAuth } = await import("@/hooks/use-auth");
    // The first query is still in flight when the second event arrives, as in
    // the real sign-in where both started within the same millisecond.
    responses = [() => new Promise(r => setTimeout(() => r({ data: profileRow, error: null }), 30))];
    const h = renderHook(() => useAuth());
    subs[0]("SIGNED_IN", session("u1", "admin@allocationassist.com"));
    subs[0]("SIGNED_IN", session("u1", "admin@allocationassist.com"));
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });
    expect(profileQueries).toBe(1);
    expect(h.result.current.role).toBe("admin");
  });

  it("retries a timed-out profile query instead of treating it as no access", async () => {
    vi.useFakeTimers();
    try {
      responses = [() => new Promise(() => {})];   // first attempt hangs
      const { useAuth } = await import("@/hooks/use-auth");
      const h = renderHook(() => useAuth());
      subs[0]("SIGNED_IN", session("u1", "admin@allocationassist.com"));
      await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
      expect(profileQueries).toBe(2);
      expect(h.result.current.role).toBe("admin");
      expect(h.result.current.allowedPages).toEqual(["/"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a query error instead of treating it as no access", async () => {
    responses = [async () => ({ data: null, error: { message: "boom" } })];
    const { useAuth } = await import("@/hooks/use-auth");
    const h = renderHook(() => useAuth());
    subs[0]("SIGNED_IN", session("u1", "admin@allocationassist.com"));
    await flush();
    await flush();
    expect(profileQueries).toBe(2);
    expect(h.result.current.role).toBe("admin");
  });

  it("fails closed when the database confirms there is no row", async () => {
    profileRow = null;
    const { useAuth } = await import("@/hooks/use-auth");
    const h = renderHook(() => useAuth());
    subs[0]("SIGNED_IN", session("u1", "stranger@example.com"));
    await flush();
    expect(profileQueries).toBe(1);
    expect(h.result.current.role).toBe("none");
    expect(h.result.current.allowedPages).toEqual([]);
  });

  it("subscribes once and fetches the profile once, however many components use it", async () => {
    const { useAuth } = await import("@/hooks/use-auth");
    const hooks = Array.from({ length: 12 }, () => renderHook(() => useAuth()));
    expect(subs).toHaveLength(1);

    subs[0]("INITIAL_SESSION", session("u1", "ada@example.com"));
    await flush();

    expect(profileQueries).toBe(1);
    for (const h of hooks) {
      expect(h.result.current.loading).toBe(false);
      expect(h.result.current.role).toBe("admin");
      expect(h.result.current.fullName).toBe("Ada");
    }
  });

  it("never awaits Supabase inside the auth event handler (that deadlocks the auth lock)", async () => {
    const { useAuth } = await import("@/hooks/use-auth");
    renderHook(() => useAuth());
    const ret = subs[0]("SIGNED_IN", session("u1", "ada@example.com"));
    expect(ret).toBeUndefined();          // not a promise Supabase would wait on
    expect(profileQueries).toBe(0);       // the query runs after the handler returns
    await flush();
    expect(profileQueries).toBe(1);
  });

  it("does not re-fetch the profile on a token refresh", async () => {
    const { useAuth } = await import("@/hooks/use-auth");
    renderHook(() => useAuth());
    subs[0]("INITIAL_SESSION", session("u1", "ada@example.com"));
    await flush();
    subs[0]("TOKEN_REFRESHED", session("u1", "ada@example.com"));
    await flush();
    expect(profileQueries).toBe(1);
  });

  it("clears the profile and stops loading on sign-out", async () => {
    const { useAuth } = await import("@/hooks/use-auth");
    const h = renderHook(() => useAuth());
    subs[0]("INITIAL_SESSION", session("u1", "ada@example.com"));
    await flush();
    subs[0]("SIGNED_OUT", null);
    await flush();
    expect(h.result.current.session).toBeNull();
    expect(h.result.current.profile).toBeNull();
    expect(h.result.current.loading).toBe(false);
  });

  it("stops loading with no session when Supabase never reports one", async () => {
    vi.useFakeTimers();
    try {
      const { useAuth } = await import("@/hooks/use-auth");
      const h = renderHook(() => useAuth());
      expect(h.result.current.loading).toBe(true);
      await act(async () => { vi.advanceTimersByTime(8000); });
      expect(h.result.current.loading).toBe(false);
      expect(h.result.current.session).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
