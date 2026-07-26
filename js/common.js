// ==========================================
// js/common.js - 共通処理・データ取得・マップ初期化
// ==========================================

const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycby6rgf6E5RV2e_awmkQkCzrFt3xjaq2nX1JFp1PcVYgjOcfm9uteTXJvFPRv7GTjh6h/exec";

// みやま市境界データ
const miyamaBorderLatLng = [
    [33.18635418549079, 130.55241793544099], [33.190159490685225, 130.53472024103644],
    [33.18833287377129, 130.50907369822042], [33.185984310513966, 130.49044292766723],
    [33.18585383279454, 130.47415074565],     [33.17632844469694, 130.47072081329426],
    [33.17130436391597, 130.45700108298794],  [33.16303835573494, 130.4505265489401],
    [33.14666096940182, 130.44584659675203],  [33.11860073474425, 130.4272203874322],
    [33.10353695847264, 130.4078708598711],   [33.095608334113415, 130.3872995693444],
    [33.08541008852506, 130.38984959565784],  [33.07909402856037, 130.39910520386425],
    [33.06597428509903, 130.41177052462777],  [33.07018955853409, 130.43142732066585],
    [33.07285724782254, 130.44391189224342],  [33.083856841971766, 130.4564934294682],
    [33.085565650168476, 130.47082491328803], [33.08242511223391, 130.48322716145165],
    [33.08732060779959, 130.51007113473892],  [33.08043912605376, 130.52407189345288],
    [33.07908140166218, 130.54169061215322],  [33.08159342625597, 130.5793963403277],
    [33.09974698080774, 130.57854232597015],  [33.11156260700514, 130.57247187426483], 
    [33.13074214638127, 130.5670330118785],   [33.135841539393084, 130.567555743066],
    [33.14134595387898, 130.5577805555186],   [33.155705930321744, 130.55708657479175],
    [33.161955669977374, 130.54479173622758], [33.169702150562, 130.54661540370586],
    [33.17733649353649, 130.54760680474422],  [33.18415887915106, 130.55494141032403],
    [33.18635418549079, 130.55241793544099]
];

const MAP_DEFAULT_CENTER = [33.127466262080105, 130.49817935838587];
const MAP_DEFAULT_ZOOM = 14;

// ローディング切り替え
function toggleLoading(show) {
    const loader = document.getElementById('loading');
    if (loader) {
        if (show) loader.classList.add('active');
        else loader.classList.remove('active');
    }
}

// マップ初期化（BoundaryCanvas＆ぼかし処理）
function initBaseMap() {
    const miyamaGeoJSON = {
        "type": "Feature",
        "geometry": { "type": "Polygon", "coordinates": [miyamaBorderLatLng.map(coord => [coord[1], coord[0]])] }
    };

    const map = L.map('map', { zoomControl: false, maxZoom: 18, minZoom: 13, keepBuffer: 4 }).setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM);
    
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    const zoomControlEl = document.querySelector('.leaflet-bottom.leaflet-left .leaflet-control-zoom');
    if (zoomControlEl && document.getElementById('zoom-control-wrapper')) {
        document.getElementById('zoom-control-wrapper').appendChild(zoomControlEl);
    }

    const miyamaBounds = L.latLngBounds([32.95948876991778, 130.22305621802062], [33.264972980181696, 130.6578015599507]);
    map.setMaxBounds(miyamaBounds);

    L.TileLayer.boundaryCanvas('https://tile.openstreetmap.jp/{z}/{x}/{y}.png', {
        boundary: miyamaGeoJSON, attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    }).addTo(map);

    const blurryEdge = L.polygon(miyamaBorderLatLng, { color: '#0f172a', weight: 30, opacity: 0.9, fill: false, interactive: false }).addTo(map);
    if (blurryEdge.getElement()) blurryEdge.getElement().style.filter = 'blur(15px)';
    L.polygon(miyamaBorderLatLng, { color: '#0f172a', weight: 6, opacity: 0.9, fillColor: 'transparent', interactive: false }).addTo(map);

    return map;
}

// カテゴリマスタ読み込み（そのまま取得して返すだけ）
async function loadCategoryMaster() {
    try {
        const response = await fetch('./json/category.json?v=' + Date.now());
        if (!response.ok) throw new Error(`JSON取得失敗: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("🛑 カテゴリJSON参照エラー:", e);
        alert("エラー: category.json が正しく読み込めません。");
        return [];
    }
}

// スポットデータ一括取得
async function loadDataFromSpreadsheet() {
    toggleLoading(true);
    try {
        const response = await fetch(GAS_WEB_APP_URL);
        const data = await response.json();
        return data.spots ? data.spots : data;
    } catch (error) {
        console.error("データ取得失敗:", error);
        return [];
    } finally {
        toggleLoading(false);
    }
}

// アイコン生成（大カテゴリ ＋ 小カテゴリの両方に対応）
function createCustomIcon(categoryName, subcategoryName = null, master = null) {
    const list = master || window.categoriesMaster || [];
    
    // まず「大カテゴリ ＋ 小カテゴリ」で完全一致検索
    let config = list.find(item => item.category === categoryName && item.subcategory === subcategoryName);
    
    // 見つからない場合は「大カテゴリ」のみで検索
    if (!config) {
        config = list.find(item => item.category === categoryName);
    }
    
    const iconUrl = config ? (config.icon_path || config.image) : null;
    
    if (iconUrl) {
        return L.icon({
            iconUrl: iconUrl,
            iconSize: [64, 64],
            iconAnchor: [32, 64],
            popupAnchor: [0, -64]
        });
    }
    
    return new L.Icon.Default();
}

// 境界線内判定（Ray-casting）
function isInsideMiyama(clickLatLng) {
    const miyamaPolygonForCheck = L.polygon(miyamaBorderLatLng);
    const bounds = miyamaPolygonForCheck.getBounds();
    let isInside = bounds.contains(clickLatLng);

    if (isInside) {
        let x = clickLatLng.lat, y = clickLatLng.lng;
        let inside = false;
        for (let i = 0, j = miyamaBorderLatLng.length - 1; i < miyamaBorderLatLng.length; j = i++) {
            let xi = miyamaBorderLatLng[i][0], yi = miyamaBorderLatLng[i][1];
            let xj = miyamaBorderLatLng[j][0], yj = miyamaBorderLatLng[j][1];
            let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        isInside = inside;
    }
    return isInside;
}