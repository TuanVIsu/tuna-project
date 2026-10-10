// src/admin/ManageCommunity.jsx
import React, { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

const REASON_TEMPLATES = [
  "Spam nội dung liên tục gây loãng nhóm thảo luận",
  "Sử dụng ngôn từ thiếu văn hóa, xúc phạm thành viên khác",
  "Chia sẻ liên kết ngoài, mã độc hại hoặc quảng cáo trái phép",
  "Gian lận học vụ, phát tán đáp án bài tập hoặc thi cử",
  "Mạo danh cán bộ đào tạo hoặc ban cán sự lớp",
];

export const ManageCommunity = () => {
  const [categories, setCategories] = useState([
    { id: "all", label: "Tất cả", color: "bg-secondary-subtle text-secondary" }
  ]);

  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({ total: 0, with_image: 0, ai_replies: 0, total_locked: 0, total_warned: 0 });
  const [loading, setLoading] = useState(false);

  // Bộ lọc
  const [filterCat, setFilterCat] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterPenalty, setFilterPenalty] = useState("all");

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  // Modals
  const [previewImg, setPreviewImg] = useState(null);
  const [penaltyModal, setPenaltyModal] = useState({
    isOpen: false,
    targetMessage: null,
    actionType: "lock_1h",
    reason: REASON_TEMPLATES[0],
    customReason: "",
    isSubmitting: false,
  });

  const getHeaders = () => {
    const token = localStorage.getItem("admin_token") || localStorage.getItem("token") || "";
    return { 
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/community/categories`, { headers: getHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.categories)) {
          setCategories(json.categories);
        }
      }
    } catch (e) {
      console.error("Lỗi nạp categories:", e);
    }
  };

  const fetchMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        category: filterCat,
        search: searchTerm,
      });

      if (filterType === "image_only") params.append("hasImage", "true");
      if (filterType === "ai_only") params.append("isAi", "true");
      if (filterType === "user_only") params.append("isAi", "false");
      if (filterPenalty !== "all") params.append("penaltyStatus", filterPenalty);

      const res = await fetch(`${API_BASE}/admin/community/messages?${params.toString()}`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (e) {
      console.error("Lỗi tải tin nhắn:", e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchMessages();
    setSelectedIds([]);
    setCurrentPage(1);
  }, [filterCat, filterType, filterPenalty]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMessages();
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleDelete = async (msgId) => {
    if (!window.confirm("Xác nhận xóa tin nhắn này?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/community/messages/${msgId}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
        setSelectedIds((prev) => prev.filter((id) => id !== msgId));
      } else {
        alert(data.message);
      }
    } catch (e) {
      alert("Lỗi khi xóa tin nhắn");
    }
  };

  const handleOpenPenalty = (msg) => {
    const defaultAction = msg.is_currently_locked ? "unlock" : "lock_1h";
    setPenaltyModal({
      isOpen: true,
      targetMessage: msg,
      actionType: defaultAction,
      reason: REASON_TEMPLATES[0],
      customReason: "",
      isSubmitting: false,
    });
  };

  const handleQuickUnlock = async (userId, userName) => {
    if (!window.confirm(`MỞ KHÓA & GỠ CẢNH BÁO cho sinh viên: ${userName}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/community/user/unlock`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ userId, userName, reason: "Admin gỡ phạt mở khóa" }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ ${data.message}`);
        fetchMessages(true);
      } else {
        alert("Lỗi: " + data.message);
      }
    } catch (e) {
      alert("Lỗi mở khóa: " + e.message);
    }
  };

  const handleConfirmPenalty = async (e) => {
    e.preventDefault();
    const { targetMessage, actionType, reason, customReason } = penaltyModal;
    if (!targetMessage) return;

    const finalReason = customReason.trim() ? customReason.trim() : reason;
    const userId = targetMessage.user_id;
    const userName = targetMessage.user_name;

    setPenaltyModal((prev) => ({ ...prev, isSubmitting: true }));

    try {
      if (actionType === "unlock") {
        const res = await fetch(`${API_BASE}/admin/community/user/unlock`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ userId, userName, reason: finalReason || "Admin gỡ phạt" }),
        });
        const data = await res.json();
        if (data.success) {
          alert(`✅ Đã mở khóa thành công cho ${userName}!`);
          setPenaltyModal((prev) => ({ ...prev, isOpen: false }));
          fetchMessages(true);
        } else {
          alert("Lỗi: " + data.message);
        }
      } else if (actionType === "warn") {
        const res = await fetch(`${API_BASE}/admin/community/user/warn`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ userId, userName, reason: finalReason }),
        });
        const data = await res.json();
        if (data.success) {
          alert(`⚠️ Đã gửi cảnh báo tới sinh viên: ${userName}!`);
          setPenaltyModal((prev) => ({ ...prev, isOpen: false }));
          fetchMessages(true);
        } else {
          alert("Lỗi: " + data.message);
        }
      } else {
        const durationMap = {
          lock_1h: "1h",
          lock_24h: "24h",
          lock_permanent: "permanent",
        };
        const duration = durationMap[actionType];

        const res = await fetch(`${API_BASE}/admin/community/user/lock`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ userId, userName, duration, reason: finalReason }),
        });
        const data = await res.json();
        if (data.success) {
          alert(`🔒 ${data.message}`);
          setPenaltyModal((prev) => ({ ...prev, isOpen: false }));
          fetchMessages(true);
        } else {
          alert("Lỗi: " + data.message);
        }
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ: " + err.message);
    } finally {
      setPenaltyModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const toggleSelectAllCurrentPage = () => {
    const currentItemIds = currentItems.map((m) => m.id);
    const allSelected = currentItemIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(selectedIds.filter((id) => !currentItemIds.includes(id)));
    } else {
      setSelectedIds([...new Set([...selectedIds, ...currentItemIds])]);
    }
  };

  const toggleSelectOne = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Xác nhận xóa ${selectedIds.length} tin nhắn đã chọn?`)) return;

    setIsDeletingBulk(true);
    try {
      const res = await fetch(`${API_BASE}/admin/community/messages/bulk-delete`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ ids: selectedIds }),
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ " + data.message);
        setSelectedIds([]);
        fetchMessages();
      }
    } catch (err) {
      alert("Lỗi máy chủ khi xóa");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const totalPages = Math.ceil(messages.length / itemsPerPage) || 1;
  const currentItems = messages.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflowX: "hidden",
        padding: "16px 20px 32px 20px",
      }}
      className="d-flex flex-column gap-3"
    >
      {/* 1. Header Toolbar Tối Giản, Gọn Gàng */}
      <div className="card border rounded-4 bg-white shadow-xs p-3 w-100" style={{ borderColor: "#e2e8f0" }}>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2.5">
          <div className="d-flex align-items-center gap-3">
            <span
              className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0"
              style={{
                width: "40px",
                height: "40px",
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              }}
            >
              <i className="bi bi-chat-square-quote-fill fs-5"></i>
            </span>
            <div>
              <div className="d-flex align-items-center gap-2">
                <h6 className="fw-bold text-dark mb-0 fs-6">
                  Kiểm Duyệt Thảo Luận & Xử Phạt Vi Phạm
                </h6>
                <span
                  className="badge rounded-pill px-2 py-0.5 fw-semibold font-monospace"
                  style={{ backgroundColor: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", fontSize: "10px" }}
                >
                  Realtime
                </span>
              </div>
              <small className="text-secondary" style={{ fontSize: "11.5px" }}>
                Giám sát tin nhắn & khóa tài khoản vi phạm
              </small>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="d-flex align-items-center gap-2">
            <div className="px-2.5 py-1 rounded-3 bg-light border text-center" style={{ borderColor: "#e2e8f0", minWidth: "65px" }}>
              <span className="text-secondary text-uppercase fw-bold d-block" style={{ fontSize: "8.5px" }}>Tổng Tin</span>
              <b className="text-dark font-monospace" style={{ fontSize: "12.5px" }}>{stats.total.toLocaleString()}</b>
            </div>

            <div
              onClick={() => setFilterPenalty(filterPenalty === "locked" ? "all" : "locked")}
              className={`px-2.5 py-1 rounded-3 border text-center cursor-pointer transition ${
                filterPenalty === "locked" ? "bg-danger text-white border-danger shadow-xs" : "bg-danger-subtle text-danger border-danger-subtle"
              }`}
              style={{ minWidth: "75px" }}
              title="Bấm để lọc tin nhắn của người ĐANG BỊ KHÓA"
            >
              <span className="text-uppercase fw-bold d-block" style={{ fontSize: "8.5px" }}>Đang Khóa</span>
              <b className="font-monospace" style={{ fontSize: "12.5px" }}>🔒 {stats.total_locked || 0}</b>
            </div>

            <div
              onClick={() => setFilterPenalty(filterPenalty === "warned" ? "all" : "warned")}
              className={`px-2.5 py-1 rounded-3 border text-center cursor-pointer transition ${
                filterPenalty === "warned" ? "bg-warning text-dark border-warning shadow-xs" : "bg-warning-subtle text-warning-emphasis border-warning-subtle"
              }`}
              style={{ minWidth: "75px" }}
              title="Bấm để lọc tin nhắn của người CÓ CẢNH BÁO"
            >
              <span className="text-uppercase fw-bold d-block" style={{ fontSize: "8.5px" }}>Cảnh Báo</span>
              <b className="font-monospace" style={{ fontSize: "12.5px" }}>⚠️ {stats.total_warned || 0}</b>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Thanh Lọc Đa Chiều Thu Nhỏ Chiều Cao */}
      <div className="card border rounded-4 p-2.5 bg-white shadow-xs" style={{ borderColor: "#e2e8f0" }}>
        <div className="row g-2 align-items-center m-0">
          <div className="col-12 col-md-4 p-1">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0 text-muted ps-2.5">
                <i className="bi bi-search"></i>
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm nội dung, sinh viên..."
                className="form-control bg-light border-start-0 fw-semibold shadow-none"
                style={{ fontSize: "12px", borderColor: "#cbd5e1" }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="input-group-text bg-light border-start-0 text-muted pe-2.5"
                >
                  <i className="bi bi-x-circle-fill"></i>
                </button>
              )}
            </div>
          </div>

          <div className="col-6 col-md-3 p-1">
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light shadow-none"
              style={{ fontSize: "12px", borderColor: "#cbd5e1" }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="col-6 col-md-2 p-1">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light shadow-none"
              style={{ fontSize: "12px", borderColor: "#cbd5e1" }}
            >
              <option value="all">Tất cả bài viết</option>
              <option value="image_only">Có ảnh</option>
              <option value="user_only">Sinh viên</option>
              <option value="ai_only">AI bot</option>
            </select>
          </div>

          <div className="col-12 col-md-3 p-1">
            <div className="btn-group btn-group-sm w-100" role="group">
              <button
                type="button"
                onClick={() => setFilterPenalty("all")}
                className={`btn fw-bold border ${filterPenalty === "all" ? "btn-primary text-white" : "btn-light text-secondary"}`}
                style={{ fontSize: "11px" }}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => setFilterPenalty("locked")}
                className={`btn fw-bold border ${filterPenalty === "locked" ? "btn-danger text-white" : "btn-light text-danger"}`}
                style={{ fontSize: "11px" }}
              >
                🔒 Khóa
              </button>
              <button
                type="button"
                onClick={() => setFilterPenalty("warned")}
                className={`btn fw-bold border ${filterPenalty === "warned" ? "btn-warning text-dark" : "btn-light text-warning-emphasis"}`}
                style={{ fontSize: "11px" }}
              >
                ⚠️ Báo
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bảng Dữ Liệu: Gọn gàng, VỪA KHÍT 100% MÀN HÌNH KHÔNG TRÀN THANH CUỘN */}
      <div className="card border rounded-4 bg-white shadow-xs overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
        <div className="px-3.5 py-2.5 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div className="d-flex align-items-center gap-2">
            <span className="fw-bold text-dark fs-6">
              Tin Nhắn ({messages.length})
            </span>
            {filterPenalty !== "all" && (
              <span className={`badge rounded-pill px-2.5 py-0.5 fw-bold ${filterPenalty === "locked" ? "bg-danger text-white" : "bg-warning text-dark"}`} style={{ fontSize: "10px" }}>
                {filterPenalty === "locked" ? "Đang lọc: Bị khóa" : "Đang lọc: Có cảnh báo"}
              </span>
            )}
            {selectedIds.length > 0 && (
              <span className="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-0.5 fw-bold" style={{ fontSize: "10.5px" }}>
                Đã chọn {selectedIds.length}
              </span>
            )}
          </div>

          <div className="d-flex align-items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                type="button"
                disabled={isDeletingBulk}
                onClick={handleBulkDelete}
                className="btn btn-sm btn-danger rounded-pill px-3 py-1 fw-bold shadow-xs border-0 text-white"
                style={{ fontSize: "11.5px" }}
              >
                <i className="bi bi-trash3-fill me-1"></i>
                {isDeletingBulk ? "Đang xóa..." : `Xóa ${selectedIds.length} tin`}
              </button>
            )}

            <button
              onClick={() => fetchMessages()}
              className="btn btn-sm btn-light border rounded-pill px-3 py-1 fw-semibold text-secondary shadow-none d-inline-flex align-items-center gap-1"
              style={{ fontSize: "11.5px", borderColor: "#e2e8f0" }}
            >
              <i className="bi bi-arrow-clockwise"></i> Làm mới
            </button>
          </div>
        </div>

        {/* Khung Bảng Fix Tỷ Lệ Cột: Không bao giờ xuất hiện thanh cuộn ngang */}
        <div className="w-100" style={{ overflowX: "hidden" }}>
          <table className="table table-hover align-middle mb-0 w-100" style={{ fontSize: "12px", tableLayout: "fixed" }}>
            <thead className="table-light text-secondary border-bottom">
              <tr style={{ fontSize: "10.5px", letterSpacing: "0.5px" }} className="text-uppercase">
                <th style={{ width: "38px" }} className="text-center ps-2">
                  <input
                    type="checkbox"
                    className="form-check-input cursor-pointer shadow-none m-0"
                    checked={
                      currentItems.length > 0 &&
                      currentItems.every((m) => selectedIds.includes(m.id))
                    }
                    onChange={toggleSelectAllCurrentPage}
                  />
                </th>
                <th style={{ width: "21%" }}>Người Gửi</th>
                <th style={{ width: "15%" }}>Chuyên Mục</th>
                <th style={{ width: "28%" }}>Nội Dung</th>
                <th style={{ width: "16%" }} className="text-center">Trạng Thái Vi Phạm</th>
                <th style={{ width: "6%" }} className="text-center">Ảnh</th>
                <th style={{ width: "14%" }} className="text-end pe-3">Hành Động</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-muted">
                    <span className="spinner-border spinner-border-sm me-2 text-primary"></span>
                    Đang nạp dữ liệu kiểm duyệt...
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-muted">
                    <i className="bi bi-chat-square-dots fs-3 d-block text-secondary opacity-50 mb-1"></i>
                    Không tìm thấy tin nhắn nào.
                  </td>
                </tr>
              ) : (
                currentItems.map((m) => {
                  const isChecked = selectedIds.includes(m.id);
                  const catInfo = categories.find((c) => c.id === m.category || c.id === (m.category || '').toLowerCase()) || {
                    label: m.category ? m.category.toUpperCase() : "Chung",
                    color: "bg-light text-secondary",
                  };

                  const warningCount = Number(m.warning_count || 0);
                  const isLocked = m.is_currently_locked;

                  // TÔ ĐỎ / VÀNG HÀNG
                  let rowBg = "inherit";
                  let borderMarker = "none";
                  if (isLocked) {
                    rowBg = "#fef2f2";
                    borderMarker = "4px solid #ef4444";
                  } else if (warningCount > 0) {
                    rowBg = "#fffbeb";
                    borderMarker = "4px solid #f59e0b";
                  }

                  return (
                    <tr
                      key={m.id}
                      className={isChecked ? "table-active" : ""}
                      style={{ backgroundColor: rowBg, borderLeft: borderMarker }}
                    >
                      <td className="text-center ps-2">
                        <input
                          type="checkbox"
                          className="form-check-input cursor-pointer shadow-none m-0"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(m.id)}
                        />
                      </td>

                      {/* Người gửi */}
                      <td className="text-truncate">
                        <div className="d-flex align-items-center gap-2 overflow-hidden">
                          <div className="position-relative flex-shrink-0">
                            <img
                              src={
                                m.avatar ||
                                `https://ui-avatars.com/api/?name=${encodeURIComponent(m.user_name || "SV")}&background=0284c7&color=fff`
                              }
                              alt="avatar"
                              className="rounded-circle border"
                              style={{ width: "30px", height: "30px", objectFit: "cover" }}
                              onError={(e) => {
                                e.target.src = "https://ui-avatars.com/api/?name=User&background=cbd5e1&color=64748b";
                              }}
                            />
                            {isLocked && (
                              <span
                                className="position-absolute bottom-0 end-0 rounded-circle bg-danger text-white d-flex align-items-center justify-content-center"
                                style={{ width: "11px", height: "11px", fontSize: "7px" }}
                              >
                                <i className="bi bi-lock-fill"></i>
                              </span>
                            )}
                          </div>
                          <div className="overflow-hidden" style={{ minWidth: 0 }}>
                            <span className="fw-bold text-dark text-truncate d-block" style={{ fontSize: "12px" }} title={m.user_name}>
                              {m.user_name}
                            </span>
                            <small className="text-muted font-monospace d-block" style={{ fontSize: "10px" }}>
                              {m.user_id ? String(m.user_id).slice(0, 10) : "Khách"}
                            </small>
                          </div>
                        </div>
                      </td>

                      {/* Chuyên mục */}
<td className="text-truncate">
  <span 
    className={`badge rounded-pill px-2.5 py-1 text-truncate d-inline-block ${catInfo.color}`} 
    style={{ fontSize: "11px", color: "#0f172a", border: "1px solid #cbd5e1", backgroundColor: "#ffffff" }}
  >
    {catInfo.label}
  </span>
</td>

                      {/* Nội dung tin nhắn */}
                      <td>
                        <div
                          className="mb-0 text-dark fw-normal text-truncate"
                          style={{ fontSize: "12px" }}
                          title={m.content}
                        >
                          {m.content || <i className="text-muted small">Không có chữ</i>}
                        </div>
                        <small className="text-muted font-monospace d-block" style={{ fontSize: "9.5px" }}>
                          {m.createdAt || m.time || "Vừa gửi"}
                        </small>
                      </td>

                      {/* Cột trạng thái vi phạm */}
                      <td className="text-center">
                        {isLocked ? (
                          <div>
                            <span
                              className="badge rounded-pill bg-danger text-white px-2 py-0.5 fw-bold d-inline-flex align-items-center gap-1 shadow-xs"
                              style={{ fontSize: "9.5px" }}
                              title={`Lý do: ${m.lock_reason || 'Vi phạm nội quy'}`}
                            >
                              <i className="bi bi-lock-fill"></i> Bị Khóa
                            </span>
                            <small className="text-danger d-block mt-0.5 font-monospace fw-bold" style={{ fontSize: "9px" }}>
                              {m.lock_until_formatted ? m.lock_until_formatted.split(" ")[0] : "Vĩnh viễn"}
                            </small>
                          </div>
                        ) : warningCount > 0 ? (
                          <span
                            className="badge rounded-pill bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-0.5 fw-bold"
                            style={{ fontSize: "9.5px" }}
                            title={`Đã nhận ${warningCount} lần cảnh báo`}
                          >
                            ⚠️ Cảnh báo ({warningCount})
                          </span>
                        ) : (
                          <span className="badge rounded-pill bg-light text-muted border px-2 py-0.5" style={{ fontSize: "9.5px" }}>
                            Bình thường
                          </span>
                        )}
                      </td>

                      {/* Ảnh */}
                      <td className="text-center">
                        {m.image_url ? (
                          <img
                            src={m.image_url}
                            alt="Ảnh"
                            onClick={() => setPreviewImg(m.image_url)}
                            className="rounded-2 border cursor-pointer"
                            style={{ width: "28px", height: "28px", objectFit: "cover" }}
                            title="Xem ảnh"
                          />
                        ) : (
                          <span className="text-muted" style={{ fontSize: "10px" }}>—</span>
                        )}
                      </td>

                      {/* HÀNH ĐỘNG GỌN GÀNG VÀO CÙNG 1 HÀNG */}
                      <td className="text-end pe-3">
                        <div className="d-inline-flex align-items-center gap-1.5">
                          {!m.is_ai && (
                            <>
                              {isLocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleQuickUnlock(m.user_id, m.user_name)}
                                  className="btn btn-sm btn-success rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-none"
                                  style={{ width: "26px", height: "26px" }}
                                  title="Mở khóa tài khoản ngay lập tức"
                                >
                                  <i className="bi bi-unlock-fill" style={{ fontSize: "11px" }}></i>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPenalty(m)}
                                  className="btn btn-sm btn-light border rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-none"
                                  style={{ width: "26px", height: "26px", borderColor: "#fde68a", backgroundColor: "#fffbeb" }}
                                  title="Xử lý vi phạm (Cảnh báo / Khóa)"
                                >
                                  <i className="bi bi-shield-slash-fill" style={{ fontSize: "11px", color: "#d97706" }}></i>
                                </button>
                              )}
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDelete(m.id)}
                            className="btn btn-sm btn-light border rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-none"
                            style={{ width: "26px", height: "26px", borderColor: "#fecaca", backgroundColor: "#fef2f2" }}
                            title="Xóa tin nhắn này"
                          >
                            <i className="bi bi-trash3-fill" style={{ fontSize: "11px", color: "#dc2626" }}></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 4. Phân Trang Gọn */}
        {!loading && messages.length > 0 && (
          <div className="d-flex flex-wrap justify-content-between align-items-center px-3 py-2 border-top bg-white gap-2">
            <div className="d-flex align-items-center gap-1.5 small text-muted" style={{ fontSize: "11px" }}>
              <span>Xem</span>
              <select
                className="form-select form-select-sm py-0 rounded-2 fw-semibold text-center"
                style={{ width: "55px", borderColor: "#cbd5e1", fontSize: "11px" }}
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
              <span>/ <b>{messages.length}</b> tin</span>
            </div>

            <div className="d-flex align-items-center gap-1 ms-auto">
              <button
                className="btn btn-sm btn-light border px-2 py-0.5 rounded-2 shadow-none"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
              >
                <i className="bi bi-chevron-double-left" style={{ fontSize: "10px" }}></i>
              </button>
              <button
                className="btn btn-sm btn-light border px-2 py-0.5 rounded-2 shadow-none"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              >
                <i className="bi bi-chevron-left" style={{ fontSize: "10px" }}></i>
              </button>

              <span className="small fw-bold px-2 text-secondary" style={{ fontSize: "11px" }}>
                {currentPage} / {totalPages}
              </span>

              <button
                className="btn btn-sm btn-light border px-2 py-0.5 rounded-2 shadow-none"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              >
                <i className="bi bi-chevron-right" style={{ fontSize: "10px" }}></i>
              </button>
              <button
                className="btn btn-sm btn-light border px-2 py-0.5 rounded-2 shadow-none"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
              >
                <i className="bi bi-chevron-double-right" style={{ fontSize: "10px" }}></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. MODAL XỬ PHẠT & MỞ KHÓA */}
{/* 5. MODAL XỬ PHẠT & MỞ KHÓA (CĂN CHỈNH THỤT LỀ THOÁNG MẮT, KHÔNG SÁT VIỀN) */}
      {penaltyModal.isOpen && penaltyModal.targetMessage && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.65)", zIndex: 1100, backdropFilter: "blur(4px)" }}
          onClick={() => setPenaltyModal((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            className="card border-0 rounded-4 shadow-xl bg-white overflow-hidden"
            style={{ width: "100%", maxWidth: "540px" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 py-3.5 bg-white border-bottom d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2.5">
                <span
                  className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{
                    width: "34px",
                    height: "34px",
                    backgroundColor: penaltyModal.targetMessage.is_currently_locked ? "#ecfdf5" : "#fef2f2",
                    color: penaltyModal.targetMessage.is_currently_locked ? "#059669" : "#dc2626",
                  }}
                >
                  <i
                    className={`bi ${
                      penaltyModal.targetMessage.is_currently_locked
                        ? "bi-unlock-fill"
                        : "bi-exclamation-triangle-fill"
                    }`}
                    style={{ fontSize: "15px" }}
                  ></i>
                </span>
                <h6 className="fw-bold text-dark mb-0 fs-6">
                  {penaltyModal.targetMessage.is_currently_locked
                    ? "Quản Lý Lệnh Phạt & Mở Khóa"
                    : "Xử Lý Vi Phạm & Khóa Tài Khoản"}
                </h6>
              </div>
              <button
                type="button"
                onClick={() => setPenaltyModal((prev) => ({ ...prev, isOpen: false }))}
                className="btn-close shadow-none"
                style={{ fontSize: "12px" }}
              ></button>
            </div>

            {/* Modal Body - Padding 24px đều 4 cạnh, tạo khoảng thở thoáng đãng */}
            <form onSubmit={handleConfirmPenalty} className="d-flex flex-column gap-3.5" style={{ padding: "22px 26px" }}>
              {/* Box thông tin đối tượng */}
              <div
                className="rounded-3 border d-flex align-items-center justify-content-between"
                style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0", padding: "14px 16px" }}
              >
                <div>
                  <small className="text-secondary d-block" style={{ fontSize: "11px" }}>Đối tượng vi phạm:</small>
                  <span className="fw-bold text-dark fs-6 d-block mt-0.5">{penaltyModal.targetMessage.user_name}</span>
                  <small className="text-muted font-monospace d-block mt-0.5" style={{ fontSize: "11px" }}>
                    Mã TK: {penaltyModal.targetMessage.user_id}
                  </small>
                </div>
                <div className="text-end">
                  <span className="badge bg-secondary-subtle text-secondary border px-2.5 py-1">Sinh viên</span>
                  {penaltyModal.targetMessage.is_currently_locked ? (
                    <small className="d-block text-danger fw-bold mt-1" style={{ fontSize: "11px" }}>
                      🔒 Đang trong thời gian khóa
                    </small>
                  ) : Number(penaltyModal.targetMessage.warning_count || 0) > 0 ? (
                    <small className="d-block text-warning-emphasis fw-bold mt-1" style={{ fontSize: "11px" }}>
                      ⚠️ Đã có {penaltyModal.targetMessage.warning_count} cảnh báo
                    </small>
                  ) : null}
                </div>
              </div>

              {/* Tin nhắn vi phạm trích xuất */}
              <div>
                <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                  Tin Nhắn Vi Phạm Trích Xuất:
                </label>
                <div
                  className="rounded-3 border text-secondary fst-italic text-truncate"
                  style={{
                    backgroundColor: "#ffffff",
                    borderColor: "#cbd5e1",
                    fontSize: "12.5px",
                    padding: "10px 14px",
                  }}
                >
                  "{penaltyModal.targetMessage.content || "[Hình ảnh đính kèm]"}"
                </div>
              </div>

              {/* Hình thức áp dụng */}
              <div>
                <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                  Hình Thức Áp Dụng *
                </label>
                <div className="d-flex flex-column gap-2">
                  {/* Tùy chọn Gỡ Phạt */}
                  <div
                    onClick={() => setPenaltyModal((prev) => ({ ...prev, actionType: "unlock" }))}
                    className="rounded-3 border d-flex align-items-center gap-2.5 cursor-pointer transition"
                    style={{
                      padding: "11px 14px",
                      backgroundColor: penaltyModal.actionType === "unlock" ? "#ecfdf5" : "#ffffff",
                      borderColor: penaltyModal.actionType === "unlock" ? "#a7f3d0" : "#e2e8f0",
                      boxShadow: penaltyModal.actionType === "unlock" ? "0 2px 8px rgba(16, 185, 129, 0.15)" : "none",
                    }}
                  >
                    <input
                      type="radio"
                      name="penaltyAction"
                      checked={penaltyModal.actionType === "unlock"}
                      onChange={() => {}}
                      className="form-check-input m-0 cursor-pointer flex-shrink-0"
                    />
                    <div>
                      <span className="fw-bold d-block text-success" style={{ fontSize: "12.5px" }}>
                        ✓ Gỡ Lệnh Phạt & Mở Khóa Tài Khoản
                      </span>
                      <small className="text-secondary d-block mt-0.5" style={{ fontSize: "11px" }}>
                        Khôi phục ngay quyền nhắn tin, đăng bài và xóa cảnh báo vi phạm
                      </small>
                    </div>
                  </div>

                  {/* Lưới 4 tùy chọn hình thức phạt */}
                  <div className="row g-2 m-0">
                    {[
                      { id: "warn", label: "Cảnh Báo", desc: "Gửi nhắc nhở vi phạm", bg: "#fffbeb", border: "#fde68a" },
                      { id: "lock_1h", label: "Khóa 1 Giờ", desc: "Tạm đình chỉ 60 phút", bg: "#eff6ff", border: "#bfdbfe" },
                      { id: "lock_24h", label: "Khóa 24 Giờ", desc: "Cấm chat 1 ngày", bg: "#fef2f2", border: "#fecaca" },
                      { id: "lock_permanent", label: "Khóa Vĩnh Viễn", desc: "Đình chỉ vĩnh viễn", bg: "#fdf2f8", border: "#fbcfe8" },
                    ].map((act) => (
                      <div key={act.id} className="col-6 p-1">
                        <div
                          onClick={() => setPenaltyModal((prev) => ({ ...prev, actionType: act.id }))}
                          className="rounded-3 border h-100 d-flex align-items-center gap-2 cursor-pointer transition"
                          style={{
                            padding: "10px 12px",
                            backgroundColor: penaltyModal.actionType === act.id ? act.bg : "#ffffff",
                            borderColor: penaltyModal.actionType === act.id ? act.border : "#e2e8f0",
                          }}
                        >
                          <input
                            type="radio"
                            name="penaltyAction"
                            checked={penaltyModal.actionType === act.id}
                            onChange={() => {}}
                            className="form-check-input m-0 cursor-pointer flex-shrink-0"
                          />
                          <div className="overflow-hidden">
                            <span className="fw-bold d-block text-dark" style={{ fontSize: "12.5px" }}>{act.label}</span>
                            <small className="text-secondary d-block mt-0.5" style={{ fontSize: "10.5px" }}>{act.desc}</small>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mẫu lý do */}
              <div>
                <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                  Lý Do (Chọn mẫu có sẵn) *
                </label>
                <select
                  value={penaltyModal.reason}
                  onChange={(e) => setPenaltyModal((prev) => ({ ...prev, reason: e.target.value }))}
                  className="form-select fw-semibold rounded-3 bg-light shadow-none"
                  style={{ fontSize: "12.5px", borderColor: "#cbd5e1", padding: "9px 12px" }}
                >
                  {penaltyModal.actionType === "unlock" ? (
                    <option value="Admin xem xét gỡ phạt khôi phục quyền cho sinh viên">
                      Admin xem xét gỡ phạt khôi phục quyền cho sinh viên
                    </option>
                  ) : (
                    REASON_TEMPLATES.map((tmpl, idx) => (
                      <option key={idx} value={tmpl}>
                        {tmpl}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Ghi chú thêm */}
              <div>
                <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                  Ghi Chú Thêm (Tùy chọn):
                </label>
                <textarea
                  rows="2"
                  value={penaltyModal.customReason}
                  onChange={(e) => setPenaltyModal((prev) => ({ ...prev, customReason: e.target.value }))}
                  placeholder="Nhập bổ sung lý do cụ thể..."
                  className="form-control rounded-3 shadow-none"
                  style={{ fontSize: "12.5px", borderColor: "#cbd5e1", padding: "10px 12px" }}
                ></textarea>
              </div>

              {/* Nút hành động Footer */}
              <div className="d-flex justify-content-end align-items-center gap-2.5 pt-3 border-top mt-1">
                <button
                  type="button"
                  onClick={() => setPenaltyModal((prev) => ({ ...prev, isOpen: false }))}
                  className="btn btn-sm btn-light rounded-pill px-4 py-2 fw-semibold border shadow-none"
                  style={{ fontSize: "13px", borderColor: "#e2e8f0" }}
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={penaltyModal.isSubmitting}
                  className={`btn btn-sm rounded-pill px-4 py-2 fw-bold text-white border-0 shadow-xs ${
                    penaltyModal.actionType === "unlock"
                      ? "btn-success"
                      : penaltyModal.actionType === "warn"
                      ? "btn-warning"
                      : "btn-danger"
                  }`}
                  style={{ fontSize: "13px" }}
                >
                  {penaltyModal.isSubmitting ? (
                    <span><span className="spinner-border spinner-border-sm me-1"></span> Đang xử lý...</span>
                  ) : penaltyModal.actionType === "unlock" ? (
                    "Xác Nhận Mở Khóa"
                  ) : penaltyModal.actionType === "warn" ? (
                    "Gửi Cảnh Báo"
                  ) : (
                    "Xác Nhận Khóa"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 6. Modal Xem Ảnh Phóng To */}
      {previewImg && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.8)", zIndex: 1200 }}
          onClick={() => setPreviewImg(null)}
        >
          <div
            className="position-relative bg-white rounded-4 p-2 shadow-lg"
            style={{ maxWidth: "90vw", maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImg(null)}
              className="btn btn-sm btn-dark rounded-circle position-absolute top-0 end-0 m-2 shadow"
              style={{ width: "30px", height: "30px" }}
            >
              <i className="bi bi-x-lg"></i>
            </button>
            <img
              src={previewImg}
              alt="Ảnh phóng to"
              className="rounded-3 img-fluid d-block"
              style={{ maxHeight: "80vh", objectFit: "contain" }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageCommunity;