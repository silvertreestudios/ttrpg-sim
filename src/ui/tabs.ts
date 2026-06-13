// ============================================================
// Tab Management
// ============================================================

export type TabId = 'dpr-curve' | 'burst' | 'hex' | 'mook' | 'surprise';

export type TabChangeCallback = (tabId: TabId) => void;

let _currentTab: TabId = 'dpr-curve';
let _onTabChange: TabChangeCallback;

export function initTabs(onTabChange: TabChangeCallback): void {
  _onTabChange = onTabChange;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = (btn as HTMLElement).dataset.tab as TabId;
      if (tabId) switchTab(tabId);
    });
  });
}

export function switchTab(tabId: TabId): void {
  _currentTab = tabId;

  // Update button states
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = (btn as HTMLElement).dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
  });

  // Update tab content visibility
  document.querySelectorAll('.tab-content').forEach(content => {
    const isActive = content.id === `tab-${tabId}`;
    content.classList.toggle('active', isActive);
  });

  _onTabChange(tabId);
}

export function getCurrentTab(): TabId {
  return _currentTab;
}
