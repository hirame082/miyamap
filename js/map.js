// ==========================================
// js/map.js - 一般ユーザー画面専用スクリプト
// ==========================================

let map;
let categoriesMaster = [];
let appState = {
    spots: [],
    sidebarOpen: true,
    activeCategories: [],
    searchQuery: ''
};
const activeMarkers = new Map();

window.onload = async function() {
    // 1. マップの初期化
    map = initBaseMap();

    // 画面サイズに応じたサイドバーの初期状態設定
    if (window.innerWidth < 768) setSidebarState(false);
    else setSidebarState(true);

    // 2. カテゴリマスタの取得とフィルターの構築
    categoriesMaster = await loadCategoryMaster();
    window.categoriesMaster = categoriesMaster;

    const uniqueCategories = [...new Set(categoriesMaster.map(item => item.category))];
    appState.activeCategories = [...uniqueCategories];
    buildCategoryFilter();

    // 3. スプレッドシートからスポットデータ取得と初回描画
    appState.spots = await loadDataFromSpreadsheet();
    applyFilterAndSearch();

    // 4. イベントリスナーの登録
    setupEventListeners();
};

// カテゴリ設定取得ヘルパー
function getCategoryConfig(categoryName) {
    return categoriesMaster.find(item => item.category === categoryName) || { color: "#8b5cf6" };
}

// カテゴリフィルター生成
function buildCategoryFilter() {
    const container = document.getElementById("filter-checkboxes-container");
    if (!container) return;
    container.innerHTML = "";

    const uniqueCategories = [...new Set(categoriesMaster.map(item => item.category))];

    uniqueCategories.forEach(category => {
        const config = getCategoryConfig(category);
        const label = document.createElement("label");
        label.className = "flex items-center gap-2 cursor-pointer text-xs py-0.5 select-none filter-label";
        label.innerHTML = `
            <input type="checkbox" checked data-category="${category}" class="category-checkbox rounded">
            <span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background-color:${config.color}"></span>
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

// ポップアップHTML構築
function buildPopupHTML(spot) {
    const config = getCategoryConfig(spot.category);
    const subLabel = spot.subcategory ? ` · ${spot.subcategory}` : "";
    
    let html = `
        <div class="map-popup-inner p-1 flex flex-col gap-2 min-w-[240px] leading-relaxed select-text text-xs">
            <div class="popup-header border-b pb-1.5">
                <h4 class="popup-title font-bold text-sm break-all">${spot.name}</h4>
                <span class="text-[9px] px-2 py-0.5 mt-1 inline-block rounded-full border font-bold tracking-wider" style="background-color: ${config.color}20; border-color: ${config.color}50; color: ${config.color};">
                    ${spot.category}${subLabel}
                </span>
            </div>
    `;
    
    if (spot.address) html += `<div class="popup-info-item flex items-start gap-1.5"><span class="material-icons shrink-0" style="font-size:13px; margin-top:2px;">place</span><span class="break-all">${spot.address}</span></div>`;
    if (spot.hours) html += `<div class="popup-info-item flex items-start gap-1.5"><span class="material-icons shrink-0" style="font-size:13px; margin-top:2px;">schedule</span><span class="break-all">${spot.hours}</span></div>`;
    if (spot.phone_fixed || spot.phone_mobile) {
        const tel = spot.phone_fixed || spot.phone_mobile;
        html += `<div class="popup-info-item flex items-center gap-1.5"><span class="material-icons shrink-0" style="font-size:13px;">phone</span><a href="tel:${tel}" class="popup-tel-link break-all hover:underline">${tel}</a></div>`;
    }
    if (spot.desc) html += `<p class="popup-desc mt-1 pt-1.5 border-t italic break-all text-[11px]">${spot.desc}</p>`;
    
    html += `</div>`;
    return html;
}

// マーカー描画
function renderSpotOnMap(spot) {
    const lat = Number(spot.lat);
    const lng = Number(spot.lng);
    if (!lat || !lng) return;

    const customIcon = createCustomIcon(spot.category, spot.subcategory, categoriesMaster);
    const marker = L.marker([lat, lng], { icon: customIcon });
    
    marker.bindPopup(buildPopupHTML(spot), { maxWidth: 280, closeButton: false });
    
    marker.on('mouseover', function () {
        if (!this.isPopupOpen()) this.openPopup();
    });
    
    marker.addTo(map);
    activeMarkers.set(spot.id, marker);
}

// 絞り込み＆検索適用
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
        listContainer.innerHTML = `<div class="no-spot-msg text-center py-12 text-xs italic">該当するスポットはありません。</div>`;
        return;
    }

    displaySpots.forEach(spot => {
        const config = getCategoryConfig(spot.category);
        const subLabel = spot.subcategory ? ` · ${spot.subcategory}` : "";

        const card = document.createElement('div');
        // 色指定クラスを削り、CSS用の「spot-card」を付与
        card.className = `spot-card p-3 rounded-xl flex flex-col gap-1.5 cursor-pointer transition-all hover:translate-x-1`;
        
        let detailsHTML = '';
        if (spot.address) detailsHTML += `<div class="spot-address text-[11px] flex items-start gap-1"><span class="material-icons shrink-0" style="font-size:11px; margin-top:1px;">place</span><span class="truncate">${spot.address}</span></div>`;
        if (spot.desc) detailsHTML += `<p class="spot-desc text-[11px] mt-0.5 line-clamp-2 italic break-all border-t pt-1">${spot.desc}</p>`;

        card.innerHTML = `
            <div class="flex justify-between items-start gap-2">
                <h4 class="spot-title font-bold text-xs truncate max-w-[145px]">${spot.name}</h4>
                <span class="text-[8px] px-1.5 py-0.5 rounded-full border font-bold shrink-0" style="background-color: ${config.color}20; border-color: ${config.color}50; color: ${config.color};">${spot.category}${subLabel}</span>
            </div>
            ${detailsHTML}
        `;

        card.addEventListener('click', () => {
            map.setView([spot.lat, spot.lng], 16);
            const marker = activeMarkers.get(spot.id);
            if (marker) marker.openPopup();
            if (window.innerWidth < 768) setSidebarState(false);
        });
        listContainer.appendChild(card);
    });
}

// イベント設定
function setupEventListeners() {
    document.getElementById('btn-reset-view').addEventListener('click', () => {
        map.flyTo(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, { duration: 1.2 });
    });

    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        setSidebarState(!appState.sidebarOpen);
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
        appState.searchQuery = e.target.value;
        applyFilterAndSearch();
    });

    const infoModal = document.getElementById('info-modal');
    if (document.getElementById('btn-info') && infoModal) {
        document.getElementById('btn-info').addEventListener('click', () => {
            infoModal.classList.remove('hidden');
            infoModal.classList.add('flex');
            setTimeout(() => {
                infoModal.classList.remove('opacity-0');
                infoModal.classList.add('opacity-100');
            }, 10);
        });

        document.getElementById('close-info').addEventListener('click', closeInfoModal);
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) closeInfoModal();
        });
    }

    window.addEventListener('resize', () => {
        if (window.innerWidth < 768) setSidebarState(false);
        else setSidebarState(true);
    });
}

function closeInfoModal() {
    const infoModal = document.getElementById('info-modal');
    if (!infoModal) return;
    infoModal.classList.remove('opacity-100');
    infoModal.classList.add('opacity-0');
    setTimeout(() => {
        infoModal.classList.remove('flex');
        infoModal.classList.add('hidden');
    }, 300);
}

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