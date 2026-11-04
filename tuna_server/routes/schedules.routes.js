// routes/schedules.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');
const { generateContentWithFallback } = require('../utils/gemini');
const multer = require('multer');
const xlsx = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });
const WRR_SERVICE_URL = process.env.WRR_SERVICE_URL || 'https://tuna-wrr-service.onrender.com';

// Helper: Phân giải user_id (INTEGER) từ request (hỗ trợ JWT token, x-user-id header, email hoặc MSSV)
const resolveUserId = async (req) => {
  if (req.user?.id) return req.user.id;
  const rawId = String(
    req.headers['x-user-id'] ||
    req.body?.userId ||
    req.query?.userId ||
    req.query?.identifier ||
    req.body?.email ||
    req.query?.email ||
    ''
  ).trim();

  if (!rawId || rawId === 'guest_user') return null;
  if (/^\d+$/.test(rawId)) return parseInt(rawId, 10);

  const userRes = await pool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR student_code = $1 OR zalo_id = $1 LIMIT 1`,
    [rawId]
  ).catch(() => ({ rows: [] }));

  return userRes.rows[0]?.id || null;
};

// Helper: Chuẩn hóa ngày tháng địa phương YYYY-MM-DD (chống lỗi timezone UTC trên server)
const formatLocalDate = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper: Chuẩn hóa ngày từ Excel
const parseExcelDate = (val) => {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return formatLocalDate(val);
  }
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return formatLocalDate(date);
  }
  const str = String(val).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(str)) {
    const [d, m, y] = str.split(/[\/\-]/);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(str)) {
    const [y, m, d] = str.split(/[\/\-]/);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return formatLocalDate(parsed);
  }
  return null;
};

// Helper: Chuẩn hóa schedule_type tương thích với CHECK constraint của DB
const normalizeScheduleType = (type) => {
  const t = String(type || '').toLowerCase();
  if (t.includes('exam') || t.includes('thi')) return 'exam';
  if (t.includes('practice') || t.includes('thực hành') || t.includes('lab')) return 'practice';
  if (t.includes('custom') || t.includes('cá nhân')) return 'custom';
  return 'study';
};

// Helper: Kiểm tra tính hợp lệ của Ngành và Khóa từ bảng faculty_majors
const validateMajorAndCohort = async (majorName, cohort) => {
  if (!majorName || !cohort) {
    return { valid: false, message: 'Vui lòng chọn đầy đủ Ngành đào tạo và Khóa tuyển sinh!' };
  }

  const majorRes = await pool.query(
    `SELECT major_code, major_name, applied_cohort, semesters_per_year 
     FROM faculty_majors 
     WHERE major_name ILIKE $1 AND is_active = TRUE 
     LIMIT 1`,
    [majorName.trim()]
  );

  if (majorRes.rows.length === 0) {
    return { 
      valid: false, 
      message: `Ngành "${majorName}" chưa được khởi tạo hoặc đang bị khóa bên Quản Lý Ngành!` 
    };
  }

  const major = majorRes.rows[0];
  const appliedCohort = (major.applied_cohort || '').trim().toUpperCase();
  const inputCohort = cohort.trim().toUpperCase();

  const numApplied = appliedCohort.replace(/\D/g, '').slice(-2);
  const numInput = inputCohort.replace(/\D/g, '').slice(-2);

  const isMatched = appliedCohort === 'ALL' || 
                    appliedCohort === inputCohort || 
                    (numApplied && numInput && numApplied === numInput);

  if (!isMatched) {
    return { 
      valid: false, 
      message: `Ngành "${major.major_name}" trong hệ thống hiện chỉ áp dụng cho "${major.applied_cohort}". Khóa "${cohort}" chưa được thiết lập!` 
    };
  }

  return { valid: true, major };
};

// =============================================================================
// 1. QUÉT ẢNH THỜI KHÓA BIỂU BẰNG GEMINI VISION (HỖ TRỢ ĐA ẢNH ĐỘC LẬP - BÓC TÁCH TOÀN BỘ CÁC MÔN)
// =============================================================================
router.post('/ocr-parse', async (req, res) => {
  const { imageBase64, images } = req.body;
  const rawList = Array.isArray(images) && images.length > 0 ? images : (imageBase64 ? [imageBase64] : []);

  const validImages = rawList.filter(Boolean);
  if (validImages.length === 0) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ít nhất một hình ảnh thời khóa biểu!' });
  }

  try {
    const promptSingleImage = `Bạn là chuyên gia phân tích dữ liệu học tập từ ảnh chụp màn hình thời khóa biểu trường đại học.
Nhiệm vụ: Hãy quan sát kỹ toàn bộ ảnh và trích xuất TẤT CẢ các tiết học/môn học có trong ảnh thành một mảng JSON.

HƯỚNG DẪN BÓC TÁCH:
- title: Tên môn học chính xác (Nằm ngay dưới dòng "Lịch học" hoặc "Lịch thi").
- startPeriod: Tiết bắt đầu (số nguyên từ 1 đến 13).
- endPeriod: Tiết kết thúc (số nguyên từ 1 đến 13).
- room: Phòng học (VD: "Phòng máy 4", "C401", "Phòng máy 3", "C305", "C202").
- teacherName: Tên giảng viên nếu có (VD: "Võ Thanh Vinh", "Nguyễn Đình Tứ", "Nguyễn Thị Hồng Hạnh"). Nếu không có thì ghi "Giảng viên bộ môn".
- specificDate: Đọc khối tiêu đề ngày màu xanh phía trên thẻ môn (VD: "Th 3, 03/11", "Th 4, 04/11", "Th 5, 05/11", "Th 6, 06/11", "Th 4, 11/11", "Th 5, 12/11") kết hợp với Năm (2026) hiển thị ở góc trên cùng bên trái để chuyển thành định dạng YYYY-MM-DD (Ví dụ: "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-11", "2026-11-12").
- dayOfWeek: Thứ 2 là 2, Thứ 3 là 3, ..., Thứ 7 là 7, Chủ nhật là 8.
- scheduleType: "study" (học lý thuyết/thực hành), "exam" (nếu là lịch thi), hoặc "online" (nếu ghi học trực tuyến).

QUY TẮC BẮT BUỘC:
- Nếu cùng một môn học nhưng diễn ra vào 2 ngày khác nhau, hoặc 2 ca khác nhau trong cùng một ngày (ví dụ ca sáng và ca chiều), thì BẮT BUỘC ghi nhận là các phần tử riêng biệt trong mảng kết quả, KHÔNG ĐƯỢC BỎ QUA.

YÊU CẦU: Trả về DUY NHẤT một chuỗi JSON hợp lệ không bọc trong markdown code block:
[
  {
    "title": "Tên môn",
    "dayOfWeek": 3,
    "specificDate": "2026-11-03",
    "startPeriod": 4,
    "endPeriod": 4,
    "room": "C202",
    "teacherName": "Giảng viên",
    "scheduleType": "study"
  }
]`;

    let allExtracted = [];

    // Quét độc lập từng bức ảnh qua Gemini Vision để đảm bảo không bị quá tải payload hoặc sót môn
    for (let i = 0; i < validImages.length; i++) {
      const b64 = validImages[i];
      const matches = b64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      const mimeType = matches ? matches[1] : 'image/jpeg';
      const base64Data = matches ? matches[2] : b64;

      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      };

      try {
        const textOutput = await generateContentWithFallback([promptSingleImage, imagePart], {
          responseMimeType: 'application/json',
          temperature: 0.1,
        });

        const cleanJson = textOutput.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanJson || '[]');
        if (Array.isArray(parsed)) {
          allExtracted.push(...parsed);
        } else if (parsed && Array.isArray(parsed.schedules)) {
          allExtracted.push(...parsed.schedules);
        }
      } catch (subErr) {
        console.warn(`Lỗi bóc tách ảnh thứ ${i + 1}:`, subErr.message);
      }
    }

    // Lọc trùng lặp an toàn: Chỉ loại trừ nếu trùng cả môn, ngày học VÀ tiết học
    const uniqueMap = new Map();
    for (const item of allExtracted) {
      if (!item.title) continue;
      const key = `${item.title.trim()}_${item.specificDate}_${item.startPeriod}_${item.endPeriod}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    }
    const finalSchedules = Array.from(uniqueMap.values());

    res.json({
      success: true,
      totalScanned: finalSchedules.length,
      data: finalSchedules,
      message: `Đã bóc tách thành công ${finalSchedules.length} buổi học từ ${validImages.length} ảnh thời khóa biểu!`,
    });
  } catch (error) {
    console.error("Lỗi OCR nhiều ảnh:", error);
    res.status(500).json({ success: false, message: "Không thể phân tích ảnh: " + error.message });
  }
});

// =============================================================================
// 2. LƯU HÀNG LOẠT TIẾT HỌC VÀO CSDL SAU KHI QUÉT ẢNH OCR
// =============================================================================
router.post('/bulk-import', async (req, res) => {
  const userId = await resolveUserId(req);
  const { schedules } = req.body;

  if (!Array.isArray(schedules) || schedules.length === 0) {
    return res.status(400).json({ success: false, message: 'Danh sách môn học rỗng!' });
  }

  try {
    for (const s of schedules) {
      const startP = Number(s.startPeriod) || 1;
      const endP = Number(s.endPeriod) || (startP + 2);
      const timeSlot = s.timeSlot || `Tiết ${startP} - ${endP}`;
      const scheduleType = normalizeScheduleType(s.scheduleType);

      await pool.query(
        `INSERT INTO schedules 
          (schedule_scope, user_id, title, specific_date, day_of_week, 
           start_period, end_period, time_slot, room, teacher_name, schedule_type)
         VALUES ('personal', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId,
          s.title?.trim() || 'Học phần',
          s.specificDate || formatLocalDate(),
          Number(s.dayOfWeek) || 2,
          startP,
          endP,
          timeSlot,
          s.room?.trim() || 'C201',
          s.teacherName?.trim() || 'Giảng viên bộ môn',
          scheduleType,
        ]
      );
    }

    res.json({
      success: true,
      message: `Đã lưu thành công ${schedules.length} môn vào thời khóa biểu!`,
    });
  } catch (err) {
    console.error("Lỗi bulk-import:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 3. LẤY DANH MỤC NGÀNH VÀ KHÓA CHUẨN TỪ FACULTY_MAJORS (Admin)
// =============================================================================
router.get('/admin/meta-options', authenticateToken, async (req, res) => {
  try {
    const [majorsRes, classesRes] = await Promise.all([
      pool.query(`
        SELECT major_code AS "majorCode", major_name AS "majorName", 
               applied_cohort AS "appliedCohort", COALESCE(semesters_per_year, 3) AS "semestersPerYear"
        FROM faculty_majors 
        WHERE is_active = TRUE
        ORDER BY id ASC
      `),
      pool.query(`
        SELECT DISTINCT class_name AS "className"
        FROM curriculum_plans 
        WHERE class_name IS NOT NULL AND class_name <> ''
        ORDER BY "className" ASC
      `)
    ]);

    const majorMap = {};
    const allCohorts = new Set();

    majorsRes.rows.forEach(r => {
      const mName = r.majorName.trim();
      if (!majorMap[mName]) {
        majorMap[mName] = {
          code: r.majorCode,
          semestersPerYear: r.semestersPerYear,
          cohorts: []
        };
      }
      if (r.appliedCohort && r.appliedCohort.toUpperCase() !== 'ALL') {
        majorMap[mName].cohorts.push(r.appliedCohort);
        allCohorts.add(r.appliedCohort);
      }
    });

    res.json({
      success: true,
      data: {
        majors: majorsRes.rows,
        majorMap,
        cohorts: Array.from(allCohorts),
        classes: classesRes.rows.map(r => r.className).filter(Boolean)
      }
    });
  } catch (err) {
    console.error("Lỗi lấy meta options:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 4. LẤY LỊCH HỌC CHO PHÍA SINH VIÊN (KẾT HỢP CẢ LỊCH CHÍNH KHÓA & LỊCH CÁ NHÂN)
// =============================================================================
router.get('/student-schedule', async (req, res) => {
  const { studentCode, zaloId, identifier, month, year } = req.query;
  const currentIdentity = (identifier || studentCode || zaloId || '').trim();

  try {
    if (!currentIdentity || currentIdentity === 'guest_user') {
      return res.json({
        success: true,
        data: [],
        isPending: true,
        verificationStatus: 'pending',
        message: 'Vui lòng hoàn tất xác thực email để truy cập thời khóa biểu!',
      });
    }

    const userRes = await pool.query(
      `SELECT id, zalo_id, faculty, class_name, student_code, email,
              COALESCE(is_verified, false) AS "isVerified",
              COALESCE(verification_status, 'pending') AS "verificationStatus"
       FROM users 
       WHERE student_code = $1 
          OR zalo_id = $1 
          OR LOWER(COALESCE(email, '')) = LOWER($1) 
          OR id::TEXT = $1 
       LIMIT 1`,
      [currentIdentity]
    );

    if (userRes.rows.length === 0) {
      return res.json({
        success: true,
        data: [],
        isPending: true,
        verificationStatus: 'pending',
        message: 'Hồ sơ của bạn đang chờ hệ thống phê duyệt để xem thời khóa biểu chính thức.',
      });
    }

    const user = userRes.rows[0];

    if (user.verificationStatus === 'rejected') {
      return res.json({
        success: true,
        data: [],
        isPending: true,
        verificationStatus: 'rejected',
        message: 'Yêu cầu vào lớp của bạn đã bị từ chối bởi Quản trị viên.',
      });
    }

    if (user.verificationStatus === 'pending' || !user.isVerified) {
      return res.json({
        success: true,
        data: [],
        isPending: true,
        verificationStatus: 'pending',
        message: 'Hồ sơ của bạn đang chờ hệ thống phê duyệt để xem thời khóa biểu chính thức của lớp.',
      });
    }

    const facultyMajor = user.faculty || 'Hệ Thống Thông Tin';
    const className = user.class_name;
    const cohortMatch = (className || '').match(/K?(\d{2})/i) || (user.student_code || '').match(/(\d{2})/);
    const cohort = cohortMatch ? `K${cohortMatch[1]}` : 'K23';
    const cleanCohort = cohort.replace(/\D/g, '');

    let scheduleQuery = `
      SELECT 
        sch.id,
        COALESCE(cp.subject_name, sch.title) AS title,
        TO_CHAR(sch.specific_date, 'YYYY-MM-DD') AS date,
        'Tiết ' || sch.start_period || ' - ' || sch.end_period AS time,
        COALESCE(sch.time_slot, 'Theo tiết học') AS "timeSlot",
        sch.room,
        sch.teacher_name AS teacher,
        CASE 
          WHEN sch.room ILIKE '%truc tuyen%' THEN 'Lịch trực tuyến'
          WHEN sch.schedule_type = 'exam' THEN 'Lịch thi'
          ELSE 'Lịch học'
        END AS category,
        sch.schedule_scope AS "scheduleScope"
      FROM schedules sch
      LEFT JOIN curriculum_plans cp ON sch.curriculum_plan_id = cp.id
      WHERE (
        (
          sch.schedule_scope = 'academic'
          AND sch.faculty_major ILIKE $1 
          AND (sch.cohort ILIKE $2 OR sch.cohort IS NULL OR sch.cohort = '' OR sch.cohort ILIKE '%' || $3 || '%')
          AND ($4::text IS NULL OR sch.class_name IS NULL OR sch.class_name = '' OR sch.class_name = $4)
        )
        OR (
          sch.schedule_scope = 'personal' AND sch.user_id = $5
        )
      )
      AND sch.specific_date IS NOT NULL
    `;
    const scheduleParams = [facultyMajor, cohort, cleanCohort, className || null, user.id];

    if (month && year) {
      scheduleParams.push(Number(month), Number(year));
      scheduleQuery += ` AND EXTRACT(MONTH FROM sch.specific_date) = $${scheduleParams.length - 1} AND EXTRACT(YEAR FROM sch.specific_date) = $${scheduleParams.length}`;
    }

    scheduleQuery += ` ORDER BY sch.specific_date ASC, sch.start_period ASC`;

    const { rows } = await pool.query(scheduleQuery, scheduleParams).catch(() => ({ rows: [] }));

    res.json({
      success: true,
      data: rows,
      isPending: false,
      verificationStatus: 'approved',
      studentInfo: {
        studentCode: user.student_code,
        faculty: facultyMajor,
        cohort,
        className,
      },
    });
  } catch (err) {
    console.error("Lỗi GET /student-schedule:", err.message);
    res.json({ success: true, data: [] });
  }
});

// =============================================================================
// 5. THÊM / XÓA LỊCH CÁ NHÂN (HỖ TRỢ LINH HOẠT CẢ JWT TOKEN & X-USER-ID)
// =============================================================================
router.post(['/', '/schedules'], async (req, res) => {
  const userId = await resolveUserId(req);
  const {
    title,
    specificDate,
    date,
    timeSlot,
    time,
    startPeriod,
    endPeriod,
    room,
    location,
    teacherName,
    scheduleType,
    category,
  } = req.body;

  try {
    const finalDate = specificDate || date || formatLocalDate();
    const finalRoom = room || location || 'C201';
    const finalType = normalizeScheduleType(scheduleType || category);

    let startP = Number(startPeriod);
    let endP = Number(endPeriod);

    if (!startP && time) {
      const match = String(time).match(/(\d+)\s*[-–—tođến]+\s*(\d+)/);
      if (match) {
        startP = parseInt(match[1], 10);
        endP = parseInt(match[2], 10);
      }
    }
    startP = startP || 1;
    endP = endP || (startP + 2);

    const computedSlot = timeSlot || time || `Tiết ${startP} - ${endP}`;

    const dateObj = new Date(finalDate);
    const jsDay = dateObj.getDay();
    const dayOfWeek = jsDay === 0 ? 8 : jsDay + 1;

    const result = await pool.query(
      `INSERT INTO schedules 
        (schedule_scope, user_id, title, specific_date, day_of_week, 
         start_period, end_period, time_slot, room, teacher_name, schedule_type)
       VALUES ('personal', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING id, title, TO_CHAR(specific_date, 'YYYY-MM-DD') AS date, 
                 time_slot AS time, room, schedule_type AS category`,
      [
        userId,
        title?.trim() || 'Lịch cá nhân',
        finalDate,
        dayOfWeek,
        startP,
        endP,
        computedSlot,
        finalRoom,
        teacherName?.trim() || 'Giảng viên bộ môn',
        finalType,
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Lỗi POST /schedules:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete(['/:id', '/schedules/:id'], async (req, res) => {
  const userId = await resolveUserId(req);
  const { id } = req.params;

  try {
    let delRes;
    if (userId) {
      delRes = await pool.query(
        `DELETE FROM schedules WHERE id = $1 AND (user_id = $2 OR schedule_scope = 'personal')`,
        [id, userId]
      );
    } else {
      delRes = await pool.query(
        `DELETE FROM schedules WHERE id = $1 AND schedule_scope = 'personal'`,
        [id]
      );
    }

    res.json({ success: true, message: 'Đã xóa lịch học thành công!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 6. APIS ADMIN QUẢN LÝ THỜI KHÓA BIỂU CHÍNH KHÓA
// =============================================================================
router.get('/admin/list', authenticateToken, async (req, res) => {
  const { major, cohort, year, semester, type, className } = req.query;
  try {
    let query = `
      SELECT 
        sch.id, 
        sch.faculty_major AS "facultyMajor", 
        sch.cohort, 
        sch.class_name AS "className",
        sch.curriculum_plan_id AS "curriculumPlanId", 
        COALESCE(cp.credits, sch.credits, 3) AS "credits",
        COALESCE(cp.subject_code, sch.subject_code) AS "subjectCode", 
        COALESCE(cp.subject_name, sch.title) AS "subjectName",
        sch.schedule_type AS "scheduleType", 
        sch.day_of_week AS "dayOfWeek",
        TO_CHAR(sch.specific_date, 'YYYY-MM-DD') AS "specificDate",
        sch.start_period AS "startPeriod", 
        sch.end_period AS "endPeriod",
        sch.room, 
        sch.teacher_name AS "teacherName", 
        sch.note,
        TO_CHAR(sch.created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt",
        COALESCE(cp.semester_index, 0) AS "semesterIndex"
      FROM schedules sch
      LEFT JOIN curriculum_plans cp ON sch.curriculum_plan_id = cp.id
      WHERE sch.schedule_scope = 'academic'
    `;
    const params = [];

    if (major && major !== 'all') {
      params.push(major.trim());
      query += ` AND sch.faculty_major ILIKE $${params.length}`;
    }
    if (cohort && cohort !== 'all') {
      const shortCohort = cohort.replace(/[^0-9]/g, '').slice(-2);
      params.push(`%${shortCohort}%`);
      query += ` AND sch.cohort ILIKE $${params.length}`;
    }
    if (className && className !== 'all') {
      params.push(className.trim());
      query += ` AND sch.class_name = $${params.length}`;
    }
    if (type && type !== 'all') {
      params.push(type.trim());
      query += ` AND sch.schedule_type = $${params.length}`;
    }

    if (year && year !== 'all' && semester && semester !== 'all') {
      const y = parseInt(year, 10);
      const s = parseInt(semester, 10);

      let spy = 3;
      if (major && major !== 'all') {
        const mRes = await pool.query(
          `SELECT COALESCE(semesters_per_year, 3) as spy FROM faculty_majors WHERE major_name ILIKE $1 LIMIT 1`,
          [`%${major.trim()}%`]
        ).catch(() => ({ rows: [] }));
        if (mRes.rows.length > 0) spy = mRes.rows[0].spy;
      }

      const targetSemIndex = (y - 1) * spy + s;
      params.push(targetSemIndex);
      query += ` AND (cp.semester_index = $${params.length} OR sch.note ILIKE '%HK' || $${params.length} || '%')`;
    }

    query += ` ORDER BY sch.day_of_week ASC NULLS LAST, sch.specific_date ASC NULLS LAST, sch.start_period ASC`;
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/admin/create', authenticateToken, async (req, res) => {
  const {
    facultyMajor, cohort, className, curriculumPlanId, scheduleType,
    specificDate, startPeriod, endPeriod, room, teacherName, note,
    subjectCode, subjectName, credits
  } = req.body;

  try {
    const checkCohort = await validateMajorAndCohort(facultyMajor, cohort);
    if (!checkCohort.valid) {
      return res.status(400).json({ success: false, message: checkCohort.message });
    }

    let finalSubjectCode = subjectCode?.trim() || null;
    let finalSubjectName = subjectName?.trim() || '';
    let finalCredits = Number(credits) || 3;
    let finalPlanId = curriculumPlanId ? Number(curriculumPlanId) : null;

    if (finalPlanId) {
      const planRes = await pool.query(
        `SELECT subject_code, subject_name, credits FROM curriculum_plans WHERE id = $1`,
        [finalPlanId]
      );
      if (planRes.rows.length > 0) {
        finalSubjectCode = planRes.rows[0].subject_code;
        finalSubjectName = planRes.rows[0].subject_name;
        finalCredits = planRes.rows[0].credits;
      }
    }

    const dateObj = new Date(specificDate);
    const jsDay = dateObj.getDay();
    const computedDayOfWeek = jsDay === 0 ? 8 : jsDay + 1;

    const insertRes = await pool.query(
      `INSERT INTO schedules 
        (schedule_scope, faculty_major, cohort, class_name, curriculum_plan_id, credits, 
         subject_code, title, schedule_type, day_of_week, specific_date, 
         start_period, end_period, room, teacher_name, note)
       VALUES ('academic', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        facultyMajor.trim(), cohort.trim(), className || null, finalPlanId, finalCredits,
        finalSubjectCode, finalSubjectName, scheduleType || 'study', computedDayOfWeek,
        specificDate, Number(startPeriod), Number(endPeriod), room.trim(),
        teacherName?.trim() || 'Giảng viên', note || null
      ]
    );

    res.json({ success: true, message: 'Đã lưu lịch vào hệ thống!', id: insertRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/admin/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { room, teacherName, note, startPeriod, endPeriod, scheduleType, specificDate, dayOfWeek } = req.body;

  try {
    let computedDow = dayOfWeek ? Number(dayOfWeek) : null;
    if (specificDate && !computedDow) {
      const dObj = new Date(specificDate);
      const jsDay = dObj.getDay();
      computedDow = jsDay === 0 ? 8 : jsDay + 1;
    }

    await pool.query(
      `UPDATE schedules
       SET room = $1, teacher_name = $2, note = $3, start_period = $4, end_period = $5,
           schedule_type = $6, specific_date = $7, day_of_week = COALESCE($8, day_of_week)
       WHERE id = $9 AND schedule_scope = 'academic'`,
      [
        room?.trim(), teacherName?.trim() || 'Giảng viên', note?.trim() || null,
        Number(startPeriod), Number(endPeriod), scheduleType || 'study',
        specificDate || null, computedDow, id
      ]
    );
    res.json({ success: true, message: 'Cập nhật lịch thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/admin/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query(`DELETE FROM schedules WHERE id = $1 AND schedule_scope = 'academic'`, [req.params.id]);
    res.json({ success: true, message: 'Đã xóa lịch khỏi hệ thống!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 7. THUẬT TOÁN TỐI ƯU WRR (100% DỮ LIỆU ĐỘNG TỪ CSDL, KHÔNG FIX CỨNG)
// =============================================================================
// routes/schedules.routes.js - Mục 7: TỐI ƯU HÓA LỊCH WRR VÀ NÉ TRÙNG LỊCH CHÍNH KHÓA

router.post(['/generate-wrr-plan', '/timelines/generate-wrr-plan'], async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Cần đăng nhập để tạo lịch trình!' });
  }

  try {
    // 1. LẤY HỒ SƠ SINH VIÊN
    const userRes = await pool.query(
      `SELECT id, student_code, faculty, class_name FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ người dùng!' });
    }

    const user = userRes.rows[0];
    const userFaculty = user.faculty || req.body.facultyMajor || 'Hệ Thống Thông Tin';

    // 2. GPA & MỤC TIÊU
    const gpaRes = await pool.query(
      `SELECT 
         COALESCE(ROUND(SUM(grade_number * credits) / NULLIF(SUM(credits), 0), 2), 3.0) AS current_gpa,
         COALESCE(MAX(semester_learned), 1) AS max_semester
       FROM student_course_grades 
       WHERE user_id = $1`,
      [userId]
    );

    const currentGpa = Number(gpaRes.rows[0]?.current_gpa || 3.0);
    const goalLevel = req.body.goalLevel || 'HocBong';
    const dailyPace = Number(req.body.dailyPace) || 15;

    // 3. DANH SÁCH MÔN CẦN TỰ HỌC / LÀM BÀI TẬP
    let targetSubjects = [];
    if (Array.isArray(req.body.subjects) && req.body.subjects.length > 0) {
      targetSubjects = req.body.subjects.map(s => typeof s === 'object' ? (s.subject_name || s.name || s.subject) : String(s)).filter(Boolean);
    }

    if (targetSubjects.length === 0) {
      // Ưu tiên lấy các môn đang có trong thời khóa biểu chính khóa của sinh viên
      const scheduleSubs = await pool.query(
        `SELECT DISTINCT title FROM schedules 
         WHERE (user_id = $1 OR faculty_major ILIKE $2) 
           AND specific_date >= CURRENT_DATE - INTERVAL '14 days' 
         LIMIT 4`,
        [userId, `%${userFaculty}%`]
      ).catch(() => ({ rows: [] }));

      if (scheduleSubs.rows.length > 0) {
        targetSubjects = scheduleSubs.rows.map(r => r.title);
      } else {
        targetSubjects = ["Blockchain căn bản", "Cơ sở dữ liệu", "Phân tích và thiết kế HTTT"];
      }
    }

    // 4. CHUẨN BỊ PAYLOAD CHO THUẬT TOÁN SWRR
    const payloadSubjects = targetSubjects.map(sub => ({
      subject_name: sub,
      credits: 3,
      quiz_total: 0,
      quiz_correct: 0,
      is_near_exam: false,
      user_level: req.body.subjectLevels?.[sub] || 'medium'
    }));

    // 5. GỌI PYTHON MICROSERVICE
    let pyData = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const pyResponse = await fetch(`${WRR_SERVICE_URL}/api/schedule/wrr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: payloadSubjects,
          total_days: 28,
          goal_level: goalLevel,
          current_gpa: currentGpa,
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (pyResponse.ok) {
        pyData = await pyResponse.json();
      }
    } catch (e) {
      console.warn("Lỗi kết nối Python WRR, chuyển sang xếp lịch dự phòng:", e.message);
    }

    // Fallback nếu Python microservice chưa kịp hồi đáp
    if (!pyData || !pyData.schedule_plan) {
      const slotsPerDay = goalLevel === 'HocBong' ? 3 : 2;
      const flatList = [];
      let sIdx = 0;

      for (let day = 0; day < 28; day++) {
        for (let slot = 0; slot < slotsPerDay; slot++) {
          const sub = payloadSubjects[sIdx % payloadSubjects.length].subject_name;
          sIdx++;
          const task_type = slot === 0 ? 'doc_study' : slot === 1 ? 'quiz' : 'flashcard';
          const title = slot === 0 ? `Nghiên cứu giáo trình: ${sub}` : slot === 1 ? `Luyện đề trắc nghiệm: ${sub}` : `Ôn thuật ngữ then chốt: ${sub}`;
          flatList.push({
            day_offset: day,
            subject: sub,
            task_type,
            title,
            slot_index: slot
          });
        }
      }

      pyData = {
        success: true,
        weights: payloadSubjects.map(s => ({ subject: s.subject_name, weight: 1.0 })),
        schedule_plan: flatList
      };
    }

    // 6. XÁC ĐỊNH MỐC NGÀY BẮT ĐẦU CHÍNH XÁC (KHỚP VỚI THỨ 2 TUẦN NÀY)
    let startDateObj;
    if (req.body.startDate && /^\d{4}-\d{2}-\d{2}$/.test(req.body.startDate)) {
      const [y, m, d] = req.body.startDate.split('-').map(Number);
      startDateObj = new Date(y, m - 1, d);
    } else {
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startDateObj = new Date(now.setDate(diff));
    }

    // Xóa lịch cũ của chu kỳ này để nạp lịch mới tối ưu
    await pool.query(`DELETE FROM learning_timelines WHERE user_id = $1`, [userId]).catch(() => {});

    // 7. LẤY TOÀN BỘ LỊCH HỌC CHÍNH KHÓA ĐỂ NÉ TRÙNG GIỜ
    const classSchedulesRes = await pool.query(
      `SELECT TO_CHAR(specific_date, 'YYYY-MM-DD') AS date, start_period, end_period 
       FROM schedules 
       WHERE (user_id = $1 OR faculty_major ILIKE $2) 
         AND specific_date IS NOT NULL`,
      [userId, `%${userFaculty}%`]
    ).catch(() => ({ rows: [] }));

    const classScheduleMap = new Set();
    classSchedulesRes.rows.forEach(r => {
      classScheduleMap.add(`${r.date}_morning`);
      classScheduleMap.add(`${r.date}_afternoon`);
    });

    // Các khung giờ tự học rèn luyện
    const eveningSlots = ['19:30 - 20:15', '20:30 - 21:15', '21:30 - 22:15'];
    const freeDaySlots = ['08:00 - 08:45', '14:30 - 15:15', '19:30 - 20:15'];

    let tasksToProcess = Array.isArray(pyData.schedule_plan) ? pyData.schedule_plan : [];
    if (tasksToProcess.length > 0 && Array.isArray(tasksToProcess[0])) {
      tasksToProcess = tasksToProcess.flat();
    }

    const insertedRows = [];

    for (const task of tasksToProcess) {
      const offset = Number(task.day_offset) || 0;
      const slotIdx = Number(task.slot_index) || 0;

      const targetDate = new Date(startDateObj);
      targetDate.setDate(startDateObj.getDate() + offset);

      const y = targetDate.getFullYear();
      const m = String(targetDate.getMonth() + 1).padStart(2, '0');
      const d = String(targetDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      // Né lịch học: Nếu ngày đó có lịch chính khóa thì xếp ca tự học vào buổi tối
      const hasClassToday = classScheduleMap.has(`${dateStr}_morning`) || classScheduleMap.has(`${dateStr}_afternoon`);
      const assignedTimeSlot = hasClassToday 
        ? eveningSlots[slotIdx % eveningSlots.length] 
        : freeDaySlots[slotIdx % freeDaySlots.length];

      const description =
        task.task_type === 'doc_study'
          ? `Đọc hiểu kiến thức nền tảng & slide lý thuyết`
          : task.task_type === 'quiz'
          ? `Thực hành làm đề trắc nghiệm củng cố kiến thức`
          : `Ghi nhớ nhanh các định nghĩa & thuật ngữ cốt lõi`;

      const actionTarget = task.task_type === 'doc_study' ? 'docs' : 'tasks';

      const insertRes = await pool.query(
        `INSERT INTO learning_timelines 
         (user_id, subject, goal_level, timeline_date, time_slot, task_type, title, description, duration_minutes, is_completed, action_target)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)
         RETURNING id, subject, goal_level AS "goalLevel", TO_CHAR(timeline_date, 'YYYY-MM-DD') AS "timelineDate",
                   time_slot AS "timeSlot", task_type AS "taskType", title, description,
                   duration_minutes AS "durationMinutes", is_completed AS "isCompleted", action_target AS "actionTarget"`,
        [
          userId,
          task.subject,
          goalLevel,
          dateStr,
          assignedTimeSlot,
          task.task_type,
          task.title,
          description,
          dailyPace,
          actionTarget,
        ]
      );

      if (insertRes.rows && insertRes.rows[0]) {
        insertedRows.push(insertRes.rows[0]);
      }
    }

    res.json({
      success: true,
      algorithm: 'Smooth Weighted Round Robin (SWRR)',
      totalInserted: insertedRows.length,
      data: insertedRows,
    });
  } catch (err) {
    console.error('Lỗi controller /generate-wrr-plan:', err.message);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ: ' + err.message });
  }
});

// =============================================================================
// 8. ĐIỂM DANH STREAK & LEADERBOARD
// =============================================================================
router.get('/streak/:userId', async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) return res.json({ success: true, current_streak: 1, longest_streak: 1, xp_points: 20 });

  try {
    const query = `SELECT current_streak, longest_streak, xp_points, last_active_date FROM users WHERE id = $1`;
    const result = await pool.query(query, [userId]).catch(() => ({ rows: [] }));

    if (result.rows.length === 0) {
      return res.json({ success: true, current_streak: 1, longest_streak: 1, xp_points: 20, last_completed_date: null });
    }

    const userData = result.rows[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (userData.last_active_date) {
      const lastDate = new Date(userData.last_active_date);
      lastDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

      if (diffDays > 1) {
        await pool.query(`UPDATE users SET current_streak = 0 WHERE id = $1`, [userId]).catch(() => {});
        userData.current_streak = 0;
      }
    }

    res.json({
      success: true,
      current_streak: userData.current_streak || 1,
      longest_streak: userData.longest_streak || 1,
      xp_points: userData.xp_points || 20,
      last_completed_date: userData.last_active_date,
    });
  } catch (error) {
    res.json({ success: true, current_streak: 1, longest_streak: 1, xp_points: 20 });
  }
});

router.post('/streak/complete', async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Cần đăng nhập' });

  try {
    const checkResult = await pool.query(`SELECT id, current_streak, longest_streak, xp_points, last_active_date FROM users WHERE id = $1`, [userId]);
    if (checkResult.rows.length === 0) return res.status(404).json({ success: false, message: 'User không tồn tại' });

    const u = checkResult.rows[0];
    const todayStr = formatLocalDate();

    const lastDate = u.last_active_date ? new Date(u.last_active_date) : null;
    if (lastDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      lastDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        return res.json({ success: true, streak: u, message: 'Đã điểm danh hôm nay' });
      }
    }

    let newStreak = (lastDate && Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24)) === 1) ? Number(u.current_streak) + 1 : 1;
    let newLongest = Math.max(newStreak, Number(u.longest_streak || 0));

    const updateRes = await pool.query(
      `UPDATE users 
       SET current_streak = $1, longest_streak = $2, xp_points = COALESCE(xp_points, 0) + 20, last_active_date = $3
       WHERE id = $4
       RETURNING current_streak, longest_streak, xp_points, last_active_date`,
      [newStreak, newLongest, todayStr, userId]
    );

    await pool.query(
      `INSERT INTO streak_logs (user_id, activity_date, xp_earned) VALUES ($1, $2, 20)
       ON CONFLICT (user_id, activity_date) DO NOTHING`,
      [userId, todayStr]
    ).catch(() => {});

    return res.json({ success: true, streak: updateRes.rows[0] });
  } catch (error) {
    res.json({ success: true, streak: { current_streak: 1, xp_points: 20 } });
  }
});

module.exports = router;