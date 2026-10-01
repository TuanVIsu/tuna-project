// src/admin/AdminLogin.jsx
import React, { useState, useEffect } from "react";
import logoImg from "../assets/logo.png";

// Đổi đường dẫn trỏ thẳng đến máy chủ Render
const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export const AdminLogin = ({ onLoginSuccess, onBackToApp }) => {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modal xin cấp quyền qua Google
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [googleUser, setGoogleUser] = useState(null);
  const [requestedRole, setRequestedRole] = useState("instructor");
  const [requestReason, setRequestReason] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Modal yêu cầu Super Admin cấp lại mật khẩu
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotNote, setForgotNote] = useState("");
  const [submittingForgot, setSubmittingForgot] = useState(false);
  const [forgotFeedback, setForgotFeedback] = useState({ type: "", text: "" });

  // 1. Xử lý khi đăng nhập qua Nút Google chính
  const handleGoogleLoginResponse = async (response) => {
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/admin-google-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          credential: response.credential,
          intent: "login" 
        }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem("admin_token", data.token);
        localStorage.setItem("admin_profile", JSON.stringify(data.admin));
        if (onLoginSuccess) onLoginSuccess(data.admin);
      } else {
        setErrorMsg(data.message || "Tài khoản Google này chưa được cấp quyền quản trị trên hệ thống!");
      }
    } catch (err) {
      setErrorMsg("Không thể kết nối đến máy chủ Backend!");
    } finally {
      setLoading(false);
    }
  };

  // Khởi tạo nút Google Sign-In chính
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const initGsi = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleLoginResponse,
        });

        const target = document.getElementById("googleCustomBtn");
        if (target) {
          window.google.accounts.id.renderButton(target, {
            theme: "outline",
            size: "large",
            width: 330,
            shape: "pill",
            text: "continue_with",
          });
        }
      }
    };

    if (window.google?.accounts?.id) {
      initGsi();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGsi;
      document.body.appendChild(script);
    }
  }, []);

  // 2. Kích hoạt luồng "Yêu cầu cấp quyền" bằng Google OAuth2 Token Client
  const handleTriggerGoogleAccessRequest = () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!window.google?.accounts?.oauth2) {
      alert("Đang tải dịch vụ xác thực Google, vui lòng thử lại sau 2 giây.");
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "email profile openid",
      callback: async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          setLoading(true);
          try {
            const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
            });
            const userInfo = await userInfoRes.json();

            if (userInfo && userInfo.email) {
              setGoogleUser({
                name: userInfo.name || "Người dùng Google",
                email: userInfo.email,
                avatar: userInfo.picture || "",
                googleId: userInfo.sub,
              });
              setShowPermissionModal(true);
            } else {
              setErrorMsg("Không lấy được thông tin từ tài khoản Google đã chọn.");
            }
          } catch (err) {
            setErrorMsg("Lỗi khi kết nối đến dịch vụ xác thực Google.");
          } finally {
            setLoading(false);
          }
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: "select_account" });
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/admin-password-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, password }),
      });

      const data = await res.json();
      if (data.success) {
        localStorage.setItem("admin_token", data.token);
        localStorage.setItem("admin_profile", JSON.stringify(data.admin));
        if (onLoginSuccess) onLoginSuccess(data.admin);
      } else {
        setErrorMsg(data.message || "Tài khoản hoặc mật khẩu không chính xác.");
      }
    } catch (err) {
      setErrorMsg("Không thể kết nối đến máy chủ Backend!");
    } finally {
      setLoading(false);
    }
  };

  // Gửi đơn xin cấp quyền quản trị
  const handleSendPermissionRequest = async (e) => {
    e.preventDefault();
    if (!googleUser) return;
    setSubmittingRequest(true);

    try {
      const res = await fetch(`${API_BASE}/auth/admin-request-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: googleUser.name,
          email: googleUser.email,
          avatar: googleUser.avatar,
          requestedRole,
          reason: requestReason,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowPermissionModal(false);
        setSuccessMsg("✅ Đã gửi đơn thành công! Vui lòng chờ Super Admin phê duyệt.");
        setRequestReason("");
      } else {
        alert(data.message || "Lỗi khi gửi yêu cầu.");
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ khi gửi đơn.");
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Gửi yêu cầu quên mật khẩu
  const handleSendForgotPasswordRequest = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setSubmittingForgot(true);
    setForgotFeedback({ type: "", text: "" });

    try {
      const res = await fetch(`${API_BASE}/auth/admin-request-reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail,
          note: forgotNote,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowForgotModal(false);
        setSuccessMsg("✅ Yêu cầu đặt lại mật khẩu đã gửi đến Super Admin! Vui lòng đợi xét duyệt.");
        setForgotEmail("");
        setForgotNote("");
      } else {
        setForgotFeedback({ type: "danger", text: data.message || "Lỗi gửi yêu cầu." });
      }
    } catch (err) {
      setForgotFeedback({ type: "danger", text: "Lỗi kết nối máy chủ khi gửi đơn." });
    } finally {
      setSubmittingForgot(false);
    }
  };

  return (
    <div
      className="d-flex align-items-center justify-content-center w-100 position-fixed top-0 start-0 z-3 p-3"
      style={{
        height: "100vh",
        backgroundColor: "#EDF2F7",
        overflowY: "auto",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div
        className="card border-0 d-flex flex-column flex-md-row overflow-hidden position-relative"
        style={{
          width: "100%",
          maxWidth: "880px",
          minHeight: "530px",
          borderRadius: "36px",
          backgroundColor: "#ffffff",
          boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.12)",
        }}
      >
        {/* ================= CỘT TRÁI: BANNER ================= */}
        <div
          className="col-12 col-md-5 p-4 p-lg-5 d-flex flex-column justify-content-between align-items-center text-center text-white position-relative"
          style={{ background: "linear-gradient(180deg, #185bf0 0%, #1546cd 100%)" }}
        >
          <div
            className="position-absolute rounded-circle pointer-events-none"
            style={{
              width: "260px",
              height: "260px",
              top: "-70px",
              left: "-70px",
              background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)",
            }}
          />

          <div className="d-flex flex-column align-items-center w-100 pt-2 position-relative z-1">
            <img
              src={logoImg}
              alt="Logo"
              className="rounded-circle mb-3 shadow-sm bg-white p-1"
              style={{
                width: "64px",
                height: "64px",
                objectFit: "contain",
                border: "3px solid #dbeafe",
              }}
            />
            <h4 className="fw-bold text-white mb-2 d-flex align-items-center justify-content-center gap-1.5" style={{ fontSize: "21px", letterSpacing: "0.5px" }}>
              TUNA Portal <span style={{ color: "#60a5fa", fontSize: "22px", lineHeight: "0" }}>•</span>
            </h4>
            <div style={{ width: "34px", height: "3px", background: "rgba(255,255,255,0.45)", borderRadius: "3px" }} />
          </div>

          <div className="my-auto py-4 px-2 w-100 position-relative z-1">
            <h2 className="fw-bolder text-white mb-3" style={{ fontSize: "29px", letterSpacing: "-0.5px" }}>
              Chào buổi sáng!
            </h2>
            <p className="text-white small mb-0 opacity-85" style={{ fontSize: "13px", lineHeight: "1.65", maxWidth: "260px", margin: "0 auto" }}>
              Đăng nhập để tiếp tục lộ trình học tập và làm việc hiệu quả của bạn.
            </p>
          </div>

          <div className="pb-1 position-relative z-1">
            <small className="text-white opacity-60 font-medium" style={{ fontSize: "11px", letterSpacing: "0.2px" }}>
              Hệ sinh thái học tập thích ứng thông minh
            </small>
          </div>
        </div>

        {/* ================= CỘT PHẢI: FORM ĐĂNG NHẬP ================= */}
        <div className="col-12 col-md-7 p-4 p-lg-5 d-flex flex-column justify-content-between position-relative bg-white">
          <div
            className="position-absolute top-0 end-0 pointer-events-none"
            style={{
              width: "115px",
              height: "115px",
              background: "linear-gradient(135deg, #1b84f5 0%, #38bdf8 100%)",
              borderBottomLeftRadius: "115px",
            }}
          />

          <div className="w-100" style={{ maxWidth: "330px", margin: "0 auto" }}>
            <div className="text-center mb-4">
              <h3 className="fw-bolder mb-1" style={{ color: "#185bf0", fontSize: "27px", letterSpacing: "-0.5px" }}>
                welcome
              </h3>
              <p className="text-muted small mb-0 font-medium" style={{ fontSize: "12.5px" }}>
                Đăng nhập tài khoản để tiếp tục
              </p>
            </div>

            {errorMsg && (
              <div
                className="p-2.5 rounded-3 mb-3 d-flex align-items-center gap-2 border"
                style={{ background: "#fef2f2", borderColor: "#fecaca", color: "#dc2626" }}
              >
                <i className="bi bi-exclamation-circle-fill flex-shrink-0"></i>
                <span style={{ fontSize: "11.5px", fontWeight: "600" }}>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div
                className="p-2.5 rounded-3 mb-3 d-flex align-items-center gap-2 border"
                style={{ background: "#f0fdf4", borderColor: "#bbf7d0", color: "#16a34a" }}
              >
                <i className="bi bi-check-circle-fill flex-shrink-0"></i>
                <span style={{ fontSize: "11.5px", fontWeight: "600" }}>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handlePasswordLogin} className="d-flex flex-column">
              <div className="mb-3">
                <input
                  type="text"
                  required
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="Email hoặc Tên đăng nhập"
                  className="form-control rounded-pill text-dark shadow-none"
                  style={{
                    fontSize: "13px",
                    background: "#F0F5FF",
                    border: "1px solid #E2E8F0",
                    height: "46px",
                    paddingLeft: "20px",
                    paddingRight: "20px",
                    fontWeight: "500",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#2563eb";
                    e.target.style.background = "#ffffff";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E2E8F0";
                    e.target.style.background = "#F0F5FF";
                  }}
                />
              </div>

              <div
                className="d-flex align-items-center rounded-pill mb-2 transition"
                style={{
                  background: "#F0F5FF",
                  border: "1px solid #E2E8F0",
                  height: "46px",
                  paddingLeft: "20px",
                  paddingRight: "16px",
                }}
                id="passwordInputWrapper"
              >
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mật khẩu"
                  className="border-0 bg-transparent text-dark shadow-none flex-grow-1"
                  style={{
                    fontSize: "13px",
                    outline: "none",
                    fontWeight: "500",
                    height: "100%",
                    padding: "0",
                  }}
                  onFocus={() => {
                    const el = document.getElementById("passwordInputWrapper");
                    if (el) {
                      el.style.borderColor = "#2563eb";
                      el.style.background = "#ffffff";
                    }
                  }}
                  onBlur={() => {
                    const el = document.getElementById("passwordInputWrapper");
                    if (el) {
                      el.style.borderColor = "#E2E8F0";
                      el.style.background = "#F0F5FF";
                    }
                  }}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="btn btn-link p-0 text-secondary d-flex align-items-center justify-content-center text-decoration-none border-0 ms-2"
                  style={{ width: "28px", height: "28px", cursor: "pointer" }}
                >
                  <i
                    className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`}
                    style={{ fontSize: "16px", color: "#64748B" }}
                  ></i>
                </button>
              </div>

              {/* Bấm Quên mật khẩu */}
              <div className="text-end mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setForgotFeedback({ type: "", text: "" });
                    setForgotEmail(account.includes("@") ? account : "");
                    setShowForgotModal(true);
                  }}
                  className="btn btn-link p-0 text-muted text-decoration-none border-0 shadow-none"
                  style={{ fontSize: "11.5px", fontWeight: "500" }}
                >
                  Quên mật khẩu?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary rounded-pill py-2.5 fw-bold shadow-sm border-0 w-100 transition"
                style={{
                  background: "#185bf0",
                  fontSize: "13px",
                  letterSpacing: "0.5px",
                  height: "46px",
                }}
              >
                {loading ? "ĐANG XỬ LÝ..." : "ĐĂNG NHẬP"}
              </button>
            </form>

            <div className="d-flex align-items-center my-3 text-muted">
              <hr className="flex-grow-1 my-0 opacity-20" />
              <span className="px-2 small text-uppercase fw-semibold" style={{ fontSize: "10px", letterSpacing: "1px", color: "#94a3b8" }}>
                HOẶC
              </span>
              <hr className="flex-grow-1 my-0 opacity-20" />
            </div>

            {/* Nút Đăng nhập Google */}
            <div className="d-flex justify-content-center mb-3">
              <div id="googleCustomBtn"></div>
            </div>

            {/* Yêu cầu cấp quyền */}
            <div className="text-center">
              <p className="text-muted mb-1" style={{ fontSize: "11.5px" }}>
                Chưa có tài khoản?{" "}
                <button
                  type="button"
                  onClick={handleTriggerGoogleAccessRequest}
                  className="btn btn-link p-0 fw-bold text-decoration-none shadow-none"
                  style={{ color: "#185bf0", fontSize: "11.5px" }}
                >
                  Yêu cầu cấp quyền
                </button>
              </p>
            </div>
          </div>

          <div className="text-center mt-3 pt-2">
            <small className="text-muted" style={{ fontSize: "10px", opacity: 0.65 }}>
              © TUNA Ecosystem • WRR Adaptive
            </small>
          </div>
        </div>
      </div>

      {/* Modal 1: Cấp quyền Google */}
      {showPermissionModal && googleUser && (
        <div
          className="modal show d-block p-3"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", backdropFilter: "blur(6px)", zIndex: 1050 }}
          tabIndex="-1"
        >
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "440px" }}>
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: "20px", backgroundColor: "#ffffff", overflow: "hidden" }}>
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2">
                <div className="d-flex align-items-center gap-2.5">
                  <div
                    className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                    style={{ width: "36px", height: "36px", background: "#EFF6FF", color: "#2563eb" }}
                  >
                    <i className="bi bi-shield-check fs-5"></i>
                  </div>
                  <div>
                    <h6 className="fw-bold mb-0 text-dark" style={{ fontSize: "15px", letterSpacing: "-0.2px" }}>
                      Yêu Cầu Cấp Quyền
                    </h6>
                    <small className="text-muted" style={{ fontSize: "11.5px" }}>
                      Xác thực qua tài khoản Google
                    </small>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPermissionModal(false)}
                  className="btn btn-sm btn-light rounded-circle d-flex align-items-center justify-content-center text-secondary p-0"
                  style={{ width: "28px", height: "28px" }}
                >
                  <i className="bi bi-x-lg" style={{ fontSize: "12px" }}></i>
                </button>
              </div>

              <form onSubmit={handleSendPermissionRequest}>
                <div className="modal-body px-4 py-3 d-flex flex-column gap-3">
                  <div className="p-2.5 px-3 rounded-3 d-flex align-items-center gap-3" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                    <img
                      src={googleUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(googleUser.name)}&background=2563eb&color=fff&bold=true`}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(googleUser.name)}&background=2563eb&color=fff&bold=true`;
                      }}
                      alt="Google Avatar"
                      className="rounded-circle border flex-shrink-0"
                      style={{ width: "40px", height: "40px", objectFit: "cover" }}
                    />
                    <div className="overflow-hidden flex-grow-1">
                      <div className="d-flex align-items-center gap-2">
                        <span className="fw-semibold text-dark text-truncate" style={{ fontSize: "13px" }}>
                          {googleUser.name}
                        </span>
                        <span
                          className="badge d-inline-flex align-items-center gap-1 px-1.5 py-0.5 rounded"
                          style={{
                            background: "#ECFDF5",
                            color: "#059669",
                            border: "1px solid #A7F3D0",
                            fontSize: "9px",
                            fontWeight: "600",
                          }}
                        >
                          <i className="bi bi-check2"></i> Verified
                        </span>
                      </div>
                      <small className="text-secondary d-block text-truncate mt-0.5" style={{ fontSize: "11.5px" }}>
                        {googleUser.email}
                      </small>
                    </div>
                  </div>

                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                      Vai trò đề xuất
                    </label>
                    <select
                      value={requestedRole}
                      onChange={(e) => setRequestedRole(e.target.value)}
                      className="form-select shadow-none"
                      style={{
                        fontSize: "12.5px",
                        height: "40px",
                        borderRadius: "10px",
                        borderColor: "#CBD5E1",
                        background: "#ffffff",
                        fontWeight: "500",
                        color: "#1E293B",
                      }}
                    >
                      <option value="instructor">Giảng viên / Trợ giảng (Quản lý học liệu, lịch thi, thông báo)</option>
                      <option value="moderator">Ban cán sự / Moderator (Kiểm duyệt bài viết cộng đồng)</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                      Lý do & bộ môn phụ trách
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={requestReason}
                      onChange={(e) => setRequestReason(e.target.value)}
                      placeholder="VD: Tôi là giảng viên phụ trách môn Hệ thống phân tán, cần cấp quyền để đăng tải học liệu..."
                      className="form-control shadow-none"
                      style={{
                        fontSize: "12.5px",
                        borderRadius: "10px",
                        borderColor: "#CBD5E1",
                        background: "#ffffff",
                        resize: "none",
                        lineHeight: "1.5",
                      }}
                    ></textarea>
                  </div>
                </div>

                <div className="modal-footer border-0 px-4 pt-2 pb-4 d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPermissionModal(false)}
                    className="btn btn-light rounded-pill px-3.5 py-1.5 text-secondary fw-semibold border shadow-none"
                    style={{ fontSize: "12px", height: "38px" }}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={submittingRequest}
                    className="btn btn-primary rounded-pill px-4 py-1.5 fw-semibold shadow-sm border-0"
                    style={{ background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)", fontSize: "12px", height: "38px" }}
                  >
                    {submittingRequest ? "Đang gửi..." : "Gửi Super Admin duyệt"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Quên mật khẩu */}
      {showForgotModal && (
        <div
          className="modal show d-block p-3"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", backdropFilter: "blur(6px)", zIndex: 1050 }}
          tabIndex="-1"
        >
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "420px" }}>
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: "20px", backgroundColor: "#ffffff", overflow: "hidden" }}>
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2">
                <div className="d-flex align-items-center gap-2.5">
                  <div
                    className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                    style={{ width: "36px", height: "36px", background: "#FEF2F2", color: "#EF4444" }}
                  >
                    <i className="bi bi-key-fill fs-5"></i>
                  </div>
                  <div>
                    <h6 className="fw-bold mb-0 text-dark" style={{ fontSize: "15px", letterSpacing: "-0.2px" }}>
                      Khôi Phục Mật Khẩu
                    </h6>
                    <small className="text-muted" style={{ fontSize: "11.5px" }}>
                      Gửi yêu cầu trực tiếp đến Super Admin
                    </small>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="btn btn-sm btn-light rounded-circle d-flex align-items-center justify-content-center text-secondary p-0"
                  style={{ width: "28px", height: "28px" }}
                >
                  <i className="bi bi-x-lg" style={{ fontSize: "12px" }}></i>
                </button>
              </div>

              <form onSubmit={handleSendForgotPasswordRequest}>
                <div className="modal-body px-4 py-3 d-flex flex-column gap-3">
                  {forgotFeedback.text && (
                    <div className={`p-2.5 rounded-3 d-flex align-items-center gap-2 text-${forgotFeedback.type} bg-${forgotFeedback.type}-subtle border border-${forgotFeedback.type}-subtle`} style={{ fontSize: "11.5px" }}>
                      <i className="bi bi-exclamation-triangle-fill"></i>
                      <span>{forgotFeedback.text}</span>
                    </div>
                  )}

                  <div className="p-3 rounded-3" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                    <p className="mb-0 text-secondary" style={{ fontSize: "12px", lineHeight: "1.5" }}>
                      Nhập email đã đăng ký của bạn. Thông tin yêu cầu sẽ chuyển thẳng đến bảng điều khiển của <strong>Super Admin</strong> để duyệt đặt lại mật khẩu.
                    </p>
                  </div>

                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                      Email tài khoản quản trị <span className="text-danger">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="VD: giangvien@ctuet.edu.vn"
                      className="form-control shadow-none"
                      style={{
                        fontSize: "12.5px",
                        height: "40px",
                        borderRadius: "10px",
                        borderColor: "#CBD5E1",
                        background: "#ffffff",
                      }}
                    />
                  </div>

                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                      Ghi chú thêm (Nếu có)
                    </label>
                    <textarea
                      rows={2}
                      value={forgotNote}
                      onChange={(e) => setForgotNote(e.target.value)}
                      placeholder="VD: Cần cấp lại gấp để nhập học liệu..."
                      className="form-control shadow-none"
                      style={{
                        fontSize: "12.5px",
                        borderRadius: "10px",
                        borderColor: "#CBD5E1",
                        background: "#ffffff",
                        resize: "none",
                        lineHeight: "1.5",
                      }}
                    ></textarea>
                  </div>
                </div>

                <div className="modal-footer border-0 px-4 pt-2 pb-4 d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="btn btn-light rounded-pill px-3.5 py-1.5 text-secondary fw-semibold border shadow-none"
                    style={{ fontSize: "12px", height: "38px" }}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={submittingForgot}
                    className="btn btn-danger rounded-pill px-4 py-1.5 fw-semibold shadow-sm border-0"
                    style={{ background: "#EF4444", fontSize: "12px", height: "38px" }}
                  >
                    {submittingForgot ? "Đang gửi..." : "Gửi Super Admin"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLogin;