import User from "../models/User.js";
import { captureAmazonTokens } from "../playwright/captureTokens.js";

const REFRESH_BUFFER_MS = 10 * 60 * 1000; // refresh 10 min before expiry

/**
 * Full Playwright login — captures + stores tokens in DB.
 * Called on first login or when refresh_token is also expired.
 */
export const loginAndStoreTokens = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  if (!user.amazonEmail || !user.amazonPassword)
    throw new Error("Amazon credentials not set. Call /api/user/update-profile first.");

  console.log(`🔐 Starting Amazon login for user ${userId}...`);

  const tokens = await captureAmazonTokens(user);

  if (!tokens.accessToken && !tokens.cookies.length)
    throw new Error("Login failed — no tokens captured. Check Amazon credentials.");

  user.amazonAccessToken  = tokens.accessToken;
  user.amazonRefreshToken = tokens.refreshToken;
  user.amazonIdToken      = tokens.idToken;
  user.amazonCookies      = JSON.stringify(tokens.cookies);
  user.amazonTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // assume 1 hr
  user.lastAmazonLogin    = new Date();
  await user.save();

  console.log(`✅ Tokens stored for user ${userId}`);
  return tokens;
};

/**
 * Silent token refresh using the stored refresh_token.
 * Falls back to full re-login if refresh fails.
 */
export const refreshAmazonToken = async (userId) => {
  const user = await User.findById(userId);

  if (!user.amazonRefreshToken) {
    console.log("⚠️  No refresh token — doing full re-login...");
    const t = await loginAndStoreTokens(userId);
    return t.accessToken;
  }

  try {
    // Amazon Cognito refresh flow (adjust endpoint/clientId when discovered)
    const { default: axios } = await import("axios");
    const resp = await axios.post(
      "https://cognito-idp.us-east-1.amazonaws.com/",
      {
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: process.env.AMAZON_COGNITO_CLIENT_ID || "",
        AuthParameters: { REFRESH_TOKEN: user.amazonRefreshToken },
      },
      {
        headers: {
          "Content-Type": "application/x-amz-json-1.1",
          "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
        },
      }
    );

    const result = resp.data.AuthenticationResult;
    user.amazonAccessToken    = result.AccessToken;
    user.amazonIdToken        = result.IdToken;
    user.amazonTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    console.log(`🔄 Token silently refreshed for user ${userId}`);
    return user.amazonAccessToken;
  } catch (err) {
    console.log(`⚠️  Refresh failed (${err.message}) — full re-login...`);
    const t = await loginAndStoreTokens(userId);
    return t.accessToken;
  }
};

/**
 * Returns a valid access token, refreshing silently if needed.
 * This is what all other services should call — OTP never fires again
 * once the refresh_token is stored.
 */
export const ensureValidToken = async (userId) => {
  const user = await User.findById(userId);

  const expiresSoon =
    !user.amazonTokenExpiresAt ||
    user.amazonTokenExpiresAt < new Date(Date.now() + REFRESH_BUFFER_MS);

  if (!user.amazonAccessToken || expiresSoon) {
    return await refreshAmazonToken(userId);
  }

  return user.amazonAccessToken;
};
