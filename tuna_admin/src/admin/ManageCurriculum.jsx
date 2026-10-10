// src/admin/ManageCurriculum.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

export const ManageCurriculum = () => {
  // 1. Dữ liệu Danh mục động từ CSDL (Không gán cứng)
  const [majors, setMajors] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [availableClasses, setAvailableClasses] = useState(["all"]);

  const [selectedMajor, setSelectedMajor] = useState("");
  const [selectedCohort, setSelectedCohort] = useState("");
  const [selectedClass, setSelectedClass] = useState("all");

  // Phân tầng Năm và Học kỳ (Mô hình 3 HK/năm)
  const [selectedYearTab, setSelectedYearTab] = useState(1);
  const [selectedSemester, setSelectedSemester] = useState(1);
  const [curriculumList, setCurriculumList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploading, setUploading] = useState(false);

  // Modal Thêm / Sửa
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    subject_code: "",
    subject_name: "",
    credits_structure: "3(3,0,0)",
    credits: 3,
    subject_type: "mandatory",
    prerequisite: "",
  });

  const getHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("admin_token") || localStorage.getItem("token") || ""}`,
  }), []);

  // 2. Nạp danh mục Ngành, Khóa, Lớp 100% từ CSDL qua /curriculum/meta-options
  useEffect(() => {
    const fetchMetaOptions = async () => {
      try {
        const res = await fetch(`${API_BASE}/curriculum/meta-options`, { headers: getHeaders() });
        const d = await res.json();
        if (d.success && d.data) {
          const mList = d.data.majors || [];
          const cList = d.data.cohorts || [];
          const clsList = d.data.classes || [];

          setMajors(mList);
          setCohorts(cList);

          if (mList.length > 0 && !selectedMajor) {
            setSelectedMajor(mList[0]);
          }
          if (cList.length > 0 && !selectedCohort) {
            setSelectedCohort(cList[0]);
          }

          setAvailableClasses(["all", ...clsList]);
        }
      } catch (err) {
        console.error("Lỗi nạp meta-options:", err);
      }
    };
    fetchMetaOptions();
  }, [getHeaders, selectedMajor, selectedCohort]);

  // 3. Tải danh sách môn học từ CSDL theo bộ lọc
  const fetchCurriculum = useCallback(async () => {
    if (!selectedMajor || !selectedCohort) return;
    setLoading(true);
    try {
      const qSem = new URLSearchParams({
        major: selectedMajor,
        cohort: selectedCohort,
        className: selectedClass,
        semester: selectedSemester,
      }).toString();

      const res = await fetch(`${API_BASE}/curriculum?${qSem}`, { headers: getHeaders() });
      const d = await res.json();
      if (d.success) {
        setCurriculumList(d.data || []);
      }
    } catch (e) {
      console.error("Lỗi nạp CTĐT:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedMajor, selectedCohort, selectedClass, selectedSemester, getHeaders]);

  useEffect(() => {
    fetchCurriculum();
  }, [fetchCurriculum]);

  // Điều hướng kỳ và tab năm tương ứng
  const handleSelectSemester = (sem) => {
    setSelectedSemester(sem);
    if (sem <= 3) setSelectedYearTab(1);
    else if (sem <= 6) setSelectedYearTab(2);
    else if (sem <= 9) setSelectedYearTab(3);
    else setSelectedYearTab(4);
  };

  // Nạp file Excel kế hoạch đào tạo
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const data = new FormData();
    data.append("file", file);

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/curriculum/upload-excel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("admin_token") || localStorage.getItem("token") || ""}` },
        body: data,
      });
      const resData = await res.json();
      if (resData.success) {
        alert(resData.message || "Đã nạp thành công kế hoạch đào tạo từ Excel!");
        fetchCurriculum();
      } else {
        alert("Lỗi: " + resData.message);
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Lưu môn học (Thêm mới hoặc Cập nhật)
  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const isEdit = !!editingItem;
      const url = isEdit ? `${API_BASE}/curriculum/subject/${editingItem.id}` : `${API_BASE}/curriculum/subject`;
      const method = isEdit ? "PUT" : "POST";

      const payload = {
        ...formData,
        major_name: selectedMajor,
        cohort: selectedCohort,
        class_name: selectedClass === "all" ? null : selectedClass,
        semester_index: selectedSemester,
        semester_name: `Học kỳ ${selectedSemester}`,
      };

      const res = await fetch(url, { method, headers: getHeaders(), body: JSON.stringify(payload) });
      const d = await res.json();
      if (d.success) {
        setShowModal(false);
        setEditingItem(null);
        fetchCurriculum();
      } else {
        alert(d.message || "Không thể lưu môn học");
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Xác nhận xóa môn "${name}" khỏi Học kỳ ${selectedSemester}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/curriculum/subject/${id}`, { method: "DELETE", headers: getHeaders() });
      const d = await res.json();
      if (d.success) fetchCurriculum();
    } catch (e) {
      alert("Lỗi khi xóa môn học");
    }
  };

  const filteredList = curriculumList.filter(
    (item) =>
      item.subject_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.subject_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const semCredits = filteredList.reduce((acc, cur) => acc + (Number(cur.credits) || 0), 0);
  const mandatoryCount = filteredList.filter((m) => m.subject_type === "mandatory").length;
  const electiveCount = filteredList.filter((m) => m.subject_type === "elective").length;

  const semestersInYear = {
    1: [1, 2, 3],
    2: [4, 5, 6],
    3: [7, 8, 9],
    4: [10, 11, 12, 13],
  };

  return (
    <div className="w-100 d-flex flex-column pb-5" style={{ color: "#1e293b" }}>
      
      {/* 1. KHỐI ĐIỀU KHIỂN & BỘ LỌC TRUNG TÂM (Đã bổ sung mb-4 tạo khoảng cách rõ ràng) */}
      <div 
        className="bg-white rounded-4 p-4 border shadow-sm mb-4"
        style={{ borderColor: "#f1f5f9", boxShadow: "0 4px 16px rgba(0,0,0,0.03)" }}
      >
        {/* Hàng 1: Tiêu đề & Nút thao tác */}
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
              <i className="bi bi-journal-check fs-5"></i>
            </div>
            <div>
              <div className="d-flex align-items-center gap-2">
                <h5 className="fw-black text-dark mb-0 fs-6">
                  Kế Hoạch Khung Đào Tạo
                </h5>
                <span className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1" style={{ fontSize: "10.5px" }}>
                  Mô hình 3 HK/Năm
                </span>
              </div>
              <small className="text-secondary fw-medium d-block mt-0.5" style={{ fontSize: "12px" }}>
                Quản lý lộ trình học tập, cấu trúc giờ giảng và học phần điều kiện
              </small>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="d-none" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn btn-sm btn-outline-success rounded-pill px-3 py-2 fw-bold d-flex align-items-center gap-1.5 shadow-2xs"
              style={{ fontSize: "12px" }}
            >
              {uploading ? (
                <>
                  <span className="spinner-border spinner-border-sm"></span>
                  <span>Đang nạp file...</span>
                </>
              ) : (
                <>
                  <i className="bi bi-file-earmark-arrow-up"></i>
                  <span>Nhập Excel (.xlsx)</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setEditingItem(null);
                setFormData({
                  subject_code: "",
                  subject_name: "",
                  credits_structure: "3(3,0,0)",
                  credits: 3,
                  subject_type: "mandatory",
                  prerequisite: "",
                });
                setShowModal(true);
              }}
              className="btn btn-sm btn-primary rounded-pill px-3.5 py-2 fw-bold text-white border-0 shadow-xs d-flex align-items-center gap-1.5"
              style={{ fontSize: "12px", background: "#185bf0" }}
            >
              <i className="bi bi-plus-lg"></i>
              <span>Thêm Môn Học</span>
            </button>
          </div>
        </div>

        {/* Hàng 2: Bộ lọc 3 cấp lấy 100% từ CSDL */}
        <div className="row g-2.5 pt-3 border-top" style={{ borderColor: "#f1f5f9" }}>
          <div className="col-12 col-md-5">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Ngành Đào Tạo
            </label>
            <select
              value={selectedMajor}
              onChange={(e) => setSelectedMajor(e.target.value)}
              className="form-select form-select-sm rounded-3 fw-semibold bg-light border shadow-none"
              style={{ fontSize: "12.5px" }}
            >
              {majors.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="col-6 col-md-3">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Khóa Tuyển Sinh
            </label>
            <select
              value={selectedCohort}
              onChange={(e) => setSelectedCohort(e.target.value)}
              className="form-select form-select-sm rounded-3 fw-semibold bg-light border shadow-none"
              style={{ fontSize: "12.5px" }}
            >
              {cohorts.map((c) => (
                <option key={c} value={c}>Khóa {c}</option>
              ))}
            </select>
          </div>

          <div className="col-6 col-md-4">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Lớp Sinh Hoạt
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="form-select form-select-sm rounded-3 fw-semibold bg-light border shadow-none font-monospace text-primary"
              style={{ fontSize: "12.5px" }}
            >
              {availableClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls === "all" ? "Tất cả các lớp" : cls}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Hàng 3: Điều hướng Năm và Kỳ */}
        <div className="pt-3 border-top d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3" style={{ borderColor: "#f1f5f9" }}>
          {/* Chọn Năm */}
          <div className="d-flex align-items-center gap-2">
            <span className="text-secondary small fw-bold text-uppercase" style={{ fontSize: "11px" }}>
              NĂM:
            </span>
            <div className="p-1 bg-light rounded-pill border d-inline-flex gap-1" style={{ borderColor: "#f1f5f9" }}>
              {[
                { id: 1, label: "Năm 1" },
                { id: 2, label: "Năm 2" },
                { id: 3, label: "Năm 3" },
                { id: 4, label: "Năm 4 & TN" },
              ].map((y) => (
                <button
                  key={y.id}
                  onClick={() => {
                    setSelectedYearTab(y.id);
                    handleSelectSemester(semestersInYear[y.id][0]);
                  }}
                  className={`btn btn-sm rounded-pill px-3 py-1 fw-bold border-0 transition ${
                    selectedYearTab === y.id
                      ? "btn-primary text-white shadow-xs"
                      : "text-secondary bg-transparent hover:text-dark"
                  }`}
                  style={{
                    fontSize: "11.5px",
                    background: selectedYearTab === y.id ? "#185bf0" : "transparent",
                  }}
                >
                  {y.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chọn Kỳ */}
          <div className="d-flex align-items-center gap-2 overflow-x-auto">
            <span className="text-secondary small fw-bold text-uppercase" style={{ fontSize: "11px" }}>
              KỲ:
            </span>
            <div className="d-flex align-items-center gap-1.5 flex-nowrap">
              {semestersInYear[selectedYearTab].map((sem) => {
                const isActive = selectedSemester === sem;
                return (
                  <button
                    key={sem}
                    onClick={() => handleSelectSemester(sem)}
                    className={`btn btn-sm rounded-pill px-3 py-1.5 fw-bold transition text-nowrap border-0 ${
                      isActive
                        ? "btn-dark text-white shadow-xs"
                        : "btn-light text-secondary border bg-white"
                    }`}
                    style={{ fontSize: "11.5px" }}
                  >
                    Học kỳ {sem}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 2. KHỐI BẢNG DỮ LIỆU HỌC PHẦN (Cách biệt độc lập, không dính sát viền) */}
      <div 
        className="bg-white rounded-4 p-4 border shadow-sm d-flex flex-column gap-3"
        style={{ borderColor: "#f1f5f9", boxShadow: "0 4px 16px rgba(0,0,0,0.03)" }}
      >
        {/* Header bảng: Huy hiệu thông tin & Thanh tìm kiếm */}
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 pb-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span
              className="badge rounded-pill px-3 py-2 fw-bold text-white shadow-2xs d-inline-flex align-items-center gap-1.5"
              style={{ background: "#185bf0", fontSize: "12px" }}
            >
              <i className="bi bi-mortarboard-fill"></i>
              Học kỳ {selectedSemester} ({filteredList.length} môn)
            </span>

            <span className="badge rounded-pill bg-light text-dark border px-3 py-2 fw-bold" style={{ fontSize: "11.5px" }}>
              Tổng: <b className="text-primary">{semCredits}</b> tín chỉ
            </span>

            <span className="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-3 py-2 fw-bold" style={{ fontSize: "11.5px" }}>
              Bắt buộc: {mandatoryCount}
            </span>

            {electiveCount > 0 && (
              <span className="badge rounded-pill bg-warning-subtle text-amber-900 border border-warning-subtle px-3 py-2 fw-bold" style={{ fontSize: "11.5px" }}>
                Tự chọn: {electiveCount}
              </span>
            )}
          </div>

          <div className="input-group input-group-sm" style={{ maxWidth: "260px" }}>
            <span className="input-group-text bg-light border-end-0 text-muted ps-2.5">
              <i className="bi bi-search"></i>
            </span>
            <input
              type="text"
              placeholder="Tìm theo mã hoặc tên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control bg-light border-start-0 fw-semibold"
              style={{ fontSize: "12px" }}
            />
          </div>
        </div>

        {/* Bảng dữ liệu */}
        <div className="table-responsive" style={{ minHeight: "260px" }}>
          <table className="table table-hover align-middle mb-0 text-nowrap">
            <thead className="table-light">
              <tr style={{ fontSize: "11.5px", color: "#64748b", letterSpacing: "0.5px" }} className="text-uppercase">
                <th className="ps-3 text-center" style={{ width: "50px" }}>STT</th>
                <th style={{ width: "110px" }}>Mã HP</th>
                <th>Tên Học Phần</th>
                <th className="text-center" style={{ width: "120px" }}>Cấu Trúc Giờ</th>
                <th className="text-center" style={{ width: "90px" }}>Số TC</th>
                <th className="text-center" style={{ width: "110px" }}>Tính Chất</th>
                <th>Học Phần Điều Kiện</th>
                <th className="text-end pe-3" style={{ width: "80px" }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: "13px" }}>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    <div className="spinner-border spinner-border-sm text-primary me-2"></div>
                    Đang nạp dữ liệu chương trình học...
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    <i className="bi bi-inbox fs-2 d-block text-secondary opacity-50 mb-1"></i>
                    Chưa có học phần nào cho <b>Học kỳ {selectedSemester}</b>.<br />
                    Bấm nút <b>"Nhập Excel (.xlsx)"</b> ở phía trên để tự động nạp.
                  </td>
                </tr>
              ) : (
                filteredList.map((item, index) => (
                  <tr key={item.id} style={{ transition: "background-color 0.15s" }}>
                    <td className="ps-3 fw-bold text-muted text-center" style={{ fontSize: "11px" }}>
                      #{index + 1}
                    </td>
                    <td>
                      <span
                        className="font-monospace fw-bold px-2 py-0.5 rounded-1 border"
                        style={{ fontSize: "11px", backgroundColor: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}
                      >
                        {item.subject_code}
                      </span>
                    </td>
                    <td>
                      <span className="fw-bold text-dark">{item.subject_name}</span>
                    </td>
                    <td className="text-center font-monospace text-secondary fw-semibold" style={{ fontSize: "11.5px" }}>
                      {item.credits_structure || "3(3,0,0)"}
                    </td>
                    <td className="text-center">
                      <span className="badge bg-light text-dark border px-2 py-0.5 fw-bold" style={{ fontSize: "11px" }}>
                        {item.credits} TC
                      </span>
                    </td>
                    <td className="text-center">
                      <span
                        className={`badge rounded-pill px-2.5 py-1 fw-bold ${
                          item.subject_type === "elective"
                            ? "bg-warning-subtle text-amber-900 border border-warning-subtle"
                            : "bg-primary-subtle text-primary border border-primary-subtle"
                        }`}
                        style={{ fontSize: "10.5px" }}
                      >
                        {item.subject_type === "elective" ? "Tự chọn" : "Bắt buộc"}
                      </span>
                    </td>
                    <td>
                      {item.prerequisite ? (
                        <span
                          className="badge rounded-1 font-monospace px-2 py-0.5 text-danger border border-danger-subtle bg-danger-subtle"
                          style={{ fontSize: "11px" }}
                        >
                          {item.prerequisite}
                        </span>
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                    <td className="text-end pe-3">
                      <div className="d-flex align-items-center justify-content-end gap-1.5">
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setFormData({
                              subject_code: item.subject_code,
                              subject_name: item.subject_name,
                              credits_structure: item.credits_structure || "3(3,0,0)",
                              credits: item.credits,
                              subject_type: item.subject_type,
                              prerequisite: item.prerequisite || "",
                            });
                            setShowModal(true);
                          }}
                          className="btn btn-sm btn-light rounded-circle border p-0 d-inline-flex align-items-center justify-content-center"
                          style={{ width: "30px", height: "30px" }}
                          title="Chỉnh sửa"
                        >
                          <i className="bi bi-pencil-fill text-primary" style={{ fontSize: "11px" }}></i>
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, item.subject_name)}
                          className="btn btn-sm btn-light rounded-circle border p-0 d-inline-flex align-items-center justify-content-center"
                          style={{ width: "30px", height: "30px" }}
                          title="Xóa"
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

        {/* Footer chú thích */}
        <div className="pt-3 border-top d-flex flex-wrap align-items-center justify-content-between gap-2 text-muted" style={{ fontSize: "11.5px", borderColor: "#f1f5f9" }}>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <i className="bi bi-info-circle text-primary"></i>
            <b>Ký hiệu điều kiện:</b>
            <span><code>(a)</code>: Học trước</span>
            <span><code>(b)</code>: Tiên quyết</span>
            <span><code>(c)</code>: Song hành</span>
          </div>
          <div>
            Cấu trúc: <code>Số TC (Lý thuyết, Thực hành, BTL)</code>
          </div>
        </div>
      </div>

      {/* 3. MODAL THÊM / SỬA HỌC PHẦN */}
      {showModal && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1065 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "440px" }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2">
                <h6 className="fw-bold mb-0 text-dark">
                  {editingItem ? "Chỉnh Sửa Học Phần" : `Thêm Môn - Học kỳ ${selectedSemester}`}
                </h6>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-sm btn-light rounded-circle p-0" style={{ width: "28px", height: "28px" }}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              <form onSubmit={handleSave}>
                <div className="modal-body px-4 py-3 d-flex flex-column gap-2.5">
                  <div className="row g-2">
                    <div className="col-5">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Mã Học Phần *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="VD: TT052"
                        value={formData.subject_code}
                        onChange={(e) => setFormData({ ...formData, subject_code: e.target.value })}
                        className="form-control form-control-sm rounded-3 fw-bold font-monospace text-primary"
                      />
                    </div>
                    <div className="col-7">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Tên Học Phần *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="VD: Tin học đại cương"
                        value={formData.subject_name}
                        onChange={(e) => setFormData({ ...formData, subject_name: e.target.value })}
                        className="form-control form-control-sm rounded-3 fw-bold"
                      />
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Cấu trúc TC (LT, TH, BTL)
                      </label>
                      <input
                        type="text"
                        value={formData.credits_structure}
                        onChange={(e) => setFormData({ ...formData, credits_structure: e.target.value })}
                        className="form-control form-control-sm rounded-3 font-monospace"
                        placeholder="VD: 3(2,1,0)"
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Số Tín Chỉ *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="15"
                        value={formData.credits}
                        onChange={(e) => setFormData({ ...formData, credits: Number(e.target.value) })}
                        className="form-control form-control-sm rounded-3 fw-bold"
                      />
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Tính Chất Môn
                      </label>
                      <select
                        value={formData.subject_type}
                        onChange={(e) => setFormData({ ...formData, subject_type: e.target.value })}
                        className="form-select form-select-sm rounded-3 fw-semibold"
                      >
                        <option value="mandatory">Bắt buộc</option>
                        <option value="elective">Tự chọn</option>
                      </select>
                    </div>
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Học Phần Điều Kiện
                      </label>
                      <input
                        type="text"
                        placeholder="VD: TT052(a)"
                        value={formData.prerequisite}
                        onChange={(e) => setFormData({ ...formData, prerequisite: e.target.value })}
                        className="form-control form-control-sm rounded-3 font-monospace"
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer border-0 px-4 pt-1 pb-4 d-flex justify-content-end gap-2">
                  <button type="button" onClick={() => setShowModal(false)} className="btn btn-light rounded-pill px-3 py-1.5 small border">
                    Hủy
                  </button>
                  <button type="submit" className="btn btn-primary rounded-pill px-3.5 py-1.5 small border-0 text-white" style={{ background: "#185bf0" }}>
                    Lưu môn học
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

export default ManageCurriculum;