// src/admin/ManageCurriculum.jsx
import React, { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

const DEFAULT_MAJORS = [
  "Hệ Thống Thông Tin",
  "Công Nghệ Thông Tin",
  "Kỹ Thuật Phần Mềm",
  "An Ninh Mạng",
];
const DEFAULT_COHORTS = ["K25", "K24", "K23", "K22", "K21"];

const DEFAULT_CLASS_MAP = {
  "Hệ Thống Thông Tin_K25": ["HTTT2511"],
  "Hệ Thống Thông Tin_K24": ["HTTT2411"],
  "Hệ Thống Thông Tin_K23": ["HTTT2311"],
  "Hệ Thống Thông Tin_K22": ["HTTT2211"],
  "Công Nghệ Thông Tin_K25": ["CNTT2511"],
  "Công Nghệ Thông Tin_K24": ["CNTT2411"],
  "Công Nghệ Thông Tin_K23": ["CNTT2311"],
  "Kỹ Thuật Phần Mềm_K25": ["KTPM2511"],
  "An Ninh Mạng_K25": ["ANM2511"],
};

export const ManageCurriculum = () => {
  const [majors, setMajors] = useState(DEFAULT_MAJORS);
  const [cohorts, setCohorts] = useState(DEFAULT_COHORTS);
  const [selectedMajor, setSelectedMajor] = useState("Hệ Thống Thông Tin");
  const [selectedCohort, setSelectedCohort] = useState("K25");
  const [selectedClass, setSelectedClass] = useState("HTTT2511");
  const [availableClasses, setAvailableClasses] = useState(["HTTT2511"]);

  // Phân tầng Năm và Học kỳ
  const [selectedYearTab, setSelectedYearTab] = useState(1);
  const [selectedSemester, setSelectedSemester] = useState(1);
  const [curriculumList, setCurriculumList] = useState([]);
  const [allProgramList, setAllProgramList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploading, setUploading] = useState(false);

  // Modal
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

  const getHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
  });

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch(`${API_BASE}/curriculum/meta-options`, { headers: getHeaders() });
        const d = await res.json();
        if (d.success && d.data) {
          if (d.data.majors?.length) setMajors(d.data.majors);
          if (d.data.cohorts?.length) setCohorts(d.data.cohorts);
        }
      } catch (err) {}
    };
    fetchOptions();
  }, []);

  useEffect(() => {
    const key = `${selectedMajor}_${selectedCohort}`;
    const dynamicClasses = DEFAULT_CLASS_MAP[key] || [
      `${selectedMajor.split(" ").map((w) => w[0]).join("")}${selectedCohort.replace("K", "")}11`,
    ];

    setAvailableClasses(["all", ...dynamicClasses]);
    if (!dynamicClasses.includes(selectedClass) && selectedClass !== "all") {
      setSelectedClass(dynamicClasses[0] || "all");
    }
  }, [selectedMajor, selectedCohort]);

  const fetchCurriculum = async () => {
    setLoading(true);
    try {
      const qAll = new URLSearchParams({
        major: selectedMajor,
        cohort: selectedCohort,
        className: selectedClass,
        semester: "all",
      }).toString();

      const qSem = new URLSearchParams({
        major: selectedMajor,
        cohort: selectedCohort,
        className: selectedClass,
        semester: selectedSemester,
      }).toString();

      const [resAll, resSem] = await Promise.all([
        fetch(`${API_BASE}/curriculum?${qAll}`, { headers: getHeaders() }),
        fetch(`${API_BASE}/curriculum?${qSem}`, { headers: getHeaders() }),
      ]);

      const [dAll, dSem] = await Promise.all([resAll.json(), resSem.json()]);
      if (dAll.success) setAllProgramList(dAll.data || []);
      if (dSem.success) setCurriculumList(dSem.data || []);
    } catch (e) {
      console.error("Lỗi nạp CTĐT:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurriculum();
  }, [selectedMajor, selectedCohort, selectedClass, selectedSemester]);

  const handleSelectSemester = (sem) => {
    setSelectedSemester(sem);
    if (sem <= 3) setSelectedYearTab(1);
    else if (sem <= 6) setSelectedYearTab(2);
    else if (sem <= 9) setSelectedYearTab(3);
    else setSelectedYearTab(4);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const data = new FormData();
    data.append("file", file);

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/curriculum/upload-excel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("admin_token")}` },
        body: data,
      });
      const resData = await res.json();
      if (resData.success) {
        alert("Thành công: " + resData.message);
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
        class_name:
          selectedClass === "all"
            ? `${selectedMajor.split(" ").map((w) => w[0]).join("")}${selectedCohort.replace("K", "")}11`
            : selectedClass,
        semester_index: selectedSemester,
        semester_name: `Học kỳ ${selectedSemester}`,
        academic_year: getAcademicYearLabel(selectedSemester),
      };

      const res = await fetch(url, { method, headers: getHeaders(), body: JSON.stringify(payload) });
      const d = await res.json();
      if (d.success) {
        setShowModal(false);
        setEditingItem(null);
        fetchCurriculum();
      } else {
        alert(d.message);
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
      alert("Lỗi khi xóa");
    }
  };

  const getAcademicYearLabel = (sem) => {
    if (sem <= 3) return "Năm 1 (2025-2026)";
    if (sem <= 6) return "Năm 2 (2026-2027)";
    if (sem <= 9) return "Năm 3 (2027-2028)";
    if (sem <= 12) return "Năm 4 (2028-2029)";
    return "Tốt nghiệp (2029-2030)";
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
    <div className="d-flex flex-column gap-3.5 w-100 pb-5">
      {/* 1. KHỐI ĐIỀU KHIỂN & BỘ LỌC TRUNG TÂM */}
      <div className="bg-white border rounded-4 p-4 shadow-sm d-flex flex-column gap-3.5">
        {/* Hàng 1: Tiêu đề & Nút thao tác (Cách ly hoàn toàn, không chèn ép) */}
        <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <div
              className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0 shadow-sm"
              style={{
                width: "44px",
                height: "44px",
                background: "linear-gradient(135deg, #185bf0 0%, #0d9488 100%)",
              }}
            >
              <i className="bi bi-journal-check fs-5"></i>
            </div>
            <div>
              <div className="d-flex align-items-center gap-2">
                <h6 className="fw-bold text-dark mb-0 fs-6">
                  Kế Hoạch Khung Đào Tạo
                </h6>
                <span className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-2 py-0.5" style={{ fontSize: "10px" }}>
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
              className="btn btn-sm btn-outline-success rounded-pill px-3 py-1.5 fw-bold d-flex align-items-center gap-1.5"
              style={{ fontSize: "12px" }}
            >
              {uploading ? (
                <>
                  <span className="spinner-border spinner-border-sm"></span>
                  <span>Đang nạp...</span>
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
              className="btn btn-sm btn-primary rounded-pill px-3 py-1.5 fw-bold text-white border-0 shadow-xs d-flex align-items-center gap-1.5"
              style={{ fontSize: "12px", background: "#185bf0" }}
            >
              <i className="bi bi-plus-lg"></i>
              <span>Thêm Môn Học</span>
            </button>
          </div>
        </div>

        {/* Hàng 2: Bộ lọc 3 cấp (Ngành - Khóa - Lớp) chia cột chuẩn Responsive */}
        <div className="row g-2.5 pt-3 border-top">
          <div className="col-12 col-md-5">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Ngành Đào Tạo
            </label>
            <select
              value={selectedMajor}
              onChange={(e) => setSelectedMajor(e.target.value)}
              className="form-select form-select-sm rounded-3 fw-semibold bg-light border shadow-none"
              style={{ fontSize: "12px" }}
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
              style={{ fontSize: "12px" }}
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
              style={{ fontSize: "12px" }}
            >
              {availableClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls === "all" ? "Tất cả các lớp" : cls}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Hàng 3: Điều hướng Năm học và Học kỳ (Cách nhau rõ ràng, không tràn mép) */}
        <div className="pt-3 border-top d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-2.5">
          {/* Chọn Năm */}
          <div className="d-flex align-items-center gap-2">
            <span className="text-secondary small fw-bold text-uppercase" style={{ fontSize: "10.5px" }}>
              Năm:
            </span>
            <div className="p-1 bg-light rounded-pill border d-inline-flex gap-1">
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

          {/* Chọn Kỳ trong năm */}
          <div className="d-flex align-items-center gap-2 overflow-x-auto">
            <span className="text-secondary small fw-bold text-uppercase" style={{ fontSize: "10.5px" }}>
              Kỳ:
            </span>
            <div className="d-flex align-items-center gap-1.5 flex-nowrap">
              {semestersInYear[selectedYearTab].map((sem) => {
                const isActive = selectedSemester === sem;
                return (
                  <button
                    key={sem}
                    onClick={() => handleSelectSemester(sem)}
                    className={`btn btn-sm rounded-pill px-3 py-1 fw-bold transition text-nowrap ${
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

      {/* 2. KHỐI BẢNG DỮ LIỆU & CHỈ SỐ NHANH */}
      <div className="bg-white border rounded-4 p-4 shadow-sm d-flex flex-column gap-3">
        {/* Header bảng: Tóm tắt chỉ số & Thanh tìm kiếm */}
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2.5 pb-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span
              className="badge rounded-pill px-3 py-1.5 fw-bold text-white shadow-2xs d-inline-flex align-items-center gap-1.5"
              style={{ background: "#185bf0", fontSize: "11.5px" }}
            >
              <i className="bi bi-mortarboard-fill"></i>
              Học kỳ {selectedSemester} ({filteredList.length} môn)
            </span>

            <span className="badge rounded-pill bg-light text-dark border px-2.5 py-1.5 fw-bold" style={{ fontSize: "11px" }}>
              Tổng: <b className="text-primary">{semCredits}</b> tín chỉ
            </span>

            <span className="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-2.5 py-1.5 fw-semibold" style={{ fontSize: "11px" }}>
              Bắt buộc: {mandatoryCount}
            </span>

            {electiveCount > 0 && (
              <span className="badge rounded-pill bg-warning-subtle text-amber-900 border border-warning-subtle px-2.5 py-1.5 fw-semibold" style={{ fontSize: "11px" }}>
                Tự chọn: {electiveCount}
              </span>
            )}
          </div>

          <div className="input-group input-group-sm" style={{ maxWidth: "240px" }}>
            <span className="input-group-text bg-light border-end-0 text-muted ps-2.5">
              <i className="bi bi-search"></i>
            </span>
            <input
              type="text"
              placeholder="Tìm theo mã hoặc tên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control bg-light border-start-0 fw-semibold"
              style={{ fontSize: "11.5px" }}
            />
          </div>
        </div>

        {/* Bảng dữ liệu môn học */}
        <div className="table-responsive" style={{ minHeight: "240px" }}>
          <table className="table table-hover align-middle mb-0 text-nowrap">
            <thead className="table-light">
              <tr style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.5px" }} className="text-uppercase">
                <th className="ps-3 text-center" style={{ width: "50px" }}>STT</th>
                <th style={{ width: "110px" }}>Mã HP</th>
                <th>Tên Học Phần</th>
                <th className="text-center" style={{ width: "120px" }}>Cấu Trúc Giờ</th>
                <th className="text-center" style={{ width: "85px" }}>Số TC</th>
                <th className="text-center" style={{ width: "110px" }}>Tính Chất</th>
                <th>Học Phần Điều Kiện</th>
                <th className="text-end pe-3" style={{ width: "80px" }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: "12.5px" }}>
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
                  <tr key={item.id}>
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
                        className={`badge rounded-pill px-2 py-0.5 fw-semibold ${
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
                      <div className="d-flex align-items-center justify-content-end gap-1">
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
                          style={{ width: "28px", height: "28px" }}
                          title="Chỉnh sửa"
                        >
                          <i className="bi bi-pencil-fill text-primary" style={{ fontSize: "10.5px" }}></i>
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, item.subject_name)}
                          className="btn btn-sm btn-light rounded-circle border p-0 d-inline-flex align-items-center justify-content-center"
                          style={{ width: "28px", height: "28px" }}
                          title="Xóa"
                        >
                          <i className="bi bi-trash3-fill text-danger" style={{ fontSize: "10.5px" }}></i>
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
        <div className="pt-2.5 border-top d-flex flex-wrap align-items-center justify-content-between gap-2 text-muted" style={{ fontSize: "11px" }}>
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
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "420px" }}>
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