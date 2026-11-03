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

// Helper trích xuất user_id nguyên số từ request (hỗ trợ cả JWT token lẫn x-user-id header)
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

// Helper chuẩn hóa ngày tháng theo múi giờ địa phương YYYY-MM-DD
const formatLocalDate = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper chuẩn hóa ngày từ Excel
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

// Helper chuẩn hóa schedule_type tương thích với CHECK constraint của DB
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
// 1. QUÉT ẢNH THỜI KHÓA BIỂU BẰNG GEMINI VISION (OCR)
// =============================================================================
router.post('/ocr-parse', async (req, res) => {
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp hình ảnh thời khóa biểu!' });
  }

  try {
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const mimeType = matches ? matches[1] : 'image/jpeg';
    const base64Data = matches ? matches[2] : imageBase64;

    const prompt = `Bạn là trợ lý AI học tập thông minh của Trường Đại học.
Nhiệm vụ: Phân tích hình ảnh Thời khóa biểu (ảnh chụp màn hình cổng đào tạo hoặc ảnh chụp TKB) và trích xuất tất cả các tiết học thành mảng JSON.
Quy tắc:
- title: Tên môn học chính xác (bỏ mã môn dài dòng nếu có).
- dayOfWeek: Thứ trong tuần (2: Thứ 2, 3: Thứ 3, ..., 7: Thứ 7, 8: Chủ nhật).
- specificDate: Nếu trên ảnh có ngày cụ thể hãy điền dạng YYYY-MM-DD. Nếu chỉ có Thứ, tính theo tuần hiện tại hoặc để ngày gần nhất.
- startPeriod: Tiết bắt đầu (số nguyên 1 đến 13).
- endPeriod: Tiết kết thúc (số nguyên 1 đến 13).
- room: Phòng học (VD: C201, Hội trường A, hoặc "Trực tuyến").
- teacherName: Tên giảng viên nếu có, nếu không ghi "Giảng viên bộ môn".
- scheduleType: "study" (học lý thuyết/thực hành), "exam" (nếu là lịch thi), hoặc "online" (nếu ghi học Google Meet/Zoom).

YÊU CẦU: Trả về DUY NHẤT một chuỗi JSON hợp lệ không dùng markdown code block:
[
  {
    "title": "Tên môn",
    "dayOfWeek": 2,
    "specificDate": "2026-11-09",
    "startPeriod": 1,
    "endPeriod": 3,
    "room": "C201",
    "teacherName": "ThS. Nguyễn Văn A",
    "scheduleType": "study"
  }
]`;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    };

    const textOutput = await generateContentWithFallback([prompt, imagePart], {
      responseMimeType: 'application/json',
    });

    const cleanJson = textOutput.replace(/```json|```/g, '').trim();
    let schedulesParsed = JSON.parse(cleanJson || '[]');

    if (!Array.isArray(schedulesParsed)) {
      schedulesParsed = schedulesParsed.schedules || [];
    }

    res.json({
      success: true,
      data: schedulesParsed,
      message: `Đã nhận diện thành công ${schedulesParsed.length} môn học từ ảnh!`,
    });
  } catch (error) {
    console.error("Lỗi OCR Thời khóa biểu:", error);
    res.status(500).json({ success: false, message: "Không thể phân tích ảnh: " + error.message });
  }
});

// =============================================================================
// 2. LƯU HÀNG LOẠT TIẾT HỌC SAU KHI QUÉT ẢNH OCR
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

    // Truy vấn kết hợp: Lịch chính khóa của lớp/khóa VÀ Lịch do sinh viên tự thêm (schedule_scope = 'personal')
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
// 5. THÊM / XÓA LỊCH CÁ NHÂN (Tương thích trực tiếp với ScheduleModal.jsx)
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
    // Cho phép xóa nếu đúng là lịch do user đó tạo, hoặc nếu là admin
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
// 6. CÁC API ADMIN XẾP LỊCH CHÍNH KHÓA & NẠP EXCEL (GIỮ NGUYÊN)
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
// 7. THUẬT TOÁN TỐI ƯU WRR & LỊCH TRÌNH THÍCH ỨNG
// =============================================================================
// routes/schedules.routes.js - Route OCR hỗ trợ phân tích đa ảnh TKB chuẩn xác
router.post('/ocr-parse', async (req, res) => {
  const { imageBase64, images } = req.body;
  const rawList = Array.isArray(images) && images.length > 0 ? images : (imageBase64 ? [imageBase64] : []);

  const validImages = rawList.filter(Boolean);
  if (validImages.length === 0) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ít nhất một hình ảnh thời khóa biểu!' });
  }

  try {
    const promptText = `Bạn là trợ lý AI chuyên bóc tách dữ liệu học tập từ ảnh chụp màn hình ứng dụng thời khóa biểu sinh viên.
Dưới đây là ${validImages.length} ảnh chụp màn hình lịch học/lịch thi (có thể thuộc cùng tuần hoặc nhiều tuần khác nhau).

HƯỚNG DẪN BÓC TÁCH CHI TIẾT:
1. Quan sát kỹ từng thẻ môn học trong từng ảnh:
   - Tên môn học: Nằm ngay dưới chữ "Lịch học" hoặc "Lịch thi" (Ví dụ: "Blockchain căn bản", "Phát triển ứng dụng IoT", "Sinh Hoạt Lớp").
   - Tiết học: Ví dụ "1 - 5", "6 - 10", "6 - 8", "4 - 4". Tách thành startPeriod (tiết bắt đầu) và endPeriod (tiết kết thúc).
   - Phòng học: Ví dụ "Phòng máy 4", "C401", "Phòng máy 3", "C305", "C202".
   - Giảng viên: Ví dụ "Võ Thanh Vinh", "Nguyễn Đình Tứ", "Nguyễn Thị Hồng Hạnh".
2. Xác định ngày học (specificDate & dayOfWeek):
   - Nhìn vào khối tiêu đề ngày màu xanh ngay phía trên thẻ môn học (Ví dụ: "Th 3, 03/11", "Th 4, 04/11", "Th 5, 05/11", "Th 6, 06/11", "Th 4, 11/11", "Th 5, 12/11").
   - Kết hợp với Năm hiển thị ở góc trên (Năm 2026) để tạo định dạng YYYY-MM-DD (Ví dụ: "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-11", "2026-11-12").
   - dayOfWeek: Thứ 2 là 2, Thứ 3 là 3, Thứ 4 là 4, Thứ 5 là 5, Thứ 6 là 6, Thứ 7 là 7, Chủ nhật là 8.
3. QUY TẮC KHÔNG BỎ SÓT:
   - Nếu cùng một môn học nhưng học ở 2 ngày khác nhau hoặc 2 ca khác nhau trong cùng ngày (Ví dụ: "Blockchain căn bản" học cả sáng và chiều Thứ 4), thì BẮT BUỘC coi là 2 mục học phần riêng biệt trong mảng kết quả, KHÔNG ĐƯỢC BỎ QUA.
   - Chỉ loại bỏ nếu trùng khớp 100% cả Tên môn, Ngày học VÀ Tiết học.

YÊU CẦU: Trả về DUY NHẤT một chuỗi JSON hợp lệ không bọc trong markdown code block, theo cấu trúc:
[
  {
    "title": "Tên môn học",
    "dayOfWeek": 3,
    "specificDate": "2026-11-03",
    "startPeriod": 4,
    "endPeriod": 4,
    "room": "C202",
    "teacherName": "Nguyễn Thị Hồng Hạnh",
    "scheduleType": "study"
  }
]`;

    // Chuẩn hóa cấu trúc parts đúng chuẩn Gemini SDK (1 text part + các inlineData image parts)
    const parts = [{ text: promptText }];

    for (const b64 of validImages) {
      const matches = b64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      const mimeType = matches ? matches[1] : 'image/jpeg';
      const base64Data = matches ? matches[2] : b64;

      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      });
    }

    // Gọi Gemini với toàn bộ parts của tất cả các ảnh
    const textOutput = await generateContentWithFallback(parts, {
      responseMimeType: 'application/json',
      temperature: 0.1, // Giảm temperature để trích xuất chuẩn xác tuyệt đối không bị sáng tạo
    });

    const cleanJson = textOutput.replace(/```json|```/g, '').trim();
    let schedulesParsed = JSON.parse(cleanJson || '[]');

    if (!Array.isArray(schedulesParsed)) {
      schedulesParsed = schedulesParsed.schedules || schedulesParsed.data || [];
    }

    // Lọc trùng lặp an toàn tại backend: cùng ngày, cùng tiết, cùng môn
    const uniqueMap = new Map();
    for (const item of schedulesParsed) {
      const key = `${item.title}_${item.specificDate}_${item.startPeriod}_${item.endPeriod}`;
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