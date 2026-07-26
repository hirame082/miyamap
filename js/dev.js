// ==========================================
// js/dev.js - 管理画面専用スクリプト
// ==========================================

let map;
let appState = {
    spots: [],
    sidebarOpen: true,
    activeCategories: [''],
    searchQuery: '',
    editMode: false
};
const activeMarkers = new Map();
let tempMarker = null;

window.onload = async function() {
    map = initBaseMap();

    if (window.innerWidth < 768) setSidebarState(false);
    else setSidebarState(true);

    await loadCategoryMaster();
    
    const uniqueCategories = [...new Set(categoriesMaster.map(item => item.category))];
    appState.activeCategories = uniqueCategories;
    buildCategoryFilter();

    appState.spots = await loadDataFromSpreadsheet();
    applyFilterAndSearch();

    setupEventListeners();
};

function buildCategoryFilter() {
    const container = document.getElementById("filter-checkboxes-container");
    if (!container) return;
    container.innerHTML = "";

    const uniqueCategories = [...new Set(categoriesMaster.map(item => item.category))];

    uniqueCategories.forEach(category => {
        const config = getCategoryConfig(category);
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

function buildPopupHTML(spot) {
    const config = getCategoryConfig(spot.category);
    const subLabel = spot.subcategory ? ` · ${spot.subcategory}` : "";
    
    let html = `
        <div class="p-1 text-slate-200 flex flex-col gap-2 min-w-[250px] leading-relaxed select-text text-xs">
            <div class="border-b border-slate-700 pb-1.5">
                <h4 class="font-bold text-sm text-white break-all">${spot.name}</h4>
                <span class="text-[9px] px-2 py-0.5 mt-1 inline-block rounded-full border font-bold tracking-wider text-white" style="background-color: ${config.color}20; border-color: ${config.color}50; color: ${config.color};">
                    ${spot.category}${subLabel}
                </span>
            </div>
    `;
    if (spot.address) html += `<div class="flex items-start gap-1.5 text-slate-300"><span class="material-icons text-slate-400 shrink-0" style="font-size:13px; margin-top:2px;">place</span><span class="break-all">${spot.address}</span></div>`;
    if (spot.hours) html += `<div class="flex items-start gap-1.5 text-slate-300"><span class="material-icons text-slate-400 shrink-0" style="font-size:13px; margin-top:2px;">schedule</span><span class="break-all">${spot.hours}</span></div>`;
    if (spot.phone_fixed || spot.phone_mobile) {
        const tel = spot.phone_fixed || spot.phone_mobile;
        html += `<div class="flex items-center gap-1.5 text-slate-300"><span class="material-icons text-slate-400 shrink-0" style="font-size:13px;">phone</span><span class="break-all">${tel}</span></div>`;
    }
    if (spot.desc) html += `<p class="text-slate-400 mt-1 pt-1.5 border-t border-slate-800/60 italic break-all text-[11px]">${spot.desc}</p>`;
    
    html += `
        <div class="flex gap-2 mt-2 pt-2 border-t border-slate-800">
            <button onclick="openEditForm('${spot.id}')" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-1 rounded text-[10px] font-bold transition-all border border-slate-700 flex items-center justify-center gap-0.5 cursor-pointer">
                <span class="material-icons" style="font-size:11px;">edit</span>編集
            </button>
            <button onclick="deleteSpotFromServer('${spot.id}')" class="flex-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 py-1 rounded text-[10px] font-bold transition-all border border-rose-900/50 flex items-center justify-center gap-0.5 cursor-pointer">
                <span class="material-icons" style="font-size:11px;">delete</span>削除
            </button>
        </div>
    </div>`;
    return html;
}

function renderSpotOnMap(spot) {
    const lat = Number(spot.lat);
    const lng = Number(spot.lng);
    if (!lat || !lng) return;

    const marker = L.marker([lat, lng], { icon: createCustomIcon(spot.category) });
    marker.bindPopup(buildPopupHTML(spot), { maxWidth: 280, closeButton: false });
    
    marker.on('mouseover', function () {
        if (!this.isPopupOpen()) this.openPopup();
    });
    
    marker.addTo(map);
    activeMarkers.set(spot.id, marker);
}

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
        const config = getCategoryConfig(spot.category);
        const subLabel = spot.subcategory ? ` · ${spot.subcategory}` : "";

        const card = document.createElement('div');
        card.className = `bg-slate-950/45 border border-slate-800 hover:border-slate-700 hover:bg-slate-950/70 p-3 rounded-xl flex flex-col gap-1.5 cursor-pointer transition-all hover:translate-x-1 text-slate-200`;
        
        let detailsHTML = '';
        if (spot.address) detailsHTML += `<div class="text-[11px] text-slate-400 flex items-start gap-1"><span class="material-icons text-slate-500 shrink-0" style="font-size:11px; margin-top:1px;">place</span><span class="truncate">${spot.address}</span></div>`;
        if (spot.desc) detailsHTML += `<p class="text-[11px] text-slate-400 mt-0.5 line-clamp-2 italic break-all border-t border-slate-800/60 pt-1">${spot.desc}</p>`;

        card.innerHTML = `
            <div class="flex justify-between items-start gap-2">
                <h4 class="font-bold text-xs truncate text-white max-w-[145px]">${spot.name}</h4>
                <span class="text-[8px] px-1.5 py-0.5 rounded-full border font-bold shrink-0 text-white" style="background-color: ${config.color}20; border-color: ${config.color}50; color: ${config.color};">${spot.category}${subLabel}</span>
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

function setupEventListeners() {
    const modeViewBtn = document.getElementById('mode-view');
    const modeEditBtn = document.getElementById('mode-edit');

    function setMode(isEdit) {
        appState.editMode = isEdit;
        cancelRegistration(); 

        if (isEdit) {
            modeEditBtn.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 bg-amber-600 text-white cursor-pointer";
            modeViewBtn.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 text-slate-400 hover:text-slate-200 cursor-pointer";
        } else {
            modeViewBtn.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 bg-emerald-600 text-white cursor-pointer";
            modeEditBtn.className = "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 text-slate-400 hover:text-slate-200 cursor-pointer";
        }
    }

    if (modeViewBtn) modeViewBtn.addEventListener('click', () => setMode(false));
    if (modeEditBtn) modeEditBtn.addEventListener('click', () => setMode(true));

    map.on('click', function(e) {
        if (!appState.editMode) return; 

        const clickLatLng = e.latlng;
        if (!isInsideMiyama(clickLatLng)) {
            alert("❌ エラー: みやま市の管轄範囲外にピンを配置することはできません。");
            return;
        }

        if (tempMarker) map.removeLayer(tempMarker);

        const defaultCat = categoriesMaster[0] ? categoriesMaster[0].category : '';
        tempMarker = L.marker(clickLatLng, { icon: createCustomIcon(defaultCat) }).addTo(map);

        const uniqueCategories = [...new Set(categoriesMaster.map(item => item.category))];
        let categoryOptions = uniqueCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        
        let formHTML = `
            <div class="p-1 text-slate-200 flex flex-col gap-2 min-w-[260px] text-xs font-sans">
                <div class="border-b border-slate-700 pb-1.5 flex justify-between items-center">
                    <h4 class="font-bold text-white text-sm flex items-center gap-1"><span class="material-icons text-amber-400 text-base">add_location_alt</span>新規スポット登録</h4>
                </div>
                
                <div class="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                    <div>
                        <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">店舗・スポット名 <span class="text-rose-400">*</span></label>
                        <input type="text" id="form-name" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white font-bold" placeholder="みやま商店">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-1.5">
                        <div>
                            <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">大カテゴリ</label>
                            <select id="form-category" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-1 py-1 text-xs outline-none text-slate-300 font-bold" onchange="updateFormSubcategories(this.value)">
                                <option value="">選択してください</option>
                                ${categoryOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">小カテゴリ</label>
                            <select id="form-subcategory" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-1 py-1 text-xs outline-none text-slate-300 font-bold">
                                <option value="">先に対カテゴリを選択</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">住所</label>
                        <input type="text" id="form-address" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white" placeholder="みやま市瀬高町...">
                    </div>

                    <div class="grid grid-cols-2 gap-1.5">
                        <div>
                            <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">固定電話</label>
                            <input type="text" id="form-phone-fixed" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white" placeholder="0944-XX-XXXX">
                        </div>
                        <div>
                            <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">携帯番号</label>
                            <input type="text" id="form-phone-mobile" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white" placeholder="090-XXXX-XXXX">
                        </div>
                    </div>

                    <div>
                        <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">営業時間</label>
                        <input type="text" id="form-hours" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white" placeholder="11:00〜20:00 (水曜定休)">
                    </div>

                    <div>
                        <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">紹介文・備考</label>
                        <textarea id="form-desc" rows="2" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white resize-none" placeholder="地元で愛される老舗店です。"></textarea>
                    </div>
                </div>

                <div class="flex gap-1.5 mt-1 pt-1.5 border-t border-slate-800">
                    <button onclick="cancelRegistration()" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded text-[11px] font-bold transition-all border border-slate-700 cursor-pointer">キャンセル</button>
                    <button onclick="submitToSpreadsheet(${clickLatLng.lat}, ${clickLatLng.lng})" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 rounded text-[11px] font-bold transition-all shadow-lg shadow-emerald-900/40 cursor-pointer">保存する</button>
                </div>
            </div>
        `;

        tempMarker.bindPopup(formHTML, { closeButton: false, closeOnClick: false }).openPopup();

        setTimeout(() => {
            const selectEl = document.getElementById('form-category');
            if(selectEl) {
                selectEl.addEventListener('change', (ev) => {
                    if(ev.target.value && tempMarker) {
                        tempMarker.setIcon(createCustomIcon(ev.target.value));
                    }
                });
            }
        }, 50);
    });

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

    window.addEventListener('resize', () => {
        if (window.innerWidth < 768) setSidebarState(false);
        else setSidebarState(true);
    });
}

function closeInfoModal() {
    const infoModal = document.getElementById('info-modal');
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

// グローバル公開関数（インラインHTMLのonclick属性用）
window.updateFormSubcategories = function(selectedCat) {
    const catSelect = document.getElementById('form-category');
    const subSelect = document.getElementById('form-subcategory');
    if (!catSelect || !subSelect) return;

    const activeCat = selectedCat || catSelect.value;
    subSelect.innerHTML = '';

    if (!activeCat) {
        subSelect.innerHTML = '<option value="">先に対カテゴリを選択</option>';
        return;
    }

    const filteredSubs = categoriesMaster.filter(item => item.category === activeCat).map(item => item.subcategory);
    if (filteredSubs.length === 0) {
        subSelect.innerHTML = '<option value="その他">その他</option>';
        return;
    }

    filteredSubs.forEach(subName => {
        const opt = document.createElement('option');
        opt.value = subName;
        opt.textContent = subName;
        subSelect.appendChild(opt);
    });
};

window.cancelRegistration = function() {
    if (tempMarker && map) {
        map.removeLayer(tempMarker);
        tempMarker = null;
    }
};

window.submitToSpreadsheet = async function(lat, lng) {
    const name = document.getElementById('form-name').value.trim();
    if (!name) {
        alert("店舗・スポット名は必須です！");
        return;
    }

    const payload = {
        action: "create", 
        id: "spot_" + Date.now(),
        category: document.getElementById('form-category').value,
        subcategory: document.getElementById('form-subcategory').value,
        name: name,
        lat: lat,
        lng: lng,
        address: document.getElementById('form-address').value.trim(),
        hours: document.getElementById('form-hours').value.trim(),
        phone_fixed: document.getElementById('form-phone-fixed').value.trim(),
        phone_mobile: document.getElementById('form-phone-mobile').value.trim(),
        desc: document.getElementById('form-desc').value.trim()
    };

    toggleLoading(true);
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            cancelRegistration();
            appState.spots.push(payload);
            applyFilterAndSearch();
        } else {
            alert("保存エラーが発生しました: " + result.message);
        }
    } catch (err) {
        console.error("送信失敗:", err);
        alert("通信エラーが発生しました。");
    } finally {
        toggleLoading(false);
    }
};

window.openEditForm = function(spotId) {
    const spot = appState.spots.find(s => String(s.id) === String(spotId));
    const marker = activeMarkers.get(spotId);
    if (!spot || !marker) return;

    const uniqueCategories = [...new Set(categoriesMaster.map(item => item.category))];
    let categoryOptions = uniqueCategories.map(cat => {
        const selected = cat === spot.category ? 'selected' : '';
        return `<option value="${cat}" ${selected}>${cat}</option>`;
    }).join('');

    let editFormHTML = `
        <div class="p-1 text-slate-200 flex flex-col gap-2 min-w-[260px] text-xs font-sans">
            <div class="border-b border-slate-700 pb-1.5 flex justify-between items-center">
                <h4 class="font-bold text-white text-sm flex items-center gap-1"><span class="material-icons text-sky-400 text-base">edit_location</span>スポット情報の編集</h4>
            </div>
            
            <div class="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                <div>
                    <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">店舗・スポット名 <span class="text-rose-400">*</span></label>
                    <input type="text" id="edit-name" value="${spot.name}" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white font-bold">
                </div>
                
                <div class="grid grid-cols-2 gap-1.5">
                    <div>
                        <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">大カテゴリ</label>
                        <select id="edit-category" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-1 py-1 text-xs outline-none text-slate-300 font-bold" onchange="updateEditSubcategories(this.value)">
                            ${categoryOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">小カテゴリ</label>
                        <select id="edit-subcategory" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-1 py-1 text-xs outline-none text-slate-300 font-bold">
                        </select>
                    </div>
                </div>

                <div>
                    <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">住所</label>
                    <input type="text" id="edit-address" value="${spot.address || ''}" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white">
                </div>

                <div class="grid grid-cols-2 gap-1.5">
                    <div>
                        <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">固定電話</label>
                        <input type="text" id="edit-phone-fixed" value="${spot.phone_fixed || ''}" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white">
                    </div>
                    <div>
                        <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">携帯番号</label>
                        <input type="text" id="edit-phone-mobile" value="${spot.phone_mobile || ''}" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white">
                    </div>
                </div>

                <div>
                    <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">営業時間</label>
                    <input type="text" id="edit-hours" value="${spot.hours || ''}" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white">
                </div>

                <div>
                    <label class="block text-[10px] text-slate-400 mb-0.5 font-bold">紹介文・備考</label>
                    <textarea id="edit-desc" rows="2" class="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 rounded px-2 py-1 text-xs outline-none text-white resize-none">${spot.desc || ''}</textarea>
                </div>
            </div>

            <div class="flex gap-1.5 mt-1 pt-1.5 border-t border-slate-800">
                <button onclick="applyFilterAndSearch()" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded text-[11px] font-bold transition-all border border-slate-700 cursor-pointer">キャンセル</button>
                <button onclick="updateSpotOnServer('${spotId}', ${spot.lat}, ${spot.lng})" class="flex-1 bg-sky-600 hover:bg-sky-500 text-white py-1.5 rounded text-[11px] font-bold transition-all shadow-lg shadow-sky-900/40 cursor-pointer">更新を保存</button>
            </div>
        </div>
    `;

    marker.bindPopup(editFormHTML, { closeButton: false, closeOnClick: false }).openPopup();
    
    window.updateEditSubcategories = function(selectedCat) {
        const subSelect = document.getElementById('edit-subcategory');
        if (!subSelect) return;
        subSelect.innerHTML = '';
        const filteredSubs = categoriesMaster.filter(item => item.category === selectedCat).map(item => item.subcategory);
        filteredSubs.forEach(subName => {
            const opt = document.createElement('option');
            opt.value = subName;
            opt.textContent = subName;
            if(subName === spot.subcategory) opt.selected = true;
            subSelect.appendChild(opt);
        });
    };
    updateEditSubcategories(spot.category);
};

window.updateSpotOnServer = async function(spotId, lat, lng) {
    const name = document.getElementById('edit-name').value.trim();
    if (!name) {
        alert("店舗・スポット名は必須です！");
        return;
    }

    const payload = {
        action: "update", 
        id: spotId,
        category: document.getElementById('edit-category').value,
        subcategory: document.getElementById('edit-subcategory').value,
        name: name,
        lat: lat,
        lng: lng,
        address: document.getElementById('edit-address').value.trim(),
        hours: document.getElementById('edit-hours').value.trim(),
        phone_fixed: document.getElementById('edit-phone-fixed').value.trim(),
        phone_mobile: document.getElementById('edit-phone-mobile').value.trim(),
        desc: document.getElementById('edit-desc').value.trim()
    };

    toggleLoading(true);
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            const idx = appState.spots.findIndex(s => String(s.id) === String(spotId));
            if (idx !== -1) appState.spots[idx] = payload;
            applyFilterAndSearch();
        } else {
            alert("更新エラーが発生しました: " + result.message);
        }
    } catch (err) {
        console.error("更新失敗:", err);
        alert("通信エラーが発生しました。");
    } finally {
        toggleLoading(false);
    }
};

window.deleteSpotFromServer = async function(spotId) {
    if (!confirm("⚠️ 本当にこのスポットを完全に削除してもよろしいですか？")) return;

    const payload = {
        action: "delete", 
        id: spotId
    };

    toggleLoading(true);
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            appState.spots = appState.spots.filter(s => String(s.id) !== String(spotId));
            applyFilterAndSearch();
        } else {
            alert("削除エラーが発生しました: " + result.message);
        }
    } catch (err) {
        console.error("削除失敗:", err);
        alert("削除通信中にエラーが発生しました。");
    } finally {
        toggleLoading(false);
    }
};