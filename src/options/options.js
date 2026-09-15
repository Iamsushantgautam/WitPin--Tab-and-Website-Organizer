/**
 * WitPin - Pure Vanilla JS Options & Settings Page with Sidebar Navigation
 * Fast, privacy-first, 100% dependency-free
 */

import {
  getData,
  updateSettings,
  exportData,
  exportHTMLBookmarks,
  exportTextList,
  importData,
  resetData,
  unlinkChromeGroup,
  normalizeUrl
} from '../utils/storage.js';

import { getIconSvg } from '../utils/icons.js';
import { cleanFaviconUrl, getLetterBadgeSvg, getDomain } from '../utils/favicon.js';

class WitPinOptions {
  constructor() {
    this.root = document.getElementById('root');
    this.data = null;
    this.loading = true;
    this.activeTab = 'dashboard'; // 'dashboard' | 'settings' | 'import-export'
    this.expandedDashboardGroupIds = new Set();
    this.toastTimer = null;

    this.init();
  }

  async init() {
    this.renderLoading();
    await this.loadData();
    this.applyTheme();
    this.render();
  }

  async loadData() {
    try {
      this.data = await getData();
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      this.loading = false;
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
      <div style="height: 100vh; display: flex; align-items: center; justify-content: center; font-size: 14px; color: var(--text-muted);">
        Loading witPin Options...
      </div>
    `;
  }

  render() {
    if (this.loading || !this.data) {
      this.renderLoading();
      return;
    }

    this.root.innerHTML = `
      <div class="options-app-layout">
        <!-- Sidebar Navigation -->
        <aside class="options-sidebar">
          <div class="sidebar-top">
            <div class="sidebar-brand">
              <div class="logo-icon-badge" style="width: 32px; height: 32px; border-radius: 8px; background: var(--accent-primary); display: flex; align-items: center; justify-content: center; color: white;">
                ${getIconSvg('pin', '', 18)}
              </div>
              <div>
                <div class="sidebar-brand-title">witPin</div>
                <div class="sidebar-brand-sub">Workspace Organizer</div>
              </div>
            </div>

            <nav class="sidebar-nav">
              <button class="nav-item ${this.activeTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">
                ${getIconSvg('layers', this.activeTab === 'dashboard' ? 'text-accent' : '', 16)}
                <span>Dashboard</span>
              </button>

              <button class="nav-item ${this.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">
                ${getIconSvg('settings', this.activeTab === 'settings' ? 'text-accent' : '', 16)}
                <span>Settings</span>
              </button>

              <button class="nav-item ${this.activeTab === 'import-export' ? 'active' : ''}" data-tab="import-export">
                ${getIconSvg('download', this.activeTab === 'import-export' ? 'text-accent' : '', 16)}
                <span>Import & Export</span>
              </button>
            </nav>
          </div>

          <div class="sidebar-footer">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted);">
              ${getIconSvg('shieldCheck', 'text-success', 14)}
              <span>Privacy First (Local)</span>
            </div>
          </div>
        </aside>

        <!-- Main Content Area -->
        <main class="options-main-container">
          ${this.renderTabContent()}
        </main>
      </div>
    `;

    this.bindEvents();
  }

  renderTabContent() {
    if (this.activeTab === 'dashboard') {
      return this.renderDashboardTab();
    }
    if (this.activeTab === 'settings') {
      return this.renderSettingsTab();
    }
    if (this.activeTab === 'import-export') {
      return this.renderImportExportTab();
    }
    return '';
  }

  renderDashboardTab() {
    const { pinned = [], groups = [] } = this.data;
    const pinnedCount = pinned.length;
    const groupsCount = groups.length;
    const totalLinks = pinnedCount + groups.reduce((acc, g) => acc + (g.sites ? g.sites.length : 0), 0);
    const linkedGroups = groups.filter(g => g.chromeGroupId);

    return `
      <div class="dash-tab-header">
        <div>
          <h1 class="dash-title">Dashboard Overview</h1>
          <p class="dash-subtitle">Real-time statistics, workspace management, and active browser tab links.</p>
        </div>
      </div>

      <!-- Modern Borderless Stat Cards -->
      <div class="dash-stats-grid">
        <div class="dash-stat-card accent-indigo">
          <div class="dash-stat-content">
            <span class="dash-stat-label">Pinned Sites</span>
            <div class="dash-stat-value">${pinnedCount}</div>
            <span class="dash-stat-sub">1-click shortcuts</span>
          </div>
          <div class="dash-stat-icon-badge icon-indigo">
            ${getIconSvg('pin', '', 18)}
          </div>
        </div>

        <div class="dash-stat-card accent-purple">
          <div class="dash-stat-content">
            <span class="dash-stat-label">Saved Workspaces</span>
            <div class="dash-stat-value">${groupsCount}</div>
            <span class="dash-stat-sub">Organized tab groups</span>
          </div>
          <div class="dash-stat-icon-badge icon-purple">
            ${getIconSvg('folder', '', 18)}
          </div>
        </div>

        <div class="dash-stat-card accent-emerald">
          <div class="dash-stat-content">
            <span class="dash-stat-label">Total Links</span>
            <div class="dash-stat-value">${totalLinks}</div>
            <span class="dash-stat-sub">Saved web links</span>
          </div>
          <div class="dash-stat-icon-badge icon-emerald">
            ${getIconSvg('layers', '', 18)}
          </div>
        </div>

        <div class="dash-stat-card accent-amber">
          <div class="dash-stat-content">
            <span class="dash-stat-label">Chrome Sync</span>
            <div class="dash-stat-value">${linkedGroups.length}</div>
            <span class="dash-stat-sub">Linked Tab Groups</span>
          </div>
          <div class="dash-stat-icon-badge icon-amber">
            ${getIconSvg('link', '', 18)}
          </div>
        </div>
      </div>

      <!-- Workspaces & Groups Section (Borderless Table/List) -->
      <div class="dash-section-wrapper">
        <div class="dash-section-header">
          <div class="dash-section-title">
            ${getIconSvg('folder', 'text-accent', 18)}
            <h2>Your Workspaces & Groups</h2>
            <span class="badge-count-accent">${groupsCount}</span>
          </div>
        </div>

        ${groupsCount === 0 ? `
          <div class="empty-state-container" style="padding: 40px 20px;">
            <div class="empty-state-icon-box">${getIconSvg('folder', '', 24)}</div>
            <div class="empty-state-heading">No Workspaces Created Yet</div>
            <div class="empty-state-subtext">Use the WitPin browser popup to group open tabs into organized workspaces.</div>
          </div>
        ` : `
          <div class="dash-table-container">
            <div class="dash-table-header">
              <span class="th-cell th-name">Workspace</span>
              <span class="th-cell th-preview">Links Preview</span>
              <span class="th-cell th-count">Count</span>
              <span class="th-cell th-status">Status</span>
              <span class="th-cell th-actions">Actions</span>
            </div>

            <div class="dash-table-body">
              ${groups.map(group => {
                const isExpanded = this.expandedDashboardGroupIds.has(group.id);
                const sites = group.sites || [];
                const previewSites = sites.slice(0, 4);
                const extraCount = sites.length - 4;

                return `
                  <div class="dash-row-wrapper ${isExpanded ? 'is-expanded' : ''}">
                    <div class="dash-table-row">
                      <div class="td-cell td-name">
                        <span class="group-color-dot" style="background-color: ${group.color || '#6366F1'};"></span>
                        <span class="dash-group-name">${this.escapeHtml(group.name)}</span>
                      </div>

                      <div class="td-cell td-preview">
                        ${sites.length === 0 ? `
                          <span style="font-size: 11px; color: var(--text-muted);">Empty workspace</span>
                        ` : `
                          <div class="favicon-stack">
                            ${previewSites.map(s => `
                              <img
                                class="stack-favicon"
                                src="${this.escapeHtml(cleanFaviconUrl(s.favicon, s.url, s.title))}"
                                onError="this.onerror=null; this.src='${getLetterBadgeSvg(s.url, s.title)}';"
                                title="${this.escapeHtml(s.title)}"
                                alt=""
                              />
                            `).join('')}
                            ${extraCount > 0 ? `<span class="stack-more">+${extraCount}</span>` : ''}
                          </div>
                        `}
                      </div>

                      <div class="td-cell td-count">
                        <span class="badge-count-sm">${sites.length} sites</span>
                      </div>

                      <div class="td-cell td-status">
                        ${group.chromeGroupId ? `
                          <span class="status-pill status-active" title="Linked to Chrome Tab Group">
                            <span class="active-pulse-dot"></span> Linked
                          </span>
                        ` : `
                          <span class="status-pill status-local">Local</span>
                        `}
                      </div>

                      <div class="td-cell td-actions">
                        ${sites.length > 0 ? `
                          <button class="btn-secondary btn-xs" data-action="dash-open-all" data-group-id="${group.id}">
                            ${getIconSvg('externalLink', '', 12)} Open All
                          </button>
                        ` : ''}
                        <button class="btn-secondary btn-xs" data-action="dash-toggle-expand" data-group-id="${group.id}">
                          ${getIconSvg(isExpanded ? 'chevronUp' : 'chevronDown', '', 12)} ${isExpanded ? 'Hide' : 'Inspect'}
                        </button>
                      </div>
                    </div>

                    ${isExpanded ? `
                      <div class="dash-expand-drawer">
                        ${sites.length === 0 ? `
                          <div style="padding: 12px; font-size: 11px; color: var(--text-muted); text-align: center;">Workspace is empty.</div>
                        ` : `
                          <div class="dash-links-list">
                            ${sites.map(s => `
                              <div class="dash-link-item" data-url="${this.escapeHtml(s.url)}">
                                <img
                                  class="site-favicon-sm"
                                  src="${this.escapeHtml(cleanFaviconUrl(s.favicon, s.url, s.title))}"
                                  onError="this.onerror=null; this.src='${getLetterBadgeSvg(s.url, s.title)}';"
                                  alt=""
                                />
                                <div class="site-text-details">
                                  <span class="site-title-link" title="${this.escapeHtml(s.title)}">${this.escapeHtml(s.title)}</span>
                                  <span class="site-url-subtext" title="${this.escapeHtml(s.url)}">${this.escapeHtml(s.url || getDomain(s.url))}</span>
                                </div>
                                <button class="btn-secondary btn-xs" data-action="dash-open-url" data-url="${this.escapeHtml(s.url)}">
                                  ${getIconSvg('externalLink', '', 11)} Open
                                </button>
                              </div>
                            `).join('')}
                          </div>
                        `}
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `}
      </div>

      <!-- Keyboard Hotkeys & System Info Bar -->
      <div class="dash-footer-bar">
        <div class="dash-footer-item">
          ${getIconSvg('keyboard', 'text-accent', 14)}
          <span class="dash-hotkey-label">Open Popup:</span>
          <kbd>Alt + Shift + P</kbd>
        </div>
        <div class="dash-footer-item">
          <span class="dash-hotkey-label">Save Tab:</span>
          <kbd>Alt + Shift + S</kbd>
        </div>
        <div class="dash-footer-item">
          <span class="dash-hotkey-label">Save Workspace:</span>
          <kbd>Alt + Shift + G</kbd>
        </div>
      </div>
    `;
  }

  renderSettingsTab() {
    const { settings = {} } = this.data;

    return `
      <div class="tab-header">
        <h1>Settings & Preferences</h1>
        <p>Configure extension theme mode and navigation behavior preferences.</p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Appearance Card -->
        <div class="options-card">
          <div class="options-card-header">
            ${getIconSvg('sun', 'text-accent', 18)}
            <h2>Appearance Mode</h2>
          </div>
          <div class="options-card-body">
            <label class="options-label">Theme Preference</label>
            <div class="theme-options-grid">
              <button
                id="btn-theme-system"
                class="theme-card ${settings.theme === 'system' ? 'selected' : ''}"
              >
                ${getIconSvg('laptop', settings.theme === 'system' ? 'text-accent' : '', 20)}
                <strong style="color: ${settings.theme === 'system' ? 'var(--accent-primary)' : 'var(--text-primary)'};">System</strong>
              </button>

              <button
                id="btn-theme-light"
                class="theme-card ${settings.theme === 'light' ? 'selected' : ''}"
              >
                ${getIconSvg('sun', settings.theme === 'light' ? 'text-accent' : '', 20)}
                <strong style="color: ${settings.theme === 'light' ? 'var(--accent-primary)' : 'var(--text-primary)'};">Light</strong>
              </button>

              <button
                id="btn-theme-dark"
                class="theme-card ${settings.theme === 'dark' ? 'selected' : ''}"
              >
                ${getIconSvg('moon', settings.theme === 'dark' ? 'text-accent' : '', 20)}
                <strong style="color: ${settings.theme === 'dark' ? 'var(--accent-primary)' : 'var(--text-primary)'};">Dark</strong>
              </button>
            </div>
          </div>
        </div>

        <!-- Behavior Card -->
        <div class="options-card">
          <div class="options-card-header">
            ${getIconSvg('pin', 'text-accent', 18)}
            <h2>Behavior & Navigation</h2>
          </div>
          <div class="options-card-body">
            <label class="checkbox-setting-row">
              <input type="checkbox" id="chk-open-newtab" ${settings.openInNewTab ? 'checked' : ''} />
              <div class="setting-row-text">
                <strong>Open links in new tab</strong>
                <span>When clicking a pinned site or group link, open it in a new browser tab</span>
              </div>
            </label>

            <label class="checkbox-setting-row">
              <input type="checkbox" id="chk-autoclose" ${settings.autoCloseAfterSave ? 'checked' : ''} />
              <div class="setting-row-text">
                <strong>Automatically close tabs after saving</strong>
                <span>Close saved tabs when saving a workspace group</span>
              </div>
            </label>

            <label class="checkbox-setting-row">
              <input type="checkbox" id="chk-confirmdelete" ${settings.confirmDelete ? 'checked' : ''} />
              <div class="setting-row-text">
                <strong>Confirm before deleting groups & items</strong>
                <span>Prompt for confirmation before unpinning sites or deleting groups</span>
              </div>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  renderImportExportTab() {
    const pinnedCount = (this.data.pinned || []).length;
    const groupsCount = (this.data.groups || []).length;
    const totalLinks = pinnedCount + (this.data.groups || []).reduce((acc, g) => acc + (g.sites ? g.sites.length : 0), 0);

    return `
      <div class="tab-header">
        <h1>Import & Export Data</h1>
        <p>Backup your extension data, export to browser HTML bookmarks, or restore from a JSON backup file.</p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 20px;">
        
        <!-- Multi-Format Export Card -->
        <div class="options-card">
          <div class="options-card-header">
            ${getIconSvg('download', 'text-accent', 18)}
            <h2>Export Bookmarks & Data</h2>
          </div>
          <div class="options-card-body">
            <p class="setting-desc">
              Choose your preferred format to export saved websites, groups, and settings.
            </p>

            <div style="display: flex; gap: 12px; padding: 10px 14px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); font-size: 11.5px; align-items: center; justify-content: space-around;">
              <div style="display: flex; align-items: center; gap: 6px;">
                ${getIconSvg('pin', 'text-accent', 14)}
                <strong style="color: var(--text-primary);">${pinnedCount}</strong>
                <span style="color: var(--text-secondary);">Pinned Sites</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                ${getIconSvg('folder', 'text-purple', 14)}
                <strong style="color: var(--text-primary);">${groupsCount}</strong>
                <span style="color: var(--text-secondary);">Groups</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                ${getIconSvg('layers', 'text-emerald', 14)}
                <strong style="color: var(--text-primary);">${totalLinks}</strong>
                <span style="color: var(--text-secondary);">Total Saved Links</span>
              </div>
            </div>

            <div class="data-action-buttons" style="margin-top: 4px;">
              <button id="btn-export-data" class="btn-secondary" title="Export full extension backup file">
                ${getIconSvg('download', '', 14)} Export JSON Backup
              </button>

              <button id="btn-export-html" class="btn-secondary" title="Export as HTML file importable into Chrome / Edge / Firefox Bookmarks">
                ${getIconSvg('externalLink', '', 14)} Export HTML Bookmarks
              </button>

              <button id="btn-export-text" class="btn-secondary" title="Export as plain text list">
                ${getIconSvg('copy', '', 14)} Export Text List
              </button>
            </div>
          </div>
        </div>

        <!-- Import Data Card -->
        <div class="options-card">
          <div class="options-card-header">
            ${getIconSvg('upload', 'text-accent', 18)}
            <h2>Import & Restore Data</h2>
          </div>
          <div class="options-card-body">
            <p class="setting-desc">
              Restore your bookmarks, groups, and extension settings from a previously exported JSON backup file.
            </p>

            <div class="data-action-buttons">
              <button id="btn-import-trigger" class="btn-primary">
                ${getIconSvg('upload', '', 14)} Import Backup JSON
              </button>
              <input type="file" id="file-import-input" accept=".json" style="display: none;" />
            </div>
          </div>
        </div>

        <!-- Reset Data Card -->
        <div class="options-card" style="border-color: rgba(239, 68, 68, 0.3);">
          <div class="options-card-header">
            ${getIconSvg('rotateCcw', 'text-danger', 18)}
            <h2 style="color: var(--danger-primary);">Reset Extension Data</h2>
          </div>
          <div class="options-card-body">
            <p class="setting-desc">
              Permanently clear all saved pinned websites, workspaces, groups, and customized settings.
            </p>

            <div class="data-action-buttons">
              <button id="btn-reset-data" class="btn-danger">
                ${getIconSvg('rotateCcw', '', 14)} Reset All Extension Data
              </button>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  bindEvents() {
    // Sidebar Tab Navigation Buttons
    this.root.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTab = btn.dataset.tab;
        if (targetTab && this.activeTab !== targetTab) {
          this.activeTab = targetTab;
          this.render();
        }
      });
    });

    // Theme buttons (Settings Tab)
    document.getElementById('btn-theme-system')?.addEventListener('click', () => this.setTheme('system'));
    document.getElementById('btn-theme-light')?.addEventListener('click', () => this.setTheme('light'));
    document.getElementById('btn-theme-dark')?.addEventListener('click', () => this.setTheme('dark'));

    // Checkboxes (Settings Tab)
    document.getElementById('chk-open-newtab')?.addEventListener('change', (e) => {
      this.updateSetting('openInNewTab', e.target.checked);
    });
    document.getElementById('chk-autoclose')?.addEventListener('change', (e) => {
      this.updateSetting('autoCloseAfterSave', e.target.checked);
    });
    document.getElementById('chk-confirmdelete')?.addEventListener('change', (e) => {
      this.updateSetting('confirmDelete', e.target.checked);
    });

    // Dashboard Table Action Handlers
    this.root.querySelectorAll('[data-action="dash-open-all"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const gId = btn.dataset.groupId;
        const group = (this.data.groups || []).find(g => g.id === gId);
        if (group && group.sites?.length > 0) {
          group.sites.forEach(s => {
            const validUrl = normalizeUrl(s.url);
            if (validUrl) {
              if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
                chrome.tabs.create({ url: validUrl, active: false });
              } else {
                window.open(validUrl, '_blank');
              }
            }
          });
          this.showToast(`Opened ${group.sites.length} tabs`);
        }
      });
    });

    this.root.querySelectorAll('[data-action="dash-toggle-expand"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const gId = btn.dataset.groupId;
        if (this.expandedDashboardGroupIds.has(gId)) {
          this.expandedDashboardGroupIds.delete(gId);
        } else {
          this.expandedDashboardGroupIds.add(gId);
        }
        this.render();
      });
    });

    this.root.querySelectorAll('[data-action="dash-open-url"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        const validUrl = normalizeUrl(url);
        if (validUrl) {
          if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: validUrl, active: true });
          } else {
            window.open(validUrl, '_blank');
          }
        }
      });
    });

    // Linked Chrome Tab Group Unlinking (Dashboard Tab)
    this.root.querySelectorAll('[data-action="unlink-group"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const gId = btn.dataset.groupId;
        await unlinkChromeGroup(gId);
        await this.loadData();
        this.render();
        this.showToast('Unlinked group from Chrome Tab Group');
      });
    });

    // Export JSON Data
    document.getElementById('btn-export-data')?.addEventListener('click', async () => {
      try {
        const jsonStr = await exportData();
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `witpin_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.showToast('JSON Backup exported!');
      } catch (err) {
        this.showToast('Failed to export JSON data.', 'error');
      }
    });

    // Export HTML Bookmarks
    document.getElementById('btn-export-html')?.addEventListener('click', async () => {
      try {
        const htmlStr = await exportHTMLBookmarks();
        const blob = new Blob([htmlStr], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `witpin_bookmarks_${new Date().toISOString().slice(0, 10)}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.showToast('HTML Bookmarks exported!');
      } catch (err) {
        this.showToast('Failed to export HTML bookmarks.', 'error');
      }
    });

    // Export Text List
    document.getElementById('btn-export-text')?.addEventListener('click', async () => {
      try {
        const textStr = await exportTextList();
        const blob = new Blob([textStr], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `witpin_links_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.showToast('Text list exported!');
      } catch (err) {
        this.showToast('Failed to export text list.', 'error');
      }
    });

    // Import Data
    const fileInput = document.getElementById('file-import-input');
    document.getElementById('btn-import-trigger')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result;
          this.data = await importData(content);
          this.applyTheme();
          this.render();
          this.showToast('Data imported successfully!');
        } catch (err) {
          this.showToast(err.message || 'Invalid JSON file.', 'error');
        } finally {
          fileInput.value = '';
        }
      };
      reader.readAsText(file);
    });

    // Reset Data
    document.getElementById('btn-reset-data')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all witPin data? All saved pinned sites and groups will be cleared.')) {
        this.data = await resetData();
        this.applyTheme();
        this.render();
        this.showToast('Extension data reset to default');
      }
    });
  }

  async setTheme(themeMode) {
    const updated = await updateSettings({ theme: themeMode });
    this.data.settings = updated;
    this.applyTheme();
    this.render();
    this.showToast(`Theme changed to ${themeMode}`);
  }

  async updateSetting(key, val) {
    const updated = await updateSettings({ [key]: val });
    this.data.settings = updated;
    this.showToast('Settings saved');
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

document.addEventListener('DOMContentLoaded', () => {
  new WitPinOptions();
});
