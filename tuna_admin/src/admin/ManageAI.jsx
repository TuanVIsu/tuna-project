// src/admin/ManageAI.jsx
import React, { useState, useEffect } from "react";

const API_BASE = "http://localhost:5000/api";

export const ManageAI = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [settingsForm, setSettingsForm] = useState({
    daily_token_limit_per_user: 15000,
    max_questions_per_gen: 5,
    enable_ai_global: true,
    cache_ttl_hours: 24,
  });

  const getHeaders = () => {
    const token = localStorage.getItem("admin_token") || localStorage.getItem("token") || "";
    return { 
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };
  };

  const fetchAIStats = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/ai/stats`, { headers: getHeaders() });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
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
      }
    } catch (e) {
      console.error("Lỗi nạp thống kê AI:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAIStats();
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/ai/settings`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(settingsForm),
      });
      const result = await res.json();
      if (result.success) {
        alert("✅ " + result.message);
        fetchAIStats();
      } else {
        alert("Lỗi: " + result.message);
      }
    } catch (e) {
      alert("Lỗi kết nối: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm("Xác nhận làm sạch toàn bộ dữ liệu đệm AI (ai_cached_outputs) trong CSDL?")) return;
    setIsClearingCache(true);
    try {
      const res = await fetch(`${API_BASE}/admin/ai/clear-cache`, {
        method: "POST",
        headers: getHeaders(),
      });
      const result = await res.json();
      if (result.success) {
        alert("✅ " + result.message);
        fetchAIStats();
      }
    } catch (e) {
      alert("Lỗi dọn cache");
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleTestAPI = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const start = Date.now();
      const res = await fetch(`${API_BASE}/ai/generate`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ prompt: "Phản hồi đúng 1 chữ: OK", isJson: false }),
      });
      const json = await res.json();
      const latency = Date.now() - start;
      if (json.success) {
        setTestResult({ ok: true, msg: `Phản hồi ${latency}ms` });
        fetchAIStats();
      } else {
        setTestResult({ ok: false, msg: json.error || "Lỗi phản hồi" });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err.message });
    } finally {
      setIsTesting(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary mb-3" style={{ width: "2.5rem", height: "2.5rem" }}></div>
        <h6 className="fw-bold text-dark">Đang nạp dữ liệu tài nguyên AI & Hạn mức...</h6>
        <small className="text-muted">Truy vấn ai_token_logs, system_ai_settings từ PostgreSQL</small>
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
  const budgetPercent = Math.min(100, ((totalCost / monthlyBudget) * 100)).toFixed(1);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflowX: "hidden",
        padding: "20px 28px 40px 28px",
      }}
      className="d-flex flex-column gap-4"
    >
      {/* 1. Header Toolbar */}
      <div
        className="card border rounded-4 bg-white shadow-xs p-4 w-100 overflow-hidden"
        style={{ borderColor: "#e2e8f0" }}
      >
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <span
              className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
              style={{
                width: "48px",
                height: "48px",
                background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
                color: "#ffffff",
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
              }}
            >
              <i className="bi bi-cpu fs-4"></i>
            </span>
            <div>
              <div className="d-flex align-items-center gap-2">
                <h5 className="fw-bold text-dark mb-0 tracking-tight" style={{ fontSize: "17px" }}>
                  Giám Sát & Ngân Sách AI Gemini
                </h5>
                <span
                  className="badge rounded-pill px-3 py-1 fw-semibold font-monospace"
                  style={{ backgroundColor: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", fontSize: "11px" }}
                >
                  gemini-1.5-flash
                </span>
              </div>
              <small className="text-secondary d-block mt-0.5" style={{ fontSize: "12.5px" }}>
                Kiểm soát Token tự động theo ngày • Kết nối: <code className="text-primary fw-semibold">tuna_project_db</code>
              </small>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="d-flex align-items-center gap-2.5 flex-wrap">
            {testResult && (
              <span
                className={`badge px-3 py-1.5 rounded-pill ${
                  testResult.ok
                    ? "bg-success-subtle text-success border border-success-subtle"
                    : "bg-danger-subtle text-danger border border-danger-subtle"
                }`}
                style={{ fontSize: "11.5px" }}
              >
                {testResult.ok ? "✓ " : "✕ "} {testResult.msg}
              </span>
            )}

            <button
              type="button"
              disabled={isTesting}
              onClick={handleTestAPI}
              className="btn btn-sm btn-light border rounded-pill px-3.5 py-2 fw-semibold d-inline-flex align-items-center gap-2 shadow-none"
              style={{ fontSize: "12.5px", borderColor: "#e2e8f0" }}
            >
              {isTesting ? (
                <span className="spinner-border spinner-border-sm text-primary"></span>
              ) : (
                <i className="bi bi-broadcast text-primary"></i>
              )}
              Kiểm tra API
            </button>

            <button
              type="button"
              disabled={isClearingCache}
              onClick={handleClearCache}
              className="btn btn-sm btn-light border rounded-pill px-3.5 py-2 fw-semibold d-inline-flex align-items-center gap-2 shadow-none"
              style={{ fontSize: "12.5px", borderColor: "#e2e8f0" }}
            >
              <i className="bi bi-trash3 text-danger"></i>
              {isClearingCache ? "Đang dọn..." : `Dọn Cache (${data?.cachedTotal || 0})`}
            </button>

            <span
              className={`badge rounded-pill px-3.5 py-2 fw-bold d-inline-flex align-items-center gap-2 ${
                settingsForm.enable_ai_global
                  ? "bg-success-subtle text-success border border-success-subtle"
                  : "bg-danger-subtle text-danger border border-danger-subtle"
              }`}
              style={{ fontSize: "12.5px" }}
            >
              <span
                className={`rounded-circle ${settingsForm.enable_ai_global ? "bg-success" : "bg-danger"}`}
                style={{ width: "8px", height: "8px" }}
              ></span>
              {settingsForm.enable_ai_global ? "Cổng AI Đang Mở" : "Cổng AI Đã Khóa"}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Lưới 4 Thẻ Chỉ Số Đo Lường (TÁCH RỜI HOÀN TOÀN, CÓ KHOẢNG CÁCH GAP: 16px) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
          width: "100%",
        }}
      >
        {/* Card 1: Tổng Tokens */}
        <div
          className="border rounded-4 p-4 bg-white shadow-xs d-flex flex-column justify-content-between"
          style={{ borderColor: "#e2e8f0", minHeight: "135px" }}
        >
          <div className="d-flex justify-content-between align-items-start mb-2">
            <span className="text-secondary text-uppercase fw-bold" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
              Tổng Token Tiêu Thụ
            </span>
            <span
              className="rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: "32px", height: "32px", backgroundColor: "#fef3c7", color: "#d97706" }}
            >
              <i className="bi bi-lightning-charge-fill" style={{ fontSize: "14px" }}></i>
            </span>
          </div>
          <div>
            <div className="fw-black text-dark my-0 font-monospace" style={{ fontSize: "28px", lineHeight: "1.2" }}>
              {totalTokens.toLocaleString()}
            </div>
            <div className="d-flex gap-2 text-muted mt-1.5" style={{ fontSize: "11.5px" }}>
              <span>Vào: <b>{promptTokens.toLocaleString()}</b></span>
              <span>•</span>
              <span>Ra: <b>{completionTokens.toLocaleString()}</b></span>
            </div>
          </div>
        </div>

        {/* Card 2: Chi phí + Tiến độ */}
        <div
          className="border rounded-4 p-4 bg-white shadow-xs d-flex flex-column justify-content-between"
          style={{ borderColor: "#e2e8f0", minHeight: "135px" }}
        >
          <div className="d-flex justify-content-between align-items-start mb-2">
            <span className="text-secondary text-uppercase fw-bold" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
              Chi Phí Phát Sinh (Ước tính)
            </span>
            <span
              className="rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: "32px", height: "32px", backgroundColor: "#ecfdf5", color: "#059669" }}
            >
              <i className="bi bi-currency-dollar" style={{ fontSize: "15px" }}></i>
            </span>
          </div>
          <div>
            <div className="d-flex align-items-baseline gap-2">
              <span className="fw-black text-primary font-monospace" style={{ fontSize: "28px", lineHeight: "1.2" }}>
                ${totalCost.toFixed(4)}
              </span>
              <small className="text-success fw-bold" style={{ fontSize: "11.5px" }}>
                ~{(totalCost * 25450).toLocaleString("vi-VN")} đ
              </small>
            </div>
            <div className="w-100 bg-secondary-subtle rounded-pill overflow-hidden mt-2" style={{ height: "6px" }}>
              <div
                className={`h-100 rounded-pill ${budgetPercent > 80 ? "bg-danger" : "bg-primary"}`}
                style={{ width: `${Math.max(budgetPercent, 2)}%` }}
              ></div>
            </div>
            <div className="d-flex justify-content-between text-muted mt-1" style={{ fontSize: "10.5px" }}>
              <span>Đã dùng {budgetPercent}%</span>
              <span>Định mức: ${monthlyBudget}/tháng</span>
            </div>
          </div>
        </div>

        {/* Card 3: Lượt gọi */}
        <div
          className="border rounded-4 p-4 bg-white shadow-xs d-flex flex-column justify-content-between"
          style={{ borderColor: "#e2e8f0", minHeight: "135px" }}
        >
          <div className="d-flex justify-content-between align-items-start mb-2">
            <span className="text-secondary text-uppercase fw-bold" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
              Lượt Gọi Yêu Cầu
            </span>
            <span
              className="rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: "32px", height: "32px", backgroundColor: "#eff6ff", color: "#2563eb" }}
            >
              <i className="bi bi-activity" style={{ fontSize: "14px" }}></i>
            </span>
          </div>
          <div>
            <div className="fw-black text-dark my-0 font-monospace" style={{ fontSize: "28px", lineHeight: "1.2" }}>
              {totalRequests.toLocaleString()}
            </div>
            <span className="text-muted d-block mt-1.5" style={{ fontSize: "11.5px" }}>
              Trung bình: <b>{totalRequests ? Math.round(totalTokens / totalRequests) : 0}</b> tokens / req
            </span>
          </div>
        </div>

        {/* Card 4: Hạn mức sinh viên */}
        <div
          className="border rounded-4 p-4 bg-white shadow-xs d-flex flex-column justify-content-between"
          style={{ borderColor: "#e2e8f0", minHeight: "135px" }}
        >
          <div className="d-flex justify-content-between align-items-start mb-2">
            <span className="text-secondary text-uppercase fw-bold" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
              Hạn Mức SV / Ngày
            </span>
            <span
              className="rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: "32px", height: "32px", backgroundColor: "#f5f3ff", color: "#7c3aed" }}
            >
              <i className="bi bi-shield-check" style={{ fontSize: "15px" }}></i>
            </span>
          </div>
          <div>
            <div className="fw-black text-warning my-0 font-monospace" style={{ fontSize: "28px", lineHeight: "1.2" }}>
              {settingsForm.daily_token_limit_per_user.toLocaleString()}
            </div>
            <span className="text-muted d-block mt-1.5" style={{ fontSize: "11.5px" }}>
              Tương đương ~<b>{Math.floor(settingsForm.daily_token_limit_per_user / 500)}</b> câu trắc nghiệm / tóm tắt
            </span>
          </div>
        </div>
      </div>

      {/* 3. Bố Cục 2 Cột Cân Xứng (KHOẢNG CÁCH GAP: 20px) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
          gap: "20px",
          width: "100%",
        }}
      >
        {/* CỘT TRÁI: FORM CẤU HÌNH & CHÍNH SÁCH */}
        <div
          className="card border rounded-4 bg-white shadow-xs overflow-hidden h-100 d-flex flex-column"
          style={{ borderColor: "#e2e8f0" }}
        >
          <div className="d-flex align-items-center gap-3 px-4 py-3.5 border-bottom">
            <span
              className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: "32px", height: "32px", backgroundColor: "#eff6ff", color: "#2563eb" }}
            >
              <i className="bi bi-sliders2" style={{ fontSize: "14px" }}></i>
            </span>
            <div>
              <span className="fw-bold text-dark d-block" style={{ fontSize: "14.5px" }}>
                Thiết Lập Chính Sách & Hạn Mức
              </span>
              <small className="text-secondary" style={{ fontSize: "11.5px" }}>
                Cập nhật trực tiếp vào bảng <code>system_ai_settings</code>
              </small>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="p-4 d-flex flex-column gap-3.5 flex-grow-1">
            {/* Công tắc Bật/Tắt AI */}
            <div
              className="p-3.5 rounded-3 border d-flex justify-content-between align-items-center"
              style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
            >
              <div>
                <label className="fw-bold text-dark d-block mb-0" style={{ fontSize: "13.5px" }}>
                  Dịch Vụ AI Toàn Cục
                </label>
                <small className="text-secondary" style={{ fontSize: "11.5px" }}>
                  Tạm khóa tức thì toàn bộ API khi cần bảo trì
                </small>
              </div>
              <div className="form-check form-switch mb-0">
                <input
                  className="form-check-input fs-5 cursor-pointer m-0"
                  type="checkbox"
                  checked={settingsForm.enable_ai_global}
                  onChange={(e) => setSettingsForm({ ...settingsForm, enable_ai_global: e.target.checked })}
                />
              </div>
            </div>

            {/* Hạn mức token */}
            <div>
              <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                Giới Hạn Token / Sinh Viên / Ngày *
              </label>
              <div className="input-group">
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  required
                  value={settingsForm.daily_token_limit_per_user}
                  onChange={(e) => setSettingsForm({ ...settingsForm, daily_token_limit_per_user: Number(e.target.value) })}
                  className="form-control fw-bold rounded-start-3 shadow-none font-monospace py-2"
                  style={{ borderColor: "#cbd5e1" }}
                />
                <span className="input-group-text bg-light text-secondary fw-semibold px-3">tokens/ngày</span>
              </div>
              <small className="text-muted d-block mt-1" style={{ fontSize: "11.5px" }}>
                Tự động từ chối yêu cầu nếu sinh viên vượt quá quota.
              </small>
            </div>

            {/* Số câu trắc nghiệm tối đa */}
            <div>
              <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                Số Câu Trắc Nghiệm Tối Đa Mỗi Lần Tạo *
              </label>
              <select
                value={settingsForm.max_questions_per_gen}
                onChange={(e) => setSettingsForm({ ...settingsForm, max_questions_per_gen: Number(e.target.value) })}
                className="form-select fw-semibold rounded-3 shadow-none py-2"
                style={{ borderColor: "#cbd5e1" }}
              >
                <option value="3">3 câu (Tiết kiệm ~800 tokens)</option>
                <option value="5">5 câu (Đề xuất chuẩn ~1,500 tokens)</option>
                <option value="10">10 câu (Đầy đủ ~3,000 tokens)</option>
              </select>
            </div>

            {/* Thời gian cache */}
            <div>
              <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                Thời Gian Lưu Trữ Cache Đề Thi (TTL) *
              </label>
              <select
                value={settingsForm.cache_ttl_hours}
                onChange={(e) => setSettingsForm({ ...settingsForm, cache_ttl_hours: Number(e.target.value) })}
                className="form-select fw-semibold rounded-3 shadow-none py-2"
                style={{ borderColor: "#cbd5e1" }}
              >
                <option value="6">6 tiếng</option>
                <option value="12">12 tiếng</option>
                <option value="24">24 tiếng (Khuyên dùng - Tiết kiệm tối ưu)</option>
                <option value="48">48 tiếng (Lưu trữ dài hạn)</option>
              </select>
            </div>

            {/* Submit button */}
            <div className="pt-2 mt-auto">
              <button
                type="submit"
                disabled={isSaving}
                className="btn btn-primary rounded-pill w-100 py-2.5 fw-bold border-0 text-white shadow-xs"
                style={{ fontSize: "13.5px", background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)" }}
              >
                {isSaving ? "Đang cập nhật CSDL..." : "Lưu Thay Đổi Cấu Hình"}
              </button>
            </div>
          </form>
        </div>

        {/* CỘT PHẢI: LƯU LƯỢNG THEO TÍNH NĂNG & TOP TÀI KHOẢN TIÊU THỤ */}
        <div className="d-flex flex-column gap-3.5 h-100">
          {/* Phân bổ tính năng */}
          <div className="card border rounded-4 bg-white shadow-xs overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
            <div className="d-flex justify-content-between align-items-center px-4 py-3.5 border-bottom">
              <div className="d-flex align-items-center gap-3">
                <span
                  className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ width: "32px", height: "32px", backgroundColor: "#f0fdf4", color: "#16a34a" }}
                >
                  <i className="bi bi-pie-chart" style={{ fontSize: "14px" }}></i>
                </span>
                <span className="fw-bold text-dark" style={{ fontSize: "14.5px" }}>Lưu Lượng Theo Tính Năng</span>
              </div>
              <small className="text-muted font-monospace">ai_token_logs</small>
            </div>

            <div className="p-4">
              {(!data?.features || data.features.length === 0) ? (
                <div className="text-center py-4 text-muted small">Chưa ghi nhận lượt gọi AI nào từ sinh viên.</div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                    gap: "12px",
                  }}
                >
                  {data.features.map((f, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-3 border d-flex justify-content-between align-items-center"
                      style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
                    >
                      <div className="overflow-hidden pe-2">
                        <span className="fw-bold text-dark text-capitalize text-truncate d-block" style={{ fontSize: "12.5px" }}>
                          {f.feature_type.replace(/_/g, " ")}
                        </span>
                        <small className="text-muted d-block mt-0.5" style={{ fontSize: "11px" }}>
                          {f.count} yêu cầu • ${Number(f.cost).toFixed(4)}
                        </small>
                      </div>
                      <span className="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace px-2.5 py-1.5 flex-shrink-0" style={{ fontSize: "11.5px" }}>
                        {Number(f.tokens).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top sinh viên sử dụng nhiều nhất */}
          <div className="card border rounded-4 bg-white shadow-xs overflow-hidden flex-grow-1" style={{ borderColor: "#e2e8f0" }}>
            <div className="d-flex justify-content-between align-items-center px-4 py-3.5 border-bottom">
              <div className="d-flex align-items-center gap-3">
                <span
                  className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ width: "32px", height: "32px", backgroundColor: "#fef3c7", color: "#d97706" }}
                >
                  <i className="bi bi-trophy" style={{ fontSize: "14px" }}></i>
                </span>
                <span className="fw-bold text-dark" style={{ fontSize: "14.5px" }}>Tài Khoản Sử Dụng Nhiều Nhất</span>
              </div>
              <small className="text-muted">Top 6 tài khoản</small>
            </div>

            <div className="table-responsive" style={{ minHeight: "140px" }}>
              <table className="table table-hover align-middle mb-0 text-nowrap" style={{ fontSize: "12.5px" }}>
                <thead className="table-light">
                  <tr style={{ fontSize: "11px", color: "#64748b" }} className="text-uppercase">
                    <th style={{ paddingLeft: "24px", paddingTop: "12px", paddingBottom: "12px" }}>Sinh Viên</th>
                    <th>Lớp</th>
                    <th className="text-center">Lượt Gọi</th>
                    <th className="text-end" style={{ paddingRight: "24px" }}>Tổng Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {(!data?.topUsers || data.topUsers.length === 0) ? (
                    <tr>
                      <td colSpan="4" className="text-center py-4 text-muted">
                        Chưa có tài khoản nào phát sinh tiêu thụ Token.
                      </td>
                    </tr>
                  ) : (
                    data.topUsers.map((u, i) => (
                      <tr key={i}>
                        <td style={{ paddingLeft: "24px", paddingTop: "12px", paddingBottom: "12px" }}>
                          <b className="text-dark d-block">{u.user_name}</b>
                          <small className="text-muted font-monospace">{u.student_code}</small>
                        </td>
                        <td>
                          <span className="badge bg-light text-secondary border px-2.5 py-1">{u.class_name || "Khoa CNTT"}</span>
                        </td>
                        <td className="text-center font-monospace">{u.requests}</td>
                        <td className="text-end font-monospace fw-bold text-warning" style={{ paddingRight: "24px" }}>
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

      {/* 4. Nhật Ký Tác Vụ Gần Nhất (ai_tasks) */}
      <div className="card border rounded-4 bg-white shadow-xs w-100 overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
        <div className="d-flex justify-content-between align-items-center px-4 py-3.5 border-bottom">
          <div className="d-flex align-items-center gap-3">
            <span
              className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: "32px", height: "32px", backgroundColor: "#f3f4f6", color: "#4b5563" }}
            >
              <i className="bi bi-clock-history" style={{ fontSize: "14px" }}></i>
            </span>
            <div>
              <span className="fw-bold text-dark d-block" style={{ fontSize: "14.5px" }}>
                Nhật Ký Tác Vụ Gần Nhất (ai_tasks)
              </span>
              <small className="text-secondary" style={{ fontSize: "11.5px" }}>
                Tự động lưu tiến trình sinh bài tập, thẻ ghi nhớ và tóm tắt học liệu
              </small>
            </div>
          </div>
          <button
            onClick={fetchAIStats}
            className="btn btn-sm btn-light border rounded-pill px-3.5 py-1.5 text-secondary shadow-none d-inline-flex align-items-center gap-1.5"
            style={{ fontSize: "12px", borderColor: "#e2e8f0" }}
          >
            <i className="bi bi-arrow-clockwise"></i> Làm mới
          </button>
        </div>

        {/* Khung cuộn nội bộ 260px */}
        <div
          style={{
            maxHeight: "260px",
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: "#cbd5e1 #f8fafc",
          }}
          className="w-100"
        >
          <table className="table table-hover align-middle mb-0 text-nowrap" style={{ fontSize: "12.5px" }}>
            <thead
              className="table-light text-secondary border-bottom position-sticky top-0 z-1"
              style={{ backgroundColor: "#f8fafc" }}
            >
              <tr style={{ fontSize: "11px" }} className="text-uppercase">
                <th style={{ width: "160px", paddingLeft: "24px", paddingTop: "12px", paddingBottom: "12px" }}>Thời Gian</th>
                <th style={{ width: "140px" }}>Tính Năng</th>
                <th>Tài Liệu / Môn Học</th>
                <th className="text-center" style={{ width: "120px" }}>Trạng Thái</th>
                <th style={{ paddingRight: "24px" }}>Chi Tiết Phản Hồi</th>
              </tr>
            </thead>
            <tbody>
              {(!data?.recentTasks || data.recentTasks.length === 0) ? (
                <tr>
                  <td colSpan="5" className="text-center py-4 text-muted">
                    Chưa có nhật ký tác vụ nào được ghi nhận trong bảng <code>ai_tasks</code>.
                  </td>
                </tr>
              ) : (
                data.recentTasks.map((t) => (
                  <tr key={t.id}>
                    <td className="text-muted font-monospace" style={{ paddingLeft: "24px", paddingTop: "12px", paddingBottom: "12px" }}>
                      {t.createdAt}
                    </td>
                    <td>
                      <span className="badge bg-light text-dark border font-monospace text-uppercase px-2 py-1" style={{ fontSize: "10.5px" }}>
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
                        className={`badge rounded-pill px-2.5 py-1 ${
                          t.status === "done"
                            ? "bg-success-subtle text-success border border-success-subtle"
                            : t.status === "error"
                            ? "bg-danger-subtle text-danger border border-danger-subtle"
                            : "bg-warning-subtle text-dark border border-warning-subtle"
                        }`}
                        style={{ fontSize: "11px" }}
                      >
                        {t.status === "done" ? "Thành công" : t.status === "error" ? "Thất bại" : "Đang chạy"}
                      </span>
                    </td>
                    <td style={{ paddingRight: "24px" }}>
                      <small className={t.status === "error" ? "text-danger fw-semibold" : "text-muted"}>
                        {t.errorMessage || "Hoàn tất bình thường"}
                      </small>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ManageAI;