// App State
let memos = [];
let tags = [];
let activeTagFilter = null;
let searchQuery = '';
let currentEditingMemoId = null;

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

let selectedTagsForMemo = [];
let currentEditingTagId = null;
let selectedTagColor = '#3b82f6';
let collapsedGroups = new Set();
let autoSaveTimeout = null;

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

    await fetchData();
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
            <i data-lucide="chevron-down" class="chevron" style="width: 12px; height: 12px;"></i>
        `;
        tagList.appendChild(groupHeader);

        const groupContainer = document.createElement('div');
        groupContainer.className = `tag-group-items ${isCollapsed ? 'collapsed' : ''}`;

        groupTags.forEach(tag => {
            const tagItem = document.createElement('li');
            tagItem.className = `tag-item ${activeTagFilter === tag.id ? 'active' : ''}`;
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

window.toggleGroup = function (groupName) {
    if (collapsedGroups.has(groupName)) {
        collapsedGroups.delete(groupName);
    } else {
        collapsedGroups.add(groupName);
    }
    renderTags();
};

function renderMemos() {
    let filtered = memos;

    // Apply tag filter
    if (activeTagFilter) {
        filtered = filtered.filter(m => m.tags && m.tags.includes(activeTagFilter));
    }

    // Apply search
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(m => {
            const hasText = m.content.toLowerCase().includes(query);
            const matchingTags = tags.filter(t => t.name.toLowerCase().includes(query)).map(t => t.id);
            const hasTag = m.tags && m.tags.some(tid => matchingTags.includes(tid));
            return hasText || hasTag;
        });
    }

    if (filtered.length === 0) {
        memoGrid.innerHTML = `<div class="empty-state">メモが見つかりません</div>`;
        return;
    }

    memoGrid.innerHTML = filtered.map(memo => {
        const lines = memo.content.split('\n');
        const title = lines[0] || 'Untitled';
        const bodyContent = lines.slice(1).join('\n');

        // Highlighting
        const highlightedTitle = highlightMatch(title, searchQuery);
        const highlightedBody = highlightMatch(bodyContent, searchQuery);

        return `
            <div class="memo-card glass" onclick="openEditor('${memo.id}')" style="background: ${memo.color}">
                <h3 class="memo-title">${highlightedTitle}</h3>
                <p class="memo-preview">${highlightedBody}</p>
                <div class="memo-tags">
                    ${(memo.tags || []).map(tid => {
            const tag = tags.find(t => t.id === tid);
            if (!tag) return '';
            return `<span class="badge" style="border-color: ${tag.color}">${tag.name}</span>`;
        }).join('')}
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

// Logic - Filtering
window.setTagFilter = function (tagId) {
    activeTagFilter = tagId;
    render();
};

globalSearch.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
});

// Logic - Editor
window.openEditor = function (id = null) {
    currentEditingMemoId = id;
    saveStatus.textContent = '';
    saveStatus.className = 'save-status';

    if (id) {
        const memo = memos.find(m => m.id === id);
        memoTextarea.value = memo.content;
        selectedTagsForMemo = memo.tags || [];
        deleteMemoBtn.classList.remove('hidden');
    } else {
        memoTextarea.value = '';
        selectedTagsForMemo = [];
        deleteMemoBtn.classList.add('hidden');
    }
    renderTagsInEditor();
    memoEditor.classList.remove('hidden');
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

    memoTagsEditor.innerHTML = Object.keys(groups).sort().map(groupName => {
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
    const payload = {
        content,
        tags: selectedTagsForMemo,
        updated_at: new Date().toISOString()
    };

    try {
        if (currentEditingMemoId) {
            await client.from('memos').update(payload).eq('id', currentEditingMemoId);
        } else {
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
        const tag = tags.find(t => t.id === id);
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
    }

    // 2. Contextual Shortcuts
    // Close modals: Esc
    if (e.key === 'Escape') {
        memoEditor.classList.add('hidden');
        tagEditorModal.classList.add('hidden');
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

// Update placeholder to show shortcut
globalSearch.placeholder = "検索... (/)";

// Help Modal Logic
helpBtn.onclick = () => {
    helpModal.classList.remove('hidden');
};

closeHelpBtn.onclick = () => {
    helpModal.classList.add('hidden');
};

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

// Start
document.addEventListener('DOMContentLoaded', init);
