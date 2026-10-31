// src/admin/ManageMajors.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

export const ManageMajors = () => {
  const [majors, setMajors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDuration, setFilterDuration] = useState("all");
  const [filterModel, setFilterModel] = useState("all");

  // State Modal
  const [showModal, setShowModal] = useState(false);
  const [editingMajor, setEditingMajor] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    major_code: "",
    major_name: "",
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
          `Việc giảm từ ${oldTotalSemesters} học kỳ xuống ${newTotalSemesters} học kỳ có thể khiến các môn thuộc kỳ lớn hơn bị ẩn khỏi bộ lọc.\n` +
          `Bạn có chắc chắn muốn lưu thay đổi này?`
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
      if (d.success) {
        fetchMajors();
      } else {
        alert("Lỗi: " + d.message);
      }
    } catch (e) {
      alert("Lỗi kết nối máy chủ khi xóa");
    }
  };

  const filteredMajors = useMemo(() => {
    return majors.filter((m) => {
      const matchSearch =
        m.major_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.major_code?.toLowerCase().includes(searchTerm.toLowerCase());
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
    <div className="w-100 d-flex flex-column pb-5" style={{ color: "#1e293b" }}>
      {/* 1. KHỐI THẺ CARD ĐIỀU KHIỂN & BỘ LỌC (Đồng bộ chuẩn giao diện Tuna Admin) */}
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
                width: "40px",
                height: "40px",
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
                Thiết lập cấu trúc thời gian đào tạo, số học kỳ/năm và lộ trình tích lũy tín chỉ
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

        {/* Hàng 2: Bộ lọc 3 cấp có viền phân cách */}
        <div className="row g-2.5 pt-3 border-top" style={{ borderColor: "#f1f5f9" }}>
          <div className="col-12 col-md-5">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Tìm kiếm ngành đào tạo
            </label>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0 text-muted ps-2.5">
                <i className="bi bi-search"></i>
              </span>
              <input
                type="text"
                placeholder="Nhập mã ngành (748...) hoặc tên ngành..."
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
                <th style={{ width: "120px" }}>Mã Ngành</th>
                <th>Tên Ngành Đào Tạo</th>
                <th className="text-center" style={{ width: "130px" }}>Thời Gian</th>
                <th className="text-center" style={{ width: "160px" }}>Cấu Trúc Học Kỳ</th>
                <th className="text-center" style={{ width: "130px" }}>Tổng Tín Chỉ</th>
                <th className="text-center" style={{ width: "120px" }}>Môn Trong CTĐT</th>
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
                          className="font-monospace fw-bold px-2.5 py-1 rounded-1 border"
                          style={{ fontSize: "11px", backgroundColor: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}
                        >
                          {item.major_code}
                        </span>
                      </td>
                      <td>
                        <span className="fw-bold text-dark">{item.major_name}</span>
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
                      <td className="text-center">
                        <span className="badge bg-light text-secondary border px-2 py-0.5 font-monospace">
                          {item.subject_count || 0} môn
                        </span>
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

      {/* 3. MODAL CĂN GIỮA TUYỆT ĐỐI (Fixed Overlay Flexbox) */}
      {showModal && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 1065,
            padding: "16px",
          }}
        >
          <div className="bg-white rounded-4 shadow-lg overflow-hidden w-100 border-0" style={{ maxWidth: "480px" }}>
            {/* Modal Header */}
            <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2 border-bottom" style={{ borderColor: "#f1f5f9" }}>
              <div className="d-flex align-items-center gap-2.5">
                <div
                  className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0"
                  style={{ width: "36px", height: "36px", background: "linear-gradient(135deg, #185bf0 0%, #0d9488 100%)" }}
                >
                  <i className={`bi ${editingMajor ? "bi-pencil-square" : "bi-plus-lg"} fs-6`}></i>
                </div>
                <div>
                  <h6 className="fw-bold mb-0 text-dark">
                    {editingMajor ? "Chỉnh Sửa Ngành Đào Tạo" : "Thêm Ngành Đào Tạo Mới"}
                  </h6>
                  <small className="text-secondary" style={{ fontSize: "11.5px" }}>
                    Cấu hình quy chuẩn học kỳ và thời lượng chính quy
                  </small>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn btn-sm btn-light rounded-circle p-0 d-flex align-items-center justify-content-center"
                style={{ width: "28px", height: "28px" }}
              >
                <i className="bi bi-x-lg text-secondary" style={{ fontSize: "11px" }}></i>
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSave}>
              <div className="px-4 py-3 d-flex flex-column gap-3">
                <div className="row g-2">
                  <div className="col-4">
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                      Mã Ngành *
                    </label>
                    <input
                      type="text"
                      required
                      disabled={!!editingMajor}
                      placeholder="7480104"
                      value={formData.major_code}
                      onChange={(e) => setFormData({ ...formData, major_code: e.target.value })}
                      className="form-control form-control-sm rounded-3 fw-bold font-monospace text-primary shadow-none"
                      style={{ fontSize: "12.5px" }}
                    />
                  </div>
                  <div className="col-8">
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                      Tên Ngành Đào Tạo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Hệ Thống Thông Tin"
                      value={formData.major_name}
                      onChange={(e) => setFormData({ ...formData, major_name: e.target.value })}
                      className="form-control form-control-sm rounded-3 fw-bold shadow-none"
                      style={{ fontSize: "12.5px" }}
                    />
                  </div>
                </div>

                <div className="row g-2">
                  {/* Ô nhập số năm hỗ trợ 3.5, 4.0, 4.5, 5.0 */}
                  <div className="col-6">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-0" style={{ fontSize: "10px" }}>
                        Thời Gian Đào Tạo
                      </label>
                      <div className="d-flex gap-1">
                        {[3.5, 4, 4.5, 5].map((y) => (
                          <button
                            key={y}
                            type="button"
                            onClick={() => setFormData({ ...formData, total_years: y })}
                            className={`badge border-0 rounded-pill px-1.5 py-0.5 fw-bold cursor-pointer ${
                              parseFloat(formData.total_years) === y
                                ? "bg-primary text-white"
                                : "bg-light text-secondary border"
                            }`}
                            style={{ fontSize: "9px" }}
                          >
                            {y}N
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="input-group input-group-sm">
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        max="7"
                        required
                        value={formData.total_years}
                        onChange={(e) => setFormData({ ...formData, total_years: parseFloat(e.target.value) || 0 })}
                        className="form-control form-control-sm rounded-start-3 fw-bold shadow-none text-center"
                        style={{ fontSize: "13px" }}
                      />
                      <span className="input-group-text bg-light text-secondary fw-semibold" style={{ fontSize: "12px" }}>
                        Năm
                      </span>
                    </div>
                  </div>

                  <div className="col-6">
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                      Cấu Trúc Kỳ Học
                    </label>
                    <select
                      value={formData.semesters_per_year}
                      onChange={(e) => setFormData({ ...formData, semesters_per_year: Number(e.target.value) })}
                      className="form-select form-select-sm rounded-3 fw-semibold shadow-none"
                      style={{ height: "31px" }}
                    >
                      <option value={2}>2 Học kỳ / Năm</option>
                      <option value={3}>3 Học kỳ / Năm (Chuẩn)</option>
                      <option value={4}>4 Học kỳ / Năm</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                    Tổng Số Tín Chỉ Tốt Nghiệp *
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="250"
                    required
                    value={formData.total_credits_required}
                    onChange={(e) => setFormData({ ...formData, total_credits_required: Number(e.target.value) })}
                    className="form-control form-control-sm rounded-3 fw-bold font-monospace shadow-none"
                  />
                </div>

                {/* Hộp Preview trực quan */}
                <div className="p-3 rounded-3 bg-light border d-flex align-items-center gap-2.5">
                  <i className="bi bi-info-circle-fill text-primary fs-5 flex-shrink-0"></i>
                  <small className="text-secondary" style={{ fontSize: "11.5px", lineHeight: "1.4" }}>
                    Chương trình gồm <b>{formData.total_years} năm</b>, mỗi năm <b>{formData.semesters_per_year} kỳ</b>. Tổng lộ trình toàn khóa tương ứng <b>{previewTotalSemesters} học kỳ</b>.
                  </small>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer border-0 px-4 pt-1 pb-4 d-flex justify-content-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-light rounded-pill px-3.5 py-1.5 small border"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary rounded-pill px-4 py-1.5 small border-0 text-white shadow-xs d-flex align-items-center gap-1.5"
                  style={{ background: "#185bf0" }}
                >
                  {saving && <span className="spinner-border spinner-border-sm"></span>}
                  <span>{editingMajor ? "Lưu thay đổi" : "Lưu vào cơ sở dữ liệu"}</span>
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