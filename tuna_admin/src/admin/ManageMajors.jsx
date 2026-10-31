// src/admin/ManageMajors.jsx
import React, { useState, useEffect, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

export const ManageMajors = () => {
  const [majors, setMajors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingMajor, setEditingMajor] = useState(null);

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
        total_years: item.total_years || 4,
        semesters_per_year: item.semesters_per_year || 3,
        total_credits_required: item.total_credits_required || 130,
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
    try {
      const isEdit = !!editingMajor;
      const url = isEdit ? `${API_BASE}/majors/${editingMajor.id}` : `${API_BASE}/majors`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(formData),
      });
      const d = await res.json();
      if (d.success) {
        setShowModal(false);
        fetchMajors();
      } else {
        alert(d.message || "Lỗi lưu dữ liệu ngành");
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Xác nhận xóa ngành "${name}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/majors/${id}`, { method: "DELETE", headers: getHeaders() });
      const d = await res.json();
      if (d.success) {
        fetchMajors();
      } else {
        alert("Lỗi: " + d.message);
      }
    } catch (e) {
      alert("Lỗi máy chủ khi xóa");
    }
  };

  const filteredMajors = majors.filter(
    (m) =>
      m.major_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.major_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-100 d-flex flex-column pb-5" style={{ color: "#1e293b" }}>
      {/* 1. Header & Bộ lọc */}
      <div className="bg-white rounded-4 p-4 border shadow-sm mb-4" style={{ borderColor: "#f1f5f9" }}>
        <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <div
              className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0 shadow-sm"
              style={{ width: "42px", height: "42px", background: "linear-gradient(135deg, #185bf0 0%, #0d9488 100%)" }}
            >
              <i className="bi bi-diagram-3-fill fs-5"></i>
            </div>
            <div>
              <h5 className="fw-black text-dark mb-0 fs-6">Quản Lý Ngành Đào Tạo</h5>
              <small className="text-secondary fw-medium" style={{ fontSize: "12px" }}>
                Điều chỉnh thời gian đào tạo, cấu trúc số năm và số học kỳ theo ngành
              </small>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            <input
              type="text"
              placeholder="Tìm theo mã hoặc tên ngành..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control form-control-sm rounded-pill px-3 fw-semibold bg-light"
              style={{ maxWidth: "240px", fontSize: "12px" }}
            />
            <button
              onClick={() => handleOpenModal()}
              className="btn btn-sm btn-primary rounded-pill px-3.5 py-2 fw-bold text-white border-0 shadow-xs d-flex align-items-center gap-1.5"
              style={{ fontSize: "12px", background: "#185bf0" }}
            >
              <i className="bi bi-plus-lg"></i>
              <span>Thêm Ngành Mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Bảng Danh sách ngành */}
      <div className="bg-white rounded-4 p-4 border shadow-sm" style={{ borderColor: "#f1f5f9" }}>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 text-nowrap">
            <thead className="table-light">
              <tr style={{ fontSize: "11.5px", color: "#64748b" }} className="text-uppercase">
                <th className="ps-3" style={{ width: "120px" }}>Mã Ngành</th>
                <th>Tên Ngành Đào Tạo</th>
                <th className="text-center" style={{ width: "130px" }}>Thời Gian Đào Tạo</th>
                <th className="text-center" style={{ width: "120px" }}>Cấu Trúc Năm/Kỳ</th>
                <th className="text-center" style={{ width: "120px" }}>Tổng Tín Chỉ</th>
                <th className="text-center" style={{ width: "100px" }}>Môn Trong CTĐT</th>
                <th className="text-end pe-3" style={{ width: "90px" }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: "13px" }}>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-5 text-muted">
                    <div className="spinner-border spinner-border-sm text-primary me-2"></div>
                    Đang nạp danh sách ngành...
                  </td>
                </tr>
              ) : filteredMajors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-5 text-muted">
                    Không tìm thấy ngành đào tạo nào.
                  </td>
                </tr>
              ) : (
                filteredMajors.map((item) => (
                  <tr key={item.id}>
                    <td className="ps-3">
                      <span className="font-monospace fw-bold px-2 py-0.5 rounded-1 border bg-light text-primary" style={{ fontSize: "11.5px" }}>
                        {item.major_code}
                      </span>
                    </td>
                    <td>
                      <span className="fw-bold text-dark">{item.major_name}</span>
                    </td>
                    <td className="text-center">
                      <span className="badge rounded-pill bg-light text-secondary border px-2.5 py-1">
                        {item.total_years || 4} Năm
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1">
                        {item.semesters_per_year || 3} Học kỳ / Năm
                      </span>
                    </td>
                    <td className="text-center fw-bold text-secondary">
                      {item.total_credits_required || 130} TC
                    </td>
                    <td className="text-center">
                      <span className="badge bg-secondary-subtle text-secondary px-2 py-0.5 font-monospace">
                        {item.subject_count || 0} môn
                      </span>
                    </td>
                    <td className="text-end pe-3">
                      <div className="d-flex align-items-center justify-content-end gap-1.5">
                        <button
                          onClick={() => handleOpenModal(item)}
                          className="btn btn-sm btn-light rounded-circle border p-0 d-inline-flex align-items-center justify-content-center"
                          style={{ width: "30px", height: "30px" }}
                          title="Sửa cấu hình"
                        >
                          <i className="bi bi-pencil-fill text-primary" style={{ fontSize: "11px" }}></i>
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, item.major_name)}
                          className="btn btn-sm btn-light rounded-circle border p-0 d-inline-flex align-items-center justify-content-center"
                          style={{ width: "30px", height: "30px" }}
                          title="Xóa ngành"
                        >
                          <i className="bi bi-trash3-fill text-danger" style={{ fontSize: "11px" }}></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Modal Thêm / Chỉnh sửa cấu hình ngành */}
      {showModal && (
        <div className="modal show d-block p-2" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1065 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "480px" }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2">
                <h6 className="fw-bold mb-0 text-dark">
                  {editingMajor ? "Chỉnh Sửa Ngành & Cấu Trúc Đào Tạo" : "Thêm Ngành Đào Tạo Mới"}
                </h6>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-sm btn-light rounded-circle p-0" style={{ width: "28px", height: "28px" }}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              <form onSubmit={handleSave}>
                <div className="modal-body px-4 py-3 d-flex flex-column gap-2.5">
                  <div className="row g-2">
                    <div className="col-4">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Mã Ngành *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="VD: 7480104"
                        value={formData.major_code}
                        onChange={(e) => setFormData({ ...formData, major_code: e.target.value })}
                        className="form-control form-control-sm rounded-3 font-monospace fw-bold"
                      />
                    </div>
                    <div className="col-8">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Tên Ngành Đào Tạo *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="VD: Hệ Thống Thông Tin"
                        value={formData.major_name}
                        onChange={(e) => setFormData({ ...formData, major_name: e.target.value })}
                        className="form-control form-control-sm rounded-3 fw-bold"
                      />
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Thời gian đào tạo (Năm)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="7"
                        value={formData.total_years}
                        onChange={(e) => setFormData({ ...formData, total_years: Number(e.target.value) })}
                        className="form-control form-control-sm rounded-3"
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Mô hình (Số kỳ / Năm)
                      </label>
                      <select
                        value={formData.semesters_per_year}
                        onChange={(e) => setFormData({ ...formData, semesters_per_year: Number(e.target.value) })}
                        className="form-select form-select-sm rounded-3"
                      >
                        <option value={2}>2 Học kỳ / Năm</option>
                        <option value={3}>3 Học kỳ / Năm</option>
                        <option value={4}>4 Học kỳ / Năm (Quarter)</option>
                      </select>
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-12">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Tổng số tín chỉ tốt nghiệp
                      </label>
                      <input
                        type="number"
                        min="50"
                        max="200"
                        value={formData.total_credits_required}
                        onChange={(e) => setFormData({ ...formData, total_credits_required: Number(e.target.value) })}
                        className="form-control form-control-sm rounded-3"
                      />
                    </div>
                  </div>

                  <div className="p-2.5 rounded-3 bg-light border mt-1">
                    <small className="text-secondary d-block" style={{ fontSize: "11px" }}>
                      * Với cấu hình <b>{formData.total_years} năm</b> và <b>{formData.semesters_per_year} học kỳ/năm</b>, lộ trình đào tạo của ngành sẽ gồm tổng cộng <b>{formData.total_years * formData.semesters_per_year} học kỳ</b>.
                    </small>
                  </div>
                </div>

                <div className="modal-footer border-0 px-4 pt-1 pb-4 d-flex justify-content-end gap-2">
                  <button type="button" onClick={() => setShowModal(false)} className="btn btn-light rounded-pill px-3 py-1.5 small border">
                    Hủy
                  </button>
                  <button type="submit" className="btn btn-primary rounded-pill px-3.5 py-1.5 small border-0 text-white" style={{ background: "#185bf0" }}>
                    Lưu cấu hình
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

export default ManageMajors;