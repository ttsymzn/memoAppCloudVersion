// App State
let memos = [];
let tags = [];
let activeTagFilter = null;
let searchQuery = '';
let currentEditingMemoId = null;
let expandedMemoIds = new Set();
let currentView = 'all'; // 'all' or 'archived'
let selectedMemoIndex = -1;
let displayedMemoIds = [];

// DOM Elements
const memoGrid = document.getElementById('memo-grid');
const tagList = document.getElementById('tag-list');
const globalSearch = document.getElementById('global-search');
const memoEditor = document.getElementById('memo-editor');
const memoTextarea = document.getElementById('memo-textarea');
const saveMemoBtn = document.getElementById('save-memo');
const closeEditorBtn = document.getElementById('close-editor');
const newMemoBtn = document.getElementById('new-memo-btn');
const deleteMemoBtn = document.getElementById('delete-memo');

// Tag Editor DOM
const addTagBtn = document.getElementById('add-tag-btn');
const tagEditorModal = document.getElementById('tag-editor-modal');
const tagNameInput = document.getElementById('tag-name-input');
const tagGroupInput = document.getElementById('tag-group-input');
const tagSortInput = document.getElementById('tag-sort-input');
const saveTagEditBtn = document.getElementById('save-tag-edit');
const cancelTagEditBtn = document.getElementById('cancel-tag-edit');
const deleteTagConfirmBtn = document.getElementById('delete-tag-confirm');
const colorOptions = document.querySelectorAll('.color-option');
const memoTagsEditor = document.getElementById('memo-tags-editor');

// Help Modal DOM
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeHelpBtn = document.getElementById('close-help');

// Quick Tag Creator DOM
const quickTagName = document.getElementById('quick-tag-name');
const quickTagGroup = document.getElementById('quick-tag-group');
const quickAddTagBtn = document.getElementById('quick-add-tag-btn');
const saveStatus = document.getElementById('save-status');

// CSV Import/Export DOM
const exportCsvBtn = document.getElementById('export-csv-btn');
const importCsvBtn = document.getElementById('import-csv-btn');
const csvImportInput = document.getElementById('csv-import-input');

// Tag Group Editor DOM
const tagGroupEditorModal = document.getElementById('tag-group-editor-modal');
const tagGroupNameInput = document.getElementById('tag-group-name-input');
const saveTagGroupEditBtn = document.getElementById('save-tag-group-edit');
const cancelTagGroupEditBtn = document.getElementById('cancel-tag-group-edit');

let selectedTagsForMemo = [];
let currentEditingTagId = null;
let currentEditingGroupName = null;
let selectedTagColor = '#3b82f6';
let collapsedGroups = new Set();
let autoSaveTimeout = null;
let currentMemoIsPublic = false;

// DOM Elements - Auth
const authScreen = document.getElementById('auth-screen');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email-input');
const loginBtn = document.getElementById('login-btn');
const authMessage = document.getElementById('auth-message');
const userInfoDisplay = document.getElementById('user-info-display');
const userAvatar = document.getElementById('user-avatar');
const userEmailDisplay = document.getElementById('user-email-display');
const logoutBtn = document.getElementById('logout-btn');
const togglePublicBtn = document.getElementById('toggle-public-btn');
const publicIcon = document.getElementById('public-icon');
const publicText = document.getElementById('public-text');

const viewAllBtn = document.getElementById('view-all');
const viewArchivedBtn = document.getElementById('view-archived');
const filterInfo = document.getElementById('filter-info');

// Modal Actions DOM
const modalArchiveBtn = document.getElementById('modal-archive-btn');
const modalPinBtn = document.getElementById('modal-pin-btn');
const modalCopyBtn = document.getElementById('modal-copy-btn');
const modalPrintBtn = document.getElementById('modal-print-btn');
const headerActionGroup = document.querySelector('.header-action-group');

// Mobile UI Elements
const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
const closeSidebarBtn = document.getElementById('close-sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebar = document.querySelector('.sidebar');
const editorResizer = document.getElementById('editor-resizer');
const editorBody = document.querySelector('.editor-body');

// Initialize
async function init() {
    const client = window.getSupabase();
    if (!client) {
        // Show setup instructions if config is empty
        memoGrid.innerHTML = `
            <div class="setup-notice glass-premium">
                <h3>Supabaseの連携が必要です</h3>
                <p><code>index.html</code> の <code>SUPABASE_CONFIG</code> にプロジェクトのURLとAPIキーを入力してください。</p>
            </div>
        `;
        return;
    }

    // Initialize auth manager
    await window.authManager.init();

    // Set up auth state change handler
    window.authManager.onAuthStateChange = (user) => {
        if (user) {
            onUserLoggedIn();
        } else {
            onUserLoggedOut();
        }
    };

    // Check if user is already logged in
    if (window.authManager.isAuthenticated()) {
        onUserLoggedIn();
    } else {
        onUserLoggedOut();
    }

    initResizer();
}

async function onUserLoggedIn() {
    authScreen.classList.add('hidden');
    userInfoDisplay.classList.remove('hidden');
    userAvatar.textContent = window.authManager.getInitial();
    userEmailDisplay.textContent = window.authManager.getUserEmail();

    await fetchData();
    render();
}

function onUserLoggedOut() {
    authScreen.classList.remove('hidden');
    userInfoDisplay.classList.add('hidden');
    memos = [];
    tags = [];
    render();
}

async function fetchData() {
    const client = window.getSupabase();

    // Fetch tags first - ordered by group then sort_order
    const { data: tagsData, error: tagsError } = await client.from('tags')
        .select('*')
        .order('tag_group', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

    if (tagsError) {
        console.error("Tags fetch error:", tagsError.message);
    } else {
        tags = tagsData;
    }

    // Fetch memos
    const { data: memosData, error: memosError } = await client.from('memos').select('*').order('updated_at', { ascending: false });
    if (memosError) {
        console.error("Memos fetch error:", memosError.message);
    } else {
        memos = memosData;
    }
}

function render() {
    renderTags();
    renderMemos();
    lucide.createIcons();
}

function renderTags() {
    tagList.innerHTML = `
        <li class="tag-item ${!activeTagFilter ? 'active' : ''}" onclick="setTagFilter(null)">
            <div class="tag-dot" style="background: #fff"></div>
            <span>All</span>
        </li>
    `;

    // Group tags
    const groups = {};
    tags.forEach(tag => {
        const g = tag.tag_group || 'General';
        if (!groups[g]) groups[g] = [];
        groups[g].push(tag);
    });

    Object.keys(groups).sort().forEach(groupName => {
        const isCollapsed = collapsedGroups.has(groupName);
        const groupTags = groups[groupName];

        const groupHeader = document.createElement('li');
        groupHeader.className = `tag-group-header ${isCollapsed ? 'collapsed' : ''}`;
        groupHeader.onclick = () => toggleGroup(groupName);
        groupHeader.innerHTML = `
            <span>${groupName}</span>
            <button class="edit-group-btn" onclick="event.stopPropagation(); openTagGroupEditor('${groupName}')">
                <i data-lucide="settings-2" style="width: 12px; height: 12px;"></i>
            </button>
            <i data-lucide="chevron-down" class="chevron" style="width: 12px; height: 12px;"></i>
        `;
        tagList.appendChild(groupHeader);

        const groupContainer = document.createElement('div');
        groupContainer.className = `tag-group-items ${isCollapsed ? 'collapsed' : ''}`;

        groupTags.forEach(tag => {
            const tagItem = document.createElement('li');
            tagItem.className = `tag-item ${activeTagFilter == tag.id ? 'active' : ''}`;
            tagItem.onclick = () => setTagFilter(tag.id);
            tagItem.innerHTML = `
                <div class="tag-dot" style="background: ${tag.color}"></div>
                <span>${tag.name}</span>
                <button class="edit-tag-btn" onclick="event.stopPropagation(); openTagEditor('${tag.id}')">
                    <i data-lucide="settings-2" style="width: 12px; height: 12px;"></i>
                </button>
            `;
            groupContainer.appendChild(tagItem);
        });

        tagList.appendChild(groupContainer);
    });

    lucide.createIcons();
}

function saveUIState() {
    const state = {
        expandedMemoIds: Array.from(expandedMemoIds),
        collapsedGroups: Array.from(collapsedGroups),
        currentView: currentView,
        activeTagFilter: activeTagFilter
    };
    localStorage.setItem('memo_app_ui_state', JSON.stringify(state));
}

function loadUIState() {
    const saved = localStorage.getItem('memo_app_ui_state');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            if (state.expandedMemoIds) expandedMemoIds = new Set(state.expandedMemoIds);
            if (state.collapsedGroups) collapsedGroups = new Set(state.collapsedGroups);
            if (state.currentView) {
                currentView = state.currentView;
                // Update UI for current view
                updateSidebarActiveState();
            }
            if (state.activeTagFilter) activeTagFilter = state.activeTagFilter;
        } catch (e) {
            console.error("Failed to load UI state:", e);
        }
    }
}

function updateSidebarActiveState() {
    if (currentView === 'archived') {
        viewArchivedBtn.classList.add('active');
        viewAllBtn.classList.remove('active');
    } else {
        viewAllBtn.classList.add('active');
        viewArchivedBtn.classList.remove('active');
    }
}

window.toggleGroup = function (groupName) {
    if (collapsedGroups.has(groupName)) {
        collapsedGroups.delete(groupName);
    } else {
        collapsedGroups.add(groupName);
    }
    saveUIState();
    renderTags();
};

function renderMemos() {
    let filtered = memos;

    // Filter by Archive status
    if (currentView === 'archived') {
        filtered = filtered.filter(m => m.is_archived === true);
        filterInfo.textContent = 'Archived Memos';
    } else {
        filtered = filtered.filter(m => !m.is_archived);
        filterInfo.textContent = 'Inbox';
    }

    // Apply tag filter
    if (activeTagFilter) {
        filtered = filtered.filter(m => m.tags && m.tags.some(tid => tid == activeTagFilter));
    }

    // Apply search
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(m => {
            const hasText = m.content.toLowerCase().includes(query);
            const matchingTags = tags.filter(t => t.name.toLowerCase().includes(query)).map(t => t.id);
            const hasTag = m.tags && m.tags.some(tid => matchingTags.includes(tid));

            // Date search
            const createdDate = m.created_at ? new Date(m.created_at).toLocaleDateString('ja-JP', {
                year: 'numeric', month: '2-digit', day: '2-digit'
            }) : '';
            const updatedDate = m.updated_at ? new Date(m.updated_at).toLocaleDateString('ja-JP', {
                year: 'numeric', month: '2-digit', day: '2-digit'
            }) : '';
            const hasDate = createdDate.includes(query) || updatedDate.includes(query);

            return hasText || hasTag || hasDate;
        });
    }

    // Sort: Pinned first
    filtered.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.updated_at) - new Date(a.updated_at);
    });

    displayedMemoIds = filtered.map(m => m.id);

    if (filtered.length === 0) {
        memoGrid.innerHTML = `<div class="empty-state">メモが見つかりません</div>`;
        return;
    }

    memoGrid.innerHTML = filtered.map((memo, index) => {
        const lines = memo.content.split('\n');
        const title = lines[0] || 'Untitled';
        const bodyContent = lines.slice(1).join('\n');

        const isPinned = memo.is_pinned || false;
        const isExpanded = searchQuery.trim() !== '' || expandedMemoIds.has(memo.id);
        const isSelected = index === selectedMemoIndex;

        // Highlighting
        const highlightedTitle = highlightMatch(title, searchQuery);
        const highlightedBody = highlightMatch(bodyContent, searchQuery);

        // Format dates
        const createdDate = memo.created_at ? new Date(memo.created_at).toLocaleDateString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        }) : '';
        const updatedDate = memo.updated_at ? new Date(memo.updated_at).toLocaleDateString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        }) : '';

        // Get user email
        const userEmail = memo.user_id ? (window.authManager.getUserEmail() || '').split('@')[0] : '';

        // Build tags HTML
        const tagsHTML = (memo.tags || []).map(tid => {
            const tag = tags.find(t => t.id === tid);
            if (!tag) return '';
            return `<span class="badge" style="border-color: ${tag.color}">${tag.name}</span>`;
        }).join('');

        return `
            <div class="memo-card glass ${isPinned ? 'pinned' : ''} ${isExpanded ? 'expanded' : 'collapsed'} ${isSelected ? 'selected' : ''}" 
                 id="memo-${memo.id}" 
                 onclick="toggleMemoContent('${memo.id}')" 
                 ondblclick="openEditor('${memo.id}')"
                 style="background: ${memo.color}">
                
                ${isPinned ? '<div class="pin-indicator"><i data-lucide="pin"></i></div>' : ''}
                
                <div class="memo-header">
                    <div class="memo-title">${highlightedTitle}</div>
                </div>

                <div class="memo-content-full">
                    ${highlightedBody ? `<div class="memo-body-full">${highlightedBody.replace(/\n/g, '<br>')}</div>` : '<div class="memo-body-empty">本文なし</div>'}
                </div>

                <div class="memo-metadata">
                    <div class="memo-metadata-item">
                        <i data-lucide="calendar-plus"></i>
                        <span>${createdDate}</span>
                    </div>
                    <div class="memo-metadata-item">
                        <i data-lucide="calendar-check"></i>
                        <span>${updatedDate}</span>
                    </div>
                    ${userEmail ? `
                    <div class="memo-metadata-item">
                        <i data-lucide="user"></i>
                        <span>${userEmail}</span>
                    </div>
                    ` : ''}
                    ${tagsHTML ? `<div class="memo-tags">${tagsHTML}</div>` : ''}
                </div>

                <div class="memo-actions" onclick="event.stopPropagation()">
                    <button class="action-btn" title="編集" onclick="openEditor('${memo.id}')">
                        <i data-lucide="edit-3"></i>
                    </button>
                    ${memo.is_archived ? `
                    <button class="action-btn active" title="元に戻す" onclick="unarchiveMemo('${memo.id}')">
                        <i data-lucide="archive-restore"></i>
                    </button>
                    ` : `
                    <button class="action-btn" title="アーカイブ" onclick="archiveMemo('${memo.id}')">
                        <i data-lucide="archive"></i>
                    </button>
                    `}
                    <button class="action-btn ${isPinned ? 'active' : ''}" title="ピン止め" onclick="togglePinMemo('${memo.id}')">
                        <i data-lucide="pin"></i>
                    </button>
                    <button class="action-btn" title="メモのコピー" onclick="copyMemo('${memo.id}')">
                        <i data-lucide="copy"></i>
                    </button>
                    <button class="action-btn" title="メモの印刷" onclick="printMemo('${memo.id}')">
                        <i data-lucide="printer"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

// Actions Logic
window.toggleMemoContent = function (id) {
    if (expandedMemoIds.has(id)) {
        expandedMemoIds.delete(id);
    } else {
        expandedMemoIds.add(id);
    }
    saveUIState();
    renderMemos();
    lucide.createIcons();
};

window.togglePinMemo = async function (id) {
    const memo = memos.find(m => m.id == id);
    if (!memo) return;

    const originalState = memo.is_pinned;
    memo.is_pinned = !memo.is_pinned;

    // Optimistic UI update
    renderMemos();
    lucide.createIcons();

    // Persist to DB
    const client = window.getSupabase();
    try {
        const { error } = await client.from('memos').update({ is_pinned: memo.is_pinned }).eq('id', id);
        if (error) {
            // Revert on error
            memo.is_pinned = originalState;
            renderMemos();
            alert("ピン留めの保存に失敗しました。カラムが存在するか確認してください: " + error.message);
            console.error("Pin update error:", error);
        }
    } catch (err) {
        memo.is_pinned = originalState;
        renderMemos();
        console.error("Unexpected pin error:", err);
    }
};

window.archiveMemo = async function (id) {
    // Optimistic Update: Hide immediately
    const memoIndex = memos.findIndex(m => m.id == id);
    if (memoIndex === -1) return;

    const originalMemo = { ...memos[memoIndex] };
    memos[memoIndex].is_archived = true;
    render();

    const client = window.getSupabase();
    try {
        const { error } = await client.from('memos').update({ is_archived: true }).eq('id', id);
        if (error) {
            // Revert on error
            memos[memoIndex] = originalMemo;
            render();
            alert("アーカイブに失敗しました: " + error.message);
            return;
        }
        // Sync with server data just in case
        await fetchData();
        render();
    } catch (err) {
        memos[memoIndex] = originalMemo;
        render();
        console.error("Unexpected archive error:", err);
    }
};

window.unarchiveMemo = async function (id) {
    // Optimistic Update
    const memoIndex = memos.findIndex(m => m.id == id);
    if (memoIndex === -1) return;

    const originalMemo = { ...memos[memoIndex] };
    memos[memoIndex].is_archived = false;
    render();

    const client = window.getSupabase();
    try {
        const { error } = await client.from('memos').update({ is_archived: false }).eq('id', id);
        if (error) {
            memos[memoIndex] = originalMemo;
            render();
            alert("復元に失敗しました: " + error.message);
            return;
        }
        await fetchData();
        render();
    } catch (err) {
        memos[memoIndex] = originalMemo;
        render();
        console.error("Unexpected unarchive error:", err);
    }
};

window.copyMemo = function (id) {
    const memo = memos.find(m => m.id == id);
    if (!memo) return;

    navigator.clipboard.writeText(memo.content).then(() => {
        alert('メモをクリップボードにコピーしました');
    });
};

window.printMemo = function (id) {
    const memo = memos.find(m => m.id == id);
    if (!memo) return;

    // Prepare metadata
    const createdDate = memo.created_at ? new Date(memo.created_at).toLocaleDateString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }) : '不明';
    const updatedDate = memo.updated_at ? new Date(memo.updated_at).toLocaleDateString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }) : '不明';

    const tagNames = (memo.tags || []).map(tid => {
        const tag = tags.find(t => t.id === tid);
        return tag ? tag.name : null;
    }).filter(t => t !== null).join(', ');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Print Memo</title>
                <style>
                    body { font-family: sans-serif; padding: 40px; line-height: 1.6; color: #333; }
                    .header { border-bottom: 2px solid #333; margin-bottom: 20px; padding-bottom: 10px; }
                    .title { font-size: 28px; font-weight: bold; margin-bottom: 5px; }
                    .meta { font-size: 12px; color: #666; display: flex; flex-wrap: wrap; gap: 15px; }
                    .meta-item { display: flex; align-items: center; }
                    .meta-label { font-weight: bold; margin-right: 5px; }
                    .content { white-space: pre-wrap; font-size: 16px; margin-top: 20px; }
                    .tags { margin-top: 20px; font-size: 14px; font-style: italic; color: #555; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="title">${memo.content.split('\n')[0] || 'Untitled'}</div>
                    <div class="meta">
                        <div class="meta-item"><span class="meta-label">作成日:</span> ${createdDate}</div>
                        <div class="meta-item"><span class="meta-label">更新日:</span> ${updatedDate}</div>
                        ${tagNames ? `<div class="meta-item"><span class="meta-label">タグ:</span> ${tagNames}</div>` : ''}
                    </div>
                </div>
                <div class="content">${memo.content}</div>
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
};

// Logic - Filtering
window.setTagFilter = function (tagId) {
    activeTagFilter = tagId;
    saveUIState();
    render();

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        closeMobileSidebar();
    }
};

globalSearch.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();

    // Auto-expand sidebar if it's closed but searching? 
    // Usually better to keep it open or closed based on user action.
});

// Logic - Editor
window.openEditor = function (id = null) {
    currentEditingMemoId = id;
    saveStatus.textContent = '';
    saveStatus.className = 'save-status';

    if (id) {
        const memo = memos.find(m => m.id == id);
        if (memo) {
            memoTextarea.value = memo.content;
            selectedTagsForMemo = memo.tags || [];
            currentMemoIsPublic = memo.is_public || false;
            deleteMemoBtn.classList.remove('hidden');
            headerActionGroup.classList.remove('hidden');

            // Update modal actions state
            if (memo.is_pinned) modalPinBtn.classList.add('active');
            else modalPinBtn.classList.remove('active');

            if (memo.is_archived) {
                modalArchiveBtn.classList.add('active');
                modalArchiveBtn.querySelector('[data-lucide]').setAttribute('data-lucide', 'archive-restore');
                modalArchiveBtn.title = "元に戻す";
            } else {
                modalArchiveBtn.classList.remove('active');
                modalArchiveBtn.querySelector('[data-lucide]').setAttribute('data-lucide', 'archive');
                modalArchiveBtn.title = "アーカイブ";
            }
        }
    } else {
        memoTextarea.value = '';
        selectedTagsForMemo = [];
        currentMemoIsPublic = false;
        deleteMemoBtn.classList.add('hidden');
        headerActionGroup.classList.add('hidden');
    }

    updatePublicToggleUI();
    lucide.createIcons(); // Ensure icons in header are updated
    renderTagsInEditor();
    memoEditor.classList.remove('hidden');

    // Reset selection when opening editor
    selectedMemoIndex = -1;
    updateSelectionHighlight();

    memoTextarea.focus();
};

function renderTagsInEditor() {
    // Group tags
    const groups = {};
    tags.forEach(tag => {
        const g = tag.tag_group || 'General';
        if (!groups[g]) groups[g] = [];
        groups[g].push(tag);
    });

    const headerHTML = `
        <div class="editor-tags-header">
            <div class="section-title-small">タグを選択</div>
            <button class="icon-btn" onclick="event.stopPropagation(); openTagEditor()" title="タグを新規作成">
                <i data-lucide="plus-circle" style="width: 16px; height: 16px;"></i>
            </button>
        </div>
    `;

    memoTagsEditor.innerHTML = headerHTML + Object.keys(groups).sort().map(groupName => {
        const groupTags = groups[groupName];
        return `
            <div class="editor-tag-group">
                <div class="editor-tag-group-title">${groupName}</div>
                <div class="editor-tag-list">
                    ${groupTags.map(tag => {
            const isSelected = selectedTagsForMemo.includes(tag.id);
            return `
                            <div class="tag-badge ${isSelected ? 'selected' : ''}" 
                                 onclick="toggleTagSelection('${tag.id}')"
                                 style="--tag-color: ${tag.color}">
                                <div class="dot" style="background: ${tag.color}"></div>
                                ${tag.name}
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

window.toggleTagSelection = function (tagId) {
    if (selectedTagsForMemo.includes(tagId)) {
        selectedTagsForMemo = selectedTagsForMemo.filter(id => id !== tagId);
    } else {
        selectedTagsForMemo.push(tagId);
    }
    renderTagsInEditor();
};

closeEditorBtn.onclick = () => {
    memoEditor.classList.add('hidden');
};

newMemoBtn.onclick = () => openEditor();

// Modal Actions Logic
if (modalArchiveBtn) {
    modalArchiveBtn.onclick = async () => {
        if (!currentEditingMemoId) return;
        const memo = memos.find(m => m.id === currentEditingMemoId);
        if (memo.is_archived) {
            await window.unarchiveMemo(currentEditingMemoId);
        } else {
            await window.archiveMemo(currentEditingMemoId);
        }
        // Modal stays open or closes? Usually better to stay open or refresh.
        // For archive, we refresh and close.
        memoEditor.classList.add('hidden');
    };
}

if (modalPinBtn) {
    modalPinBtn.onclick = async () => {
        if (!currentEditingMemoId) return;
        await window.togglePinMemo(currentEditingMemoId);

        // Update UI state in modal
        const memo = memos.find(m => m.id === currentEditingMemoId);
        if (memo.is_pinned) modalPinBtn.classList.add('active');
        else modalPinBtn.classList.remove('active');
    };
}

if (modalCopyBtn) {
    modalCopyBtn.onclick = () => {
        if (!currentEditingMemoId) return;
        window.copyMemo(currentEditingMemoId);
    };
}

if (modalPrintBtn) {
    modalPrintBtn.onclick = () => {
        if (!currentEditingMemoId) return;
        window.printMemo(currentEditingMemoId);
    };
}

saveMemoBtn.onclick = async () => {
    await performSave();
    memoEditor.classList.add('hidden');
};

async function performSave(isAuto = false) {
    const content = memoTextarea.value;
    if (!content.trim() && !isAuto) return;

    if (isAuto) {
        saveStatus.textContent = '保存中...';
        saveStatus.className = 'save-status saving';
    }

    const client = window.getSupabase();
    const userId = window.authManager.getUserId();

    if (!userId) {
        console.error('User not authenticated');
        return;
    }

    const payload = {
        content,
        tags: selectedTagsForMemo,
        is_public: currentMemoIsPublic,
        updated_at: new Date().toISOString()
    };

    try {
        if (currentEditingMemoId) {
            await client.from('memos').update(payload).eq('id', currentEditingMemoId);
        } else {
            payload.user_id = userId;
            const { data, error } = await client.from('memos').insert([payload]).select();
            if (!error && data && data[0]) {
                currentEditingMemoId = data[0].id;
                deleteMemoBtn.classList.remove('hidden');
            }
        }

        if (isAuto) {
            saveStatus.textContent = '保存済み';
            saveStatus.className = 'save-status saved';
        }

        await fetchData();
        render();
    } catch (err) {
        console.error("Save error:", err);
        if (isAuto) {
            saveStatus.textContent = '保存失敗';
            saveStatus.className = 'save-status';
        }
    }
}

// Auto-save logic
memoTextarea.addEventListener('input', () => {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);

    saveStatus.textContent = '変更あり...';
    saveStatus.className = 'save-status';

    autoSaveTimeout = setTimeout(() => {
        performSave(true);
    }, 1500); // 1.5 seconds delay
});

deleteMemoBtn.onclick = async () => {
    if (!currentEditingMemoId) return;
    if (!confirm('このメモを削除してもよろしいですか？')) return;

    const client = window.getSupabase();
    await client.from('memos').delete().eq('id', currentEditingMemoId);

    await fetchData();
    render();
    memoEditor.classList.add('hidden');
};

// Logic - Tag Management
addTagBtn.onclick = () => openTagEditor();

window.openTagEditor = function (id = null) {
    currentEditingTagId = id;
    if (id) {
        const tag = tags.find(t => t.id == id);
        tagNameInput.value = tag.name;
        tagGroupInput.value = tag.tag_group || 'General';
        tagSortInput.value = tag.sort_order || 0;
        selectedTagColor = tag.color;
        deleteTagConfirmBtn.classList.remove('hidden');
    } else {
        tagNameInput.value = '';
        tagGroupInput.value = 'General';
        tagSortInput.value = 0;
        selectedTagColor = '#3b82f6';
        deleteTagConfirmBtn.classList.add('hidden');
    }

    updateColorSelection();
    tagEditorModal.classList.remove('hidden');
};

function updateColorSelection() {
    colorOptions.forEach(opt => {
        if (opt.dataset.color === selectedTagColor) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });
}

colorOptions.forEach(opt => {
    opt.onclick = () => {
        selectedTagColor = opt.dataset.color;
        updateColorSelection();
    };
});

cancelTagEditBtn.onclick = () => {
    tagEditorModal.classList.add('hidden');
};

saveTagEditBtn.onclick = async () => {
    const name = tagNameInput.value.trim();
    if (!name) return;

    const group = tagGroupInput.value.trim() || 'General';
    const sort = parseInt(tagSortInput.value) || 0;

    const client = window.getSupabase();
    const payload = {
        name,
        tag_group: group,
        sort_order: sort,
        color: selectedTagColor
    };

    let res;
    if (currentEditingTagId) {
        res = await client.from('tags').update(payload).eq('id', currentEditingTagId);
    } else {
        res = await client.from('tags').insert([payload]);
    }

    if (res.error) {
        alert("タグの保存に失敗しました: " + res.error.message);
        console.error("Save tag error:", res.error);
        return;
    }

    await fetchData();
    render();
    tagEditorModal.classList.add('hidden');
};

window.openTagGroupEditor = function (groupName) {
    currentEditingGroupName = groupName;
    tagGroupNameInput.value = groupName;
    tagGroupEditorModal.classList.remove('hidden');
};

cancelTagGroupEditBtn.onclick = () => {
    tagGroupEditorModal.classList.add('hidden');
};

saveTagGroupEditBtn.onclick = async () => {
    const newGroupName = tagGroupNameInput.value.trim();
    if (!newGroupName || newGroupName === currentEditingGroupName) {
        tagGroupEditorModal.classList.add('hidden');
        return;
    }

    const client = window.getSupabase();

    // Update all tags that belong to the old group name
    const { error } = await client
        .from('tags')
        .update({ tag_group: newGroupName })
        .eq('tag_group', currentEditingGroupName);

    if (error) {
        alert("グループ名の更新に失敗しました: " + error.message);
        console.error("Update group error:", error);
    } else {
        await fetchData();
        render();
        tagGroupEditorModal.classList.add('hidden');
    }
};

deleteTagConfirmBtn.onclick = async () => {
    if (!currentEditingTagId) return;
    if (!confirm('このタグを削除しますか？（メモとの紐付けも解除されます）')) return;

    const client = window.getSupabase();
    await client.from('tags').delete().eq('id', currentEditingTagId);

    await fetchData();
    render();
    tagEditorModal.classList.add('hidden');
};

// Logic - Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // 1. Global Shortcuts (only if not focusing an input/textarea)
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);

    if (!isTyping) {
        // focus search: /
        if (e.key === '/') {
            e.preventDefault();
            globalSearch.focus();
        }
        // new memo: alt + n
        if (e.code === 'KeyN' && (e.altKey || e.metaKey)) {
            e.preventDefault();
            openEditor();
        }

        // Navigation Support
        if (displayedMemoIds.length > 0) {
            // j / Down
            if (e.key === 'j' || e.key === 'ArrowDown') {
                e.preventDefault();
                moveSelection(1);
            }
            // k / Up
            if (e.key === 'k' || e.key === 'ArrowUp') {
                e.preventDefault();
                moveSelection(-1);
            }
            // Enter to edit
            if (e.key === 'Enter' && selectedMemoIndex !== -1) {
                e.preventDefault();
                openEditor(displayedMemoIds[selectedMemoIndex]);
            }
        }
    }

    // 2. Contextual Shortcuts
    // Close modals: Esc
    if (e.key === 'Escape') {
        memoEditor.classList.add('hidden');
        tagEditorModal.classList.add('hidden');
        tagGroupEditorModal.classList.add('hidden');
        helpModal.classList.add('hidden');
    }

    // Save memo: Ctrl + S (only when editor is open)
    if (!memoEditor.classList.contains('hidden')) {
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveMemoBtn.click();
        }
    }
});

function moveSelection(direction) {
    if (displayedMemoIds.length === 0) return;

    if (selectedMemoIndex === -1) {
        selectedMemoIndex = direction > 0 ? 0 : displayedMemoIds.length - 1;
    } else {
        selectedMemoIndex += direction;
        // Clamp
        if (selectedMemoIndex < 0) selectedMemoIndex = 0;
        if (selectedMemoIndex >= displayedMemoIds.length) selectedMemoIndex = displayedMemoIds.length - 1;
    }

    updateSelectionHighlight();
    scrollToSelected();
}

function updateSelectionHighlight() {
    const cards = memoGrid.querySelectorAll('.memo-card');
    cards.forEach((card, index) => {
        if (index === selectedMemoIndex) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

function scrollToSelected() {
    if (selectedMemoIndex === -1) return;
    const selectedCard = document.getElementById(`memo-${displayedMemoIds[selectedMemoIndex]}`);
    if (selectedCard) {
        selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Reset selection on search focus
globalSearch.addEventListener('focus', () => {
    selectedMemoIndex = -1;
    updateSelectionHighlight();
});

// Update placeholder to show shortcut
globalSearch.placeholder = "検索... (/)";

// Help Modal Logic
helpBtn.onclick = () => {
    helpModal.classList.remove('hidden');
};

closeHelpBtn.onclick = () => {
    helpModal.classList.add('hidden');
};

// CSV Export Logic
exportCsvBtn.onclick = async () => {
    try {
        const client = window.getSupabase();
        const { data, error } = await client.from('memos').select('*');
        if (error) throw error;

        if (!data || data.length === 0) {
            alert('エクスポートするメモがありません。');
            return;
        }

        const headers = ['content', 'is_pinned', 'is_archived', 'is_public', 'color', 'tags', 'created_at', 'updated_at'];
        const csvRows = [headers.join(',')];

        for (const memo of data) {
            const row = headers.map(header => {
                let val = memo[header];
                if (header === 'tags') {
                    // Convert tag IDs to names for export
                    val = Array.isArray(val) ? val.map(tid => {
                        const tag = tags.find(t => t.id === tid);
                        return tag ? tag.name : tid;
                    }).join('|') : '';
                }
                if (typeof val === 'string') {
                    // Escape quotes and wrap in quotes
                    val = `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            });
            csvRows.push(row.join(','));
        }

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `memos_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showSaveStatus('CSVをエクスポートしました');
    } catch (err) {
        console.error('Export error:', err);
        alert('エクスポートに失敗しました: ' + err.message);
    }
};

// CSV Import Logic
importCsvBtn.onclick = () => {
    csvImportInput.click();
};

csvImportInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const text = event.target.result;
        await processCSV(text);
        csvImportInput.value = ''; // Reset
    };
    reader.readAsText(file);
};

async function processCSV(csvText) {
    try {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

        const memosToImport = [];
        const userId = window.authManager.getUserId();

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Simple CSV parser that handles quotes
            const values = [];
            let current = '';
            let inQuotes = false;
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '"') {
                    if (inQuotes && line[j + 1] === '"') {
                        current += '"';
                        j++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    values.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current);

            const memo = { user_id: userId };
            headers.forEach((header, index) => {
                let val = values[index];
                if (header === 'is_pinned' || header === 'is_archived' || header === 'is_public') {
                    val = val === 'true';
                } else if (header === 'tags') {
                    // Convert tag names back to IDs
                    const tagNames = val ? val.split('|') : [];
                    val = tagNames.map(name => {
                        const tag = tags.find(t => t.name === name);
                        return tag ? tag.id : null;
                    }).filter(id => id !== null);
                }
                memo[header] = val;
            });
            memosToImport.push(memo);
        }

        if (memosToImport.length === 0) {
            alert('インポートするデータが見当たらないか、形式が正しくありません。');
            return;
        }

        const client = window.getSupabase();
        const { error } = await client.from('memos').insert(memosToImport);

        if (error) throw error;

        showSaveStatus(`${memosToImport.length}件のメモをインポートしました`);
        await fetchData();
        render();
    } catch (err) {
        console.error('Import error:', err);
        alert('インポートに失敗しました: ' + err.message);
    }
}

function showSaveStatus(message) {
    if (!saveStatus) return;
    saveStatus.textContent = message;
    saveStatus.classList.remove('hidden');
    saveStatus.style.opacity = '1';

    setTimeout(() => {
        saveStatus.style.opacity = '0';
        setTimeout(() => saveStatus.classList.add('hidden'), 500);
    }, 3000);
}

// Quick Tag Creator Logic
quickAddTagBtn.onclick = async () => {
    const name = quickTagName.value.trim();
    if (!name) return;

    const group = quickTagGroup.value.trim() || 'General';
    const client = window.getSupabase();

    const { data, error } = await client.from('tags').insert([
        { name, tag_group: group, color: '#3b82f6' }
    ]).select();

    if (error) {
        alert("タグの作成に失敗しました: " + error.message);
        return;
    }

    if (data && data[0]) {
        const newTag = data[0];
        // Automatically select the new tag
        selectedTagsForMemo.push(newTag.id);

        // Clear inputs
        quickTagName.value = '';
        quickTagGroup.value = '';

        // Refresh UI
        await fetchData();
        renderTags(); // Refresh sidebar
        renderTagsInEditor(); // Refresh selection list
    }
};

// Authentication handlers
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    if (!email) return;

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="auth-spinner"></span>送信中...';
    authMessage.classList.add('hidden');

    try {
        await window.authManager.signInWithEmail(email);

        authMessage.className = 'auth-message success';
        authMessage.textContent = `${email} にログインコードを送信しました。メールをご確認ください。`;
        authMessage.classList.remove('hidden');

        emailInput.value = '';
    } catch (error) {
        console.error('Login error:', error);
        authMessage.className = 'auth-message error';
        authMessage.textContent = 'ログインに失敗しました: ' + error.message;
        authMessage.classList.remove('hidden');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'ログインコードを送信';
    }
});

logoutBtn.addEventListener('click', async () => {
    if (!confirm('ログアウトしますか？')) return;

    try {
        await window.authManager.signOut();
    } catch (error) {
        console.error('Logout error:', error);
        alert('ログアウトに失敗しました');
    }
});

// Public/Private toggle
togglePublicBtn.addEventListener('click', () => {
    currentMemoIsPublic = !currentMemoIsPublic;
    updatePublicToggleUI();
});

function updatePublicToggleUI() {
    if (currentMemoIsPublic) {
        publicIcon.setAttribute('data-lucide', 'unlock');
        publicText.textContent = 'パブリック';
        togglePublicBtn.style.background = 'rgba(16, 185, 129, 0.2)';
        togglePublicBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        togglePublicBtn.style.color = '#d1fae5';
    } else {
        publicIcon.setAttribute('data-lucide', 'lock');
        publicText.textContent = 'プライベート';
        togglePublicBtn.style.background = '';
        togglePublicBtn.style.borderColor = '';
        togglePublicBtn.style.color = '';
    }
    lucide.createIcons();
}

// View switching
viewAllBtn.onclick = () => {
    currentView = 'all';
    updateSidebarActiveState();
    saveUIState();
    render();
    if (window.innerWidth <= 768) closeMobileSidebar();
};

viewArchivedBtn.onclick = () => {
    currentView = 'archived';
    updateSidebarActiveState();
    saveUIState();
    render();
    if (window.innerWidth <= 768) closeMobileSidebar();
};

// Mobile Sidebar Functions
function openMobileSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent scrolling
    lucide.createIcons(); // Ensure icons in sidebar are rendered
}

function closeMobileSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.add('hidden');
    document.body.style.overflow = '';
}

function initMobileSidebar() {
    if (mobileSidebarToggle) {
        mobileSidebarToggle.addEventListener('click', openMobileSidebar);
    }

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', closeMobileSidebar);
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeMobileSidebar);
    }
}

// Start
document.addEventListener('DOMContentLoaded', async () => {
    initMobileSidebar();
    loadUIState();
    await init();
});

function initResizer() {
    if (!editorResizer || !editorBody) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    editorResizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = editorBody.offsetHeight;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';

        editorResizer.classList.add('resizing');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaY = e.clientY - startY;
        const newHeight = startHeight + deltaY;

        // Constraints: 100px to 80vh (approx)
        if (newHeight > 100 && newHeight < window.innerHeight * 0.8) {
            editorBody.style.flex = 'none'; // Overwrite flex: 1
            editorBody.style.height = `${newHeight}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        editorResizer.classList.remove('resizing');
    });
}
