// Offline Manager — IndexedDB cache + pending-ops queue
const OFFLINE_DB_NAME = 'memoapp_offline';
const OFFLINE_DB_VERSION = 1;

class OfflineManager {
    constructor() {
        this.db = null;
        this.isOnline = navigator.onLine;
        this._syncInProgress = false;
    }

    async init() {
        this.db = await this._openDB();
        this._setupNetworkListeners();
        this._updateOfflineUI();
        return this;
    }

    // ── IndexedDB setup ────────────────────────────────────────────────────

    _openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;

                if (!db.objectStoreNames.contains('memos_cache')) {
                    db.createObjectStore('memos_cache', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('tags_cache')) {
                    db.createObjectStore('tags_cache', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('pending_ops')) {
                    const store = db.createObjectStore('pending_ops', {
                        keyPath: 'id', autoIncrement: true
                    });
                    store.createIndex('memo_id', 'memoId', { unique: false });
                }
            };

            req.onsuccess = () => resolve(req.result);
            req.onerror  = () => reject(req.error);
        });
    }

    // ── Network event listeners ────────────────────────────────────────────

    _setupNetworkListeners() {
        window.addEventListener('online', async () => {
            this.isOnline = true;
            this._updateOfflineUI();
            // ネットワーク復帰直後は接続が不安定なため少し待ってから同期
            setTimeout(() => this.syncPending(), 1500);
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this._updateOfflineUI();
        });
    }

    // ── Cache helpers ──────────────────────────────────────────────────────

    async cacheMemos(memosArray) {
        if (!this.db) return;
        const tx = this.db.transaction('memos_cache', 'readwrite');
        const store = tx.objectStore('memos_cache');
        await new Promise(r => { const req = store.clear(); req.onsuccess = r; });
        for (const m of memosArray) store.put(m);
        return new Promise((res, rej) => {
            tx.oncomplete = res;
            tx.onerror    = () => rej(tx.error);
        });
    }

    async cacheTags(tagsArray) {
        if (!this.db) return;
        const tx = this.db.transaction('tags_cache', 'readwrite');
        const store = tx.objectStore('tags_cache');
        await new Promise(r => { const req = store.clear(); req.onsuccess = r; });
        for (const t of tagsArray) store.put(t);
        return new Promise((res, rej) => {
            tx.oncomplete = res;
            tx.onerror    = () => rej(tx.error);
        });
    }

    async getCachedMemos() {
        if (!this.db) return [];
        return new Promise((res, rej) => {
            const req = this.db.transaction('memos_cache', 'readonly')
                .objectStore('memos_cache').getAll();
            req.onsuccess = () => res(req.result || []);
            req.onerror   = () => rej(req.error);
        });
    }

    async getCachedTags() {
        if (!this.db) return [];
        return new Promise((res, rej) => {
            const req = this.db.transaction('tags_cache', 'readonly')
                .objectStore('tags_cache').getAll();
            req.onsuccess = () => res(req.result || []);
            req.onerror   = () => rej(req.error);
        });
    }

    async updateCachedMemo(memo) {
        if (!this.db) return;
        return new Promise((res, rej) => {
            const req = this.db.transaction('memos_cache', 'readwrite')
                .objectStore('memos_cache').put(memo);
            req.onsuccess = res;
            req.onerror   = () => rej(req.error);
        });
    }

    async deleteCachedMemo(memoId) {
        if (!this.db) return;
        return new Promise((res, rej) => {
            const req = this.db.transaction('memos_cache', 'readwrite')
                .objectStore('memos_cache').delete(memoId);
            req.onsuccess = res;
            req.onerror   = () => rej(req.error);
        });
    }

    // ── Pending-ops helpers ────────────────────────────────────────────────

    // Upsert: if a pending op for the same memoId+type already exists, update it
    async upsertPendingOp(op) {
        if (!this.db) return;
        return new Promise((res, rej) => {
            const tx = this.db.transaction('pending_ops', 'readwrite');
            const store = tx.objectStore('pending_ops');
            const index = store.index('memo_id');
            const req = index.getAll(op.memoId);

            req.onsuccess = () => {
                const existing = (req.result || []).find(e => e.type === op.type);
                if (existing) {
                    store.put({ ...existing, payload: op.payload, timestamp: Date.now() });
                } else {
                    store.add({ ...op, timestamp: Date.now() });
                }
            };

            tx.oncomplete = res;
            tx.onerror    = () => rej(tx.error);
        });
    }

    async getPendingOps() {
        if (!this.db) return [];
        return new Promise((res, rej) => {
            const req = this.db.transaction('pending_ops', 'readonly')
                .objectStore('pending_ops').getAll();
            req.onsuccess = () => {
                const ops = req.result || [];
                ops.sort((a, b) => a.timestamp - b.timestamp);
                res(ops);
            };
            req.onerror = () => rej(req.error);
        });
    }

    async clearPendingOp(opId) {
        if (!this.db) return;
        return new Promise((res, rej) => {
            const req = this.db.transaction('pending_ops', 'readwrite')
                .objectStore('pending_ops').delete(opId);
            req.onsuccess = res;
            req.onerror   = () => rej(req.error);
        });
    }

    async getPendingCount() {
        if (!this.db) return 0;
        return new Promise((res, rej) => {
            const req = this.db.transaction('pending_ops', 'readonly')
                .objectStore('pending_ops').count();
            req.onsuccess = () => res(req.result);
            req.onerror   = () => rej(req.error);
        });
    }

    // ── Sync ──────────────────────────────────────────────────────────────

    async syncPending() {
        if (this._syncInProgress || !this.isOnline) return;

        const userId = window.authManager?.getUserId();
        if (!userId) return; // 未認証時はスキップ — ログイン後に syncPending が再呼び出しされる

        const ops = await this.getPendingOps();
        if (ops.length === 0) return;

        this._syncInProgress = true;
        this._setSyncingUI(true);

        let hasFailures = false;

        try {
            const client = window.getSupabase();

            for (const op of ops) {
                try {
                    if (op.type === 'memo_save') {
                        const isTemp = String(op.memoId).startsWith('temp_');
                        if (isTemp) {
                            // New memo — INSERT
                            const insertPayload = { ...op.payload, user_id: userId };
                            const { data, error } = await client.from('memos')
                                .insert([insertPayload]).select();
                            if (error) throw error;
                            // Swap temp entry with the real one
                            if (data?.[0]) {
                                await this.deleteCachedMemo(op.memoId);
                                await this.updateCachedMemo(data[0]);
                            }
                        } else {
                            // Existing memo — UPDATE
                            const { error } = await client.from('memos')
                                .update(op.payload).eq('id', op.memoId);
                            if (error) throw error;
                        }
                    } else if (op.type === 'memo_delete') {
                        if (!String(op.memoId).startsWith('temp_')) {
                            const { error } = await client.from('memos')
                                .delete().eq('id', op.memoId);
                            if (error) throw error;
                        }
                    }

                    await this.clearPendingOp(op.id);
                } catch (err) {
                    console.error('[Offline] Sync failed for op:', op.id, err);
                    hasFailures = true;
                }
            }

            // Re-fetch from server to resolve any temp-ID references
            if (window.fetchData && window.render) {
                await window.fetchData();
                window.render();
            }
        } finally {
            // 例外が起きても必ずフラグを戻す
            this._syncInProgress = false;
            this._setSyncingUI(false);
            this._updateOfflineUI();
        }

        // 一部失敗した場合は少し後にリトライ
        if (hasFailures && this.isOnline) {
            setTimeout(() => this.syncPending(), 5000);
        }
    }

    // ── UI helpers ─────────────────────────────────────────────────────────

    async _updateOfflineUI() {
        const banner = document.getElementById('offline-banner');
        if (!banner) return;

        const count = await this.getPendingCount();
        const dot = banner.querySelector('.offline-dot');
        const label = banner.querySelector('.offline-label');
        const pendingSpan = banner.querySelector('.offline-pending');

        if (!this.isOnline) {
            banner.classList.remove('hidden', 'is-syncing');
            if (dot) dot.className = 'offline-dot offline';
            if (label) label.textContent = 'オフライン中';
            if (pendingSpan) {
                pendingSpan.textContent = count > 0 ? `保存待ち ${count} 件` : '';
                pendingSpan.style.display = count > 0 ? 'inline' : 'none';
            }
        } else if (count > 0) {
            banner.classList.remove('hidden');
            if (dot) dot.className = 'offline-dot syncing';
            if (label) label.textContent = '同期待ち';
            if (pendingSpan) {
                pendingSpan.textContent = `${count} 件`;
                pendingSpan.style.display = 'inline';
            }
        } else {
            banner.classList.add('hidden');
        }
    }

    _setSyncingUI(active) {
        const banner = document.getElementById('offline-banner');
        if (!banner) return;
        const dot = banner.querySelector('.offline-dot');
        const label = banner.querySelector('.offline-label');

        if (active) {
            banner.classList.remove('hidden');
            banner.classList.add('is-syncing');
            if (dot) dot.className = 'offline-dot syncing';
            if (label) label.textContent = '同期中...';
        } else {
            banner.classList.remove('is-syncing');
        }
    }
}

window.offlineManager = new OfflineManager();
