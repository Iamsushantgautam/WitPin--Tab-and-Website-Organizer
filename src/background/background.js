/**
 * WitPin - Background Service Worker (Manifest V3)
 * 
 * PRIVACY NOTICE:
 * All background operations process tab metadata strictly locally within Chrome APIs.
 * No data is transmitted to external servers.
 */

import {
  getData,
  addPinnedSite,
  saveWorkspace,
  addSiteToGroup,
  linkChromeGroup,
  unlinkChromeGroup,
  normalizeUrl
} from '../utils/storage.js';

// Initialize extension settings & context menus upon installation
chrome.runtime.onInstalled.addListener(async () => {
  createContextMenus();
});

/**
 * Setup Context Menu Items
 */
function createContextMenus() {
  if (!chrome.contextMenus) return;

  chrome.contextMenus.removeAll(() => {
    // Parent Context Menu Item
    chrome.contextMenus.create({
      id: 'witpin-main',
      title: 'WitPin',
      contexts: ['page', 'action', 'tab']
    });

    // Pin current website
    chrome.contextMenus.create({
      parentId: 'witpin-main',
      id: 'witpin-pin-tab',
      title: '📌 Pin this website',
      contexts: ['page', 'action', 'tab']
    });

    // Save current tab for later
    chrome.contextMenus.create({
      parentId: 'witpin-main',
      id: 'witpin-save-tab',
      title: '💾 Save current tab',
      contexts: ['page', 'action', 'tab']
    });

    // Save all tabs as workspace
    chrome.contextMenus.create({
      parentId: 'witpin-main',
      id: 'witpin-save-workspace',
      title: '📁 Save workspace (all tabs)',
      contexts: ['page', 'action', 'tab']
    });
  });
}

/**
 * Helper to check if a tab URL is valid for saving/pinning (filters out internal browser pages)
 */
function isSupportedTabUrl(url) {
  if (!url) return false;
  return !url.startsWith('chrome://') && 
         !url.startsWith('edge://') && 
         !url.startsWith('about:') && 
         !url.startsWith('chrome-extension://');
}

/**
 * Handle Context Menu Clicks
 */
chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.url) return;

  try {
    if (info.menuItemId === 'witpin-pin-tab' || info.menuItemId === 'witpin-save-tab') {
      await addPinnedSite({
        title: tab.title || new URL(tab.url).hostname,
        url: tab.url,
        favicon: tab.favIconUrl
      });
    } else if (info.menuItemId === 'witpin-save-workspace') {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const validTabs = tabs.filter(t => isSupportedTabUrl(t.url));
      if (validTabs.length > 0) {
        await saveWorkspace(
          `Workspace (${new Date().toLocaleDateString()})`,
          validTabs,
          '⚡',
          '#6366F1'
        );
      }
    }
  } catch (err) {
    console.error('WitPin Context Menu Error:', err);
  }
});

/**
 * Handle Configured Keyboard Commands (Shortcuts)
 */
chrome.commands?.onCommand.addListener(async (command) => {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (command === 'save-current-tab' && activeTab?.url) {
      await addPinnedSite({
        title: activeTab.title || new URL(activeTab.url).hostname,
        url: activeTab.url,
        favicon: activeTab.favIconUrl
      });
    } else if (command === 'save-workspace') {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const validTabs = tabs.filter(t => isSupportedTabUrl(t.url));
      if (validTabs.length > 0) {
        await saveWorkspace(
          `Workspace (${new Date().toLocaleDateString()})`,
          validTabs,
          '💼',
          '#10B981'
        );
      }
    }
  } catch (err) {
    console.error('WitPin Command Handler Error:', err);
  }
});

/**
 * Listen for native Chrome tab group removal to update WitPin group mappings
 */
if (typeof chrome !== 'undefined' && chrome.tabGroups && chrome.tabGroups.onRemoved) {
  chrome.tabGroups.onRemoved.addListener(async (group) => {
    try {
      const data = await getData();
      if (data && Array.isArray(data.groups)) {
        const linkedGroup = data.groups.find(g => g.chromeGroupId === group.id);
        if (linkedGroup) {
          console.log(`Chrome Tab Group ${group.id} removed. Unlinking WitPin group ${linkedGroup.id}`);
          await unlinkChromeGroup(linkedGroup.id);
        }
      }
    } catch (err) {
      console.error('Error in tabGroups.onRemoved listener:', err);
    }
  });
}

/**
 * Central function to get or create a Chrome Tab Group for a WitPin group.
 * MUST NEVER be called by "Open as Group".
 * ONLY called by "Add to Chrome Tab Group" or "Open in Chrome Tab Group".
 */
async function getOrCreateChromeGroup(witpinGroupId, groupName, groupColor, tabIds) {
  if (!witpinGroupId || !chrome.tabGroups || !chrome.tabs) return null;

  const data = await getData();
  const group = (data.groups || []).find(g => g.id === witpinGroupId);
  const existingChromeGroupId = group?.chromeGroupId;

  const validColors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  const colorMatch = validColors.includes(groupColor?.toLowerCase()) ? groupColor.toLowerCase() : 'blue';
  const targetTitle = groupName || group?.name || 'WitPin Group';

  // 1 & 2. Check existing mapping and verify that the Chrome group still exists
  if (existingChromeGroupId) {
    try {
      const existingGroup = await chrome.tabGroups.get(existingChromeGroupId);
      if (existingGroup) {
        // Reuse existing Chrome Tab Group
        if (tabIds && tabIds.length > 0) {
          await chrome.tabs.group({ tabIds, groupId: existingChromeGroupId });
        }
        await chrome.tabGroups.update(existingChromeGroupId, {
          title: targetTitle,
          color: colorMatch
        });
        return existingChromeGroupId;
      }
    } catch (e) {
      // Stale mapping: Chrome group no longer exists
      await unlinkChromeGroup(witpinGroupId);
    }
  }

  // 3 & 4. Create new Chrome group ONLY when explicitly requested
  if (tabIds && tabIds.length > 0) {
    const newChromeGroupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(newChromeGroupId, {
      title: targetTitle,
      color: colorMatch
    });
    await linkChromeGroup(witpinGroupId, newChromeGroupId);
    return newChromeGroupId;
  }

  return null;
}

/**
 * Listen for Messages from Popup & Options UI
 */
chrome.runtime?.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_CURRENT_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      sendResponse({ tab: tab || null });
    });
    return true; // Async response
  }

  if (message.action === 'GET_WINDOW_TABS') {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const filtered = (tabs || []).filter(t => isSupportedTabUrl(t.url));
      sendResponse({ tabs: filtered });
    });
    return true;
  }

  if (message.action === 'UNLINK_CHROME_GROUP') {
    const { witpinGroupId } = message;
    if (witpinGroupId) {
      unlinkChromeGroup(witpinGroupId)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
  }

  if (message.action === 'RESTORE_GROUP_TABS') {
    const { witpinGroupId, urls, inNewWindow, actionType = 'OPEN_NORMAL', groupName, groupColor } = message;
    
    (async () => {
      try {
        if (!urls || urls.length === 0) {
          sendResponse({ success: false, error: 'No URLs provided' });
          return;
        }

        // DUPLICATE TAB PROTECTION
        let targetWindowId = null;
        let existingTabsInWindow = [];

        if (inNewWindow) {
          const newWindow = await chrome.windows.create({ url: urls[0], focused: true });
          targetWindowId = newWindow.id;
          existingTabsInWindow = newWindow.tabs || [];
        } else {
          const [currentWin] = await chrome.windows.query({ currentWindow: true, populate: true });
          targetWindowId = currentWin ? currentWin.id : null;
          existingTabsInWindow = currentWin ? currentWin.tabs || [] : [];
        }

        const finalTabIds = [];

        for (let i = 0; i < urls.length; i++) {
          const targetUrl = urls[i];
          const normalizedTarget = normalizeUrl(targetUrl).toLowerCase();

          // Search for matching open tab in window
          const existingTab = !inNewWindow
            ? existingTabsInWindow.find(t => t.url && normalizeUrl(t.url).toLowerCase() === normalizedTarget)
            : null;

          if (existingTab) {
            // Reuse existing tab instead of opening duplicate
            finalTabIds.push(existingTab.id);
            if (i === 0) {
              await chrome.tabs.update(existingTab.id, { active: true });
              if (targetWindowId) await chrome.windows.update(targetWindowId, { focused: true });
            }
          } else {
            // Create tab if not already open
            if (inNewWindow && i === 0) {
              const firstTab = existingTabsInWindow[0];
              if (firstTab) finalTabIds.push(firstTab.id);
            } else {
              const newTab = await chrome.tabs.create({
                windowId: targetWindowId || undefined,
                url: targetUrl,
                active: i === 0
              });
              finalTabIds.push(newTab.id);
            }
          }
        }

        // CHROME TAB GROUP INTEGRATION (EXPLICIT ONLY)
        if ((actionType === 'ADD_TO_CHROME_GROUP' || actionType === 'OPEN_IN_CHROME_GROUP') && witpinGroupId) {
          await getOrCreateChromeGroup(witpinGroupId, groupName, groupColor, finalTabIds);
        }

        sendResponse({ success: true });
      } catch (err) {
        console.error('RESTORE_GROUP_TABS Error:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // Keep channel open for async response
  }
});
