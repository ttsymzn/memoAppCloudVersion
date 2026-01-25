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

    // After auth check, check if we need to auto-create memo
    setTimeout(() => {
        checkAndCreateDailyMemo();
    }, 2000);
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
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) {
        gapi.client.setToken({ access_token: token });
        statusText.textContent = '連携済み';
        connectBtn.classList.add('hidden');
        disconnectBtn.classList.remove('hidden');
    } else {
        statusText.textContent = '未連携';
        connectBtn.classList.remove('hidden');
        disconnectBtn.classList.add('hidden');
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
async function checkAndCreateDailyMemo() {
    if (localStorage.getItem(STORAGE_KEYS.AUTO_CREATE) !== 'true') return;

    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) return;

    const now = new Date();
    // 6:00 AM check
    if (now.getHours() < 6) return;

    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const lastCreated = localStorage.getItem(STORAGE_KEYS.LAST_CREATED_DATE);

    if (lastCreated === dateStr) {
        console.log('Daily calendar memo already created for today.');
        return;
    }

    // Attempt to create
    await createDailyMemoFromCalendar(now);
}

async function createDailyMemoFromCalendar(date) {
    try {
        console.log('Fetching calendar events...');
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const response = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': startOfDay.toISOString(),
            'timeMax': endOfDay.toISOString(),
            'showDeleted': false,
            'singleEvents': true,
            'orderBy': 'startTime',
        });

        const events = response.result.items;
        let content = `今日 ${date.getMonth() + 1}月${date.getDate()}日 (${getWeekday(date)}) の予定\n\n`;

        if (!events || events.length === 0) {
            content += '予定はありません。';
        } else {
            events.forEach(event => {
                const start = event.start.dateTime || event.start.date;
                const startTime = event.start.dateTime ? new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '終日';
                content += `- [ ] ${startTime} ${event.summary}\n`;
            });
        }

        // Use the global memo app function to save
        if (window.createNewMemo) {
            await window.createNewMemo(content);
            localStorage.setItem(STORAGE_KEYS.LAST_CREATED_DATE, date.toISOString().split('T')[0]);
            console.log('Daily calendar memo created!');
        } else {
            console.error('createNewMemo function not found');
        }

    } catch (err) {
        console.error('Error fetching calendar events:', err);
    }
}

function getWeekday(date) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[date.getDay()];
}

// Export initialization
window.initCalendar = initCalendar;
