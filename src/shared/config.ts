import 'dotenv/config'

export const GOOGLE_OAUTH = {
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
  redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? 'http://localhost:3456/oauth2callback'
} as const

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(GOOGLE_OAUTH.clientId && GOOGLE_OAUTH.clientSecret && GOOGLE_OAUTH.redirectUri)
}
