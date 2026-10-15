/**
 * WitPin - Privacy-First Storage Abstraction Layer
 * 
 * PRIVACY NOTICE:
 * This extension strictly uses `chrome.storage.local` for all data storage.
 * - NO `localStorage` or `sessionStorage` is used.
 * - NO cookies or tracking tokens are set or read.
 * - NO analytics, telemetry, or remote server API calls are made.
 * - All website titles, URLs, favicons, groups, and settings remain 100% local to the user's Chrome profile.
 */

import { cleanFaviconUrl } from './favicon.js';

// Initial default state structure for WitPin
const INITIAL_DATA = {
  version: 1,
  pinned: [],
  groups: [],
  settings: {
    theme: 'system', // 'system' | 'light' | 'dark'
    openInNewTab: true,
    autoCloseAfterSave: false,
    confirmDelete: true
  }
};

// In-memory fallback for non-extension development environments
let memoryStorage = null;

/**
 * Generate stable unique IDs without external dependencies
 */
export function generateUniqueId() {
  return 'wp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Clean & validate URL format safely
 */
export function normalizeUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return '';
  let trimmed = urlStr.trim();

  // Strip duplicate protocols e.g. "https://https://example.com"
  trimmed = trimmed.replace(/^(https?:\/\/)+/i, 'https://');

  if (!/^https?:\/\//i.test(trimmed) && !/^chrome:\/\//i.test(trimmed) && !/^edge:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.href;
  } catch (e) {
    return '';
  }
}

/**
 * Retrieve full storage state from chrome.storage.local
 */
export async function getData() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['witpin_data'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('WitPin Storage Error:', chrome.runtime.lastError);
          resolve(memoryStorage || INITIAL_DATA);
          return;
        }

        if (!result.witpin_data) {
          // Initialize storage with empty state on first run
          chrome.storage.local.set({ witpin_data: INITIAL_DATA }, () => {
            resolve(INITIAL_DATA);
          });
        } else {
          let data = { ...result.witpin_data };
          let modified = false;

          // Remove legacy default mock items & sanitize favicons
          if (Array.isArray(data.pinned)) {
            const cleanPinned = data.pinned.filter(p => !p.id?.startsWith('default-'));
            if (cleanPinned.length !== data.pinned.length) {
              data.pinned = cleanPinned;
              modified = true;
            }
            data.pinned.forEach(p => {
              const cleaned = cleanFaviconUrl(p.favicon, p.url, p.title);
              if (cleaned !== p.favicon) {
                p.favicon = cleaned;
                modified = true;
              }
            });
          } else {
            data.pinned = [];
            modified = true;
          }

          if (Array.isArray(data.groups)) {
            const cleanGroups = data.groups.filter(g => !g.id?.startsWith('group-dev') && !g.id?.startsWith('group-work'));
            if (cleanGroups.length !== data.groups.length) {
              data.groups = cleanGroups;
              modified = true;
            }
            data.groups.forEach(g => {
              if (Array.isArray(g.sites)) {
                g.sites.forEach(s => {
                  const cleaned = cleanFaviconUrl(s.favicon, s.url, s.title);
                  if (cleaned !== s.favicon) {
                    s.favicon = cleaned;
                    modified = true;
                  }
                });
              }
            });
          } else {
            data.groups = [];
            modified = true;
          }

          if (modified) {
            chrome.storage.local.set({ witpin_data: data });
          }

          resolve({
            ...INITIAL_DATA,
            ...data,
            settings: {
              ...INITIAL_DATA.settings,
              ...(data.settings || {})
            }
          });
        }
      });
    } else {
      // Dev mode fallback
      if (!memoryStorage) memoryStorage = INITIAL_DATA;
      resolve(memoryStorage);
    }
  });
}

/**
 * Save complete storage state to chrome.storage.local
 */
export async function saveData(data) {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ witpin_data: data }, () => {
        if (chrome.runtime.lastError) {
          console.error('WitPin Storage Save Error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve(data);
        }
      });
    } else {
      memoryStorage = data;
      resolve(data);
    }
  });
}

/**
 * Add a site to Pinned list
 */
export async function addPinnedSite(site) {
  const data = await getData();
  const validUrl = normalizeUrl(site.url);

  if (!validUrl) {
    throw new Error('Please enter a valid website URL.');
  }

  // Prevent exact duplicate URLs in pinned
  const existing = data.pinned.find(p => p.url.toLowerCase() === validUrl.toLowerCase());
  if (existing) {
    throw new Error('This website is already in your Pinned list.');
  }

  const newPinnedSite = {
    id: generateUniqueId(),
    title: site.title?.trim() || new URL(validUrl).hostname,
    url: validUrl,
    favicon: site.favicon || `https://www.google.com/s2/favicons?domain=${new URL(validUrl).hostname}&sz=64`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  data.pinned.push(newPinnedSite);
  await saveData(data);
  return newPinnedSite;
}

/**
 * Remove a site from Pinned list
 */
export async function removePinnedSite(siteId) {
  const data = await getData();
  data.pinned = data.pinned.filter(p => p.id !== siteId);
  await saveData(data);
  return data;
}

/**
 * Update a pinned site
 */
export async function updatePinnedSite(siteId, updates) {
  const data = await getData();
  const index = data.pinned.findIndex(p => p.id === siteId);
  if (index !== -1) {
    if (updates.url) {
      const validUrl = normalizeUrl(updates.url);
      if (!validUrl) throw new Error('Invalid URL format.');
      updates.url = validUrl;
    }
    data.pinned[index] = {
      ...data.pinned[index],
      ...updates,
      updatedAt: Date.now()
    };
    await saveData(data);
  }
  return data;
}

/**
 * Reorder pinned array
 */
export async function reorderPinned(newPinnedArray) {
  const data = await getData();
  data.pinned = newPinnedArray;
  await saveData(data);
  return data;
}

/**
 * Move a pinned site up or down
 */
export async function movePinnedSite(siteId, direction) {
  const data = await getData();
  const index = data.pinned.findIndex(p => p.id === siteId);
  if (index === -1) return data;

  let targetIndex = index;
  if (direction === 'up' && index > 0) {
    targetIndex = index - 1;
  } else if (direction === 'down' && index < data.pinned.length - 1) {
    targetIndex = index + 1;
  }

  if (targetIndex !== index) {
    const [item] = data.pinned.splice(index, 1);
    data.pinned.splice(targetIndex, 0, item);
    await saveData(data);
  }
  return data;
}

/**
 * Move a site inside a group up or down
 */
export async function moveSiteInGroup(groupId, siteId, direction) {
  const data = await getData();
  const group = data.groups.find(g => g.id === groupId);
  if (!group || !Array.isArray(group.sites)) return data;

  const index = group.sites.findIndex(s => s.id === siteId);
  if (index === -1) return data;

  let targetIndex = index;
  if (direction === 'up' && index > 0) {
    targetIndex = index - 1;
  } else if (direction === 'down' && index < group.sites.length - 1) {
    targetIndex = index + 1;
  }

  if (targetIndex !== index) {
    const [item] = group.sites.splice(index, 1);
    group.sites.splice(targetIndex, 0, item);
    group.updatedAt = Date.now();
    await saveData(data);
  }
  return data;
}

/**
 * Move a pinned site into a group
 */
export async function movePinnedToGroup(pinnedSiteId, targetGroupId) {
  const data = await getData();
  const pinIndex = data.pinned.findIndex(p => p.id === pinnedSiteId);
  if (pinIndex === -1) throw new Error('Pinned website not found.');

  const group = data.groups.find(g => g.id === targetGroupId);
  if (!group) throw new Error('Target group not found.');

  const [site] = data.pinned.splice(pinIndex, 1);
  if (!Array.isArray(group.sites)) {
    group.sites = [];
  }
  group.sites.push({
    ...site,
    updatedAt: Date.now()
  });
  group.updatedAt = Date.now();

  await saveData(data);
  return data;
}

/**
 * Move a site from a group to pinned list
 */
export async function moveGroupSiteToPinned(groupId, siteId) {
  const data = await getData();
  const group = data.groups.find(g => g.id === groupId);
  if (!group || !Array.isArray(group.sites)) throw new Error('Group not found.');

  const siteIndex = group.sites.findIndex(s => s.id === siteId);
  if (siteIndex === -1) throw new Error('Site not found in group.');

  const [site] = group.sites.splice(siteIndex, 1);
  group.updatedAt = Date.now();

  if (!Array.isArray(data.pinned)) data.pinned = [];
  if (!data.pinned.some(p => p.url.toLowerCase() === site.url.toLowerCase())) {
    data.pinned.push({
      ...site,
      updatedAt: Date.now()
    });
  }

  await saveData(data);
  return data;
}

/**
 * Move a site from one group to another group
 */
export async function moveSiteBetweenGroups(fromGroupId, toGroupId, siteId) {
  const data = await getData();
  const fromGroup = data.groups.find(g => g.id === fromGroupId);
  const toGroup = data.groups.find(g => g.id === toGroupId);
  if (!fromGroup || !toGroup) throw new Error('Selected groups not found.');

  const siteIndex = (fromGroup.sites || []).findIndex(s => s.id === siteId);
  if (siteIndex === -1) throw new Error('Site not found in group.');

  const [site] = fromGroup.sites.splice(siteIndex, 1);
  fromGroup.updatedAt = Date.now();

  if (!Array.isArray(toGroup.sites)) toGroup.sites = [];
  toGroup.sites.push({
    ...site,
    updatedAt: Date.now()
  });
  toGroup.updatedAt = Date.now();

  await saveData(data);
  return data;
}

/**
 * Create a new website group
 */
export async function createGroup({ name, color = '#6366F1', chromeGroupId = null, sites = [] }) {
  const trimmedName = name?.trim();
  if (!trimmedName) throw new Error('Group name cannot be empty.');

  const data = await getData();

  const sanitizedSites = Array.isArray(sites) ? sites.map(s => {
    const validUrl = normalizeUrl(s.url);
    if (!validUrl) return null;
    let hostname = 'Website';
    try {
      hostname = new URL(validUrl).hostname;
    } catch (e) {}

    return {
      id: s.id || generateUniqueId(),
      title: s.title?.trim() || hostname,
      url: validUrl,
      favicon: s.favicon || s.favIconUrl || (hostname !== 'Website' ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64` : ''),
      createdAt: s.createdAt || Date.now(),
      updatedAt: s.updatedAt || Date.now()
    };
  }).filter(Boolean) : [];

  const newGroup = {
    id: generateUniqueId(),
    name: trimmedName,
    color: color || '#6366F1',
    chromeGroupId: chromeGroupId || null,
    sites: sanitizedSites,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  data.groups.push(newGroup);
  await saveData(data);
  return newGroup;
}

/**
 * Update an existing group
 */
export async function updateGroup(groupId, updates) {
  const data = await getData();
  const index = data.groups.findIndex(g => g.id === groupId);
  if (index !== -1) {
    data.groups[index] = {
      ...data.groups[index],
      ...updates,
      updatedAt: Date.now()
    };
    await saveData(data);
  }
  return data;
}

/**
 * Link a WitPin group to a Chrome Tab Group ID
 */
export async function linkChromeGroup(groupId, chromeGroupId) {
  return updateGroup(groupId, { chromeGroupId });
}

/**
 * Unlink Chrome Tab Group from a WitPin group
 */
export async function unlinkChromeGroup(groupId) {
  return updateGroup(groupId, { chromeGroupId: null });
}

/**
 * Delete a group
 */
export async function deleteGroup(groupId) {
  const data = await getData();
  data.groups = data.groups.filter(g => g.id !== groupId);
  await saveData(data);
  return data;
}

/**
 * Duplicate a group
 */
export async function duplicateGroup(groupId) {
  const data = await getData();
  const group = data.groups.find(g => g.id === groupId);
  if (!group) throw new Error('Group not found.');

  const newGroup = {
    ...group,
    id: generateUniqueId(),
    name: `${group.name} (Copy)`,
    chromeGroupId: null,
    sites: (group.sites || []).map(s => ({ ...s, id: generateUniqueId() })),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  data.groups.push(newGroup);
  await saveData(data);
  return newGroup;
}

/**
 * Reorder group list
 */
export async function reorderGroups(newGroupsArray) {
  const data = await getData();
  data.groups = newGroupsArray;
  await saveData(data);
  return data;
}

/**
 * Add website to a specific group
 */
export async function addSiteToGroup(groupId, site) {
  const validUrl = normalizeUrl(site.url);
  if (!validUrl) throw new Error('Please enter a valid website URL.');

  const data = await getData();
  const group = data.groups.find(g => g.id === groupId);
  if (!group) throw new Error('Selected group does not exist.');

  let hostname = 'Website';
  try {
    hostname = new URL(validUrl).hostname;
  } catch (e) {}

  const newSite = {
    id: generateUniqueId(),
    title: site.title?.trim() || hostname,
    url: validUrl,
    favicon: site.favicon || site.favIconUrl || (hostname !== 'Website' ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64` : ''),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  if (!Array.isArray(group.sites)) {
    group.sites = [];
  }

  group.sites.push(newSite);
  group.updatedAt = Date.now();
  await saveData(data);
  return newSite;
}

/**
 * Remove website from a group
 */
export async function removeSiteFromGroup(groupId, siteId) {
  const data = await getData();
  const group = data.groups.find(g => g.id === groupId);
  if (group && Array.isArray(group.sites)) {
    group.sites = group.sites.filter(s => s.id !== siteId);
    group.updatedAt = Date.now();
    await saveData(data);
  }
  return data;
}

/**
 * Reorder sites within a specific group
 */
export async function reorderSitesInGroup(groupId, newSitesArray) {
  const data = await getData();
  const group = data.groups.find(g => g.id === groupId);
  if (group) {
    group.sites = newSitesArray;
    group.updatedAt = Date.now();
    await saveData(data);
  }
  return data;
}

/**
 * Save current open tabs as a Workspace Group
 */
export async function saveWorkspace(workspaceName, tabSites, iconOrColorParam = '#8B5CF6', colorParam = '#8B5CF6') {
  if (!tabSites || tabSites.length === 0) {
    throw new Error('No valid tabs found to save into workspace.');
  }

  let color = '#8B5CF6';
  if (typeof colorParam === 'string' && colorParam.startsWith('#')) {
    color = colorParam;
  } else if (typeof iconOrColorParam === 'string' && iconOrColorParam.startsWith('#')) {
    color = iconOrColorParam;
  }

  const data = await getData();

  const sanitizedSites = tabSites.map(tab => {
    const validUrl = normalizeUrl(tab.url);
    if (!validUrl) return null;
    let hostname = 'Website';
    try {
      hostname = new URL(validUrl).hostname;
    } catch (e) {}

    return {
      id: generateUniqueId(),
      title: tab.title?.trim() || hostname,
      url: validUrl,
      favicon: tab.favIconUrl || tab.favicon || (hostname !== 'Website' ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64` : ''),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }).filter(Boolean);

  const newWorkspace = {
    id: generateUniqueId(),
    name: workspaceName?.trim() || `Workspace ${new Date().toLocaleDateString()}`,
    color: color,
    sites: sanitizedSites,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  data.groups.push(newWorkspace);
  await saveData(data);
  return newWorkspace;
}

/**
 * Update user settings
 */
export async function updateSettings(settingsUpdates) {
  const data = await getData();
  data.settings = {
    ...data.settings,
    ...settingsUpdates
  };
  await saveData(data);
  return data.settings;
}

/**
 * Export extension data as sanitized JSON string
 */
export async function exportData() {
  const data = await getData();
  return JSON.stringify(data, null, 2);
}

/**
 * Export data as standard Netscape HTML Bookmarks format (compatible with Chrome, Edge, Firefox, Safari)
 */
export async function exportHTMLBookmarks() {
  const data = await getData();
  const pinned = data.pinned || [];
  const groups = data.groups || [];

  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will read and import correctly. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>WitPin Bookmarks Export</TITLE>
<H1>WitPin Bookmarks</H1>
<DL><p>\n`;

  if (pinned.length > 0) {
    html += `    <DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}">Pinned Websites</H3>\n    <DL><p>\n`;
    pinned.forEach(p => {
      const addDate = Math.floor((p.createdAt || Date.now()) / 1000);
      html += `        <DT><A HREF="${escapeHtmlAttr(p.url)}" ADD_DATE="${addDate}">${escapeHtmlText(p.title)}</A>\n`;
    });
    html += `    </DL><p>\n`;
  }

  groups.forEach(g => {
    if (g.sites && g.sites.length > 0) {
      const addDate = Math.floor((g.createdAt || Date.now()) / 1000);
      html += `    <DT><H3 ADD_DATE="${addDate}">${escapeHtmlText(g.name)}</H3>\n    <DL><p>\n`;
      g.sites.forEach(s => {
        const sAddDate = Math.floor((s.createdAt || Date.now()) / 1000);
        html += `        <DT><A HREF="${escapeHtmlAttr(s.url)}" ADD_DATE="${sAddDate}">${escapeHtmlText(s.title)}</A>\n`;
      });
      html += `    </DL><p>\n`;
    }
  });

  html += `</DL><p>\n`;
  return html;
}

/**
 * Export data as plain text list format
 */
export async function exportTextList() {
  const data = await getData();
  let text = `# WitPin Export - ${new Date().toLocaleDateString()}\n\n`;

  if (data.pinned && data.pinned.length > 0) {
    text += `## Pinned Websites (${data.pinned.length})\n`;
    data.pinned.forEach(p => {
      text += `- ${p.title}: ${p.url}\n`;
    });
    text += `\n`;
  }

  if (data.groups && data.groups.length > 0) {
    data.groups.forEach(g => {
      text += `## Group: ${g.name} (${(g.sites || []).length} items)\n`;
      (g.sites || []).forEach(s => {
        text += `- ${s.title}: ${s.url}\n`;
      });
      text += `\n`;
    });
  }

  return text;
}

function escapeHtmlText(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Import extension data with strict validation & URL sanitization
 */
export async function importData(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error('Invalid JSON format.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Imported file must contain a valid JSON object.');
  }

  // Validate and sanitize Pinned array
  const sanitizedPinned = Array.isArray(parsed.pinned) ? parsed.pinned.map(p => {
    const validUrl = normalizeUrl(p.url);
    if (!validUrl) return null;
    return {
      id: p.id || generateUniqueId(),
      title: (p.title || 'Untitled').substring(0, 100),
      url: validUrl,
      favicon: p.favicon || `https://www.google.com/s2/favicons?domain=${new URL(validUrl).hostname}&sz=64`,
      createdAt: p.createdAt || Date.now(),
      updatedAt: p.updatedAt || Date.now()
    };
  }).filter(Boolean) : [];

  // Validate and sanitize Groups array
  const sanitizedGroups = Array.isArray(parsed.groups) ? parsed.groups.map(g => {
    const sanitizedSites = Array.isArray(g.sites) ? g.sites.map(s => {
      const validUrl = normalizeUrl(s.url);
      if (!validUrl) return null;
      return {
        id: s.id || generateUniqueId(),
        title: (s.title || 'Untitled').substring(0, 100),
        url: validUrl,
        favicon: s.favicon || `https://www.google.com/s2/favicons?domain=${new URL(validUrl).hostname}&sz=64`
      };
    }).filter(Boolean) : [];

    return {
      id: g.id || generateUniqueId(),
      name: (g.name || 'Unnamed Group').substring(0, 80),
      icon: g.icon || '📁',
      color: g.color || '#6366F1',
      chromeGroupId: g.chromeGroupId || null,
      sites: sanitizedSites,
      createdAt: g.createdAt || Date.now(),
      updatedAt: g.updatedAt || Date.now()
    };
  }) : [];

  const newData = {
    version: 1,
    pinned: sanitizedPinned,
    groups: sanitizedGroups,
    settings: {
      ...INITIAL_DATA.settings,
      ...(parsed.settings || {})
    }
  };

  await saveData(newData);
  return newData;
}

/**
 * Reset extension data back to clean initial state
 */
export async function resetData() {
  await saveData(INITIAL_DATA);
  return INITIAL_DATA;
}

/**
 * Retrieve latest saved tabs (combining pinned & groups, sorted by timestamp descending)
 */
export function getLatestSavedTabs(data, limit = 3) {
  if (!data) return [];
  const items = [];

  // Pinned items
  if (Array.isArray(data.pinned)) {
    data.pinned.forEach(p => {
      items.push({
        ...p,
        savedType: 'pinned',
        groupName: 'Pinned',
        groupColor: '#6366F1',
        groupIcon: '📌',
        timestamp: p.createdAt || p.updatedAt || Date.now()
      });
    });
  }

  // Group sites
  if (Array.isArray(data.groups)) {
    data.groups.forEach(g => {
      if (Array.isArray(g.sites)) {
        g.sites.forEach(s => {
          items.push({
            ...s,
            savedType: 'group',
            groupId: g.id,
            groupName: g.name,
            groupColor: g.color || '#6366F1',
            groupIcon: g.icon || '📁',
            timestamp: s.createdAt || s.updatedAt || g.updatedAt || Date.now()
          });
        });
      }
    });
  }

  // Sort descending by timestamp
  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return items.slice(0, limit);
}

