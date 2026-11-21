import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { CloudError } from "../../core/cloud/provider";
import {
  createGoogleAuth,
  GOOGLE_TOKEN_KEY,
  type Identity,
} from "./google-auth";
import { GOOGLE_DRIVE_SCOPE } from "./google-clients";

const WEB_CLIENT = "web-client.apps.googleusercontent.com";
const REDIRECT = "https://dgabnakfehpeammboohlkafhhdegbffe.chromiumapp.org/";
const NOW = Date.parse("2026-11-21T10:00:00Z");

beforeEach(() => fakeBrowser.reset());

async function failure(promise: Promise<unknown>): Promise<CloudError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CloudError);
    return error as CloudError;
  }
  throw new Error("did not fail");
}

/** Chromium's identity: the browser keeps one token per scope set. */
function chromiumIdentity() {
  let cached: string | undefined;
  let signedIn = false;
  let tokens = 0;
  const identity = {
    getAuthToken: vi.fn(
      async ({ interactive }: { interactive: boolean; scopes: string[] }) => {
        if (!signedIn && !interactive)
          throw new Error("OAuth2 not granted or revoked.");
        signedIn = true;
        cached ??= `ya29.token-${++tokens}`;
        return { token: cached, grantedScopes: [GOOGLE_DRIVE_SCOPE] };
      },
    ),
    removeCachedAuthToken: vi.fn(async ({ token }: { token: string }) => {
      if (token === cached) cached = undefined;
    }),
    clearAllCachedAuthTokens: vi.fn(async () => {
      cached = undefined;
    }),
    launchWebAuthFlow: vi.fn(async () => {
      throw new Error("not used where getAuthToken exists");
    }),
    getRedirectURL: () => REDIRECT,
  } satisfies Identity;
  return identity;
}

describe("where getAuthToken exists", () => {
  it("asks the browser for a drive.appdata token, with a window only when interactive", async () => {
    const identity = chromiumIdentity();
    const auth = createGoogleAuth({ webClientId: WEB_CLIENT, identity });
    expect((await failure(auth.token({ interactive: false }))).kind).toBe(
      "unauthorized",
    );
    expect(await auth.token({ interactive: true })).toBe("ya29.token-1");
    expect(await auth.token({ interactive: false })).toBe("ya29.token-1");
    expect(identity.getAuthToken).toHaveBeenLastCalledWith({
      interactive: false,
      scopes: [GOOGLE_DRIVE_SCOPE],
    });
    expect(identity.launchWebAuthFlow).not.toHaveBeenCalled();
  });

  it("removes a refused token from the browser's cache before asking again", async () => {
    const identity = chromiumIdentity();
    const auth = createGoogleAuth({ webClientId: WEB_CLIENT, identity });
    const first = await auth.token({ interactive: true });
    const second = await auth.token({ interactive: false, refused: first });
    expect(identity.removeCachedAuthToken).toHaveBeenCalledWith({
      token: first,
    });
    expect(second).toBe("ya29.token-2");
  });

  it("takes the token as older Chromium gave it, and refuses one without the scope", async () => {
    const identity = chromiumIdentity();
    identity.getAuthToken.mockResolvedValueOnce(
      "ya29.plain" as unknown as Awaited<
        ReturnType<typeof identity.getAuthToken>
      >,
    );
    const auth = createGoogleAuth({ webClientId: WEB_CLIENT, identity });
    expect(await auth.token({ interactive: true })).toBe("ya29.plain");
    identity.getAuthToken.mockResolvedValueOnce({
      token: "ya29.other",
      grantedScopes: ["openid"],
    });
    expect((await failure(auth.token({ interactive: true }))).kind).toBe(
      "unauthorized",
    );
  });

  it("fails as unauthorized when the user closes the sign-in window", async () => {
    const identity = chromiumIdentity();
    identity.getAuthToken.mockRejectedValueOnce(
      new Error("The user did not approve access."),
    );
    const auth = createGoogleAuth({ webClientId: WEB_CLIENT, identity });
    const error = await failure(auth.token({ interactive: true }));
    expect(error.kind).toBe("unauthorized");
    expect(error.message).toContain("did not approve");
  });

  it("forgets the browser's cached tokens", async () => {
    const identity = chromiumIdentity();
    const auth = createGoogleAuth({ webClientId: WEB_CLIENT, identity });
    await auth.token({ interactive: true });
    await auth.forget();
    expect(identity.clearAllCachedAuthTokens).toHaveBeenCalled();
    expect(await auth.token({ interactive: false })).toBe("ya29.token-2");
  });
});

describe("where getAuthToken does not exist (launchWebAuthFlow)", () => {
  /** Google's implicit flow: answers the redirect with the token in the fragment. */
  function flowIdentity(
    answer: (request: URL, interactive: boolean) => string | Error,
  ) {
    const requests: { url: URL; interactive: boolean }[] = [];
    const identity: Identity = {
      launchWebAuthFlow: vi.fn(async ({ url, interactive }) => {
        const request = new URL(url);
        requests.push({ url: request, interactive });
        const back = answer(request, interactive);
        if (back instanceof Error) throw back;
        return back;
      }),
      getRedirectURL: () => REDIRECT,
    };
    return { identity, requests };
  }

  const granted =
    (token: string, expiresIn = 3599) =>
    (request: URL) =>
      `${REDIRECT}#${new URLSearchParams({
        state: request.searchParams.get("state")!,
        access_token: token,
        token_type: "Bearer",
        expires_in: String(expiresIn),
        scope: GOOGLE_DRIVE_SCOPE,
      })}`;

  it("signs in with the Web client and keeps the token in storage.local until it ends", async () => {
    let now = NOW;
    const { identity, requests } = flowIdentity(granted("ya29.flow"));
    const auth = createGoogleAuth({
      webClientId: WEB_CLIENT,
      identity,
      local: fakeBrowser.storage.local,
      now: () => now,
    });
    expect(await auth.token({ interactive: true })).toBe("ya29.flow");
    const [request] = requests;
    expect(request!.url.origin + request!.url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(Object.fromEntries(request!.url.searchParams)).toEqual({
      client_id: WEB_CLIENT,
      response_type: "token",
      redirect_uri: REDIRECT,
      scope: GOOGLE_DRIVE_SCOPE,
      state: expect.any(String),
    });
    expect(request!.interactive).toBe(true);
    expect(await fakeBrowser.storage.local.get(GOOGLE_TOKEN_KEY)).toEqual({
      [GOOGLE_TOKEN_KEY]: { token: "ya29.flow", expiresAt: NOW + 3_599_000 },
    });

    // Kept: no window, no request, even after the worker starts again.
    now = NOW + 3_000_000;
    const again = createGoogleAuth({
      webClientId: WEB_CLIENT,
      identity,
      local: fakeBrowser.storage.local,
      now: () => now,
    });
    expect(await again.token({ interactive: false })).toBe("ya29.flow");
    expect(requests).toHaveLength(1);

    // Near its end: renewed without a window (`prompt=none`).
    now = NOW + 3_550_000;
    expect(await again.token({ interactive: false })).toBe("ya29.flow");
    expect(requests).toHaveLength(2);
    expect(requests[1]!.interactive).toBe(false);
    expect(requests[1]!.url.searchParams.get("prompt")).toBe("none");
  });

  it("asks again for a refused token instead of handing it out", async () => {
    let n = 0;
    const { identity, requests } = flowIdentity((request) =>
      granted(`ya29.flow-${++n}`)(request),
    );
    const auth = createGoogleAuth({
      webClientId: WEB_CLIENT,
      identity,
      local: fakeBrowser.storage.local,
      now: () => NOW,
    });
    const first = await auth.token({ interactive: true });
    expect(await auth.token({ interactive: false, refused: first })).toBe(
      "ya29.flow-2",
    );
    expect(requests).toHaveLength(2);
  });

  it("fails as unauthorized when Google needs a window (prompt=none → interaction_required)", async () => {
    const { identity } = flowIdentity(
      (request) =>
        `${REDIRECT}#error=interaction_required&state=${request.searchParams.get("state")}`,
    );
    const auth = createGoogleAuth({
      webClientId: WEB_CLIENT,
      identity,
      local: fakeBrowser.storage.local,
      now: () => NOW,
    });
    const error = await failure(auth.token({ interactive: false }));
    expect(error.kind).toBe("unauthorized");
    expect(error.message).toContain("interaction_required");
  });

  it.each([
    [
      "the window is closed",
      () => new Error("The user did not approve access."),
    ],
    ["an error in the query", () => `${REDIRECT}?error=access_denied`],
    ["another request's state", () => `${REDIRECT}#access_token=x&state=other`],
    [
      "no token",
      (request: URL) =>
        `${REDIRECT}#state=${request.searchParams.get("state")}`,
    ],
    [
      "another scope",
      (request: URL) =>
        `${REDIRECT}#access_token=x&scope=openid&state=${request.searchParams.get("state")}`,
    ],
  ] as const)("fails as unauthorized when %s", async (_, answer) => {
    const { identity } = flowIdentity(answer);
    const auth = createGoogleAuth({
      webClientId: WEB_CLIENT,
      identity,
      local: fakeBrowser.storage.local,
      now: () => NOW,
    });
    expect((await failure(auth.token({ interactive: true }))).kind).toBe(
      "unauthorized",
    );
    expect(await fakeBrowser.storage.local.get(GOOGLE_TOKEN_KEY)).toEqual({});
  });

  it("forgets the kept token", async () => {
    const { identity, requests } = flowIdentity(granted("ya29.flow"));
    const auth = createGoogleAuth({
      webClientId: WEB_CLIENT,
      identity,
      local: fakeBrowser.storage.local,
      now: () => NOW,
    });
    await auth.token({ interactive: true });
    await auth.forget();
    expect(await fakeBrowser.storage.local.get(GOOGLE_TOKEN_KEY)).toEqual({});
    await auth.token({ interactive: true });
    expect(requests).toHaveLength(2);
  });
});
