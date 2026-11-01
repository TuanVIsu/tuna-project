// routes/schedules.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');
const multer = require('multer');
const xlsx = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });
const WRR_SERVICE_URL = process.env.WRR_SERVICE_URL || 'https://tuna-wrr-service.onrender.com';

// Helper trích xuất user_id nguyên số từ request
const resolveUserId = async (req) => {
  if (req.user?.id) return req.user.id;
  const rawId = String(
    req.body?.userId ||
    req.query?.userId ||
    req.headers['x-user-id'] ||
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

// Helper chuẩn hóa ngày tháng từ file Excel
const parseExcelDate = (val) => {
  if (!val) return null;
  if (typeof val === 'number') {
    // Chuyển đổi số serial của Excel sang Date JS
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
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
    return parsed.toISOString().split('T')[0];
  }
  return null;
};

// =============================================================================
// 1. LẤY DANH MỤC NGÀNH VÀ KHÓA THẬT TỪ CSDL
// =============================================================================
router.get('/admin/meta-options', authenticateToken, async (req, res) => {
  try {
    const [majorsRes, cohortsRes, classesRes] = await Promise.all([
      pool.query(`
        SELECT major_code AS "majorCode", major_name AS "majorName" 
        FROM faculty_majors 
        ORDER BY id ASC
      `),
      pool.query(`
        SELECT DISTINCT applied_cohort AS "cohortCode" 
        FROM faculty_majors 
        WHERE applied_cohort IS NOT NULL AND applied_cohort <> '' AND UPPER(applied_cohort) <> 'ALL'
      `),
      pool.query(`
        SELECT DISTINCT class_name AS "className", cohort, major_name AS "majorName"
        FROM curriculum_plans 
        WHERE class_name IS NOT NULL AND class_name <> ''
        UNION
        SELECT DISTINCT class_name AS "className", cohort, faculty_major AS "majorName"
        FROM schedules
        WHERE class_name IS NOT NULL AND class_name <> ''
        ORDER BY "className" ASC
      `)
    ]);

    res.json({
      success: true,
      data: {
        majors: majorsRes.rows.length > 0 ? majorsRes.rows : [{ majorCode: "HTTT", majorName: "Hệ Thống Thông Tin" }],
        cohorts: cohortsRes.rows.map(r => r.cohortCode).filter(Boolean),
        classes: classesRes.rows.map(r => r.className).filter(Boolean)
      }
    });
  } catch (err) {
    console.error("Lỗi lấy meta options:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 2. NẠP THỜI KHÓA BIỂU TỰ ĐỘNG TỪ EXCEL (.XLSX, .XLS)
// =============================================================================
router.post('/admin/upload-excel', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel thời khóa biểu!' });
    }

    const { targetMajor, targetCohort, targetClass } = req.body;
    if (!targetMajor || !targetCohort) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin Ngành hoặc Khóa tuyển sinh!' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    if (!rawData || rawData.length < 2) {
      return res.status(400).json({ success: false, message: 'File Excel rỗng hoặc không có dữ liệu!' });
    }

    // 1. Định vị dòng tiêu đề cột (Header row)
    let headerRowIdx = 0;
    let colMap = {
      subCode: -1,
      subName: -1,
      className: -1,
      date: -1,
      dayOfWeek: -1,
      startPeriod: -1,
      endPeriod: -1,
      periods: -1,
      room: -1,
      teacher: -1,
      type: -1,
      credits: -1,
      note: -1
    };

    for (let r = 0; r < Math.min(15, rawData.length); r++) {
      const row = rawData[r] || [];
      const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');

      if (rowStr.includes('tên học phần') || rowStr.includes('tên môn') || rowStr.includes('mã hp') || rowStr.includes('phòng')) {
        headerRowIdx = r;
        row.forEach((cell, idx) => {
          const c = String(cell || '').trim().toLowerCase();
          if (c.includes('mã hp') || c.includes('mã môn') || c === 'ma_hp') colMap.subCode = idx;
          else if (c.includes('tên học phần') || c.includes('tên môn') || c.includes('học phần')) colMap.subName = idx;
          else if (c.includes('lớp') || c === 'lop' || c === 'ma_lop') colMap.className = idx;
          else if (c.includes('ngày') || c === 'date') colMap.date = idx;
          else if (c.includes('thứ') || c === 'thu') colMap.dayOfWeek = idx;
          else if (c.includes('tiết bd') || c.includes('bắt đầu')) colMap.startPeriod = idx;
          else if (c.includes('tiết kt') || c.includes('kết thúc')) colMap.endPeriod = idx;
          else if (c.includes('tiết') && colMap.startPeriod === -1) colMap.periods = idx;
          else if (c.includes('phòng') || c === 'room') colMap.room = idx;
          else if (c.includes('giảng viên') || c.includes('cbgd') || c.includes('giáo viên')) colMap.teacher = idx;
          else if (c.includes('loại') || c.includes('hình thức') || c.includes('phân loại')) colMap.type = idx;
          else if (c.includes('tín chỉ') || c.includes('số tc') || c === 'tc') colMap.credits = idx;
          else if (c.includes('ghi chú') || c === 'note') colMap.note = idx;
        });
        break;
      }
    }

    // 2. Nạp trước danh sách khung CTĐT để đối chiếu mã môn và lấy ID, số TC
    const curRes = await pool.query(
      `SELECT id, subject_code, credits FROM curriculum_plans WHERE major_name ILIKE $1`,
      [`%${targetMajor.trim()}%`]
    ).catch(() => ({ rows: [] }));

    const planCodeMap = new Map();
    curRes.rows.forEach(p => {
      if (p.subject_code) planCodeMap.set(p.subject_code.trim().toUpperCase(), p);
    });

    const parsedSchedules = [];

    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || row.length === 0) continue;

      const rawSubCode = colMap.subCode !== -1 ? String(row[colMap.subCode] || '').trim() : '';
      const rawSubName = colMap.subName !== -1 ? String(row[colMap.subName] || '').trim() : '';

      if (!rawSubName && !rawSubCode) continue;

      // Xử lý ngày diễn ra
      let specificDate = colMap.date !== -1 ? parseExcelDate(row[colMap.date]) : null;

      // Xử lý Thứ trong tuần (2 - 8)
      let dayOfWeek = null;
      if (specificDate) {
        const dObj = new Date(specificDate);
        const jsDay = dObj.getDay();
        dayOfWeek = jsDay === 0 ? 8 : jsDay + 1;
      } else if (colMap.dayOfWeek !== -1) {
        const dowRaw = String(row[colMap.dayOfWeek] || '').replace(/\D/g, '');
        const dowNum = parseInt(dowRaw, 10);
        if (dowNum >= 2 && dowNum <= 8) dayOfWeek = dowNum;
      }

      // Xử lý tiết học
      let startP = 1;
      let endP = 3;

      if (colMap.startPeriod !== -1 && row[colMap.startPeriod] !== undefined) {
        startP = parseInt(String(row[colMap.startPeriod]).replace(/\D/g, ''), 10) || 1;
      }
      if (colMap.endPeriod !== -1 && row[colMap.endPeriod] !== undefined) {
        endP = parseInt(String(row[colMap.endPeriod]).replace(/\D/g, ''), 10) || (startP + 2);
      }

      if (colMap.periods !== -1 && colMap.startPeriod === -1 && row[colMap.periods]) {
        const periodMatch = String(row[colMap.periods]).match(/(\d+)\s*[-–—tođến]+\s*(\d+)/);
        if (periodMatch) {
          startP = parseInt(periodMatch[1], 10);
          endP = parseInt(periodMatch[2], 10);
        }
      }

      if (startP > endP) {
        const temp = startP;
        startP = endP;
        endP = temp;
      }

      // Phân loại lịch học
      let scheduleType = 'study';
      const rawType = colMap.type !== -1 ? String(row[colMap.type] || '').toLowerCase() : '';
      if (rawType.includes('thi') || rawType.includes('exam')) scheduleType = 'exam';
      else if (rawType.includes('thực hành') || rawType.includes('lab') || rawType.includes('practice')) scheduleType = 'practice';

      // Phòng & Giảng viên
      const room = colMap.room !== -1 ? String(row[colMap.room] || 'C201').trim() : 'C201';
      const teacher = colMap.teacher !== -1 ? String(row[colMap.teacher] || 'Giảng viên').trim() : 'Giảng viên';
      const note = colMap.note !== -1 ? String(row[colMap.note] || '').trim() : null;

      // Lớp
      let rowClass = colMap.className !== -1 ? String(row[colMap.className] || '').trim() : '';
      if (targetClass && targetClass !== 'all') rowClass = targetClass;

      // Tự động tìm thông tin trong CTĐT
      const matchedPlan = planCodeMap.get(rawSubCode.toUpperCase());
      const curPlanId = matchedPlan ? matchedPlan.id : null;
      let credits = matchedPlan ? matchedPlan.credits : 3;
      if (colMap.credits !== -1 && row[colMap.credits]) {
        const cNum = parseInt(row[colMap.credits], 10);
        if (!isNaN(cNum)) credits = cNum;
      }

      parsedSchedules.push({
        facultyMajor: targetMajor.trim(),
        cohort: targetCohort.trim(),
        className: rowClass || null,
        curriculumPlanId: curPlanId,
        credits,
        subjectCode: rawSubCode || null,
        title: rawSubName || rawSubCode,
        scheduleType,
        dayOfWeek: dayOfWeek || 2,
        specificDate: specificDate || new Date().toISOString().split('T')[0],
        startPeriod: startP,
        endPeriod: endP,
        room,
        teacherName: teacher,
        note
      });
    }

    if (parsedSchedules.length === 0) {
      return res.status(400).json({ success: false, message: 'Không thể bóc tách được tiết học nào từ file Excel!' });
    }

    // 3. Thực thi lưu hàng loạt vào cơ sở dữ liệu
    for (const s of parsedSchedules) {
      await pool.query(
        `INSERT INTO schedules 
          (schedule_scope, faculty_major, cohort, class_name, curriculum_plan_id, credits, 
           subject_code, title, schedule_type, day_of_week, specific_date, 
           start_period, end_period, room, teacher_name, note)
         VALUES ('academic', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          s.facultyMajor, s.cohort, s.className, s.curriculumPlanId, s.credits,
          s.subjectCode, s.title, s.scheduleType, s.dayOfWeek, s.specificDate,
          s.startPeriod, s.endPeriod, s.room, s.teacherName, s.note
        ]
      );
    }

    res.json({
      success: true,
      message: `Đã nạp thành công ${parsedSchedules.length} tiết học/lịch thi cho ${targetMajor} (${targetCohort})!`
    });
  } catch (err) {
    console.error("Lỗi nạp Excel thời khóa biểu:", err);
    res.status(500).json({ success: false, message: 'Lỗi xử lý file: ' + err.message });
  }
});

// =============================================================================
// 3. GỢI Ý TỰ ĐỘNG HỌC PHẦN TỪ KHUNG CTĐT CHO THỜI KHÓA BIỂU
// =============================================================================
router.get('/available-subjects', authenticateToken, async (req, res) => {
  try {
    const { className, semesterIndex } = req.query;

    if (!className || !semesterIndex) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp className và semesterIndex',
      });
    }

    const query = `
      SELECT 
        cp.id AS curriculum_plan_id,
        cp.subject_code,
        cp.subject_name,
        cp.credits,
        cp.credits_structure,
        cp.subject_type,
        cp.prerequisite,
        EXISTS (
          SELECT 1 FROM schedules sch 
          WHERE sch.schedule_scope = 'academic'
            AND sch.class_name = cp.class_name 
            AND sch.subject_code = cp.subject_code
        ) AS is_scheduled
      FROM curriculum_plans cp
      WHERE cp.class_name = $1 AND cp.semester_index = $2
      ORDER BY cp.subject_type DESC, cp.subject_code ASC;
    `;

    const result = await pool.query(query, [className.trim(), parseInt(semesterIndex, 10)]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 4. QUẢN TRỊ THỜI KHÓA BIỂU ADMIN (LIST, CREATE, UPDATE, DELETE)
// =============================================================================
router.get('/admin/list', authenticateToken, async (req, res) => {
  const { major, cohort, type, className } = req.query;
  try {
    let query = `
      SELECT id, faculty_major AS "facultyMajor", cohort, class_name AS "className",
             curriculum_plan_id AS "curriculumPlanId", credits,
             subject_code AS "subjectCode", title AS "subjectName",
             schedule_type AS "scheduleType", day_of_week AS "dayOfWeek",
             TO_CHAR(specific_date, 'YYYY-MM-DD') AS "specificDate",
             start_period AS "startPeriod", end_period AS "endPeriod",
             room, teacher_name AS "teacherName", note,
             TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
      FROM schedules
      WHERE schedule_scope = 'academic'
    `;
    const params = [];

    if (major && major !== 'all') {
      params.push(major);
      query += ` AND faculty_major = $${params.length}`;
    }
    if (cohort && cohort !== 'all') {
      const shortCohort = cohort.replace(/[^0-9]/g, '').slice(-2);
      params.push(`%${shortCohort}%`);
      query += ` AND cohort ILIKE $${params.length}`;
    }
    if (className && className !== 'all') {
      params.push(className);
      query += ` AND class_name = $${params.length}`;
    }
    if (type && type !== 'all') {
      params.push(type);
      query += ` AND schedule_type = $${params.length}`;
    }

    query += ` ORDER BY day_of_week ASC NULLS LAST, specific_date ASC NULLS LAST, start_period ASC`;
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/admin/create', authenticateToken, async (req, res) => {
  const {
    facultyMajor,
    cohort,
    className,
    curriculumPlanId,
    credits,
    subjectCode,
    subjectName,
    scheduleType,
    specificDate,
    startPeriod,
    endPeriod,
    room,
    teacherName,
    note,
  } = req.body;

  try {
    const finalClassName = className || null;
    const finalSubjectName = (subjectName || '').trim();
    const finalSubjectCode = (subjectCode || '').trim() || null;
    const finalStartPeriod = Number(startPeriod);
    const finalEndPeriod = Number(endPeriod);
    const finalRoom = (room || '').trim();
    const finalTeacher = (teacherName || req.user?.full_name || 'Giảng viên').trim();
    const finalScheduleType = scheduleType || 'study';
    const finalPlanId = curriculumPlanId ? Number(curriculumPlanId) : null;
    const finalCredits = Number(credits) || 3;
    const finalMajor = facultyMajor || 'Hệ Thống Thông Tin';
    const finalCohort = cohort || 'K23';

    if (!finalSubjectName || !finalRoom || !specificDate || isNaN(finalStartPeriod) || isNaN(finalEndPeriod)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vui lòng điền đủ: Tên môn, Ngày diễn ra, Phòng học và Tiết học!' 
      });
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
        finalMajor, finalCohort, finalClassName, finalPlanId, finalCredits,
        finalSubjectCode, finalSubjectName, finalScheduleType, computedDayOfWeek, specificDate,
        finalStartPeriod, finalEndPeriod, finalRoom, finalTeacher, note || null,
      ]
    );

    res.json({ success: true, message: 'Đã lưu lịch vào hệ thống!', id: insertRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/admin/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const {
    facultyMajor,
    cohort,
    className,
    curriculumPlanId,
    credits,
    subjectCode,
    subjectName,
    scheduleType,
    dayOfWeek,
    specificDate,
    startPeriod,
    endPeriod,
    room,
    teacherName,
    note,
  } = req.body;

  try {
    await pool.query(
      `UPDATE schedules
       SET faculty_major = $1, cohort = $2, class_name = $3, curriculum_plan_id = $4,
           credits = $5, subject_code = $6, title = $7, schedule_type = $8,
           day_of_week = $9, specific_date = $10, start_period = $11, end_period = $12,
           room = $13, teacher_name = $14, note = $15
       WHERE id = $16 AND schedule_scope = 'academic'`,
      [
        facultyMajor,
        cohort,
        className?.trim() || null,
        curriculumPlanId ? Number(curriculumPlanId) : null,
        Number(credits) || 3,
        subjectCode?.trim() || null,
        subjectName.trim(),
        scheduleType || 'study',
        dayOfWeek ? Number(dayOfWeek) : null,
        specificDate || null,
        Number(startPeriod),
        Number(endPeriod),
        room.trim(),
        teacherName?.trim() || 'Giảng viên',
        note?.trim() || null,
        id,
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
// 5. LẤY LỊCH HỌC SINH VIÊN (KIỂM TRA DUYỆT TỪ USERS)
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

    let scheduleQuery = `
      SELECT 
        id,
        title,
        TO_CHAR(specific_date, 'YYYY-MM-DD') AS date,
        'Tiết ' || start_period || ' - ' || end_period AS time,
        room,
        teacher_name AS teacher,
        CASE 
          WHEN room ILIKE '%truc tuyen%' THEN 'Lịch trực tuyến'
          WHEN schedule_type = 'exam' THEN 'Lịch thi'
          ELSE 'Lịch học'
        END AS category
      FROM schedules
      WHERE schedule_scope = 'academic'
        AND faculty_major = $1 
        AND (cohort = $2 OR cohort IS NULL OR cohort = '')
        AND ($3::text IS NULL OR class_name IS NULL OR class_name = '' OR class_name = $3)
        AND specific_date IS NOT NULL
    `;
    const scheduleParams = [facultyMajor, cohort, className || null];

    if (month && year) {
      scheduleParams.push(Number(month), Number(year));
      scheduleQuery += ` AND EXTRACT(MONTH FROM specific_date) = $${scheduleParams.length - 1} AND EXTRACT(YEAR FROM specific_date) = $${scheduleParams.length}`;
    }

    scheduleQuery += ` ORDER BY specific_date ASC, start_period ASC`;

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

module.exports = router;