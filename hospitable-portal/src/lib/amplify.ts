import { Amplify } from 'aws-amplify';

let configured = false;

export function configureAmplify(): void {
  if (configured) return;

  // Amplify expects just the host for oauth.domain (no protocol)
  const domain = (process.env.NEXT_PUBLIC_COGNITO_DOMAIN || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '';
  const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID || '';
  const redirectSignIn = process.env.NEXT_PUBLIC_REDIRECT_SIGNIN_URL || '';
  const redirectSignOut = process.env.NEXT_PUBLIC_REDIRECT_SIGNOUT_URL || '';

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          oauth: {
            domain,
            scopes: ['openid', 'email', 'phone', 'profile'],
            redirectSignIn: redirectSignIn ? [redirectSignIn] : [],
            redirectSignOut: redirectSignOut ? [redirectSignOut] : [],
            responseType: 'code',
          },
        },
      },
    },
  });

  configured = true;
}
