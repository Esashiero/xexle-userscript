// ==UserScript==
// @name         Xexle Community Stats v35
// @namespace    https://xexle.com/scripts/
// @version      35.0.5
// @description  Community page: badges, scroll-crawl, filters, gallery grid view, recent sort, saved searches, retry queue.
// @author       shiro
// @match        https://xexle.com/community*
// @match        https://xexle.com/favorites/*
// @match        https://xexle.com/watch/*
// @match        https://xexle.com/user/*
// @match        https://xexle.com/search*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Esashiero/xexle-userscript/main/xexle-community.user.js
// @downloadURL  https://raw.githubusercontent.com/Esashiero/xexle-userscript/main/xexle-community.user.js
// @updateInterval 12
// ==/UserScript==

(function () {
    'use strict';

    // ============================== CONFIG ==============================
    const DB_NAME = 'XexleCommunityDB', DB_VERSION = 3, STORE = 'users';
    const CRAWL_DELAY_MS = 300;
    const STALE_MS = 7 * 24 * 3600 * 1000;      // re-crawl after 7 days
    const FAIL_COOLDOWN_MS = 24 * 3600 * 1000;  // retry failed users after 24h
    const FAIL_MAX = 3;
    let MIN_VIDEOS = 0;
    let SEARCH = '';
    let GALLERY_FILTER = '';   // gallery-title quick filter
    let SORT_MODE = 'default'; // 'default' | 'recent'
    let db = null;

    // ============================== SYNC SERVER ==============================
    // Push crawled community data to the local Xexle search server (v2).
    // Set to '' to disable. Default localhost:8003 (the v2 server).
    const SYNC_SERVER = (GM_getValue('xc_sync_server') || 'http://localhost:8003').replace(/\/+$/, '');
    let SYNC_ENABLED = GM_getValue('xc_sync_enabled', true);

    async function pushToServer(rec) {
        if (!SYNC_ENABLED || !SYNC_SERVER) return;
        try {
            const payload = {
                username: rec.username,
                total: rec.total,
                last_crawled: rec.lastCrawled,
                galleries: (rec.galleries || []).map(g => ({
                    folder_id: g.folderId,
                    title: g.title,
                    count: g.count,
                    avatar: g.avatar || '',
                    created: g.created || null,
                    last: g.lastDt || null
                }))
            };
            const r = await fetch(`${SYNC_SERVER}/api/ingest/user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (r.ok) setStatus(`Synced ${rec.username} → ${SYNC_SERVER}`);
        } catch (e) { /* best-effort; never block the crawl */ }
    }

    // ============================== GALLERY ITEM CAPTURE ==============================
    // Intercept xexle's getFolder API responses and push each video item to the
    // sync server. This populates the videos table (the community crawl only
    // captures gallery metadata). Best-effort; never blocks the page.
    function pushItems(items, folderId) {
        if (!SYNC_ENABLED || !SYNC_SERVER) return;
        if (!Array.isArray(items) || !items.length) return;
        const payload = items.map(it => {
            const o = {};
            for (const k of ['id', 'title', 'tags', 'views', 'added', 'fileDuration',
                    'publicDuration', 'previewPicPath', 'previewThumbPath', 'previewVideoPath',
                    'filePath', 'indexes_search', 'category', 'type', 'isPremium', 'description'])
                if (it[k] !== undefined) o[k] = it[k];
            if (folderId) o.folder_id = folderId;
            return o;
        });
        fetch(`${SYNC_SERVER}/api/ingest/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: payload, users: [] })
        }).catch(() => {});
    }

    // Shared: given the API request body + the parsed JSON response, pull out the
    // video-item list (if any) and push it to the sync server.
    // Shape-based: finds the largest array of objects that look like xexle content
    // items (have id + a media field or title), so it works regardless of the
    // exact envelope key xexle uses.
    function looksLikeVideoItem(o) {
        if (!o || typeof o !== 'object') return false;
        if (o.id === undefined && o._id === undefined) return false;
        return (o.title !== undefined || o.filePath !== undefined ||
                o.previewPicPath !== undefined || o.previewVideoPath !== undefined ||
                o.fileDuration !== undefined || o.contentId !== undefined);
    }
    function findVideoArrays(node, depth, found) {
        try {
            if (depth > 6) return;
            if (Array.isArray(node)) {
                if (node.length && looksLikeVideoItem(node[0])) {
                    found.push(node);
                    return;
                }
                for (const el of node) findVideoArrays(el, depth + 1, found);
            } else if (node && typeof node === 'object') {
                for (const k of Object.keys(node)) findVideoArrays(node[k], depth + 1, found);
            }
        } catch (e) { /* never break */ }
    }
    function maybeCapture(body, json) {
        try {
            if (!/(getFolder|getFolders|getContent|getFolderMeta|favorite|search|content)/i.test(body || '')) return;
            const found = [];
            findVideoArrays(json, 0, found);
            if (!found.length) return;
            // pick the largest video array
            found.sort((a, b) => b.length - a.length);
            const list = found[0];
            const m = /folderId=(\d+)/.exec(body || '');
            const fid = m ? parseInt(m[1], 10) : null;
            pushItems(list, fid);
        } catch (e) { /* never break the page */ }
    }

    // Hook fetch
    (function interceptFetch() {
        const orig = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const resp = await orig(input, init);
            try {
                const reqBody = typeof input === 'string' ? input : (init && init.body) || '';
                if (/(xexle\.com\/api|api\.xexle\.com)/i.test(typeof input === 'string' ? input : (input && input.url) || '')) {
                    const clone = resp.clone();
                    const txt = await clone.text();
                    maybeCapture(reqBody, JSON.parse(txt));
                }
            } catch (e) { /* never break the page */ }
            return resp;
        };
    })();

    // Hook XMLHttpRequest (xexle's own page JS uses this for getFolder)
    (function interceptXHR() {
        const RealXHR = window.XMLHttpRequest;
        function WrappedXHR() {
            const xhr = new RealXHR();
            let reqBody = '';
            const realOpen = xhr.open;
            xhr.open = function (method, url) {
                xhr.__url = url;
                return realOpen.apply(this, arguments);
            };
            const realSend = xhr.send;
            xhr.send = function (body) {
                reqBody = body || '';
                return realSend.apply(this, arguments);
            };
            xhr.addEventListener('load', function () {
                try {
                    if (/(xexle\.com\/api|api\.xexle\.com)/i.test(xhr.__url || '')) {
                        maybeCapture(reqBody, JSON.parse(xhr.responseText));
                    }
                } catch (e) { /* never break the page */ }
            });
            return xhr;
        }
        window.XMLHttpRequest = WrappedXHR;
    })();

    // Fire both patches even if the page already captured a reference to the
    // originals (hooks run at script load, before most page code executes).
    void 0;

    // ============================== DB ==============================
    function openDB() {
        return new Promise((resolve, reject) => {
            if (db) return resolve(db);
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = e => {
                const d = e.target.result;
                if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'username' });
            };
            req.onsuccess = e => { db = e.target.result; resolve(db); };
            req.onerror = () => reject('DB error');
        });
    }
    const tx = (mode) => db.transaction(STORE, mode).objectStore(STORE);
    const dbGet = (u) => new Promise(r => { const q = tx('readonly').get(u); q.onsuccess = () => r(q.result); q.onerror = () => r(null); });
    const dbPut = (rec) => new Promise(r => { const q = tx('readwrite').put(rec); q.onsuccess = r; q.onerror = r; });
    const dbAll = () => new Promise(r => { const q = tx('readonly').getAll(); q.onsuccess = () => r(q.result || []); q.onerror = () => r([]); });

    // ============================== API ==============================
    async function fetchFolders(username) {
        try {
            const m = document.cookie.match(/session=([^;]+)/);
            const session = m ? decodeURIComponent(m[1]) : '';
            const body = `query=usersFavoriteContent.getFolders&user=${encodeURIComponent(username)}&session=${encodeURIComponent(session)}`;
            const resp = await fetch('https://xexle.com/api/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            });
            const json = await resp.json();
            if (!json.status || !json.data || !json.data.list) return null;
            return json.data.list;
        } catch (e) { return null; }
    }

    function parseFolders(listObj) {
        let total = 0;
        const galleries = Object.values(listObj).map(g => ({
            folderId: g.folderId,
            title: String(g.title ?? 'Unknown'),
            count: parseInt(g.count, 10) || 0,
            avatar: g.avatar || '',
            created: g.created || null,
            lastDt: (g.last && g.last.dt) || null
        })).sort((a, b) => b.count - a.count);
        galleries.forEach(g => total += g.count);
        return { total, galleries };
    }

    const recActivity = (rec) => Math.max(0, ...(rec.galleries || []).map(g => Math.max(g.lastDt || 0, g.created || 0)));
    const isStale = (rec) => !rec.lastCrawled || (Date.now() - rec.lastCrawled) > STALE_MS;
    const isFailedOut = (rec) => rec.failCount >= FAIL_MAX && (Date.now() - (rec.lastAttempt || 0)) < FAIL_COOLDOWN_MS;

    // ============================== UI ==============================
    GM_addStyle(`
        #xc-panel { position:fixed; top:60px; right:10px; width:230px; background:#dbc1ac; border:2px solid #553b25;
                    padding:10px; border-radius:8px; z-index:9999; box-shadow:0 4px 8px rgba(0,0,0,.4);
                    color:#553b25; font-family:sans-serif; font-size:13px; }
        #xc-panel h3 { margin:0 0 8px; font-size:14px; text-align:center; border-bottom:1px solid #553b25; padding-bottom:4px; }
        .xc-input { width:100%; padding:5px; margin-bottom:6px; border-radius:4px; border:1px solid #553b25; box-sizing:border-box; }
        .xc-row { display:flex; gap:5px; margin-bottom:6px; }
        .xc-row > * { flex:1; min-width:0; }
        .xc-btn { padding:5px 8px; border:1px solid #553b25; background:#f5e7dc; color:#553b25; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px; }
        .xc-btn.active { background:#553b25; color:#fff; }
        #xc-status { margin-top:4px; font-style:italic; font-size:.85em; }
        #xc-chips { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }
        .xc-chip { background:#fff; border:1px solid #553b25; border-radius:10px; padding:1px 8px; font-size:.75rem; cursor:pointer; user-select:none; }
        .xc-chip b { margin-left:4px; color:#a00; }
        .xcs-badge { display:block; background:#fff; border-left:4px solid #553b25; padding:4px 6px; margin-top:4px;
                     border-radius:0 4px 4px 0; font-size:.75rem; color:#333; line-height:1.35; box-shadow:0 1px 2px rgba(0,0,0,.1); }
        .xcs-badge.fail { border-left-color:#999; color:#888; font-style:italic; }
        .xcs-badge b { font-size:.95rem; }
        .xcs-badge ul { margin:2px 0 0; padding-left:14px; }
        .xc-hidden { display:none !important; }
        .xc-crawling { outline: 2px dashed #553b25; outline-offset: 2px; }
        #xc-hide { position:absolute; top:3px; right:8px; cursor:pointer; font-weight:bold; }

        /* ===== Gallery grid view ===== */
        body.xc-gridmode > main { display: none !important; }
        #xc-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; padding:70px 15px 15px; max-width:1600px; margin:0 auto; }
        @media (max-width:1100px) { #xc-grid { grid-template-columns:repeat(2, 1fr); } }
        @media (max-width:700px)  { #xc-grid { grid-template-columns:1fr; } }
        .xc-card { background:#dbc1ac; border:2px solid #553b25; border-radius:8px; overflow:hidden; font-family:sans-serif; }
        .xc-card-head { display:flex; align-items:center; gap:8px; padding:8px 10px; background:#553b25; color:#fff; cursor:pointer; }
        .xc-card-head:hover { background:#3d2a1a; }
        .xc-avatar { width:30px; height:30px; border-radius:50%; display:grid; place-items:center; font-weight:bold; background:#fff; color:#553b25; flex:none; }
        .xc-card-head .nm { font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .xc-card-head .tv { margin-left:auto; font-size:.78rem; opacity:.9; white-space:nowrap; }
        .xc-dates { padding:3px 10px; font-size:.68rem; color:#553b25; background:#f0e2d6; border-bottom:1px solid #c9ab93; }
        .xc-thumbs { display:grid; grid-template-columns:repeat(3, 1fr); gap:2px; background:#553b25; padding:2px; min-height:90px; }
        .xc-thumb { position:relative; aspect-ratio:16/9.6; overflow:hidden; display:block; background:#eee; text-decoration:none; }
        .xc-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
        .xc-thumb .ct { position:absolute; bottom:18px; right:2px; background:rgba(255,255,255,.85); color:#000; font-size:.62rem; border-radius:4px; padding:0 4px; }
        .xc-thumb .ti { position:absolute; bottom:0; left:0; right:0; background:rgba(242,242,242,.92); color:#111; font-size:.78rem; font-weight:bold; text-align:center; padding:2px 3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .xc-thumb.more::after { content:'+'attr(data-n); position:absolute; inset:0; display:grid; place-items:center; background:rgba(0,0,0,.45); color:#fff; font-size:1.2rem; font-weight:bold; }
        .xc-thumb.xc-blank { background:rgba(255,255,255,.06); }
        .xc-empty { grid-column:1/-1; text-align:center; padding:20px; color:#553b25; }
    `);

    let gridView = false;

    function initPanel() {
        if (document.getElementById('xc-panel')) return;
        const p = document.createElement('div');
        p.id = 'xc-panel';
        p.innerHTML = `<div id="xc-hide">_</div><h3>Community Stats</h3>
            <div class="xc-row">
              <input type="number" id="xc-min" placeholder="Min videos" value="${MIN_VIDEOS}">
              <select id="xc-sort"><option value="default">Default</option><option value="recent">Recent activity</option></select>
            </div>
            <input type="text" id="xc-search" placeholder="Search title/description">
            <select id="xc-gal" class="xc-input"><option value="">All galleries</option></select>
            <div id="xc-chips"></div>
            <div class="xc-row">
              <button class="xc-btn" id="xc-save-search">Save search</button>
              <button class="xc-btn" id="xc-grid-btn">Grid view</button>
            </div>
            <div class="xc-row">
              <button class="xc-btn" id="xc-reload-btn">Reload list</button>
            </div>
            <div class="xc-row">
              <button class="xc-btn" id="xc-sync-btn">Sync: ${SYNC_ENABLED ? 'ON' : 'OFF'}</button>
            </div>
            <div id="xc-status">Ready</div>`;
        document.body.appendChild(p);
        document.getElementById('xc-min').addEventListener('input', e => { MIN_VIDEOS = parseInt(e.target.value, 10) || 0; applyFilters(); applyGridFilters(); });
        document.getElementById('xc-search').addEventListener('input', e => { SEARCH = e.target.value.toLowerCase().trim(); applyFilters(); applyGridFilters(); });
        document.getElementById('xc-sort').addEventListener('change', e => { SORT_MODE = e.target.value; applySort(); applyGridFilters(); });
        document.getElementById('xc-gal').addEventListener('change', e => { GALLERY_FILTER = e.target.value; applyFilters(); applyGridFilters(); });
        document.getElementById('xc-save-search').addEventListener('click', saveSearch);
        document.getElementById('xc-grid-btn').addEventListener('click', toggleGrid);
        document.getElementById('xc-reload-btn').addEventListener('click', () => {
            // force-refresh visible rows (bypass cache), keep scroll & view mode
            document.querySelectorAll('[data-xc-user]').forEach(el => { el.__xcDone = false; });
            if (gridView) { renderGalleryDropdown().then(renderGrid); } else { processVisible(true); }
            setStatus('Reloading...');
        });
        document.getElementById('xc-hide').addEventListener('click', () => p.style.display = 'none');
        document.getElementById('xc-sync-btn').addEventListener('click', () => {
            SYNC_ENABLED = !SYNC_ENABLED;
            GM_setValue('xc_sync_enabled', SYNC_ENABLED);
            document.getElementById('xc-sync-btn').textContent = `Sync: ${SYNC_ENABLED ? 'ON' : 'OFF'}`;
            setStatus(SYNC_ENABLED ? `Sync → ${SYNC_SERVER}` : 'Sync off');
        });
        renderChips();
        renderGalleryDropdown();
    }
    const setStatus = (m) => { const s = document.getElementById('xc-status'); if (s) s.textContent = m; };

    // ---- saved searches ----
    const getSavedSearches = () => { try { return JSON.parse(GM_getValue('xc_saved_searches', '[]')); } catch (e) { return []; } };
    function saveSearch() {
        if (!SEARCH) return setStatus('Type a search first');
        const list = getSavedSearches();
        if (!list.includes(SEARCH)) { list.push(SEARCH); GM_setValue('xc_saved_searches', JSON.stringify(list)); }
        renderChips();
    }
    function delSearch(q) {
        GM_setValue('xc_saved_searches', JSON.stringify(getSavedSearches().filter(s => s !== q)));
        renderChips();
    }
    function renderChips() {
        const box = document.getElementById('xc-chips');
        if (!box) return;
        box.innerHTML = getSavedSearches().map(q =>
            `<span class="xc-chip" data-q="${q}">${q}<b data-del="${q}">x</b></span>`).join('');
        box.querySelectorAll('.xc-chip').forEach(ch => ch.addEventListener('click', e => {
            const del = e.target.dataset.del;
            if (del) return delSearch(del);
            const inp = document.getElementById('xc-search');
            inp.value = ch.dataset.q; inp.dispatchEvent(new Event('input', { bubbles: true }));
        }));
    }

    // ---- gallery dropdown ----
    async function renderGalleryDropdown() {
        await openDB();
        const all = await dbAll();
        const freq = {};
        all.forEach(rec => (rec.galleries || []).forEach(g => { freq[g.title] = (freq[g.title] || 0) + g.count; }));
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 200);
        const sel = document.getElementById('xc-gal');
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">All galleries</option>' +
            top.map(([t]) => `<option value="${t.replace(/"/g, '&quot;')}">${t}</option>`).join('');
        sel.value = cur;
    }

    // ============================== ROWS & BADGES ==============================
    function getRowUsername(row) {
        const nameEl = row.querySelector('.community_user_name[onclick*="user"]');
        if (nameEl) { const m = (nameEl.getAttribute('onclick') || '').match(/'user','([^']+)'/); if (m) return decodeURIComponent(m[1]); }
        const a = row.querySelector('a[href*="/user/"]');
        if (a) { const m = a.getAttribute('href').match(/\/user\/([^/?#]+)/); if (m) return decodeURIComponent(m[1]); }
        return null;
    }

    function badgeHTML(rec) {
        if (rec.fail) return `<div class="xcs-badge fail">unavailable (${rec.failCount} tries)</div>`;
        const top = (rec.galleries || []).filter(g => !/^my favorites$|^watch later$/i.test(g.title)).slice(0, 3);
        const list = top.length ? `<ul>${top.map(g => `<li>${g.title} <b>(${g.count})</b></li>`).join('')}</ul>`
                                : '<ul><li>No galleries</li></ul>';
        return `<div class="xcs-badge"><b>${rec.total || 0}</b> Videos${list}</div>`;
    }

    function injectBadge(container, rec) {
        const old = container.querySelector('.xcs-badge');
        if (old) old.remove();
        const body = container.querySelector('.community_user_body') || container.lastElementChild;
        if (!body) return;
        body.insertAdjacentHTML('beforeend', badgeHTML(rec));
    }

    function matchesFilters(rec, username) {
        if (!rec) return !(MIN_VIDEOS > 0 || SEARCH || GALLERY_FILTER);
        if ((rec.total || 0) < MIN_VIDEOS) return false;
        if (GALLERY_FILTER && !(rec.galleries || []).some(g => g.title === GALLERY_FILTER)) return false;
        if (SEARCH && !((rec.description || '').toLowerCase().includes(SEARCH) ||
                        (rec.galleries || []).some(g => g.title.toLowerCase().includes(SEARCH)))) return false;
        return true;
    }

    function applyFilters() {
        document.querySelectorAll('[data-xc-user]').forEach(el => {
            el.classList.toggle('xc-hidden', !matchesFilters(el.__xcRec, el.dataset.xcUser));
        });
        // grid re-renders only when filters/sort actually change (see applyGridFilters);
        // crawling completion must NOT reset the virtualized window
    }

    let lastFilterKey = '';
    function applyGridFilters() {
        if (!gridView) return;
        const key = [MIN_VIDEOS, SEARCH, GALLERY_FILTER, SORT_MODE].join('|');
        if (key === lastFilterKey) return;
        lastFilterKey = key;
        renderGrid(true);
    }

    function applySort() {
        if (SORT_MODE !== 'recent') return;
        if (gridView) return renderGrid();
        const list = document.getElementById('community_list');
        if (!list) return;
        const rows = [...list.querySelectorAll('.community_user[data-xc-user]')]
            .filter(r => r.__xcRec);
        rows.sort((a, b) => recActivity(b.__xcRec) - recActivity(a.__xcRec));
        rows.forEach(r => list.appendChild(r.parentElement === list ? r : r)); // rows are direct children
    }

    async function ensureData(el, username, force = false) {
        if (el.__xcLoading) return;
        el.__xcLoading = true;
        await openDB();
        let cached = force ? null : await dbGet(username);

        if (cached && isFailedOut(cached)) {
            el.__xcRec = { fail: true, failCount: cached.failCount };
            injectBadge(el, el.__xcRec);
            el.__xcLoading = false;
            applyFilters();
            return;
        }
        if (cached && cached.total !== undefined && !isStale(cached)) {
            el.__xcRec = cached;
            injectBadge(el, cached);
            el.__xcLoading = false;
            applyFilters();
            return;
        }

        setStatus(`Fetching ${username}...`);
        const folders = await fetchFolders(username);
        if (folders) {
            const { total, galleries } = parseFolders(folders);
            const rec = { username, total, galleries, lastCrawled: Date.now(), failCount: 0, description: (cached && cached.description) || '' };
            await dbPut(rec);
            pushToServer(rec);
            el.__xcRec = rec;
            injectBadge(el, rec);
        } else {
            const fc = ((cached && cached.failCount) || 0) + 1;
            const rec = { ...(cached || { username }), failCount: fc, lastAttempt: Date.now(), total: (cached && cached.total), galleries: (cached && cached.galleries) || [] };
            await dbPut(rec);
            el.__xcRec = { fail: true, failCount: fc, ...(cached && cached.total !== undefined ? {} : {}) };
            if (cached && cached.total !== undefined) { el.__xcRec = cached; injectBadge(el, cached); }
            else { el.__xcRec = { fail: true, failCount: fc }; injectBadge(el, el.__xcRec); }
        }
        el.__xcLoading = false;
        setStatus('Ready');
        await new Promise(r => setTimeout(r, CRAWL_DELAY_MS));
        applyFilters();
    }

    // ============================== GRID VIEW ==============================
    function toggleGrid() {
        gridView = !gridView;
        document.body.classList.toggle('xc-gridmode', gridView);
        document.getElementById('xc-grid-btn').classList.toggle('active', gridView);
        if (gridView) { buildGridShell(); lastFilterKey = ''; renderGrid(true); window.scrollTo(0, 0); }
        else { const g = document.getElementById('xc-grid'); if (g) g.remove(); }
    }

    function buildGridShell() {
        let g = document.getElementById('xc-grid');
        if (!g) { g = document.createElement('div'); g.id = 'xc-grid'; document.body.appendChild(g); }
        return g;
    }

    function fmtDate(epoch) {
        if (!epoch) return '';
        const d = new Date(epoch * 1000);
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    }

    function cardHTML(rec) {
        const gal = (rec.galleries || []);
        const show = gal.slice(0, 3);   // 3 slots (6 was too heavy)
        // pad to 3 so the row never shows blanks
        while (show.length < 3) show.push(null);
        const thumbs = show.map(g => g ? `
            <a class="xc-thumb" href="/favorites/${g.folderId}/0">
                ${g.avatar ? `<img loading="lazy" src="${g.avatar}" alt="">` : ''}
                <span class="ct">${g.count}</span><span class="ti">${g.title}</span>
            </a>` : `<div class="xc-thumb xc-blank"></div>`).join('');
        const act = recActivity(rec);
        return `<div class="xc-card" data-xc-user="${rec.username}">
            <a class="xc-card-head" href="/user/${encodeURIComponent(rec.username)}">
              <span class="xc-avatar">${rec.username.charAt(0).toUpperCase()}</span>
              <span class="nm">${rec.username}</span><span class="tv">${rec.total} videos</span>
            </a>
            <div class="xc-dates">last activity: ${act ? fmtDate(act) : 'unknown'}</div>
            <div class="xc-thumbs">${thumbs}</div>
        </div>`;
    }

    // ---- virtualized grid: render only a window of cards, expand on scroll ----
    let gridRecords = [];     // full filtered+sorted record list
    let gridRendered = 0;     // how many cards currently in DOM
    const GRID_CHUNK = 30;    // render 30 more cards per batch (~10 rows)
    let gridLoadingMore = false;

    async function renderGrid(reset = true) {
        const g = document.getElementById('xc-grid');
        if (!g || !gridView) return;
        if (reset) { gridRendered = 0; }
        await openDB();
        const all = await dbAll();
        const filtered = all.filter(rec => !isFailedOut(rec) || rec.total !== undefined)
                            .filter(rec => matchesFilters({ ...rec, description: rec.description || '' }, rec.username))
                            .filter(rec => !GALLERY_FILTER || (rec.galleries || []).some(x => x.title === GALLERY_FILTER));
        if (SORT_MODE === 'recent') filtered.sort((a, b) => recActivity(b) - recActivity(a));
        else filtered.sort((a, b) => (b.total || 0) - (a.total || 0));
        gridRecords = filtered;

        if (reset) {
            const firstBatch = gridRecords.slice(0, GRID_CHUNK);
            g.innerHTML = firstBatch.map(cardHTML).join('') ||
                '<div class="xc-empty">No users match. Scroll the normal list to crawl more, or clear filters.</div>';
            gridRendered = firstBatch.length;
            // sentinel at the bottom drives infinite expansion
            let sentinel = document.getElementById('xc-grid-sentinel');
            if (!sentinel) {
                sentinel = document.createElement('div');
                sentinel.id = 'xc-grid-sentinel';
                sentinel.style.cssText = 'grid-column:1/-1;height:10px;';
                g.appendChild(sentinel);
            }
        } else {
            // append next chunk (keep sentinel last)
            const sentinel = document.getElementById('xc-grid-sentinel');
            if (sentinel) sentinel.remove();
            const chunk = gridRecords.slice(gridRendered, gridRendered + GRID_CHUNK);
            g.insertAdjacentHTML('beforeend', chunk.map(cardHTML).join(''));
            gridRendered += chunk.length;
            if (sentinel && gridRendered < gridRecords.length) g.appendChild(sentinel);
        }

        // card heads are real <a href="/user/..."> — left-click routes via SPA, middle/right click native
        g.querySelectorAll('.xc-card-head').forEach(h => {
            if (h.__xcHooked) return;
            h.__xcHooked = true;
            h.addEventListener('click', e => {
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // let browser handle modified clicks
                e.preventDefault();
                try { routing.set(['user', h.closest('.xc-card').dataset.xcUser], {}); } catch (err) { location.href = h.getAttribute('href'); }
            });
        });
    }

    // infinite expansion for the virtualized grid
    setInterval(() => {
        if (!gridView) return;
        const sentinel = document.getElementById('xc-grid-sentinel');
        if (!sentinel || gridLoadingMore || gridRendered >= gridRecords.length) return;
        const b = sentinel.getBoundingClientRect();
        if (b.top < window.innerHeight + 600) {
            gridLoadingMore = true;
            Promise.resolve(renderGrid(false))
                .catch(err => console.warn('[xc35] grid expand failed:', err && err.message))
                .finally(() => { gridLoadingMore = false; });
        }
    }, 400);

    // ============================== VISIBILITY ENGINE ==============================
    // IntersectionObserver is unreliable on this site (never fires); use rect-based polling instead.
    function processVisible(force = false) {
        document.querySelectorAll('[data-xc-user]').forEach(row => {
            if (row.__xcLoading) return;
            if (!force && row.__xcDone) return;
            const b = row.getBoundingClientRect();
            if (b.top < window.innerHeight + 400 && b.bottom > -400) {
                ensureData(row, row.dataset.xcUser, force).then(() => { row.__xcDone = true; });
            }
        });
    }
    let pvTimer = setInterval(processVisible, 1500);
    window.addEventListener('scroll', () => requestAnimationFrame(processVisible), { passive: true });

    function registerRow(row) {
        if (row.dataset.xcUser) return;
        const u = getRowUsername(row);
        if (!u) return;
        row.dataset.xcUser = u;
    }

    function scan() {
        document.querySelectorAll('.community_user').forEach(registerRow);
    }

    // ============================== SCROLL RESTORE ==============================
    const SCROLL_KEY = 'xc-scroll:' + location.pathname;
    let scrollSaveTimer = null;
    window.addEventListener('scroll', () => {
        if (gridView) return;
        clearTimeout(scrollSaveTimer);
        scrollSaveTimer = setTimeout(() => sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY))), 300);
    }, { passive: true });
    function restoreScroll() {
        const y = parseInt(sessionStorage.getItem(SCROLL_KEY) || '0', 10);
        if (y > 100) { setStatus('Restoring position...'); window.scrollTo(0, y); setTimeout(() => setStatus('Ready'), 1500); }
    }

    // ============================== STATE PERSIST (survive SPA nav to gallery & back) ==============================
    function saveState() {
        try {
            const prev = JSON.parse(sessionStorage.getItem('xc_state') || '{}');
            const cur = Math.round(window.scrollY);
            // keep the highest known scroll — page unload fires scroll events with 0
            const scroll = gridView ? 0 : Math.max(cur, (prev.gridView === gridView ? (prev.scroll || 0) : 0));
            sessionStorage.setItem('xc_state', JSON.stringify({
                gridView, MIN_VIDEOS, SEARCH, GALLERY_FILTER, SORT_MODE,
                scroll,
                scrollRestore: true
            }));
        } catch (e) {}
    }
    // save on every scroll + before leaving the page
    window.addEventListener('scroll', () => { if (!scrollSavePending) { scrollSavePending = true; setTimeout(() => { scrollSavePending = false; saveState(); }, 500); } }, { passive: true });
    let scrollSavePending = false;
    window.addEventListener('pagehide', saveState);
    setInterval(saveState, 4000); // safety net for SPA soft-navigations that skip events

    function restoreState() {
        let st = null;
        try { st = JSON.parse(sessionStorage.getItem('xc_state') || 'null'); } catch (e) {}
        if (!st) return;
        MIN_VIDEOS = st.MIN_VIDEOS || 0;
        SEARCH = st.SEARCH || '';
        GALLERY_FILTER = st.GALLERY_FILTER || '';
        SORT_MODE = st.SORT_MODE || 'default';
        const minI = document.getElementById('xc-min'); if (minI) minI.value = MIN_VIDEOS;
        const sI = document.getElementById('xc-search'); if (sI) sI.value = SEARCH;
        const gI = document.getElementById('xc-gal');
        if (gI && GALLERY_FILTER) { gI.value = GALLERY_FILTER; }
        const soI = document.getElementById('xc-sort'); if (soI) soI.value = SORT_MODE;
        if (st.gridView && !gridView) toggleGrid();
        if (st.scrollRestore && st.scroll > 100) {
            let tries = 0;
            const wait = setInterval(() => {
                tries++;
                const ready = gridView ? document.querySelectorAll('#xc-grid .xc-card').length > 3
                                       : document.querySelectorAll('[data-xc-user]').length > 3;
                if (ready || tries > 30) { clearInterval(wait); window.scrollTo(0, st.scroll); }
            }, 200);
        }
    }

    // ============================== BOOT ==============================
    const mo = new MutationObserver(() => scan());
    const startMo = setInterval(() => {
        if (document.body) {
            clearInterval(startMo);
            mo.observe(document.body, { childList: true, subtree: true });
            scan();
            initPanel();
            let tries = 0;
            const waitRows = setInterval(() => {
                tries++;
                if (document.querySelectorAll('[data-xc-user]').length > 3 || tries > 25) { clearInterval(waitRows); restoreState(); }
            }, 200);
        }
    }, 200);

    console.log('[xc35] community stats ready');
    // debug handle
    window.__xcDebug = {
        get state() { return { gridView, gridRendered, records: gridRecords.length, loading: gridLoadingMore }; },
        expand: () => renderGrid(false)
    };
})();


