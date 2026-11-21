/**
 * Google sign-in for cloud sync, per build mode: the OAuth client of Langle's Google
 * Cloud project and the manifest `key` whose id its redirect URI names (architecture
 * "Sync to the user's own cloud storage" → "Parts", "Extension ids"). Client ids are
 * public; no client secret is used. Read by wxt.config.ts for the manifest `key` and by
 * the background for the provider, so plain constants only.
 */

/** The only scope: the app's own hidden folder in the user's Drive. */
export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.appdata";

export interface GoogleClients {
  /**
   * The "Web application" client `identity.launchWebAuthFlow` uses in every browser
   * (google-auth.ts says why not `getAuthToken`). Its redirect URIs name the extension
   * ids (`https://<id>.chromiumapp.org/`; Firefox's is added when Firefox is checked).
   */
  web: string;
}

/** Development and check builds: redirect to `DEVELOPMENT_EXTENSION_KEY`'s id. */
export const DEVELOPMENT_GOOGLE_CLIENTS: GoogleClients = {
  web: "191564468385-i9mvko6iu5qpq1o8pkhtufudvu72nc36.apps.googleusercontent.com",
};

/**
 * Production builds: none until the Chrome Web Store item exists, since its id's
 * redirect URI must be added to the Web client first (or a client of its own in the
 * same Cloud project, which sees the same `appDataFolder`; docs/status.md "Before
 * publishing"). Until then production builds have no cloud provider.
 */
export const PRODUCTION_GOOGLE_CLIENTS: GoogleClients | undefined = undefined;

/**
 * The manifest `key` (a public key, base64 DER) of development and check builds, so
 * their id is always `dgabnakfehpeammboohlkafhhdegbffe`, whose redirect URI the
 * development Web client lists. Production builds carry none: the store gives the id.
 */
export const DEVELOPMENT_EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt0eGcA0hwTJg8pXZxZ0jR97KLbEnUe+jpLSesnnjqNKJoSt9rwzyk1AZ3Mrgwf3ejEZP1+A8aRvVAT8g4tTAH7k46BM7HFdAeOasNWLfE9VZU18PiSoHNUe27hBbtfLSlmtsqAMLrulZFK4vVUmAl5pqs4A9iVbr3S5ubbgjdxdWxN6pJuIXNcjEUT8FiR1fS1PZAK9jBH+1tfFDhXXp+vmfK1AdHwUNC+Yli0kztdMh2Af02dwTw9B3dcK9I1/+dfHLtgXfKERk5W5V1kBt3dlQmboZQWJNjQSP+aDDoJYn/qdPlb3+76Vjfp1vxOpeAqsk9K4sKcFrxMsv+io5VQIDAQAB";
