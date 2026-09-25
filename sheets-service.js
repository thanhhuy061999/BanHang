// Google Sheets & Firebase Auth Service for Huy Fruit & Snack
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut 
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';

let firebaseConfig = null;
let app = null;
let auth = null;
let provider = null;

// IN-MEMORY TOKEN CACHE (Mandatory: never store access token in localStorage/sessionStorage)
let cachedAccessToken = null;
let currentUser = null;
let authChangeCallbacks = [];

// Initialize Firebase
async function loadConfig() {
  if (firebaseConfig) return;
  try {
    const res = await fetch('/BanHang/firebase-applet-config.json');
    firebaseConfig = await res.json();
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');

    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      if (!user) {
        cachedAccessToken = null;
      }
      authChangeCallbacks.forEach(cb => {
        try { cb(currentUser, cachedAccessToken); } catch(e){}
      });
    });
  } catch (err) {
    console.error('Lỗi khởi tạo Firebase config:', err);
  }
}

export async function onAuthChange(callback) {
  authChangeCallbacks.push(callback);
  if (currentUser) {
    callback(currentUser, cachedAccessToken);
  }
}

export async function signInWithGoogle() {
  await loadConfig();
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;
    currentUser = result.user;

    // Trigger callbacks
    authChangeCallbacks.forEach(cb => {
      try { cb(currentUser, cachedAccessToken); } catch(e){}
    });

    return { user: currentUser, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign-in error:', error);
    throw error;
  }
}

export async function signOutFromGoogle() {
  if (auth) {
    await signOut(auth);
  }
  cachedAccessToken = null;
  currentUser = null;
  authChangeCallbacks.forEach(cb => {
    try { cb(null, null); } catch(e){}
  });
}

export function getCurrentUser() {
  return currentUser;
}

export function getCachedToken() {
  return cachedAccessToken;
}

// Get or create the Google Spreadsheet for Orders
export async function getOrCreateSpreadsheet(token) {
  // First check if server or localStorage already has a spreadsheetId
  let spreadsheetId = localStorage.getItem('huy_fruit_spreadsheet_id');
  if (!spreadsheetId) {
    try {
      const cfgRes = await fetch('/api/sheets-config');
      const cfg = await cfgRes.json();
      if (cfg.spreadsheetId) {
        spreadsheetId = cfg.spreadsheetId;
        localStorage.setItem('huy_fruit_spreadsheet_id', spreadsheetId);
      }
    } catch(e){}
  }

  // If already exists, verify access
  if (spreadsheetId) {
    try {
      const testRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (testRes.ok) {
        return {
          spreadsheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
        };
      }
    } catch (e) {
      console.warn('Existing spreadsheet unreachable, creating new one...');
    }
  }

  // Create new spreadsheet
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: 'Huy Fruit & Snack - Quản Lý Đơn Hàng'
      },
      sheets: [
        {
          properties: {
            title: 'Đơn Hàng',
            gridProperties: {
              frozenRowCount: 1
            }
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'Mã Đơn Hàng' } },
                    { userEnteredValue: { stringValue: 'Thời Gian Đặt' } },
                    { userEnteredValue: { stringValue: 'Họ Và Tên Khách' } },
                    { userEnteredValue: { stringValue: 'Số Điện Thoại' } },
                    { userEnteredValue: { stringValue: 'Địa Chỉ Giao Hàng' } },
                    { userEnteredValue: { stringValue: 'Chi Tiết Sản Phẩm' } },
                    { userEnteredValue: { stringValue: 'Tổng Tiền (VNĐ)' } },
                    { userEnteredValue: { stringValue: 'Hình Thức Thanh Toán' } },
                    { userEnteredValue: { stringValue: 'Ghi Chú Đơn' } },
                    { userEnteredValue: { stringValue: 'Trạng Thái Đơn' } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    })
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || 'Không thể tạo Google Sheet');
  }

  const createdData = await createRes.json();
  const newSheetId = createdData.spreadsheetId;
  const newSheetUrl = `https://docs.google.com/spreadsheets/d/${newSheetId}/edit`;

  localStorage.setItem('huy_fruit_spreadsheet_id', newSheetId);
  try {
    await fetch('/api/sheets-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: newSheetId, spreadsheetUrl: newSheetUrl })
    });
  } catch(e){}

  return { spreadsheetId: newSheetId, spreadsheetUrl: newSheetUrl };
}

// Append order to Google Sheets
export async function appendOrderToGoogleSheet(order, token) {
  if (!token) throw new Error('Cần đăng nhập Google để lưu trực tiếp vào Google Sheets');
  
  const sheetInfo = await getOrCreateSpreadsheet(token);
  const spreadsheetId = sheetInfo.spreadsheetId;

  const itemsString = order.items.map(it => `${it.name} (x${it.qty})`).join(', ');

  const values = [
    [
      order.orderId || 'HF-' + Date.now().toString().slice(-6),
      order.createdAt || new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      order.customerName,
      order.phone,
      order.address,
      itemsString,
      (order.total || 0).toLocaleString('vi-VN') + 'đ',
      order.paymentMethod || 'COD',
      order.note || '',
      'Mới tiếp nhận'
    ]
  ];

  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:J:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values })
    }
  );

  if (!appendRes.ok) {
    const err = await appendRes.json();
    throw new Error(err.error?.message || 'Lỗi ghi vào Google Sheets');
  }

  return {
    success: true,
    spreadsheetId,
    spreadsheetUrl: sheetInfo.spreadsheetUrl
  };
}

// Automatically initialize on import
loadConfig();
