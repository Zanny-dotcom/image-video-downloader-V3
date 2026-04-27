// @ts-check
import { installMessageRouter } from './messages.js';
import { deleteTabState } from './tab-state.js';
import './download-orchestrator.js';

installMessageRouter();

// Disable Chrome's auto-open behavior so chrome.action.onClicked fires on
// icon click. Firing onClicked is what reliably grants activeTab (which
// chrome.scripting.executeScript needs); setPanelBehavior alone does not.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id == null) return;
  // Call sidePanel.open synchronously inside the listener so the user gesture
  // is preserved.
  chrome.sidePanel.open({ tabId: tab.id }).catch((e) => {
    console.warn('[mediadl/bg] sidePanel.open failed:', e);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  deleteTabState(tabId);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'scan-current-tab') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {
    /* sidePanel.open requires a recent Chrome and a user-gesture context */
  }
});
