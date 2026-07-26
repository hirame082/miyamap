// ==========================================
// common.js - 共通処理・データ取得・マップ制御
// ==========================================

// 1. GAS API URL (全画面共通)
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwI5R48e3gR_Aed-K40o8hRjLzQj1I55oJ1L51iV7rVzR1e4l5p/exec";

// 2. みやま市境界データ
const miyamaBorderLatLng = [
    [33.190695, 130.439811], [33.187422, 130.441951], [33.186523, 130.450315],
    [33.183141, 130.451733], [33.178206, 130.448558], [33.172773, 130.450429],
    [33.167266, 130.447382], [33.164315, 130.455235], [33.158304, 130.454936],
    [33.153408, 130.460729], [33.150492, 130.457853], [33.141525, 130.467423],
    [33.136233, 130.466007], [33.136053, 130.460857], [33.125556, 130.462316],
    [33.118256, 130.468239], [33.109088, 130.464677], [33.106134, 130.470470],
    [33.107033, 130.476650], [33.116563, 130.485147], [33.114331, 130.490726],
    [33.119444, 130.494717], [33.115843, 130.505017], [33.120593, 130.510339],
    [33.114763, 130.516132], [33.115986, 130.528492], [33.122822, 130.531239],
    [33.120090, 130.540852], [33.129362, 130.556215], [33.128715, 130.567029],
    [33.131734, 130.588487], [33.138491, 130.589860], [33.141222, 130.603078],
    [33.150779, 130.609429], [33.158110, 130.612004], [33.168310, 130.604283],
    [33.174132, 130.605313], [33.180456, 130.596043], [33.176432, 130.590207],
    [33.184120, 130.581967], [33.179520, 130.573212], [33.184336, 130.564457],
    [33.184120, 130.551239], [33.177220, 130.534245], [33.176070, 130.521885],
    [33.178370, 130.514332], [33.176645, 130.508324], [33.178657, 130.500256],
    [33.175495, 130.490471], [33.180239, 130.485493], [33.179952, 130.480515],
    [33.184408, 130.474678], [33.183114, 130.468841], [33.186851, 130.460602],
    [33.185270, 130.453392], [33.188289, 130.446869], [33.190695, 130.439811]
];

// グローバルデータ
let allSpots = [];
let windowMarkerGroup = null;

// 3. みやま市内判定 (Ray-casting)
function isPointInPolygon(lat, lng, polygon) {
    let x = lat, y = lng, inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i][0], yi = polygon[i][1];
        let xj = polygon[j][0], yj = polygon[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

// 4. トースト通知
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[3000] px-4 py-2.5 rounded-xl text-xs font-bold shadow-2xl transition-all duration-300 pointer-events-none flex items-center gap-2 ${
        isError ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-100 border border-slate-700'
    }`;
    toast.classList.remove('translate-y-10', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-10', 'opacity-0'), 3000);
}

// 5. ベースマップ初期化
function initBaseMap(elementId = 'map', center = [33.1115, 130.5135], zoom = 13) {
    const map = L.map(elementId, { zoomControl: false }).setView(center, zoom);
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>'
    }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.polygon(miyamaBorderLatLng, { color: '#3b82f6', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.05, interactive: false }).addTo(map);
    return map;
}

// 6. スポットデータ取得
async function fetchSpots() {
    try {
        const response = await fetch(`${GAS_API_URL}?action=get`);
        const data = await response.json();
        allSpots = data.spots || [];
        return allSpots;
    } catch (error) {
        console.error('データ取得失敗:', error);
        showToast('データの取得に失敗しました', true);
        return [];
    }
}

// 7. カテゴリマスタからアイコン画像を検索して生成する共通処理
function createMarkerIcon(spot, categoriesMaster = [], categoryConfig = {}) {
    const rawCategory = spot.rawCategory || spot.categoryMain || spot.category;
    const subcategory = spot.subcategory || spot.categorySub;
    const config = categoryConfig[rawCategory] || categoryConfig.other || {};

    // 1. 完全一致 (大カテゴリ + 小カテゴリ)
    let matched = categoriesMaster.find(m => m.category === rawCategory && m.subcategory === subcategory);

    // 2. 大カテゴリ一致
    if (!matched) {
        matched = categoriesMaster.find(m => m.category === rawCategory);
    }

    // 3. rawNames (表記揺れ定義) 一致
    if (!matched && config.rawNames) {
        matched = categoriesMaster.find(m => config.rawNames.includes(m.category));
    }

    // 画像URLの抽出
    const iconUrl = spot.iconUrl || (matched ? (matched.icon_path || matched.image) : null) || config.icon_path || config.image;

    return L.icon({
        iconUrl: iconUrl,
        iconSize: [40, 40],
        iconAnchor: [20, 37],
        popupAnchor: [0, -37]
    });
}

// 8. マーカー描画
function renderMarkers(map, spots, checkedCategories, categoryConfig, categoriesMaster, createPopupHtml) {
    if (windowMarkerGroup) map.removeLayer(windowMarkerGroup);
    windowMarkerGroup = L.layerGroup().addTo(map);

    spots.forEach(spot => {
        const targetCategory = spot.categoryMain || spot.category;
        if (checkedCategories?.length > 0 && !checkedCategories.includes(targetCategory)) return;

        const icon = createMarkerIcon(spot, categoriesMaster, categoryConfig);
        const marker = L.marker([spot.lat, spot.lng], { icon });

        if (createPopupHtml) marker.bindPopup(createPopupHtml(spot));
        windowMarkerGroup.addLayer(marker);
    });
}