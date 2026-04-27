// @ts-check
import { installMessageRouter } from './messages.js';
import { deleteTabState } from './tab-state.js';
import './download-orchestrator.js';

installMessageRouter();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
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
