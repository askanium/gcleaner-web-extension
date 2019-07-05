// Get the browser api to use based on the browser type.
const browserApi = typeof browser !== "undefined" ? browser : chrome;

// Flag to switch between using an iframe and script injection to run GCleaner.
const usesIframe = false;

// Needed to insert the button that opens the popup within the GMail page.
let counter = 300;

// Define listeners to handle messages from the background script.
browserApi.runtime.onMessage.addListener(function(request, sender, sendResponse) {

  // Check if background script sent in an authorization code
  // after the user successfully authorized the app.
  if (request.hasOwnProperty('gcleanerAuthorizationCode')) {
    // If an error has appeared during authorization, retry with
    // showing the authorization prompt.
    if (request.error) {
      const userEmail = getLoggedUserEmail();
      localStorage.removeItem(`gcleaner-authorized-for-${userEmail}`);
      browserApi.runtime.sendMessage({
        type: 'gcleaner-authorize',
        email:  userEmail,
        authorized: false
      });
    } else {
      // If authorization successful, send the authorized custom event.
      let payload = {
        authorizationCode: request.isSafe ? request.gcleanerAuthorizationCode : '',
        redirectURL: request.isSafe ? request.redirectURL : ''
      };

      if (request.isSafe) {
        // Set a flag to not show authorization prompt if user has authorized the app once.
        localStorage.setItem(`gcleaner-authorized-for-${getLoggedUserEmail()}`, 'true');
      }

      // Firefox should use `cloneInto`, otherwise web page cannot read the
      // custom event details due to security restrictions. Chrome, however,
      // does not have this function, so pass in the payload as it is.
      const detail = typeof cloneInto !== "undefined" ? cloneInto(payload, document.defaultView) : payload;

      // Initiate a custom event with the authorization code to let the GCleaner
      // app on the page to proceed with user authentication on the backend.
      const event = new CustomEvent('gcleaner-authorized', { detail: detail });

      document.dispatchEvent(event);
    }
  }
});

// Define listeners to handle messages from the web page.
document.addEventListener('gcleaner-authorize', function() {
  const userEmail = getLoggedUserEmail();
  browserApi.runtime.sendMessage({
    type: 'gcleaner-authorize',
    email:  userEmail,
    authorized: localStorage.getItem(`gcleaner-authorized-for-${userEmail}`)
  });
});

// Populate localStorage with a specific key to let GCleaner know it runs
// within a GMail web page.
localStorage.setItem('gcleaner-runs-within-gmail', 'true');

/**
 * Parse DOM to find current logged in user.
 * @return {String | undefined} The user email address that is currently
 *                              logged in GMail web app.
 */
function getLoggedUserEmail() {
  let email;
  let gSuiteDiv;

  // GSuite accounts have the user email placed within a <div> that has a
  // signout options "href" attribute.
  for (let i = 0; i < document.getElementsByTagName('div').length; i++) {
    const href = document.getElementsByTagName('div')[i].getAttribute('href');
    if (href && href.substring(0, 42) === 'https://accounts.google.com/SignOutOptions') {
      gSuiteDiv = document.getElementsByTagName('div')[i];
    }
  }

  // GMail accounts have the user email placed within an <a> tag under the
  // "aria-label" attribute. The <a> tag has to have the signout options href.
  if (!gSuiteDiv) {
    for (let i = 0; i < document.links.length; i++) {
      const href = document.links[i].getAttribute('href');
      if (href && href.substring(0, 42) === 'https://accounts.google.com/SignOutOptions') {
        const tokens = document.links[i].getAttribute('aria-label').split(' ');
        email = tokens[tokens.length - 1].trim().substr(1, tokens[tokens.length - 1].trim().length - 2);
      }
    }
  } else {
    // In case the GSuite div was found, search for an <a> tag with "aria-label" attribute.
    for (let i = 0; i < gSuiteDiv.getElementsByTagName('a').length; i++) {
      const ariaLabel = gSuiteDiv.getElementsByTagName('a')[i].getAttribute('aria-label');
      if (ariaLabel && ariaLabel.substr(0, 14) === 'Google Account') {
        const tokens = ariaLabel.split(' ');
        email = tokens[tokens.length - 1].trim().substr(1, tokens[tokens.length - 1].trim().length - 2);
      }
    }
  }

  return email;
}

/**
 * Create and append the popup that will host the GCleaner app within it.
 */
function showPopup() {
  // Create and style the greyish full screen background.
  let popupBackground = document.createElement('div');
  popupBackground.style.width = '100%';
  popupBackground.style.height = '100vh';
  popupBackground.style.backgroundColor = 'rgba(0,0,0,.2)';
  popupBackground.style.position = 'fixed';
  popupBackground.style.zIndex = '9';
  popupBackground.style.top = '0';
  popupBackground.style.left = '0';
  popupBackground.id = 'gcleaner-wrapper';

  if (usesIframe) {
    const iframeDom = document.createElement('iframe');
    iframeDom.src = 'https://test.gcleaner.co/';
    iframeDom.style.width = '1270px';
    iframeDom.style.height = '90vh';
    iframeDom.style.backgroundColor = '#fff';
    iframeDom.style.border = '0';
    iframeDom.style.boxShadow = '0 0 15px #5f5f5f';
    iframeDom.style.position = 'absolute';
    iframeDom.style.top = '5vh';
    iframeDom.style.left = '50%';
    iframeDom.style.marginLeft = '-640px';
    iframeDom.style.overflowY = 'auto';
    iframeDom.style.overflowX = 'hidden';

    popupBackground.appendChild(iframeDom);
  } else {
    //
    const popupDom = document.createElement('div');
    popupDom.style.width = '1270px';
    popupDom.style.height = '90vh';
    popupDom.style.backgroundColor = '#fff';
    popupDom.style.boxShadow = '0 0 15px #5f5f5f';
    popupDom.style.position = 'absolute';
    popupDom.style.top = '5vh';
    popupDom.style.left = '50%';
    popupDom.style.marginLeft = '-640px';
    popupDom.style.overflowY = 'auto';
    popupDom.style.overflowX = 'hidden';

    const appDom = document.createElement('div');
    appDom.id = 'app';

    popupBackground.appendChild(popupDom);
    popupDom.appendChild(appDom);

    popupDom.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }

  document.body.append(popupBackground);

  popupBackground.addEventListener('click', function() {
    const selfDestroyEvent = new Event('gcleaner-self-destroy');
    document.dispatchEvent(selfDestroyEvent);

    document.getElementById('gcleaner-vendor').remove();
    document.getElementById('gcleaner-app').remove();
  })
}

/**
 * Wait for the GMail page to load and insert the GCleaner
 * button that opens the popup and launches the app.
 */
const unsubscribeId = setInterval(function() {
  const supportDiv = document.querySelector('div[data-tooltip="Support"]');
  let parent;
  if (supportDiv) {
    parent = supportDiv.parentNode;
  }
  if (parent) {

    const btnClass = parent.firstChild.className.split(' ')[1];
    const logo = document.createElement('img');
    logo.src = browserApi.runtime.getURL('img/logo.png');
    logo.alt = 'GCleaner';
    logo.style.height = '48px';

    const button = document.createElement('button');
    button.className = btnClass + ' gcleaner-app-launcher';
    button.style.backgroundColor = 'inherit';
    button.style.border = 'none';
    button.style.padding = '0 5px';
    button.style.height = '48px';
    button.style.fontSize = '1rem';
    button.style.color = '#5f5f5f';
    button.style.cursor = 'pointer';
    button.style.fontWeight = '500';
    button.onmouseenter = function () {
      this.style.opacity = '0.8';
    };
    button.onmouseleave = function () {
      this.style.opacity = '1';
    };
    button.onclick = function () {
      const loggedUserEmail = getLoggedUserEmail();
      localStorage.setItem('gcleaner-username', loggedUserEmail);
      showPopup();

      if (!usesIframe) {

        fetch('https://app.gcleaner.co/sources.json')
          .then(response => response.json())
          .then(response => {
            // Load css only once.
            if (!document.gcleanerLoaded) {
              const materialIcons = document.createElement('link');
              materialIcons.rel = 'stylesheet';
              materialIcons.href = '//fonts.googleapis.com/css?family=Material+Icons';
              (document.head || document.documentElement).appendChild(materialIcons);

              const vendorCss = document.createElement('link');
              vendorCss.rel = 'stylesheet';
              vendorCss.href = `https://app.gcleaner.co/css/${response[1]}`;
              (document.head || document.documentElement).appendChild(vendorCss);

              const appCss = document.createElement('link');
              appCss.rel = 'stylesheet';
              appCss.href = `https://app.gcleaner.co/css/${response[0]}`;
              (document.head || document.documentElement).appendChild(appCss);

              document.gcleanerLoaded = true;
            }

            // Load app js each time user clicks on GCleaner button to initialize the app.
            const vendor = document.createElement('script');
            vendor.src = `https://app.gcleaner.co/js/${response[3]}`;
            vendor.id = 'gcleaner-vendor';
            (document.head || document.documentElement).appendChild(vendor);

            const app = document.createElement('script');
            app.src = `https://app.gcleaner.co/js/${response[2]}`;
            app.id = 'gcleaner-app';
            (document.head || document.documentElement).appendChild(app);
          });
      }
    };
    button.appendChild(logo);
    parent.prepend(button);
    clearInterval(unsubscribeId);
  }
  if (counter) {
    counter--;
  } else {
    clearInterval(unsubscribeId);
  }
}, 100);
