// MV3 content scripts are classic scripts; load the extension-owned ES module.
void import(chrome.runtime.getURL("content-entry.js"));
