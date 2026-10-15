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
  movePinnedSite,
  moveSiteInGroup,
  movePinnedToGroup,
  moveGroupSiteToPinned,
  moveSiteBetweenGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  duplicateGroup,
  reorderGroups,
  moveGroup,
  updateSettings,
  addSiteToGroup,
  removeSiteFromGroup,
  reorderSitesInGroup,
  saveWorkspace,
  unlinkChromeGroup,
  saveExpandedGroupIds,
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
    this.pinnedViewMode = 'list';

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
      this.syncExpandedGroupIds();
    } catch (err) {
      console.error('WitPin storage load error:', err);
    } finally {
      this.loading = false;
    }
  }

  syncExpandedGroupIds() {
    const groups = this.data?.groups || [];
    const validGroupIds = new Set(groups.map(g => g.id));
    const allGroupsDefault = !!this.data?.settings?.defaultExpandGroups;

    if (!this._hasInitializedExpansion) {
      this._hasInitializedExpansion = true;
      const initialSet = new Set();

      if (allGroupsDefault) {
        groups.forEach(g => initialSet.add(g.id));
      } else {
        // 1. Add groups configured with individual defaultOpen: true
        groups.forEach(g => {
          if (g.defaultOpen) {
            initialSet.add(g.id);
          }
        });

        // 2. Also restore any groups previously expanded and saved across refreshes/reloads
        const savedExpanded = this.data?.settings?.expandedGroupIds;
        if (Array.isArray(savedExpanded)) {
          savedExpanded.forEach(id => {
            if (validGroupIds.has(id)) {
              initialSet.add(id);
            }
          });
        }
      }

      this.expandedGroupIds = initialSet;
    } else {
      for (const id of this.expandedGroupIds) {
        if (!validGroupIds.has(id)) {
          this.expandedGroupIds.delete(id);
        }
      }
      if (allGroupsDefault) {
        groups.forEach(g => this.expandedGroupIds.add(g.id));
      }
    }
  }

  async persistExpandedState() {
    try {
      const arr = Array.from(this.expandedGroupIds);
      await saveExpandedGroupIds(arr);
      if (this.data && this.data.settings) {
        this.data.settings.expandedGroupIds = arr;
      }
    } catch (err) {
      console.warn('Failed to persist expanded state:', err);
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
      <div class="brand-logo" id="header-brand-click" style="cursor: pointer;" title="witPin by witTools (Click to visit wittools.vercel.app/witpin)">
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
              <div class="menu-divider" style="margin: 4px 0;"></div>
              <button id="add-menu-visit-website">
                <span class="menu-icon">${getIconSvg('globe', 'text-accent', 14)}</span>
                <div class="menu-text">
                  <span class="menu-title">Official Website</span>
                  <span class="menu-sub">wittools.vercel.app/witpin</span>
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
      if (this.viewMode !== 'main') {
        this.viewMode = 'main';
        this.render();
      } else {
        this.openUrl('https://wittools.vercel.app/witpin');
      }
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

    document.getElementById('add-menu-visit-website')?.addEventListener('click', () => {
      this.activeDropdown = null;
      this.openUrl('https://wittools.vercel.app/witpin');
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

    const allExpanded = groups.length > 0 && groups.every(g => this.expandedGroupIds.has(g.id));

    container.innerHTML = `
      <div class="dashboard-section">
        <div class="section-header">
          <span class="section-title">
            ${getIconSvg('folder', 'text-accent', 14)}
            <span>Groups (${groups.length})</span>
          </span>
          <div style="display: flex; align-items: center; gap: 4px;">
            ${groups.length > 0 ? `
              <button
                id="btn-toggle-expand-all"
                class="btn-icon btn-xs"
                title="${allExpanded ? 'Collapse All Groups (Hide Links)' : 'Expand All Groups (Show All Links)'}"
                aria-label="${allExpanded ? 'Collapse All Groups' : 'Expand All Groups'}"
              >
                ${getIconSvg(allExpanded ? 'chevronUp' : 'chevronsUpDown', '', 13)}
              </button>
              <button
                id="btn-all-groups-default-toggle"
                class="btn-icon btn-xs ${this.data?.settings?.defaultExpandGroups ? 'active-accent' : ''}"
                title="All Groups Default Show: ${this.data?.settings?.defaultExpandGroups ? 'ON (Always open all)' : 'OFF (Opens per individual group setting)'}"
                aria-label="Toggle All Groups Default Show"
              >
                ${getIconSvg('layers', this.data?.settings?.defaultExpandGroups ? 'text-accent' : '', 13)}
              </button>
            ` : ''}
            <button id="btn-add-group-header" class="btn-icon btn-add-subtle" title="New Group">
              ${getIconSvg('plus', '', 14)}
            </button>
          </div>
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

    document.getElementById('btn-toggle-expand-all')?.addEventListener('click', async () => {
      const isAllExpanded = groups.length > 0 && groups.every(g => this.expandedGroupIds.has(g.id));
      if (isAllExpanded) {
        this.expandedGroupIds.clear();
        this.showToast('All groups collapsed');
      } else {
        groups.forEach(g => this.expandedGroupIds.add(g.id));
        this.showToast('All group links shown');
      }
      await this.persistExpandedState();
      this.renderMainContent();
    });

    document.getElementById('btn-all-groups-default-toggle')?.addEventListener('click', async () => {
      const currentVal = !!this.data?.settings?.defaultExpandGroups;
      const newVal = !currentVal;
      const updated = await updateSettings({ defaultExpandGroups: newVal });
      this.data.settings = updated;
      if (newVal) {
        groups.forEach(g => this.expandedGroupIds.add(g.id));
      } else {
        this.expandedGroupIds = new Set(groups.filter(g => g.defaultOpen).map(g => g.id));
      }
      await this.persistExpandedState();
      this.renderMainContent();
      this.showToast(`All Groups Default Show: ${newVal ? 'ON' : 'OFF'}`);
    });

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
            ${group.defaultOpen ? `<span title="Default Show (This Group): ON" style="font-size: 8.5px; padding: 1px 4px; border-radius: var(--radius-xs); background: var(--accent-light); color: var(--accent-primary); font-weight: 700; text-transform: uppercase;">AUTO</span>` : ''}
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

      groupCard.setAttribute('draggable', 'true');
      groupCard.dataset.groupId = group.id;

      // Group drag handlers for reordering
      groupCard.addEventListener('dragstart', (e) => {
        if (e.target.closest('.group-site-item') || e.target.closest('button')) {
          e.preventDefault();
          return;
        }
        this._isDragging = true;
        this._draggedGroupId = group.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', group.id);
        groupCard.classList.add('is-dragging');
      });

      groupCard.addEventListener('dragend', () => {
        groupCard.classList.remove('is-dragging');
        document.querySelectorAll('.group-card-compact, .pinned-list-item, .pinned-card-item').forEach(el => {
          el.classList.remove('drag-over', 'drag-target-group');
        });
        setTimeout(() => {
          this._isDragging = false;
          this._draggedGroupId = null;
        }, 50);
      });

      // Allow dropping dragged pinned sites onto this group or dropping groups to reorder
      groupCard.addEventListener('dragover', (e) => {
        if (this._draggedPinnedId) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          groupCard.classList.add('drag-target-group');
        } else if (this._draggedGroupId && this._draggedGroupId !== group.id) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          groupCard.classList.add('drag-over');
        }
      });

      groupCard.addEventListener('dragleave', () => {
        groupCard.classList.remove('drag-target-group', 'drag-over');
      });

      groupCard.addEventListener('drop', async (e) => {
        e.preventDefault();
        groupCard.classList.remove('drag-target-group', 'drag-over');

        if (this._draggedPinnedId) {
          const siteId = this._draggedPinnedId;
          this._draggedPinnedId = null;
          try {
            await movePinnedToGroup(siteId, group.id);
            await this.loadStorageData();
            this.renderMainContent();
            this.showToast(`Moved to "${group.name}"`);
          } catch (err) {
            this.showToast(err.message || 'Failed to move website', 'error');
          }
          return;
        }

        if (this._draggedGroupId && this._draggedGroupId !== group.id) {
          const sourceId = this._draggedGroupId;
          this._draggedGroupId = null;

          const allGroups = [...(this.data.groups || [])];
          const fromIndex = allGroups.findIndex(g => g.id === sourceId);
          const toIndex = allGroups.findIndex(g => g.id === group.id);

          if (fromIndex !== -1 && toIndex !== -1) {
            const [movedGroup] = allGroups.splice(fromIndex, 1);
            allGroups.splice(toIndex, 0, movedGroup);

            await reorderGroups(allGroups);
            await this.loadStorageData();
            this.renderMainContent();
            this.showToast('Group order updated');
          }
        }
      });

      listEl.appendChild(groupCard);
    });

    // Event delegation for Group Card actions
    listEl.addEventListener('click', async (e) => {
      if (this._isDragging) return;
      const toggleBtn = e.target.closest('[data-action="toggle-expand"]');
      if (toggleBtn) {
        const gId = toggleBtn.dataset.groupId;
        if (this.expandedGroupIds.has(gId)) this.expandedGroupIds.delete(gId);
        else this.expandedGroupIds.add(gId);
        await this.persistExpandedState();
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
        await this.persistExpandedState();
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
        ` : `
          <div class="pinned-list-wrapper" id="pinned-list"></div>
        `}
      </div>
    `;

    document.getElementById('btn-add-pin-header')?.addEventListener('click', () => this.openAddWebsiteModal());
    document.getElementById('btn-create-first-pin')?.addEventListener('click', () => this.openAddWebsiteModal());

    const listEl = document.getElementById('pinned-list');
    if (!listEl) return;

    pinnedSites.forEach(site => {
      const pinItem = document.createElement('div');
      pinItem.className = 'pinned-list-item';
      pinItem.setAttribute('tabindex', '0');
      pinItem.setAttribute('role', 'button');
      pinItem.setAttribute('aria-label', `Open ${site.title}`);
      pinItem.setAttribute('draggable', 'true');
      pinItem.dataset.siteId = site.id;

      const faviconUrl = cleanFaviconUrl(site.favicon, site.url, site.title);
      const letterBadge = getLetterBadgeSvg(site.url, site.title);
      const domain = getDomain(site.url);

      pinItem.innerHTML = `
        <span class="pinned-drag-handle" title="Drag to reorder">${getIconSvg('grip', '', 11)}</span>
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

      // Drag & drop handlers
      pinItem.addEventListener('dragstart', (e) => {
        this._isDragging = true;
        this._draggedPinnedId = site.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', site.id);
        pinItem.classList.add('is-dragging');
      });

      pinItem.addEventListener('dragend', () => {
        pinItem.classList.remove('is-dragging');
        document.querySelectorAll('.pinned-list-item, .pinned-card-item, .group-card-compact').forEach(el => {
          el.classList.remove('drag-over', 'drag-target-group');
        });
        setTimeout(() => {
          this._isDragging = false;
          this._draggedPinnedId = null;
        }, 50);
      });

      pinItem.addEventListener('dragover', (e) => {
        if (!this._draggedPinnedId || this._draggedPinnedId === site.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        pinItem.classList.add('drag-over');
      });

      pinItem.addEventListener('dragleave', () => {
        pinItem.classList.remove('drag-over');
      });

      pinItem.addEventListener('drop', async (e) => {
        e.preventDefault();
        pinItem.classList.remove('drag-over');
        const sourceId = this._draggedPinnedId || e.dataTransfer.getData('text/plain');
        if (!sourceId || sourceId === site.id) return;

        const pinned = [...(this.data.pinned || [])];
        const fromIndex = pinned.findIndex(p => p.id === sourceId);
        const toIndex = pinned.findIndex(p => p.id === site.id);
        if (fromIndex === -1 || toIndex === -1) return;

        const [movedItem] = pinned.splice(fromIndex, 1);
        pinned.splice(toIndex, 0, movedItem);

        await reorderPinned(pinned);
        await this.loadStorageData();
        this.renderMainContent();
        this.showToast('Pinned order updated');
      });

      // Handle item click
      pinItem.addEventListener('click', async (e) => {
        if (this._isDragging) return;
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
                <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                  ${isAlreadyPinned ? `
                    <span class="status-pill status-active" style="font-size: 9.5px; padding: 2px 6px;">Pinned</span>
                  ` : `
                    <button class="btn-primary btn-xs" data-action="pin-active-tab" data-title="${this.escapeHtml(tab.title || '')}" data-url="${this.escapeHtml(tab.url || '')}" data-favicon="${this.escapeHtml(tab.favIconUrl || '')}">
                      ${getIconSvg('pin', '', 11)} Pin
                    </button>
                  `}
                  <button class="btn-icon btn-xs" data-action="active-tab-menu" data-tab-id="${tab.id}" title="Tab options" aria-label="Tab options">
                    ${getIconSvg('moreVertical', '', 11)}
                  </button>
                </div>
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
      const menuBtn = e.target.closest('[data-action="active-tab-menu"]');
      if (menuBtn) {
        e.stopPropagation();
        const tabId = parseInt(menuBtn.dataset.tabId, 10);
        const tab = this.activeTabs.find(t => t.id === tabId);
        if (tab) {
          this.openActiveTabContextMenu(tab, menuBtn);
        }
        return;
      }

      const pinBtn = e.target.closest('[data-action="pin-active-tab"]');
      if (pinBtn) {
        e.stopPropagation();
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
        return;
      }

      const tabItem = e.target.closest('.pinned-list-item');
      if (tabItem && !e.target.closest('button')) {
        const tabId = parseInt(tabItem.dataset.tabId, 10);
        if (tabId && typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.update) {
          chrome.tabs.update(tabId, { active: true });
        } else if (tabItem.dataset.url) {
          this.openUrl(tabItem.dataset.url);
        }
      }
    });
  }

  closeContextMenu() {
    if (this._activeContextMenuCleanup) {
      this._activeContextMenuCleanup();
      this._activeContextMenuCleanup = null;
    }
    document.querySelectorAll('.context-menu-dropdown').forEach(el => el.remove());
  }

  setupContextMenuDismiss(menuEl) {
    const handleOutsideClick = (e) => {
      if (!menuEl.contains(e.target)) {
        this.closeContextMenu();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.closeContextMenu();
      }
    };

    const handleScroll = (e) => {
      if (!menuEl.contains(e.target)) {
        this.closeContextMenu();
      }
    };

    const handleResize = () => {
      this.closeContextMenu();
    };

    const cleanup = () => {
      window.removeEventListener('click', handleOutsideClick, true);
      window.removeEventListener('contextmenu', handleOutsideClick, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };

    this._activeContextMenuCleanup = cleanup;

    setTimeout(() => {
      window.addEventListener('click', handleOutsideClick, true);
      window.addEventListener('contextmenu', handleOutsideClick, true);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
    }, 10);
  }

  positionContextMenu(menuEl, triggerEl) {
    const rect = triggerEl.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const menuWidth = menuEl.offsetWidth || 170;
    const menuHeight = menuEl.offsetHeight || 120;

    const spaceBelow = viewportHeight - rect.bottom - 4;
    const spaceAbove = rect.top - 4;

    let top;
    let isFlipped = false;

    // Flip upwards if overflowing below and more room above
    if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
      top = rect.top - menuHeight - 4;
      isFlipped = true;
    } else if (spaceBelow >= menuHeight) {
      top = rect.bottom + 4;
    } else {
      if (spaceAbove > spaceBelow) {
        top = rect.top - menuHeight - 4;
        isFlipped = true;
      } else {
        top = rect.bottom + 4;
      }
    }

    // Clamp strictly within vertical viewport margins
    if (top + menuHeight > viewportHeight - margin) {
      top = viewportHeight - menuHeight - margin;
    }
    if (top < margin) {
      top = margin;
    }

    // If menu is taller than viewport, enable scrolling
    if (menuHeight > viewportHeight - (margin * 2)) {
      menuEl.style.maxHeight = `${viewportHeight - (margin * 2)}px`;
      menuEl.style.overflowY = 'auto';
    }

    // Horizontal positioning: align right edge of menu with right edge of trigger button
    let left = rect.right - menuWidth;

    // Clamp within horizontal viewport margins
    if (left + menuWidth > viewportWidth - margin) {
      left = viewportWidth - menuWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }

    menuEl.style.position = 'fixed';
    menuEl.style.top = `${Math.round(top)}px`;
    menuEl.style.left = `${Math.round(left)}px`;
    menuEl.style.right = 'auto';
    menuEl.style.bottom = 'auto';

    if (isFlipped) {
      menuEl.classList.add('menu-flipped');
    } else {
      menuEl.classList.remove('menu-flipped');
    }
  }

  openGroupContextMenu(groupId, triggerEl) {
    const portal = document.getElementById('modal-portal');
    if (!portal) return;

    const group = this.data.groups.find(g => g.id === groupId);
    if (!group) return;

    const allGroups = this.data.groups || [];
    const groupIndex = allGroups.findIndex(g => g.id === groupId);
    const canMoveUp = groupIndex > 0;
    const canMoveDown = groupIndex !== -1 && groupIndex < allGroups.length - 1;

    this.closeContextMenu();

    const menuEl = document.createElement('div');
    menuEl.className = 'context-menu-dropdown';
    menuEl.style.minWidth = '180px';
    menuEl.style.width = 'max-content';
    menuEl.style.maxWidth = '240px';

    menuEl.innerHTML = `
      <button class="context-item" id="ctx-open-window">
        ${getIconSvg('externalLink', '', 13)}
        <span>Open in New Window</span>
      </button>
      <button class="context-item" id="ctx-add-site">
        ${getIconSvg('plus', '', 13)}
        <span>Add Website</span>
      </button>

      <div class="menu-divider"></div>

      ${canMoveUp ? `
        <button class="context-item" id="ctx-group-move-up">
          ${getIconSvg('arrowUp', '', 13)}
          <span>Move Position Up</span>
        </button>
      ` : ''}

      ${canMoveDown ? `
        <button class="context-item" id="ctx-group-move-down">
          ${getIconSvg('arrowDown', '', 13)}
          <span>Move Position Down</span>
        </button>
      ` : ''}

      ${canMoveUp || canMoveDown ? `<div class="menu-divider"></div>` : ''}

      <button class="context-item" id="ctx-group-toggle-links">
        ${getIconSvg(this.expandedGroupIds.has(groupId) ? 'chevronUp' : 'chevronDown', '', 13)}
        <span>${this.expandedGroupIds.has(groupId) ? 'Hide Links' : 'Show Links'}</span>
      </button>

      <button class="context-item" id="ctx-group-default-open">
        ${getIconSvg(group.defaultOpen ? 'check' : 'folder', group.defaultOpen ? 'text-accent' : '', 13)}
        <span>Default Open: <strong>${group.defaultOpen ? 'ON' : 'OFF'}</strong></span>
      </button>

      <button class="context-item" id="ctx-all-groups-default-open">
        ${getIconSvg('layers', this.data.settings?.defaultExpandGroups ? 'text-accent' : '', 13)}
        <span>Default All: <strong>${this.data.settings?.defaultExpandGroups ? 'ON' : 'OFF'}</strong></span>
      </button>

      <div class="menu-divider"></div>

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
    this.positionContextMenu(menuEl, triggerEl);
    this.setupContextMenuDismiss(menuEl);

    menuEl.querySelector('#ctx-open-window')?.addEventListener('click', () => {
      this.closeContextMenu();
      if (group.sites?.length > 0) this.openUrls(group.sites.map(s => s.url), true);
    });

    menuEl.querySelector('#ctx-add-site')?.addEventListener('click', () => {
      this.closeContextMenu();
      this.openAddWebsiteModal(groupId);
    });

    menuEl.querySelector('#ctx-group-move-up')?.addEventListener('click', async () => {
      this.closeContextMenu();
      await moveGroup(groupId, 'up');
      await this.loadStorageData();
      this.renderMainContent();
      this.showToast('Group position moved up');
    });

    menuEl.querySelector('#ctx-group-move-down')?.addEventListener('click', async () => {
      this.closeContextMenu();
      await moveGroup(groupId, 'down');
      await this.loadStorageData();
      this.renderMainContent();
      this.showToast('Group position moved down');
    });

    menuEl.querySelector('#ctx-group-toggle-links')?.addEventListener('click', async () => {
      this.closeContextMenu();
      if (this.expandedGroupIds.has(groupId)) {
        this.expandedGroupIds.delete(groupId);
      } else {
        this.expandedGroupIds.add(groupId);
      }
      await this.persistExpandedState();
      this.renderMainContent();
    });

    menuEl.querySelector('#ctx-group-default-open')?.addEventListener('click', async () => {
      this.closeContextMenu();
      const newVal = !group.defaultOpen;
      await updateGroup(groupId, { defaultOpen: newVal });
      await this.loadStorageData();
      if (newVal) {
        this.expandedGroupIds.add(groupId);
      }
      await this.persistExpandedState();
      this.renderMainContent();
      this.showToast(`"${group.name}" Default Open: ${newVal ? 'ON' : 'OFF'}`);
    });

    menuEl.querySelector('#ctx-all-groups-default-open')?.addEventListener('click', async () => {
      this.closeContextMenu();
      const currentVal = !!this.data.settings?.defaultExpandGroups;
      const newVal = !currentVal;
      const updated = await updateSettings({ defaultExpandGroups: newVal });
      this.data.settings = updated;
      if (newVal) {
        (this.data.groups || []).forEach(g => this.expandedGroupIds.add(g.id));
      } else {
        this.expandedGroupIds = new Set((this.data.groups || []).filter(g => g.defaultOpen).map(g => g.id));
      }
      await this.persistExpandedState();
      this.renderMainContent();
      this.showToast(`Default All: ${newVal ? 'ON' : 'OFF'}`);
    });

    menuEl.querySelector('#ctx-duplicate')?.addEventListener('click', async () => {
      this.closeContextMenu();
      await duplicateGroup(groupId);
      await this.loadStorageData();
      this.renderMainContent();
      this.showToast('Group duplicated');
    });

    menuEl.querySelector('#ctx-edit')?.addEventListener('click', () => {
      this.closeContextMenu();
      this.openCreateGroupModal(group);
    });

    menuEl.querySelector('#ctx-delete')?.addEventListener('click', () => {
      this.closeContextMenu();
      const doDelete = async () => {
        await deleteGroup(groupId);
        await this.loadStorageData();
        this.renderMainContent();
        this.showToast(`Group "${group.name}" deleted`);
      };

      if (this.data.settings?.confirmDelete === false) {
        doDelete();
        return;
      }

      const siteCount = (group.sites || []).length;
      this.openConfirmModal({
        title: 'Delete Group',
        message: `Delete group <strong style="color: var(--text-primary);">"${this.escapeHtml(group.name)}"</strong>?`,
        subMessage: siteCount > 0
          ? `All <strong>${siteCount}</strong> saved link${siteCount > 1 ? 's' : ''} in this group will be deleted.`
          : 'This group is currently empty.',
        badgeColor: group.color || '#6366F1',
        groupName: group.name,
        siteCount: siteCount,
        confirmText: 'Delete Group',
        confirmIcon: 'trash',
        danger: true,
        onConfirm: doDelete
      });
    });
  }

  openActiveTabContextMenu(tab, triggerEl) {
    const portal = document.getElementById('modal-portal');
    if (!portal) return;

    this.closeContextMenu();

    const menuEl = document.createElement('div');
    menuEl.className = 'context-menu-dropdown';
    menuEl.style.minWidth = '175px';
    menuEl.style.width = 'max-content';
    menuEl.style.maxWidth = '230px';

    const pinnedUrls = new Set((this.data.pinned || []).map(p => normalizeUrl(p.url)));
    const isAlreadyPinned = pinnedUrls.has(normalizeUrl(tab.url));

    menuEl.innerHTML = `
      <button class="context-item" id="ctx-tab-copy">
        ${getIconSvg('copy', '', 13)}
        <span>Copy Link URL</span>
      </button>
      <button class="context-item" id="ctx-tab-move-group">
        ${getIconSvg('folderInput', '', 13)}
        <span>Move to Group</span>
      </button>

      <div class="menu-divider"></div>

      ${!isAlreadyPinned ? `
        <button class="context-item" id="ctx-tab-pin">
          ${getIconSvg('pin', '', 13)}
          <span>Pin Website</span>
        </button>
      ` : `
        <button class="context-item" id="ctx-tab-unpin">
          ${getIconSvg('trash', '', 13)}
          <span>Unpin Website</span>
        </button>
      `}

      ${tab.id ? `
        <button class="context-item menu-danger" id="ctx-tab-close">
          ${getIconSvg('x', '', 13)}
          <span>Close Tab</span>
        </button>
      ` : ''}
    `;

    portal.appendChild(menuEl);
    this.positionContextMenu(menuEl, triggerEl);
    this.setupContextMenuDismiss(menuEl);

    menuEl.querySelector('#ctx-tab-copy')?.addEventListener('click', () => {
      this.closeContextMenu();
      if (tab.url) {
        navigator.clipboard.writeText(tab.url).then(() => {
          this.showToast('Link copied to clipboard');
        }).catch(() => {
          this.showToast('Failed to copy link', 'error');
        });
      }
    });

    menuEl.querySelector('#ctx-tab-move-group')?.addEventListener('click', () => {
      this.closeContextMenu();
      const siteObj = {
        id: `tab-${tab.id}`,
        title: tab.title || 'Untitled Tab',
        url: tab.url,
        favicon: tab.favIconUrl || tab.favicon || ''
      };
      this.openMoveToGroupModal(siteObj, 'active-tab', null);
    });

    menuEl.querySelector('#ctx-tab-pin')?.addEventListener('click', async () => {
      this.closeContextMenu();
      try {
        await addPinnedSite({
          title: tab.title,
          url: tab.url,
          favicon: tab.favIconUrl || tab.favicon
        });
        await this.loadStorageData();
        this.renderMainContent();
        this.showToast('Website pinned!');
      } catch (err) {
        this.showToast(err.message || 'Failed to pin', 'error');
      }
    });

    menuEl.querySelector('#ctx-tab-unpin')?.addEventListener('click', async () => {
      this.closeContextMenu();
      try {
        const pinItem = (this.data.pinned || []).find(p => normalizeUrl(p.url) === normalizeUrl(tab.url));
        if (pinItem) {
          const doUnpin = async () => {
            await removePinnedSite(pinItem.id);
            await this.loadStorageData();
            this.renderMainContent();
            this.showToast('Website unpinned');
          };
          if (this.data.settings?.confirmDelete) {
            this.openConfirmModal({
              title: 'Unpin Website',
              message: `Are you sure you want to unpin <strong style="color: var(--text-primary);">"${this.escapeHtml(tab.title || pinItem.title)}"</strong>?`,
              subMessage: tab.url ? this.escapeHtml(tab.url) : '',
              confirmText: 'Unpin',
              confirmIcon: 'trash',
              danger: true,
              onConfirm: doUnpin
            });
          } else {
            await doUnpin();
          }
        }
      } catch (err) {
        this.showToast(err.message || 'Failed to unpin', 'error');
      }
    });

    menuEl.querySelector('#ctx-tab-close')?.addEventListener('click', () => {
      this.closeContextMenu();
      if (tab.id && typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.remove) {
        chrome.tabs.remove(tab.id, () => {
          this.updateActiveTabs();
          setTimeout(() => {
            this.renderMainContent();
          }, 150);
          this.showToast('Tab closed');
        });
      }
    });
  }

  openSiteContextMenu(site, type, groupId, triggerEl) {
    const portal = document.getElementById('modal-portal');
    if (!portal) return;

    this.closeContextMenu();

    const isPinned = type === 'pinned';
    let canMoveUp = false;
    let canMoveDown = false;

    if (isPinned) {
      const pinnedList = this.data.pinned || [];
      const pinIndex = pinnedList.findIndex(p => p.id === site.id);
      canMoveUp = pinIndex > 0;
      canMoveDown = pinIndex !== -1 && pinIndex < pinnedList.length - 1;
    } else if (groupId) {
      const group = (this.data.groups || []).find(g => g.id === groupId);
      const siteIndex = (group?.sites || []).findIndex(s => s.id === site.id);
      canMoveUp = siteIndex > 0;
      canMoveDown = siteIndex !== -1 && siteIndex < (group?.sites || []).length - 1;
    }

    const menuEl = document.createElement('div');
    menuEl.className = 'context-menu-dropdown';
    menuEl.style.minWidth = '175px';
    menuEl.style.width = 'max-content';
    menuEl.style.maxWidth = '230px';

    menuEl.innerHTML = `
      <button class="context-item" id="ctx-site-open">
        ${getIconSvg('externalLink', '', 13)}
        <span>Open in New Tab</span>
      </button>
      <button class="context-item" id="ctx-site-copy">
        ${getIconSvg('copy', '', 13)}
        <span>Copy Link URL</span>
      </button>

      <div class="menu-divider"></div>

      ${canMoveUp ? `
        <button class="context-item" id="ctx-site-move-up">
          ${getIconSvg('arrowUp', '', 13)}
          <span>Move Position Up</span>
        </button>
      ` : ''}

      ${canMoveDown ? `
        <button class="context-item" id="ctx-site-move-down">
          ${getIconSvg('arrowDown', '', 13)}
          <span>Move Position Down</span>
        </button>
      ` : ''}

      ${isPinned ? `
        <button class="context-item" id="ctx-site-move-group">
          ${getIconSvg('folderInput', '', 13)}
          <span>Move to Group</span>
        </button>
      ` : `
        <button class="context-item" id="ctx-site-move-pinned">
          ${getIconSvg('pin', '', 13)}
          <span>Move to Pinned</span>
        </button>
        ${(this.data.groups || []).length > 1 ? `
          <button class="context-item" id="ctx-site-move-group">
            ${getIconSvg('folderInput', '', 13)}
            <span>Move to Group</span>
          </button>
        ` : ''}
      `}

      <div class="menu-divider"></div>

      <button class="context-item menu-danger" id="ctx-site-delete">
        ${getIconSvg('trash', '', 13)}
        <span>${isPinned ? 'Unpin Website' : 'Remove Site'}</span>
      </button>
    `;

    portal.appendChild(menuEl);
    this.positionContextMenu(menuEl, triggerEl);
    this.setupContextMenuDismiss(menuEl);

    menuEl.querySelector('#ctx-site-open')?.addEventListener('click', () => {
      this.closeContextMenu();
      this.openUrl(site.url);
    });

    menuEl.querySelector('#ctx-site-copy')?.addEventListener('click', () => {
      this.closeContextMenu();
      if (site.url) {
        navigator.clipboard.writeText(site.url).then(() => {
          this.showToast('Link copied to clipboard');
        }).catch(() => {
          this.showToast('Failed to copy link', 'error');
        });
      }
    });

    menuEl.querySelector('#ctx-site-move-up')?.addEventListener('click', async () => {
      this.closeContextMenu();
      if (isPinned) {
        await movePinnedSite(site.id, 'up');
        await this.loadStorageData();
        this.renderMainContent();
        this.showToast('Moved position up');
      } else if (groupId) {
        await moveSiteInGroup(groupId, site.id, 'up');
        await this.loadStorageData();
        this.renderMainContent();
        this.showToast('Moved position up');
      }
    });

    menuEl.querySelector('#ctx-site-move-down')?.addEventListener('click', async () => {
      this.closeContextMenu();
      if (isPinned) {
        await movePinnedSite(site.id, 'down');
        await this.loadStorageData();
        this.renderMainContent();
        this.showToast('Moved position down');
      } else if (groupId) {
        await moveSiteInGroup(groupId, site.id, 'down');
        await this.loadStorageData();
        this.renderMainContent();
        this.showToast('Moved position down');
      }
    });

    menuEl.querySelector('#ctx-site-move-group')?.addEventListener('click', () => {
      this.closeContextMenu();
      this.openMoveToGroupModal(site, type, groupId);
    });

    menuEl.querySelector('#ctx-site-move-pinned')?.addEventListener('click', async () => {
      this.closeContextMenu();
      if (groupId) {
        await moveGroupSiteToPinned(groupId, site.id);
        await this.loadStorageData();
        this.renderMainContent();
        this.showToast('Moved to Pinned');
      }
    });

    menuEl.querySelector('#ctx-site-delete')?.addEventListener('click', () => {
      this.closeContextMenu();
      const doDeleteSite = async () => {
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
      };

      if (this.data.settings?.confirmDelete) {
        this.openConfirmModal({
          title: isPinned ? 'Unpin Website' : 'Remove Site',
          message: `Are you sure you want to ${isPinned ? 'unpin' : 'remove'} <strong style="color: var(--text-primary);">"${this.escapeHtml(site.title)}"</strong>?`,
          subMessage: site.url ? this.escapeHtml(site.url) : '',
          confirmText: isPinned ? 'Unpin' : 'Remove',
          confirmIcon: 'trash',
          danger: true,
          onConfirm: doDeleteSite
        });
      } else {
        doDeleteSite();
      }
    });
  }

  openMoveToGroupModal(site, currentType = 'pinned', currentGroupId = null) {
    const portal = document.getElementById('modal-portal');
    if (!portal) return;

    this.closeModals();

    const groups = this.data.groups || [];
    const availableGroups = groups.filter(g => g.id !== currentGroupId);

    const modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop';
    modalEl.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 3000;
      display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    const faviconUrl = cleanFaviconUrl(site.favicon, site.url, site.title);
    const letterBadge = getLetterBadgeSvg(site.url, site.title);

    modalEl.innerHTML = `
      <div class="modal-card" style="background: var(--bg-primary); border-radius: var(--radius-lg); padding: 16px; width: 100%; max-width: 340px; box-shadow: var(--shadow-dropdown);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
            ${getIconSvg('folderInput', 'text-accent', 15)}
            <span>Move to Group</span>
          </h3>
          <button id="modal-close" class="btn-icon">${getIconSvg('x', '', 14)}</button>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-bottom: 12px;">
          <img src="${this.escapeHtml(faviconUrl)}" style="width: 16px; height: 16px; object-fit: contain; flex-shrink: 0;" onError="this.onerror=null; this.src='${letterBadge}';" alt="" />
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
            <div style="font-size: 11.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(site.title)}</div>
            <div style="font-size: 10px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(site.url)}</div>
          </div>
        </div>

        <div style="font-size: 10.5px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">Select Destination Group:</div>

        <div id="modal-group-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; margin-bottom: 12px; padding-right: 2px;">
          ${availableGroups.length === 0 ? `
            <div style="padding: 16px 8px; text-align: center; color: var(--text-muted); font-size: 11px;">
              No other groups yet. Create a new group below!
            </div>
          ` : availableGroups.map(g => `
            <button class="group-select-btn" data-group-id="${g.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer; text-align: left; transition: all var(--transition-fast);">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: ${g.color || '#6366F1'}; flex-shrink: 0;"></span>
                <span style="font-size: 11.5px; font-weight: 600; color: var(--text-primary);">${this.escapeHtml(g.name)}</span>
              </div>
              <span class="badge-count-sm">${(g.sites || []).length} sites</span>
            </button>
          `).join('')}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--border-subtle);">
          <button type="button" id="btn-create-new-group-move" class="btn-secondary btn-xs" style="gap: 5px;">
            ${getIconSvg('plus', '', 11)} New Group
          </button>
          <button type="button" id="modal-cancel" class="btn-secondary btn-xs">Cancel</button>
        </div>
      </div>
    `;

    portal.appendChild(modalEl);

    const closeModal = () => modalEl.remove();
    modalEl.querySelector('#modal-close')?.addEventListener('click', closeModal);
    modalEl.querySelector('#modal-cancel')?.addEventListener('click', closeModal);

    modalEl.querySelectorAll('.group-select-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetGroupId = btn.dataset.groupId;
        const targetGroup = groups.find(g => g.id === targetGroupId);
        try {
          if (currentType === 'pinned') {
            await movePinnedToGroup(site.id, targetGroupId);
          } else if (currentGroupId) {
            await moveSiteBetweenGroups(currentGroupId, targetGroupId, site.id);
          } else {
            await addSiteToGroup(targetGroupId, {
              title: site.title,
              url: site.url,
              favicon: site.favicon
            });
          }
          await this.loadStorageData();
          closeModal();
          this.renderMainContent();
          this.showToast(`Moved to "${targetGroup ? targetGroup.name : 'Group'}"`);
        } catch (err) {
          this.showToast(err.message || 'Failed to move website', 'error');
        }
      });
    });

    modalEl.querySelector('#btn-create-new-group-move')?.addEventListener('click', () => {
      closeModal();
      this.openCreateGroupModal(null, site, currentType, currentGroupId);
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

  openCreateGroupModal(groupToEdit = null, siteToMove = null, moveSourceType = 'pinned', moveSourceGroupId = null) {
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
          <h3 style="font-size: 13px; font-weight: 700;">${groupToEdit ? 'Edit Group' : (siteToMove ? 'Create Group & Move Link' : 'New Group')}</h3>
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

          <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-secondary); cursor: pointer; user-select: none; margin-top: 2px;">
            <input type="checkbox" id="input-group-default-open" ${groupToEdit?.defaultOpen ? 'checked' : ''} style="cursor: pointer; accent-color: var(--accent-primary); width: 14px; height: 14px;" />
            <span>Default Show Links (Keep this group open automatically)</span>
          </label>

          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
            <button type="button" id="modal-cancel" class="btn-secondary btn-xs">Cancel</button>
            <button type="submit" class="btn-primary btn-xs">${groupToEdit ? 'Save Changes' : (siteToMove ? 'Create & Move' : 'Create Group')}</button>
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
      const defaultOpen = !!modalEl.querySelector('#input-group-default-open')?.checked;

      try {
        if (groupToEdit) {
          await updateGroup(groupToEdit.id, { name, color, defaultOpen });
          if (defaultOpen) this.expandedGroupIds.add(groupToEdit.id);
        } else {
          const newGroup = await createGroup({ name, color, defaultOpen });
          if (defaultOpen) this.expandedGroupIds.add(newGroup.id);
          if (siteToMove) {
            if (moveSourceType === 'pinned') {
              await movePinnedToGroup(siteToMove.id, newGroup.id);
            } else if (moveSourceGroupId) {
              await moveSiteBetweenGroups(moveSourceGroupId, newGroup.id, siteToMove.id);
            } else {
              await addSiteToGroup(newGroup.id, {
                title: siteToMove.title,
                url: siteToMove.url,
                favicon: siteToMove.favicon
              });
            }
          }
        }
        await this.persistExpandedState();
        await this.loadStorageData();
        closeModal();
        this.renderMainContent();
        this.showToast(groupToEdit ? 'Group updated' : (siteToMove ? `Group created & moved "${siteToMove.title}"` : 'Group created'));
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

  openConfirmModal({
    title = 'Delete Confirmation',
    message = 'Are you sure you want to proceed?',
    subMessage = '',
    badgeColor = null,
    groupName = '',
    siteCount = null,
    confirmText = 'Delete',
    cancelText = 'Cancel',
    danger = true,
    confirmIcon = 'trash',
    onConfirm
  }) {
    const portal = document.getElementById('modal-portal');
    if (!portal) return;

    this.closeModals();

    const modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop';
    modalEl.style.cssText = `
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(4px); z-index: 3000;
      display: flex; align-items: center; justify-content: center; padding: 16px;
      animation: modalFadeIn 0.15s ease-out;
    `;

    modalEl.innerHTML = `
      <div class="modal-card confirm-modal-box" role="dialog" aria-modal="true" style="
        background: var(--bg-primary);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        padding: 18px 20px;
        width: 100%;
        max-width: 350px;
        box-shadow: var(--shadow-dropdown), 0 20px 25px -5px rgba(0, 0, 0, 0.35);
        animation: modalScaleUp 0.16s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-sizing: border-box;
      ">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="confirm-danger-badge" style="
              width: 38px;
              height: 38px;
              border-radius: 10px;
              background: ${danger ? 'var(--danger-light)' : 'var(--accent-light)'};
              color: ${danger ? 'var(--danger-primary)' : 'var(--accent-primary)'};
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            ">
              ${getIconSvg(confirmIcon || (danger ? 'trash' : 'alertCircle'), '', 18)}
            </div>
            <div>
              <h3 style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 0; line-height: 1.3;">
                ${this.escapeHtml(title)}
              </h3>
              <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 2px;">
                This action cannot be undone
              </div>
            </div>
          </div>
          <button id="modal-close" class="btn-icon" style="padding: 4px; border-radius: var(--radius-sm); color: var(--text-muted); cursor: pointer;" title="Close">
            ${getIconSvg('x', '', 14)}
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.5;">
            ${message}
          </div>

          ${groupName ? `
            <div class="confirm-preview-card" style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 8px 12px;
              background: var(--bg-secondary);
              border: 1px solid var(--border-subtle);
              border-radius: var(--radius-md);
            ">
              <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; max-width: 210px;">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: ${badgeColor || '#6366F1'}; flex-shrink: 0;"></span>
                <span style="font-size: 12px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${this.escapeHtml(groupName)}
                </span>
              </div>
              ${siteCount !== null ? `
                <span style="
                  font-size: 10px;
                  font-weight: 600;
                  padding: 2px 7px;
                  border-radius: var(--radius-full);
                  background: ${siteCount > 0 ? 'var(--danger-light)' : 'var(--bg-tertiary)'};
                  color: ${siteCount > 0 ? 'var(--danger-primary)' : 'var(--text-muted)'};
                  white-space: nowrap;
                ">
                  ${siteCount} ${siteCount === 1 ? 'link' : 'links'}
                </span>
              ` : ''}
            </div>
          ` : ''}

          ${subMessage ? `
            <div style="font-size: 11px; color: ${danger ? 'var(--danger-primary)' : 'var(--text-muted)'}; line-height: 1.4; display: flex; align-items: flex-start; gap: 5px;">
              <span style="flex-shrink: 0; margin-top: 1px;">${getIconSvg('alertCircle', '', 12)}</span>
              <span>${subMessage}</span>
            </div>
          ` : ''}
        </div>

        <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); cursor: pointer; user-select: none; margin-top: 2px;">
          <input type="checkbox" id="modal-dont-ask-again" style="cursor: pointer; accent-color: var(--accent-primary); width: 13px; height: 13px;" />
          <span>Don't ask confirmation again</span>
        </label>

        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--border-subtle);">
          <button type="button" id="modal-cancel-btn" class="btn-secondary btn-xs" style="padding: 6px 14px; font-weight: 500; cursor: pointer;">
            ${this.escapeHtml(cancelText)}
          </button>
          <button type="button" id="modal-confirm-btn" class="btn-xs ${danger ? 'btn-danger' : 'btn-primary'}" style="
            padding: 6px 14px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            ${danger ? 'background: var(--danger-primary); color: #fff; border: none;' : ''}
          ">
            ${getIconSvg(confirmIcon || 'trash', '', 12)}
            <span>${this.escapeHtml(confirmText)}</span>
          </button>
        </div>
      </div>
    `;

    portal.appendChild(modalEl);

    let isCleanedUp = false;
    const closeModal = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      document.removeEventListener('keydown', handleKeyDown);
      modalEl.remove();
      if (this.activeModalCleanup === closeModal) {
        this.activeModalCleanup = null;
      }
    };
    this.activeModalCleanup = closeModal;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      } else if (e.key === 'Enter') {
        if (document.activeElement?.id !== 'modal-cancel-btn') {
          e.preventDefault();
          executeConfirm();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    modalEl.querySelector('#modal-close')?.addEventListener('click', closeModal);
    modalEl.querySelector('#modal-cancel-btn')?.addEventListener('click', closeModal);

    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) {
        closeModal();
      }
    });

    const executeConfirm = async () => {
      const dontAsk = modalEl.querySelector('#modal-dont-ask-again')?.checked;
      closeModal();
      if (dontAsk) {
        try {
          await updateSettings({ confirmDelete: false });
          if (this.data && this.data.settings) {
            this.data.settings.confirmDelete = false;
          }
        } catch (err) {
          console.warn('Failed to update confirmDelete setting:', err);
        }
      }
      try {
        if (typeof onConfirm === 'function') {
          await onConfirm();
        }
      } catch (err) {
        this.showToast(err.message || 'Action failed', 'error');
      }
    };

    modalEl.querySelector('#modal-confirm-btn')?.addEventListener('click', executeConfirm);

    setTimeout(() => {
      modalEl.querySelector('#modal-confirm-btn')?.focus();
    }, 40);
  }

  closeModals() {
    this.closeContextMenu();
    if (typeof this.activeModalCleanup === 'function') {
      this.activeModalCleanup();
      this.activeModalCleanup = null;
    }
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
