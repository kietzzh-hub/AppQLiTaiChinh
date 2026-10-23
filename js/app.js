/**
 * Ứng Dụng Quản Lý Tài Chính Gia Đình
 * Đầy đủ tính năng: Thu nhập, Chi tiêu, Báo cáo thống kê, Danh mục, Thành viên, Ngân sách.
 * Lưu trữ dữ liệu trên LocalStorage.
 */
(function () {
  'use strict';

  // =========================================================================
  // 1. CÁC TIỆN ÍCH (UTILITIES)
  // =========================================================================
  const Utils = {
    generateId() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
    },

    formatCurrency(amount) {
      const num = Number(amount) || 0;
      try {
        return new Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
          maximumFractionDigits: 0,
        }).format(num);
      } catch (e) {
        return num.toLocaleString('vi-VN') + ' ₫';
      }
    },

    formatDate(dateStr) {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    },

    formatDateFull(dateStr) {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      return `Ngày ${parseInt(parts[2], 10)} tháng ${parseInt(parts[1], 10)} năm ${parts[0]}`;
    },

    getCurrentDate() {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    },

    getCurrentMonthYear() {
      const now = new Date();
      return {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      };
    },

    monthNames: [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
      'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
      'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ],

    escapeHtml(str) {
      if (str === null || str === undefined) return '';
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    },

    showToast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;

      const iconMap = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info',
      };
      const icon = iconMap[type] || 'fa-circle-info';

      toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <div class="toast-content">${Utils.escapeHtml(message)}</div>
        <button class="toast-close" aria-label="Đóng">&times;</button>
      `;

      container.appendChild(toast);

      const dismiss = () => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 350);
      };

      const closeBtn = toast.querySelector('.toast-close');
      if (closeBtn) closeBtn.addEventListener('click', dismiss);

      setTimeout(dismiss, 3500);
    },

    debounce(fn, delay = 250) {
      let timeoutId;
      return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    animateNumber(el, targetValue) {
      if (!el) return;
      const target = Number(targetValue) || 0;
      el.textContent = Utils.formatCurrency(target);
    },

    /**
     * Hạn mức số tiền tối thiểu và tối đa hợp lệ cho một giao dịch / ngân sách (VND)
     */
    MIN_AMOUNT: 1,
    MAX_AMOUNT: 999999999999, // 999 tỷ VND

    /**
     * Định dạng chuỗi số với dấu chấm phân tách hàng nghìn (VD: 1000000 -> 1.000.000)
     * Giữ nguyên nếu chuỗi chứa ký tự không hợp lệ để không làm biến dạng dữ liệu người dùng
     */
    formatNumberInput(val) {
      if (val === null || val === undefined) return '';
      const str = String(val).trim();
      if (!str) return '';
      // Nếu chuỗi chứa ký tự lạ (chữ cái, dấu âm, ký hiệu), không tự ý xóa để tránh méo số
      if (/[^\d.]/.test(str)) return str;
      const digits = str.replace(/\./g, '');
      if (!digits) return '';
      const cleanDigits = digits.replace(/^0+(?=\d)/, '');
      return cleanDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    },

    /**
     * Kiểm tra tính hợp lệ và phân tích số tiền nhập vào
     * Trả về kết quả minh bạch: { valid: boolean, amount: number, error: string | null }
     */
    validateAmount(val) {
      if (val === null || val === undefined) {
        return { valid: false, amount: 0, error: 'Vui lòng nhập số tiền' };
      }

      if (typeof val === 'number') {
        if (!Number.isFinite(val) || isNaN(val)) {
          return { valid: false, amount: 0, error: 'Số tiền không hợp lệ' };
        }
        if (!Number.isInteger(val)) {
          return { valid: false, amount: val, error: 'Số tiền phải là số nguyên (VND không sử dụng số thập phân)' };
        }
        if (val < this.MIN_AMOUNT) {
          return { valid: false, amount: val, error: 'Số tiền phải lớn hơn 0' };
        }
        if (val > this.MAX_AMOUNT) {
          return { valid: false, amount: val, error: `Số tiền vượt quá giới hạn tối đa (${Utils.formatCurrency(this.MAX_AMOUNT)})` };
        }
        return { valid: true, amount: val, error: null };
      }

      const str = String(val).trim();
      if (!str) {
        return { valid: false, amount: 0, error: 'Vui lòng nhập số tiền' };
      }

      // 1. Kiểm tra ký tự lạ (chữ cái, dấu âm, ký hiệu tiền tệ, dấu phẩy, v.v.)
      if (/[^\d.]/.test(str)) {
        return {
          valid: false,
          amount: 0,
          error: 'Số tiền chứa ký tự không hợp lệ. Vui lòng chỉ nhập số (VD: 10.000.000)'
        };
      }

      // 2. Kiểm tra quy chuẩn dấu chấm phân cách hàng nghìn nếu có
      if (str.includes('.')) {
        if (str.startsWith('.') || str.endsWith('.') || str.includes('..')) {
          return {
            valid: false,
            amount: 0,
            error: 'Định dạng số tiền không đúng quy chuẩn (VD: 10.000.000)'
          };
        }
        const parts = str.split('.');
        if (parts[0].length === 0 || parts[0].length > 3) {
          return {
            valid: false,
            amount: 0,
            error: 'Định dạng số tiền phân cách hàng nghìn không hợp lệ (VD: 10.000.000)'
          };
        }
        for (let i = 1; i < parts.length; i++) {
          if (parts[i].length !== 3) {
            return {
              valid: false,
              amount: 0,
              error: 'Mỗi nhóm phân cách hàng nghìn sau dấu chấm phải có đúng 3 chữ số (VD: 10.000.000)'
            };
          }
        }
      }

      const cleanDigits = str.replace(/\./g, '');
      if (!cleanDigits || !/^\d+$/.test(cleanDigits)) {
        return { valid: false, amount: 0, error: 'Số tiền không hợp lệ' };
      }

      const amount = parseInt(cleanDigits, 10);

      // 3. Kiểm tra tính hữu hạn và giới hạn an toàn số nguyên
      if (!Number.isFinite(amount) || isNaN(amount) || !Number.isSafeInteger(amount)) {
        return { valid: false, amount: 0, error: 'Số tiền vượt quá giới hạn tính toán an toàn của hệ thống' };
      }

      // 4. Kiểm tra ngưỡng tối thiểu (> 0)
      if (amount < this.MIN_AMOUNT) {
        return { valid: false, amount: 0, error: 'Số tiền phải lớn hơn 0' };
      }

      // 5. Kiểm tra ngưỡng tối đa
      if (amount > this.MAX_AMOUNT) {
        return {
          valid: false,
          amount: 0,
          error: `Số tiền vượt quá giới hạn tối đa cho phép (${Utils.formatCurrency(this.MAX_AMOUNT)})`
        };
      }

      return { valid: true, amount, error: null };
    },

    /**
     * Chuyển chuỗi số có dấu chấm phân cách thành số nguyên (integer VND)
     * Trả về NaN nếu chuỗi không đúng định dạng hoặc vượt giới hạn (thay vì tự ý xóa ký tự lỗi)
     */
    parseNumberInput(val) {
      const res = this.validateAmount(val);
      return res.valid ? res.amount : NaN;
    },

    /**
     * Gắn bộ lắng nghe sự kiện định dạng tiền tệ thời gian thực kèm giữ chuẩn vị trí con trỏ
     */
    attachCurrencyInputMask(inputEl) {
      if (!inputEl) return;

      inputEl.addEventListener('input', function () {
        const raw = this.value;

        // Nếu người dùng gõ/dán ký tự không phải số hoặc dấu chấm, không tự ý xóa làm méo số
        // Giữ nguyên để người dùng nhìn thấy lỗi và validateAmount sẽ bắt lỗi rõ ràng
        if (raw && /[^\d.]/.test(raw)) {
          this.classList.add('is-invalid');
          return;
        }
        this.classList.remove('is-invalid');

        const selStart = this.selectionStart || 0;

        // Đếm số chữ số nằm trước con trỏ trước khi format
        const digitsBeforeCursor = (raw.slice(0, selStart).match(/\d/g) || []).length;

        // Định dạng lại giá trị
        const formatted = Utils.formatNumberInput(raw);
        this.value = formatted;

        // Đặt lại vị trí con trỏ tương ứng với số chữ số ban đầu
        let newCursorPos = 0;
        let digitsCount = 0;
        if (digitsBeforeCursor === 0) {
          newCursorPos = 0;
        } else {
          for (let i = 0; i < formatted.length; i++) {
            if (/\d/.test(formatted[i])) {
              digitsCount++;
            }
            if (digitsCount === digitsBeforeCursor) {
              newCursorPos = i + 1;
              break;
            }
          }
          if (newCursorPos === 0) newCursorPos = formatted.length;
        }

        this.setSelectionRange(newCursorPos, newCursorPos);
      });

      // Hỗ trợ phím Backspace khi đứng ngay sau dấu chấm
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace') {
          const selStart = this.selectionStart;
          const selEnd = this.selectionEnd;
          if (selStart === selEnd && selStart > 0 && this.value[selStart - 1] === '.') {
            e.preventDefault();
            const val = this.value;
            const left = val.slice(0, selStart - 2);
            const right = val.slice(selStart);
            const digitsBefore = (left.match(/\d/g) || []).length;
            const formatted = Utils.formatNumberInput(left + right);
            this.value = formatted;

            let newCursor = 0;
            let dc = 0;
            if (digitsBefore === 0) {
              newCursor = 0;
            } else {
              for (let i = 0; i < formatted.length; i++) {
                if (/\d/.test(formatted[i])) dc++;
                if (dc === digitsBefore) {
                  newCursor = i + 1;
                  break;
                }
              }
              if (newCursor === 0) newCursor = formatted.length;
            }
            this.setSelectionRange(newCursor, newCursor);
          }
        }
      });
    }
  };

  // =========================================================================
  // 2. KHO DỮ LIỆU (STORE & LOCALSTORAGE)
  // =========================================================================
  const Store = {
    KEYS: {
      TRANSACTIONS: 'finance_transactions',
      CATEGORIES: 'finance_categories',
      MEMBERS: 'finance_members',
      BUDGETS: 'finance_budgets',
      INITIALIZED: 'finance_initialized_v2',
    },

    // Bộ nhớ đệm cứu hộ trong RAM trường hợp rollback localStorage bị lỗi nghiêm trọng.
    // _emergencyBackup[key] chứa giá trị gốc (đã parse) hoặc ký hiệu _SENTINEL_NULL nếu key ban đầu chưa tồn tại.
    // _corruptedKeys theo dõi danh sách khóa mà localStorage đang chứa dữ liệu bẩn (dirty) không đáng tin cậy.
    _emergencyBackup: {},
    _corruptedKeys: new Set(),
    _SENTINEL_NULL: Object.freeze({ __sentinel__: 'KEY_DID_NOT_EXIST' }),
    lastAtomicResult: null,

    /**
     * Kiểm tra xem một giá trị có phải là sentinel đánh dấu "khóa ban đầu chưa tồn tại" hay không.
     */
    _isSentinelNull(val) {
      return val !== null && typeof val === 'object' && val.__sentinel__ === 'KEY_DID_NOT_EXIST';
    },

    get(key, defaultValue = []) {
      // Nếu khóa đang bị đánh dấu hỏng (corrupted), KHÔNG BAO GIỜ đọc từ localStorage
      if (this._corruptedKeys.has(key)) {
        if (this._emergencyBackup.hasOwnProperty(key)) {
          const backup = this._emergencyBackup[key];
          // Nếu backup là sentinel → key ban đầu chưa tồn tại → trả defaultValue
          if (this._isSentinelNull(backup)) return defaultValue;
          return backup;
        }
        // Không có backup nào cả → trả defaultValue an toàn hơn là đọc dữ liệu bẩn
        return defaultValue;
      }
      try {
        const data = localStorage.getItem(key);
        if (data !== null) return JSON.parse(data);
        return defaultValue;
      } catch (e) {
        console.error('Error reading localStorage', e);
        // Fallback sang emergency backup nếu có
        if (this._emergencyBackup.hasOwnProperty(key)) {
          const backup = this._emergencyBackup[key];
          if (this._isSentinelNull(backup)) return defaultValue;
          return backup;
        }
        return defaultValue;
      }
    },

    set(key, value) {
      if (value === undefined) {
        console.error(`Store.set: Không thể lưu giá trị undefined cho khóa "${key}"`);
        return false;
      }
      try {
        const serialized = JSON.stringify(value);
        if (typeof serialized !== 'string' || serialized === 'undefined' || serialized.length === 0) {
          console.error(`Store.set: Dữ liệu của khóa "${key}" không thể tuần tự hóa thành chuỗi JSON hợp lệ`);
          return false;
        }
        localStorage.setItem(key, serialized);
        // Ghi thành công → khóa này đã sạch, xóa mọi dấu hiệu hỏng
        this._corruptedKeys.delete(key);
        delete this._emergencyBackup[key];
        return true;
      } catch (e) {
        console.error('Error writing localStorage', e);
        return false;
      }
    },

    /**
     * Ghi nhiều mục dữ liệu một cách nguyên tử (atomic multi-key transaction).
     * Quy tắc tuần tự hóa:
     * - Mọi giá trị đầu vào (object, array, string, number, boolean) BẮT BUỘC phải được tuần tự hóa thành chuỗi JSON hợp lệ
     *   bằng JSON.stringify() trước khi lưu vào localStorage. Không lưu chuỗi nguyên dạng (raw string) chưa qua JSON.stringify()
     *   để đảm bảo tính đối xứng và an toàn tuyệt đối khi Store.get() giải mã bằng JSON.parse().
     * - Chặn hoàn toàn các giá trị không hợp lệ (undefined, function, Symbol hoặc các cấu trúc vòng tròn) ngay tại Bước 1 (Fail-fast).
     *   Nếu có bất kỳ khóa nào không hợp lệ, hàm dừng ngay lập tức và không thay đổi bất kỳ khóa nào trong localStorage.
     * 
     * Quy trình kiểm soát lỗi 5 lớp:
     * 1. Tiền kiểm tra & tuần tự hóa JSON nghiêm ngặt (kiểm tra kiểu string và loại trừ undefined/non-string).
     * 2. Đọc bản sao lưu nằm hoàn toàn trong try/catch (phòng ngừa SecurityError / trình duyệt chặn truy cập).
     * 3. Thực thi ghi tuần tự kèm lưu vết chính xác danh sách các khóa đã thay đổi thực tế (writtenKeys).
     * 4. Nếu phát sinh lỗi, rollback ngược theo thứ tự các khóa đã ghi. Nếu setItem gặp lỗi (ví dụ QuotaExceededError
     *    do chuỗi dirty mới chiếm dung lượng), tự động giải phóng ô nhớ (removeItem) trước rồi mới ghi lại dữ liệu gốc.
     * 5. Ghi nhận chi tiết kết quả (thành công, rollback an toàn, hay rollback lỗi kèm danh sách khóa bị ảnh hưởng).
     * 
     * @param {Object} entries - Đối tượng dạng { [key]: value, ... }
     * @returns {{ success: boolean, rolledBack: boolean, error: string | null, failedKeys: string[] }}
     */
    atomicSave(entries) {
      if (!entries || typeof entries !== 'object') {
        const res = { success: false, rolledBack: false, error: 'Dữ liệu đầu vào không hợp lệ', failedKeys: [] };
        this.lastAtomicResult = res;
        return res;
      }

      const keys = Object.keys(entries);
      if (keys.length === 0) {
        const res = { success: true, rolledBack: false, error: null, failedKeys: [] };
        // Ghi thành công → xóa mọi dấu hiệu hỏng cho các key này
        for (const k of keys) {
          this._corruptedKeys.delete(k);
          delete this._emergencyBackup[k];
        }
        this.lastAtomicResult = res;
        return res;
      }

      // BƯỚC 1: Tiền kiểm tra & tuần tự hóa JSON nghiêm ngặt (Fail-fast trước khi can thiệp vào localStorage)
      const serializedMap = {};
      try {
        for (const key of keys) {
          const val = entries[key];

          // 1.1 Chặn rõ ràng nếu giá trị là undefined
          if (val === undefined) {
            const res = {
              success: false,
              rolledBack: false, // Chưa hề chạm vào localStorage
              error: `Khóa "${key}" có giá trị undefined, không thể tuần tự hóa thành JSON hợp lệ`,
              failedKeys: [],
            };
            this.lastAtomicResult = res;
            return res;
          }

          // 1.2 Tuần tự hóa JSON đồng nhất: tất cả giá trị đều được mã hóa bằng JSON.stringify
          const serialized = JSON.stringify(val);

          // 1.3 Kiểm tra kết quả sau tuần tự hóa: phải là string hợp lệ và không thể là "undefined"
          if (typeof serialized !== 'string' || serialized === 'undefined' || serialized.length === 0) {
            const res = {
              success: false,
              rolledBack: false, // Chưa hề chạm vào localStorage
              error: `Khóa "${key}" không thể tuần tự hóa thành chuỗi JSON hợp lệ`,
              failedKeys: [],
            };
            this.lastAtomicResult = res;
            return res;
          }

          serializedMap[key] = serialized;
        }
      } catch (serializeErr) {
        console.error('Store.atomicSave: Lỗi tuần tự hóa dữ liệu JSON', serializeErr);
        const res = {
          success: false,
          rolledBack: false, // Chưa hề chạm vào localStorage, không có gì để hoàn tác
          error: 'Dữ liệu không thể chuyển đổi thành chuỗi JSON: ' + (serializeErr.message || ''),
          failedKeys: [],
        };
        this.lastAtomicResult = res;
        return res;
      }

      // BƯỚC 2: Sao lưu trạng thái ban đầu của tất cả các khóa NẰM HOÀN TOÀN TRONG TRY/CATCH
      const snapshot = {};
      try {
        for (const key of keys) {
          snapshot[key] = localStorage.getItem(key);
        }
      } catch (readErr) {
        console.error('Store.atomicSave: Không thể đọc bản sao lưu từ localStorage', readErr);
        const res = {
          success: false,
          rolledBack: false, // Chưa thay đổi gì, trạng thái ban đầu vẫn nguyên vẹn — không có gì để hoàn tác
          error: 'Trình duyệt từ chối quyền truy cập bộ nhớ khi tạo bản sao lưu (' + (readErr.message || 'SecurityError') + ')',
          failedKeys: [],
        };
        this.lastAtomicResult = res;
        return res;
      }

      // BƯỚC 3: Ghi dữ liệu mới tuần tự và lưu vết chính xác các khóa đã ghi thành công
      const writtenKeys = [];
      try {
        for (const key of keys) {
          localStorage.setItem(key, serializedMap[key]);
          writtenKeys.push(key);
        }
        const res = { success: true, rolledBack: false, error: null, failedKeys: [] };
        // Ghi thành công → xóa mọi dấu hiệu hỏng cho các key này
        for (const k of keys) {
          this._corruptedKeys.delete(k);
          delete this._emergencyBackup[k];
        }
        this.lastAtomicResult = res;
        return res;
      } catch (writeErr) {
        console.error('Store.atomicSave: Lỗi khi ghi dữ liệu vào localStorage. Bắt đầu hoàn tác an toàn...', writeErr);

        // BƯỚC 4: Hoàn tác (Rollback) ngược theo thứ tự các khóa đã thực sự bị thay đổi
        const failedRollbackKeys = [];
        for (let i = writtenKeys.length - 1; i >= 0; i--) {
          const key = writtenKeys[i];
          const originalVal = snapshot[key];
          try {
            if (originalVal === null) {
              localStorage.removeItem(key);
            } else {
              localStorage.setItem(key, originalVal);
            }
          } catch (firstErr) {
            // Nếu setItem thất bại (thường do QuotaExceededError vì chuỗi dirty mới chiếm dung lượng),
            // giải phóng ô nhớ dirty bằng removeItem trước, sau đó ghi lại originalVal.
            try {
              localStorage.removeItem(key);
              if (originalVal !== null) {
                localStorage.setItem(key, originalVal);
              }
            } catch (retryErr) {
              console.error(`Store.atomicSave CRITICAL: Hoàn tác thất bại cho khóa "${key}"`, retryErr);
              failedRollbackKeys.push(key);
              // Đánh dấu khóa này là corrupted → Store.get() sẽ KHÔNG đọc localStorage cho key này
              this._corruptedKeys.add(key);
              // Lưu giữ bản sao lưu trong RAM để giảm thiểu mất mát dữ liệu
              if (originalVal !== null) {
                try {
                  this._emergencyBackup[key] = JSON.parse(originalVal);
                } catch (_) {
                  this._emergencyBackup[key] = originalVal;
                }
              } else {
                // Khóa ban đầu chưa tồn tại → lưu sentinel để Store.get() biết trả defaultValue
                this._emergencyBackup[key] = this._SENTINEL_NULL;
              }
            }
          }
        }

        // BƯỚC 5: Đánh giá kết quả hoàn tác và trả về thông tin minh bạch
        if (failedRollbackKeys.length === 0) {
          const res = {
            success: false,
            rolledBack: true,
            error: 'Lỗi ghi bộ nhớ trình duyệt (' + (writeErr.message || 'Hết dung lượng hoặc bị chặn') + '). Toàn bộ dữ liệu đã được hoàn tác an toàn.',
            failedKeys: [],
          };
          this.lastAtomicResult = res;
          return res;
        } else {
          const res = {
            success: false,
            rolledBack: false,
            error: `Cảnh báo nghiêm trọng: Lỗi ghi bộ nhớ và không thể hoàn tác các khóa [${failedRollbackKeys.join(', ')}]. Dữ liệu có thể không đồng bộ!`,
            failedKeys: failedRollbackKeys,
          };
          this.lastAtomicResult = res;
          return res;
        }
      }
    },

    getTransactions() {
      return this.get(this.KEYS.TRANSACTIONS, []);
    },

    saveTransactions(data) {
      return this.set(this.KEYS.TRANSACTIONS, data);
    },

    getCategories() {
      return this.get(this.KEYS.CATEGORIES, []);
    },

    saveCategories(data) {
      return this.set(this.KEYS.CATEGORIES, data);
    },

    getMembers() {
      return this.get(this.KEYS.MEMBERS, []);
    },

    saveMembers(data) {
      return this.set(this.KEYS.MEMBERS, data);
    },

    getBudgets() {
      return this.get(this.KEYS.BUDGETS, []);
    },

    saveBudgets(data) {
      return this.set(this.KEYS.BUDGETS, data);
    },

    initDefaultData() {
      if (localStorage.getItem(this.KEYS.INITIALIZED)) {
        return;
      }

      // 1. Danh mục mặc định
      const categories = [
        // Thu nhập
        { id: 'cat-luong', name: 'Tiền lương', type: 'income', icon: 'fa-money-bill', color: '#10B981' },
        { id: 'cat-thuong', name: 'Tiền thưởng', type: 'income', icon: 'fa-gift', color: '#059669' },
        { id: 'cat-kinh-doanh', name: 'Kinh doanh', type: 'income', icon: 'fa-briefcase', color: '#047857' },
        { id: 'cat-dau-tu', name: 'Đầu tư & Cổ tức', type: 'income', icon: 'fa-chart-line', color: '#0D9488' },
        { id: 'cat-thu-nhap-khac', name: 'Thu nhập khác', type: 'income', icon: 'fa-coins', color: '#6B7280' },

        // Chi tiêu
        { id: 'cat-an-uong', name: 'Ăn uống & Đi chợ', type: 'expense', icon: 'fa-utensils', color: '#EF4444' },
        { id: 'cat-nha-o', name: 'Nhà ở & Tiền thuê', type: 'expense', icon: 'fa-house', color: '#8B5CF6' },
        { id: 'cat-hoa-don', name: 'Điện nước & Internet', type: 'expense', icon: 'fa-bolt', color: '#F97316' },
        { id: 'cat-di-chuyen', name: 'Xăng xe & Đi lại', type: 'expense', icon: 'fa-car', color: '#F59E0B' },
        { id: 'cat-mua-sam', name: 'Mua sắm gia đình', type: 'expense', icon: 'fa-shopping-bag', color: '#EC4899' },
        { id: 'cat-giao-duc', name: 'Học phí & Con cái', type: 'expense', icon: 'fa-graduation-cap', color: '#3B82F6' },
        { id: 'cat-y-te', name: 'Y tế & Sức khỏe', type: 'expense', icon: 'fa-heart-pulse', color: '#E11D48' },
        { id: 'cat-giai-tri', name: 'Giải trí & Du lịch', type: 'expense', icon: 'fa-gamepad', color: '#6366F1' },
        { id: 'cat-chi-khac', name: 'Chi tiêu khác', type: 'expense', icon: 'fa-tag', color: '#6B7280' },
      ];

      // 2. Thành viên gia đình mặc định
      const members = [
        { id: 'mem-bo', name: 'Bố (Minh)', role: 'Bố', color: '#4F46E5', createdAt: new Date().toISOString() },
        { id: 'mem-me', name: 'Mẹ (Lan)', role: 'Mẹ', color: '#EC4899', createdAt: new Date().toISOString() },
        { id: 'mem-con', name: 'Con (Nam)', role: 'Con', color: '#F59E0B', createdAt: new Date().toISOString() },
      ];

      // 3. Ngân sách mẫu cho tháng hiện tại
      const { month: curMonth, year: curYear } = Utils.getCurrentMonthYear();
      const budgets = [
        { id: Utils.generateId(), categoryId: 'cat-an-uong', amount: 8000000, month: curMonth, year: curYear },
        { id: Utils.generateId(), categoryId: 'cat-hoa-don', amount: 3000000, month: curMonth, year: curYear },
        { id: Utils.generateId(), categoryId: 'cat-di-chuyen', amount: 2000000, month: curMonth, year: curYear },
        { id: Utils.generateId(), categoryId: 'cat-mua-sam', amount: 4000000, month: curMonth, year: curYear },
        { id: Utils.generateId(), categoryId: 'cat-giao-duc', amount: 5000000, month: curMonth, year: curYear },
        { id: Utils.generateId(), categoryId: 'cat-y-te', amount: 1500000, month: curMonth, year: curYear },
      ];

      // 4. Tạo giao dịch mẫu phong phú cho 3 tháng gần nhất
      const transactions = [];

      const pad = (n) => String(n).padStart(2, '0');

      // Helper tạo ngày tháng
      const makeDate = (monthsAgo, day) => {
        const d = new Date(curYear, curMonth - 1 - monthsAgo, day);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      };

      // Giao dịch các tháng
      [0, 1, 2].forEach((monthsAgo) => {
        // Thu nhập hàng tháng
        transactions.push({
          id: Utils.generateId(),
          type: 'income',
          amount: 25000000,
          description: `Lương công ty tháng ${curMonth - monthsAgo}`,
          categoryId: 'cat-luong',
          memberId: 'mem-bo',
          date: makeDate(monthsAgo, 5),
          note: 'Chuyển khoản qua ngân hàng',
          createdAt: new Date().toISOString(),
        });

        transactions.push({
          id: Utils.generateId(),
          type: 'income',
          amount: 18000000,
          description: `Lương tháng ${curMonth - monthsAgo}`,
          categoryId: 'cat-luong',
          memberId: 'mem-me',
          date: makeDate(monthsAgo, 5),
          note: 'Chuyển khoản công ty',
          createdAt: new Date().toISOString(),
        });

        if (monthsAgo === 0) {
          transactions.push({
            id: Utils.generateId(),
            type: 'income',
            amount: 5000000,
            description: 'Thưởng dự án hoàn thành tốt',
            categoryId: 'cat-thuong',
            memberId: 'mem-bo',
            date: makeDate(monthsAgo, 15),
            note: 'Thưởng quý',
            createdAt: new Date().toISOString(),
          });
        }

        // Chi tiêu hàng tháng
        transactions.push({
          id: Utils.generateId(),
          type: 'expense',
          amount: 2500000,
          description: 'Hóa đơn tiền điện & nước',
          categoryId: 'cat-hoa-don',
          memberId: 'mem-me',
          date: makeDate(monthsAgo, 8),
          note: 'Thanh toán qua app ngân hàng',
          createdAt: new Date().toISOString(),
        });

        transactions.push({
          id: Utils.generateId(),
          type: 'expense',
          amount: 350000,
          description: 'Cước Internet cáp quang',
          categoryId: 'cat-hoa-don',
          memberId: 'mem-bo',
          date: makeDate(monthsAgo, 10),
          note: 'Gói 6 tháng',
          createdAt: new Date().toISOString(),
        });

        transactions.push({
          id: Utils.generateId(),
          type: 'expense',
          amount: 3200000,
          description: 'Đi chợ & siêu thị tuần 1',
          categoryId: 'cat-an-uong',
          memberId: 'mem-me',
          date: makeDate(monthsAgo, 6),
          note: 'Thực phẩm cả tuần',
          createdAt: new Date().toISOString(),
        });

        transactions.push({
          id: Utils.generateId(),
          type: 'expense',
          amount: 2800000,
          description: 'Đi siêu thị & ăn uống gia đình',
          categoryId: 'cat-an-uong',
          memberId: 'mem-bo',
          date: makeDate(monthsAgo, 14),
          note: 'Ăn tối cuối tuần',
          createdAt: new Date().toISOString(),
        });

        transactions.push({
          id: Utils.generateId(),
          type: 'expense',
          amount: 800000,
          description: 'Đổ xăng ô tô & xe máy',
          categoryId: 'cat-di-chuyen',
          memberId: 'mem-bo',
          date: makeDate(monthsAgo, 9),
          note: 'Xăng xe đi làm',
          createdAt: new Date().toISOString(),
        });

        transactions.push({
          id: Utils.generateId(),
          type: 'expense',
          amount: 1500000,
          description: 'Mua sắm đồ gia dụng & quần áo',
          categoryId: 'cat-mua-sam',
          memberId: 'mem-me',
          date: makeDate(monthsAgo, 18),
          note: 'Khuyến mãi Shopee',
          createdAt: new Date().toISOString(),
        });

        transactions.push({
          id: Utils.generateId(),
          type: 'expense',
          amount: 4500000,
          description: 'Tiền học thêm & học phí con',
          categoryId: 'cat-giao-duc',
          memberId: 'mem-me',
          date: makeDate(monthsAgo, 12),
          note: 'Học kỳ mới',
          createdAt: new Date().toISOString(),
        });

        transactions.push({
          id: Utils.generateId(),
          type: 'expense',
          amount: 650000,
          description: 'Mua thuốc & vitamin gia đình',
          categoryId: 'cat-y-te',
          memberId: 'mem-bo',
          date: makeDate(monthsAgo, 20),
          note: 'Hiệu thuốc Long Châu',
          createdAt: new Date().toISOString(),
        });
      });

      // Lưu toàn bộ 4 nhóm dữ liệu mặc định một cách nguyên tử
      // Chỉ đánh dấu đã khởi tạo (finance_initialized_v2) khi cả 4 nhóm đều được ghi thành công 100%
      const initResult = this.atomicSave({
        [this.KEYS.CATEGORIES]: categories,
        [this.KEYS.MEMBERS]: members,
        [this.KEYS.BUDGETS]: budgets,
        [this.KEYS.TRANSACTIONS]: transactions,
        [this.KEYS.INITIALIZED]: true,
      });

      if (!initResult.success) {
        if (initResult.rolledBack) {
          console.error('Khởi tạo dữ liệu mẫu thất bại do lỗi bộ nhớ LocalStorage. Đã hoàn tác an toàn về trạng thái ban đầu.');
        } else {
          console.error('CẢNH BÁO NGHÊM TRỌNG: Khởi tạo dữ liệu mẫu thất bại và không thể hoàn tác hoàn toàn:', initResult.error);
        }
      }
    },
  };

  // =========================================================================
  // 3. QUẢN LÝ BIỂU ĐỒ (CHART MANAGER)
  // =========================================================================
  const Charts = {
    instances: {},

    create(canvasId, config) {
      if (this.instances[canvasId]) {
        try {
          this.instances[canvasId].destroy();
        } catch (e) {
          console.warn('Destroy chart error', e);
        }
        delete this.instances[canvasId];
      }

      const canvas = document.getElementById(canvasId);
      if (!canvas) return null;

      const ctx = canvas.getContext('2d');
      const chart = new Chart(ctx, config);
      this.instances[canvasId] = chart;
      return chart;
    },
  };

  // =========================================================================
  // 4. ĐIỀU HƯỚNG TRANG (NAVIGATION)
  // =========================================================================
  const Navigation = {
    currentPage: 'page-dashboard',

    init() {
      // Bắt sự kiện click vào các link sidebar
      document.querySelectorAll('.nav-link').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const pageId = link.getAttribute('data-page') || link.getAttribute('href')?.replace('#', '');
          if (pageId) this.goTo(pageId);
        });
      });

      // Mobile menu hamburger toggle
      const menuToggle = document.getElementById('menuToggle');
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');

      if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
          sidebar.classList.toggle('active');
          if (overlay) overlay.classList.toggle('active');
        });
      }

      if (overlay) {
        overlay.addEventListener('click', () => {
          if (sidebar) sidebar.classList.remove('active');
          overlay.classList.remove('active');
        });
      }

      // Cập nhật ngày tháng trên header
      const dateEl = document.getElementById('currentDate');
      if (dateEl) {
        const today = new Date();
        const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        const dayName = days[today.getDay()];
        dateEl.textContent = `${dayName}, ${Utils.formatDate(Utils.getCurrentDate())}`;
      }
    },

    goTo(pageId) {
      this.currentPage = pageId;

      // Cập nhật nav link active
      document.querySelectorAll('.nav-link').forEach((link) => {
        const target = link.getAttribute('data-page') || link.getAttribute('href')?.replace('#', '');
        if (target === pageId) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });

      // Hiển thị page tương ứng
      document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
      const activePage = document.getElementById(pageId);
      if (activePage) activePage.classList.add('active');

      // Cập nhật tiêu đề trang trên Header
      const titleMap = {
        'page-dashboard': 'Tổng quan',
        'page-income': 'Thu nhập',
        'page-expense': 'Chi tiêu',
        'page-reports': 'Báo cáo tài chính',
        'page-categories': 'Danh mục thu chi',
        'page-members': 'Thành viên gia đình',
        'page-budget': 'Ngân sách chi tiêu',
      };
      const pageTitle = document.getElementById('pageTitle');
      if (pageTitle) pageTitle.textContent = titleMap[pageId] || 'Tài chính gia đình';

      // Đóng sidebar trên mobile
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (sidebar) sidebar.classList.remove('active');
      if (overlay) overlay.classList.remove('active');

      // Render nội dung của page
      App.renderPage(pageId);
    },
  };

  // =========================================================================
  // 5. QUẢN LÝ CÁC MODAL (MODAL MANAGER)
  // =========================================================================
  const Modal = {
    _deleteTarget: null,
    _lastFocusedElement: null,
    _activeModal: null,

    /**
     * Mở hộp thoại modal, khóa tương tác phần nền và chuyển focus vào phần tử đầu tiên
     * @param {string} modalId - ID của modal-overlay cần mở
     * @param {HTMLElement|null} triggerElement - Phần tử đã kích hoạt mở modal (để trả focus)
     */
    open(modalId, triggerElement = null) {
      const modal = document.getElementById(modalId);
      if (!modal) return;

      // 1. Lưu lại phần tử đang được focus trước khi mở modal
      this._lastFocusedElement = triggerElement || (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);

      // 2. Kích hoạt hiển thị modal
      modal.classList.add('active');
      modal.classList.add('show');
      this._activeModal = modal;
      document.body.style.overflow = 'hidden';

      // 3. Cô lập hoàn toàn phần nền (Inert background & aria-hidden)
      this._setBackgroundInert(true);

      // 4. Chuyển focus vào hộp thoại
      setTimeout(() => {
        this._focusInitialElement(modal);
      }, 50);
    },

    /**
     * Đóng hộp thoại modal, mở khóa tương tác phần nền và trả focus về phần tử kích hoạt
     * @param {HTMLElement|string} modalOrId - Modal element hoặc ID cần đóng
     */
    close(modalOrId) {
      const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
      if (!modal) return;

      modal.classList.remove('active');
      modal.classList.remove('show');
      document.body.style.overflow = '';

      // 1. Khôi phục tương tác cho phần nền
      this._setBackgroundInert(false);

      // 2. Trả focus về phần tử đã mở hộp thoại
      const elementToRestore = this._lastFocusedElement;
      this._activeModal = null;
      this._lastFocusedElement = null;

      if (elementToRestore && typeof elementToRestore.focus === 'function') {
        setTimeout(() => {
          try {
            elementToRestore.focus();
          } catch (err) {
            console.warn('Could not restore focus', err);
          }
        }, 50);
      }
    },

    /**
     * Khởi tạo bộ lắng nghe sự kiện đóng modal, phím Escape và Focus Trap
     */
    initClose() {
      // 1. Đóng modal bằng nút đóng (X) hoặc nút Hủy
      document.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const modal = btn.closest('.modal-overlay') || btn.closest('.modal');
          if (modal) this.close(modal);
        });
      });

      // 2. Click vào vùng mờ overlay ngoài hộp thoại thì đóng
      document.querySelectorAll('.modal-overlay').forEach((overlay) => {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            this.close(overlay);
          }
        });
      });

      // 3. Xử lý phím Escape và Quản lý vòng lặp Tab (Focus Trap)
      document.addEventListener('keydown', (e) => {
        if (!this._activeModal) return;

        // A. Phím Escape: Đóng modal đang mở
        if (e.key === 'Escape' || e.key === 'Esc') {
          e.preventDefault();
          this.close(this._activeModal);
          return;
        }

        // B. Phím Tab: Quản lý vòng lặp focus trong hộp thoại
        if (e.key === 'Tab') {
          const focusables = this._getFocusableElements(this._activeModal);
          if (focusables.length === 0) {
            e.preventDefault();
            return;
          }

          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey) {
            // Shift + Tab: nếu đang ở phần tử đầu tiên -> vòng về phần tử cuối
            if (document.activeElement === first || !this._activeModal.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            // Tab thông thường: nếu đang ở phần tử cuối cùng -> vòng về phần tử đầu tiên
            if (document.activeElement === last || !this._activeModal.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      });
    },

    /**
     * Khóa/mở khóa tương tác phần nền khi modal hiển thị (Inert & aria-hidden)
     */
    _setBackgroundInert(isInert) {
      const targets = [
        document.getElementById('sidebar'),
        document.getElementById('mainContent'),
        document.querySelector('.skip-to-content')
      ];

      targets.forEach((el) => {
        if (!el) return;
        if (isInert) {
          el.setAttribute('inert', '');
          el.setAttribute('aria-hidden', 'true');
        } else {
          el.removeAttribute('inert');
          el.removeAttribute('aria-hidden');
        }
      });
    },

    /**
     * Thu thập tất cả các phần tử có thể nhận focus và đang hiển thị bên trong modal
     */
    _getFocusableElements(modal) {
      if (!modal) return [];
      const selector = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const all = Array.from(modal.querySelectorAll(selector));
      return all.filter((el) => {
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
      });
    },

    /**
     * Chọn phần tử khởi tạo focus phù hợp khi mở modal
     */
    _focusInitialElement(modal) {
      if (!modal) return;

      // Nếu là modal xác nhận xóa
      if (modal.id === 'deleteModal') {
        const transferSelect = document.getElementById('deleteTransferSelect');
        const transferBox = document.getElementById('deleteTransferBox');
        if (transferBox && transferBox.style.display !== 'none' && transferSelect && transferSelect.offsetParent !== null) {
          transferSelect.focus();
          return;
        }
        const cancelBtn = document.getElementById('btnCancelDelete') || modal.querySelector('[data-action="close-modal"]');
        if (cancelBtn) {
          cancelBtn.focus();
          return;
        }
      }

      // Nếu là modal giao dịch, ưu tiên ô nhập số tiền
      if (modal.id === 'transactionModal') {
        const amountInput = document.getElementById('modalAmount');
        if (amountInput && amountInput.offsetParent !== null) {
          amountInput.focus();
          return;
        }
      }

      // Các modal form khác: tìm ô input/select/textarea hiển thị đầu tiên
      const focusables = this._getFocusableElements(modal);
      const firstInput = focusables.find((el) =>
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) &&
        el.type !== 'radio' && el.type !== 'submit' && el.type !== 'button'
      );

      if (firstInput) {
        firstInput.focus();
      } else if (focusables.length > 0) {
        focusables[0].focus();
      }
    },

    _syncRadioGroup(groupEl) {
      if (!groupEl) return;
      groupEl.querySelectorAll('.radio-label').forEach((lbl) => {
        const input = lbl.querySelector('input[type="radio"]');
        if (input && input.checked) {
          lbl.classList.add('active');
        } else {
          lbl.classList.remove('active');
        }
      });
    },

    // ----- TRANSACTION MODAL (THÊM / SỬA GIAO DỊCH) -----
    openTransactionModal(type = 'income', transaction = null) {
      const modal = document.getElementById('transactionModal');
      if (!modal) return;

      const form = document.getElementById('transactionForm');
      if (form) form.reset();

      const titleEl = document.getElementById('transactionModalTitle');
      const idInput = document.getElementById('transactionId');
      const radioGroup = document.getElementById('txnRadioGroup') || modal.querySelector('.radio-group');
      const typeRadios = modal.querySelectorAll('input[name="transactionType"]');
      const amountInput = document.getElementById('modalAmount');
      const descInput = document.getElementById('modalDescription');
      const catSelect = document.getElementById('modalCategory');
      const memSelect = document.getElementById('modalMember');
      const dateInput = document.getElementById('modalDate');
      const noteInput = document.getElementById('modalNote');

      // Chọn loại radio ban đầu
      typeRadios.forEach((r) => {
        r.checked = r.value === type;
      });
      this._syncRadioGroup(radioGroup);

      // Đổ danh mục và thành viên vào dropdown
      this._populateCategorySelect(catSelect, type);
      this._populateMemberSelect(memSelect);

      // Khi người dùng chuyển đổi radio Thu/Chi -> cập nhật danh mục & tiêu đề
      typeRadios.forEach((r) => {
        r.onchange = () => {
          const currentType = r.value;
          this._syncRadioGroup(radioGroup);
          this._populateCategorySelect(catSelect, currentType);
          if (!transaction && titleEl) {
            titleEl.textContent = currentType === 'income' ? 'Thêm khoản thu nhập' : 'Thêm khoản chi tiêu';
          }
        };
      });

      // Hỗ trợ click trực tiếp trên label để chuyển đổi tức thì
      if (radioGroup) {
        radioGroup.querySelectorAll('.radio-label').forEach((lbl) => {
          lbl.onclick = (e) => {
            const radio = lbl.querySelector('input[type="radio"]');
            if (radio && !radio.checked) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
          };
        });
      }

      if (transaction) {
        // Chế độ Sửa
        if (titleEl) titleEl.textContent = transaction.type === 'income' ? 'Sửa khoản thu nhập' : 'Sửa khoản chi tiêu';
        if (idInput) idInput.value = transaction.id;
        if (amountInput) amountInput.value = Utils.formatNumberInput(transaction.amount);
        if (descInput) descInput.value = transaction.description;
        if (dateInput) dateInput.value = transaction.date;
        if (noteInput) noteInput.value = transaction.note || '';
        if (catSelect) catSelect.value = transaction.categoryId;
        if (memSelect) memSelect.value = transaction.memberId;
      } else {
        // Chế độ Thêm mới
        if (titleEl) titleEl.textContent = type === 'income' ? 'Thêm khoản thu nhập' : 'Thêm khoản chi tiêu';
        if (idInput) idInput.value = '';
        if (amountInput) amountInput.value = '';
        if (descInput) descInput.value = '';
        if (noteInput) noteInput.value = '';
        if (dateInput) dateInput.value = Utils.getCurrentDate();
      }

      this.open('transactionModal');
    },

    _populateCategorySelect(select, type) {
      if (!select) return;
      const categories = Store.getCategories().filter((c) => c.type === type);
      select.innerHTML = '<option value="">-- Chọn danh mục --</option>';
      categories.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        select.appendChild(opt);
      });
    },

    _populateMemberSelect(select) {
      if (!select) return;
      const members = Store.getMembers();
      select.innerHTML = '<option value="">-- Chọn thành viên --</option>';
      members.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} (${m.role})`;
        select.appendChild(opt);
      });
    },

    handleTransactionSubmit() {
      const typeRadio = document.querySelector('input[name="transactionType"]:checked');
      const amountInput = document.getElementById('modalAmount');
      const descInput = document.getElementById('modalDescription');
      const catSelect = document.getElementById('modalCategory');
      const memSelect = document.getElementById('modalMember');
      const dateInput = document.getElementById('modalDate');
      const noteInput = document.getElementById('modalNote');
      const idInput = document.getElementById('transactionId');

      const type = typeRadio ? typeRadio.value : 'expense';
      const rawAmount = amountInput ? amountInput.value : '';
      const validation = Utils.validateAmount(rawAmount);

      // 1. Kiểm tra tính hợp lệ và cấu trúc số tiền
      if (!validation.valid) {
        Utils.showToast(validation.error, 'warning');
        if (amountInput) {
          amountInput.focus();
          amountInput.classList.add('is-invalid');
        }
        return;
      }

      const amount = validation.amount;
      // 2. Kiểm tra tính hữu hạn và giới hạn giá trị hợp lệ
      if (!Number.isFinite(amount) || amount < Utils.MIN_AMOUNT || amount > Utils.MAX_AMOUNT) {
        Utils.showToast(`Số tiền không hợp lệ (từ ${Utils.formatCurrency(Utils.MIN_AMOUNT)} đến ${Utils.formatCurrency(Utils.MAX_AMOUNT)})`, 'warning');
        if (amountInput) {
          amountInput.focus();
          amountInput.classList.add('is-invalid');
        }
        return;
      }
      if (amountInput) amountInput.classList.remove('is-invalid');

      const description = descInput ? descInput.value.trim() : '';
      const categoryId = catSelect ? catSelect.value : '';
      const memberId = memSelect ? memSelect.value : '';
      const date = dateInput ? dateInput.value : '';
      const note = noteInput ? noteInput.value.trim() : '';
      const editId = idInput ? idInput.value : '';

      // Validate các trường thông tin khác
      if (!description) {
        Utils.showToast('Vui lòng nhập mô tả giao dịch', 'warning');
        return;
      }
      if (!categoryId) {
        Utils.showToast('Vui lòng chọn danh mục', 'warning');
        return;
      }
      if (!memberId) {
        Utils.showToast('Vui lòng chọn thành viên', 'warning');
        return;
      }
      if (!date) {
        Utils.showToast('Vui lòng chọn ngày giao dịch', 'warning');
        return;
      }

      const transactions = Store.getTransactions();

      if (editId) {
        const idx = transactions.findIndex((t) => t.id === editId);
        if (idx !== -1) {
          transactions[idx] = {
            ...transactions[idx],
            type,
            amount,
            description,
            categoryId,
            memberId,
            date,
            note,
          };
        }
      } else {
        transactions.push({
          id: Utils.generateId(),
          type,
          amount,
          description,
          categoryId,
          memberId,
          date,
          note,
          createdAt: new Date().toISOString(),
        });
      }

      const saveSuccess = Store.saveTransactions(transactions);
      if (saveSuccess) {
        Utils.showToast(editId ? 'Đã cập nhật giao dịch thành công!' : (type === 'income' ? 'Đã thêm khoản thu nhập!' : 'Đã thêm khoản chi tiêu!'), 'success');
        this.close('transactionModal');
        App.renderPage(Navigation.currentPage);
      } else {
        Utils.showToast('Lưu giao dịch thất bại do lỗi bộ nhớ (localStorage đầy hoặc bị chặn). Dữ liệu trong biểu mẫu đã được giữ lại. Cách xử lý: Kiểm tra bộ nhớ trình duyệt, xuất bớt dữ liệu ra Excel để giải phóng dung lượng rồi thử lại.', 'error');
      }
    },

    // ----- CATEGORY MODAL (DANH MỤC) -----
    openCategoryModal(type = 'expense', category = null) {
      const modal = document.getElementById('categoryModal');
      if (!modal) return;

      const form = document.getElementById('categoryForm');
      if (form) form.reset();

      const titleEl = document.getElementById('categoryModalTitle');
      const idInput = document.getElementById('categoryId');
      const nameInput = document.getElementById('categoryName');
      const typeRadios = modal.querySelectorAll('input[name="categoryType"]');
      const colorInput = document.getElementById('categoryColor');
      const iconInput = document.getElementById('categoryIcon');

      // Reset icon selection
      modal.querySelectorAll('.icon-option').forEach((btn) => btn.classList.remove('selected'));

      const catRadioGroup = document.getElementById('catRadioGroup') || modal.querySelector('.radio-group');

      if (category) {
        if (titleEl) titleEl.textContent = 'Sửa danh mục';
        if (idInput) idInput.value = category.id;
        if (nameInput) nameInput.value = category.name;
        if (colorInput) colorInput.value = category.color || '#4f46e5';
        if (iconInput) iconInput.value = category.icon || 'fa-tag';

        typeRadios.forEach((r) => (r.checked = r.value === category.type));

        const activeIconBtn = modal.querySelector(`.icon-option[data-icon="${category.icon}"]`);
        if (activeIconBtn) activeIconBtn.classList.add('selected');
      } else {
        if (titleEl) titleEl.textContent = type === 'income' ? 'Thêm danh mục thu nhập' : 'Thêm danh mục chi tiêu';
        if (idInput) idInput.value = '';
        if (colorInput) colorInput.value = type === 'income' ? '#10B981' : '#EF4444';
        if (iconInput) iconInput.value = 'fa-tag';

        typeRadios.forEach((r) => (r.checked = r.value === type));

        const defaultIconBtn = modal.querySelector('.icon-option[data-icon="fa-tag"]');
        if (defaultIconBtn) defaultIconBtn.classList.add('selected');
      }

      this._syncRadioGroup(catRadioGroup);

      typeRadios.forEach((r) => {
        r.onchange = () => {
          this._syncRadioGroup(catRadioGroup);
          if (!category) {
            const isInc = r.value === 'income';
            if (titleEl) titleEl.textContent = isInc ? 'Thêm danh mục thu nhập' : 'Thêm danh mục chi tiêu';
            if (colorInput) colorInput.value = isInc ? '#10B981' : '#EF4444';
          }
        };
      });

      if (catRadioGroup) {
        catRadioGroup.querySelectorAll('.radio-label').forEach((lbl) => {
          lbl.onclick = () => {
            const radio = lbl.querySelector('input[type="radio"]');
            if (radio && !radio.checked) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
          };
        });
      }

      this.open('categoryModal');
    },

    handleCategorySubmit() {
      const nameInput = document.getElementById('categoryName');
      const typeRadio = document.querySelector('input[name="categoryType"]:checked');
      const colorInput = document.getElementById('categoryColor');
      const iconInput = document.getElementById('categoryIcon');
      const idInput = document.getElementById('categoryId');

      const name = nameInput ? nameInput.value.trim() : '';
      const type = typeRadio ? typeRadio.value : 'expense';
      const color = colorInput ? colorInput.value : '#4F46E5';
      const icon = iconInput ? iconInput.value : 'fa-tag';
      const editId = idInput ? idInput.value : '';

      if (!name) {
        Utils.showToast('Vui lòng nhập tên danh mục', 'warning');
        return;
      }

      const categories = Store.getCategories();

      if (editId) {
        const idx = categories.findIndex((c) => c.id === editId);
        if (idx !== -1) {
          categories[idx] = { ...categories[idx], name, type, color, icon };
        }
      } else {
        categories.push({
          id: Utils.generateId(),
          name,
          type,
          color,
          icon,
        });
      }

      const saveSuccess = Store.saveCategories(categories);
      if (saveSuccess) {
        Utils.showToast(editId ? 'Đã cập nhật danh mục!' : 'Đã thêm danh mục mới!', 'success');
        this.close('categoryModal');
        App.renderPage(Navigation.currentPage);
      } else {
        Utils.showToast('Lưu danh mục thất bại do lỗi bộ nhớ (localStorage đầy hoặc bị chặn). Dữ liệu trong biểu mẫu đã được giữ lại. Cách xử lý: Kiểm tra bộ nhớ trình duyệt hoặc thử lại.', 'error');
      }
    },

    // ----- MEMBER MODAL (THÀNH VIÊN) -----
    openMemberModal(member = null) {
      const modal = document.getElementById('memberModal');
      if (!modal) return;

      const form = document.getElementById('memberForm');
      if (form) form.reset();

      const titleEl = document.getElementById('memberModalTitle');
      const idInput = document.getElementById('memberId');
      const nameInput = document.getElementById('memberName');
      const roleSelect = document.getElementById('memberRole');
      const colorInput = document.getElementById('memberColor');

      if (member) {
        if (titleEl) titleEl.textContent = 'Sửa thông tin thành viên';
        if (idInput) idInput.value = member.id;
        if (nameInput) nameInput.value = member.name;
        if (roleSelect) roleSelect.value = member.role;
        if (colorInput) colorInput.value = member.color;
      } else {
        if (titleEl) titleEl.textContent = 'Thêm thành viên mới';
        if (idInput) idInput.value = '';
        if (colorInput) colorInput.value = '#4F46E5';
      }

      this.open('memberModal');
    },

    handleMemberSubmit() {
      const idInput = document.getElementById('memberId');
      const nameInput = document.getElementById('memberName');
      const roleSelect = document.getElementById('memberRole');
      const colorInput = document.getElementById('memberColor');

      const name = nameInput ? nameInput.value.trim() : '';
      const role = roleSelect ? roleSelect.value : 'Khác';
      const color = colorInput ? colorInput.value : '#4F46E5';
      const editId = idInput ? idInput.value : '';

      if (!name) {
        Utils.showToast('Vui lòng nhập tên thành viên', 'warning');
        return;
      }
      if (!role) {
        Utils.showToast('Vui lòng chọn vai trò', 'warning');
        return;
      }

      const members = Store.getMembers();

      if (editId) {
        const idx = members.findIndex((m) => m.id === editId);
        if (idx !== -1) {
          members[idx] = { ...members[idx], name, role, color };
        }
      } else {
        members.push({
          id: Utils.generateId(),
          name,
          role,
          color,
          createdAt: new Date().toISOString(),
        });
      }

      const saveSuccess = Store.saveMembers(members);
      if (saveSuccess) {
        Utils.showToast(editId ? 'Đã cập nhật thông tin thành viên!' : 'Đã thêm thành viên gia đình!', 'success');
        this.close('memberModal');
        App.renderPage(Navigation.currentPage);
      } else {
        Utils.showToast('Lưu thành viên thất bại do lỗi bộ nhớ (localStorage đầy hoặc bị chặn). Dữ liệu trong biểu mẫu đã được giữ lại. Cách xử lý: Kiểm tra bộ nhớ trình duyệt hoặc thử lại.', 'error');
      }
    },

    // ----- BUDGET MODAL (NGÂN SÁCH) -----
    openBudgetModal(budget = null) {
      const modal = document.getElementById('budgetModal');
      if (!modal) return;

      const form = document.getElementById('budgetForm');
      if (form) form.reset();

      const titleEl = document.getElementById('budgetModalTitle');
      const idInput = document.getElementById('budgetId');
      const catSelect = document.getElementById('budgetCategorySelect');
      const amountInput = document.getElementById('budgetAmount');
      const monthSelect = document.getElementById('budgetModalMonth');
      const yearSelect = document.getElementById('budgetModalYear');

      // Đổ các danh mục chi tiêu vào select
      if (catSelect) {
        const expenseCats = Store.getCategories().filter((c) => c.type === 'expense');
        catSelect.innerHTML = '<option value="">-- Chọn danh mục chi tiêu --</option>';
        expenseCats.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.name;
          catSelect.appendChild(opt);
        });
      }

      const { month: curMonth, year: curYear } = Utils.getCurrentMonthYear();

      if (budget) {
        if (titleEl) titleEl.textContent = 'Sửa ngân sách';
        if (idInput) idInput.value = budget.id;
        if (catSelect) catSelect.value = budget.categoryId;
        if (amountInput) amountInput.value = Utils.formatNumberInput(budget.amount);
        if (monthSelect) monthSelect.value = budget.month;
        if (yearSelect) yearSelect.value = budget.year;
      } else {
        if (titleEl) titleEl.textContent = 'Thêm ngân sách chi tiêu';
        if (idInput) idInput.value = '';
        if (amountInput) amountInput.value = '';
        if (monthSelect) monthSelect.value = curMonth;
        if (yearSelect) yearSelect.value = curYear;
      }

      this.open('budgetModal');
    },

    handleBudgetSubmit() {
      const idInput = document.getElementById('budgetId');
      const catSelect = document.getElementById('budgetCategorySelect');
      const amountInput = document.getElementById('budgetAmount');
      const monthSelect = document.getElementById('budgetModalMonth');
      const yearSelect = document.getElementById('budgetModalYear');

      const categoryId = catSelect ? catSelect.value : '';
      const rawAmount = amountInput ? amountInput.value : '';
      const month = parseInt(monthSelect ? monthSelect.value : 1, 10);
      const year = parseInt(yearSelect ? yearSelect.value : new Date().getFullYear(), 10);
      const editId = idInput ? idInput.value : '';

      if (!categoryId) {
        Utils.showToast('Vui lòng chọn danh mục chi tiêu', 'warning');
        if (catSelect) catSelect.focus();
        return;
      }

      // 1. Kiểm tra tính hợp lệ và cấu trúc số tiền ngân sách
      const validation = Utils.validateAmount(rawAmount);
      if (!validation.valid) {
        Utils.showToast(validation.error, 'warning');
        if (amountInput) {
          amountInput.focus();
          amountInput.classList.add('is-invalid');
        }
        return;
      }

      const amount = validation.amount;
      // 2. Kiểm tra tính hữu hạn và giới hạn giá trị hợp lệ
      if (!Number.isFinite(amount) || amount < Utils.MIN_AMOUNT || amount > Utils.MAX_AMOUNT) {
        Utils.showToast(`Số tiền ngân sách không hợp lệ (từ ${Utils.formatCurrency(Utils.MIN_AMOUNT)} đến ${Utils.formatCurrency(Utils.MAX_AMOUNT)})`, 'warning');
        if (amountInput) {
          amountInput.focus();
          amountInput.classList.add('is-invalid');
        }
        return;
      }
      if (amountInput) amountInput.classList.remove('is-invalid');

      const budgets = Store.getBudgets();

      if (editId) {
        const idx = budgets.findIndex((b) => b.id === editId);
        if (idx !== -1) {
          budgets[idx] = { ...budgets[idx], categoryId, amount, month, year };
        }
      } else {
        // Kiểm tra xem danh mục trong tháng này đã có ngân sách chưa
        const exists = budgets.some((b) => b.categoryId === categoryId && b.month === month && b.year === year);
        if (exists) {
          Utils.showToast('Ngân sách cho danh mục này trong tháng đã tồn tại!', 'warning');
          return;
        }

        budgets.push({
          id: Utils.generateId(),
          categoryId,
          amount,
          month,
          year,
        });
      }

      const saveSuccess = Store.saveBudgets(budgets);
      if (saveSuccess) {
        Utils.showToast(editId ? 'Đã cập nhật ngân sách!' : 'Đã lập ngân sách thành công!', 'success');
        this.close('budgetModal');
        App.renderPage(Navigation.currentPage);
      } else {
        Utils.showToast('Lưu ngân sách thất bại do lỗi bộ nhớ (localStorage đầy hoặc bị chặn). Dữ liệu trong biểu mẫu đã được giữ lại. Cách xử lý: Kiểm tra bộ nhớ trình duyệt hoặc thử lại.', 'error');
      }
    },

    // ----- DELETE CONFIRM MODAL (XÁC NHẬN XÓA & QUẢN LÝ QUAN HỆ DỮ LIỆU) -----
    openDeleteModal(type, id) {
      this._deleteTarget = { type, id };
      const idInput = document.getElementById('deleteItemId');
      const typeInput = document.getElementById('deleteItemType');
      if (idInput) idInput.value = id;
      if (typeInput) typeInput.value = type;

      const deleteSimpleConfirm = document.getElementById('deleteSimpleConfirm');
      const deleteDependencySection = document.getElementById('deleteDependencySection');
      const deleteDependencyTitle = document.getElementById('deleteDependencyTitle');
      const deleteDependencyDesc = document.getElementById('deleteDependencyDesc');
      const deleteTransferBox = document.getElementById('deleteTransferBox');
      const deleteTransferLabel = document.getElementById('deleteTransferLabel');
      const deleteTransferHint = document.getElementById('deleteTransferHint');
      const deleteTransferSelect = document.getElementById('deleteTransferSelect');
      const btnConfirmDelete = document.getElementById('btnConfirmDelete');
      const btnTransferAndDelete = document.getElementById('btnTransferAndDelete');
      const deleteModalTitle = document.getElementById('deleteModalTitle');
      const deleteModalMsg = document.getElementById('deleteModalMsg');
      const deleteModalSubMsg = document.getElementById('deleteModalSubMsg');

      // Mặc định hiển thị hộp xác nhận đơn giản, ẩn phần ràng buộc
      if (deleteSimpleConfirm) deleteSimpleConfirm.style.display = 'flex';
      if (deleteDependencySection) deleteDependencySection.style.display = 'none';
      if (btnConfirmDelete) btnConfirmDelete.style.display = 'inline-flex';
      if (btnTransferAndDelete) btnTransferAndDelete.style.display = 'none';

      if (type === 'transaction') {
        const txn = Store.getTransactions().find((t) => t.id === id);
        if (deleteModalTitle) deleteModalTitle.textContent = 'Xác nhận xóa giao dịch';
        if (deleteModalMsg) deleteModalMsg.textContent = txn ? `Bạn có chắc muốn xóa giao dịch "${txn.description}" (${Utils.formatCurrency(txn.amount)})?` : 'Bạn có chắc chắn muốn xóa giao dịch này?';
        if (deleteModalSubMsg) deleteModalSubMsg.textContent = 'Khoản tiền này sẽ được hoàn tác khỏi số dư và báo cáo tài chính.';
        if (btnConfirmDelete) btnConfirmDelete.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa giao dịch';
      } else if (type === 'budget') {
        const budget = Store.getBudgets().find((b) => b.id === id);
        const cat = Store.getCategories().find((c) => c.id === (budget ? budget.categoryId : ''));
        if (deleteModalTitle) deleteModalTitle.textContent = 'Xác nhận xóa ngân sách';
        if (deleteModalMsg) deleteModalMsg.textContent = `Bạn có chắc muốn xóa hạn mức ngân sách của danh mục "${cat ? cat.name : 'Khác'}" (kỳ ${budget ? budget.month + '/' + budget.year : ''})?`;
        if (deleteModalSubMsg) deleteModalSubMsg.textContent = 'Hạn mức sẽ bị gỡ bỏ, nhưng mọi giao dịch chi tiêu thực tế vẫn được bảo toàn nguyên vẹn.';
        if (btnConfirmDelete) btnConfirmDelete.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa ngân sách';
      } else if (type === 'category') {
        const cat = Store.getCategories().find((c) => c.id === id);
        if (!cat) return;

        const refTxns = Store.getTransactions().filter((t) => t.categoryId === id);
        const refBudgets = Store.getBudgets().filter((b) => b.categoryId === id);
        const hasDependencies = refTxns.length > 0 || refBudgets.length > 0;

        if (!hasDependencies) {
          // Không có dữ liệu liên quan -> Cho phép xóa trực tiếp
          if (deleteModalTitle) deleteModalTitle.textContent = 'Xác nhận xóa danh mục';
          if (deleteModalMsg) deleteModalMsg.textContent = `Bạn có chắc chắn muốn xóa danh mục "${cat.name}"?`;
          if (deleteModalSubMsg) deleteModalSubMsg.textContent = 'Danh mục này chưa có giao dịch hay ngân sách nào liên kết. Hành động không thể hoàn tác.';
          if (btnConfirmDelete) btnConfirmDelete.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa danh mục';
        } else {
          // CÓ DỮ LIỆU LIÊN QUAN -> CHẶN XÓA TRỰC TIẾP & YÊU CẦU CHUYỂN LIÊN KẾT
          if (deleteSimpleConfirm) deleteSimpleConfirm.style.display = 'none';
          if (deleteDependencySection) deleteDependencySection.style.display = 'block';
          if (btnConfirmDelete) btnConfirmDelete.style.display = 'none'; // Chặn xóa trực tiếp

          if (deleteModalTitle) deleteModalTitle.textContent = '⚠️ Chặn xóa danh mục đang có dữ liệu';
          if (deleteDependencyTitle) deleteDependencyTitle.textContent = `Danh mục "${cat.name}" đang có dữ liệu liên quan`;

          const totalAmt = refTxns.reduce((sum, t) => sum + t.amount, 0);
          if (deleteDependencyDesc) {
            deleteDependencyDesc.innerHTML = `
              <div>Danh mục này hiện đang được ràng buộc bởi:</div>
              <ul style="margin: 6px 0 0 18px; padding: 0;">
                ${refTxns.length > 0 ? `<li><strong>${refTxns.length} giao dịch</strong> tài chính (tổng tiền: <strong>${Utils.formatCurrency(totalAmt)}</strong>)</li>` : ''}
                ${refBudgets.length > 0 ? `<li><strong>${refBudgets.length} thiết lập ngân sách</strong> theo kỳ</li>` : ''}
              </ul>`;
          }

          const otherCats = Store.getCategories().filter((c) => c.type === cat.type && c.id !== id);
          if (otherCats.length > 0) {
            if (deleteTransferBox) deleteTransferBox.style.display = 'block';
            if (btnTransferAndDelete) btnTransferAndDelete.style.display = 'inline-flex';
            if (deleteTransferLabel) deleteTransferLabel.innerHTML = '<i class="fa-solid fa-arrow-right-arrow-left" style="color: #4F46E5;"></i> Chuyển toàn bộ dữ liệu sang danh mục:';
            if (deleteTransferHint) deleteTransferHint.textContent = `Chọn danh mục ${cat.type === 'income' ? 'thu nhập' : 'chi tiêu'} thay thế để tiếp nhận ${refTxns.length} giao dịch trước khi xóa:`;
            if (deleteTransferSelect) {
              deleteTransferSelect.innerHTML = '<option value="">-- Chọn danh mục thay thế --</option>' +
                otherCats.map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`).join('');
            }
          } else {
            if (deleteTransferBox) {
              deleteTransferBox.style.display = 'block';
              deleteTransferBox.innerHTML = `
                <div style="color:#B91C1C;font-size:0.85rem;padding:6px 0;">
                  <i class="fa-solid fa-circle-exclamation"></i> Đây là danh mục duy nhất của loại này. Vui lòng tạo thêm một danh mục khác trước khi thực hiện chuyển liên kết và xóa.
                </div>`;
            }
            if (btnTransferAndDelete) btnTransferAndDelete.style.display = 'none';
          }
        }
      } else if (type === 'member') {
        const mem = Store.getMembers().find((m) => m.id === id);
        if (!mem) return;

        const refTxns = Store.getTransactions().filter((t) => t.memberId === id);
        const hasDependencies = refTxns.length > 0;

        if (!hasDependencies) {
          // Không có dữ liệu liên quan -> Cho phép xóa trực tiếp
          if (deleteModalTitle) deleteModalTitle.textContent = 'Xác nhận xóa thành viên';
          if (deleteModalMsg) deleteModalMsg.textContent = `Bạn có chắc chắn muốn xóa thành viên "${mem.name}"?`;
          if (deleteModalSubMsg) deleteModalSubMsg.textContent = 'Thành viên này chưa có giao dịch nào liên kết. Hành động không thể hoàn tác.';
          if (btnConfirmDelete) btnConfirmDelete.innerHTML = '<i class="fa-solid fa-trash"></i> Xóa thành viên';
        } else {
          // CÓ GIAO DỊCH LIÊN QUAN -> CHẶN XÓA TRỰC TIẾP
          if (deleteSimpleConfirm) deleteSimpleConfirm.style.display = 'none';
          if (deleteDependencySection) deleteDependencySection.style.display = 'block';
          if (btnConfirmDelete) btnConfirmDelete.style.display = 'none'; // Chặn xóa trực tiếp

          if (deleteModalTitle) deleteModalTitle.textContent = '⚠️ Chặn xóa thành viên đang có giao dịch';
          if (deleteDependencyTitle) deleteDependencyTitle.textContent = `Thành viên "${mem.name}" đang đứng tên sổ sách`;

          const totalAmt = refTxns.reduce((sum, t) => sum + t.amount, 0);
          if (deleteDependencyDesc) {
            deleteDependencyDesc.innerHTML = `
              <div>Thành viên này hiện đang có:</div>
              <ul style="margin: 6px 0 0 18px; padding: 0;">
                <li><strong>${refTxns.length} giao dịch</strong> tài chính (tổng tiền: <strong>${Utils.formatCurrency(totalAmt)}</strong>)</li>
              </ul>`;
          }

          const otherMembers = Store.getMembers().filter((m) => m.id !== id);
          if (otherMembers.length > 0) {
            if (deleteTransferBox) deleteTransferBox.style.display = 'block';
            if (btnTransferAndDelete) btnTransferAndDelete.style.display = 'inline-flex';
            if (deleteTransferLabel) deleteTransferLabel.innerHTML = '<i class="fa-solid fa-user-pen" style="color: #4F46E5;"></i> Chuyển toàn bộ giao dịch sang thành viên:';
            if (deleteTransferHint) deleteTransferHint.textContent = `Chọn thành viên tiếp nhận ${refTxns.length} giao dịch của "${mem.name}" trước khi xóa:`;
            if (deleteTransferSelect) {
              deleteTransferSelect.innerHTML = '<option value="">-- Chọn thành viên tiếp nhận --</option>' +
                otherMembers.map((m) => `<option value="${m.id}">${Utils.escapeHtml(m.name)} (${m.role})</option>`).join('');
            }
          } else {
            if (deleteTransferBox) {
              deleteTransferBox.style.display = 'block';
              deleteTransferBox.innerHTML = `
                <div style="color:#B91C1C;font-size:0.85rem;padding:6px 0;">
                  <i class="fa-solid fa-circle-exclamation"></i> Đây là thành viên duy nhất trong gia đình. Cần có ít nhất một thành viên để ghi nhận thu chi.
                </div>`;
            }
            if (btnTransferAndDelete) btnTransferAndDelete.style.display = 'none';
          }
        }
      }

      this.open('deleteModal');
    },

    handleDeleteConfirm() {
      if (!this._deleteTarget) return;
      const { type, id } = this._deleteTarget;
      let saveSuccess = false;
      let successMsg = '';

      switch (type) {
        case 'transaction': {
          const list = Store.getTransactions().filter((t) => t.id !== id);
          saveSuccess = Store.saveTransactions(list);
          successMsg = 'Đã xóa giao dịch!';
          break;
        }
        case 'category': {
          // Kiểm tra an toàn chặn xóa lần 2 nếu có liên kết
          const refTxns = Store.getTransactions().filter((t) => t.categoryId === id);
          const refBudgets = Store.getBudgets().filter((b) => b.categoryId === id);
          if (refTxns.length > 0 || refBudgets.length > 0) {
            Utils.showToast('Không thể xóa trực tiếp vì danh mục có dữ liệu liên quan. Vui lòng chọn chuyển liên kết.', 'warning');
            return;
          }
          const list = Store.getCategories().filter((c) => c.id !== id);
          saveSuccess = Store.saveCategories(list);
          successMsg = 'Đã xóa danh mục!';
          break;
        }
        case 'member': {
          // Kiểm tra an toàn chặn xóa lần 2 nếu có liên kết
          const refTxns = Store.getTransactions().filter((t) => t.memberId === id);
          if (refTxns.length > 0) {
            Utils.showToast('Không thể xóa trực tiếp vì thành viên có giao dịch liên quan. Vui lòng chọn chuyển liên kết.', 'warning');
            return;
          }
          const list = Store.getMembers().filter((m) => m.id !== id);
          saveSuccess = Store.saveMembers(list);
          successMsg = 'Đã xóa thành viên!';
          break;
        }
        case 'budget': {
          const list = Store.getBudgets().filter((b) => b.id !== id);
          saveSuccess = Store.saveBudgets(list);
          successMsg = 'Đã xóa ngân sách!';
          break;
        }
      }

      if (saveSuccess) {
        Utils.showToast(successMsg, 'success');
        this._deleteTarget = null;
        this.close('deleteModal');
        App.renderPage(Navigation.currentPage);
      } else {
        Utils.showToast('Xóa thất bại do lỗi bộ nhớ trình duyệt (localStorage đầy hoặc bị chặn). Vui lòng thử lại.', 'error');
      }
    },

    handleTransferAndDelete() {
      if (!this._deleteTarget) return;
      const { type, id } = this._deleteTarget;
      const targetSelect = document.getElementById('deleteTransferSelect');
      const targetId = targetSelect ? targetSelect.value : '';

      if (!targetId) {
        Utils.showToast('Vui lòng chọn mục thay thế để tiếp nhận dữ liệu!', 'warning');
        return;
      }

      if (type === 'category') {
        const cat = Store.getCategories().find((c) => c.id === id);
        const targetCat = Store.getCategories().find((c) => c.id === targetId);

        // 1. Chuyển tất cả giao dịch sang danh mục đích
        const transactions = Store.getTransactions();
        let txnCount = 0;
        transactions.forEach((t) => {
          if (t.categoryId === id) {
            t.categoryId = targetId;
            txnCount++;
          }
        });

        // 2. Chuyển hoặc dọn dẹp ngân sách cũ an toàn
        const budgets = Store.getBudgets();
        const updatedBudgets = [];
        budgets.forEach((b) => {
          if (b.categoryId === id) {
            // Nếu danh mục đích chưa có ngân sách cùng tháng/năm thì gán sang danh mục đích
            const existing = budgets.find((eb) => eb.categoryId === targetId && eb.month === b.month && eb.year === b.year);
            if (!existing) {
              b.categoryId = targetId;
              updatedBudgets.push(b);
            }
          } else {
            updatedBudgets.push(b);
          }
        });

        // 3. Xóa danh mục nguồn khỏi danh sách
        const categories = Store.getCategories().filter((c) => c.id !== id);

        // 4. Lưu đồng bộ nguyên tử vào Store (atomic save có cơ chế rollback toàn vẹn)
        const saveResult = Store.atomicSave({
          [Store.KEYS.TRANSACTIONS]: transactions,
          [Store.KEYS.BUDGETS]: updatedBudgets,
          [Store.KEYS.CATEGORIES]: categories,
        });

        if (saveResult.success) {
          Utils.showToast(`Đã chuyển ${txnCount} giao dịch sang danh mục "${targetCat ? targetCat.name : ''}" và xóa danh mục "${cat ? cat.name : ''}" thành công!`, 'success');
          this._deleteTarget = null;
          this.close('deleteModal');
          App.renderPage(Navigation.currentPage);
        } else if (saveResult.rolledBack) {
          Utils.showToast('Lỗi khi lưu dữ liệu vào bộ nhớ trình duyệt (localStorage đầy hoặc bị chặn). Thao tác đã được hoàn tác an toàn, dữ liệu không bị thay đổi.', 'warning');
        } else {
          Utils.showToast(`CẢNH BÁO NGHÊM TRỌNG: Lỗi bộ nhớ và không thể hoàn tác các khóa [${saveResult.failedKeys.join(', ')}]. Dữ liệu đã được lưu tạm trong RAM. Vui lòng tải lại hoặc sao lưu ngay!`, 'error');
        }
      } else if (type === 'member') {
        const mem = Store.getMembers().find((m) => m.id === id);
        const targetMem = Store.getMembers().find((m) => m.id === targetId);

        // 1. Chuyển toàn bộ giao dịch sang thành viên tiếp nhận
        const transactions = Store.getTransactions();
        let txnCount = 0;
        transactions.forEach((t) => {
          if (t.memberId === id) {
            t.memberId = targetId;
            txnCount++;
          }
        });

        // 2. Xóa thành viên khỏi danh sách
        const members = Store.getMembers().filter((m) => m.id !== id);

        // 3. Lưu đồng bộ nguyên tử vào Store (atomic save có cơ chế rollback toàn vẹn)
        const saveResult = Store.atomicSave({
          [Store.KEYS.TRANSACTIONS]: transactions,
          [Store.KEYS.MEMBERS]: members,
        });

        if (saveResult.success) {
          Utils.showToast(`Đã chuyển ${txnCount} giao dịch sang thành viên "${targetMem ? targetMem.name : ''}" và xóa thành viên "${mem ? mem.name : ''}" thành công!`, 'success');
          this._deleteTarget = null;
          this.close('deleteModal');
          App.renderPage(Navigation.currentPage);
        } else if (saveResult.rolledBack) {
          Utils.showToast('Lỗi khi lưu dữ liệu vào bộ nhớ trình duyệt (localStorage đầy hoặc bị chặn). Thao tác đã được hoàn tác an toàn, dữ liệu không bị thay đổi.', 'warning');
        } else {
          Utils.showToast(`CẢNH BÁO NGHÊM TRỌNG: Lỗi bộ nhớ và không thể hoàn tác các khóa [${saveResult.failedKeys.join(', ')}]. Dữ liệu đã được lưu tạm trong RAM. Vui lòng tải lại hoặc sao lưu ngay!`, 'error');
        }
      }
    },
  };

  // =========================================================================
  // 6. TRANG TỔNG QUAN RA QUYẾT ĐỊNH (DECISION-DRIVEN DASHBOARD)
  // =========================================================================
  const Dashboard = {
    // Trạng thái bộ lọc kỳ thống nhất trên Dashboard
    selectedMonth: null,
    selectedYear: null,
    _filterInitialized: false,

    initPeriodFilter() {
      const monthSelect = document.getElementById('dashMonthSelect');
      const yearSelect = document.getElementById('dashYearSelect');
      const btnThisMonth = document.getElementById('btnDashThisMonth');

      const { month: curMonth, year: curYear } = Utils.getCurrentMonthYear();

      if (this.selectedMonth === null) this.selectedMonth = curMonth;
      if (this.selectedYear === null) this.selectedYear = curYear;

      if (monthSelect) {
        monthSelect.value = String(this.selectedMonth);
        if (!this._filterInitialized) {
          monthSelect.addEventListener('change', () => {
            this.selectedMonth = parseInt(monthSelect.value, 10);
            this.render();
          });
        }
      }

      if (yearSelect) {
        yearSelect.value = String(this.selectedYear);
        if (!this._filterInitialized) {
          yearSelect.addEventListener('change', () => {
            this.selectedYear = parseInt(yearSelect.value, 10);
            this.render();
          });
        }
      }

      if (btnThisMonth && !this._filterInitialized) {
        btnThisMonth.addEventListener('click', () => {
          const now = Utils.getCurrentMonthYear();
          this.selectedMonth = now.month;
          this.selectedYear = now.year;
          if (monthSelect) monthSelect.value = String(now.month);
          if (yearSelect) yearSelect.value = String(now.year);
          this.render();
          Utils.showToast(`Đã đồng bộ về kỳ hiện tại (${now.month}/${now.year})`, 'info');
        });
      }

      this._filterInitialized = true;
    },

    render() {
      // 0. Khởi tạo bộ lọc kỳ thống nhất
      this.initPeriodFilter();

      const month = this.selectedMonth;
      const year = this.selectedYear;

      const transactions = Store.getTransactions();
      const categories = Store.getCategories();
      const members = Store.getMembers();
      const budgets = Store.getBudgets();

      // Lọc các giao dịch thuộc đúng kỳ được chọn
      const periodTxns = transactions.filter((t) => {
        const d = new Date(t.date);
        return d.getMonth() + 1 === month && d.getFullYear() === year;
      });

      // =====================================================================
      // 1. TRẢ LỜI CÂU HỎI 1: THÁNG NÀY THU VÀ CHI BAO NHIÊU?
      // =====================================================================
      const totalIncome = periodTxns
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      // A. Tổng chi tiêu toàn bộ (Tất cả danh mục, không phụ thuộc ngân sách)
      const totalExpense = periodTxns
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      // B. Số dư ròng toàn bộ
      const balance = totalIncome - totalExpense;

      // C. Phân tích chi tiết Ngân sách & Chi tiêu theo danh mục
      const periodBudgets = budgets.filter((b) => b.month === month && b.year === year);
      const totalBudget = periodBudgets.reduce((sum, b) => sum + b.amount, 0);

      // Tập hợp ID các danh mục đã thiết lập ngân sách
      const budgetedCatIds = new Set(periodBudgets.map((b) => b.categoryId));

      // D. Chi tiêu thuộc các danh mục ĐÃ lập ngân sách
      const budgetedExpense = periodTxns
        .filter((t) => t.type === 'expense' && budgetedCatIds.has(t.categoryId))
        .reduce((sum, t) => sum + t.amount, 0);

      // E. Chi tiêu ngoài ngân sách (thuộc danh mục chưa lập ngân sách)
      const unbudgetedExpense = totalExpense - budgetedExpense;

      // F. Phần ngân sách còn lại (chỉ tính cho các danh mục có lập ngân sách)
      const remainingBudget = totalBudget > 0 ? (totalBudget - budgetedExpense) : 0;

      // G. Tỷ lệ sử dụng ngân sách & Tỷ lệ chi tiêu cốt lõi
      const savingsRate = totalIncome > 0 ? Math.round((balance / totalIncome) * 100) : 0;
      const expenseRate = totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0;
      const budgetUsagePct = totalBudget > 0 ? Math.round((budgetedExpense / totalBudget) * 100) : 0;

      // Cập nhật số liệu trên 4 thẻ chính
      Utils.animateNumber(document.getElementById('totalIncome'), totalIncome);
      Utils.animateNumber(document.getElementById('totalExpense'), totalExpense);
      Utils.animateNumber(document.getElementById('totalBalance'), balance);
      Utils.animateNumber(document.getElementById('remainingBudget'), remainingBudget);

      const remainingBudgetEl = document.getElementById('remainingBudget');
      if (remainingBudgetEl) {
        remainingBudgetEl.style.color = remainingBudget < 0 ? '#EF4444' : '';
      }

      // Cập nhật các dòng ngữ cảnh của từng thẻ
      const incomeGrowthHint = document.getElementById('incomeGrowthHint');
      if (incomeGrowthHint) {
        incomeGrowthHint.innerHTML = `<i class="fa-solid fa-calendar-check"></i> Số liệu kỳ <strong>${month}/${year}</strong>`;
      }

      const expenseRateHint = document.getElementById('expenseRateHint');
      if (expenseRateHint) {
        if (totalBudget > 0 && unbudgetedExpense > 0) {
          expenseRateHint.innerHTML = `<i class="fa-solid fa-chart-pie"></i> Chiếm <strong>${expenseRate}%</strong> thu (Trong NS: <strong>${Utils.formatCurrency(budgetedExpense)}</strong> • Ngoài NS: <strong>${Utils.formatCurrency(unbudgetedExpense)}</strong>)`;
        } else {
          expenseRateHint.innerHTML = `<i class="fa-solid fa-chart-pie"></i> Chiếm <strong>${expenseRate}%</strong> tổng thu nhập`;
        }
      }

      const savingsRateHint = document.getElementById('savingsRateHint');
      if (savingsRateHint) {
        if (balance >= 0) {
          savingsRateHint.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Giữ lại được <strong>${savingsRate}%</strong> (${Utils.formatCurrency(balance)})`;
        } else {
          savingsRateHint.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Thâm hụt <strong>${Math.abs(savingsRate)}%</strong> so với thu`;
        }
      }

      const budgetUsageBadge = document.getElementById('budgetUsageBadge');
      if (budgetUsageBadge) {
        if (totalBudget > 0) {
          if (budgetUsagePct > 100) {
            budgetUsageBadge.className = 'card-badge badge-danger';
            budgetUsageBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Vượt trần (${budgetUsagePct}%)`;
          } else if (budgetUsagePct >= 80) {
            budgetUsageBadge.className = 'card-badge badge-warning';
            budgetUsageBadge.innerHTML = `<i class="fa-solid fa-bell"></i> Dùng ${budgetUsagePct}%`;
          } else {
            budgetUsageBadge.className = 'card-badge';
            budgetUsageBadge.innerHTML = `<i class="fa-solid fa-bullseye"></i> Dùng ${budgetUsagePct}%`;
          }
        } else {
          budgetUsageBadge.className = 'card-badge';
          budgetUsageBadge.innerHTML = `<i class="fa-solid fa-circle-minus"></i> Chưa lập NS`;
        }
      }

      const budgetUsageRateHint = document.getElementById('budgetUsageRateHint');
      if (budgetUsageRateHint) {
        if (totalBudget > 0) {
          budgetUsageRateHint.innerHTML = `<i class="fa-solid fa-gauge-high"></i> Đã dùng <strong>${budgetUsagePct}%</strong> hạn mức (Đã chi: <strong>${Utils.formatCurrency(budgetedExpense)}</strong> / <strong>${Utils.formatCurrency(totalBudget)}</strong>)`;
        } else {
          budgetUsageRateHint.innerHTML = `<i class="fa-solid fa-circle-info"></i> Chưa thiết lập ngân sách kỳ này`;
        }
      }

      // Cập nhật thước đo Macro Dòng tiền & Tiến độ ngân sách (Cashflow Meter)
      const metaExpenseTotal = document.getElementById('metaExpenseTotal');
      if (metaExpenseTotal) metaExpenseTotal.textContent = Utils.formatCurrency(totalExpense);

      const metaExpensePct = document.getElementById('metaExpensePct');
      if (metaExpensePct) metaExpensePct.textContent = `${expenseRate}%`;

      const metaBudgetPct = document.getElementById('metaBudgetPct');
      if (metaBudgetPct) metaBudgetPct.textContent = `${totalBudget > 0 ? budgetUsagePct : 0}%`;

      const metaBudgetSpent = document.getElementById('metaBudgetSpent');
      if (metaBudgetSpent) metaBudgetSpent.textContent = Utils.formatCurrency(budgetedExpense);

      const metaBudgetTotal = document.getElementById('metaBudgetTotal');
      if (metaBudgetTotal) metaBudgetTotal.textContent = Utils.formatCurrency(totalBudget);

      const metaRemainingAmount = document.getElementById('metaRemainingAmount');
      if (metaRemainingAmount) {
        metaRemainingAmount.textContent = Utils.formatCurrency(remainingBudget);
        metaRemainingAmount.style.color = remainingBudget < 0 ? '#EF4444' : '#F59E0B';
      }

      const metaUnbudgetedAmount = document.getElementById('metaUnbudgetedAmount');
      if (metaUnbudgetedAmount) metaUnbudgetedAmount.textContent = Utils.formatCurrency(unbudgetedExpense);

      const metaBudgetProgressBar = document.getElementById('metaBudgetProgressBar');
      if (metaBudgetProgressBar) {
        const fillPct = Math.min(100, totalBudget > 0 ? budgetUsagePct : Math.min(100, expenseRate));
        metaBudgetProgressBar.style.width = `${fillPct}%`;
        if (budgetUsagePct > 100) {
          metaBudgetProgressBar.style.background = '#EF4444';
        } else if (budgetUsagePct > 85) {
          metaBudgetProgressBar.style.background = '#F59E0B';
        } else {
          metaBudgetProgressBar.style.background = 'linear-gradient(90deg, #10B981 0%, #3B82F6 70%, #F59E0B 100%)';
        }
      }

      // Đánh giá Huy hiệu Sức khỏe tài chính tổng quan
      const healthBadge = document.getElementById('dashHealthBadge');
      const healthText = document.getElementById('healthScoreText');
      if (healthBadge && healthText) {
        if (balance < 0 || (totalBudget > 0 && budgetUsagePct > 105)) {
          healthBadge.className = 'financial-health-badge danger';
          healthText.innerHTML = 'Cảnh báo thâm hụt tài chính';
        } else if (budgetUsagePct > 85 || expenseRate > 80) {
          healthBadge.className = 'financial-health-badge warning';
          healthText.innerHTML = 'Cần thắt chặt chi tiêu';
        } else {
          healthBadge.className = 'financial-health-badge';
          healthText.innerHTML = 'Tích cực & Khả năng tiết kiệm tốt';
        }
      }

      // =====================================================================
      // 2. TRẢ LỜI CÂU HỎI 2: DANH MỤC NÀO ĐANG CHI NHIỀU HOẶC VƯỢT NGÂN SÁCH?
      // =====================================================================
      this._renderBudgetUtilization(periodTxns, categories, periodBudgets);
      this._renderExpenseCategoryChart(periodTxns, categories);

      // =====================================================================
      // 3. TRẢ LỜI CÂU HỎI 3: TÔI CẦN CHÚ Ý ĐIỀU GÌ TIẾP THEO? (ALERTS & ACTIONS)
      // =====================================================================
      this._renderDecisionAlerts(periodTxns, categories, periodBudgets, totalIncome, totalExpense, balance, remainingBudget, month, year, budgetedExpense, unbudgetedExpense, totalBudget);

      // Biểu đồ xu hướng 6 tháng & Bảng giao dịch gần đây trong kỳ
      this._renderIncomeExpenseChart(transactions);
      this._renderRecentTransactions(periodTxns, categories, members);
    },

    // -----------------------------------------------------------------------
    // XỬ LÝ CÂU HỎI 2: TỶ LỆ SỬ DỤNG NGÂN SÁCH & HẠNG MỤC CHI LỚN
    // -----------------------------------------------------------------------
    _renderBudgetUtilization(periodTxns, categories, periodBudgets) {
      const container = document.getElementById('dashBudgetUtilizationList');
      if (!container) return;

      const expenseTxns = periodTxns.filter((t) => t.type === 'expense');

      // Tổng hợp chi tiêu theo từng danh mục
      const catSpentMap = {};
      expenseTxns.forEach((t) => {
        catSpentMap[t.categoryId] = (catSpentMap[t.categoryId] || 0) + t.amount;
      });

      // Tập hợp tất cả các danh mục có chi tiêu HOẶC có đặt ngân sách trong kỳ
      const relevantCatIds = new Set([
        ...Object.keys(catSpentMap),
        ...periodBudgets.map((b) => b.categoryId),
      ]);

      const items = Array.from(relevantCatIds).map((cid) => {
        const cat = categories.find((c) => c.id === cid) || { name: 'Khác', icon: 'fa-tag', color: '#6B7280' };
        const spent = catSpentMap[cid] || 0;
        const budgetItem = periodBudgets.find((b) => b.categoryId === cid);
        const budgetAmount = budgetItem ? budgetItem.amount : 0;
        const usagePct = budgetAmount > 0 ? Math.round((spent / budgetAmount) * 100) : null;
        const overAmount = budgetAmount > 0 ? (spent - budgetAmount) : 0;

        return {
          id: cid,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          spent,
          budgetAmount,
          usagePct,
          overAmount,
        };
      });

      if (items.length === 0) {
        container.innerHTML = `
          <div class="text-center py-4 text-muted" style="font-size:0.88rem;">
            <i class="fa-solid fa-folder-open" style="font-size:1.5rem;margin-bottom:8px;color:#94a3b8;display:block;"></i>
            Chưa có chi tiêu hay ngân sách nào trong kỳ này
          </div>`;
        return;
      }

      // Sắp xếp: Ưu tiên danh mục Vượt ngân sách lên đầu, sau đó theo % sử dụng cao, rồi đến số tiền chi nhiều
      items.sort((a, b) => {
        if (a.overAmount > 0 && b.overAmount <= 0) return -1;
        if (b.overAmount > 0 && a.overAmount <= 0) return 1;
        if (a.usagePct !== null && b.usagePct !== null) return b.usagePct - a.usagePct;
        return b.spent - a.spent;
      });

      // Lấy tối đa 5 danh mục đáng chú ý nhất để không bị dài
      const topItems = items.slice(0, 5);

      container.innerHTML = topItems
        .map((item) => {
          let badgeHtml = '';
          let barColor = '#10B981';
          const fillWidth = item.usagePct !== null ? Math.min(100, item.usagePct) : (item.spent > 0 ? 100 : 0);

          if (item.budgetAmount > 0) {
            if (item.usagePct >= 100) {
              barColor = '#EF4444';
              badgeHtml = `<span class="utilization-badge danger"><i class="fa-solid fa-triangle-exclamation"></i> Vượt ${Utils.formatCurrency(item.overAmount)} (${item.usagePct}%)</span>`;
            } else if (item.usagePct >= 80) {
              barColor = '#F59E0B';
              badgeHtml = `<span class="utilization-badge warning"><i class="fa-solid fa-circle-exclamation"></i> Chạm ${item.usagePct}% hạn mức</span>`;
            } else {
              barColor = '#10B981';
              badgeHtml = `<span class="utilization-badge safe"><i class="fa-solid fa-check"></i> An toàn (${item.usagePct}%)</span>`;
            }
          } else {
            barColor = '#94A3B8';
            badgeHtml = `<span class="utilization-badge" style="background:#F1F5F9;color:#64748B;">Chưa lập ngân sách</span>`;
          }

          return `
          <div class="utilization-item">
            <div class="utilization-header">
              <div class="utilization-cat-info">
                <span class="utilization-cat-icon" style="background:${item.color}20;color:${item.color};">
                  <i class="fa-solid ${item.icon}"></i>
                </span>
                <span>${Utils.escapeHtml(item.name)}</span>
              </div>
              <div class="utilization-amounts">
                <strong>${Utils.formatCurrency(item.spent)}</strong>
                ${item.budgetAmount > 0 ? `<span style="color:#94a3b8;"> / ${Utils.formatCurrency(item.budgetAmount)}</span>` : ''}
              </div>
            </div>

            <div class="utilization-bar-container">
              <div class="utilization-bar" style="width:${fillWidth}%;background:${barColor};"></div>
            </div>

            <div class="utilization-footer">
              <span style="color:#64748b;">
                ${item.budgetAmount > 0 ? (item.overAmount > 0 ? `<span style="color:#ef4444;font-weight:600;">Đã vượt trần</span>` : `Còn lại: ${Utils.formatCurrency(item.budgetAmount - item.spent)}`) : 'Ngoài ngân sách'}
              </span>
              ${badgeHtml}
            </div>
          </div>`;
        })
        .join('');
    },

    // -----------------------------------------------------------------------
    // XỬ LÝ CÂU HỎI 3: CẢNH BÁO CÓ CĂN CỨ & KHUYẾN NGHỊ HÀNH ĐỘNG
    // -----------------------------------------------------------------------
    _renderDecisionAlerts(periodTxns, categories, periodBudgets, totalIncome, totalExpense, balance, remainingBudget, month, year, budgetedExpense = 0, unbudgetedExpense = 0, totalBudget = 0) {
      const alertsContainer = document.getElementById('dashDecisionAlerts');
      const allowanceValueEl = document.getElementById('dailyAllowanceValue');
      const allowanceSubEl = document.getElementById('dailyAllowanceSub');
      const countBadge = document.getElementById('dashAlertCountText');

      if (!alertsContainer) return;

      const now = new Date();
      const isCurrentPeriod = (now.getMonth() + 1 === month) && (now.getFullYear() === year);

      // 1. Tính toán Hạn mức chi tiêu an toàn hàng ngày (Daily Safe Spending Allowance)
      const daysInMonth = new Date(year, month, 0).getDate();

      if (isCurrentPeriod) {
        const currentDay = now.getDate();
        const daysLeft = Math.max(1, daysInMonth - currentDay + 1);

        if (totalBudget > 0) {
          const safeDailyAmount = Math.max(0, Math.floor((remainingBudget > 0 ? remainingBudget : 0) / daysLeft));
          if (allowanceValueEl) {
            allowanceValueEl.textContent = `${Utils.formatCurrency(safeDailyAmount)} / ngày`;
          }
          if (allowanceSubEl) {
            allowanceSubEl.innerHTML = `Còn <strong>${daysLeft} ngày</strong>. Hạn mức an toàn mỗi ngày cho các danh mục có ngân sách (còn lại <strong>${Utils.formatCurrency(remainingBudget)}</strong>).`;
          }
        } else {
          const safeDailyAmount = Math.max(0, Math.floor((balance > 0 ? balance : 0) / daysLeft));
          if (allowanceValueEl) {
            allowanceValueEl.textContent = `${Utils.formatCurrency(safeDailyAmount)} / ngày`;
          }
          if (allowanceSubEl) {
            allowanceSubEl.innerHTML = `Còn <strong>${daysLeft} ngày</strong>. Tính theo số dư khả dụng (kỳ này chưa đặt ngân sách).`;
          }
        }
      } else {
        // Nếu là kỳ quá khứ: tính mức chi trung bình ngày thực tế đã diễn ra
        const avgDailySpent = Math.round(totalExpense / daysInMonth);
        if (allowanceValueEl) {
          allowanceValueEl.textContent = `${Utils.formatCurrency(avgDailySpent)} / ngày`;
        }
        if (allowanceSubEl) {
          allowanceSubEl.innerHTML = `Mức chi tiêu trung bình thực tế mỗi ngày trong kỳ <strong>${month}/${year}</strong> (${daysInMonth} ngày).`;
        }
      }

      // 2. Thu thập và phân tích các Cảnh báo có căn cứ (Evidence-based Alerts)
      const alerts = [];
      const expenseTxns = periodTxns.filter((t) => t.type === 'expense');

      // Bản đồ chi tiêu theo danh mục
      const catSpentMap = {};
      expenseTxns.forEach((t) => {
        catSpentMap[t.categoryId] = (catSpentMap[t.categoryId] || 0) + t.amount;
      });

      // Cảnh báo A: Kiểm tra danh mục VƯỢT NGÂN SÁCH (Danger)
      periodBudgets.forEach((b) => {
        const spent = catSpentMap[b.categoryId] || 0;
        if (spent > b.amount) {
          const over = spent - b.amount;
          const cat = categories.find((c) => c.id === b.categoryId);
          const catName = cat ? cat.name : 'Danh mục';
          alerts.push({
            type: 'danger',
            icon: 'fa-triangle-exclamation',
            title: `Vượt hạn mức ngân sách: ${catName}`,
            desc: `Đã chi <strong>${Utils.formatCurrency(spent)}</strong>, vượt <strong>${Utils.formatCurrency(over)}</strong> (+${Math.round((over / b.amount) * 100)}%) so với kế hoạch ban đầu.`,
            actionText: 'Điều chỉnh ngân sách',
            actionPage: 'page-budget',
          });
        }
      });

      // Cảnh báo B: Kiểm tra danh mục CHẠM NGƯỠNG NGUY HIỂM (80% - 99%) (Warning)
      periodBudgets.forEach((b) => {
        const spent = catSpentMap[b.categoryId] || 0;
        if (spent <= b.amount && b.amount > 0) {
          const pct = Math.round((spent / b.amount) * 100);
          if (pct >= 80) {
            const cat = categories.find((c) => c.id === b.categoryId);
            const catName = cat ? cat.name : 'Danh mục';
            const remaining = b.amount - spent;
            alerts.push({
              type: 'warning',
              icon: 'fa-bell',
              title: `Cận kề chạm trần: ${catName} (${pct}%)`,
              desc: `Chỉ còn <strong>${Utils.formatCurrency(remaining)}</strong> cho hạng mục này. Nên tạm hoãn các khoản chi chưa thực sự cấp thiết.`,
              actionText: 'Xem giao dịch chi tiêu',
              actionPage: 'page-expense',
            });
          }
        }
      });

      // Cảnh báo C: Đánh giá tỷ trọng tổng chi tiêu so với thu nhập (Macro Balance)
      if (totalIncome > 0) {
        const expRatio = Math.round((totalExpense / totalIncome) * 100);
        if (expRatio > 85) {
          alerts.push({
            type: 'warning',
            icon: 'fa-scale-unbalanced',
            title: `Áp lực dòng tiền: Chi tiêu chiếm ${expRatio}% thu nhập`,
            desc: `Bạn đã chi phần lớn nguồn thu của kỳ. Cần rà soát các khoản mua sắm tùy ý để đảm bảo quỹ dự phòng an toàn.`,
            actionText: 'Rà soát chi tiêu',
            actionPage: 'page-expense',
          });
        } else if (expRatio <= 65 && totalExpense > 0) {
          alerts.push({
            type: 'success',
            icon: 'fa-circle-check',
            title: `Kỷ luật tài chính tốt: Giữ lại ${100 - expRatio}% thu nhập`,
            desc: `Dòng tiền đang thặng dư <strong>${Utils.formatCurrency(balance)}</strong>. Bạn có thể cân nhắc chuyển một phần vào quỹ tiết kiệm hoặc đầu tư.`,
            actionText: 'Xem báo cáo tích lũy',
            actionPage: 'page-reports',
          });
        }
      } else if (totalExpense > 0 && totalIncome === 0) {
        alerts.push({
          type: 'danger',
          icon: 'fa-circle-exclamation',
          title: `Chưa ghi nhận thu nhập trong kỳ này`,
          desc: `Đã phát sinh chi tiêu <strong>${Utils.formatCurrency(totalExpense)}</strong> nhưng chưa có nguồn thu. Hãy cập nhật thu nhập để số dư chính xác.`,
          actionText: '+ Thêm thu nhập',
          actionPage: 'page-income',
        });
      }

      // Cảnh báo D: Phát hiện hạng mục ngốn nhiều tiền nhất
      const sortedCats = Object.keys(catSpentMap).sort((a, b) => catSpentMap[b] - catSpentMap[a]);
      if (sortedCats.length > 0 && totalExpense > 0) {
        const topCatId = sortedCats[0];
        const topCatSpent = catSpentMap[topCatId];
        const topCat = categories.find((c) => c.id === topCatId);
        const topCatPct = Math.round((topCatSpent / totalExpense) * 100);

        if (topCatPct >= 35) {
          alerts.push({
            type: 'info',
            icon: 'fa-lightbulb',
            title: `Trọng tâm chi tiêu: ${topCat ? topCat.name : 'Danh mục'} (${topCatPct}%)`,
            desc: `Hạng mục này chiếm tới <strong>${Utils.formatCurrency(topCatSpent)}</strong> trong tổng chi. Tối ưu khoản này sẽ tạo ra khác biệt lớn nhất cho số dư.`,
            actionText: 'Xem chi tiết',
            actionPage: 'page-expense',
          });
        }
      }

      // Cảnh báo E: Phát hiện chi tiêu ngoài ngân sách đáng kể
      if (unbudgetedExpense > 0 && totalBudget > 0 && unbudgetedExpense >= 0.2 * totalExpense) {
        const unbudgetedPct = Math.round((unbudgetedExpense / totalExpense) * 100);
        alerts.push({
          type: 'warning',
          icon: 'fa-layer-group',
          title: `Chi ngoài ngân sách: ${Utils.formatCurrency(unbudgetedExpense)} (${unbudgetedPct}% tổng chi)`,
          desc: `Kỳ này có <strong>${Utils.formatCurrency(unbudgetedExpense)}</strong> chi tiêu thuộc các danh mục chưa được lập ngân sách. Hãy phân bổ ngân sách để bao quát mọi khoản chi.`,
          actionText: 'Thiết lập ngân sách',
          actionPage: 'page-budget',
        });
      }

      // Cập nhật số lượng thông báo cần chú ý
      if (countBadge) {
        const attentionCount = alerts.filter((a) => a.type === 'danger' || a.type === 'warning').length;
        if (attentionCount > 0) {
          countBadge.textContent = `${attentionCount} cảnh báo cần xử lý`;
          countBadge.style.color = '#B91C1C';
          countBadge.parentElement.style.background = '#FEE2E2';
        } else {
          countBadge.textContent = 'Mọi chỉ số đều ổn định';
          countBadge.style.color = '#15803D';
          countBadge.parentElement.style.background = '#DCFCE7';
        }
      }

      if (alerts.length === 0) {
        alertsContainer.innerHTML = `
          <div class="decision-alert-item success">
            <div class="alert-icon-box"><i class="fa-solid fa-circle-check"></i></div>
            <div class="alert-content-box">
              <div class="alert-title-row">
                <span class="alert-title-text">Tài chính đang trong tầm kiểm soát</span>
              </div>
              <div class="alert-desc-text">Chưa phát hiện rủi ro vượt ngân sách hay bất thường nào trong kỳ này. Tiếp tục duy trì kế hoạch!</div>
            </div>
          </div>`;
        return;
      }

      // Render các cảnh báo (tối đa 4)
      alertsContainer.innerHTML = alerts
        .slice(0, 4)
        .map((a) => `
        <div class="decision-alert-item ${a.type}">
          <div class="alert-icon-box">
            <i class="fa-solid ${a.icon}"></i>
          </div>
          <div class="alert-content-box">
            <div class="alert-title-row">
              <span class="alert-title-text">${a.title}</span>
            </div>
            <div class="alert-desc-text">${a.desc}</div>
            <a class="alert-action-link" href="#${a.actionPage}" data-page="${a.actionPage}">
              ${a.actionText} <i class="fa-solid fa-arrow-right"></i>
            </a>
          </div>
        </div>`)
        .join('');
    },

    // -----------------------------------------------------------------------
    // BIỂU ĐỒ & LỊCH SỬ GIAO DỊCH
    // -----------------------------------------------------------------------
    _renderIncomeExpenseChart(transactions) {
      const labels = [];
      const incomeData = [];
      const expenseData = [];

      const today = new Date();

      for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        labels.push(Utils.monthNames[m - 1]);

        const mTxns = transactions.filter((t) => {
          const td = new Date(t.date);
          return td.getMonth() + 1 === m && td.getFullYear() === y;
        });

        incomeData.push(mTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0));
        expenseData.push(mTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
      }

      Charts.create('incomeExpenseChart', {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Thu nhập',
              data: incomeData,
              backgroundColor: 'rgba(16, 185, 129, 0.85)',
              borderColor: '#10B981',
              borderWidth: 1,
              borderRadius: 6,
            },
            {
              label: 'Chi tiêu',
              data: expenseData,
              backgroundColor: 'rgba(239, 68, 68, 0.85)',
              borderColor: '#EF4444',
              borderWidth: 1,
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${Utils.formatCurrency(ctx.parsed.y)}`,
              },
            },
            legend: { position: 'top' },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v) => Utils.formatCurrency(v),
              },
            },
          },
        },
      });
    },

    _renderExpenseCategoryChart(periodTxns, categories) {
      const expenses = periodTxns.filter((t) => t.type === 'expense');
      const catMap = {};

      expenses.forEach((t) => {
        catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount;
      });

      const catIds = Object.keys(catMap);
      const labels = [];
      const data = [];
      const colors = [];

      catIds.forEach((cid) => {
        const cat = categories.find((c) => c.id === cid);
        labels.push(cat ? cat.name : 'Khác');
        data.push(catMap[cid]);
        colors.push(cat ? cat.color : '#6B7280');
      });

      if (data.length === 0) {
        labels.push('Chưa có chi tiêu');
        data.push(1);
        colors.push('#E5E7EB');
      }

      Charts.create('expenseCategoryChart', {
        type: 'doughnut',
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor: colors,
              borderWidth: 2,
              borderColor: '#ffffff',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  if (data.length === 1 && labels[0] === 'Chưa có chi tiêu') return 'Chưa có dữ liệu';
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
                  return `${ctx.label}: ${Utils.formatCurrency(ctx.parsed)} (${pct}%)`;
                },
              },
            },
            legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 11 } } },
          },
        },
      });
    },

    _renderRecentTransactions(periodTxns, categories, members) {
      const tbody = document.getElementById('recentTransactionsBody');
      if (!tbody) return;

      const sorted = [...periodTxns]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 6);

      if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">Chưa có giao dịch nào trong kỳ này</td></tr>';
        return;
      }

      tbody.innerHTML = sorted
        .map((t) => {
          const cat = categories.find((c) => c.id === t.categoryId);
          const isIncome = t.type === 'income';
          return `
          <tr>
            <td style="white-space:nowrap;font-size:0.82rem;color:#64748b;">${Utils.formatDate(t.date)}</td>
            <td><strong>${Utils.escapeHtml(t.description)}</strong></td>
            <td>
              <span class="category-badge" style="background:${cat ? cat.color + '20' : '#f3f4f6'};color:${cat ? cat.color : '#6B7280'};padding:3px 8px;border-radius:6px;font-size:0.8rem;white-space:nowrap;">
                <i class="fa-solid ${cat ? cat.icon : 'fa-tag'}"></i> ${Utils.escapeHtml(cat ? cat.name : 'Chưa phân loại')}
              </span>
            </td>
            <td class="amount ${isIncome ? 'income' : 'expense'}" style="font-weight:700;color:${isIncome ? '#10B981' : '#EF4444'};white-space:nowrap;">
              ${isIncome ? '+' : '-'}${Utils.formatCurrency(t.amount)}
            </td>
          </tr>`;
        })
        .join('');
    },
  };

  // =========================================================================
  // 7. TRANG THU NHẬP & CHI TIÊU (INCOME & EXPENSE PAGES)
  // =========================================================================
  const TransactionPage = {
    state: {
      income: { page: 1, limit: 10 },
      expense: { page: 1, limit: 10 },
    },

    render(type) {
      const isIncome = type === 'income';
      const prefix = isIncome ? 'income' : 'expense';

      const fromDateInput = document.getElementById(`${prefix}FromDate`);
      const toDateInput = document.getElementById(`${prefix}ToDate`);
      const catSelect = document.getElementById(`${prefix}CategoryFilter`);
      const memSelect = document.getElementById(`${prefix}MemberFilter`);
      const searchInput = document.getElementById(`${prefix}Search`);
      const tbody = document.getElementById(`${prefix}TableBody`);
      const paginationEl = document.getElementById(`${prefix}Pagination`);

      if (!tbody) return;

      const transactions = Store.getTransactions();
      const categories = Store.getCategories();
      const members = Store.getMembers();

      // Đổ danh mục vào bộ lọc nếu chưa có
      if (catSelect && catSelect.options.length <= 1) {
        const cats = categories.filter((c) => c.type === type);
        cats.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.name;
          catSelect.appendChild(opt);
        });
      }

      // Đổ thành viên vào bộ lọc nếu chưa có
      if (memSelect && memSelect.options.length <= 1) {
        members.forEach((m) => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name;
          memSelect.appendChild(opt);
        });
      }

      // Lọc dữ liệu
      const fromDate = fromDateInput ? fromDateInput.value : '';
      const toDate = toDateInput ? toDateInput.value : '';
      const selectedCat = catSelect ? catSelect.value : '';
      const selectedMem = memSelect ? memSelect.value : '';
      const search = searchInput ? searchInput.value.toLowerCase().trim() : '';

      let list = transactions.filter((t) => t.type === type);

      if (fromDate) list = list.filter((t) => t.date >= fromDate);
      if (toDate) list = list.filter((t) => t.date <= toDate);
      if (selectedCat) list = list.filter((t) => t.categoryId === selectedCat);
      if (selectedMem) list = list.filter((t) => t.memberId === selectedMem);
      if (search) {
        list = list.filter(
          (t) =>
            t.description.toLowerCase().includes(search) ||
            (categories.find((c) => c.id === t.categoryId)?.name || '').toLowerCase().includes(search) ||
            (t.note && t.note.toLowerCase().includes(search))
        );
      }

      // Sắp xếp ngày giảm dần
      list.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Phân trang
      const totalItems = list.length;
      const limit = this.state[type].limit;
      const totalPages = Math.max(1, Math.ceil(totalItems / limit));
      if (this.state[type].page > totalPages) {
        this.state[type].page = totalPages;
      }
      const currentPage = this.state[type].page;
      const startIndex = (currentPage - 1) * limit;
      const pagedList = list.slice(startIndex, startIndex + limit);

      // Render bảng
      if (pagedList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Không tìm thấy giao dịch nào</td></tr>';
      } else {
        tbody.innerHTML = pagedList
          .map((t, idx) => {
            const cat = categories.find((c) => c.id === t.categoryId);
            const mem = members.find((m) => m.id === t.memberId);
            return `
            <tr>
              <td>${startIndex + idx + 1}</td>
              <td>${Utils.formatDate(t.date)}</td>
              <td>
                <div><strong>${Utils.escapeHtml(t.description)}</strong></div>
                ${t.note ? `<small class="text-muted">${Utils.escapeHtml(t.note)}</small>` : ''}
              </td>
              <td>
                <span class="category-badge" style="background:${cat ? cat.color + '20' : '#f3f4f6'};color:${cat ? cat.color : '#6B7280'};padding:4px 8px;border-radius:6px;font-size:0.85rem;">
                  <i class="fa-solid ${cat ? cat.icon : 'fa-tag'}"></i> ${Utils.escapeHtml(cat ? cat.name : 'Chưa phân loại')}
                </span>
              </td>
              <td>${Utils.escapeHtml(mem ? mem.name : 'Chưa gán')}</td>
              <td class="amount ${isIncome ? 'income' : 'expense'}" style="font-weight:600;color:${isIncome ? '#10B981' : '#EF4444'}">
                ${isIncome ? '+' : '-'}${Utils.formatCurrency(t.amount)}
              </td>
              <td>
                <button class="btn btn-outline btn-sm btn-edit-txn" data-id="${t.id}" data-type="${type}" title="Sửa">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn btn-outline btn-sm text-danger btn-delete-txn" data-id="${t.id}" data-type="transaction" title="Xóa">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </td>
            </tr>`;
          })
          .join('');
      }

      // Cập nhật phân trang
      if (paginationEl) {
        paginationEl.innerHTML = `
          <button class="pagination-btn" data-action="prev" ${currentPage <= 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left"></i> Trước
          </button>
          <div class="pagination-pages">
            <span class="pagination-info">Trang <strong>${currentPage}</strong> / ${totalPages} (${totalItems} mục)</span>
          </div>
          <button class="pagination-btn" data-action="next" ${currentPage >= totalPages ? 'disabled' : ''}>
            Sau <i class="fa-solid fa-chevron-right"></i>
          </button>
        `;

        const prevBtn = paginationEl.querySelector('[data-action="prev"]');
        const nextBtn = paginationEl.querySelector('[data-action="next"]');

        if (prevBtn) {
          prevBtn.onclick = () => {
            if (this.state[type].page > 1) {
              this.state[type].page--;
              this.render(type);
            }
          };
        }
        if (nextBtn) {
          nextBtn.onclick = () => {
            if (this.state[type].page < totalPages) {
              this.state[type].page++;
              this.render(type);
            }
          };
        }
      }
    },
  };

  // =========================================================================
  // 8. TRANG BÁO CÁO (REPORTS PAGE)
  // =========================================================================
  const ReportsPage = {
    render() {
      const monthSelect = document.getElementById('reportMonth');
      const yearSelect = document.getElementById('reportYear');
      const typeSelect = document.getElementById('reportType');

      const { month: curMonth, year: curYear } = Utils.getCurrentMonthYear();

      if (yearSelect && !yearSelect.value) {
        yearSelect.value = curYear;
      }

      const selectedMonth = monthSelect ? parseInt(monthSelect.value, 10) || 0 : 0; // 0 = tất cả các tháng
      const selectedYear = yearSelect ? parseInt(yearSelect.value, 10) || curYear : curYear;
      const reportType = typeSelect ? typeSelect.value : 'overview';

      const transactions = Store.getTransactions();
      const categories = Store.getCategories();
      const members = Store.getMembers();

      // Lọc giao dịch theo năm và tháng được chọn
      let filtered = transactions.filter((t) => {
        const d = new Date(t.date);
        const yMatch = d.getFullYear() === selectedYear;
        const mMatch = selectedMonth === 0 || d.getMonth() + 1 === selectedMonth;
        return yMatch && mMatch;
      });

      const totalIncome = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const totalExpense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const difference = totalIncome - totalExpense;

      // Cập nhật thẻ tóm tắt
      const incomeEl = document.getElementById('reportTotalIncome');
      const expenseEl = document.getElementById('reportTotalExpense');
      const diffEl = document.getElementById('reportDifference');

      if (incomeEl) incomeEl.textContent = Utils.formatCurrency(totalIncome);
      if (expenseEl) expenseEl.textContent = Utils.formatCurrency(totalExpense);
      if (diffEl) {
        diffEl.textContent = Utils.formatCurrency(difference);
        diffEl.style.color = difference >= 0 ? '#10B981' : '#EF4444';
      }

      // Biểu đồ 1: Cột so sánh theo 12 tháng trong năm
      this._renderYearlyBarChart(transactions, selectedYear);

      // Biểu đồ 2: Đường xu hướng chi tiêu theo thời gian
      this._renderTrendLineChart(filtered, selectedMonth, selectedYear);

      // Biểu đồ 3: Tròn phân bổ theo danh mục
      this._renderCategoryPieChart(filtered, categories);

      // Bảng chi tiết
      this._renderReportTable(transactions, selectedYear, selectedMonth, reportType, categories, members);
    },

    _renderYearlyBarChart(transactions, year) {
      const labels = Utils.monthNames.slice();
      const incomeData = new Array(12).fill(0);
      const expenseData = new Array(12).fill(0);

      transactions.forEach((t) => {
        const d = new Date(t.date);
        if (d.getFullYear() === year) {
          const m = d.getMonth();
          if (t.type === 'income') incomeData[m] += t.amount;
          else expenseData[m] += t.amount;
        }
      });

      Charts.create('reportBarChart', {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Thu nhập',
              data: incomeData,
              backgroundColor: 'rgba(16, 185, 129, 0.85)',
              borderColor: '#10B981',
              borderWidth: 1,
              borderRadius: 6,
            },
            {
              label: 'Chi tiêu',
              data: expenseData,
              backgroundColor: 'rgba(239, 68, 68, 0.85)',
              borderColor: '#EF4444',
              borderWidth: 1,
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${Utils.formatCurrency(ctx.parsed.y)}`,
              },
            },
            legend: { position: 'top' },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (v) => Utils.formatCurrency(v) },
            },
          },
        },
      });
    },

    _renderTrendLineChart(filtered, month, year) {
      const expenses = filtered.filter((t) => t.type === 'expense');

      let labels = [];
      let data = [];

      if (month === 0) {
        // Cả năm: hiển thị theo 12 tháng
        labels = Utils.monthNames.slice();
        data = new Array(12).fill(0);
        expenses.forEach((t) => {
          const d = new Date(t.date);
          data[d.getMonth()] += t.amount;
        });
      } else {
        // Một tháng cụ thể: hiển thị theo ngày
        const daysInMonth = new Date(year, month, 0).getDate();
        labels = Array.from({ length: daysInMonth }, (_, i) => `Ngày ${i + 1}`);
        data = new Array(daysInMonth).fill(0);
        expenses.forEach((t) => {
          const day = new Date(t.date).getDate();
          if (day >= 1 && day <= daysInMonth) {
            data[day - 1] += t.amount;
          }
        });
      }

      Charts.create('reportLineChart', {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Chi tiêu theo ngày',
              data,
              borderColor: '#EF4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.35,
              fill: true,
              pointRadius: 3,
              pointBackgroundColor: '#EF4444',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => `Chi: ${Utils.formatCurrency(ctx.parsed.y)}`,
              },
            },
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (v) => Utils.formatCurrency(v) },
            },
          },
        },
      });
    },

    _renderCategoryPieChart(filtered, categories) {
      const expenses = filtered.filter((t) => t.type === 'expense');
      const catMap = {};

      expenses.forEach((t) => {
        catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount;
      });

      const catIds = Object.keys(catMap);
      const labels = [];
      const data = [];
      const colors = [];

      catIds.forEach((cid) => {
        const cat = categories.find((c) => c.id === cid);
        labels.push(cat ? cat.name : 'Khác');
        data.push(catMap[cid]);
        colors.push(cat ? cat.color : '#6B7280');
      });

      if (data.length === 0) {
        labels.push('Chưa có chi tiêu');
        data.push(1);
        colors.push('#E5E7EB');
      }

      Charts.create('reportPieChart', {
        type: 'pie',
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor: colors,
              borderWidth: 2,
              borderColor: '#ffffff',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  if (data.length === 1 && labels[0] === 'Chưa có chi tiêu') return 'Chưa có dữ liệu';
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
                  return `${ctx.label}: ${Utils.formatCurrency(ctx.parsed)} (${pct}%)`;
                },
              },
            },
            legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8 } },
          },
        },
      });
    },

    _renderReportTable(transactions, year, selectedMonth, reportType, categories, members) {
      const tbody = document.getElementById('reportTableBody');
      if (!tbody) return;

      const theadRow = document.querySelector('#reportTable thead tr');

      if (reportType === 'member') {
        // Báo cáo theo thành viên
        if (theadRow) {
          theadRow.innerHTML = `
            <th>Thành viên</th>
            <th>Vai trò</th>
            <th>Tổng thu nhập</th>
            <th>Tổng chi tiêu</th>
            <th>Đóng góp ròng</th>
          `;
        }

        const filtered = transactions.filter((t) => {
          const d = new Date(t.date);
          const yMatch = d.getFullYear() === year;
          const mMatch = selectedMonth === 0 || d.getMonth() + 1 === selectedMonth;
          return yMatch && mMatch;
        });

        tbody.innerHTML = members
          .map((m) => {
            const mTxns = filtered.filter((t) => t.memberId === m.id);
            const inc = mTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const exp = mTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
            const net = inc - exp;
            return `
            <tr>
              <td><strong>${Utils.escapeHtml(m.name)}</strong></td>
              <td><span class="badge" style="background:${m.color}20;color:${m.color}">${Utils.escapeHtml(m.role)}</span></td>
              <td class="text-success" style="color:#10B981">+${Utils.formatCurrency(inc)}</td>
              <td class="text-danger" style="color:#EF4444">-${Utils.formatCurrency(exp)}</td>
              <td style="font-weight:600;color:${net >= 0 ? '#10B981' : '#EF4444'}">${Utils.formatCurrency(net)}</td>
            </tr>`;
          })
          .join('');
      } else {
        // Mặc định: Báo cáo theo tháng
        if (theadRow) {
          theadRow.innerHTML = `
            <th>Tháng</th>
            <th>Thu nhập</th>
            <th>Chi tiêu</th>
            <th>Chênh lệch</th>
            <th>Tỷ lệ tiết kiệm</th>
          `;
        }

        const monthRange = selectedMonth === 0 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [selectedMonth];

        tbody.innerHTML = monthRange
          .map((m) => {
            const mTxns = transactions.filter((t) => {
              const d = new Date(t.date);
              return d.getFullYear() === year && d.getMonth() + 1 === m;
            });

            const inc = mTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            const exp = mTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
            const diff = inc - exp;
            const savingsRate = inc > 0 ? Math.round((diff / inc) * 100) : 0;

            return `
            <tr>
              <td><strong>${Utils.monthNames[m - 1]} / ${year}</strong></td>
              <td class="text-success" style="color:#10B981">+${Utils.formatCurrency(inc)}</td>
              <td class="text-danger" style="color:#EF4444">-${Utils.formatCurrency(exp)}</td>
              <td style="font-weight:600;color:${diff >= 0 ? '#10B981' : '#EF4444'}">${Utils.formatCurrency(diff)}</td>
              <td>
                <span class="badge" style="background:${savingsRate >= 20 ? '#10B98120' : '#F59E0B20'};color:${savingsRate >= 20 ? '#10B981' : '#F59E0B'}">
                  ${savingsRate}%
                </span>
              </td>
            </tr>`;
          })
          .join('');
      }
    },

    exportCSV() {
      const transactions = Store.getTransactions();
      const categories = Store.getCategories();
      const members = Store.getMembers();

      if (transactions.length === 0) {
        Utils.showToast('Không có dữ liệu giao dịch để xuất', 'warning');
        return;
      }

      // Tạo nội dung CSV kèm UTF-8 BOM để Excel hiển thị đúng dấu tiếng Việt
      let csvContent = '\uFEFF';
      csvContent += 'Mã,Ngày,Loại,Danh mục,Thành viên,Mô tả,Số tiền (VNĐ),Ghi chú\r\n';

      transactions.forEach((t) => {
        const cat = categories.find((c) => c.id === t.categoryId)?.name || '';
        const mem = members.find((m) => m.id === t.memberId)?.name || '';
        const typeStr = t.type === 'income' ? 'Thu nhập' : 'Chi tiêu';
        const row = [
          t.id,
          t.date,
          typeStr,
          `"${cat.replace(/"/g, '""')}"`,
          `"${mem.replace(/"/g, '""')}"`,
          `"${(t.description || '').replace(/"/g, '""')}"`,
          t.amount,
          `"${(t.note || '').replace(/"/g, '""')}"`,
        ];
        csvContent += row.join(',') + '\r\n';
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bao_cao_tai_chinh_${Utils.getCurrentDate()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      Utils.showToast('Đã xuất file báo cáo CSV thành công!', 'success');
    },
  };

  // =========================================================================
  // 9. TRANG DANH MỤC (CATEGORIES PAGE)
  // =========================================================================
  const CategoriesPage = {
    render() {
      const categories = Store.getCategories();
      const transactions = Store.getTransactions();

      const incomeList = document.getElementById('incomeCategoryList');
      const expenseList = document.getElementById('expenseCategoryList');

      const incomeCats = categories.filter((c) => c.type === 'income');
      const expenseCats = categories.filter((c) => c.type === 'expense');

      const renderCatList = (cats, container, type) => {
        if (!container) return;
        if (cats.length === 0) {
          container.innerHTML = '<li class="p-3 text-muted">Chưa có danh mục nào</li>';
          return;
        }

        container.innerHTML = cats
          .map((c) => {
            const count = transactions.filter((t) => t.categoryId === c.id).length;
            return `
            <li class="category-item">
              <div class="category-item-info">
                <span class="category-icon" style="background:${c.color}20;color:${c.color};width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;">
                  <i class="fa-solid ${c.icon}"></i>
                </span>
                <div>
                  <div class="category-name" style="font-weight:600;">${Utils.escapeHtml(c.name)}</div>
                  <small class="text-muted">${count} giao dịch</small>
                </div>
              </div>
              <div class="category-item-actions">
                <button class="btn btn-outline btn-sm btn-edit-category" data-id="${c.id}" title="Sửa">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn btn-outline btn-sm text-danger btn-delete-category" data-id="${c.id}" data-type="category" title="Xóa">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </li>`;
          })
          .join('');
      };

      renderCatList(incomeCats, incomeList, 'income');
      renderCatList(expenseCats, expenseList, 'expense');
    },
  };

  // =========================================================================
  // 10. TRANG THÀNH VIÊN (MEMBERS PAGE)
  // =========================================================================
  const MembersPage = {
    render() {
      const members = Store.getMembers();
      const transactions = Store.getTransactions();
      const grid = document.getElementById('membersGrid');
      if (!grid) return;

      if (members.length === 0) {
        grid.innerHTML = '<div class="col-12 text-center py-5 text-muted">Chưa có thành viên nào</div>';
        return;
      }

      grid.innerHTML = members
        .map((m) => {
          const mTxns = transactions.filter((t) => t.memberId === m.id);
          const income = mTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
          const expense = mTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

          const initials = m.name
            .trim()
            .split(' ')
            .map((w) => w[0])
            .slice(-2)
            .join('')
            .toUpperCase();

          return `
          <div class="member-card" style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;">
            <div class="member-avatar" style="width:64px;height:64px;border-radius:50%;background:${m.color}20;color:${m.color};display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;margin-bottom:12px;">
              ${initials}
            </div>
            <h3 class="member-name" style="font-size:1.1rem;font-weight:700;margin-bottom:4px;">${Utils.escapeHtml(m.name)}</h3>
            <span class="member-role-badge" style="background:${m.color}20;color:${m.color};padding:3px 10px;border-radius:20px;font-size:0.8rem;font-weight:600;margin-bottom:16px;">
              ${Utils.escapeHtml(m.role)}
            </span>
            <div class="member-stats" style="display:flex;width:100%;justify-content:space-around;padding:12px 0;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;margin-bottom:16px;">
              <div class="member-stat">
                <div style="font-size:0.75rem;color:#64748b;">Thu nhập</div>
                <div style="font-weight:700;color:#10B981;font-size:0.95rem;">${Utils.formatCurrency(income)}</div>
              </div>
              <div class="member-stat">
                <div style="font-size:0.75rem;color:#64748b;">Chi tiêu</div>
                <div style="font-weight:700;color:#EF4444;font-size:0.95rem;">${Utils.formatCurrency(expense)}</div>
              </div>
            </div>
            <div class="member-actions" style="display:flex;gap:8px;">
              <button class="btn btn-outline btn-sm btn-edit-member" data-id="${m.id}">
                <i class="fa-solid fa-pen-to-square"></i> Sửa
              </button>
              <button class="btn btn-outline btn-sm text-danger btn-delete-member" data-id="${m.id}" data-type="member">
                <i class="fa-solid fa-trash"></i> Xóa
              </button>
            </div>
          </div>`;
        })
        .join('');
    },
  };

  // =========================================================================
  // 11. TRANG NGÂN SÁCH (BUDGET PAGE)
  // =========================================================================
  const BudgetPage = {
    render() {
      const monthSelect = document.getElementById('budgetMonth');
      const yearSelect = document.getElementById('budgetYear');

      const { month: curMonth, year: curYear } = Utils.getCurrentMonthYear();

      if (monthSelect && !monthSelect.value) monthSelect.value = curMonth;
      if (yearSelect && !yearSelect.value) yearSelect.value = curYear;

      const selectedMonth = monthSelect ? parseInt(monthSelect.value, 10) || curMonth : curMonth;
      const selectedYear = yearSelect ? parseInt(yearSelect.value, 10) || curYear : curYear;

      const budgets = Store.getBudgets().filter((b) => b.month === selectedMonth && b.year === selectedYear);
      const transactions = Store.getTransactions();
      const categories = Store.getCategories();

      // Chi tiêu trong tháng/năm này
      const monthExpenses = transactions.filter((t) => {
        if (t.type !== 'expense') return false;
        const d = new Date(t.date);
        return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedYear;
      });

      let totalBudget = 0;
      let totalSpent = 0;

      const listContainer = document.getElementById('budgetItemsList');

      if (!listContainer) return;

      if (budgets.length === 0) {
        listContainer.innerHTML = '<div class="p-4 text-center text-muted">Chưa có ngân sách nào được thiết lập cho tháng này. Bấm "+ Thêm ngân sách" để bắt đầu!</div>';
      } else {
        listContainer.innerHTML = budgets
          .map((b) => {
            const cat = categories.find((c) => c.id === b.categoryId);
            const spent = monthExpenses
              .filter((t) => t.categoryId === b.categoryId)
              .reduce((s, t) => s + t.amount, 0);

            const remaining = b.amount - spent;
            const percent = b.amount > 0 ? Math.min(100, Math.round((spent / b.amount) * 100)) : 0;

            totalBudget += b.amount;
            totalSpent += spent;

            let barColor = '#10B981'; // Xanh lá: An toàn
            let statusText = 'An toàn';
            if (percent >= 90) {
              barColor = '#EF4444'; // Đỏ: Cảnh báo vượt
              statusText = percent >= 100 ? 'Đã vượt ngân sách' : 'Sắp hết ngân sách';
            } else if (percent >= 70) {
              barColor = '#F59E0B'; // Cam: Chú ý
              statusText = 'Cần chú ý';
            }

            return `
            <div class="budget-item" style="background:#fff;border-radius:12px;padding:20px;border:1px solid #e2e8f0;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <span class="category-icon" style="background:${cat ? cat.color + '20' : '#f3f4f6'};color:${cat ? cat.color : '#6B7280'};width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;">
                    <i class="fa-solid ${cat ? cat.icon : 'fa-tag'}"></i>
                  </span>
                  <div>
                    <h4 style="margin:0;font-size:1.05rem;font-weight:700;">${Utils.escapeHtml(cat ? cat.name : 'Khác')}</h4>
                    <span style="font-size:0.8rem;color:${barColor};font-weight:600;">${statusText} (${percent}%)</span>
                  </div>
                </div>
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-outline btn-sm btn-edit-budget" data-id="${b.id}" title="Sửa">
                    <i class="fa-solid fa-pen-to-square"></i>
                  </button>
                  <button class="btn btn-outline btn-sm text-danger btn-delete-budget" data-id="${b.id}" data-type="budget" title="Xóa">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>

              <!-- Thanh tiến trình -->
              <div class="progress-bar-container" style="background:#e2e8f0;height:10px;border-radius:5px;overflow:hidden;margin-bottom:10px;">
                <div class="progress-bar" style="background:${barColor};width:${percent}%;height:100%;transition:width 0.4s ease;"></div>
              </div>

              <div style="display:flex;justify-content:space-between;font-size:0.9rem;">
                <span>Đã chi: <strong style="color:#EF4444">${Utils.formatCurrency(spent)}</strong> / <strong>${Utils.formatCurrency(b.amount)}</strong></span>
                <span style="font-weight:600;color:${remaining >= 0 ? '#10B981' : '#EF4444'}">
                  ${remaining >= 0 ? 'Còn lại: ' + Utils.formatCurrency(remaining) : 'Vượt: ' + Utils.formatCurrency(Math.abs(remaining))}
                </span>
              </div>
            </div>`;
          })
          .join('');
      }

      // Cập nhật 3 thẻ tóm tắt ngân sách
      const remainingTotal = totalBudget - totalSpent;
      const budgetTotalEl = document.getElementById('budgetTotal');
      const budgetSpentEl = document.getElementById('budgetSpent');
      const budgetRemainingEl = document.getElementById('budgetRemaining');

      if (budgetTotalEl) budgetTotalEl.textContent = Utils.formatCurrency(totalBudget);
      if (budgetSpentEl) budgetSpentEl.textContent = Utils.formatCurrency(totalSpent);
      if (budgetRemainingEl) {
        budgetRemainingEl.textContent = Utils.formatCurrency(remainingTotal);
        budgetRemainingEl.style.color = remainingTotal >= 0 ? '#10B981' : '#EF4444';
      }
    },
  };

  // =========================================================================
  // 12. ỨNG DỤNG CHÍNH (MAIN APPLICATION)
  // =========================================================================
  const App = {
    init() {
      // 1. Khởi tạo dữ liệu mẫu nếu chưa có
      Store.initDefaultData();

      // 2. Khởi tạo điều hướng
      Navigation.init();

      // 3. Khởi tạo cơ chế đóng modal
      Modal.initClose();

      // 4. Gắn các sự kiện toàn cục
      this._bindEvents();

      // 5. Hiển thị trang mặc định (Dashboard)
      this.renderPage('page-dashboard');
    },

    renderPage(pageId) {
      switch (pageId) {
        case 'page-dashboard':
          Dashboard.render();
          break;
        case 'page-income':
          TransactionPage.render('income');
          break;
        case 'page-expense':
          TransactionPage.render('expense');
          break;
        case 'page-reports':
          ReportsPage.render();
          break;
        case 'page-categories':
          CategoriesPage.render();
          break;
        case 'page-members':
          MembersPage.render();
          break;
        case 'page-budget':
          BudgetPage.render();
          break;
      }
    },

    _bindEvents() {
      // Gắn bộ định dạng số tiền phân tách hàng nghìn (dấu chấm) cho các ô nhập tiền
      Utils.attachCurrencyInputMask(document.getElementById('modalAmount'));
      Utils.attachCurrencyInputMask(document.getElementById('budgetAmount'));

      // Bấm nút nhanh trên Header (+ Thêm giao dịch)
      const btnAddTransaction = document.getElementById('btnAddTransaction');
      if (btnAddTransaction) {
        btnAddTransaction.addEventListener('click', () => {
          Modal.openTransactionModal('expense');
        });
      }

      // Các nút thêm trong trang
      const btnAddIncome = document.getElementById('btnAddIncome');
      if (btnAddIncome) {
        btnAddIncome.addEventListener('click', () => {
          Modal.openTransactionModal('income');
        });
      }

      const btnAddExpense = document.getElementById('btnAddExpense');
      if (btnAddExpense) {
        btnAddExpense.addEventListener('click', () => {
          Modal.openTransactionModal('expense');
        });
      }

      const btnAddIncomeCat = document.getElementById('btnAddIncomeCategory');
      if (btnAddIncomeCat) {
        btnAddIncomeCat.addEventListener('click', () => {
          Modal.openCategoryModal('income');
        });
      }

      const btnAddExpenseCat = document.getElementById('btnAddExpenseCategory');
      if (btnAddExpenseCat) {
        btnAddExpenseCat.addEventListener('click', () => {
          Modal.openCategoryModal('expense');
        });
      }

      const btnAddMember = document.getElementById('btnAddMember');
      if (btnAddMember) {
        btnAddMember.addEventListener('click', () => {
          Modal.openMemberModal();
        });
      }

      const btnAddBudget = document.getElementById('btnAddBudget');
      if (btnAddBudget) {
        btnAddBudget.addEventListener('click', () => {
          Modal.openBudgetModal();
        });
      }

      // Nút xuất báo cáo Excel (CSV)
      const btnExportCSV = document.getElementById('btnExportCSV');
      if (btnExportCSV) {
        btnExportCSV.addEventListener('click', () => {
          ReportsPage.exportCSV();
        });
      }

      // Nút xác nhận xóa trong Modal Xóa
      const btnConfirmDelete = document.getElementById('btnConfirmDelete');
      if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', () => {
          Modal.handleDeleteConfirm();
        });
      }

      // Nút chuyển liên kết & xóa trong Modal Xóa
      const btnTransferAndDelete = document.getElementById('btnTransferAndDelete');
      if (btnTransferAndDelete) {
        btnTransferAndDelete.addEventListener('click', () => {
          Modal.handleTransferAndDelete();
        });
      }

      // Xử lý Icon Selector trong Category Modal
      const iconSelector = document.getElementById('iconSelector');
      if (iconSelector) {
        iconSelector.addEventListener('click', (e) => {
          const btn = e.target.closest('.icon-option');
          if (!btn) return;
          iconSelector.querySelectorAll('.icon-option').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          const hiddenInput = document.getElementById('categoryIcon');
          if (hiddenInput) hiddenInput.value = btn.dataset.icon;
        });
      }

      // Bắt sự kiện nộp form (Forms submit)
      const txnForm = document.getElementById('transactionForm');
      if (txnForm) {
        txnForm.addEventListener('submit', (e) => {
          e.preventDefault();
          Modal.handleTransactionSubmit();
        });
      }

      const catForm = document.getElementById('categoryForm');
      if (catForm) {
        catForm.addEventListener('submit', (e) => {
          e.preventDefault();
          Modal.handleCategorySubmit();
        });
      }

      const memForm = document.getElementById('memberForm');
      if (memForm) {
        memForm.addEventListener('submit', (e) => {
          e.preventDefault();
          Modal.handleMemberSubmit();
        });
      }

      const budForm = document.getElementById('budgetForm');
      if (budForm) {
        budForm.addEventListener('submit', (e) => {
          e.preventDefault();
          Modal.handleBudgetSubmit();
        });
      }

      // Event Delegation cho các nút sửa / xóa trong bảng và danh sách
      document.body.addEventListener('click', (e) => {
        // 1. Sửa giao dịch
        const editTxnBtn = e.target.closest('.btn-edit-txn');
        if (editTxnBtn) {
          const id = editTxnBtn.dataset.id;
          const type = editTxnBtn.dataset.type;
          const txn = Store.getTransactions().find((t) => t.id === id);
          if (txn) Modal.openTransactionModal(type, txn);
          return;
        }

        // 2. Xóa giao dịch
        const delTxnBtn = e.target.closest('.btn-delete-txn');
        if (delTxnBtn) {
          const id = delTxnBtn.dataset.id;
          Modal.openDeleteModal('transaction', id);
          return;
        }

        // 3. Sửa danh mục
        const editCatBtn = e.target.closest('.btn-edit-category');
        if (editCatBtn) {
          const id = editCatBtn.dataset.id;
          const cat = Store.getCategories().find((c) => c.id === id);
          if (cat) Modal.openCategoryModal(cat.type, cat);
          return;
        }

        // 4. Xóa danh mục
        const delCatBtn = e.target.closest('.btn-delete-category');
        if (delCatBtn) {
          const id = delCatBtn.dataset.id;
          Modal.openDeleteModal('category', id);
          return;
        }

        // 5. Sửa thành viên
        const editMemBtn = e.target.closest('.btn-edit-member');
        if (editMemBtn) {
          const id = editMemBtn.dataset.id;
          const mem = Store.getMembers().find((m) => m.id === id);
          if (mem) Modal.openMemberModal(mem);
          return;
        }

        // 6. Xóa thành viên
        const delMemBtn = e.target.closest('.btn-delete-member');
        if (delMemBtn) {
          const id = delMemBtn.dataset.id;
          Modal.openDeleteModal('member', id);
          return;
        }

        // 7. Sửa ngân sách
        const editBudBtn = e.target.closest('.btn-edit-budget');
        if (editBudBtn) {
          const id = editBudBtn.dataset.id;
          const bud = Store.getBudgets().find((b) => b.id === id);
          if (bud) Modal.openBudgetModal(bud);
          return;
        }

        // 8. Xóa ngân sách
        const delBudBtn = e.target.closest('.btn-delete-budget');
        if (delBudBtn) {
          const id = delBudBtn.dataset.id;
          Modal.openDeleteModal('budget', id);
          return;
        }

        // 9. Nút xem tất cả giao dịch từ Dashboard & Link chuyển trang nhanh
        const pageLink = e.target.closest('[data-page]');
        if (pageLink && !pageLink.classList.contains('nav-link')) {
          e.preventDefault();
          const targetPage = pageLink.getAttribute('data-page');
          if (targetPage) {
            Navigation.goTo(targetPage);
            return;
          }
        }

        const viewAllLink = e.target.closest('.view-all-link');
        if (viewAllLink) {
          e.preventDefault();
          Navigation.goTo('page-expense');
          return;
        }
      });

      // Bộ lọc trong trang Thu nhập & Chi tiêu
      ['income', 'expense'].forEach((type) => {
        const fromInput = document.getElementById(`${type}FromDate`);
        const toInput = document.getElementById(`${type}ToDate`);
        const catFilter = document.getElementById(`${type}CategoryFilter`);
        const memFilter = document.getElementById(`${type}MemberFilter`);
        const searchInput = document.getElementById(`${type}Search`);

        const triggerFilter = () => {
          TransactionPage.state[type].page = 1;
          TransactionPage.render(type);
        };

        if (fromInput) fromInput.addEventListener('change', triggerFilter);
        if (toInput) toInput.addEventListener('change', triggerFilter);
        if (catFilter) catFilter.addEventListener('change', triggerFilter);
        if (memFilter) memFilter.addEventListener('change', triggerFilter);
        if (searchInput) searchInput.addEventListener('input', Utils.debounce(triggerFilter, 300));
      });

      // Bộ lọc trong trang Báo cáo
      const rMonth = document.getElementById('reportMonth');
      const rYear = document.getElementById('reportYear');
      const rType = document.getElementById('reportType');

      if (rMonth) rMonth.addEventListener('change', () => ReportsPage.render());
      if (rYear) rYear.addEventListener('change', () => ReportsPage.render());
      if (rType) rType.addEventListener('change', () => ReportsPage.render());

      // Bộ lọc trong trang Ngân sách
      const bMonth = document.getElementById('budgetMonth');
      const bYear = document.getElementById('budgetYear');

      if (bMonth) bMonth.addEventListener('change', () => BudgetPage.render());
      if (bYear) bYear.addEventListener('change', () => BudgetPage.render());
    },
  };

  // =========================================================================
  // KHỞI ĐỘNG ỨNG DỤNG
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
})();
