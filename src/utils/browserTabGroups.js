/**
 * WitPin - Native Browser Tab Groups Manager (Vanilla JS)
 */

export const TAB_GROUP_COLOR_MAP = {
  grey: '#71717a',
  blue: '#3b82f6',
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
  pink: '#ec4899',
  purple: '#a855f7',
  cyan: '#06b6d4',
  orange: '#f97316'
};

export function getTabGroupColorHex(colorName) {
  if (!colorName) return TAB_GROUP_COLOR_MAP.blue;
  return TAB_GROUP_COLOR_MAP[colorName.toLowerCase()] || colorName;
}

class BrowserTabGroupsManager {
  constructor() {
    this.listeners = new Set();
    this.groups = [];
    this.loading = true;
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this.fetchGroups();

    if (typeof chrome !== 'undefined') {
      const handleEvent = () => this.fetchGroups();

      if (chrome.tabGroups) {
        chrome.tabGroups.onCreated?.addListener(handleEvent);
        chrome.tabGroups.onUpdated?.addListener(handleEvent);
        chrome.tabGroups.onRemoved?.addListener(handleEvent);
        chrome.tabGroups.onMoved?.addListener(handleEvent);
      }

      if (chrome.tabs) {
        chrome.tabs.onCreated?.addListener(handleEvent);
        chrome.tabs.onUpdated?.addListener(handleEvent);
        chrome.tabs.onRemoved?.addListener(handleEvent);
        chrome.tabs.onActivated?.addListener(handleEvent);
        chrome.tabs.onMoved?.addListener(handleEvent);
        chrome.tabs.onAttached?.addListener(handleEvent);
        chrome.tabs.onDetached?.addListener(handleEvent);
      }
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    this.init();
    callback(this.groups, this.loading);
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach(fn => fn(this.groups, this.loading));
  }

  fetchGroups() {
    if (typeof chrome !== 'undefined' && chrome.tabGroups && chrome.tabs && chrome.tabGroups.query) {
      chrome.tabGroups.query({}, (groups) => {
        if (chrome.runtime.lastError || !groups) {
          this.groups = [];
          this.loading = false;
          this.notify();
          return;
        }

        chrome.tabs.query({}, (tabs) => {
          const validTabs = (tabs || []).filter(t => t.url && !t.url.startsWith('chrome-extension://'));

          this.groups = groups.map(g => {
            const groupTabs = validTabs.filter(t => String(t.groupId) === String(g.id));
            const hasActive = groupTabs.some(t => t.active);

            return {
              id: g.id,
              title: g.title || 'Untitled Group',
              color: g.color || 'blue',
              colorHex: getTabGroupColorHex(g.color),
              collapsed: !!g.collapsed,
              windowId: g.windowId,
              tabs: groupTabs.map(t => ({
                id: t.id,
                title: t.title || 'Untitled',
                url: t.url || '',
                favIconUrl: t.favIconUrl || '',
                active: !!t.active,
                pinned: !!t.pinned,
                groupId: t.groupId,
                windowId: t.windowId
              })),
              tabCount: groupTabs.length,
              hasActiveTab: hasActive
            };
          });

          this.loading = false;
          this.notify();
        });
      });
    } else {
      // Development mock mode fallback
      this.groups = [
        {
          id: 101,
          title: 'Work',
          color: 'orange',
          colorHex: TAB_GROUP_COLOR_MAP.orange,
          collapsed: false,
          windowId: 1,
          hasActiveTab: true,
          tabCount: 2,
          tabs: [
            { id: 1001, title: 'Wit Tools - Productivity', url: 'https://wit-tools.vercel.app', favIconUrl: '', active: true },
            { id: 1002, title: 'GitHub Repository', url: 'https://github.com', favIconUrl: '', active: false }
          ]
        }
      ];
      this.loading = false;
      this.notify();
    }
  }

  focusBrowserGroup(groupId) {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ groupId }, (tabs) => {
        if (tabs && tabs.length > 0) {
          const firstTab = tabs[0];
          if (firstTab.windowId && chrome.windows) {
            chrome.windows.update(firstTab.windowId, { focused: true });
          }
          chrome.tabs.update(firstTab.id, { active: true });
        }
      });
    }
  }

  focusTab(tabId, windowId) {
    if (typeof chrome !== 'undefined' && chrome.tabs && tabId) {
      if (windowId && chrome.windows) {
        chrome.windows.update(windowId, { focused: true });
      }
      chrome.tabs.update(tabId, { active: true });
    }
  }

  closeTab(tabId) {
    if (typeof chrome !== 'undefined' && chrome.tabs && tabId) {
      chrome.tabs.remove(tabId, () => this.fetchGroups());
    } else {
      this.groups = this.groups.map(g => ({
        ...g,
        tabs: g.tabs.filter(t => t.id !== tabId),
        tabCount: g.tabs.filter(t => t.id !== tabId).length
      }));
      this.notify();
    }
  }

  updateBrowserGroup(groupId, updates) {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.tabGroups && chrome.tabGroups.update) {
        const updateObj = {};
        if (updates.title !== undefined) updateObj.title = updates.title;
        if (updates.color !== undefined) updateObj.color = updates.color;

        chrome.tabGroups.update(groupId, updateObj, (updated) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            this.fetchGroups();
            resolve(updated);
          }
        });
      } else {
        this.groups = this.groups.map(g => {
          if (g.id === groupId) {
            return {
              ...g,
              title: updates.title !== undefined ? updates.title : g.title,
              color: updates.color !== undefined ? updates.color : g.color,
              colorHex: updates.color !== undefined ? getTabGroupColorHex(updates.color) : g.colorHex
            };
          }
          return g;
        });
        this.notify();
        resolve();
      }
    });
  }

  closeBrowserGroup(groupId) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ groupId }, (tabs) => {
          const tabIds = (tabs || []).map(t => t.id).filter(Boolean);
          if (tabIds.length > 0) {
            chrome.tabs.remove(tabIds, () => {
              this.fetchGroups();
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        this.groups = this.groups.filter(g => g.id !== groupId);
        this.notify();
        resolve();
      }
    });
  }

  ungroupBrowserGroup(groupId) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.ungroup) {
        chrome.tabs.query({ groupId }, (tabs) => {
          const tabIds = (tabs || []).map(t => t.id).filter(Boolean);
          if (tabIds.length > 0) {
            chrome.tabs.ungroup(tabIds, () => {
              this.fetchGroups();
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        this.groups = this.groups.filter(g => g.id !== groupId);
        this.notify();
        resolve();
      }
    });
  }
}

export const browserTabGroupsManager = new BrowserTabGroupsManager();
