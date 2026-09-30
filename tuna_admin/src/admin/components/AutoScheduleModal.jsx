// src/admin/components/AutoScheduleModal.jsx
import React, { useState, useEffect } from "react";

const API_BASE = "http://localhost:5000/api";

export const AutoScheduleModal = ({ show, onClose, className, semesterIndex, onSaveSuccess }) => {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const [scheduleForm, setScheduleForm] = useState({
    subject_code: "",
    subject_name: "",
    credits: 3,
    credits_structure: "",
    schedule_type: "study", // study (lý thuyết), practice (thực hành), exam (thi)
    day_of_week: 2,         // Thứ 2
    start_period: 1,
    end_period: 3,
    room: "",
    teacher_name: "",
    note: "",
  });

  // Tải danh sách môn của lớp và học kỳ hiện tại
  useEffect(() => {
    if (show && className && semesterIndex) {
      setLoading(true);
      fetch(`${API_BASE}/schedules/available-subjects?className=${className}&semesterIndex=${semesterIndex}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
        },
      })
        .then((res) => res.json())
        .then((d) => {
          if (d.success && d.data) {
            setSubjects(d.data);
            if (d.data.length > 0) {
              const first = d.data[0];
              setSelectedPlanId(first.curriculum_plan_id);
              // Tự động điền dữ liệu của môn đầu tiên
              setScheduleForm((prev) => ({
                ...prev,
                subject_code: first.subject_code,
                subject_name: first.subject_name,
                credits: first.credits,
                credits_structure: first.credits_structure || "3(3,0,0)",
              }));
            }
          }
        })
        .catch((err) => console.error("Lỗi nạp môn học gợi ý:", err))
        .finally(() => setLoading(false));
    }
  }, [show, className, semesterIndex]);

  // Khi admin đổi môn học trên Dropdown -> Tự động điền lại thông tin môn đó
  const handleSelectSubject = (e) => {
    const planId = e.target.value;
    setSelectedPlanId(planId);
    const sub = subjects.find((s) => String(s.curriculum_plan_id) === String(planId));
    if (sub) {
      setScheduleForm((prev) => ({
        ...prev,
        subject_code: sub.subject_code,
        subject_name: sub.subject_name,
        credits: sub.credits,
        credits_structure: sub.credits_structure || "3(3,0,0)",
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/schedules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
        },
        body: JSON.stringify({
          ...scheduleForm,
          class_name: className,
          semester_index: parseInt(semesterIndex),
          curriculum_plan_id: selectedPlanId ? parseInt(selectedPlanId) : null,
        }),
      });

      const d = await res.json();
      if (d.success) {
        alert("✅ Đã xếp lịch học vào Thời khóa biểu thành công!");
        onSaveSuccess();
        onClose();
      } else {
        alert("❌ Lỗi: " + (d.message || "Không thể lưu lịch học"));
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  if (!show) return null;

  return (
    <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1065 }}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "500px" }}>
        <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
          {/* Header Modal */}
          <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2 border-bottom">
            <div>
              <h6 className="fw-bold mb-0 text-dark d-flex align-items-center gap-2">
                <i className="bi bi-calendar-plus-fill text-primary fs-5"></i>
                Xếp Lịch Học Từ Khung CTĐT
              </h6>
              <small className="text-secondary fw-semibold">
                Lớp: <b className="text-primary font-monospace">{className}</b> | Học kỳ: <b>{semesterIndex}</b>
              </small>
            </div>
            <button type="button" onClick={onClose} className="btn btn-sm btn-light rounded-circle p-0" style={{ width: "30px", height: "30px" }}>
              <i className="bi bi-x-lg"></i>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body px-4 py-3 d-flex flex-column gap-3">
              {/* 1. Danh sách học phần tự động lấy từ Khung CTĐT */}
              <div>
                <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                  1. Chọn Học Phần Cần Xếp Lịch (Khung CTĐT) *
                </label>
                {loading ? (
                  <div className="text-muted small py-2">
                    <span className="spinner-border spinner-border-sm text-primary me-1.5"></span>
                    Đang nạp danh sách học phần từ CTĐT...
                  </div>
                ) : subjects.length === 0 ? (
                  <div className="alert alert-warning p-2 small mb-0">
                    Chưa có học phần nào trong khung CTĐT của kỳ này. Hãy nạp file Excel ở trang Khung CTĐT trước.
                  </div>
                ) : (
                  <select
                    value={selectedPlanId}
                    onChange={handleSelectSubject}
                    className="form-select form-select-sm rounded-3 fw-bold text-primary shadow-none"
                    style={{ fontSize: "12.5px" }}
                  >
                    {subjects.map((s) => (
                      <option key={s.curriculum_plan_id} value={s.curriculum_plan_id}>
                        [{s.subject_code}] {s.subject_name} ({s.credits} TC) {s.is_scheduled ? "• [ĐÃ XẾP]" : "• [CHƯA XẾP]"}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 2. Khung Auto-Fill xem trước (Không cần gõ tay) */}
              <div className="p-2.5 rounded-3 bg-light border row g-2">
                <div className="col-4">
                  <small className="text-muted d-block" style={{ fontSize: "9.5px", textTransform: "uppercase" }}>Mã Học Phần</small>
                  <b className="font-monospace text-dark" style={{ fontSize: "12px" }}>{scheduleForm.subject_code || "—"}</b>
                </div>
                <div className="col-4">
                  <small className="text-muted d-block" style={{ fontSize: "9.5px", textTransform: "uppercase" }}>Số Tín Chỉ</small>
                  <b className="text-success" style={{ fontSize: "12px" }}>{scheduleForm.credits} TC</b>
                </div>
                <div className="col-4">
                  <small className="text-muted d-block" style={{ fontSize: "9.5px", textTransform: "uppercase" }}>Cấu Trúc Giờ</small>
                  <b className="text-secondary font-monospace" style={{ fontSize: "12px" }}>{scheduleForm.credits_structure || "3(3,0,0)"}</b>
                </div>
              </div>

              {/* 3. Điền thông tin thời gian & địa điểm xếp lịch */}
              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                    Loại Lịch
                  </label>
                  <select
                    value={scheduleForm.schedule_type}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, schedule_type: e.target.value })}
                    className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
                  >
                    <option value="study">Lý thuyết</option>
                    <option value="practice">Thực hành máy</option>
                    <option value="exam">Lịch thi</option>
                  </select>
                </div>

                <div className="col-6">
                  <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                    Thứ Học Trong Tuần
                  </label>
                  <select
                    value={scheduleForm.day_of_week}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: Number(e.target.value) })}
                    className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
                  >
                    <option value={2}>Thứ Hai</option>
                    <option value={3}>Thứ Ba</option>
                    <option value={4}>Thứ Tư</option>
                    <option value={5}>Thứ Năm</option>
                    <option value={6}>Thứ Sáu</option>
                    <option value={7}>Thứ Bảy</option>
                    <option value={8}>Chủ Nhật</option>
                  </select>
                </div>
              </div>

              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                    Tiết Bắt Đầu *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={scheduleForm.start_period}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, start_period: Number(e.target.value) })}
                    className="form-control form-control-sm rounded-3 text-center fw-bold shadow-none"
                  />
                </div>
                <div className="col-6">
                  <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                    Tiết Kết Thúc *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={scheduleForm.end_period}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, end_period: Number(e.target.value) })}
                    className="form-control form-control-sm rounded-3 text-center fw-bold shadow-none"
                  />
                </div>
              </div>

              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                    Phòng Học / Giảng Đường *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: C201, PM03..."
                    value={scheduleForm.room}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, room: e.target.value })}
                    className="form-control form-control-sm rounded-3 fw-semibold shadow-none"
                  />
                </div>
                <div className="col-6">
                  <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                    Giảng Viên Phụ Trách *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: ThS. Nguyễn Trung Việt"
                    value={scheduleForm.teacher_name}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, teacher_name: e.target.value })}
                    className="form-control form-control-sm rounded-3 fw-semibold shadow-none"
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer border-0 px-4 pt-1 pb-4 d-flex justify-content-end gap-2">
              <button type="button" onClick={onClose} className="btn btn-light rounded-pill px-3 py-1.5 small border">
                Hủy
              </button>
              <button
                type="submit"
                disabled={subjects.length === 0}
                className="btn btn-primary rounded-pill px-3.5 py-1.5 small border-0 text-white shadow-xs"
                style={{ background: "#185bf0" }}
              >
                Lưu Vào Thời Khóa Biểu
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};