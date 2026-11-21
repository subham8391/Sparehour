import type { BrowserReturn } from "./browser-session";
import { signInProviders, signInWithGoogle, type GoogleSignInDeps } from "./google-sign-in";

jest.mock("~/config", () => ({ config: { supabaseUrl: "https://auth.example", supabaseAnonKey: "anon-key" } }));
jest.mock("./supabase", () => ({ supabase: () => ({ auth: {} }) }));
jest.mock("./browser-session", () => ({ browserSession: jest.fn() }));

const AUTHORIZE = "https://auth.example/auth/v1/authorize?provider=google&redirect_to=sparehour%3A%2F%2Fauth%2Fcallback&code_challenge=abc&code_challenge_method=s256";

function world(back: BrowserReturn = { type: "returned", params: { code: "CODE" } }) {
  const auth = {
    signInWithOAuth: jest.fn<ReturnType<GoogleSignInDeps["auth"]["signInWithOAuth"]>, Parameters<GoogleSignInDeps["auth"]["signInWithOAuth"]>>(async () => ({ data: { url: AUTHORIZE }, error: null })),
    exchangeCodeForSession: jest.fn<ReturnType<GoogleSignInDeps["auth"]["exchangeCodeForSession"]>, [string]>(async () => ({ error: null })),
  };
  const session = jest.fn(async () => back);
  return { auth, session, deps: { auth, session } };
}

describe("signInWithGoogle", () => {
  it("asks the auth server for Google's address with the app's own link, opens it in the browser, and exchanges the code that comes back", async () => {
    const w = world();
    expect(await signInWithGoogle(w.deps)).toEqual({ outcome: "signed-in" });
    expect(w.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "sparehour://auth/callback", skipBrowserRedirect: true } });
    expect(w.session).toHaveBeenCalledWith(AUTHORIZE, "sparehour://auth/callback");
    expect(w.auth.exchangeCodeForSession).toHaveBeenCalledWith("CODE");
  });

  it("is cancelled when the person closes the browser or says no to Google, and exchanges nothing", async () => {
    for (const back of [{ type: "closed" }, { type: "returned", params: { error: "access_denied", error_description: "The user denied access" } }] as BrowserReturn[]) {
      const w = world(back);
      expect(await signInWithGoogle(w.deps)).toEqual({ outcome: "cancelled" });
      expect(w.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    }
  });

  it("fails with the auth server's reason when it sends one, and exchanges nothing", async () => {
    const refused = world({ type: "returned", params: { error: "server_error", error_code: "unexpected_failure", error_description: "Unable to exchange external code" } });
    expect(await signInWithGoogle(refused.deps)).toEqual({ outcome: "failed", message: "Unable to exchange external code" });
    const bare = world({ type: "returned", params: { error: "server_error", code: "CODE" } });
    expect(await signInWithGoogle(bare.deps)).toEqual({ outcome: "failed", message: undefined });
    const empty = world({ type: "returned", params: {} });
    expect(await signInWithGoogle(empty.deps)).toEqual({ outcome: "failed" });
    for (const w of [refused, bare, empty]) expect(w.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("fails without opening the browser when the auth server gives no address", async () => {
    const w = world();
    w.auth.signInWithOAuth.mockResolvedValueOnce({ data: { url: null }, error: { message: "Unsupported provider: provider is not enabled" } });
    expect(await signInWithGoogle(w.deps)).toEqual({ outcome: "failed", message: "Unsupported provider: provider is not enabled" });
    expect(w.session).not.toHaveBeenCalled();
  });

  it("fails when the code is not the one this device asked for (another app's, or a replay): the auth server refuses it", async () => {
    const w = world({ type: "returned", params: { code: "SOMEONE-ELSES" } });
    w.auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "code challenge does not match previously saved code verifier" } });
    expect(await signInWithGoogle(w.deps)).toEqual({ outcome: "failed", message: "code challenge does not match previously saved code verifier" });
  });

  it("fails, and does not throw, when the network or the browser does", async () => {
    const offline = world();
    offline.auth.signInWithOAuth.mockRejectedValueOnce(new Error("Network request failed"));
    expect(await signInWithGoogle(offline.deps)).toEqual({ outcome: "failed", message: "Network request failed" });
    const stuck = world();
    stuck.session.mockRejectedValueOnce(new Error("WebBrowser is already open, only one can be open at a time"));
    expect(await signInWithGoogle(stuck.deps)).toMatchObject({ outcome: "failed" });
    expect(stuck.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe("signInProviders", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("asks the app's own auth server, with the app's key, the question the web's sign-in page asks", async () => {
    const asked = jest.fn(async () => ({ ok: true, json: async () => ({ external: { google: true, email: true } }) }));
    globalThis.fetch = asked as unknown as typeof fetch;
    expect(await signInProviders()).toEqual({ google: true });
    expect(asked).toHaveBeenCalledWith("https://auth.example/auth/v1/settings", { headers: { apikey: "anon-key" } });
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ external: { google: false } }) })) as unknown as typeof fetch;
    expect(await signInProviders()).toEqual({ google: false });
    globalThis.fetch = jest.fn(async () => Promise.reject(new Error("Network request failed"))) as unknown as typeof fetch;
    expect(await signInProviders()).toEqual({ google: false });
  });
});
