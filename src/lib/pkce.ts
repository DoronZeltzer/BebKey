/**
 * PKCE (Proof Key for Code Exchange) helpers for Google OAuth.
 * Used by AuthContext to initiate the OAuth flow directly to Google
 * with redirect_uri pointing at bebkey.com (instead of Supabase's URL).
 */

function base64urlEncode(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/** Generate a cryptographically-random PKCE code verifier. */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64urlEncode(array)
}

/** SHA-256 hash of the verifier, base64url-encoded (the code challenge). */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64urlEncode(new Uint8Array(digest))
}
