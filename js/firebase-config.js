// js/firebase-config.js
// Import Firebase App, Analytics và Cloud Firestore từ CDN chính thức của Google Firebase v10
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// 1. Cấu hình Firebase của ứng dụng Quản Lý Tài Chính
export const firebaseConfig = {
  apiKey: "AIzaSyC9NZR16dvmsX9wz7PjXwyIwR1I1gvu5Mw",
  authDomain: "appquanlitaichinh.firebaseapp.com",
  projectId: "appquanlitaichinh",
  storageBucket: "appquanlitaichinh.firebasestorage.app",
  messagingSenderId: "139634174151",
  appId: "1:139634174151:web:cc140767eff50702d436e2",
  measurementId: "G-B4QRCM09X4"
};

// 2. Khởi tạo Firebase App & Cloud Firestore
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// 3. Khởi tạo Firebase Analytics an toàn
export let analytics = null;
isSupported()
  .then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
      window.firebaseAnalytics = analytics;
    }
  })
  .catch((err) => {
    console.warn("Firebase Analytics không khả dụng:", err);
  });

// 4. MODULE ĐỒNG BỘ ĐÁM MÂY (FIREBASE CLOUD SYNC)
export const FirebaseSync = {
  db,
  isSyncing: false,
  status: 'idle', // 'idle' | 'syncing' | 'synced' | 'error' | 'permission-denied'
  _syncDebounceTimers: {},

  /**
   * Cập nhật giao diện trạng thái đồng bộ đám mây trên Header
   */
  updateUIStatus(status, message) {
    this.status = status;
    const badge = document.getElementById('cloudSyncStatus');
    if (!badge) return;

    badge.className = 'cloud-sync-status ' + status;
    const textEl = badge.querySelector('.sync-text');
    const iconEl = badge.querySelector('i');

    if (status === 'synced') {
      if (iconEl) iconEl.className = 'fa-solid fa-cloud-check';
      if (textEl) textEl.textContent = 'Đã lưu đám mây';
      badge.title = 'Dữ liệu đã được đồng bộ lên Cloud Firestore an toàn. Nhấn để đồng bộ lại.';
    } else if (status === 'syncing') {
      if (iconEl) iconEl.className = 'fa-solid fa-arrows-rotate fa-spin';
      if (textEl) textEl.textContent = 'Đang đồng bộ...';
      badge.title = 'Đang truyền dữ liệu với Cloud Firestore...';
    } else if (status === 'permission-denied') {
      if (iconEl) iconEl.className = 'fa-solid fa-shield-halved';
      if (textEl) textEl.textContent = 'Chưa mở Rules';
      badge.title = 'Chưa cấp quyền ghi! Vui lòng vào Firebase Console > Firestore Database > Rules đổi sang "allow read, write: if true;"';
    } else if (status === 'error') {
      if (iconEl) iconEl.className = 'fa-solid fa-cloud-slash';
      if (textEl) textEl.textContent = 'Lỗi kết nối';
      badge.title = message || 'Không thể kết nối đến Firebase Cloud Firestore. Nhấn để thử lại.';
    }
  },

  /**
   * Xử lý lỗi tập trung và thông báo minh bạch cho người dùng
   */
  handleError(err, context = '') {
    console.error(`FirebaseSync error (${context}):`, err);
    if (err && (err.code === 'permission-denied' || String(err).includes('permission-denied') || String(err).includes('Missing or insufficient permissions'))) {
      this.updateUIStatus('permission-denied');
      if (window.Utils && window.Utils.showToast) {
        window.Utils.showToast(
          'Firebase chưa mở quyền ghi! Vui lòng vào Firebase Console > Firestore Database > tab Rules và đổi "if false" thành "if true".',
          'warning'
        );
      }
    } else {
      this.updateUIStatus('error', err?.message);
    }
  },

  /**
   * Đồng bộ toàn diện khi mở ứng dụng (Initial Bi-directional Sync)
   * - Nếu Firestore trống: Đẩy toàn bộ dữ liệu từ LocalStorage lên Firestore.
   * - Nếu Firestore đã có dữ liệu: Tải về và cập nhật vào LocalStorage.
   */
  async initialSync() {
    this.updateUIStatus('syncing');
    try {
      // Đợi Store và App sẵn sàng
      await this._waitForStore();

      // Đọc các bộ sưu tập chính từ Firestore
      const [txnsSnap, catsSnap, memsSnap, budsSnap] = await Promise.all([
        getDocs(collection(db, 'transactions')),
        getDocs(collection(db, 'categories')),
        getDocs(collection(db, 'members')),
        getDocs(collection(db, 'budgets'))
      ]);

      const firestoreHasData = !txnsSnap.empty || !catsSnap.empty || !memsSnap.empty || !budsSnap.empty;

      if (!firestoreHasData) {
        // TRƯỜNG HỢP 1: Firestore đang trống hoàn toàn -> Đẩy dữ liệu hiện có từ máy lên đám mây
        console.log('Firebase Cloud Firestore đang trống. Bắt đầu đẩy dữ liệu từ LocalStorage lên Firebase...');
        await this.pushAllToFirestore();
        this.updateUIStatus('synced');
        if (window.Utils && window.Utils.showToast) {
          window.Utils.showToast('Đã đẩy toàn bộ dữ liệu tài chính lên Cloud Firestore thành công!', 'success');
        }
      } else {
        // TRƯỜNG HỢP 2: Firestore đã có dữ liệu -> Tải dữ liệu đám mây về máy
        console.log('Phát hiện dữ liệu trên Cloud Firestore. Đang đồng bộ về thiết bị...');
        const cloudTxns = [];
        txnsSnap.forEach(d => cloudTxns.push(d.data()));

        const cloudCats = [];
        catsSnap.forEach(d => cloudCats.push(d.data()));

        const cloudMems = [];
        memsSnap.forEach(d => cloudMems.push(d.data()));

        const cloudBuds = [];
        budsSnap.forEach(d => cloudBuds.push(d.data()));

        if (window.Store) {
          if (cloudTxns.length > 0) window.Store.set(window.Store.KEYS.TRANSACTIONS, cloudTxns);
          if (cloudCats.length > 0) window.Store.set(window.Store.KEYS.CATEGORIES, cloudCats);
          if (cloudMems.length > 0) window.Store.set(window.Store.KEYS.MEMBERS, cloudMems);
          if (cloudBuds.length > 0) window.Store.set(window.Store.KEYS.BUDGETS, cloudBuds);
          window.Store.set(window.Store.KEYS.INITIALIZED, true);

          // Cập nhật lại màn hình hiện tại
          if (window.App && window.Navigation) {
            window.App.renderPage(window.Navigation.currentPage || 'page-dashboard');
          }
        }
        this.updateUIStatus('synced');
        if (window.Utils && window.Utils.showToast) {
          window.Utils.showToast(`Đã đồng bộ ${cloudTxns.length} giao dịch từ Firebase về máy!`, 'success');
        }
      }
    } catch (err) {
      this.handleError(err, 'initialSync');
    }
  },

  /**
   * Đẩy toàn bộ dữ liệu đang có trong LocalStorage lên Cloud Firestore
   */
  async pushAllToFirestore() {
    if (!window.Store) return;
    const txns = window.Store.getTransactions() || [];
    const cats = window.Store.getCategories() || [];
    const mems = window.Store.getMembers() || [];
    const buds = window.Store.getBudgets() || [];

    const batch = writeBatch(db);

    txns.forEach((t) => {
      if (t.id) batch.set(doc(db, 'transactions', String(t.id)), t);
    });
    cats.forEach((c) => {
      if (c.id) batch.set(doc(db, 'categories', String(c.id)), c);
    });
    mems.forEach((m) => {
      if (m.id) batch.set(doc(db, 'members', String(m.id)), m);
    });
    buds.forEach((b) => {
      if (b.id) batch.set(doc(db, 'budgets', String(b.id)), b);
    });

    await batch.commit();
    console.log(`✓ Đã lưu lên Firestore: ${txns.length} giao dịch, ${cats.length} danh mục, ${mems.length} thành viên, ${buds.length} ngân sách.`);
  },

  /**
   * Đồng bộ một bộ sưu tập (Collection) khi có thay đổi (thêm, sửa, xóa)
   * Sử dụng Debounce để gom nhiều thao tác liên tiếp thành 1 lần ghi Firestore
   */
  syncCollection(colName, items) {
    if (!Array.isArray(items)) return;

    // Hủy timer cũ nếu có (Debounce 300ms)
    if (this._syncDebounceTimers[colName]) {
      clearTimeout(this._syncDebounceTimers[colName]);
    }

    this.updateUIStatus('syncing');

    this._syncDebounceTimers[colName] = setTimeout(async () => {
      try {
        const snap = await getDocs(collection(db, colName));
        const existingIds = new Set();
        snap.forEach(d => existingIds.add(d.id));

        const newIds = new Set(items.map(i => String(i.id)));
        const batch = writeBatch(db);

        // 1. Ghi / Cập nhật các mục hiện có
        items.forEach(item => {
          if (item && item.id) {
            batch.set(doc(db, colName, String(item.id)), item);
          }
        });

        // 2. Xóa các mục đã bị xóa khỏi danh sách
        existingIds.forEach(id => {
          if (!newIds.has(id)) {
            batch.delete(doc(db, colName, id));
          }
        });

        await batch.commit();
        this.updateUIStatus('synced');
        console.log(`✓ Đã đồng bộ bộ sưu tập "${colName}" (${items.length} mục) lên Firestore.`);
      } catch (err) {
        this.handleError(err, `syncCollection ${colName}`);
      }
    }, 300);
  },

  /**
   * Đợi Store trong app.js sẵn sàng
   */
  _waitForStore() {
    return new Promise((resolve) => {
      if (window.Store && typeof window.Store.getTransactions === 'function') {
        return resolve();
      }
      const interval = setInterval(() => {
        if (window.Store && typeof window.Store.getTransactions === 'function') {
          clearInterval(interval);
          resolve();
        }
      }, 50);
      // Timeout an toàn sau 5s
      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, 5000);
    });
  }
};

// Gắn toàn cục để app.js và giao diện có thể gọi
window.firebaseApp = app;
window.firebaseDb = db;
window.firebaseConfig = firebaseConfig;
window.FirebaseSync = FirebaseSync;

// Tự động khởi chạy đồng bộ khi trang web tải xong
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    FirebaseSync.initialSync();
    setupSyncButton();
  });
} else {
  FirebaseSync.initialSync();
  setupSyncButton();
}

function setupSyncButton() {
  const btn = document.getElementById('cloudSyncStatus');
  if (btn) {
    btn.addEventListener('click', () => {
      FirebaseSync.initialSync();
    });
  }
}
