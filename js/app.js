/**
 * Deutsch Hörer 主应用
 */
const App = (function() {

    let currentPage = 'search';
    let currentFilter = 'all';
    let currentPlaylistView = null; // 当前查看的播放夹ID
    let audioContext = null;

    // ===== 初始化 =====
    function init() {
        // 初始化主题
        const theme = Storage.getTheme();
        document.documentElement.setAttribute('data-theme', theme);

        // 初始化 TTS
        TTS.init();

        // 初始化播放器
        AudioPlayer.init();
        AudioPlayer.setCallbacks({
            onStateChange: updatePlayerUI,
            onTrackChange: updatePlayerUI,
            onProgress: updatePlayerUI,
        });

        // 绑定事件
        bindNavEvents();
        bindSearchEvents();
        bindLibraryEvents();
        bindPlaylistEvents();
        bindReviewEvents();
        bindPlayerEvents();
        bindModalEvents();

        // 加载首页
        renderSearchResults('');

        // 自动收藏新词条（标记为"用户提交批次"）
        autoSaveBatchItems();

        // 检查复习提醒
        checkReviewReminder();

        // 显示已保存的项目数
        updateBadges();
    }

    // ===== 导航 =====
    function bindNavEvents() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                navigateTo(page);
            });
        });
    }

    /**
     * 自动收藏词库中标记为"用户提交批次"的新词条
     * 并直接加入默认播放夹
     * 已收藏的不会重复添加
     */
    function autoSaveBatchItems() {
        // 找词库中"用户提交的实用短句"区块的条目
        const batchItems = DICTIONARY.filter(item =>
            item.de === 'Ich muss gleich wieder los.' ||
            item.de === 'Ich weiß gar nicht, was ich damit machen soll.' ||
            item.de === 'Kannst du das vorstellen?' ||
            item.de === 'Was denken die sich nur?' ||
            item.de === 'Mach ich.' ||
            item.de === 'Aber nur unter einer Bedingung.' ||
            item.de === 'Pass auf.' ||
            item.de === 'Das geht!' ||
            item.de === 'Spitze!' ||
            item.de === "Geht's dir gut?" ||
            item.de === 'Oh, Quatsch!' ||
            item.de === "Das war's." ||
            item.de === 'Ihr seid großartig!' ||
            item.de === 'Bin schon ganz aufgeregt!' ||
            item.de === 'Was kann ich für Sie tun?' ||
            item.de === 'Wie du willst!' ||
            item.de === 'Ich bin ziemlich müde.' ||
            item.de === 'Hör zu!' ||
            item.de === 'Zum Wohl!' ||
            item.de === 'Herzlichen Glückwunsch!' ||
            item.de === 'Anders als Andere,' ||
            item.de === 'Alles in Ordnung?' ||
            item.de === 'Sehen Sie mal da?' ||
            item.de === 'Schön, dass Sie wieder da sind!' ||
            item.de === 'Bin ich nicht!'
        );

        let newCount = 0;
        const defaultPlaylist = ensureDefaultPlaylist();

        batchItems.forEach(item => {
            if (!Storage.isSaved(item.de)) {
                // 新内容：保存并加入播放夹
                const result = Storage.saveItem(item);
                if (result.success && defaultPlaylist) {
                    Storage.addToPlaylist(defaultPlaylist.id, result.item.id);
                    newCount++;
                }
            } else {
                // 已收藏但可能不在播放夹里，补加入
                const saved = Storage.getItemByDe(item.de);
                if (saved && defaultPlaylist) {
                    const pl = Storage.getPlaylists().find(p => p.id === defaultPlaylist.id);
                    if (pl && !pl.items.includes(saved.id)) {
                        Storage.addToPlaylist(defaultPlaylist.id, saved.id);
                        newCount++;
                    }
                }
            }
        });

        if (newCount > 0) {
            console.log(`Auto-saved ${newCount} batch items to playlist`);
        }
    }

    /**
     * 确保有一个默认播放夹，没有就创建
     */
    function ensureDefaultPlaylist() {
        let playlists = Storage.getPlaylists();
        // 查找名为"我的播放夹"的默认播放夹
        let pl = playlists.find(p => p.name === '我的播放夹');
        if (!pl) {
            pl = Storage.createPlaylist('我的播放夹');
        }
        return pl;
    }

    /**
     * 保存内容并自动加入默认播放夹
     */
    function saveToDefaultPlaylist(item) {
        const result = Storage.saveItem(item);
        if (result.success) {
            const pl = ensureDefaultPlaylist();
            if (pl) {
                Storage.addToPlaylist(pl.id, result.item.id);
            }
        }
        return result;
    }

    function navigateTo(page) {
        currentPage = page;
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('page-' + page).classList.add('active');
        document.querySelector(`.nav-btn[data-page="${page}"]`).classList.add('active');

        // 渲染对应页面
        if (page === 'library') renderLibrary();
        else if (page === 'playlists') renderPlaylists();
        else if (page === 'review') renderReview();
        else if (page === 'player') renderPlayerPage();
    }

    // ===== 搜索 =====
    function bindSearchEvents() {
        const input = document.getElementById('search-input');
        const btn = document.getElementById('search-btn');

        btn.addEventListener('click', () => {
            renderSearchResults(input.value);
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') renderSearchResults(input.value);
        });

        // 实时搜索
        let debounceTimer;
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                renderSearchResults(input.value);
            }, 300);
        });

        // 筛选
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                renderSearchResults(input.value);
            });
        });

        // 手动录入
        document.getElementById('manual-save-btn').addEventListener('click', () => {
            const de = document.getElementById('manual-deutsch').value.trim();
            const zh = document.getElementById('manual-chinese').value.trim();
            const en = document.getElementById('manual-english').value.trim();

            if (!de) {
                showToast('请输入德语内容');
                return;
            }

            const result = saveToDefaultPlaylist({
                de, zh, en,
                type: de.length > 30 ? 'sentence' : (de.split(/\s+/).length > 3 ? 'phrase' : 'word'),
                level: 'A1',
            });

            if (result.success) {
                showToast('已保存到播放夹');
                document.getElementById('manual-deutsch').value = '';
                document.getElementById('manual-chinese').value = '';
                document.getElementById('manual-english').value = '';
                updateBadges();
            } else {
                showToast('该内容已存在');
            }
        });
    }

    function renderSearchResults(query) {
        const container = document.getElementById('search-results');
        let results = DICTIONARY;

        // 筛选类型
        if (currentFilter !== 'all') {
            results = results.filter(i => i.type === currentFilter);
        }

        // 搜索
        if (query) {
            const q = query.toLowerCase();
            results = results.filter(i =>
                i.de.toLowerCase().includes(q) ||
                i.zh.toLowerCase().includes(q) ||
                i.en.toLowerCase().includes(q)
            );
        }

        // 限制显示数量
        const limit = query ? 100 : 50;
        results = results.slice(0, limit);

        if (results.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                    <p>未找到结果，试试手动录入</p>
                </div>
            `;
            return;
        }

        container.innerHTML = results.map(item => createCardHTML(item)).join('');

        // 绑定卡片事件
        bindCardEvents(container);
    }

    function createCardHTML(item) {
        const saved = Storage.isSaved(item.de);
        const typeBadge = `<span class="card-type-badge badge-${item.type}">${typeLabel(item.type)} · ${item.level}</span>`;

        return `
            <div class="card" data-id="${item.de}">
                ${typeBadge}
                <div class="card-deutsch">${escapeHtml(item.de)}</div>
                <div class="card-translation">
                    <span class="cn">${escapeHtml(item.zh)}</span>
                    ${item.en ? `<span class="en">${escapeHtml(item.en)}</span>` : ''}
                </div>
                <div class="card-actions">
                    <button class="play-btn" data-action="play">▶ 播放</button>
                    ${saved
                        ? '<button class="saved-btn" data-action="saved">✓ 已收藏</button>'
                        : '<button class="save-btn" data-action="save">+ 收藏</button>'
                    }
                </div>
            </div>
        `;
    }

    function typeLabel(type) {
        return { word: '单词', phrase: '短语', sentence: '短句', quote: '语录' }[type] || type;
    }

    function bindCardEvents(container) {
        container.querySelectorAll('.card').forEach(card => {
            const playBtn = card.querySelector('[data-action="play"]');
            const saveBtn = card.querySelector('[data-action="save"]');

            const itemId = card.dataset.id;
            const item = DICTIONARY.find(d => d.de === itemId);

            if (playBtn) {
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (item) TTS.speak(item.de, Storage.getSettings().rate);
                });
            }

            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!item) return;
                    const result = saveToDefaultPlaylist(item);
                    if (result.success) {
                        showToast('已加入播放夹');
                        saveBtn.className = 'saved-btn';
                        saveBtn.textContent = '✓ 已加入';
                        saveBtn.dataset.action = 'saved';
                        updateBadges();
                    } else {
                        showToast('已存在');
                    }
                });
            }
        });
    }

    // ===== 收藏库 =====
    function bindLibraryEvents() {
        document.getElementById('library-sort').addEventListener('change', renderLibrary);
        document.getElementById('library-filter').addEventListener('input', renderLibrary);
    }

    function renderLibrary() {
        const container = document.getElementById('library-list');
        let items = Storage.getSavedItems();
        const sort = document.getElementById('library-sort').value;
        const filter = document.getElementById('library-filter').value.toLowerCase();

        // 筛选
        if (filter) {
            items = items.filter(i =>
                i.de.toLowerCase().includes(filter) ||
                i.zh.toLowerCase().includes(filter) ||
                (i.en && i.en.toLowerCase().includes(filter))
            );
        }

        // 排序
        switch(sort) {
            case 'time-desc': items.sort((a,b) => b.createdAt - a.createdAt); break;
            case 'time-asc': items.sort((a,b) => a.createdAt - b.createdAt); break;
            case 'importance': items.sort((a,b) => b.importance - a.importance); break;
            case 'alpha': items.sort((a,b) => a.de.localeCompare(b.de)); break;
        }

        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>还没有收藏任何内容</p>
                    <p style="margin-top:8px;font-size:13px">去搜索页收藏或手动录入吧</p>
                </div>
            `;
            return;
        }

        container.innerHTML = items.map(item => createLibraryCardHTML(item)).join('');
        bindLibraryCardEvents(container);
    }

    function createLibraryCardHTML(item) {
        const stars = [1,2,3].map(n =>
            `<span class="star ${n <= item.importance ? 'active' : ''}" data-star="${n}">★</span>`
        ).join('');

        return `
            <div class="card" data-id="${item.id}">
                <span class="card-type-badge badge-${item.type}">${typeLabel(item.type)} · ${item.level}</span>
                <div class="card-deutsch">${escapeHtml(item.de)}</div>
                <div class="card-translation">
                    <span class="cn">${escapeHtml(item.zh)}</span>
                    ${item.en ? `<span class="en">${escapeHtml(item.en)}</span>` : ''}
                </div>
                <div class="card-actions">
                    <button class="play-btn" data-action="play">▶ 播放</button>
                    <button class="important-btn" data-action="detail">详情</button>
                    <div class="stars">${stars}</div>
                </div>
            </div>
        `;
    }

    function bindLibraryCardEvents(container) {
        container.querySelectorAll('.card').forEach(card => {
            const id = card.dataset.id;
            const item = Storage.getItem(id);

            card.querySelector('[data-action="play"]').addEventListener('click', (e) => {
                e.stopPropagation();
                TTS.speak(item.de, Storage.getSettings().rate);
            });

            // 星级
            card.querySelectorAll('.star').forEach(star => {
                star.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const n = parseInt(star.dataset.star);
                    Storage.updateItem(id, { importance: n });
                    renderLibrary();
                });
            });

            // 详情
            card.querySelector('[data-action="detail"]').addEventListener('click', (e) => {
                e.stopPropagation();
                showDetailModal(item);
            });

            // 点击卡片也可以打开详情
            card.addEventListener('click', () => {
                showDetailModal(item);
            });
        });
    }

    // ===== 详情弹窗 =====
    function showDetailModal(item) {
        const overlay = document.getElementById('detail-overlay');
        const content = document.getElementById('detail-content');
        const playlists = Storage.getPlaylists();

        content.innerHTML = `
            <div class="detail-section">
                <div class="detail-label">德语</div>
                <div class="detail-value deutsch">${escapeHtml(item.de)}</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">中文</div>
                <div class="detail-value">${escapeHtml(item.zh)}</div>
            </div>
            ${item.en ? `
            <div class="detail-section">
                <div class="detail-label">英文</div>
                <div class="detail-value">${escapeHtml(item.en)}</div>
            </div>` : ''}
            <div class="detail-section">
                <div class="detail-label">类型 / 级别</div>
                <div class="detail-value">${typeLabel(item.type)} · ${item.level}</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">重要度</div>
                <div class="detail-value">${'★'.repeat(item.importance)}${'☆'.repeat(3-item.importance)}</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">艾宾浩斯复习</div>
                <div class="detail-value">${Ebbinghaus.getStageName(item.reviewStage)}（${item.reviewCount}次）</div>
            </div>

            ${playlists.length > 0 ? `
            <div class="detail-section">
                <div class="detail-label">加入播放夹</div>
                <select id="detail-playlist-select" style="margin-top:8px;">
                    ${playlists.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${p.items.length})</option>`).join('')}
                </select>
            </div>` : ''}

            <div class="detail-actions">
                <button class="play" data-action="play">▶ 播放</button>
                ${playlists.length > 0 ? '<button data-action="add-to-playlist">加入播放夹</button>' : ''}
                <button data-action="record">🎙 跟读录音</button>
                <button class="danger" data-action="delete">删除</button>
            </div>

            <div id="recorder-area" style="margin-top:16px;"></div>
        `;

        overlay.classList.remove('hidden');

        // 绑定事件
        content.querySelector('[data-action="play"]').addEventListener('click', () => {
            TTS.speak(item.de, Storage.getSettings().rate);
        });

        const addBtn = content.querySelector('[data-action="add-to-playlist"]');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const select = content.querySelector('#detail-playlist-select');
                Storage.addToPlaylist(select.value, item.id);
                showToast('已加入播放夹');
            });
        }

        const recBtn = content.querySelector('[data-action="record"]');
        if (recBtn) {
            recBtn.addEventListener('click', () => showRecorder(item));
        }

        content.querySelector('[data-action="delete"]').addEventListener('click', () => {
            if (confirm('确认删除？')) {
                Storage.deleteItem(item.id);
                overlay.classList.add('hidden');
                renderLibrary();
                updateBadges();
                showToast('已删除');
            }
        });
    }

    function showRecorder(item) {
        const area = document.getElementById('recorder-area');
        area.innerHTML = `
            <div class="recorder-section" style="margin-top:0;box-shadow:none;background:var(--bg);">
                <div class="recorder-title">跟读录音</div>
                <p style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">先听原音，然后录下你的发音进行对比</p>
                <div class="recorder-controls">
                    <button class="rec-btn play" id="rec-original">▶ 原音</button>
                    <button class="rec-btn" id="rec-start">🎙 开始录音</button>
                </div>
                <div id="rec-result" style="margin-top:12px;"></div>
            </div>
        `;

        document.getElementById('rec-original').addEventListener('click', () => {
            TTS.speak(item.de, Storage.getSettings().rate);
        });

        const startBtn = document.getElementById('rec-start');
        startBtn.addEventListener('click', async () => {
            if (Recorder.getIsRecording()) {
                Recorder.stopRecording();
            } else {
                const ok = await Recorder.startRecording();
                if (ok) {
                    startBtn.textContent = '⏹ 停止录音';
                    startBtn.classList.add('recording');
                } else {
                    showToast('无法访问麦克风');
                }
            }
        });

        Recorder.onStop((url) => {
            startBtn.textContent = '🎙 开始录音';
            startBtn.classList.remove('recording');
            document.getElementById('rec-result').innerHTML = `
                <p style="font-size:14px;color:var(--success);margin-bottom:8px;">✓ 录音完成</p>
                <div class="recorder-controls">
                    <button class="rec-btn play" id="rec-play">▶ 播放录音</button>
                    <button class="rec-btn play" id="rec-replay" style="background:var(--accent)">▶ 对比原音</button>
                </div>
            `;
            document.getElementById('rec-play').addEventListener('click', () => {
                Recorder.playLastRecording();
            });
            document.getElementById('rec-replay').addEventListener('click', () => {
                TTS.speak(item.de, Storage.getSettings().rate);
                setTimeout(() => Recorder.playLastRecording(), 2000);
            });
        });
    }

    // ===== 播放夹 =====
    function bindPlaylistEvents() {
        document.getElementById('new-playlist-btn').addEventListener('click', () => {
            showCreatePlaylistModal();
        });
    }

    function renderPlaylists() {
        const container = document.getElementById('playlists-list');
        const playlists = Storage.getPlaylists();

        if (playlists.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>还没有播放夹</p>
                    <p style="margin-top:8px;font-size:13px">点击右上角新建播放夹</p>
                </div>
            `;
            return;
        }

        container.innerHTML = playlists.map(pl => {
            const itemCount = pl.items.length;
            const progress = Storage.getPlayProgressFor(pl.id);
            const progressText = progress ? `已播放到第${progress.index + 1}条` : '未播放';

            return `
                <div class="playlist-card" data-id="${pl.id}">
                    <div class="playlist-card-header">
                        <div>
                            <div class="playlist-name">${escapeHtml(pl.name)}</div>
                            <div class="playlist-meta">${itemCount} 条 · ${progressText}</div>
                        </div>
                    </div>
                    <div class="playlist-actions">
                        <button class="play-all" data-action="play-all" data-id="${pl.id}">▶ 播放</button>
                        <button data-action="edit" data-id="${pl.id}">管理</button>
                        <button class="delete" data-action="delete" data-id="${pl.id}">删除</button>
                    </div>
                </div>
            `;
        }).join('');

        // 绑定事件
        container.querySelectorAll('.playlist-card').forEach(card => {
            card.querySelector('[data-action="play-all"]').addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                playPlaylist(id);
            });

            card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                showPlaylistDetail(id);
            });

            card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                if (confirm('确认删除此播放夹？')) {
                    Storage.deletePlaylist(id);
                    renderPlaylists();
                    showToast('已删除');
                }
            });
        });
    }

    function showCreatePlaylistModal() {
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');

        content.innerHTML = `
            <h2>新建播放夹</h2>
            <input type="text" id="new-playlist-name" placeholder="播放夹名称（如：公交车上）" autofocus>
            <div class="modal-btn-row">
                <button class="btn-cancel" id="modal-cancel">取消</button>
                <button class="btn-primary" id="modal-confirm">创建</button>
            </div>
        `;

        overlay.classList.remove('hidden');

        document.getElementById('modal-confirm').addEventListener('click', () => {
            const name = document.getElementById('new-playlist-name').value.trim();
            if (name) {
                Storage.createPlaylist(name);
                overlay.classList.add('hidden');
                renderPlaylists();
                showToast('已创建');
            }
        });

        document.getElementById('modal-cancel').addEventListener('click', () => {
            overlay.classList.add('hidden');
        });
    }

    function showPlaylistDetail(playlistId) {
        currentPlaylistView = playlistId;
        const pl = Storage.getPlaylists().find(p => p.id === playlistId);
        if (!pl) return;

        const items = pl.items.map(id => Storage.getItem(id)).filter(Boolean);
        const container = document.getElementById('playlists-list');

        container.innerHTML = `
            <div class="playlist-detail-header">
                <button class="back-btn" id="pl-back">‹</button>
                <h2>${escapeHtml(pl.name)}</h2>
            </div>
            <div style="margin-bottom:12px;font-size:14px;color:var(--text-secondary);">
                共 ${items.length} 条内容
                <button class="play-all" data-action="play-all" style="margin-left:12px;background:var(--accent);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;">▶ 播放全部</button>
            </div>
            ${items.length === 0 ? `
                <div class="empty-state">
                    <p>播放夹是空的</p>
                    <p style="margin-top:8px;font-size:13px">在收藏库中点击详情，加入播放夹</p>
                </div>
            ` : items.map((item, i) => `
                <div class="card" data-id="${item.id}" data-index="${i}">
                    <div class="card-deutsch">${escapeHtml(item.de)}</div>
                    <div class="card-translation">
                        <span class="cn">${escapeHtml(item.zh)}</span>
                    </div>
                    <div class="card-actions">
                        <button class="play-btn" data-action="play">▶</button>
                        <button class="important-btn" data-action="remove">移出</button>
                        <span class="sort-handle" data-action="up">↑</span>
                        <span class="sort-handle" data-action="down">↓</span>
                    </div>
                </div>
            `).join('')}
        `;

        document.getElementById('pl-back').addEventListener('click', () => {
            renderPlaylists();
        });

        container.querySelector('[data-action="play-all"]').addEventListener('click', () => {
            playPlaylist(playlistId);
        });

        container.querySelectorAll('.card').forEach(card => {
            const id = card.dataset.id;
            const index = parseInt(card.dataset.index);

            card.querySelector('[data-action="play"]').addEventListener('click', (e) => {
                e.stopPropagation();
                const item = Storage.getItem(id);
                TTS.speak(item.de, Storage.getSettings().rate);
            });

            card.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
                e.stopPropagation();
                Storage.removeFromPlaylist(playlistId, id);
                showPlaylistDetail(playlistId);
                showToast('已移出');
            });

            card.querySelector('[data-action="up"]').addEventListener('click', (e) => {
                e.stopPropagation();
                moveItem(playlistId, index, -1);
            });

            card.querySelector('[data-action="down"]').addEventListener('click', (e) => {
                e.stopPropagation();
                moveItem(playlistId, index, 1);
            });
        });
    }

    function moveItem(playlistId, index, direction) {
        const pl = Storage.getPlaylists().find(p => p.id === playlistId);
        if (!pl) return;
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= pl.items.length) return;

        const items = [...pl.items];
        [items[index], items[newIndex]] = [items[newIndex], items[index]];
        Storage.reorderPlaylist(playlistId, items);
        showPlaylistDetail(playlistId);
    }

    function playPlaylist(playlistId) {
        const pl = Storage.getPlaylists().find(p => p.id === playlistId);
        if (!pl || pl.items.length === 0) {
            showToast('播放夹是空的');
            return;
        }

        const items = pl.items.map(id => Storage.getItem(id)).filter(Boolean);
        if (items.length === 0) {
            showToast('没有可播放的内容');
            return;
        }

        // 检查是否有上次进度
        const progress = Storage.getPlayProgressFor(playlistId);
        let startIndex = 0;
        if (progress && progress.index < items.length) {
            startIndex = progress.index;
        }

        AudioPlayer.playQueue(items, startIndex, playlistId);
        navigateTo('player');
        showMiniPlayer();
    }

    // ===== 播放器页面 =====
    function bindPlayerEvents() {
        document.getElementById('mini-player-play').addEventListener('click', () => {
            AudioPlayer.togglePlayPause();
        });

        document.getElementById('mini-player-next').addEventListener('click', () => {
            AudioPlayer.next();
        });
    }

    function renderPlayerPage() {
        const state = AudioPlayer.getState();
        const container = document.getElementById('player-view');

        if (!state.currentTrack) {
            container.innerHTML = `
                <div class="player-header">
                    <h2>播放器</h2>
                </div>
                <div class="empty-state" style="padding:40px 20px;">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width:60px;height:60px;opacity:0.3;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                    <p>当前没有播放内容</p>
                    <p style="margin-top:8px;font-size:13px">从播放夹开始播放</p>
                </div>
                <div class="player-settings" style="margin-top:20px;">
                    <div class="queue-title" style="margin-bottom:10px;">🔊 发音引擎设置</div>
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">
                        词库内容已有高质量预生成音频。<br>
                        手动录入内容如需更好音质，请部署 TTS 代理（见下方说明）。
                    </div>
                    <input type="text" id="tts-proxy-url" placeholder="TTS 代理 URL（可选）" 
                        value="${TTS.getTtsProxyUrl() || ''}" 
                        style="width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;background:var(--surface);color:var(--text);outline:none;margin-bottom:8px;">
                    <button id="tts-proxy-save" style="background:var(--accent);color:#fff;border:none;border-radius:10px;padding:10px;width:100%;font-size:14px;font-weight:600;cursor:pointer;">保存代理设置</button>
                    <details style="margin-top:10px;font-size:13px;color:var(--text-secondary);">
                        <summary style="cursor:pointer;font-weight:600;">如何部署 TTS 代理？</summary>
                        <div style="margin-top:8px;line-height:1.6;">
                            <p><b>方法：部署 Cloudflare Worker（免费）</b></p>
                            <p>1. 注册 <a href="https://dash.cloudflare.com" target="_blank">Cloudflare</a> 账号</p>
                            <p>2. 进入 Workers & Pages → Create Worker</p>
                            <p>3. 粘贴项目中的 <code>cloudflare-worker-tts.js</code> 代码</p>
                            <p>4. 保存并部署</p>
                            <p>5. 复制 Worker URL 填入上方输入框</p>
                            <p style="margin-top:6px;color:var(--text-tertiary);">不配置也能用，手动录入内容会用系统语音朗读。</p>
                        </div>
                    </details>
                </div>
            `;
            const proxySaveBtn = document.getElementById('tts-proxy-save');
            if (proxySaveBtn) {
                proxySaveBtn.addEventListener('click', () => {
                    const url = document.getElementById('tts-proxy-url').value.trim();
                    TTS.setTtsProxyUrl(url);
                    showToast(url ? '代理设置已保存' : '代理已清除');
                });
            }
            return;
        }

        const track = state.currentTrack;
        const settings = Storage.getSettings();

        container.innerHTML = `
            <div class="player-header">
                <h2>${state.playlistId ? escapeHtml(Storage.getPlaylists().find(p=>p.id===state.playlistId)?.name || '播放中') : '播放中'}</h2>
            </div>

            <div class="player-current">
                <div class="player-deutsch">${escapeHtml(track.de)}</div>
                <div class="player-translation">
                    ${escapeHtml(track.zh)}
                    ${track.en ? `<span class="en">${escapeHtml(track.en)}</span>` : ''}
                </div>
                <div class="player-counter">
                    第 ${state.currentIndex + 1} / ${state.queueLength} 条 ·
                    重复 ${state.currentRepeat + 1} / ${state.repeatCount}
                </div>
            </div>

            <div class="player-controls">
                <button class="player-btn" id="player-prev" title="上一条">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                </button>
                <button class="player-btn main ${state.isPlaying ? 'playing' : ''}" id="player-play" title="播放/暂停">
                    ${state.isPlaying ?
                        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>' :
                        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
                    }
                </button>
                <button class="player-btn" id="player-next" title="下一条">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                </button>
            </div>

            <div class="player-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${((state.currentIndex + 1) / state.queueLength) * 100}%"></div>
                </div>
                <div class="progress-text">
                    <span>${state.currentIndex + 1} / ${state.queueLength}</span>
                    <span>${state.isPlaying ? '播放中' : '已暂停'}</span>
                </div>
            </div>

            <div class="player-settings">
                <div class="setting-row">
                    <span class="setting-label">语速</span>
                    <div class="setting-control">
                        <input type="range" id="setting-rate" min="0.5" max="2" step="0.1" value="${settings.rate}">
                        <span class="setting-value" id="setting-rate-val">${settings.rate.toFixed(1)}x</span>
                    </div>
                </div>
                <div class="setting-row">
                    <span class="setting-label">每条重复</span>
                    <div class="setting-control">
                        <input type="range" id="setting-repeat" min="1" max="10" step="1" value="${settings.repeatCount}">
                        <span class="setting-value" id="setting-repeat-val">${settings.repeatCount}次</span>
                    </div>
                </div>
                <div class="setting-row">
                    <span class="setting-label">间隔秒数</span>
                    <div class="setting-control">
                        <input type="range" id="setting-interval" min="0" max="10" step="1" value="${settings.intervalSec}">
                        <span class="setting-value" id="setting-interval-val">${settings.intervalSec}s</span>
                    </div>
                </div>
                <div class="setting-row">
                    <span class="setting-label">自动下一条</span>
                    <div class="setting-control">
                        <label style="display:flex;align-items:center;cursor:pointer;">
                            <input type="checkbox" id="setting-autonext" ${settings.autoNext ? 'checked' : ''} style="width:20px;height:20px;">
                        </label>
                    </div>
                </div>
            </div>

            <div class="player-settings" style="margin-top:16px;">
                <div class="queue-title" style="margin-bottom:10px;">🔊 发音引擎设置</div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">
                    词库内容已有高质量预生成音频。<br>
                    手动录入内容如需更好音质，请部署 TTS 代理（见下方说明）。
                </div>
                <input type="text" id="tts-proxy-url" placeholder="TTS 代理 URL（可选）" 
                    value="${TTS.getTtsProxyUrl() || ''}" 
                    style="width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;background:var(--surface);color:var(--text);outline:none;margin-bottom:8px;">
                <button id="tts-proxy-save" style="background:var(--accent);color:#fff;border:none;border-radius:10px;padding:10px;width:100%;font-size:14px;font-weight:600;cursor:pointer;">保存代理设置</button>
                <details style="margin-top:10px;font-size:13px;color:var(--text-secondary);">
                    <summary style="cursor:pointer;font-weight:600;">如何部署 TTS 代理？</summary>
                    <div style="margin-top:8px;line-height:1.6;">
                        <p><b>方法：部署 Cloudflare Worker（免费）</b></p>
                        <p>1. 注册 <a href="https://dash.cloudflare.com" target="_blank">Cloudflare</a> 账号</p>
                        <p>2. 进入 Workers & Pages → Create Worker</p>
                        <p>3. 粘贴项目中的 <code>cloudflare-worker-tts.js</code> 代码</p>
                        <p>4. 保存并部署</p>
                        <p>5. 复制 Worker URL 填入上方输入框</p>
                        <p style="margin-top:6px;color:var(--text-tertiary);">不配置也能用，手动录入内容会用系统语音朗读。</p>
                    </div>
                </details>
            </div>

            ${state.queue.length > 1 ? `
            <div class="player-queue" style="margin-top:16px;">
                <div class="queue-title">播放队列</div>
                ${state.queue.map((item, i) => `
                    <div class="queue-item ${i === state.currentIndex ? 'current' : ''}" data-index="${i}">
                        <span class="q-num">${i + 1}</span>
                        <span class="q-text">${escapeHtml(item.de)}</span>
                        <button class="q-play" data-seek="${i}">▶</button>
                    </div>
                `).join('')}
            </div>` : ''}

            <div id="player-recorder-area"></div>
        `;

        // 绑定播放器事件
        document.getElementById('player-prev').addEventListener('click', () => AudioPlayer.prev());
        document.getElementById('player-next').addEventListener('click', () => AudioPlayer.next());
        document.getElementById('player-play').addEventListener('click', () => AudioPlayer.togglePlayPause());

        // 设置滑块
        const rateSlider = document.getElementById('setting-rate');
        rateSlider.addEventListener('input', () => {
            const val = parseFloat(rateSlider.value);
            document.getElementById('setting-rate-val').textContent = val.toFixed(1) + 'x';
            const s = Storage.getSettings();
            s.rate = val;
            Storage.saveSettings(s);
            AudioPlayer.setSettings(s);
        });

        const repeatSlider = document.getElementById('setting-repeat');
        repeatSlider.addEventListener('input', () => {
            const val = parseInt(repeatSlider.value);
            document.getElementById('setting-repeat-val').textContent = val + '次';
            const s = Storage.getSettings();
            s.repeatCount = val;
            Storage.saveSettings(s);
            AudioPlayer.setSettings(s);
        });

        const intervalSlider = document.getElementById('setting-interval');
        intervalSlider.addEventListener('input', () => {
            const val = parseInt(intervalSlider.value);
            document.getElementById('setting-interval-val').textContent = val + 's';
            const s = Storage.getSettings();
            s.intervalSec = val;
            Storage.saveSettings(s);
            AudioPlayer.setSettings(s);
        });

        document.getElementById('setting-autonext').addEventListener('change', (e) => {
            const s = Storage.getSettings();
            s.autoNext = e.target.checked;
            Storage.saveSettings(s);
            AudioPlayer.setSettings(s);
        });

        // TTS 代理设置
        const proxySaveBtn = document.getElementById('tts-proxy-save');
        if (proxySaveBtn) {
            proxySaveBtn.addEventListener('click', () => {
                const url = document.getElementById('tts-proxy-url').value.trim();
                TTS.setTtsProxyUrl(url);
                showToast(url ? '代理设置已保存' : '代理已清除');
            });
        }

        // 队列跳转
        container.querySelectorAll('.q-play').forEach(btn => {
            btn.addEventListener('click', () => {
                AudioPlayer.seekTo(parseInt(btn.dataset.seek));
            });
        });
    }

    function updatePlayerUI() {
        const state = AudioPlayer.getState();

        // 只更新播放器页面的关键信息，不重新渲染整个页面
        if (currentPage === 'player' && state.currentTrack) {
            // 更新当前条目信息（只在曲目变化时更新 DOM）
            const deutschEl = document.querySelector('.player-deutsch');
            const transEl = document.querySelector('.player-translation');
            const counterEl = document.querySelector('.player-counter');
            const playBtn = document.getElementById('player-play');

            if (deutschEl) deutschEl.textContent = state.currentTrack.de;
            if (transEl) {
                transEl.innerHTML = escapeHtml(state.currentTrack.zh) +
                    (state.currentTrack.en ? `<span class="en">${escapeHtml(state.currentTrack.en)}</span>` : '');
            }
            if (counterEl) {
                counterEl.textContent = `第 ${state.currentIndex + 1} / ${state.queueLength} 条 · 重复 ${state.currentRepeat + 1} / ${state.repeatCount}`;
            }
            // 更新播放按钮图标
            if (playBtn) {
                playBtn.classList.toggle('playing', state.isPlaying);
                playBtn.innerHTML = state.isPlaying
                    ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
                    : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
            }
            // 更新进度条
            const progressFill = document.querySelector('.progress-fill');
            if (progressFill) {
                progressFill.style.width = ((state.currentIndex + 1) / state.queueLength * 100) + '%';
            }
            const progressText = document.querySelector('.progress-text');
            if (progressText) {
                progressText.innerHTML = `<span>${state.currentIndex + 1} / ${state.queueLength}</span><span>${state.isPlaying ? '播放中' : '已暂停'}</span>`;
            }
        }
        updateMiniPlayer();
    }

    function updateMiniPlayer() {
        const state = AudioPlayer.getState();
        const mini = document.getElementById('mini-player');

        if (!state.currentTrack) {
            mini.classList.add('hidden');
            return;
        }

        mini.classList.remove('hidden');

        const info = document.getElementById('mini-player-info');
        info.innerHTML = `
            <div class="mini-deutsch">${escapeHtml(state.currentTrack.de)}</div>
            <div class="mini-sub">${state.currentIndex + 1}/${state.queueLength} · ${state.isPlaying ? '播放中' : '已暂停'}</div>
        `;

        const playBtn = document.getElementById('mini-player-play');
        playBtn.textContent = state.isPlaying ? '⏸' : '▶';
    }

    function showMiniPlayer() {
        updateMiniPlayer();
    }

    // ===== 复习页 =====
    function bindReviewEvents() {
        // 没有额外事件，复习点击直接在渲染中绑定
    }

    function renderReview() {
        const stats = Ebbinghaus.getStats();
        const dueItems = Ebbinghaus.getTodayReview();

        // 渲染统计
        document.getElementById('review-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-number">${stats.due}</div>
                <div class="stat-label">待复习</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.learning}</div>
                <div class="stat-label">学习中</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.mastered}</div>
                <div class="stat-label">已掌握</div>
            </div>
        `;

        // 渲染待复习列表
        const container = document.getElementById('review-list');

        if (dueItems.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    <p>暂无需要复习的内容</p>
                    <p style="margin-top:8px;font-size:13px">继续收藏新内容来学习吧</p>
                </div>
            `;
            return;
        }

        container.innerHTML = dueItems.map(item => {
            const isOverdue = item.nextReviewAt < Date.now() - 86400000;
            const stageName = Ebbinghaus.getStageName(item.reviewStage);

            return `
                <div class="review-item" data-id="${item.id}">
                    <div class="review-item-info">
                        <div class="deutsch">${escapeHtml(item.de)}</div>
                        <div class="stage">${stageName} · ${escapeHtml(item.zh)}</div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                        <span class="review-due ${isOverdue ? 'now' : ''}">${isOverdue ? '已逾期' : '待复习'}</span>
                        <div style="display:flex;gap:6px;">
                            <button class="rec-btn play" style="padding:4px 10px;font-size:12px;" data-action="play">▶</button>
                            <button style="background:var(--success);color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;" data-action="correct">✓ 记得</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // 绑定事件
        container.querySelectorAll('.review-item').forEach(el => {
            const id = el.dataset.id;
            const item = Storage.getItem(id);

            el.querySelector('[data-action="play"]').addEventListener('click', () => {
                TTS.speak(item.de, Storage.getSettings().rate);
            });

            el.querySelector('[data-action="correct"]').addEventListener('click', () => {
                Ebbinghaus.review(item, true);
                showToast('已标记为记住');
                renderReview();
                updateBadges();
            });
        });
    }

    function checkReviewReminder() {
        const dueCount = Ebbinghaus.getDueItems().length;
        if (dueCount > 0) {
            setTimeout(() => {
                showToast(`${dueCount} 条内容需要复习`);
            }, 1000);
        }
    }

    // ===== 模态 =====
    function bindModalEvents() {
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') {
                document.getElementById('modal-overlay').classList.add('hidden');
            }
        });

        document.getElementById('detail-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'detail-overlay') {
                document.getElementById('detail-overlay').classList.add('hidden');
            }
        });
    }

    // ===== 工具函数 =====
    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.remove('hidden');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.classList.add('hidden');
        }, 2000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function updateBadges() {
        // 可以在导航栏显示数字角标，暂时留空
    }

    // ===== 主题切换 =====
    function toggleTheme() {
        const current = Storage.getTheme();
        const next = current === 'light' ? 'dark' : 'light';
        Storage.setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
    }

    return {
        init,
        navigateTo,
        toggleTheme,
    };
})();

// ===== 启动 =====
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
