// Get the browser api to use based on the browser type.
const browserApi = typeof browser !== "undefined" ? browser : chrome;

// Send a message to the content script to initialize the app upon clicking on the popup button.
document.getElementById('launchGCleaner').addEventListener('click', function() {
  browserApi.tabs.query({active: true}, function(tabs) {
    browserApi.tabs.sendMessage(tabs[0].id, {
      initiateGCleaner: true
    });
  });
});