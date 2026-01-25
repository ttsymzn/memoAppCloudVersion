/**
 * Google Calendar Integration for MemoApp
 */

const CALENDAR_CONFIG = {
    DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
    SCOPES: 'https://www.googleapis.com/auth/calendar.readonly',
};

let tokenClient;
let gapiInited = false;
let gisInited = false;

// UI Elements
const openCalendarBtn = document.getElementById('open-calendar-settings-btn');
const calendarModal = document.getElementById('calendar-settings-modal');
const closeCalendarBtn = document.getElementById('close-calendar-settings-btn');
const connectBtn = document.getElementById('calendar-connect-btn');
const disconnectBtn = document.getElementById('calendar-disconnect-btn');
const statusText = document.getElementById('calendar-status-text');
const autoCreateToggle = document.getElementById('calendar-auto-create-toggle');

const STORAGE_KEYS = {
    ACCESS_TOKEN: 'google_calendar_access_token',
    AUTO_CREATE: 'calendar_auto_create_enabled',
    LAST_CREATED_DATE: 'calendar_last_created_date'
};

/**
 * Initialize Calendar Feature
 */
async function initCalendar() {
    // Wait for GAPI and Google GIS scripts to load if they aren't ready yet
    if (typeof gapi === 'undefined' || typeof google === 'undefined' || typeof google.accounts === 'undefined') {
        console.log('Waiting for Google API scripts...');
        setTimeout(initCalendar, 500);
        return;
    }

    setupEventListeners();
    loadSettings();

    // Load GAPI and GIS
    gapi.load('client', initializeGapiClient);

    if (window.SUPABASE_CONFIG.googleClientId) {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: window.SUPABASE_CONFIG.googleClientId,
            scope: CALENDAR_CONFIG.SCOPES,
            callback: '', // defined at usage
        });
        gisInited = true;
    } else {
        console.warn('Google Client ID is missing in SUPABASE_CONFIG');
        if (statusText) statusText.textContent = '設定(ClientID)が必要です';
    }

    checkAuthStatus();

    checkAuthStatus();
}

function setupEventListeners() {
    openCalendarBtn?.addEventListener('click', () => {
        calendarModal.classList.remove('hidden');
    });

    closeCalendarBtn?.addEventListener('click', () => {
        calendarModal.classList.add('hidden');
    });

    connectBtn?.addEventListener('click', handleAuthClick);
    disconnectBtn?.addEventListener('click', handleSignoutClick);

    autoCreateToggle?.addEventListener('change', (e) => {
        localStorage.setItem(STORAGE_KEYS.AUTO_CREATE, e.target.checked);
        if (e.target.checked) {
            checkAndCreateDailyMemo();
        }
    });
}

function loadSettings() {
    const enabled = localStorage.getItem(STORAGE_KEYS.AUTO_CREATE) === 'true';
    if (autoCreateToggle) autoCreateToggle.checked = enabled;
}

async function initializeGapiClient() {
    await gapi.client.init({
        discoveryDocs: [CALENDAR_CONFIG.DISCOVERY_DOC],
    });
    gapiInited = true;
    checkAuthStatus();
}

function checkAuthStatus() {
    if (!gapi.client) return; // まだ初期化されていない場合は何もしない

    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) {
        gapi.client.setToken({ access_token: token });
        if (statusText) statusText.textContent = '連携済み';
        if (connectBtn) connectBtn.classList.add('hidden');
        if (disconnectBtn) disconnectBtn.classList.remove('hidden');
    } else {
        if (statusText) statusText.textContent = '未連携';
        if (connectBtn) connectBtn.classList.remove('hidden');
        if (disconnectBtn) disconnectBtn.classList.add('hidden');
    }
}

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, resp.access_token);
        checkAuthStatus();
        checkAndCreateDailyMemo();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
        checkAuthStatus();
    }
}

/**
 * Main Logic: Check if it's time to create the memo
 */
let isCreatingMemo = false;

/**
 * Main Logic: Check if it's time to create the memo
 */
async function checkAndCreateDailyMemo() {
    if (localStorage.getItem(STORAGE_KEYS.AUTO_CREATE) !== 'true') return;
    if (isCreatingMemo) return; // すでに作成処理中なら抜ける

    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) return;

    // Google API (calendar) が読み込まれるまで待つ
    if (!gapi.client || !gapi.client.calendar) {
        setTimeout(checkAndCreateDailyMemo, 1000);
        return;
    }

    const now = new Date();
    if (now.getHours() < 6) return;

    const dateTitle = `今日 ${now.getMonth() + 1}月${now.getDate()}日 (${getWeekday(now)}) の予定`;
    const exists = window.memos && window.memos.some(m => m.content.startsWith(dateTitle));

    if (exists) {
        return;
    }

    // 作成開始
    isCreatingMemo = true;
    try {
        await createDailyMemoFromCalendar(now);
    } finally {
        isCreatingMemo = false; // 成功・失敗に関わらずフラグを戻す
    }
}

// Windowに公開
window.checkAndCreateDailyMemo = checkAndCreateDailyMemo;

async function createDailyMemoFromCalendar(date) {
    try {
        console.log('Fetching all calendars...');

        // 1. カレンダー一覧を取得
        const calendarListResponse = await gapi.client.calendar.calendarList.list();
        const calendars = calendarListResponse.result.items;

        if (!calendars || calendars.length === 0) {
            console.warn('No calendars found.');
            return;
        }

        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        let allEvents = [];

        // 2. 各カレンダーから予定を取得
        console.log(`Fetching events from ${calendars.length} calendars...`);
        const eventPromises = calendars.map(async (cal) => {
            try {
                const response = await gapi.client.calendar.events.list({
                    'calendarId': cal.id,
                    'timeMin': startOfDay.toISOString(),
                    'timeMax': endOfDay.toISOString(),
                    'showDeleted': false,
                    'singleEvents': true,
                    'orderBy': 'startTime',
                });
                return response.result.items.map(event => ({
                    ...event,
                    calendarSummary: cal.summary // どのカレンダーの予定か判別用
                }));
            } catch (err) {
                console.warn(`Could not fetch events for calendar: ${cal.summary}`, err);
                return [];
            }
        });

        const results = await Promise.all(eventPromises);
        results.forEach(events => {
            allEvents = allEvents.concat(events);
        });

        // 3. 予定を時間順にソート
        allEvents.sort((a, b) => {
            const startA = a.start.dateTime || a.start.date;
            const startB = b.start.dateTime || b.start.date;
            return new Date(startA) - new Date(startB);
        });

        // 4. 重複の排除 (同じIDの予定が複数のカレンダーにある場合)
        const seenIds = new Set();
        const uniqueEvents = allEvents.filter(event => {
            if (seenIds.has(event.id)) return false;
            seenIds.add(event.id);
            return true;
        });

        // 5. メモの内容を作成
        let content = `今日 ${date.getMonth() + 1}月${date.getDate()}日 (${getWeekday(date)}) の予定\n\n`;

        if (uniqueEvents.length === 0) {
            content += '予定はありません。';
        } else {
            uniqueEvents.forEach(event => {
                const start = event.start.dateTime || event.start.date;
                const startTime = event.start.dateTime ? new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '終日';

                // カレンダー名を表示に含める（必要に応じて）
                const calLabel = uniqueEvents.length > 1 ? ` [${event.calendarSummary}]` : '';
                content += `[] ${startTime} ${event.summary}${calLabel}\n`;
            });
        }

        // 6. メモを保存
        if (window.createNewMemo) {
            await window.createNewMemo(content);
            localStorage.setItem(STORAGE_KEYS.LAST_CREATED_DATE, date.toISOString().split('T')[0]);
            console.log('Daily combined calendar memo created!');
        }

    } catch (err) {
        console.error('Error fetching combined calendar events:', err);
    }
}

function getWeekday(date) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[date.getDay()];
}

// Export initialization
window.initCalendar = initCalendar;
