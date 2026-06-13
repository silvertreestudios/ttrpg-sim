// ============================================================
// Tab Management
// ============================================================
let _currentTab = 'dpr-curve';
let _onTabChange;
export function initTabs(onTabChange) {
    _onTabChange = onTabChange;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            if (tabId)
                switchTab(tabId);
        });
    });
}
export function switchTab(tabId) {
    _currentTab = tabId;
    // Update button states
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const isActive = btn.dataset.tab === tabId;
        btn.classList.toggle('active', isActive);
    });
    // Update tab content visibility
    document.querySelectorAll('.tab-content').forEach(content => {
        const isActive = content.id === `tab-${tabId}`;
        content.classList.toggle('active', isActive);
    });
    _onTabChange(tabId);
}
export function getCurrentTab() {
    return _currentTab;
}
