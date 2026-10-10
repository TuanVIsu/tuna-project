// src/admin/ManageAI.jsx
import React, { useState, useEffect, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

export const ManageAI = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testLatency, setTestLatency] = useState(null);

  const [settingsForm, setSettingsForm] = useState({
    daily_token_limit_per_user: 15000,
    max_questions_per_gen: 5,
    enable_ai_global: true,
    cache_ttl_hours: 24,
  });

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem("admin_token") || localStorage.getItem("token") || "";
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, []);

  // Gọi API an toàn, chống triệt để lỗi HTML <!DOCTYPE
// Gọi API dứt điểm, không lặp candidate URLs
  const safeAiFetch = useCallback(async (endpoint, reqOptions = {}) => {
    const token = localStorage.getItem("admin_token") || localStorage.getItem("token") || "";
    const headers = {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...(reqOptions.headers || {}),
    };

    const cleanBase = API_BASE.replace(/\/+$/, "");
    const cleanEndpoint = endpoint.replace(/^\/+/, "");
    const targetUrl = `${cleanBase}/ai/${cleanEndpoint}`;

    try {
      const res = await fetch(targetUrl, {
        ...reqOptions,
        headers,
      });

      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch (err) {
        return { success: false, message: `Server phản hồi mã ${res.status} không phải JSON` };
      }

      if (res.ok && json.success) {
        return json;
      }
      return { success: false, message: json.message || json.error || `HTTP ${res.status}` };
    } catch (err) {
      return { success: false, message: err.message || "Lỗi mạng hoặc CORS" };
    }
  }, [getHeaders]);

  const fetchAIStats = useCallback(async () => {
    try {
      setLoading(true);
      const result = await safeAiFetch("/stats");
      if (result && result.success) {
        setData(result);
        if (result.settings) {
          setSettingsForm({
            daily_token_limit_per_user: Number(result.settings.daily_token_limit_per_user) || 15000,
            max_questions_per_gen: Number(result.settings.max_questions_per_gen) || 5,
            enable_ai_global: result.settings.enable_ai_global !== false,
            cache_ttl_hours: Number(result.settings.cache_ttl_hours) || 24,
          });
        }
      }
    } catch (e) {
      console.error("Lỗi nạp thống kê AI:", e);
    } finally {
      setLoading(false);
    }
  }, [safeAiFetch]);

  useEffect(() => {
    fetchAIStats();
  }, [fetchAIStats]);

  // Cập nhật cấu hình hạn mức
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const result = await safeAiFetch("/settings", {
        method: "PUT",
        body: JSON.stringify(settingsForm),
      });
      if (result && result.success) {
        alert("✅ " + (result.message || "Đã lưu chính sách hạn mức AI thành công!"));
        fetchAIStats();
      } else {
        alert("Lỗi: " + (result?.message || "Không thể lưu cấu hình"));
      }
    } catch (e) {
      alert("Lỗi kết nối: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle trạng thái AI
  const handleToggleGlobalAI = async () => {
    const nextStatus = !settingsForm.enable_ai_global;
    setSettingsForm((prev) => ({ ...prev, enable_ai_global: nextStatus }));

    try {
      const result = await safeAiFetch("/toggle", {
        method: "POST",
        body: JSON.stringify({ enabled: nextStatus }),
      });

      if (!result || !result.success) {
        setSettingsForm((prev) => ({ ...prev, enable_ai_global: !nextStatus }));
        alert("Lỗi: " + (result?.message || "Không thể chuyển trạng thái"));
      } else {
        fetchAIStats();
      }
    } catch (err) {
      setSettingsForm((prev) => ({ ...prev, enable_ai_global: !nextStatus }));
      alert("Lỗi kết nối khi chuyển trạng thái AI");
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm("Xác nhận làm sạch toàn bộ bộ nhớ đệm (Cache 24h)?")) return;
    setIsClearingCache(true);
    try {
      const result = await safeAiFetch("/clear-cache", { method: "POST" });
      if (result && result.success) {
        alert("✅ " + (result.message || "Đã dọn sạch bộ nhớ đệm AI thành công!"));
        fetchAIStats();
      } else {
        alert("Lỗi: " + (result?.message || "Không thể xóa cache"));
      }
    } catch (e) {
      alert("Lỗi dọn cache");
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleTestAPI = async () => {
    setIsTesting(true);
    setTestLatency(null);
    try {
      const start = Date.now();
      const result = await safeAiFetch("/generate", {
        method: "POST",
        body: JSON.stringify({ prompt: "PING", isJson: false, featureType: "admin_test" }),
      });
      const latency = Date.now() - start;
      if (result && result.success) {
        setTestLatency(`${latency}ms`);
      } else {
        setTestLatency("Lỗi API");
      }
    } catch (err) {
      setTestLatency("Mất kết nối");
    } finally {
      setIsTesting(false);
      setTimeout(() => setTestLatency(null), 4000);
    }
  };

  if (loading) {
    return (
      <div className="w-100 text-center py-5">
        <div className="spinner-border text-primary mb-3" style={{ width: "2.5rem", height: "2.5rem" }}></div>
        <h6 className="fw-bold text-dark">Đang nạp dữ liệu quản trị AI...</h6>
      </div>
    );
  }

  const stats = data?.stats || {};
  const totalTokens = Number(stats.total_tokens || 0);
  const promptTokens = Number(stats.prompt_tokens || 0);
  const completionTokens = Number(stats.completion_tokens || 0);
  const totalCost = Number(stats.total_cost_usd || 0);
  const totalRequests = Number(stats.total_requests || 0);

  const monthlyBudget = 10.0;
  const budgetPercent = Math.min(100, (totalCost / monthlyBudget) * 100).toFixed(1);

  return (
    <div className="d-flex flex-column gap-4 w-100 pb-5" style={{ color: "#0f172a" }}>
      
      {/* 1. HEADER HERO CARD */}
      <div 
        className="bg-white rounded-4 p-4 border shadow-sm"
        style={{ borderColor: "#e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.02)" }}
      >
        <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <div
              className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0 shadow-xs"
              style={{
                width: "44px",
                height: "44px",
                background: "linear-gradient(135deg, #185bf0 0%, #0d9488 100%)",
              }}
            >
              <i className="bi bi-cpu-fill fs-5"></i>
            </div>
            <div>
              <div className="d-flex align-items-center gap-2">
                <h5 className="fw-black text-dark mb-0 fs-6">
                  Gateway Gemini AI & Ngân Sách
                </h5>
                <span className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-0.5" style={{ fontSize: "11px" }}>
                  gemini-1.5-flash
                </span>
              </div>
              <small className="text-secondary fw-medium d-block mt-1" style={{ fontSize: "12px" }}>
                Kiểm soát hạn mức token, chi phí định kỳ và bộ nhớ đệm Cache 24h
              </small>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {testLatency && (
              <span className={`badge rounded-pill px-3 py-1.5 fw-bold ${testLatency.includes("ms") ? "bg-success-subtle text-success border border-success-subtle" : "bg-danger-subtle text-danger border border-danger-subtle"}`} style={{ fontSize: "11px" }}>
                {testLatency.includes("ms") ? `✓ Độ trễ: ${testLatency}` : `✕ ${testLatency}`}
              </span>
            )}

            <button
              type="button"
              disabled={isTesting}
              onClick={handleTestAPI}
              className="btn btn-sm btn-light border rounded-pill px-3.5 py-1.5 fw-semibold d-inline-flex align-items-center gap-1.5 bg-white shadow-none cursor-pointer custom-btn-hover"
              style={{ fontSize: "12px", borderColor: "#e2e8f0" }}
            >
              {isTesting ? <span className="spinner-border spinner-border-sm text-primary"></span> : <i className="bi bi-broadcast text-primary"></i>}
              Kiểm tra API
            </button>

            <button
              type="button"
              disabled={isClearingCache}
              onClick={handleClearCache}
              className="btn btn-sm btn-light border rounded-pill px-3.5 py-1.5 fw-semibold d-inline-flex align-items-center gap-1.5 bg-white shadow-none cursor-pointer custom-btn-hover"
              style={{ fontSize: "12px", borderColor: "#e2e8f0" }}
            >
              <i className="bi bi-trash3 text-danger"></i>
              Xóa Cache ({data?.cachedTotal || 0})
            </button>

            <div 
              className="p-1 bg-slate-100 rounded-pill border d-inline-flex align-items-center gap-2 px-2.5 ms-md-1" 
              style={{ borderColor: "#e2e8f0" }}
            >
              <span className={`badge rounded-pill ${settingsForm.enable_ai_global ? "bg-success text-white" : "bg-danger text-white"} px-2.5 py-0.5`} style={{ fontSize: "10.5px" }}>
                {settingsForm.enable_ai_global ? "Hoạt động" : "Tạm dừng"}
              </span>
              <div className="form-check form-switch mb-0 p-0 m-0 d-flex align-items-center">
                <input
                  className="form-check-input cursor-pointer m-0"
                  type="checkbox"
                  role="switch"
                  checked={settingsForm.enable_ai_global}
                  onChange={handleToggleGlobalAI}
                  style={{ width: "34px", height: "18px" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 4 THẺ METRICS KPI: KHOẢNG CÁCH RỘNG VÀ CÂN BẰNG ĐÁY */}
      <div className="row g-3.5">
        {/* Card 1: Tokens */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div 
            className="bg-white rounded-4 p-4 border shadow-sm h-100 d-flex flex-column justify-content-between metric-card-hover"
            style={{ borderColor: "#f1f5f9", minHeight: "165px" }}
          >
            <div className="d-flex justify-content-between align-items-start">
              <span className="text-secondary text-uppercase fw-bold" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                Tổng Token Tiêu Thụ
              </span>
              <span className="rounded-3 d-flex align-items-center justify-content-center" style={{ width: "34px", height: "34px", backgroundColor: "#eff6ff", color: "#185bf0" }}>
                <i className="bi bi-lightning-charge-fill fs-6"></i>
              </span>
            </div>
            <div>
              <h3 className="fw-black text-dark font-monospace mb-0" style={{ fontSize: "28px", letterSpacing: "-0.5px" }}>
                {totalTokens.toLocaleString()}
              </h3>
              <div className="d-flex gap-2 text-muted mt-2 fw-medium" style={{ fontSize: "11.5px" }}>
                <span>In: <b>{promptTokens.toLocaleString()}</b></span>
                <span>•</span>
                <span>Out: <b>{completionTokens.toLocaleString()}</b></span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Chi phí */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div 
            className="bg-white rounded-4 p-4 border shadow-sm h-100 d-flex flex-column justify-content-between metric-card-hover"
            style={{ borderColor: "#f1f5f9", minHeight: "165px" }}
          >
            <div className="d-flex justify-content-between align-items-start">
              <span className="text-secondary text-uppercase fw-bold" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                Chi Phí Ước Tính
              </span>
              <span className="rounded-3 d-flex align-items-center justify-content-center" style={{ width: "34px", height: "34px", backgroundColor: "#ecfdf5", color: "#059669" }}>
                <i className="bi bi-currency-dollar fs-6"></i>
              </span>
            </div>
            <div>
              <div className="d-flex align-items-baseline gap-2">
                <h3 className="fw-black text-dark font-monospace mb-0" style={{ fontSize: "28px", letterSpacing: "-0.5px" }}>
                  ${totalCost.toFixed(4)}
                </h3>
                <small className="text-success fw-bold" style={{ fontSize: "11px" }}>
                  ~{Math.round(totalCost * 25450).toLocaleString("vi-VN")} đ
                </small>
              </div>
              <div className="w-100 bg-slate-100 rounded-pill overflow-hidden mt-1.5" style={{ height: "4px" }}>
                <div className={`h-100 rounded-pill ${budgetPercent > 80 ? "bg-danger" : "bg-primary"}`} style={{ width: `${Math.max(budgetPercent, 4)}%` }}></div>
              </div>
              <div className="d-flex justify-content-between text-muted mt-1" style={{ fontSize: "10.5px" }}>
                <span>Đã dùng {budgetPercent}%</span>
                <span>Định mức: ${monthlyBudget}/tháng</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Lượt gọi */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div 
            className="bg-white rounded-4 p-4 border shadow-sm h-100 d-flex flex-column justify-content-between metric-card-hover"
            style={{ borderColor: "#f1f5f9", minHeight: "165px" }}
          >
            <div className="d-flex justify-content-between align-items-start">
              <span className="text-secondary text-uppercase fw-bold" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                Tổng Lượt Yêu Cầu
              </span>
              <span className="rounded-3 d-flex align-items-center justify-content-center" style={{ width: "34px", height: "34px", backgroundColor: "#fef3c7", color: "#d97706" }}>
                <i className="bi bi-activity fs-6"></i>
              </span>
            </div>
            <div>
              <h3 className="fw-black text-dark font-monospace mb-0" style={{ fontSize: "28px", letterSpacing: "-0.5px" }}>
                {totalRequests.toLocaleString()}
              </h3>
              <span className="text-muted d-block mt-2 fw-medium" style={{ fontSize: "11.5px" }}>
                Trung bình: <b>{totalRequests ? Math.round(totalTokens / totalRequests) : 0}</b> tokens/lượt
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Quota SV */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div 
            className="bg-white rounded-4 p-4 border shadow-sm h-100 d-flex flex-column justify-content-between metric-card-hover"
            style={{ borderColor: "#f1f5f9", minHeight: "165px" }}
          >
            <div className="d-flex justify-content-between align-items-start">
              <span className="text-secondary text-uppercase fw-bold" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                Hạn Mức SV / Ngày
              </span>
              <span className="rounded-3 d-flex align-items-center justify-content-center" style={{ width: "34px", height: "34px", backgroundColor: "#f5f3ff", color: "#7c3aed" }}>
                <i className="bi bi-shield-check fs-6"></i>
              </span>
            </div>
            <div>
              <h3 className="fw-black text-primary font-monospace mb-0" style={{ fontSize: "28px", letterSpacing: "-0.5px" }}>
                {settingsForm.daily_token_limit_per_user.toLocaleString()}
              </h3>
              <span className="text-muted d-block mt-2 fw-medium" style={{ fontSize: "11.5px" }}>
                Đạt ~<b>{Math.floor(settingsForm.daily_token_limit_per_user / 600)}</b> câu hỏi / tóm tắt
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. BỐ CỤC 2 CỘT CÓ KHOẢNG CÁCH RỘNG RÃI */}
      <div className="row g-4 pt-1">
        {/* CỘT TRÁI: FORM THIẾT LẬP */}
        <div className="col-12 col-lg-5">
          <div className="bg-white rounded-4 p-4 border shadow-sm h-100 d-flex flex-column justify-content-between" style={{ borderColor: "#f1f5f9" }}>
            <div>
              <div className="d-flex align-items-center gap-3 pb-3 mb-3.5 border-bottom" style={{ borderColor: "#f1f5f9" }}>
                <span className="rounded-3 p-2 bg-light text-primary d-flex align-items-center justify-content-center shadow-2xs">
                  <i className="bi bi-sliders fs-5"></i>
                </span>
                <div>
                  <h6 className="fw-bold text-dark mb-0 fs-6">Chính Sách & Hạn Mức</h6>
                  <small className="text-secondary d-block mt-0.5" style={{ fontSize: "11.5px" }}>Thiết lập tự động cho mọi tài khoản sinh viên</small>
                </div>
              </div>

              <form onSubmit={handleSaveSettings} className="d-flex flex-column gap-3.5 pt-1">
                <div>
                  <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "10.5px" }}>
                    Định mức Token mỗi ngày *
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      min="1000"
                      step="1000"
                      required
                      value={settingsForm.daily_token_limit_per_user}
                      onChange={(e) => setSettingsForm({ ...settingsForm, daily_token_limit_per_user: Number(e.target.value) })}
                      className="form-control fw-bold font-monospace shadow-none rounded-start-3"
                      style={{ fontSize: "13px", borderColor: "#e2e8f0", height: "34px" }}
                    />
                    <span className="input-group-text bg-light text-muted fw-semibold" style={{ borderColor: "#e2e8f0" }}>tokens/ngày</span>
                  </div>
                  <small className="text-muted d-block mt-1" style={{ fontSize: "11px" }}>
                    Tự động tạm khóa lượt gọi mới khi sinh viên chạm ngưỡng trong ngày.
                  </small>
                </div>

                <div>
                  <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "10.5px" }}>
                    Số câu trắc nghiệm mỗi lần sinh *
                  </label>
                  <select
                    value={settingsForm.max_questions_per_gen}
                    onChange={(e) => setSettingsForm({ ...settingsForm, max_questions_per_gen: Number(e.target.value) })}
                    className="form-select form-select-sm fw-semibold rounded-3 shadow-none"
                    style={{ fontSize: "12.5px", borderColor: "#e2e8f0", height: "34px" }}
                  >
                    <option value="3">3 câu (Tiết kiệm ~800 tokens)</option>
                    <option value="5">5 câu (Đề xuất chuẩn ~1,500 tokens)</option>
                    <option value="10">10 câu (Đầy đủ ~3,000 tokens)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "10.5px" }}>
                    Thời gian lưu trữ Cache (TTL) *
                  </label>
                  <select
                    value={settingsForm.cache_ttl_hours}
                    onChange={(e) => setSettingsForm({ ...settingsForm, cache_ttl_hours: Number(e.target.value) })}
                    className="form-select form-select-sm fw-semibold rounded-3 shadow-none"
                    style={{ fontSize: "12.5px", borderColor: "#e2e8f0", height: "34px" }}
                  >
                    <option value="6">6 tiếng</option>
                    <option value="12">12 tiếng</option>
                    <option value="24">24 tiếng (Khuyên dùng - Tiết kiệm tối ưu)</option>
                    <option value="48">48 tiếng (Lưu trữ lâu)</option>
                  </select>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="btn btn-primary rounded-pill w-100 py-2.5 fw-bold border-0 text-white shadow-xs cursor-pointer btn-action-hover"
                    style={{ fontSize: "13px", background: "#185bf0" }}
                  >
                    {isSaving ? "Đang cập nhật..." : "Lưu Cấu Hình Mới"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* CỘT PHẢI: PHÂN BỔ TÍNH NĂNG & TOP TÀI KHOẢN */}
        <div className="col-12 col-lg-7 d-flex flex-column gap-4">
          {/* Card Phân Bổ Tính Năng */}
          <div className="bg-white rounded-4 p-4 border shadow-sm" style={{ borderColor: "#f1f5f9" }}>
            <div className="d-flex justify-content-between align-items-center pb-2.5 mb-3 border-bottom" style={{ borderColor: "#f1f5f9" }}>
              <div className="d-flex align-items-center gap-2">
                <span className="rounded-2 p-1.5 bg-light text-success d-flex align-items-center justify-content-center">
                  <i className="bi bi-pie-chart fs-6"></i>
                </span>
                <h6 className="fw-bold text-dark mb-0 fs-6">Lưu Lượng Theo Tính Năng</h6>
              </div>
              <small className="text-muted fw-semibold">Tổng {data?.features?.length || 0} module</small>
            </div>

            <div className="row g-2.5">
              {(!data?.features || data.features.length === 0) ? (
                <div className="col-12 text-center py-3 text-muted small">Chưa có lượt gọi AI nào phát sinh.</div>
              ) : (
                data.features.map((f, idx) => (
                  <div key={idx} className="col-12 col-md-6">
                    <div 
                      className="p-3 rounded-3 border d-flex justify-content-between align-items-center bg-light feature-item-hover"
                      style={{ borderColor: "#f1f5f9" }}
                    >
                      <div className="pe-2 overflow-hidden">
                        <span className="fw-bold text-dark text-capitalize text-truncate d-block" style={{ fontSize: "12px" }}>
                          {f.feature_type.replace(/_/g, " ")}
                        </span>
                        <small className="text-secondary d-block mt-0.5" style={{ fontSize: "10.5px" }}>
                          {f.count} req • ${Number(f.cost).toFixed(4)}
                        </small>
                      </div>
                      <span className="badge rounded-pill bg-white text-primary border font-monospace px-2.5 py-1 fw-bold shadow-2xs" style={{ fontSize: "11px" }}>
                        {Number(f.tokens).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card Top Tài Khoản */}
          <div className="bg-white rounded-4 p-4 border shadow-sm flex-grow-1" style={{ borderColor: "#f1f5f9" }}>
            <div className="d-flex justify-content-between align-items-center pb-2.5 mb-2 border-bottom" style={{ borderColor: "#f1f5f9" }}>
              <div className="d-flex align-items-center gap-2">
                <span className="rounded-2 p-1.5 bg-light text-warning d-flex align-items-center justify-content-center">
                  <i className="bi bi-trophy fs-6"></i>
                </span>
                <h6 className="fw-bold text-dark mb-0 fs-6">Top Tài Khoản Sử Dụng Nhiều Nhất</h6>
              </div>
              <small className="text-muted fw-semibold">Top 6 sinh viên</small>
            </div>

            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 text-nowrap" style={{ fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ fontSize: "10.5px", color: "#94a3b8" }} className="text-uppercase">
                    <th className="ps-2 py-2">Sinh Viên</th>
                    <th>Lớp</th>
                    <th className="text-center">Lượt Gọi</th>
                    <th className="text-end pe-2">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {(!data?.topUsers || data.topUsers.length === 0) ? (
                    <tr>
                      <td colSpan="4" className="text-center py-3 text-muted small">
                        Chưa ghi nhận dữ liệu tiêu thụ.
                      </td>
                    </tr>
                  ) : (
                    data.topUsers.map((u, i) => (
                      <tr key={i} className="table-row-hover">
                        <td className="ps-2">
                          <span className="fw-bold text-dark d-block">{u.user_name}</span>
                          <span className="text-muted font-monospace" style={{ fontSize: "11px" }}>{u.student_code}</span>
                        </td>
                        <td>
                          <span className="badge bg-light text-secondary border px-2 py-0.5" style={{ fontSize: "10.5px" }}>{u.class_name || "Khoa CNTT"}</span>
                        </td>
                        <td className="text-center font-monospace">{u.requests}</td>
                        <td className="text-end font-monospace fw-bold text-primary pe-2">
                          {Number(u.total_tokens).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* 4. BẢNG NHẬT KÝ TÁC VỤ */}
      <div className="bg-white rounded-4 p-4 border shadow-sm mt-1" style={{ borderColor: "#f1f5f9" }}>
        <div className="d-flex justify-content-between align-items-center pb-3 mb-2.5 border-bottom" style={{ borderColor: "#f1f5f9" }}>
          <div className="d-flex align-items-center gap-2">
            <span className="rounded-2 p-1.5 bg-light text-secondary d-flex align-items-center justify-content-center">
              <i className="bi bi-clock-history fs-6"></i>
            </span>
            <div>
              <h6 className="fw-bold text-dark mb-0 fs-6">Nhật Ký Tác Vụ Gần Nhất</h6>
              <small className="text-secondary d-block mt-0.5" style={{ fontSize: "11.5px" }}>Tiến trình tự động sinh trắc nghiệm, flashcard và trợ lý</small>
            </div>
          </div>
          <button
            onClick={fetchAIStats}
            className="btn btn-sm btn-light border rounded-pill px-3 py-1.5 text-secondary shadow-none d-inline-flex align-items-center gap-1.5 cursor-pointer bg-white custom-btn-hover"
            style={{ fontSize: "11.5px", borderColor: "#e2e8f0" }}
          >
            <i className="bi bi-arrow-clockwise"></i> Làm mới
          </button>
        </div>

        <div className="table-responsive" style={{ maxHeight: "250px", overflowY: "auto" }}>
          <table className="table table-hover align-middle mb-0 text-nowrap" style={{ fontSize: "12.5px" }}>
            <thead className="table-light position-sticky top-0 z-1">
              <tr style={{ fontSize: "10.5px", color: "#64748b" }} className="text-uppercase">
                <th className="ps-3 py-2.5" style={{ width: "160px" }}>Thời Gian</th>
                <th style={{ width: "140px" }}>Tính Năng</th>
                <th>Tài Liệu / Học Phần</th>
                <th className="text-center" style={{ width: "120px" }}>Trạng Thái</th>
                <th className="pe-3">Ghi Chú</th>
              </tr>
            </thead>
            <tbody>
              {(!data?.recentTasks || data.recentTasks.length === 0) ? (
                <tr>
                  <td colSpan="5" className="text-center py-4 text-muted small">
                    Chưa có nhật ký tác vụ nào được ghi nhận.
                  </td>
                </tr>
              ) : (
                data.recentTasks.map((t) => (
                  <tr key={t.id} className="table-row-hover">
                    <td className="ps-3 text-muted font-monospace" style={{ fontSize: "11.5px" }}>{t.createdAt}</td>
                    <td>
                      <span className="badge bg-light text-dark border font-monospace px-2 py-0.5" style={{ fontSize: "10px" }}>
                        {t.featureId}
                      </span>
                    </td>
                    <td>
                      <span className="fw-semibold text-dark text-truncate d-block" style={{ maxWidth: "260px" }}>
                        {t.docName || "Yêu cầu trực tiếp"}
                      </span>
                    </td>
                    <td className="text-center">
                      <span
                        className={`badge rounded-pill px-2.5 py-0.5 ${
                          t.status === "done"
                            ? "bg-success-subtle text-success border border-success-subtle"
                            : t.status === "error"
                            ? "bg-danger-subtle text-danger border border-danger-subtle"
                            : "bg-warning-subtle text-dark border border-warning-subtle"
                        }`}
                        style={{ fontSize: "10.5px" }}
                      >
                        {t.status === "done" ? "Hoàn tất" : t.status === "error" ? "Thất bại" : "Đang chạy"}
                      </span>
                    </td>
                    <td className="pe-3">
                      <small className={t.status === "error" ? "text-danger fw-semibold" : "text-muted"}>
                        {t.errorMessage || "Xử lý thành công"}
                      </small>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hiệu ứng Hover Style */}
      <style>{`
        .metric-card-hover {
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .metric-card-hover:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03) !important;
          border-color: #cbd5e1 !important;
        }
        .custom-btn-hover:hover {
          background-color: #f8fafc !important;
          border-color: #cbd5e1 !important;
          transform: translateY(-1px);
        }
        .btn-action-hover:hover {
          opacity: 0.92;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(24, 91, 240, 0.25) !important;
        }
        .feature-item-hover:hover {
          background-color: #ffffff !important;
          border-color: #cbd5e1 !important;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
        }
        .table-row-hover:hover {
          background-color: #f8fafc !important;
        }
      `}</style>

    </div>
  );
};

export default ManageAI;