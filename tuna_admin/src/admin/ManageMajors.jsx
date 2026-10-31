// src/admin/ManageMajors.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

export const ManageMajors = () => {
  const [majors, setMajors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDuration, setFilterDuration] = useState("all");
  const [filterModel, setFilterModel] = useState("all");

  // State Modal Thêm / Sửa
  const [showModal, setShowModal] = useState(false);
  const [editingMajor, setEditingMajor] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    major_code: "",
    major_name: "",
    applied_cohort: "K23",
    total_years: 4,
    semesters_per_year: 3,
    total_credits_required: 130,
    is_active: true,
  });

  const getHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("admin_token") || localStorage.getItem("token") || ""}`,
  }), []);

  const fetchMajors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/majors`, { headers: getHeaders() });
      const d = await res.json();
      if (d.success) setMajors(d.data || []);
    } catch (err) {
      console.error("Lỗi nạp danh sách ngành:", err);
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchMajors();
  }, [fetchMajors]);

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingMajor(item);
      setFormData({
        major_code: item.major_code,
        major_name: item.major_name,
        applied_cohort: item.applied_cohort || "ALL",
        total_years: parseFloat(item.total_years) || 4,
        semesters_per_year: parseInt(item.semesters_per_year, 10) || 3,
        total_credits_required: parseInt(item.total_credits_required, 10) || 130,
        is_active: item.is_active ?? true,
      });
    } else {
      setEditingMajor(null);
      setFormData({
        major_code: "",
        major_name: "",
        applied_cohort: "K23",
        total_years: 4,
        semesters_per_year: 3,
        total_credits_required: 130,
        is_active: true,
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const newYears = parseFloat(formData.total_years) || 4;
    const newSemPerYear = parseInt(formData.semesters_per_year, 10) || 3;
    const newTotalSemesters = Math.ceil(newYears * newSemPerYear);

    if (editingMajor && Number(editingMajor.subject_count) > 0) {
      const oldYears = parseFloat(editingMajor.total_years) || 4;
      const oldSemPerYear = parseInt(editingMajor.semesters_per_year, 10) || 3;
      const oldTotalSemesters = Math.ceil(oldYears * oldSemPerYear);

      if (newTotalSemesters < oldTotalSemesters) {
        const confirmReduce = window.confirm(
          `Cảnh báo: Ngành này đang có ${editingMajor.subject_count} môn học trong CTĐT.\n` +
          `Việc giảm từ ${oldTotalSemesters} học kỳ xuống ${newTotalSemesters} học kỳ có thể làm ẩn các môn thuộc những kỳ vượt mức.\n` +
          `Bạn vẫn muốn lưu thay đổi này?`
        );
        if (!confirmReduce) return;
      }
    }

    setSaving(true);
    try {
      const isEdit = !!editingMajor;
      const url = isEdit ? `${API_BASE}/majors/${editingMajor.id}` : `${API_BASE}/majors`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify({
          ...formData,
          total_years: newYears,
          semesters_per_year: newSemPerYear,
          total_credits_required: parseInt(formData.total_credits_required, 10) || 130,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setShowModal(false);
        fetchMajors();
      } else {
        alert("Lỗi: " + (d.message || "Không thể lưu cấu hình ngành"));
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (Number(item.subject_count) > 0) {
      alert(`Không thể xóa ngành "${item.major_name}" vì đang có ${item.subject_count} học phần trong khung CTĐT!`);
      return;
    }
    if (!window.confirm(`Xác nhận xóa hoàn toàn ngành [${item.major_code}] ${item.major_name}?`)) return;

    try {
      const res = await fetch(`${API_BASE}/majors/${item.id}`, { method: "DELETE", headers: getHeaders() });
      const d = await res.json();
      if (d.success) fetchMajors();
      else alert("Lỗi: " + d.message);
    } catch (e) {
      alert("Lỗi kết nối máy chủ khi xóa");
    }
  };

  const filteredMajors = useMemo(() => {
    return majors.filter((m) => {
      const matchSearch =
        m.major_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.major_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.applied_cohort?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchDuration =
        filterDuration === "all" || parseFloat(m.total_years) === parseFloat(filterDuration);
      const matchModel =
        filterModel === "all" || parseInt(m.semesters_per_year, 10) === parseInt(filterModel, 10);
      return matchSearch && matchDuration && matchModel;
    });
  }, [majors, searchTerm, filterDuration, filterModel]);

  const previewTotalSemesters = Math.ceil(
    (parseFloat(formData.total_years) || 0) * (parseInt(formData.semesters_per_year, 10) || 0)
  );

  return (
    <div className="w-100 d-flex flex-column pb-5" style={{ color: "#0f172a" }}>
      {/* 1. KHỐI THẺ CARD ĐIỀU KHIỂN & BỘ LỌC */}
      <div
        className="bg-white rounded-4 p-4 border shadow-sm mb-4"
        style={{ borderColor: "#f1f5f9", boxShadow: "0 4px 16px rgba(0,0,0,0.03)" }}
      >
        {/* Hàng 1: Tiêu đề & Nút thao tác chính */}
        <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mb-3">
          <div className="d-flex align-items-center gap-3">
            <div
              className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0 shadow-sm"
              style={{
                width: "42px",
                height: "42px",
                background: "linear-gradient(135deg, #185bf0 0%, #0d9488 100%)",
              }}
            >
              <i className="bi bi-diagram-3-fill fs-5"></i>
            </div>
            <div>
              <div className="d-flex align-items-center gap-2">
                <h5 className="fw-black text-dark mb-0 fs-6">
                  Quản Lý Ngành Đào Tạo
                </h5>
                <span
                  className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1"
                  style={{ fontSize: "10.5px" }}
                >
                  {majors.length} Chuyên Ngành
                </span>
              </div>
              <small className="text-secondary fw-medium d-block mt-0.5" style={{ fontSize: "12px" }}>
                Thiết lập cấu trúc khóa tuyển sinh, số năm đào tạo và số học kỳ/năm
              </small>
            </div>
          </div>

          <button
            onClick={() => handleOpenModal()}
            className="btn btn-primary rounded-pill px-3.5 py-2 fw-bold text-white border-0 shadow-xs d-flex align-items-center gap-1.5 flex-shrink-0 cursor-pointer text-nowrap"
            style={{ fontSize: "12.5px", background: "#185bf0" }}
          >
            <i className="bi bi-plus-circle-fill"></i>
            <span>Thêm Ngành Mới</span>
          </button>
        </div>

        {/* Hàng 2: Bộ lọc 3 cấp tiêu chuẩn */}
        <div className="row g-2.5 pt-3 border-top" style={{ borderColor: "#f1f5f9" }}>
          <div className="col-12 col-md-5">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Tìm kiếm ngành hoặc khóa
            </label>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0 text-muted ps-2.5">
                <i className="bi bi-search"></i>
              </span>
              <input
                type="text"
                placeholder="Nhập mã ngành, tên ngành hoặc khóa (K23)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-control form-control-sm rounded-end-3 fw-semibold bg-light border shadow-none"
                style={{ fontSize: "12.5px" }}
              />
            </div>
          </div>

          <div className="col-6 col-md-3">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Thời Gian Đào Tạo
            </label>
            <select
              value={filterDuration}
              onChange={(e) => setFilterDuration(e.target.value)}
              className="form-select form-select-sm rounded-3 fw-semibold bg-light border shadow-none"
              style={{ fontSize: "12.5px" }}
            >
              <option value="all">Tất cả thời gian</option>
              <option value="3">3.0 Năm (Học nhanh)</option>
              <option value="3.5">3.5 Năm (Học vượt)</option>
              <option value="4">4.0 Năm (Cử nhân chuẩn)</option>
              <option value="4.5">4.5 Năm (Kỹ sư / Cử nhân + TN)</option>
              <option value="5">5.0 Năm (Kỹ sư chuyên sâu)</option>
            </select>
          </div>

          <div className="col-6 col-md-4">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Mô Hình Học Kỳ
            </label>
            <select
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              className="form-select form-select-sm rounded-3 fw-semibold bg-light border shadow-none text-primary"
              style={{ fontSize: "12.5px" }}
            >
              <option value="all">Tất cả mô hình</option>
              <option value="2">2 Học kỳ / Năm</option>
              <option value="3">3 Học kỳ / Năm (Chuẩn Tuna)</option>
              <option value="4">4 Học kỳ / Năm (Quarter)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. KHỐI BẢNG DỮ LIỆU DANH SÁCH NGÀNH */}
      <div
        className="bg-white rounded-4 p-4 border shadow-sm d-flex flex-column gap-3"
        style={{ borderColor: "#f1f5f9", boxShadow: "0 4px 16px rgba(0,0,0,0.03)" }}
      >
        <div className="d-flex justify-content-between align-items-center pb-1">
          <span
            className="badge rounded-pill px-3 py-2 fw-bold text-white shadow-2xs d-inline-flex align-items-center gap-1.5"
            style={{ background: "#185bf0", fontSize: "12px" }}
          >
            <i className="bi bi-mortarboard-fill"></i>
            Danh Sách Ngành ({filteredMajors.length})
          </span>
          <small className="text-secondary fw-semibold">
            Tổng: <b>{majors.reduce((acc, cur) => acc + (Number(cur.subject_count) || 0), 0)}</b> môn học đã ban hành
          </small>
        </div>

        <div className="table-responsive" style={{ minHeight: "260px" }}>
          <table className="table table-hover align-middle mb-0 text-nowrap">
            <thead className="table-light">
              <tr style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.5px" }} className="text-uppercase">
                <th className="ps-3 text-center" style={{ width: "50px" }}>STT</th>
                <th style={{ width: "110px" }}>Mã Ngành</th>
                <th>Tên Ngành Đào Tạo</th>
                <th className="text-center" style={{ width: "120px" }}>Khóa Tuyển Sinh</th>
                <th className="text-center" style={{ width: "120px" }}>Thời Gian</th>
                <th className="text-center" style={{ width: "150px" }}>Cấu Trúc Học Kỳ</th>
                <th className="text-center" style={{ width: "120px" }}>Tổng Tín Chỉ</th>
                <th className="text-end pe-3" style={{ width: "90px" }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: "13px" }}>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    <div className="spinner-border spinner-border-sm text-primary me-2"></div>
                    Đang nạp dữ liệu ngành...
                  </td>
                </tr>
              ) : filteredMajors.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    <i className="bi bi-inbox fs-2 d-block text-secondary opacity-50 mb-1"></i>
                    Không tìm thấy ngành đào tạo nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredMajors.map((item, index) => {
                  const years = parseFloat(item.total_years) || 4;
                  const semPerYear = parseInt(item.semesters_per_year, 10) || 3;
                  const totalSem = Math.ceil(years * semPerYear);

                  return (
                    <tr key={item.id}>
                      <td className="ps-3 fw-bold text-muted text-center" style={{ fontSize: "11.5px" }}>
                        #{index + 1}
                      </td>
                      <td>
                        <span
                          className="font-monospace fw-bold px-2 py-0.5 rounded-1 border"
                          style={{ fontSize: "11px", backgroundColor: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}
                        >
                          {item.major_code}
                        </span>
                      </td>
                      <td>
                        <span className="fw-bold text-dark">{item.major_name}</span>
                      </td>
                      <td className="text-center">
                        <span className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1 font-monospace fw-bold" style={{ fontSize: "11px" }}>
                          {item.applied_cohort === "ALL" || !item.applied_cohort ? "Tất cả khóa" : `Khóa ${item.applied_cohort}`}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className="badge rounded-pill bg-light text-secondary border px-2.5 py-1 fw-bold">
                          {years} Năm
                        </span>
                      </td>
                      <td className="text-center">
                        <span
                          className="badge rounded-pill px-2.5 py-1 fw-bold"
                          style={{
                            background: "#eff6ff",
                            color: "#185bf0",
                            border: "1px solid #bfdbfe",
                            fontSize: "11px",
                          }}
                        >
                          {semPerYear} Kỳ/Năm ({totalSem} HK)
                        </span>
                      </td>
                      <td className="text-center fw-bold text-dark font-monospace">
                        {item.total_credits_required || 130} TC
                      </td>
                      <td className="text-end pe-3">
                        <div className="d-flex align-items-center justify-content-end gap-1.5">
                          <button
                            onClick={() => handleOpenModal(item)}
                            className="btn btn-sm btn-light rounded-circle border p-0 d-inline-flex align-items-center justify-content-center"
                            style={{ width: "30px", height: "30px" }}
                            title="Chỉnh sửa cấu hình"
                          >
                            <i className="bi bi-pencil-fill text-primary" style={{ fontSize: "11px" }}></i>
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="btn btn-sm btn-light rounded-circle border p-0 d-inline-flex align-items-center justify-content-center"
                            style={{ width: "30px", height: "30px" }}
                            title="Xóa ngành"
                          >
                            <i className="bi bi-trash3-fill text-danger" style={{ fontSize: "11px" }}></i>
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
      </div>

      {/* 3. MODAL THÊM / SỬA: KHÓA TUYỂN SINH CHO PHÉP TỰ NHẬP */}
      {showModal && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(6px)",
            zIndex: 1065,
            padding: "20px",
          }}
        >
          <div
            className="bg-white rounded-4 shadow-2xl overflow-hidden w-100 border-0 d-flex flex-column"
            style={{ maxWidth: "520px", animation: "fadeIn 0.2s ease-out" }}
          >
            {/* Modal Header */}
            <div
              className="d-flex align-items-center justify-content-between px-4 py-3 border-bottom bg-white"
              style={{ borderColor: "#f1f5f9" }}
            >
              <div className="d-flex align-items-center gap-3">
                <div
                  className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0 shadow-xs"
                  style={{
                    width: "40px",
                    height: "40px",
                    background: "linear-gradient(135deg, #185bf0 0%, #0d9488 100%)",
                  }}
                >
                  <i className={`bi ${editingMajor ? "bi-pencil-square" : "bi-plus-lg"} fs-5`}></i>
                </div>
                <div>
                  <h6 className="fw-black mb-0 text-slate-900" style={{ fontSize: "15.5px", letterSpacing: "-0.2px" }}>
                    {editingMajor ? "Chỉnh Sửa Ngành Đào Tạo" : "Thêm Ngành Đào Tạo Mới"}
                  </h6>
                  <small className="text-secondary fw-medium" style={{ fontSize: "12px" }}>
                    Cấu hình chuyên ngành, khóa tuyển sinh và thời lượng chính quy
                  </small>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn btn-sm btn-light rounded-circle p-0 d-flex align-items-center justify-content-center border-0 text-secondary"
                style={{ width: "32px", height: "32px", backgroundColor: "#f8fafc" }}
              >
                <i className="bi bi-x-lg" style={{ fontSize: "12px" }}></i>
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSave} className="d-flex flex-column m-0">
              <div className="px-4 py-3.5 d-flex flex-column gap-3">
                
                {/* Hàng 1: Mã ngành & Tên ngành */}
                <div className="row g-3">
                  <div className="col-4">
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "10.5px" }}>
                      MÃ NGÀNH *
                    </label>
                    <input
                      type="text"
                      required
                      disabled={!!editingMajor}
                      placeholder="7480104"
                      value={formData.major_code}
                      onChange={(e) => setFormData({ ...formData, major_code: e.target.value })}
                      className="form-control rounded-3 fw-bold font-monospace text-primary border"
                      style={{ height: "40px", fontSize: "13px", borderColor: "#cbd5e1" }}
                    />
                  </div>
                  <div className="col-8">
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1.5" style={{ fontSize: "10.5px" }}>
                      TÊN NGÀNH ĐÀO TẠO *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Hệ Thống Thông Tin"
                      value={formData.major_name}
                      onChange={(e) => setFormData({ ...formData, major_name: e.target.value })}
                      className="form-control rounded-3 fw-bold text-dark border"
                      style={{ height: "40px", fontSize: "13px", borderColor: "#cbd5e1" }}
                    />
                  </div>
                </div>

                {/* Hàng 2: Khóa Tuyển Sinh Áp Dụng (TỰ NHẬP) & Cấu trúc kỳ học */}
                <div className="row g-3">
                  <div className="col-6">
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1.5 text-truncate" style={{ fontSize: "10.5px" }}>
                      KHÓA TUYỂN SINH ÁP DỤNG *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: K23 (hoặc Tất cả)"
                      value={formData.applied_cohort}
                      onChange={(e) => setFormData({ ...formData, applied_cohort: e.target.value.toUpperCase() })}
                      className="form-control rounded-3 fw-bold font-monospace text-primary border"
                      style={{ height: "40px", fontSize: "13px", borderColor: "#cbd5e1" }}
                    />
                  </div>

                  <div className="col-6">
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1.5 text-truncate" style={{ fontSize: "10.5px" }}>
                      CẤU TRÚC KỲ HỌC
                    </label>
                    <select
                      value={formData.semesters_per_year}
                      onChange={(e) => setFormData({ ...formData, semesters_per_year: Number(e.target.value) })}
                      className="form-select rounded-3 fw-semibold border text-dark"
                      style={{ height: "40px", fontSize: "13px", borderColor: "#cbd5e1" }}
                    >
                      <option value={2}>2 Học kỳ / Năm</option>
                      <option value={3}>3 Học kỳ / Năm (Chuẩn)</option>
                      <option value={4}>4 Học kỳ / Năm</option>
                    </select>
                  </div>
                </div>

                {/* Hàng 3: Thời gian đào tạo & Tổng tín chỉ yêu cầu */}
                <div className="row g-3">
                  <div className="col-6">
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1.5 text-truncate" style={{ fontSize: "10.5px" }}>
                      THỜI GIAN ĐÀO TẠO
                    </label>
                    <div className="input-group">
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        max="7"
                        required
                        value={formData.total_years}
                        onChange={(e) => setFormData({ ...formData, total_years: parseFloat(e.target.value) || 0 })}
                        className="form-control rounded-start-3 fw-bold text-center border"
                        style={{ height: "40px", fontSize: "13.5px", borderColor: "#cbd5e1" }}
                      />
                      <span className="input-group-text bg-light text-secondary fw-semibold border border-start-0" style={{ borderColor: "#cbd5e1", fontSize: "12px" }}>
                        Năm
                      </span>
                    </div>
                  </div>

                  <div className="col-6">
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1.5 text-truncate" style={{ fontSize: "10.5px" }}>
                      TỔNG SỐ TÍN CHỈ TỐT NGHIỆP *
                    </label>
                    <div className="input-group">
                      <input
                        type="number"
                        min="50"
                        max="250"
                        required
                        value={formData.total_credits_required}
                        onChange={(e) => setFormData({ ...formData, total_credits_required: Number(e.target.value) })}
                        className="form-control rounded-start-3 fw-bold font-monospace border"
                        style={{ height: "40px", fontSize: "13.5px", borderColor: "#cbd5e1" }}
                      />
                      <span className="input-group-text bg-light text-primary fw-bold border border-start-0" style={{ borderColor: "#cbd5e1", fontSize: "12px" }}>
                        Tín chỉ
                      </span>
                    </div>
                  </div>
                </div>

                {/* Hàng 4: Dãy nút chọn nhanh thời gian đào tạo */}
                <div className="d-flex align-items-center gap-1.5 pt-0.5">
                  <span className="text-secondary fw-semibold" style={{ fontSize: "11px" }}>
                    Chọn nhanh:
                  </span>
                  {[
                    { val: 3.5, label: "3.5 Năm" },
                    { val: 4, label: "4.0 Năm" },
                    { val: 4.5, label: "4.5 Năm" },
                    { val: 5, label: "5.0 Năm" },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setFormData({ ...formData, total_years: item.val })}
                      className={`btn btn-sm rounded-pill px-2.5 py-0.5 fw-bold border transition ${
                        parseFloat(formData.total_years) === item.val
                          ? "btn-primary text-white border-primary shadow-xs"
                          : "btn-light text-secondary border bg-white"
                      }`}
                      style={{ fontSize: "11px" }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Hộp Preview Live trực quan */}
                <div
                  className="p-3 rounded-3 d-flex align-items-center gap-3 border"
                  style={{ backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }}
                >
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{ width: "32px", height: "32px", backgroundColor: "#dbeafe", color: "#1d4ed8" }}
                  >
                    <i className="bi bi-info-circle-fill fs-6"></i>
                  </div>
                  <div className="text-slate-700 fw-medium" style={{ fontSize: "12px", lineHeight: "1.4" }}>
                    Khóa áp dụng: <b>{formData.applied_cohort || "Tất cả"}</b> • Lộ trình <b>{formData.total_years} năm</b>, mỗi năm <b>{formData.semesters_per_year} kỳ</b> (tổng <b>{previewTotalSemesters} học kỳ</b>).
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                className="modal-footer border-top px-4 py-3 d-flex justify-content-end gap-2 bg-slate-50/70"
                style={{ borderColor: "#f1f5f9" }}
              >
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-light rounded-pill px-4 py-2 fw-semibold text-secondary border bg-white"
                  style={{ fontSize: "12.5px", height: "38px" }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary rounded-pill px-4 py-2 fw-bold text-white border-0 shadow-xs d-flex align-items-center gap-1.5"
                  style={{ fontSize: "12.5px", height: "38px", background: "#185bf0" }}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm"></span>
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle fs-6"></i>
                      <span>{editingMajor ? "Lưu thay đổi" : "Lưu vào cơ sở dữ liệu"}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageMajors;