// src/components/NotificationModal.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";

const API_BASE = "https://tuna-project.onrender.com/api";

export const NotificationModal = ({ isOpen, onClose, onNavigate }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const myUserId = useMemo(() => {
    return localStorage.getItem("tuna_user_id") || "B2300001";
  }, []);

  // Nạp danh sách thông báo từ API & lọc bỏ các tin đã xóa
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/student/notifications?userId=${encodeURIComponent(myUserId)}`);
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        const readIds = JSON.parse(localStorage.getItem("read_notification_ids") || "[]");
        const deletedIds = JSON.parse(localStorage.getItem("deleted_notification_ids") || "[]");

        // Loại bỏ các thông báo đã bị xóa
        const activeList = json.data
          .filter((item) => !deletedIds.includes(item.id))
          .map((item) => ({
            ...item,
            isRead: item.isRead || readIds.includes(item.id),
          }));

        setNotifications(activeList);
      } else {
        setNotifications([]);
      }
    } catch (err) {
      console.error("Lỗi nạp thông báo:", err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [myUserId]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Click vào thông báo để chuyển hướng
  const handleItemClick = (noti) => {
    const readIds = JSON.parse(localStorage.getItem("read_notification_ids") || "[]");
    if (!readIds.includes(noti.id)) {
      readIds.push(noti.id);
      localStorage.setItem("read_notification_ids", JSON.stringify(readIds));
    }

    setNotifications((prev) =>
      prev.map((item) => (item.id === noti.id ? { ...item, isRead: true } : item))
    );
    onClose();

    if (onNavigate && noti.targetTab) {
      onNavigate(noti.targetTab);
    }
  };

  // Đánh dấu tất cả là đã đọc
  const handleMarkAllRead = () => {
    const allIds = notifications.map((n) => n.id);
    localStorage.setItem("read_notification_ids", JSON.stringify(allIds));
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
  };

  // Xóa 1 thông báo
  const handleDeleteItem = (e, notiId) => {
    e.stopPropagation();
    const deletedIds = JSON.parse(localStorage.getItem("deleted_notification_ids") || "[]");
    if (!deletedIds.includes(notiId)) {
      deletedIds.push(notiId);
      localStorage.setItem("deleted_notification_ids", JSON.stringify(deletedIds));
    }
    setNotifications((prev) => prev.filter((item) => item.id !== notiId));
  };

  // Xóa toàn bộ thông báo
  const handleClearAll = () => {
    if (notifications.length === 0) return;
    if (!window.confirm("Bạn có chắc chắn muốn xóa toàn bộ thông báo?")) return;

    const currentIds = notifications.map((n) => n.id);
    const deletedIds = JSON.parse(localStorage.getItem("deleted_notification_ids") || "[]");
    const merged = Array.from(new Set([...deletedIds, ...currentIds]));

    localStorage.setItem("deleted_notification_ids", JSON.stringify(merged));
    setNotifications([]);
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (!isOpen) return null;

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 bg-black/60 d-flex align-items-center justify-content-center p-3 z-50 animate-fade-in"
      onClick={onClose}
      style={{ backdropFilter: "blur(4px)" }}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="p-3.5 bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <i className="bi bi-bell-fill text-sm"></i>
            </div>
            <div>
              <h6 className="mb-0 font-black text-sm leading-tight">Trung Tâm Thông Báo</h6>
              <span className="text-[10.5px] text-blue-100 font-medium">
                {unreadCount > 0 ? `${unreadCount} tin chưa đọc` : "Đã cập nhật"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={fetchNotifications}
              className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 text-white border-0 flex items-center justify-center cursor-pointer transition active:scale-90"
              title="Làm mới"
            >
              <i className={`bi bi-arrow-clockwise text-xs ${loading ? "animate-spin" : ""}`}></i>
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 text-white border-0 flex items-center justify-center cursor-pointer transition active:scale-90"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Thanh công cụ: Đọc tất cả & Xóa tất cả (Đã bỏ toàn bộ thanh lọc tab rườm rà) */}
        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-bold text-[11px]">
            Danh sách ({notifications.length})
          </span>

          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-blue-600 font-extrabold bg-transparent border-0 cursor-pointer hover:underline text-[11px] p-0"
              >
                Đọc tất cả
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-rose-600 hover:text-rose-700 font-extrabold bg-transparent border-0 cursor-pointer hover:underline text-[11px] p-0 flex items-center gap-1"
                title="Xóa sạch danh sách"
              >
                <i className="bi bi-trash3 text-xs"></i> Xóa tất cả
              </button>
            )}
          </div>
        </div>

        {/* Danh sách thông báo gọn gàng có nút xóa từng mục */}
        <div className="p-2.5 space-y-2 overflow-y-auto flex-1 no-scrollbar">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-xs font-bold">
              <div className="spinner-border spinner-border-sm text-blue-600 mb-2"></div>
              <p className="m-0">Đang tải thông báo...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-14 text-slate-400">
              <i className="bi bi-bell-slash text-3xl mb-1.5 block opacity-40"></i>
              <p className="text-xs font-bold m-0">Không có thông báo nào</p>
              <span className="text-[10.5px] opacity-75">Hộp thư thông báo của bạn đang trống</span>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={`p-3 rounded-2xl border transition cursor-pointer flex gap-2.5 items-start relative group ${
                  !item.isRead
                    ? "bg-blue-50/70 border-blue-200 shadow-2xs"
                    : "bg-white border-slate-200/80 opacity-85 hover:opacity-100 hover:bg-slate-50"
                }`}
              >
                {/* Icon loại thông báo */}
                <div
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center text-base shrink-0 border ${
                    item.icon || "bi-bell text-blue-600 bg-blue-50 border-blue-200"
                  }`}
                >
                  <i className="bi bi-bell"></i>
                </div>

                {/* Nội dung thông báo */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <h5
                      className={`text-xs m-0 truncate ${
                        !item.isRead ? "font-black text-slate-900" : "font-bold text-slate-700"
                      }`}
                    >
                      {item.title}
                    </h5>
                    <span className="text-[10px] text-slate-400 font-semibold shrink-0 ml-1">
                      {item.time}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 m-0 leading-relaxed font-medium line-clamp-2">
                    {item.desc}
                  </p>
                </div>

                {/* Nút xóa từng tin nhắn (thùng rác) */}
                <button
                  type="button"
                  onClick={(e) => handleDeleteItem(e, item.id)}
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center border-0 cursor-pointer shrink-0 transition active:scale-90"
                  title="Xóa thông báo này"
                >
                  <i className="bi bi-x text-sm leading-none font-bold"></i>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationModal;