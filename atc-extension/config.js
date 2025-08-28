export const COGNITO = {
  domain: "https://hospitable.auth.us-east-1.amazoncognito.com",
  clientId: "3fir1iq8um652rf9gv9t6bca7u",
  redirectUri: `chrome-extension://${chrome.runtime.id}/callback`,
  scopes: ["openid", "email", "phone", "profile"]
};

export const API = {
  base: "https://n4kyd50ku7.execute-api.us-east-1.amazonaws.com",
  guestsByConversationPath: (conversationId) =>
    `/guests/by-conversation/${encodeURIComponent(conversationId)}`
};
