// ==========================================
// dev.js - 管理画面専用ロジック
// ==========================================

let map;
let categoryConfig = {};
let categoriesMaster = [];
let isEditMode = false;
let currentSelectedLatLng = null;
let editingSpotId = null;
let spotToDeleteId = null;

// DOM読み込み後の初期化
document.addEventListener('DOMContentLoaded', async () => {
    // 1. common.js の共通関数でマップ初期化
    map = initBaseMap('map');

    // 2. カテゴリ定義データの読み込み
    await loadCategories();

    // 3. データ取得 & 初回マーカー描画
    await refreshSpotsAndRender();

    // 4. イベントリスナーの設定
    setupEventListeners();
});

// カテゴリ定義の読み込み
async function loadCategories() {
    try {
        const response = await fetch('json/category.json');
        const data = await response.json();
        
        // category.json の構造に応じて保持
        categoryConfig = data.categoryConfig || data;
        categoriesMaster = data.categoriesMaster || [];

        renderCategoryFilters();
        setupCategoryFormOptions();
    } catch (error) {
        console.error('カテゴリデータの読み込みエラー:', error);
        showToast('カテゴリ定義の取得に失敗しました', true);
    }
}

// フィルター用チェックボックスの動的生成
function renderCategoryFilters() {
    const filterContainer = document.getElementById('category-filters');
    if (!filterContainer) return;

    let html = '';
    Object.keys(categoryConfig).forEach(catKey => {
        const cat = categoryConfig[catKey];
        html += `
            <label class="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-200 hover:text-white">
                <input type="checkbox" value="${catKey}" checked class="category-filter rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0">
                <span>${cat.label || catKey}</span>
            </label>
        `;
    });
    filterContainer.innerHTML = html;

    // フィルター変更時に再描画
    document.querySelectorAll('.category-filter').forEach(checkbox => {
        checkbox.addEventListener('change', filterAndRenderMarkers);
    });
}

// 登録フォーム内の大/小カテゴリ連動選択肢の設定
function setupCategoryFormOptions() {
    const mainSelect = document.getElementById('form-category-main');
    const subSelect = document.getElementById('form-category-sub');
    if (!mainSelect || !subSelect) return;

    mainSelect.innerHTML = '<option value="">大カテゴリを選択</option>';
    Object.keys(categoryConfig).forEach(catKey => {
        const cat = categoryConfig[catKey];
        mainSelect.innerHTML += `<option value="${catKey}">${cat.label || catKey}</option>`;
    });

    mainSelect.addEventListener('change', () => {
        const selectedMain = mainSelect.value;
        subSelect.innerHTML = '<option value="">小カテゴリを選択</option>';
        if (selectedMain && categoryConfig[selectedMain]?.sub) {
            categoryConfig[selectedMain].sub.forEach(subItem => {
                subSelect.innerHTML += `<option value="${subItem}">${subItem}</option>`;
            });
        }
    });
}

// スポットの取得とマーカー再描画
async function refreshSpotsAndRender() {
    await fetchSpots(); // common.js の fetchSpots で allSpots を更新
    filterAndRenderMarkers();
}

// マーカーの絞り込みと共通 renderMarkers の呼び出し
function filterAndRenderMarkers() {
    const checkedCategories = Array.from(document.querySelectorAll('.category-filter:checked')).map(cb => cb.value);

    // common.js の renderMarkers を呼び出し
    renderMarkers(map, allSpots, checkedCategories, categoryConfig, categoriesMaster, (spot) => {
        // 管理画面用のポップアップ HTML
        return `
            <div class="p-2 space-y-2 text-xs min-w-[180px]">
                <div class="font-bold text-slate-800 text-sm">${spot.title || '名称未設定'}</div>
                <div class="text-slate-500">${spot.categoryMain || spot.category || ''} / ${spot.categorySub || spot.subcategory || ''}</div>
                ${spot.address ? `<div class="text-slate-600">${spot.address}</div>` : ''}
                <div class="pt-2 border-t border-slate-200 flex justify-end gap-2">
                    <button onclick="openEditModal('${spot.id}')" class="px-2.5 py-1 bg-slate-700 text-white rounded hover:bg-slate-800 transition text-[11px]">編集</button>
                    <button onclick="confirmDeleteSpot('${spot.id}')" class="px-2.5 py-1 bg-rose-600 text-white rounded hover:bg-rose-700 transition text-[11px]">削除</button>
                </div>
            </div>
        `;
    });
}

// イベントリスナーの設定
function setupEventListeners() {
    // 編集/閲覧 モード切り替えボタン
    const modeBtn = document.getElementById('btn-toggle-mode');
    if (modeBtn) {
        modeBtn.addEventListener('click', () => {
            isEditMode = !isEditMode;
            modeBtn.classList.toggle('bg-amber-500', isEditMode);
            modeBtn.classList.toggle('bg-slate-800', !isEditMode);
            modeBtn.querySelector('span').textContent = isEditMode ? '編集モード中' : '閲覧モード';
            showToast(isEditMode ? '地図をクリックしてスポットを登録できます' : '閲覧モードに切り替えました');
        });
    }

    // 地図クリック時（新規登録）
    map.on('click', (e) => {
        if (!isEditMode) return;

        const { lat, lng } = e.latlng;
        // common.js の市境界チェック
        if (!isPointInPolygon(lat, lng, miyamaBorderLatLng)) {
            showToast('みやま市外にはピンを設置できません', true);
            return;
        }

        currentSelectedLatLng = { lat, lng };
        openSpotModal();
    });

    // フォーム送信時
    const spotForm = document.getElementById('form-spot');
    if (spotForm) {
        spotForm.addEventListener('submit', handleSpotSubmit);
    }
}

// モーダル表示制御
function openSpotModal(spotData = null) {
    const modal = document.getElementById('modal-spot');
    const titleEl = document.getElementById('modal-spot-title');
    const spotForm = document.getElementById('form-spot');
    if (!modal) return;

    if (spotData) {
        editingSpotId = spotData.id;
        if (titleEl) titleEl.textContent = 'スポット情報の編集';
        document.getElementById('form-title').value = spotData.title || '';
        document.getElementById('form-category-main').value = spotData.categoryMain || spotData.category || '';
        document.getElementById('form-category-main').dispatchEvent(new Event('change'));
        document.getElementById('form-category-sub').value = spotData.categorySub || spotData.subcategory || '';
        document.getElementById('form-address').value = spotData.address || '';
        document.getElementById('form-tel').value = spotData.tel || '';
    } else {
        editingSpotId = null;
        if (titleEl) titleEl.textContent = '新規スポットの登録';
        if (spotForm) spotForm.reset();
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeSpotModal() {
    const modal = document.getElementById('modal-spot');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// 編集ボタン押下時
window.openEditModal = function(spotId) {
    const spot = allSpots.find(s => s.id === spotId);
    if (spot) {
        currentSelectedLatLng = { lat: spot.lat, lng: spot.lng };
        openSpotModal(spot);
    }
};

// スポットデータの保存（GAS送信）
async function handleSpotSubmit(e) {
    e.preventDefault();
    
    const payload = {
        action: editingSpotId ? 'update' : 'add',
        id: editingSpotId || Date.now().toString(),
        title: document.getElementById('form-title').value,
        categoryMain: document.getElementById('form-category-main').value,
        categorySub: document.getElementById('form-category-sub').value,
        address: document.getElementById('form-address').value,
        tel: document.getElementById('form-tel').value,
        lat: currentSelectedLatLng ? currentSelectedLatLng.lat : null,
        lng: currentSelectedLatLng ? currentSelectedLatLng.lng : null
    };

    try {
        showToast('保存中...');
        await fetch(GAS_API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        showToast('保存が完了しました');
        closeSpotModal();
        await refreshSpotsAndRender();
    } catch (error) {
        console.error('保存処理エラー:', error);
        showToast('保存に失敗しました', true);
    }
};

// 削除確認モーダルの制御
window.confirmDeleteSpot = function(spotId) {
    spotToDeleteId = spotId;
    const deleteModal = document.getElementById('modal-delete');
    if (deleteModal) {
        deleteModal.classList.remove('hidden');
        deleteModal.classList.add('flex');
    }
};

window.closeDeleteModal = function() {
    spotToDeleteId = null;
    const deleteModal = document.getElementById('modal-delete');
    if (deleteModal) {
        deleteModal.classList.add('hidden');
        deleteModal.classList.remove('flex');
    }
};

window.executeDeleteSpot = async function() {
    if (!spotToDeleteId) return;

    try {
        showToast('削除中...');
        await fetch(GAS_API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', id: spotToDeleteId })
        });

        showToast('削除が完了しました');
        closeDeleteModal();
        await refreshSpotsAndRender();
    } catch (error) {
        console.error('削除処理エラー:', error);
        showToast('削除に失敗しました', true);
    }
};