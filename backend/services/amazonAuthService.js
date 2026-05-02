import User from "../models/User.js";

const REFRESH_BUFFER_MS = 10 * 60 * 1000; // refresh 10 min before expiry

/**
 * Silent token refresh using the stored refresh_token.
 * Does NOT trigger Playwright login fallback.
 */
export const refreshAmazonToken = async (userId) => {
  const user = await User.findById(userId);

  if (!user.amazonRefreshToken) {
    throw new Error(
      "Amazon session expired (no refresh token). Update Session JSON in Profile."
    );
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
    throw new Error(
      `Amazon token refresh failed: ${err.message}. Update Session JSON in Profile.`
    );
  }
};

/**
 * Returns a valid access token, refreshing silently if needed.
 * This is what all other services should call — OTP never fires again
 * once the refresh_token is stored.
 */
export const ensureValidToken = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // If we only have an access token from Session JSON, use it until expiry.
  // This prevents refresh loops when no valid Cognito refresh token/client id exists.
  if (!user.amazonRefreshToken && user.amazonAccessToken) {
    if (!user.amazonTokenExpiresAt) {
      user.amazonTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
    }
    if (user.amazonTokenExpiresAt > new Date()) {
      return user.amazonAccessToken;
    }
    throw new Error(
      "Amazon session expired (access token only). Update Session JSON in Profile."
    );
  }

  const expiresSoon =
    !user.amazonTokenExpiresAt ||
    user.amazonTokenExpiresAt < new Date(Date.now() + REFRESH_BUFFER_MS);

  if (!user.amazonAccessToken || expiresSoon) {
    return await refreshAmazonToken(userId);
  }

  return user.amazonAccessToken;
};
