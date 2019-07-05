// Get the browser api to use based on the browser type.
const browserApi = typeof browser !== "undefined" ? browser : chrome;

// Compute current timestamp to be able to verify returned authorization code.
const timestamp = Date.now();

// Define listeners to handle messages from content script.
browserApi.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.type === 'gcleaner-authorize') {
      authorize(request.email, request.authorized === 'true');
    }
  }
);

/**
 * Validate the redirect URL received as a result of successfully authorizing
 * with google and send the authorization code to the content script.
 * @param redirectURL - The URL that google sends back with the authorization
 *                      code and other parameters related to granted scopes and
 *                      expiry time.
 */
function validate(redirectURL) {
  // validate the access token
  const queryParams = redirectURL.split('?')[1].split('&');
  let authorizationCode = null;
  let error = false;
  let isSafe = false;
  queryParams.forEach(p => {
    const pair = p.split('=');
    if (pair[0] === 'code') {
      authorizationCode = decodeURIComponent(pair[1]);
    } else if (pair[0] === 'state') {
      isSafe = isSafe || +pair[1] === timestamp
    } else if (pair[0] === 'error') {
      error = true;
    }
  });

  // Send the authorization code to the content script for further use within the app.
  browserApi.tabs.query({active: true}, function(tabs) {
    browserApi.tabs.sendMessage(tabs[0].id, {
      gcleanerAuthorizationCode: authorizationCode,
      redirectURL: browserApi.identity.getRedirectURL(),
      isSafe: isSafe,
      error: error,
    });
  });
}

/**
 * Launch the web auth flow so that user can authorize the use of
 * GCleaner within their GMail web page.
 * @param {String} email - The email of the user to use in "login_hint."
 * @param {Boolean} isAuthorized - Whether user has previously authorize GCleaner.
 */
function authorize(email, isAuthorized) {
  const redirectURL = browserApi.identity.getRedirectURL();
  const scopes = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.modify"];
  let authURL = "https://accounts.google.com/o/oauth2/auth";
  authURL += `?client_id=198818133931-cajjsp0ujalrjjmcstov9tko69051f35.apps.googleusercontent.com`;
  // authURL += `?client_id=332940084219-ebi76gumiimip385lo5ue70g7h471utn.apps.googleusercontent.com`;
  authURL += `&response_type=code`;
  authURL += `&redirect_uri=${encodeURIComponent(redirectURL)}`;
  authURL += email ? `&login_hint=${encodeURIComponent(email)}` : '';
  authURL += '&access_type=offline';
  authURL += `&prompt=${isAuthorized ? 'none' : 'select_account'}`;
  authURL += `&scope=${encodeURIComponent(scopes.join(' '))}`;
  authURL += `&state=${timestamp}`;

  // Launch the web auth flow and call `validate` upon finalizing it.
  browserApi.identity.launchWebAuthFlow({
    interactive: true,
    url: authURL
  }, validate);
}
