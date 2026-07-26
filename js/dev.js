// ==========================================
// js/dev.js - 管理者画面専用スクリプト（編集修正版）
// ==========================================

let map;
let categoriesMaster = [];
let appState = {
    spots: [],
    sidebarOpen: true,
    activeCategories: [],
    searchQuery: '',
    isAddingMode: false,
    editingSpotId: null
};

const activeMarkers = new Map();
let currentMarker = null; // 新規追加・編集時に使う仮マーカー

window.onload = async function() {
    // 1. マップの初期化（common.js）
    map = initBaseMap();

    // 画面サイズに応じたサイドバーの初期状態設定
    if (window.innerWidth < 768) setSidebarState(false);
    else setSidebarState(true);

    // 2. カテゴリマスタの取得とフィルター・フォーム初期化
    categoriesMaster = await loadCategoryMaster();
    const uniqueCategories = [...new Set(categoriesMaster.map(item => item.category))];
    appState.activeCategories = [...uniqueCategories];
    
    buildCategoryFilter();
    initFormCategoryDropdowns();

    // 3. スプレッドシートからスポットデータ取得と描画
    appState.spots = await loadDataFromSpreadsheet();
    applyFilterAndSearch();

    // 4. イベントリスナーの登録
    setupEventListeners();
};

// フォーム内の「大カテゴリ」ドロップダウンを初期化
function initFormCategoryDropdowns() {
    const catSelect = document.getElementById('edit-category');
    if (!catSelect) return;

    catSelect.innerHTML = '<option value="">選択してください</option>';
    const uniqueCategories = [...new Set(categoriesMaster.map(item => item.category))];

    uniqueCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        catSelect.appendChild(opt);
    });
}

// 選択された大カテゴリに応じて「サブカテゴリ」ドロップダウンを更新
function updateSubcategoryDropdown(selectedCategory, selectedSubcategory = '') {
    const subCatSelect = document.getElementById('edit-subcategory');
    if (!subCatSelect) return;

    subCatSelect.innerHTML = '<option value="">なし</option>';
    if (!selectedCategory) return;

    const filtered = categoriesMaster.filter(item => item.category === selectedCategory && item.subcategory);
    filtered.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.subcategory;
        opt.textContent = item.subcategory;
        if (item.subcategory === selectedSubcategory) opt.selected = true;
        subCatSelect.appendChild(opt);
    });
}

// カテゴリフィルター（アコーディオン内チェックボックス）生成
function buildCategoryFilter() {
    const container = document.getElementById("filter-checkboxes-container");
    if (!container) return;
    container.innerHTML = "";

    const uniqueCategories = [...new Set(categoriesMaster.map(item => item.category))];

    uniqueCategories.forEach(category => {
        const config = categoriesMaster.find(item => item.category === category) || { color: "#8b5cf6" };
        const label = document.createElement("label");
        label.className = "flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white text-xs py-0.5 select-none";
        label.innerHTML = `
            <input type="checkbox" checked data-category="${category}" class="category-checkbox rounded border-slate-700 bg-slate-900">
            <span class="w-2.5 h-2.5 rounded-full inline-block" style="background-color:${config.color}"></span>
            <span>${category}</span>
        `;
        container.appendChild(label);
    });

    document.querySelectorAll(".category-checkbox").forEach(chk => {
        chk.addEventListener("change", function () {
            const cat = this.dataset.category;
            if (this.checked) {
                if (!appState.activeCategories.includes(cat)) appState.activeCategories.push(cat);
            } else {
                appState.activeCategories = appState.activeCategories.filter(c => c !== cat);
            }
            applyFilterAndSearch();
        });
    });
}

// 管理者用ポップアップHTML構築
function buildPopupHTML(spot) {
    const config = categoriesMaster.find(item => item.category === spot.category && item.subcategory === spot.subcategory) 
                || categoriesMaster.find(item => item.category === spot.category) 
                || { color: "#8b5cf6" };
    
    const subLabel = spot.subcategory ? ` · ${spot.subcategory}` : "";
    
    let html = `
        <div class="p-1 text-slate-200 flex flex-col gap-2 min-w-[240px] leading-relaxed select-text text-xs">
            <div class="border-b border-slate-700 pb-1.5">
                <h4 class="font-bold text-sm text-white break-all">${spot.name}</h4>
                <span class="text-[9px] px-2 py-0.5 mt-1 inline-block rounded-full border font-bold tracking-wider" style="background-color: ${config.color}20; border-color: ${config.color}50; color: ${config.color};">
                    ${spot.category}${subLabel}
                </span>
            </div>
    `;
    
    if (spot.address) html += `<div class="flex items-start gap-1.5 text-slate-300"><span class="material-icons text-slate-400 shrink-0" style="font-size:13px; margin-top:2px;">place</span><span class="break-all">${spot.address}</span></div>`;
    if (spot.hours) html += `<div class="flex items-start gap-1.5 text-slate-300"><span class="material-icons text-slate-400 shrink-0" style="font-size:13px;">schedule</span><span class="break-all">${spot.hours}</span></div>`;
    if (spot.phone_fixed || spot.phone_mobile) {
        const tel = spot.phone_fixed || spot.phone_mobile;
        html += `<div class="flex items-center gap-1.5 text-slate-300"><span class="material-icons text-slate-400 shrink-0" style="font-size:13px;">phone</span><a href="tel:${tel}" class="break-all text-sky-400 hover:underline">${tel}</a></div>`;
    }
    if (spot.desc) html += `<p class="text-slate-400 mt-1 pt-1.5 border-t border-slate-800/60 italic break-all text-[11px]">${spot.desc}</p>`;
    
    html += `
        <div class="flex gap-2 mt-2 pt-2 border-t border-slate-800">
            <button onclick="openEditModal('${spot.id}')" class="flex-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 py-1 rounded text-xs font-bold transition-all">編集</button>
            <button onclick="deleteSpot('${spot.id}')" class="flex-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 py-1 rounded text-xs font-bold transition-all">削除</button>
        </div>
    </div>`;
    
    return html;
}

// スポットのマーカー描画
function renderSpotOnMap(spot) {
    const lat = Number(spot.lat);
    const lng = Number(spot.lng);
    if (!lat || !lng) return;

    const marker = L.marker([lat, lng], { icon: createCustomIcon(spot.category, spot.subcategory, categoriesMaster) });
    marker.bindPopup(buildPopupHTML(spot), { maxWidth: 280, closeButton: false });
    
    marker.on('mouseover', function () {
        if (!this.isPopupOpen()) this.openPopup();
    });
    
    marker.addTo(map);
    activeMarkers.set(String(spot.id), marker);
}

// 絞り込み＆検索の適用
function applyFilterAndSearch() {
    activeMarkers.forEach(marker => map.removeLayer(marker));
    activeMarkers.clear();

    let filtered = appState.spots.filter(spot => {
        const matchCategory = appState.activeCategories.includes(spot.category);
        const query = appState.searchQuery.toLowerCase().trim();
        const matchSearch = !query || 
            spot.name.toLowerCase().includes(query) || 
            (spot.address && spot.address.toLowerCase().includes(query)) || 
            (spot.desc && spot.desc.toLowerCase().includes(query));
            
        return matchCategory && matchSearch;
    });

    filtered.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    filtered.forEach(spot => renderSpotOnMap(spot));
    updateSpotListUI(filtered);
}

// サイドバーリスト更新
function updateSpotListUI(displaySpots) {
    const listContainer = document.getElementById('spot-list');
    const counter = document.getElementById('list-counter');
    
    if (counter) counter.textContent = `該当スポット: ${displaySpots.length} 件`;
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (displaySpots.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-12 text-slate-500 text-xs italic">該当するスポットはありません。</div>`;
        return;
    }

    displaySpots.forEach(spot => {
        const config = categoriesMaster.find(item => item.category === spot.category && item.subcategory === spot.subcategory) 
                    || categoriesMaster.find(item => item.category === spot.category) 
                    || { color: "#8b5cf6" };
        const subLabel = spot.subcategory ? ` · ${spot.subcategory}` : "";

        const card = document.createElement('div');
        card.className = `bg-slate-950/45 border border-slate-800 hover:border-slate-700 hover:bg-slate-950/70 p-3 rounded-xl flex flex-col gap-1.5 cursor-pointer transition-all hover:translate-x-1 text-slate-200`;
        
        let detailsHTML = '';
        if (spot.address) detailsHTML += `<div class="text-[11px] text-slate-400 flex items-start gap-1"><span class="material-icons text-slate-500 shrink-0" style="font-size:11px; margin-top:1px;">place</span><span class="truncate">${spot.address}</span></div>`;

        card.innerHTML = `
            <div class="flex justify-between items-start gap-2">
                <h4 class="font-bold text-xs truncate text-white max-w-[145px]">${spot.name}</h4>
                <span class="text-[8px] px-1.5 py-0.5 rounded-full border font-bold shrink-0" style="background-color: ${config.color}20; border-color: ${config.color}50; color: ${config.color};">${spot.category}${subLabel}</span>
            </div>
            ${detailsHTML}
        `;

        card.addEventListener('click', () => {
            map.setView([spot.lat, spot.lng], 16);
            const marker = activeMarkers.get(String(spot.id));
            if (marker) marker.openPopup();
            if (window.innerWidth < 768) setSidebarState(false);
        });
        listContainer.appendChild(card);
    });
}

// フォーム内で選択したカテゴリに合わせて、リアルタイムでピンのアイコンを変える処理
function updateEditingMarkerIcon() {
    const cat = document.getElementById('edit-category').value;
    const subCat = document.getElementById('edit-subcategory').value;

    const targetMarker = currentMarker || activeMarkers.get(String(appState.editingSpotId));

    if (targetMarker && cat) {
        const newIcon = createCustomIcon(cat, subCat, categoriesMaster);
        if (newIcon) {
            targetMarker.setIcon(newIcon);
        }
    }
}

// イベント設定
function setupEventListeners() {
    // 1. マップクリック時（スポット追加モード時）
    map.on('click', (e) => {
        if (!appState.isAddingMode) return;

        if (!isInsideMiyama(e.latlng)) {
            alert('みやま市の境界外にはピンを配置できません。');
            return;
        }

        openAddModal(e.latlng.lat, e.latlng.lng);
    });

    // 2. モード切替（閲覧 ↔ スポット追加）
    const btnToggleAdd = document.getElementById('btn-toggle-add');
    if (btnToggleAdd) {
        btnToggleAdd.addEventListener('click', () => {
            appState.isAddingMode = !appState.isAddingMode;
            const mapEl = document.getElementById('map');

            if (appState.isAddingMode) {
                btnToggleAdd.classList.remove('bg-emerald-600', 'hover:bg-emerald-500');
                btnToggleAdd.classList.add('bg-rose-600', 'hover:bg-rose-500');
                btnToggleAdd.innerHTML = `<span class="material-icons text-sm">close</span><span>追加をキャンセル</span>`;
                mapEl.classList.add('edit-active-cursor');
            } else {
                btnToggleAdd.classList.remove('bg-rose-600', 'hover:bg-rose-500');
                btnToggleAdd.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
                btnToggleAdd.innerHTML = `<span class="material-icons text-sm">add_location_alt</span><span>スポットを追加</span>`;
                mapEl.classList.remove('edit-active-cursor');
                if (currentMarker) {
                    map.removeLayer(currentMarker);
                    currentMarker = null;
                }
            }
        });
    }

    // 3. 大カテゴリ変更時（サブカテゴリ更新 ＆ アイコン即時変更）
    document.getElementById('edit-category').addEventListener('change', function() {
        updateSubcategoryDropdown(this.value);
        updateEditingMarkerIcon();
    });

    // 4. サブカテゴリ変更時（アイコン即時変更）
    document.getElementById('edit-subcategory').addEventListener('change', function() {
        updateEditingMarkerIcon();
    });

    // 5. フォーム保存
    const spotForm = document.getElementById('spot-form');
    if (spotForm) {
        spotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveSpotData();
        });
    }

    // 6. モーダルキャンセル
    document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);

    // 7. リセットボタン
    document.getElementById('btn-reset-view').addEventListener('click', () => {
        map.flyTo(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, { duration: 1.2 });
    });

    // 8. サイドバートグル
    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        setSidebarState(!appState.sidebarOpen);
    });

    // 9. 検索入力
    document.getElementById('search-input').addEventListener('input', (e) => {
        appState.searchQuery = e.target.value;
        applyFilterAndSearch();
    });

    // リサイズ対応
    window.addEventListener('resize', () => {
        if (window.innerWidth < 768) setSidebarState(false);
        else setSidebarState(true);
    });
}

// 新規追加モーダルを開く
function openAddModal(lat, lng) {
    appState.editingSpotId = null;
    document.getElementById('modal-title').textContent = '新規スポット追加';
    
    // フォームクリア
    document.getElementById('spot-form').reset();
    document.getElementById('edit-lat').value = lat;
    document.getElementById('edit-lng').value = lng;
    
    updateSubcategoryDropdown('');

    // 仮ピンの配置
    if (currentMarker) map.removeLayer(currentMarker);
    currentMarker = L.marker([lat, lng]).addTo(map);

    const modal = document.getElementById('spot-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// 編集モーダルを開く（しっかりと既存値を読み込んで表示するよう修正）
window.openEditModal = function(spotId) {
    const spot = appState.spots.find(s => String(s.id) === String(spotId));
    if (!spot) {
        alert('対象のスポットが見つかりませんでした。');
        return;
    }

    appState.editingSpotId = spot.id;
    document.getElementById('modal-title').textContent = 'スポット編集';

    // フォームに値をセット
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };

    setVal('edit-name', spot.name);
    setVal('edit-category', spot.category);
    
    // サブカテゴリのドロップダウンを生成してから値をセット
    updateSubcategoryDropdown(spot.category, spot.subcategory);
    
    setVal('edit-address', spot.address);
    setVal('edit-hours', spot.hours);
    setVal('edit-phone-fixed', spot.phone_fixed);
    setVal('edit-phone-mobile', spot.phone_mobile);
    setVal('edit-desc', spot.desc);
    setVal('edit-lat', spot.lat);
    setVal('edit-lng', spot.lng);

    // モーダル表示
    const modal = document.getElementById('spot-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

// スポット保存処理（GAS連携）
async function saveSpotData() {
    const formData = {
        action: appState.editingSpotId ? 'update' : 'create',
        id: appState.editingSpotId || Date.now().toString(),
        name: document.getElementById('edit-name').value,
        category: document.getElementById('edit-category').value,
        subcategory: document.getElementById('edit-subcategory').value,
        address: document.getElementById('edit-address').value,
        hours: document.getElementById('edit-hours').value,
        phone_fixed: document.getElementById('edit-phone-fixed').value,
        phone_mobile: document.getElementById('edit-phone-mobile').value,
        desc: document.getElementById('edit-desc').value,
        lat: document.getElementById('edit-lat').value,
        lng: document.getElementById('edit-lng').value
    };

    closeModal();
    toggleLoading(true);

    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        if (result.status === 'success') {
            appState.spots = await loadDataFromSpreadsheet();
            applyFilterAndSearch();
            
            if (appState.isAddingMode) {
                document.getElementById('btn-toggle-add').click();
            }
        } else {
            alert('保存に失敗しました: ' + (result.message || '不明なエラー'));
        }
    } catch (e) {
        console.error('保存エラー:', e);
        alert('保存中にエラーが発生しました。');
    } finally {
        toggleLoading(false);
    }
}

// スポット削除処理
window.deleteSpot = async function(spotId) {
    if (!confirm('このスポットを削除してもよろしいですか？')) return;

    toggleLoading(true);
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'delete', id: spotId })
        });

        const result = await response.json();
        if (result.status === 'success') {
            appState.spots = await loadDataFromSpreadsheet();
            applyFilterAndSearch();
        } else {
            alert('削除に失敗しました。');
        }
    } catch (e) {
        console.error('削除エラー:', e);
        alert('削除処理中にエラーが発生しました。');
    } finally {
        toggleLoading(false);
    }
};

// モーダルを閉じる
function closeModal() {
    const modal = document.getElementById('spot-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }
    appState.editingSpotId = null;
}

// サイドバー開閉 animation
function setSidebarState(open) {
    appState.sidebarOpen = open;
    const sidebarEl = document.getElementById('sidebar');
    const sidebarIconEl = document.getElementById('sidebar-icon');
    if (!sidebarEl || !sidebarIconEl || !map) return;

    const currentCenter = map.getCenter();
    if (open) {
        sidebarEl.style.marginLeft = '0px';
        sidebarIconEl.textContent = 'menu_open';
    } else {
        sidebarEl.style.marginLeft = '-320px';
        sidebarIconEl.textContent = 'menu';
    }
    
    let startTime = performance.now();
    function animateMap() {
        map.invalidateSize({ animate: false });
        map.setView(currentCenter, map.getZoom(), { animate: false });
        let elapsed = performance.now() - startTime;
        if (elapsed < 350) requestAnimationFrame(animateMap);
    }
    requestAnimationFrame(animateMap);
}