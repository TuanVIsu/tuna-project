// src/admin/ManageCommunity.jsx
import React, { useState, useEffect, useCallback } from "react";

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
    { id: "all", label: "Tất cả chuyên mục", color: "bg-secondary-subtle text-secondary" }
  ]);

  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({ total: 0, with_image: 0, ai_replies: 0, total_locked: 0, total_warned: 0 });
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

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
  const [viewingMsgDetail, setViewingMsgDetail] = useState(null);
  const [penaltyModal, setPenaltyModal] = useState({
    isOpen: false,
    targetMessage: null,
    actionType: "lock_1h",
    reason: REASON_TEMPLATES[0],
    customReason: "",
    alsoDeleteMessage: true,
    isSubmitting: false,
  });

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem("admin_token") || localStorage.getItem("token") || "";
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, []);

  // Helper tự động fallback nếu route được mount ở /community thay vì /admin/community
  const safeFetchCommunity = useCallback(async (endpoint, options = {}) => {
    let res = await fetch(`${API_BASE}/admin/community${endpoint}`, {
      ...options,
      headers: getHeaders(),
    });
    if (res.status === 404) {
      res = await fetch(`${API_BASE}/community${endpoint}`, {
        ...options,
        headers: getHeaders(),
      });
    }
    return await res.json();
  }, [getHeaders]);

  const fetchCategories = useCallback(async () => {
    try {
      const json = await safeFetchCommunity(`/categories`);
      if (json.success && Array.isArray(json.categories)) {
        setCategories(json.categories);
      }
    } catch (e) {
      console.error("Lỗi nạp categories:", e);
    }
  }, [safeFetchCommunity]);

  const fetchMessages = useCallback(async (silent = false) => {
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

      const data = await safeFetchCommunity(`/messages?${params.toString()}`);
      if (data.success) {
        setMessages(data.messages || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (e) {
      console.error("Lỗi tải tin nhắn:", e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filterCat, searchTerm, filterType, filterPenalty, safeFetchCommunity]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMessages();
      setSelectedIds([]);
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [filterCat, filterType, filterPenalty, searchTerm, fetchMessages]);

  // Tự động đồng bộ mỗi 10 giây khi bật Live Sync
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchMessages(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMessages]);

  const handleDelete = async (msgId) => {
    if (!window.confirm("Xác nhận xóa vĩnh viễn tin nhắn này khỏi phòng thảo luận?")) return;
    try {
      const data = await safeFetchCommunity(`/messages/${msgId}`, { method: "DELETE" });
      if (data.success) {
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
        setSelectedIds((prev) => prev.filter((id) => id !== msgId));
        setStats((prev) => ({ ...prev, total: Math.max(0, (prev.total || 1) - 1) }));
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
      alsoDeleteMessage: !msg.is_currently_locked,
      isSubmitting: false,
    });
  };

  const handleQuickUnlock = async (userId, userName) => {
    if (!window.confirm(`MỞ KHÓA & GỠ CẢNH BÁO cho sinh viên: ${userName}?`)) return;
    try {
      const data = await safeFetchCommunity(`/user/unlock`, {
        method: "POST",
        body: JSON.stringify({ userId, userName, reason: "Admin gỡ phạt mở khóa nhanh" }),
      });
      if (data.success) {
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
    const { targetMessage, actionType, reason, customReason, alsoDeleteMessage } = penaltyModal;
    if (!targetMessage) return;

    const finalReason = customReason.trim() ? customReason.trim() : reason;
    const userId = targetMessage.user_id;
    const userName = targetMessage.user_name;
    const deleteMessageId = alsoDeleteMessage && actionType !== "unlock" ? targetMessage.id : null;

    setPenaltyModal((prev) => ({ ...prev, isSubmitting: true }));

    try {
      if (actionType === "unlock") {
        const data = await safeFetchCommunity(`/user/unlock`, {
          method: "POST",
          body: JSON.stringify({ userId, userName, reason: finalReason || "Admin gỡ phạt" }),
        });
        if (data.success) {
          setPenaltyModal((prev) => ({ ...prev, isOpen: false }));
          fetchMessages(true);
        } else {
          alert("Lỗi: " + data.message);
        }
      } else if (actionType === "warn") {
        const data = await safeFetchCommunity(`/user/warn`, {
          method: "POST",
          body: JSON.stringify({ userId, userName, reason: finalReason, deleteMessageId }),
        });
        if (data.success) {
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

        const data = await safeFetchCommunity(`/user/lock`, {
          method: "POST",
          body: JSON.stringify({ userId, userName, duration, reason: finalReason, deleteMessageId }),
        });
        if (data.success) {
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

  const totalPages = Math.ceil(messages.length / itemsPerPage) || 1;
  const currentItems = messages.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
    if (!window.confirm(`Xác nhận xóa vĩnh viễn ${selectedIds.length} tin nhắn đã chọn?`)) return;

    setIsDeletingBulk(true);
    try {
      const data = await safeFetchCommunity(`/messages/bulk-delete`, {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (data.success) {
        setSelectedIds([]);
        fetchMessages();
      }
    } catch (err) {
      alert("Lỗi máy chủ khi xóa hàng loạt");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-3 w-100 pb-5" style={{ color: "#1e293b" }}>
      {/* 1. HEADER & THỐNG KÊ TRỰC QUAN */}
      <div className="bg-white border rounded-4 p-3.5 shadow-2xs" style={{ borderColor: "#e2e8f0" }}>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <div
              className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0 shadow-xs"
              style={{
                width: "42px",
                height: "42px",
                background: "linear-gradient(135deg, #185bf0 0%, #0284c7 100%)",
              }}
            >
              <i className="bi bi-shield-check fs-5"></i>
            </div>
            <div>
              <div className="d-flex align-items-center gap-2">
                <h6 className="fw-bold text-dark mb-0 fs-6">
                  Kiểm Duyệt Thảo Luận & Kỷ Luật Cộng Đồng
                </h6>
                <button
                  type="button"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`badge rounded-pill px-2.5 py-1 fw-bold border cursor-pointer d-inline-flex align-items-center gap-1 ${
                    autoRefresh ? "bg-success-subtle text-success border-success-subtle" : "bg-light text-secondary"
                  }`}
                  style={{ fontSize: "10px", cursor: "pointer" }}
                  title="Bật/Tắt tự động làm mới mỗi 10 giây"
                >
                  <span
                    className="rounded-circle d-inline-block"
                    style={{
                      width: "6px",
                      height: "6px",
                      backgroundColor: autoRefresh ? "#10b981" : "#94a3b8",
                    }}
                  ></span>
                  {autoRefresh ? "Live Sync: BẬT" : "Live Sync: TẮT"}
                </button>
              </div>
              <small className="text-secondary fw-medium" style={{ fontSize: "12px" }}>
                Giám sát tin nhắn theo chuyên ngành, xử lý spam và quản lý trạng thái khóa tài khoản
              </small>
            </div>
          </div>

          {/* Khối 4 Thẻ Chỉ Số Nhanh */}
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div
              onClick={() => { setFilterPenalty("all"); setFilterType("all"); }}
              className="px-3 py-1.5 rounded-3 bg-light border text-center cursor-pointer"
              style={{ borderColor: "#e2e8f0", minWidth: "82px", cursor: "pointer" }}
            >
              <span className="text-secondary text-uppercase fw-bold d-block" style={{ fontSize: "9px" }}>Tổng Tin</span>
              <b className="text-dark font-monospace" style={{ fontSize: "13.5px" }}>{(stats.total || 0).toLocaleString()}</b>
            </div>

            <div
              onClick={() => setFilterType(filterType === "image_only" ? "all" : "image_only")}
              className={`px-3 py-1.5 rounded-3 border text-center cursor-pointer transition ${
                filterType === "image_only" ? "bg-primary text-white border-primary" : "bg-primary-subtle text-primary border-primary-subtle"
              }`}
              style={{ minWidth: "82px", cursor: "pointer" }}
            >
              <span className="text-uppercase fw-bold d-block" style={{ fontSize: "9px" }}>Đính Ảnh</span>
              <b className="font-monospace" style={{ fontSize: "13.5px" }}>{stats.with_image || 0}</b>
            </div>

            <div
              onClick={() => setFilterPenalty(filterPenalty === "locked" ? "all" : "locked")}
              className={`px-3 py-1.5 rounded-3 border text-center cursor-pointer transition ${
                filterPenalty === "locked" ? "bg-danger text-white border-danger shadow-xs" : "bg-danger-subtle text-danger border-danger-subtle"
              }`}
              style={{ minWidth: "88px", cursor: "pointer" }}
              title="Bấm để lọc danh sách tài khoản đang bị khóa"
            >
              <span className="text-uppercase fw-bold d-block" style={{ fontSize: "9px" }}>Đang Khóa</span>
              <b className="font-monospace" style={{ fontSize: "13.5px" }}>🔒 {stats.total_locked || 0}</b>
            </div>

            <div
              onClick={() => setFilterPenalty(filterPenalty === "warned" ? "all" : "warned")}
              className={`px-3 py-1.5 rounded-3 border text-center cursor-pointer transition ${
                filterPenalty === "warned" ? "bg-warning text-dark border-warning shadow-xs" : "bg-warning-subtle text-warning-emphasis border-warning-subtle"
              }`}
              style={{ minWidth: "88px", cursor: "pointer" }}
              title="Bấm để lọc danh sách sinh viên đang bị cảnh báo"
            >
              <span className="text-uppercase fw-bold d-block" style={{ fontSize: "9px" }}>Cảnh Báo</span>
              <b className="font-monospace" style={{ fontSize: "13.5px" }}>⚠️ {stats.total_warned || 0}</b>
            </div>
          </div>
        </div>
      </div>

      {/* 2. THANH BỘ LỌC ĐA CHIỀU */}
      <div className="bg-white border rounded-4 p-3 shadow-2xs" style={{ borderColor: "#e2e8f0" }}>
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-4">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0 text-muted ps-2.5">
                <i className="bi bi-search"></i>
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm nội dung tin nhắn, tên SV, MSSV, lớp..."
                className="form-control bg-light border-start-0 fw-semibold shadow-none"
                style={{ fontSize: "12px" }}
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

          <div className="col-6 col-md-3">
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light shadow-none"
              style={{ fontSize: "12px" }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="col-6 col-md-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light shadow-none"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Mọi loại tin</option>
              <option value="image_only">Chỉ tin có ảnh</option>
              <option value="user_only">Tin từ Sinh viên</option>
              <option value="ai_only">Phản hồi từ AI</option>
            </select>
          </div>

          <div className="col-12 col-md-3">
            <div className="p-0.5 bg-light rounded-3 border d-flex gap-1">
              {[
                { id: "all", label: "Tất cả", activeClass: "bg-white text-dark shadow-2xs" },
                { id: "locked", label: "🔒 Bị khóa", activeClass: "bg-danger text-white shadow-2xs" },
                { id: "warned", label: "⚠️ Cảnh báo", activeClass: "bg-warning text-dark shadow-2xs" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterPenalty(tab.id)}
                  className={`btn btn-sm flex-fill rounded-2 py-1 fw-bold border-0 transition ${
                    filterPenalty === tab.id ? tab.activeClass : "text-secondary bg-transparent"
                  }`}
                  style={{ fontSize: "11px" }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. BẢNG DỮ LIỆU TIN NHẮN */}
      <div className="bg-white border rounded-4 shadow-2xs overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
        <div className="px-3.5 py-2.5 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2 bg-white">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="fw-bold text-dark" style={{ fontSize: "13.5px" }}>
              Danh sách tin nhắn ({messages.length})
            </span>
            {filterPenalty !== "all" && (
              <span className={`badge rounded-pill px-2.5 py-1 fw-bold ${filterPenalty === "locked" ? "bg-danger text-white" : "bg-warning text-dark"}`} style={{ fontSize: "10.5px" }}>
                {filterPenalty === "locked" ? "Bộ lọc: Tài khoản đang bị khóa" : "Bộ lọc: Tài khoản có cảnh báo"}
              </span>
            )}
            {selectedIds.length > 0 && (
              <span className="badge rounded-pill bg-danger-subtle text-danger border border-danger-subtle px-2.5 py-1 fw-bold" style={{ fontSize: "10.5px" }}>
                Đã chọn {selectedIds.length} mục
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
                {isDeletingBulk ? "Đang xóa..." : `Xóa ${selectedIds.length} tin đã chọn`}
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchMessages()}
              className="btn btn-sm btn-light border rounded-pill px-3 py-1 fw-semibold text-secondary shadow-none d-inline-flex align-items-center gap-1"
              style={{ fontSize: "11.5px" }}
            >
              <i className="bi bi-arrow-clockwise"></i> Làm mới
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 w-100" style={{ fontSize: "12.5px", tableLayout: "fixed", minWidth: "860px" }}>
            <thead className="table-light text-secondary border-bottom">
              <tr style={{ fontSize: "10.5px", letterSpacing: "0.5px" }} className="text-uppercase">
                <th style={{ width: "42px" }} className="text-center ps-2">
                  <input
                    type="checkbox"
                    className="form-check-input cursor-pointer shadow-none m-0"
                    checked={currentItems.length > 0 && currentItems.every((m) => selectedIds.includes(m.id))}
                    onChange={toggleSelectAllCurrentPage}
                  />
                </th>
                <th style={{ width: "22%" }}>Sinh Viên Gửi</th>
                <th style={{ width: "14%" }}>Chuyên Mục</th>
                <th style={{ width: "32%" }}>Nội Dung Thảo Luận</th>
                <th style={{ width: "14%" }} className="text-center">Kỷ Luật</th>
                <th style={{ width: "6%" }} className="text-center">Ảnh</th>
                <th style={{ width: "12%" }} className="text-end pe-3">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-5 text-muted">
                    <span className="spinner-border spinner-border-sm me-2 text-primary"></span>
                    Đang tải dữ liệu thảo luận...
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-5 text-muted">
                    <i className="bi bi-chat-square-dots fs-2 d-block text-secondary opacity-50 mb-1"></i>
                    Không có tin nhắn nào khớp với tiêu chí lọc hiện tại.
                  </td>
                </tr>
              ) : (
                currentItems.map((m) => {
                  const isChecked = selectedIds.includes(m.id);
                  const catInfo = categories.find((c) => c.id === m.category || c.id === (m.category || "").toLowerCase()) || {
                    label: m.category ? m.category.toUpperCase() : "CHUNG",
                    color: "bg-light text-secondary border",
                  };

                  const warningCount = Number(m.warning_count || 0);
                  const isLocked = Boolean(m.is_currently_locked);

                  let rowBg = "inherit";
                  let borderMarker = "3px solid transparent";
                  if (isLocked) {
                    rowBg = "#fef2f2";
                    borderMarker = "3px solid #ef4444";
                  } else if (warningCount > 0) {
                    rowBg = "#fffbeb";
                    borderMarker = "3px solid #f59e0b";
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

                      {/* Sinh viên gửi */}
                      <td>
                        <div className="d-flex align-items-center gap-2.5 overflow-hidden">
                          <div className="position-relative flex-shrink-0">
                            <img
                              src={
                                m.avatar ||
                                `https://ui-avatars.com/api/?name=${encodeURIComponent(m.user_name || "SV")}&background=185bf0&color=fff`
                              }
                              alt="avatar"
                              className="rounded-circle border"
                              style={{ width: "34px", height: "34px", objectFit: "cover" }}
                              onError={(e) => {
                                e.target.src = "https://ui-avatars.com/api/?name=SV&background=cbd5e1&color=64748b";
                              }}
                            />
                            {isLocked && (
                              <span
                                className="position-absolute bottom-0 end-0 rounded-circle bg-danger text-white d-flex align-items-center justify-content-center border border-white"
                                style={{ width: "13px", height: "13px", fontSize: "7px" }}
                              >
                                <i className="bi bi-lock-fill"></i>
                              </span>
                            )}
                          </div>
                          <div className="overflow-hidden" style={{ minWidth: 0 }}>
                            <div className="d-flex align-items-center gap-1">
                              <span className="fw-bold text-dark text-truncate d-block" style={{ fontSize: "12.5px" }} title={m.user_name}>
                                {m.user_name}
                              </span>
                              {m.is_ai && (
                                <span className="badge bg-primary-subtle text-primary px-1.5 py-0" style={{ fontSize: "9px" }}>AI</span>
                              )}
                            </div>
                            <div className="d-flex align-items-center gap-1.5 text-muted font-monospace" style={{ fontSize: "10.5px" }}>
                              <span>{m.student_code || `ID:#${m.user_id || "—"}`}</span>
                              {m.class_name && <span>• {m.class_name}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Chuyên mục */}
                      <td className="text-truncate">
                        <span
                          className={`badge rounded-pill px-2.5 py-1 fw-semibold text-truncate d-inline-block ${catInfo.color}`}
                          style={{ fontSize: "10.5px", maxWidth: "100%" }}
                        >
                          {catInfo.label}
                        </span>
                      </td>

                      {/* Nội dung thảo luận (Hỗ trợ 2 dòng + Xem chi tiết) */}
                      <td>
                        <div
                          onClick={() => setViewingMsgDetail(m)}
                          className="cursor-pointer"
                          style={{ cursor: "pointer" }}
                          title="Bấm để xem toàn bộ nội dung"
                        >
                          {m.is_recalled ? (
                            <span className="fst-italic text-secondary" style={{ fontSize: "12px" }}>
                              <i className="bi bi-arrow-counterclockwise me-1"></i>
                              {m.content}
                            </span>
                          ) : (
                            <div
                              className="text-dark fw-normal"
                              style={{
                                fontSize: "12.5px",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                lineHeight: "1.4",
                              }}
                            >
                              {m.content || <i className="text-muted small">[Chỉ đính kèm hình ảnh]</i>}
                            </div>
                          )}
                          <small className="text-muted font-monospace d-block mt-0.5" style={{ fontSize: "10px" }}>
                            {m.createdAt || m.time || "Vừa gửi"}
                          </small>
                        </div>
                      </td>

                      {/* Trạng thái kỷ luật */}
                      <td className="text-center">
                        {isLocked ? (
                          <div>
                            <span
                              className="badge rounded-pill bg-danger text-white px-2.5 py-1 fw-bold d-inline-flex align-items-center gap-1"
                              style={{ fontSize: "10px" }}
                              title={`Lý do: ${m.lock_reason || "Vi phạm nội quy"}`}
                            >
                              <i className="bi bi-lock-fill"></i> Đang Khóa
                            </span>
                            <small className="text-danger d-block mt-0.5 font-monospace fw-bold" style={{ fontSize: "9.5px" }}>
                              {m.lock_until_formatted ? `Đến ${m.lock_until_formatted}` : "Vĩnh viễn"}
                            </small>
                          </div>
                        ) : warningCount > 0 ? (
                          <span
                            className="badge rounded-pill bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2.5 py-1 fw-bold"
                            style={{ fontSize: "10px" }}
                            title={m.warning_reason ? `Lý do gần nhất: ${m.warning_reason}` : ""}
                          >
                            ⚠️ Cảnh báo ({warningCount})
                          </span>
                        ) : (
                          <span className="badge rounded-pill bg-light text-secondary border px-2 py-0.5" style={{ fontSize: "10px" }}>
                            Tốt
                          </span>
                        )}
                      </td>

                      {/* Ảnh đính kèm */}
                      <td className="text-center">
                        {m.image_url ? (
                          <img
                            src={m.image_url}
                            alt="Đính kèm"
                            onClick={() => setPreviewImg(m.image_url)}
                            className="rounded-2 border cursor-pointer shadow-2xs"
                            style={{ width: "32px", height: "32px", objectFit: "cover", cursor: "pointer" }}
                            title="Bấm để phóng to ảnh"
                          />
                        ) : (
                          <span className="text-muted" style={{ fontSize: "11px" }}>—</span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="text-end pe-3">
                        <div className="d-inline-flex align-items-center gap-1.5">
                          {!m.is_ai && (
                            <>
                              {isLocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleQuickUnlock(m.user_id, m.user_name)}
                                  className="btn btn-sm btn-success rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-none"
                                  style={{ width: "28px", height: "28px" }}
                                  title="Mở khóa tài khoản ngay"
                                >
                                  <i className="bi bi-unlock-fill" style={{ fontSize: "11.5px" }}></i>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPenalty(m)}
                                  className="btn btn-sm btn-light border rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-none"
                                  style={{ width: "28px", height: "28px", borderColor: "#fde68a", backgroundColor: "#fffbeb" }}
                                  title="Cảnh báo hoặc Khóa tài khoản"
                                >
                                  <i className="bi bi-shield-exclamation" style={{ fontSize: "12px", color: "#d97706" }}></i>
                                </button>
                              )}
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDelete(m.id)}
                            className="btn btn-sm btn-light border rounded-circle p-0 d-inline-flex align-items-center justify-content-center shadow-none"
                            style={{ width: "28px", height: "28px", borderColor: "#fecaca", backgroundColor: "#fef2f2" }}
                            title="Xóa tin nhắn"
                          >
                            <i className="bi bi-trash3-fill" style={{ fontSize: "11.5px", color: "#dc2626" }}></i>
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

        {/* 4. PHÂN TRANG */}
        {!loading && messages.length > 0 && (
          <div className="d-flex flex-wrap justify-content-between align-items-center px-3.5 py-2.5 border-top bg-white gap-2">
            <div className="d-flex align-items-center gap-2 small text-muted" style={{ fontSize: "11.5px" }}>
              <span>Hiển thị</span>
              <select
                className="form-select form-select-sm py-0.5 rounded-2 fw-semibold text-center shadow-none"
                style={{ width: "62px", fontSize: "11.5px" }}
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
              <span>trên tổng số <b>{messages.length}</b> tin nhắn</span>
            </div>

            <div className="d-flex align-items-center gap-1 ms-auto">
              <button
                className="btn btn-sm btn-light border px-2 py-0.5 rounded-2 shadow-none"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
              >
                <i className="bi bi-chevron-double-left" style={{ fontSize: "11px" }}></i>
              </button>
              <button
                className="btn btn-sm btn-light border px-2 py-0.5 rounded-2 shadow-none"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              >
                <i className="bi bi-chevron-left" style={{ fontSize: "11px" }}></i>
              </button>

              <span className="small fw-bold px-2.5 text-secondary" style={{ fontSize: "12px" }}>
                Trang {currentPage} / {totalPages}
              </span>

              <button
                className="btn btn-sm btn-light border px-2 py-0.5 rounded-2 shadow-none"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              >
                <i className="bi bi-chevron-right" style={{ fontSize: "11px" }}></i>
              </button>
              <button
                className="btn btn-sm btn-light border px-2 py-0.5 rounded-2 shadow-none"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
              >
                <i className="bi bi-chevron-double-right" style={{ fontSize: "11px" }}></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. MODAL XỬ PHẠT & MỞ KHÓA */}
      {penaltyModal.isOpen && penaltyModal.targetMessage && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.6)", zIndex: 1100 }}
          onClick={() => setPenaltyModal((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            className="card border-0 rounded-4 shadow-lg bg-white overflow-hidden"
            style={{ width: "100%", maxWidth: "520px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-white border-bottom d-flex align-items-center justify-content-between">
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
                  <i className={`bi ${penaltyModal.targetMessage.is_currently_locked ? "bi-unlock-fill" : "bi-shield-exclamation"}`}></i>
                </span>
                <h6 className="fw-bold text-dark mb-0 fs-6">
                  {penaltyModal.targetMessage.is_currently_locked
                    ? "Gỡ Phạt & Mở Khóa Tài Khoản"
                    : "Xử Lý Vi Phạm Cộng Đồng"}
                </h6>
              </div>
              <button
                type="button"
                onClick={() => setPenaltyModal((prev) => ({ ...prev, isOpen: false }))}
                className="btn-close shadow-none"
              ></button>
            </div>

            <form onSubmit={handleConfirmPenalty} className="p-4 d-flex flex-column gap-3">
              {/* Thông tin sinh viên */}
              <div className="p-3 rounded-3 bg-light border d-flex align-items-center justify-content-between">
                <div>
                  <span className="fw-bold text-dark d-block" style={{ fontSize: "14px" }}>
                    {penaltyModal.targetMessage.user_name}
                  </span>
                  <small className="text-secondary font-monospace">
                    {penaltyModal.targetMessage.student_code || `User ID: #${penaltyModal.targetMessage.user_id}`}
                    {penaltyModal.targetMessage.class_name ? ` • Lớp ${penaltyModal.targetMessage.class_name}` : ""}
                  </small>
                </div>
                <div className="text-end">
                  {penaltyModal.targetMessage.is_currently_locked ? (
                    <span className="badge bg-danger text-white">🔒 Đang bị khóa</span>
                  ) : Number(penaltyModal.targetMessage.warning_count || 0) > 0 ? (
                    <span className="badge bg-warning text-dark">⚠️ {penaltyModal.targetMessage.warning_count} Cảnh báo</span>
                  ) : (
                    <span className="badge bg-secondary-subtle text-secondary">Chưa có tiền sử</span>
                  )}
                </div>
              </div>

              {/* Nội dung tin nhắn */}
              <div>
                <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10.5px" }}>
                  Bằng chứng tin nhắn:
                </label>
                <div className="p-2.5 rounded-3 border bg-white text-secondary fst-italic" style={{ fontSize: "12.5px", maxHeight: "80px", overflowY: "auto" }}>
                  "{penaltyModal.targetMessage.content || "[Hình ảnh đính kèm]"}"
                </div>
              </div>

              {/* Chọn mức xử lý */}
              <div>
                <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "10.5px" }}>
                  Hình thức xử lý *
                </label>
                <div className="row g-2">
                  {[
                    { id: "warn", label: "⚠️ Cảnh Báo", desc: "Nhắc nhở trên màn hình SV" },
                    { id: "lock_1h", label: "🔒 Khóa 1 Giờ", desc: "Tạm cấm chat 60 phút" },
                    { id: "lock_24h", label: "🔒 Khóa 24 Giờ", desc: "Tạm cấm chat 1 ngày" },
                    { id: "lock_permanent", label: "⛔ Khóa Vĩnh Viễn", desc: "Đình chỉ thảo luận" },
                  ].map((act) => (
                    <div key={act.id} className="col-6">
                      <div
                        onClick={() => setPenaltyModal((prev) => ({ ...prev, actionType: act.id }))}
                        className={`p-2.5 rounded-3 border cursor-pointer h-100 d-flex align-items-center gap-2 ${
                          penaltyModal.actionType === act.id ? "border-primary bg-primary-subtle" : "bg-white"
                        }`}
                        style={{ cursor: "pointer" }}
                      >
                        <input
                          type="radio"
                          checked={penaltyModal.actionType === act.id}
                          onChange={() => {}}
                          className="form-check-input m-0"
                        />
                        <div>
                          <b className="d-block text-dark" style={{ fontSize: "12px" }}>{act.label}</b>
                          <small className="text-secondary" style={{ fontSize: "10.5px" }}>{act.desc}</small>
                        </div>
                      </div>
                    </div>
                  ))}
                  {penaltyModal.targetMessage.is_currently_locked && (
                    <div className="col-12">
                      <div
                        onClick={() => setPenaltyModal((prev) => ({ ...prev, actionType: "unlock" }))}
                        className={`p-2.5 rounded-3 border cursor-pointer d-flex align-items-center gap-2 ${
                          penaltyModal.actionType === "unlock" ? "border-success bg-success-subtle" : "bg-white"
                        }`}
                        style={{ cursor: "pointer" }}
                      >
                        <input
                          type="radio"
                          checked={penaltyModal.actionType === "unlock"}
                          onChange={() => {}}
                          className="form-check-input m-0"
                        />
                        <div>
                          <b className="d-block text-success" style={{ fontSize: "12.5px" }}>✓ Gỡ Phạt & Mở Khóa Tài Khoản</b>
                          <small className="text-secondary" style={{ fontSize: "11px" }}>Khôi phục quyền nhắn tin và đặt lại bộ đếm cảnh báo về 0</small>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Lý do */}
              <div>
                <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10.5px" }}>
                  Lý do áp dụng *
                </label>
                <select
                  value={penaltyModal.reason}
                  onChange={(e) => setPenaltyModal((prev) => ({ ...prev, reason: e.target.value }))}
                  className="form-select form-select-sm fw-semibold rounded-3 bg-light shadow-none mb-2"
                  style={{ fontSize: "12px" }}
                >
                  {penaltyModal.actionType === "unlock" ? (
                    <option value="Admin xem xét gỡ phạt khôi phục quyền cho sinh viên">
                      Admin xem xét gỡ phạt khôi phục quyền cho sinh viên
                    </option>
                  ) : (
                    REASON_TEMPLATES.map((tmpl, idx) => (
                      <option key={idx} value={tmpl}>{tmpl}</option>
                    ))
                  )}
                </select>
                <input
                  type="text"
                  value={penaltyModal.customReason}
                  onChange={(e) => setPenaltyModal((prev) => ({ ...prev, customReason: e.target.value }))}
                  placeholder="Hoặc nhập lý do cụ thể khác tại đây..."
                  className="form-control form-control-sm rounded-3 shadow-none"
                  style={{ fontSize: "12px" }}
                />
              </div>

              {/* Checkbox xóa luôn tin nhắn vi phạm */}
              {penaltyModal.actionType !== "unlock" && (
                <div className="form-check">
                  <input
                    type="checkbox"
                    id="alsoDeleteMsgCheck"
                    className="form-check-input cursor-pointer"
                    checked={penaltyModal.alsoDeleteMessage}
                    onChange={(e) => setPenaltyModal((prev) => ({ ...prev, alsoDeleteMessage: e.target.checked }))}
                  />
                  <label htmlFor="alsoDeleteMsgCheck" className="form-check-label small fw-semibold text-danger cursor-pointer">
                    Đồng thời xóa luôn tin nhắn vi phạm này khỏi phòng chat
                  </label>
                </div>
              )}

              <div className="d-flex justify-content-end gap-2 pt-2 border-top">
                <button
                  type="button"
                  onClick={() => setPenaltyModal((prev) => ({ ...prev, isOpen: false }))}
                  className="btn btn-sm btn-light rounded-pill px-3.5 py-1.5 fw-semibold border"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={penaltyModal.isSubmitting}
                  className={`btn btn-sm rounded-pill px-4 py-1.5 fw-bold text-white border-0 ${
                    penaltyModal.actionType === "unlock" ? "btn-success" : penaltyModal.actionType === "warn" ? "btn-warning text-dark" : "btn-danger"
                  }`}
                >
                  {penaltyModal.isSubmitting ? "Đang xử lý..." : "Xác Nhận Thực Thi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL XEM CHI TIẾT TIN NHẮN DÀI */}
      {viewingMsgDetail && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.6)", zIndex: 1150 }}
          onClick={() => setViewingMsgDetail(null)}
        >
          <div
            className="card border-0 rounded-4 shadow-lg bg-white p-4"
            style={{ width: "100%", maxWidth: "480px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center pb-2 mb-3 border-bottom">
              <div>
                <h6 className="fw-bold text-dark mb-0">{viewingMsgDetail.user_name}</h6>
                <small className="text-muted font-monospace">{viewingMsgDetail.createdAt}</small>
              </div>
              <button type="button" onClick={() => setViewingMsgDetail(null)} className="btn-close"></button>
            </div>
            <p className="text-dark mb-3" style={{ whiteSpace: "pre-wrap", fontSize: "13.5px", maxHeight: "320px", overflowY: "auto" }}>
              {viewingMsgDetail.content}
            </p>
            {viewingMsgDetail.image_url && (
              <img
                src={viewingMsgDetail.image_url}
                alt="Đính kèm"
                className="img-fluid rounded-3 border mb-3"
                style={{ maxHeight: "220px", objectFit: "contain" }}
              />
            )}
            <div className="d-flex justify-content-end gap-2">
              {!viewingMsgDetail.is_ai && (
                <button
                  type="button"
                  onClick={() => {
                    const msg = viewingMsgDetail;
                    setViewingMsgDetail(null);
                    handleOpenPenalty(msg);
                  }}
                  className="btn btn-sm btn-warning rounded-pill px-3 fw-bold"
                >
                  Xử lý vi phạm
                </button>
              )}
              <button type="button" onClick={() => setViewingMsgDetail(null)} className="btn btn-sm btn-secondary rounded-pill px-3">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL PHÓNG TO ẢNH */}
      {previewImg && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.82)", zIndex: 1200 }}
          onClick={() => setPreviewImg(null)}
        >
          <div className="position-relative bg-white rounded-4 p-2 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImg(null)}
              className="btn btn-sm btn-dark rounded-circle position-absolute top-0 end-0 m-2"
              style={{ width: "30px", height: "30px" }}
            >
              <i className="bi bi-x-lg"></i>
            </button>
            <img src={previewImg} alt="Preview" className="rounded-3 img-fluid d-block" style={{ maxHeight: "82vh", objectFit: "contain" }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageCommunity;