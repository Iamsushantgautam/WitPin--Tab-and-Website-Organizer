/**
 * WitPin - Pure Vanilla JS Popup Application
 * Fast, lightweight, 100% dependency-free
 */

import {
  getData,
  addPinnedSite,
  removePinnedSite,
  updatePinnedSite,
  reorderPinned,
  createGroup,
  updateGroup,
  deleteGroup,
  duplicateGroup,
  reorderGroups,
  addSiteToGroup,
  removeSiteFromGroup,
  reorderSitesInGroup,
  saveWorkspace,
  unlinkChromeGroup,
  normalizeUrl
} from '../utils/storage.js';

import { getIconSvg } from '../utils/icons.js';
import { getDomain, getFaviconUrl, cleanFaviconUrl, getLetterBadgeSvg, DEFAULT_FAVICON_SVG } from '../utils/favicon.js';
import { browserTabGroupsManager } from '../utils/browserTabGroups.js';

class WitPinPopup {
  constructor() {
    this.root = document.getElementById('root');
    this.data = null;
    this.loading = true;
    this.searchQuery = '';
    this.viewMode = 'main'; // 'main' | 'active-tabs' | 'browser-groups'
    this.activeTabsCount = 0;
    this.browserGroups = [];
    this.activeTabs = [];
    this.expandedGroupIds = new Set();
    this.activeDropdown = null;
    this.pinnedViewMode = 'list'; // 'list' | 'grid'

    // Toast state
    this.toastTimer = null;

    this.init();
  }

  async init() {
    this.renderLoading();

    // Storage initial load & sync
    await this.loadStorageData();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.witpin_data) {
          this.data = changes.witpin_data.newValue;
          this.applyTheme();
          this.render();
        }
      });
    }

    // Subscribe to Chrome Tab Groups updates
    browserTabGroupsManager.subscribe((groups) => {
      this.browserGroups = groups;
      if (this.viewMode === 'browser-groups') {
        this.render();
      }
    });

    // Listen to tab updates for active tab count
    this.updateActiveTabs();
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const handleTabEvent = () => this.updateActiveTabs();
      chrome.tabs.onUpdated?.addListener(handleTabEvent);
      chrome.tabs.onCreated?.addListener(handleTabEvent);
      chrome.tabs.onRemoved?.addListener(handleTabEvent);
    }

    // Keydown listener for Esc key & search shortcut
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModals();
        if (this.searchQuery) {
          this.searchQuery = '';
          this.render();
        } else if (this.viewMode !== 'main') {
          this.viewMode = 'main';
          this.render();
        }
      }
    });

    // Click outside listener for dropdown menus
    window.addEventListener('click', (e) => {
      if (this.activeDropdown && !e.target.closest('.dropdown-wrapper') && !e.target.closest('.btn-add-compact')) {
        this.activeDropdown = null;
        this.renderHeader();
      }
    });

    this.applyTheme();
    this.render();
  }

  async loadStorageData() {
    try {
      this.data = await getData();
    } catch (err) {
      console.error('WitPin storage load error:', err);
    } finally {
      this.loading = false;
    }
  }

  updateActiveTabs() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
        const valid = (tabs || []).filter(t => t.url && !t.url.startsWith('chrome-extension://'));
        this.activeTabs = valid;
        this.activeTabsCount = valid.length;
        const countBadge = document.getElementById('active-tabs-count-badge');
        if (countBadge) countBadge.textContent = this.activeTabsCount;
      });
    } else {
      this.activeTabsCount = 4;
    }
  }

  openUrl(url) {
    if (!url) return;
    const validUrl = normalizeUrl(url);
    if (!validUrl) return;

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: validUrl, active: true });
    } else {
      window.open(validUrl, '_blank');
    }
  }

  openUrls(urls, inNewWindow = false) {
    if (!Array.isArray(urls) || urls.length === 0) return;
    const validUrls = urls.map(u => normalizeUrl(u)).filter(Boolean);
    if (validUrls.length === 0) return;

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      if (inNewWindow && chrome.windows && chrome.windows.create) {
        chrome.windows.create({ url: validUrls, focused: true });
      } else {
        validUrls.forEach((url, i) => {
          chrome.tabs.create({ url, active: i === 0 });
        });
      }
    } else {
      validUrls.forEach(url => window.open(url, '_blank'));
    }
  }

  applyTheme() {
    const theme = this.data?.settings?.theme || 'system';
    document.documentElement.setAttribute('data-theme', theme);
  }

  showToast(message, type = 'success') {
    let toastEl = document.getElementById('witpin-toast');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'witpin-toast';
      toastEl.className = 'toast-container';
      document.body.appendChild(toastEl);
    }

    toastEl.className = `toast-container toast-${type} show`;
    toastEl.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${type === 'error' ? getIconSvg('alertCircle') : getIconSvg('check')}</span>
        <span class="toast-message">${message}</span>
      </div>
    `;

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toastEl.className = `toast-container toast-${type}`;
    }, 3000);
  }

  renderLoading() {
    this.root.innerHTML = `
      <div class="popup-layout popup-loading-screen">
        <div class="loading-content">
          <div style="padding: 20px; text-align: center; color: var(--text-muted);">Loading witPin...</div>
        </div>
      </div>
    `;
  }

  render() {
    if (this.loading || !this.data) {
      this.renderLoading();
      return;
    }

    this.root.innerHTML = `
      <div class="popup-layout">
        <header id="popup-header" class="header-container"></header>
        <main id="popup-main" class="dashboard-content"></main>
        <div id="modal-portal"></div>
      </div>
    `;

    this.renderHeader();
    this.renderMainContent();
  }

  renderHeader() {
    const headerEl = document.getElementById('popup-header');
    if (!headerEl) return;

    headerEl.innerHTML = `
      <div class="brand-logo" id="header-brand-click" style="cursor: pointer;">
        <div class="logo-icon-badge">
          ${getIconSvg('pin', '', 14)}
        </div>
        <div class="brand-info">
          <span class="brand-title">witPin</span>
          <span class="brand-subtitle">Tab & Website Organizer</span>
        </div>
      </div>

      <div class="header-search-wrapper">
        <span class="search-icon">${getIconSvg('search', '', 13)}</span>
        <input
          type="text"
          id="header-search-input"
          class="header-search-input"
          placeholder="Search pinned & groups..."
          value="${this.escapeHtml(this.searchQuery)}"
        />
        ${this.searchQuery ? `
          <button class="search-clear-btn" id="header-search-clear">
            ${getIconSvg('x', '', 12)}
          </button>
        ` : `<span class="search-shortcut-hint">ESC</span>`}
      </div>

      <div class="header-actions">
        <button
          id="btn-toggle-active-tabs"
          className="active-tabs-toggle-btn ${this.viewMode === 'active-tabs' ? 'is-active' : ''}"
          title="Toggle Open Browser Tabs"
        >
          <span>Active Tabs</span>
          <span id="active-tabs-count-badge" class="active-tab-count-badge ${this.viewMode === 'active-tabs' ? 'badge-primary' : ''}">${this.activeTabsCount}</span>
        </button>

        <div class="add-menu-wrapper dropdown-wrapper">
          <button id="btn-add-menu-trigger" class="btn-primary btn-add-compact">
            ${getIconSvg('plus', '', 13)}
            <span>Add</span>
            <span class="add-chevron ${this.activeDropdown === 'add' ? 'rotate' : ''}">${getIconSvg('chevronDown', '', 12)}</span>
          </button>

          ${this.activeDropdown === 'add' ? `
            <div class="dropdown-menu add-menu-dropdown" style="position: absolute; right: 0; top: 34px; z-index: 1000; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); box-shadow: var(--shadow-dropdown); padding: 4px;">
              <button id="add-menu-pin-site">
                <span class="menu-icon">${getIconSvg('pin', 'text-accent', 14)}</span>
                <div class="menu-text">
                  <span class="menu-title">Pin Website</span>
                  <span class="menu-sub">Add site to pinned shortcuts</span>
                </div>
              </button>
              <button id="add-menu-create-group">
                <span class="menu-icon">${getIconSvg('folder', 'text-purple', 14)}</span>
                <div class="menu-text">
                  <span class="menu-title">New Group</span>
                  <span class="menu-sub">Group websites together</span>
                </div>
              </button>
              <button id="add-menu-save-workspace">
                <span class="menu-icon">${getIconSvg('layers', 'text-emerald', 14)}</span>
                <div class="menu-text">
                  <span class="menu-title">Save Workspace</span>
                  <span class="menu-sub">Save all current window tabs</span>
                </div>
              </button>
            </div>
          ` : ''}
        </div>

        <button id="btn-open-settings" class="btn-icon settings-btn" title="Options & Settings">
          ${getIconSvg('settings', '', 16)}
        </button>
      </div>
    `;

    // Bind Header Events
    document.getElementById('header-brand-click')?.addEventListener('click', () => {
      this.viewMode = 'main';
      this.render();
    });

    const searchInput = document.getElementById('header-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderMainContent();
    });

    document.getElementById('header-search-clear')?.addEventListener('click', () => {
      this.searchQuery = '';
      this.render();
    });

    document.getElementById('btn-toggle-active-tabs')?.addEventListener('click', () => {
      this.viewMode = this.viewMode === 'active-tabs' ? 'main' : 'active-tabs';
      this.render();
    });

    document.getElementById('btn-add-menu-trigger')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.activeDropdown = this.activeDropdown === 'add' ? null : 'add';
      this.renderHeader();
    });

    document.getElementById('add-menu-pin-site')?.addEventListener('click', () => {
      this.activeDropdown = null;
      this.openAddWebsiteModal();
    });

    document.getElementById('add-menu-create-group')?.addEventListener('click', () => {
      this.activeDropdown = null;
      this.openCreateGroupModal();
    });

    document.getElementById('add-menu-save-workspace')?.addEventListener('click', () => {
      this.activeDropdown = null;
      this.openWorkspaceModal();
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open('options.html', '_blank');
      }
    });
  }

  renderMainContent() {
    const mainEl = document.getElementById('popup-main');
    if (!mainEl) return;

    if (this.viewMode === 'active-tabs') {
      this.renderActiveTabsView(mainEl);
      return;
    }

    if (this.viewMode === 'browser-groups') {
      this.renderBrowserGroupsView(mainEl);
      return;
    }

    const { pinned = [], groups = [] } = this.data;
    const query = this.searchQuery.trim().toLowerCase();

    const filteredPinned = query
      ? pinned.filter(p => p.title.toLowerCase().includes(query) || p.url.toLowerCase().includes(query))
      : pinned;

    const filteredGroups = query
      ? groups.map(g => {
          const nameMatch = g.name.toLowerCase().includes(query);
          const siteMatches = (g.sites || []).filter(s => s.title.toLowerCase().includes(query) || s.url.toLowerCase().includes(query));
          if (nameMatch) return g;
          if (siteMatches.length > 0) return { ...g, sites: siteMatches };
          return null;
        }).filter(Boolean)
      : groups;

    if (query && filteredPinned.length === 0 && filteredGroups.length === 0) {
      mainEl.innerHTML = `
        <div class="empty-groups-compact">
          <span class="empty-icon-muted">${getIconSvg('search', '', 28)}</span>
          <span class="empty-title-sm">No matches found</span>
          <span class="empty-sub-sm">No pinned sites or groups match "${this.escapeHtml(query)}"</span>
        </div>
      `;
      return;
    }

    mainEl.innerHTML = `
      <div class="dashboard-2col">
        <div class="dashboard-column column-groups" id="col-groups"></div>
        <div class="dashboard-column column-pins" id="col-pins"></div>
      </div>
    `;

    this.renderGroupsColumn(document.getElementById('col-groups'), filteredGroups);
    this.renderPinnedColumn(document.getElementById('col-pins'), filteredPinned);
  }

  renderGroupsColumn(container, groups) {
    if (!container) return;

    container.innerHTML = `
      <div class="dashboard-section">
        <div class="section-header">
          <span class="section-title">
            ${getIconSvg('folder', 'text-accent', 14)}
            <span>Groups (${groups.length})</span>
          </span>
          <button id="btn-add-group-header" class="btn-icon btn-add-subtle" title="New Group">
            ${getIconSvg('plus', '', 14)}
          </button>
        </div>

        ${groups.length === 0 ? `
          <div class="empty-groups-compact">
            <span class="empty-icon-muted">${getIconSvg('folder', '', 24)}</span>
            <span class="empty-title-sm">No groups created</span>
            <span class="empty-sub-sm">Group websites together into organized workspaces</span>
            <button id="btn-create-first-group" class="btn-primary btn-xs" style="margin-top: 8px;">
              ${getIconSvg('plus', '', 12)}
              <span>Create Group</span>
            </button>
          </div>
        ` : `
          <div class="groups-list-wrapper" id="groups-list"></div>
        `}
      </div>
    `;

    document.getElementById('btn-add-group-header')?.addEventListener('click', () => this.openCreateGroupModal());
    document.getElementById('btn-create-first-group')?.addEventListener('click', () => this.openCreateGroupModal());

    const listEl = document.getElementById('groups-list');
    if (!listEl) return;

    groups.forEach(group => {
      const isExpanded = this.expandedGroupIds.has(group.id);
      const isLinked = !!group.chromeGroupId;

      const groupCard = document.createElement('div');
      groupCard.className = `group-card-compact ${isExpanded ? 'is-expanded' : ''}`;
      groupCard.innerHTML = `
        <div class="group-card-header" data-group-id="${group.id}">
          <span class="group-drag-handle">${getIconSvg('grip', '', 12)}</span>
          <button class="expand-toggle-btn" data-action="toggle-expand" data-group-id="${group.id}">
            ${getIconSvg(isExpanded ? 'chevronDown' : 'chevronRight', '', 12)}
          </button>
          <div class="group-card-title-area">
            <span class="group-color-dot" style="background-color: ${group.color || '#6366F1'};"></span>
            <span class="group-name">${this.escapeHtml(group.name)}</span>
            ${isLinked ? `<span class="active-pulse-dot" title="Linked to active Chrome Tab Group"></span>` : ''}
          </div>
          <span class="badge-count-sm">${(group.sites || []).length}</span>
          <button class="btn-icon btn-xs" data-action="open-all-group" data-group-id="${group.id}" title="Open all tabs">
            ${getIconSvg('externalLink', '', 12)}
          </button>
          <button class="btn-icon btn-xs" data-action="group-menu" data-group-id="${group.id}" title="More Options">
            ${getIconSvg('moreVertical', '', 12)}
          </button>
        </div>

        ${isExpanded ? `
          <div class="group-sites-expanded">
            ${(group.sites || []).length === 0 ? `
              <div style="padding: 6px 12px; font-size: 10px; color: var(--text-muted);">No sites in group. Click + to add.</div>
            ` : (group.sites || []).map(site => `
              <div class="group-site-item" data-site-id="${site.id}" data-url="${this.escapeHtml(site.url)}" tabindex="0" role="button" aria-label="Open ${this.escapeHtml(site.title)}">
                <img
                  class="site-favicon-sm"
                  src="${this.escapeHtml(cleanFaviconUrl(site.favicon, site.url, site.title))}"
                  style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px; object-fit: contain; flex-shrink: 0;"
                  onError="this.onerror=null; this.src='${getLetterBadgeSvg(site.url, site.title)}';"
                  alt=""
                />
                <div class="site-text-details">
                  <span class="site-title-link" title="${this.escapeHtml(site.title)}">${this.escapeHtml(site.title)}</span>
                  <span class="site-url-subtext" title="${this.escapeHtml(site.url)}">${this.escapeHtml(site.url || getDomain(site.url))}</span>
                </div>
                <button class="btn-icon btn-xs site-menu-btn" data-action="site-menu" data-type="group" data-group-id="${group.id}" data-site-id="${site.id}" title="Website options" aria-label="Website options">
                  ${getIconSvg('moreVertical', '', 11)}
                </button>
              </div>
            `).join('')}
            <div style="padding: 4px 8px;">
              <button class="btn-secondary btn-xs" data-action="add-site-to-group" data-group-id="${group.id}" style="width: 100%;">
                ${getIconSvg('plus', '', 11)} Add Site
              </button>
            </div>
          </div>
        ` : ''}
      `;

      listEl.appendChild(groupCard);
    });

    // Event delegation for Group Card actions
    listEl.addEventListener('click', async (e) => {
      const toggleBtn = e.target.closest('[data-action="toggle-expand"]');
      if (toggleBtn) {
        const gId = toggleBtn.dataset.groupId;
        if (this.expandedGroupIds.has(gId)) this.expandedGroupIds.delete(gId);
        else this.expandedGroupIds.add(gId);
        this.renderMainContent();
        return;
      }

      const openAllBtn = e.target.closest('[data-action="open-all-group"]');
      if (openAllBtn) {
        const gId = openAllBtn.dataset.groupId;
        const group = groups.find(g => g.id === gId);
        if (group && group.sites?.length > 0) {
          const urls = group.sites.map(s => s.url);
          this.openUrls(urls);
        }
        return;
      }

      const menuBtn = e.target.closest('[data-action="group-menu"]');
      if (menuBtn) {
        const gId = menuBtn.dataset.groupId;
        this.openGroupContextMenu(gId, menuBtn);
        return;
      }

      const siteMenuBtn = e.target.closest('[data-action="site-menu"]');
      if (siteMenuBtn) {
        e.stopPropagation();
        const siteId = siteMenuBtn.dataset.siteId;
        const sType = siteMenuBtn.dataset.type;
        const gId = siteMenuBtn.dataset.groupId;
        const group = groups.find(g => g.id === gId);
        const site = group?.sites?.find(s => s.id === siteId);
        if (site) {
          this.openSiteContextMenu(site, sType, gId, siteMenuBtn);
        }
        return;
      }

      const addSiteBtn = e.target.closest('[data-action="add-site-to-group"]');
      if (addSiteBtn) {
        const gId = addSiteBtn.dataset.groupId;
        this.openAddWebsiteModal(gId);
        return;
      }

      const siteItem = e.target.closest('.group-site-item');
      if (siteItem && !e.target.closest('button')) {
        const url = siteItem.dataset.url;
        if (url) {
          this.openUrl(url);
        }
        return;
      }

      const headerArea = e.target.closest('.group-card-header');
      if (headerArea && !e.target.closest('button')) {
        const gId = headerArea.dataset.groupId;
        if (this.expandedGroupIds.has(gId)) this.expandedGroupIds.delete(gId);
        else this.expandedGroupIds.add(gId);
        this.renderMainContent();
      }
    });
  }

  renderPinnedColumn(container, pinnedSites) {
    if (!container) return;

    container.innerHTML = `
      <div class="dashboard-section">
        <div class="section-header">
          <span class="section-title">
            ${getIconSvg('pin', 'text-accent', 14)}
            <span>Pinned (${pinnedSites.length})</span>
          </span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <button id="btn-toggle-pin-layout" class="btn-icon btn-xs" title="Toggle List / Grid View" aria-label="Toggle List / Grid View">
              ${getIconSvg(this.pinnedViewMode === 'grid' ? 'list' : 'grid', '', 13)}
            </button>
            <button id="btn-add-pin-header" class="btn-icon btn-add-subtle" title="Pin Website" aria-label="Pin Website">
              ${getIconSvg('plus', '', 14)}
            </button>
          </div>
        </div>

        ${pinnedSites.length === 0 ? `
          <div class="empty-pinned-compact">
            <span class="empty-icon-muted">${getIconSvg('pin', '', 24)}</span>
            <span class="empty-title-sm">No websites pinned</span>
            <span class="empty-sub-sm">Pin your favorite sites for fast 1-click access</span>
            <button id="btn-create-first-pin" class="btn-primary btn-xs" style="margin-top: 8px;">
              ${getIconSvg('plus', '', 12)}
              <span>Pin Website</span>
            </button>
          </div>
        ` : this.pinnedViewMode === 'list' ? `
          <div class="pinned-list-wrapper" id="pinned-list"></div>
        ` : `
          <div class="pinned-grid-wrapper" id="pinned-grid"></div>
        `}
      </div>
    `;

    document.getElementById('btn-toggle-pin-layout')?.addEventListener('click', () => {
      this.pinnedViewMode = this.pinnedViewMode === 'list' ? 'grid' : 'list';
      this.renderMainContent();
    });

    document.getElementById('btn-add-pin-header')?.addEventListener('click', () => this.openAddWebsiteModal());
    document.getElementById('btn-create-first-pin')?.addEventListener('click', () => this.openAddWebsiteModal());

    if (this.pinnedViewMode === 'list') {
      const listEl = document.getElementById('pinned-list');
      if (!listEl) return;

      pinnedSites.forEach(site => {
        const pinItem = document.createElement('div');
        pinItem.className = 'pinned-list-item';
        pinItem.setAttribute('tabindex', '0');
        pinItem.setAttribute('role', 'button');
        pinItem.setAttribute('aria-label', `Open ${site.title}`);

        const faviconUrl = cleanFaviconUrl(site.favicon, site.url, site.title);
        const letterBadge = getLetterBadgeSvg(site.url, site.title);
        const domain = getDomain(site.url);

        pinItem.innerHTML = `
          <img
            class="site-favicon-sm"
            src="${this.escapeHtml(faviconUrl)}"
            style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px; object-fit: contain; flex-shrink: 0;"
            alt=""
            onError="this.onerror=null; this.src='${letterBadge}';"
          />
          <div class="site-text-details">
            <span class="site-title-link" title="${this.escapeHtml(site.title)}">${this.escapeHtml(site.title)}</span>
            <span class="site-url-subtext" title="${this.escapeHtml(site.url)}">${this.escapeHtml(site.url || domain)}</span>
          </div>
          <button class="btn-icon btn-xs unpin-card-btn" data-action="site-menu" data-type="pinned" data-site-id="${site.id}" title="Website options" aria-label="Website options">
            ${getIconSvg('moreVertical', '', 11)}
          </button>
        `;

        // Handle item click
        pinItem.addEventListener('click', async (e) => {
          const menuBtn = e.target.closest('[data-action="site-menu"]');
          if (menuBtn) {
            e.stopPropagation();
            this.openSiteContextMenu(site, 'pinned', null, menuBtn);
            return;
          }

          this.openUrl(site.url);
        });

        // Handle Enter / Space keyboard navigation
        pinItem.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.openUrl(site.url);
          }
        });

        listEl.appendChild(pinItem);
      });
    } else {
      const gridEl = document.getElementById('pinned-grid');
      if (!gridEl) return;

      pinnedSites.forEach(site => {
        const pinCard = document.createElement('div');
        pinCard.className = 'pinned-card-item';
        pinCard.setAttribute('tabindex', '0');
        pinCard.setAttribute('role', 'button');
        pinCard.setAttribute('aria-label', `Open ${site.title}`);

        const faviconUrl = cleanFaviconUrl(site.favicon, site.url, site.title);
        const letterBadge = getLetterBadgeSvg(site.url, site.title);
        const domain = getDomain(site.url);

        pinCard.innerHTML = `
          <button class="btn-icon btn-xs unpin-card-btn" data-action="site-menu" data-type="pinned" data-site-id="${site.id}" title="Website options" aria-label="Website options">
            ${getIconSvg('moreVertical', '', 11)}
          </button>
          <div class="pinned-card-favicon-container">
            <img
              class="pinned-card-favicon"
              src="${this.escapeHtml(faviconUrl)}"
              style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px; object-fit: contain;"
              alt=""
              onError="this.onerror=null; this.src='${letterBadge}';"
            />
          </div>
          <div class="pinned-card-info">
            <span class="pinned-card-title" title="${this.escapeHtml(site.title)}">${this.escapeHtml(site.title)}</span>
            <span class="pinned-card-domain" title="${this.escapeHtml(domain)}">${this.escapeHtml(domain)}</span>
          </div>
        `;

        // Handle card click
        pinCard.addEventListener('click', async (e) => {
          const menuBtn = e.target.closest('[data-action="site-menu"]');
          if (menuBtn) {
            e.stopPropagation();
            this.openSiteContextMenu(site, 'pinned', null, menuBtn);
            return;
          }

          this.openUrl(site.url);
        });

        // Handle Enter / Space keyboard navigation
        pinCard.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.openUrl(site.url);
          }
        });

        gridEl.appendChild(pinCard);
      });
    }
  }

  renderActiveTabsView(container) {
    const pinnedUrls = new Set((this.data.pinned || []).map(p => normalizeUrl(p.url)));

    container.innerHTML = `
      <div style="padding: 12px; display: flex; flex-direction: column; height: 100%; min-height: 0;">
        <div class="section-header" style="margin-bottom: 10px;">
          <span class="section-title">
            ${getIconSvg('layers', 'text-accent', 14)}
            <span>Open Browser Tabs (${this.activeTabs.length})</span>
          </span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button id="btn-save-all-active" class="btn-primary btn-xs">
              ${getIconSvg('folder', '', 11)} Save as Workspace
            </button>
            <button id="btn-back-main" class="btn-secondary btn-xs">Back to Home</button>
          </div>
        </div>

        <div style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 6px; min-height: 0;">
          ${this.activeTabs.length === 0 ? `
            <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 11.5px;">No open browser tabs found.</div>
          ` : this.activeTabs.map(tab => {
            const isAlreadyPinned = pinnedUrls.has(normalizeUrl(tab.url));
            const faviconUrl = cleanFaviconUrl(tab.favIconUrl, tab.url, tab.title);
            const letterBadge = getLetterBadgeSvg(tab.url, tab.title);

            return `
              <div class="pinned-list-item" data-tab-id="${tab.id}" data-url="${this.escapeHtml(tab.url)}">
                <img
                  class="site-favicon-sm"
                  src="${this.escapeHtml(faviconUrl)}"
                  style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px; object-fit: contain; flex-shrink: 0;"
                  onError="this.onerror=null; this.src='${letterBadge}';"
                  alt=""
                />
                <div class="site-text-details">
                  <span class="site-title-link" title="${this.escapeHtml(tab.title || 'Untitled Tab')}">${this.escapeHtml(tab.title || 'Untitled Tab')}</span>
                  <span class="site-url-subtext" title="${this.escapeHtml(tab.url || '')}">${this.escapeHtml(tab.url || getDomain(tab.url))}</span>
                </div>
                ${isAlreadyPinned ? `
                  <span class="status-pill status-active" style="font-size: 9.5px; padding: 2px 6px;">Pinned</span>
                ` : `
                  <button class="btn-primary btn-xs" data-action="pin-active-tab" data-title="${this.escapeHtml(tab.title || '')}" data-url="${this.escapeHtml(tab.url || '')}" data-favicon="${this.escapeHtml(tab.favIconUrl || '')}">
                    ${getIconSvg('pin', '', 11)} Pin
                  </button>
                `}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    document.getElementById('btn-back-main')?.addEventListener('click', () => {
      this.viewMode = 'main';
      this.render();
    });

    document.getElementById('btn-save-all-active')?.addEventListener('click', () => {
      this.openWorkspaceModal();
    });

    container.addEventListener('click', async (e) => {
      const pinBtn = e.target.closest('[data-action="pin-active-tab"]');
      if (pinBtn) {
        try {
          await addPinnedSite({
            title: pinBtn.dataset.title,
            url: pinBtn.dataset.url,
            favicon: pinBtn.dataset.favicon
          });
          await this.loadStorageData();
          this.renderActiveTabsView(container);
          this.showToast('Website pinned!');
        } catch (err) {
          this.showToast(err.message || 'Already pinned', 'error');
        }
      }
    });
  }

  openGroupContextMenu(groupId, triggerEl) {
    const portal = document.getElementById('modal-portal');
    if (!portal) return;

    const group = this.data.groups.find(g => g.id === groupId);
    if (!group) return;

    const rect = triggerEl.getBoundingClientRect();

    const menuEl = document.createElement('div');
    menuEl.className = 'context-menu-dropdown';
    menuEl.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 4}px;
      right: ${window.innerWidth - rect.right}px;
      z-index: 2000;
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-dropdown);
      padding: 4px;
      width: 175px;
    `;

    menuEl.innerHTML = `
      <button class="context-item" id="ctx-open-window">
        ${getIconSvg('externalLink', '', 13)}
        <span>Open in New Window</span>
      </button>
      <button class="context-item" id="ctx-add-site">
        ${getIconSvg('plus', '', 13)}
        <span>Add Website</span>
      </button>
      <button class="context-item" id="ctx-duplicate">
        ${getIconSvg('layers', '', 13)}
        <span>Duplicate Group</span>
      </button>
      <button class="context-item" id="ctx-edit">
        ${getIconSvg('edit', '', 13)}
        <span>Edit Group</span>
      </button>
      <button class="context-item menu-danger" id="ctx-delete">
        ${getIconSvg('trash', '', 13)}
        <span>Delete Group</span>
      </button>
    `;

    portal.appendChild(menuEl);

    const closeHandler = (e) => {
      if (!menuEl.contains(e.target)) {
        menuEl.remove();
        window.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => window.addEventListener('click', closeHandler), 10);

    menuEl.querySelector('#ctx-open-window')?.addEventListener('click', () => {
      menuEl.remove();
      if (group.sites?.length > 0) this.openUrls(group.sites.map(s => s.url), true);
    });

    menuEl.querySelector('#ctx-add-site')?.addEventListener('click', () => {
      menuEl.remove();
      this.openAddWebsiteModal(groupId);
    });

    menuEl.querySelector('#ctx-duplicate')?.addEventListener('click', async () => {
      menuEl.remove();
      await duplicateGroup(groupId);
      await this.loadStorageData();
      this.renderMainContent();
      this.showToast('Group duplicated');
    });

    menuEl.querySelector('#ctx-edit')?.addEventListener('click', () => {
      menuEl.remove();
      this.openCreateGroupModal(group);
    });

    menuEl.querySelector('#ctx-delete')?.addEventListener('click', async () => {
      menuEl.remove();
      if (confirm(`Delete group "${group.name}"?`)) {
        await deleteGroup(groupId);
        await this.loadStorageData();
        this.renderMainContent();
        this.showToast('Group deleted');
      }
    });
  }

  openSiteContextMenu(site, type, groupId, triggerEl) {
    const portal = document.getElementById('modal-portal');
    if (!portal) return;

    const rect = triggerEl.getBoundingClientRect();

    const menuEl = document.createElement('div');
    menuEl.className = 'context-menu-dropdown';
    menuEl.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 4}px;
      right: ${window.innerWidth - rect.right}px;
      z-index: 2000;
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-dropdown);
      padding: 4px;
      width: 165px;
    `;

    const isPinned = type === 'pinned';

    menuEl.innerHTML = `
      <button class="context-item" id="ctx-site-open">
        ${getIconSvg('externalLink', '', 13)}
        <span>Open in New Tab</span>
      </button>
      <button class="context-item" id="ctx-site-copy">
        ${getIconSvg('copy', '', 13)}
        <span>Copy Link URL</span>
      </button>
      <button class="context-item menu-danger" id="ctx-site-delete">
        ${getIconSvg('trash', '', 13)}
        <span>${isPinned ? 'Unpin Website' : 'Remove Site'}</span>
      </button>
    `;

    portal.appendChild(menuEl);

    const closeHandler = (e) => {
      if (!menuEl.contains(e.target)) {
        menuEl.remove();
        window.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => window.addEventListener('click', closeHandler), 10);

    menuEl.querySelector('#ctx-site-open')?.addEventListener('click', () => {
      menuEl.remove();
      this.openUrl(site.url);
    });

    menuEl.querySelector('#ctx-site-copy')?.addEventListener('click', () => {
      menuEl.remove();
      if (site.url) {
        navigator.clipboard.writeText(site.url).then(() => {
          this.showToast('Link copied to clipboard');
        }).catch(() => {
          this.showToast('Failed to copy link', 'error');
        });
      }
    });

    menuEl.querySelector('#ctx-site-delete')?.addEventListener('click', async () => {
      menuEl.remove();
      if (isPinned) {
        await removePinnedSite(site.id);
        await this.loadStorageData();
        this.renderMainContent();
        this.showToast('Website unpinned');
      } else if (groupId) {
        await removeSiteFromGroup(groupId, site.id);
        await this.loadStorageData();
        this.renderMainContent();
        this.showToast('Site removed from group');
      }
    });
  }

  openAddWebsiteModal(preselectedGroupId = null) {
    const portal = document.getElementById('modal-portal');
    if (!portal) return;

    const modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop';
    modalEl.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 3000;
      display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    modalEl.innerHTML = `
      <div class="modal-card" style="background: var(--bg-primary); border-radius: var(--radius-lg); padding: 16px; width: 100%; max-width: 360px; box-shadow: var(--shadow-dropdown);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 13px; font-weight: 700;">Add Website</h3>
          <button id="modal-close" class="btn-icon">${getIconSvg('x', '', 14)}</button>
        </div>

        <form id="add-website-form" style="display: flex; flex-direction: column; gap: 10px;">
          <div>
            <label style="font-size: 10.5px; font-weight: 600; margin-bottom: 4px; display: block;">Destination</label>
            <select id="input-destination" style="width: 100%;">
              <option value="pinned" ${!preselectedGroupId ? 'selected' : ''}>📌 Pinned Sites</option>
              ${(this.data.groups || []).map(g => `<option value="${g.id}" ${preselectedGroupId === g.id ? 'selected' : ''}>📁 ${this.escapeHtml(g.name)}</option>`).join('')}
            </select>
          </div>

          <div>
            <label style="font-size: 10.5px; font-weight: 600; margin-bottom: 4px; display: block;">Website URL</label>
            <input type="text" id="input-url" placeholder="https://example.com" required style="width: 100%;" />
          </div>

          <div>
            <label style="font-size: 10.5px; font-weight: 600; margin-bottom: 4px; display: block;">Title (Optional)</label>
            <input type="text" id="input-title" placeholder="My Bookmark" style="width: 100%;" />
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
            <button type="button" id="modal-cancel" class="btn-secondary btn-xs">Cancel</button>
            <button type="submit" class="btn-primary btn-xs">Save Website</button>
          </div>
        </form>
      </div>
    `;

    portal.appendChild(modalEl);

    const closeModal = () => modalEl.remove();
    modalEl.querySelector('#modal-close')?.addEventListener('click', closeModal);
    modalEl.querySelector('#modal-cancel')?.addEventListener('click', closeModal);

    modalEl.querySelector('#add-website-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dest = modalEl.querySelector('#input-destination').value;
      const url = modalEl.querySelector('#input-url').value;
      const title = modalEl.querySelector('#input-title').value;

      try {
        if (dest === 'pinned') {
          await addPinnedSite({ url, title });
        } else {
          await addSiteToGroup(dest, { url, title });
        }
        await this.loadStorageData();
        closeModal();
        this.renderMainContent();
        this.showToast('Website added successfully!');
      } catch (err) {
        this.showToast(err.message || 'Failed to add website', 'error');
      }
    });
  }

  openCreateGroupModal(groupToEdit = null) {
    const portal = document.getElementById('modal-portal');
    if (!portal) return;

    const modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop';
    modalEl.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 3000;
      display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    modalEl.innerHTML = `
      <div class="modal-card" style="background: var(--bg-primary); border-radius: var(--radius-lg); padding: 16px; width: 100%; max-width: 340px; box-shadow: var(--shadow-dropdown);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 13px; font-weight: 700;">${groupToEdit ? 'Edit Group' : 'New Group'}</h3>
          <button id="modal-close" class="btn-icon">${getIconSvg('x', '', 14)}</button>
        </div>

        <form id="group-form" style="display: flex; flex-direction: column; gap: 10px;">
          <div>
            <label style="font-size: 10.5px; font-weight: 600; margin-bottom: 4px; display: block;">Group Name</label>
            <input type="text" id="input-group-name" value="${this.escapeHtml(groupToEdit?.name || '')}" placeholder="e.g. Work, Study, Social" required style="width: 100%;" />
          </div>

          <div>
            <label style="font-size: 10.5px; font-weight: 600; margin-bottom: 4px; display: block;">Accent Color</label>
            <input type="color" id="input-group-color" value="${groupToEdit?.color || '#6366F1'}" style="height: 32px; cursor: pointer; padding: 2px;" />
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
            <button type="button" id="modal-cancel" class="btn-secondary btn-xs">Cancel</button>
            <button type="submit" class="btn-primary btn-xs">${groupToEdit ? 'Save Changes' : 'Create Group'}</button>
          </div>
        </form>
      </div>
    `;

    portal.appendChild(modalEl);

    const closeModal = () => modalEl.remove();
    modalEl.querySelector('#modal-close')?.addEventListener('click', closeModal);
    modalEl.querySelector('#modal-cancel')?.addEventListener('click', closeModal);

    modalEl.querySelector('#group-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = modalEl.querySelector('#input-group-name').value;
      const color = modalEl.querySelector('#input-group-color').value;

      try {
        if (groupToEdit) {
          await updateGroup(groupToEdit.id, { name, color });
        } else {
          await createGroup({ name, color });
        }
        await this.loadStorageData();
        closeModal();
        this.renderMainContent();
        this.showToast(groupToEdit ? 'Group updated' : 'Group created');
      } catch (err) {
        this.showToast(err.message || 'Failed to save group', 'error');
      }
    });
  }

  openWorkspaceModal() {
    const portal = document.getElementById('modal-portal');
    if (!portal) return;

    const modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop';
    modalEl.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 3000;
      display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    modalEl.innerHTML = `
      <div class="modal-card" style="background: var(--bg-primary); border-radius: var(--radius-lg); padding: 16px; width: 100%; max-width: 360px; box-shadow: var(--shadow-dropdown);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 13px; font-weight: 700;">Save Window Workspace</h3>
          <button id="modal-close" class="btn-icon">${getIconSvg('x', '', 14)}</button>
        </div>

        <form id="workspace-form" style="display: flex; flex-direction: column; gap: 10px;">
          <div>
            <label style="font-size: 10.5px; font-weight: 600; margin-bottom: 4px; display: block;">Workspace Name</label>
            <input type="text" id="input-ws-name" value="Workspace ${new Date().toLocaleDateString()}" required style="width: 100%;" />
          </div>

          <div style="font-size: 11px; color: var(--text-secondary);">
            Includes <strong>${this.activeTabs.length}</strong> open tabs from current window.
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
            <button type="button" id="modal-cancel" class="btn-secondary btn-xs">Cancel</button>
            <button type="submit" class="btn-primary btn-xs">Save Workspace</button>
          </div>
        </form>
      </div>
    `;

    portal.appendChild(modalEl);

    const closeModal = () => modalEl.remove();
    modalEl.querySelector('#modal-close')?.addEventListener('click', closeModal);
    modalEl.querySelector('#modal-cancel')?.addEventListener('click', closeModal);

    modalEl.querySelector('#workspace-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = modalEl.querySelector('#input-ws-name').value;

      try {
        await saveWorkspace(name, this.activeTabs);
        await this.loadStorageData();
        closeModal();
        this.renderMainContent();
        this.showToast('Workspace saved successfully!');
      } catch (err) {
        this.showToast(err.message || 'Failed to save workspace', 'error');
      }
    });
  }

  closeModals() {
    const portal = document.getElementById('modal-portal');
    if (portal) portal.innerHTML = '';
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Instantiate popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new WitPinPopup();
});
