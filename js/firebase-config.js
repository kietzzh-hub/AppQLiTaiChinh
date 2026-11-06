// js/firebase-config.js
// Import các hàm từ CDN Firebase v10 chính thức của Google (tương thích trực tiếp với trình duyệt không cần bundler/npm)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";

// Cấu hình Firebase của ứng dụng Quản Lý Tài Chính
export const firebaseConfig = {
  apiKey: "AIzaSyC9NZR16dvmsX9wz7PjXwyIwR1I1gvu5Mw",
  authDomain: "appquanlitaichinh.firebaseapp.com",
  projectId: "appquanlitaichinh",
  storageBucket: "appquanlitaichinh.firebasestorage.app",
  messagingSenderId: "139634174151",
  appId: "1:139634174151:web:cc140767eff50702d436e2",
  measurementId: "G-B4QRCM09X4"
};

// Khởi tạo Firebase App
export const app = initializeApp(firebaseConfig);

// Khởi tạo Firebase Analytics có cơ chế kiểm tra môi trường an toàn (tránh lỗi khi chạy ở chế độ ẩn danh/chặn cookie)
export let analytics = null;
isSupported()
  .then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
      window.firebaseAnalytics = analytics;
      console.log("✓ Firebase Analytics đã được kích hoạt thành công!");
    } else {
      console.warn("Firebase Analytics không được hỗ trợ trong môi trường này (chế độ ẩn danh hoặc trình duyệt chặn lưu trữ).");
    }
  })
  .catch((err) => {
    console.warn("Không thể khởi tạo Firebase Analytics:", err);
  });

// Gắn vào window để các script khác (như app.js) có thể tái sử dụng dễ dàng khi cần
window.firebaseApp = app;
window.firebaseConfig = firebaseConfig;

console.log("✓ Firebase App đã được khởi tạo thành công:", app.name);
