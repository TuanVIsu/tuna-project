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
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
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

// Helper tính Semester Index từ text (VD: "Học kỳ 1 (2025-2026)" -> 1)
const parseSemesterFromText = (text, baseYear = 2025, spy = 3) => {
  if (!text) return null;
  const str = String(text).trim();
  const mYear = str.match(/(\d{4})-\d{4}/);
  const mSem = str.match(/(?:Học kỳ|Kỳ|HK)\s*(\d+)/i);
  if (mSem) {
    const s = parseInt(mSem[1], 10);
    if (mYear) {
      const startY = parseInt(mYear[1], 10);
      const diffY = Math.max(0, startY - baseYear);
      return diffY * spy + s;
    }
    return s;
  }
  return null;
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
      message: `Ngành "${major.major_name}" trong hệ thống hiện chỉ áp dụng cho "${major.applied_cohort}". Khóa "${cohort}" chưa được thiết lập bên Quản Lý Ngành!` 
    };
  }

  return { valid: true, major };
};

// =============================================================================
// 1. LẤY DANH MỤC NGÀNH VÀ KHÓA CHUẨN TỪ FACULTY_MAJORS (KHÔNG LẤY TỪ SCHEDULES)
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
// 2. GỢI Ý MÔN HỌC TỪ KHUNG CTĐT CHO FORM XẾP LỊCH
// =============================================================================
router.get('/available-subjects', authenticateToken, async (req, res) => {
  try {
    const { major, cohort, className, semesterIndex } = req.query;

    if (!major || !semesterIndex) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin ngành hoặc học kỳ!' });
    }

    let query = `
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
            AND sch.curriculum_plan_id = cp.id
            AND ($3::text IS NULL OR sch.class_name = $3)
        ) AS is_scheduled
      FROM curriculum_plans cp
      WHERE cp.major_name ILIKE $1 
        AND cp.semester_index = $2
    `;
    const params = [
      `%${major.trim()}%`, 
      parseInt(semesterIndex, 10), 
      className && className !== 'all' ? className.trim() : null
    ];

    if (cohort && cohort !== 'all') {
      const shortCohort = cohort.replace(/\D/g, '').slice(-2);
      params.push(`%${shortCohort}%`);
      query += ` AND cp.cohort ILIKE $${params.length}`;
    }

    query += ` ORDER BY cp.subject_type DESC, cp.subject_code ASC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 3. THÊM TIẾT HỌC THỦ CÔNG (RÀNG BUỘC CHẶT VỚI CTĐT & BẢNG QUẢN LÝ NGÀNH)
// =============================================================================
router.post('/admin/create', authenticateToken, async (req, res) => {
  const {
    facultyMajor,
    cohort,
    className,
    curriculumPlanId,
    scheduleType,
    specificDate,
    startPeriod,
    endPeriod,
    room,
    teacherName,
    note,
    subjectCode,
    subjectName,
    credits
  } = req.body;

  try {
    // 1. Kiểm tra khóa hợp lệ từ bảng Quản Lý Ngành
    const checkCohort = await validateMajorAndCohort(facultyMajor, cohort);
    if (!checkCohort.valid) {
      return res.status(400).json({ success: false, message: checkCohort.message });
    }

    let finalSubjectCode = subjectCode?.trim() || null;
    let finalSubjectName = subjectName?.trim() || '';
    let finalCredits = Number(credits) || 3;
    let finalPlanId = curriculumPlanId ? Number(curriculumPlanId) : null;

    // 2. Kế thừa thông tin từ Khung CTĐT để đảm bảo khớp 100%
    if (finalPlanId) {
      const planRes = await pool.query(
        `SELECT subject_code, subject_name, credits FROM curriculum_plans WHERE id = $1`,
        [finalPlanId]
      );
      if (planRes.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Học phần không tồn tại trong Khung CTĐT!' });
      }
      finalSubjectCode = planRes.rows[0].subject_code;
      finalSubjectName = planRes.rows[0].subject_name;
      finalCredits = planRes.rows[0].credits;
    }

    if (!finalSubjectName || !room || !specificDate || !startPeriod || !endPeriod) {
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
        facultyMajor.trim(), 
        cohort.trim(), 
        className || null, 
        finalPlanId, 
        finalCredits,
        finalSubjectCode, 
        finalSubjectName, 
        scheduleType || 'study', 
        computedDayOfWeek, 
        specificDate,
        Number(startPeriod), 
        Number(endPeriod), 
        room.trim(), 
        teacherName?.trim() || 'Giảng viên', 
        note || null,
      ]
    );

    res.json({ success: true, message: 'Đã lưu lịch vào hệ thống!', id: insertRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 4. NẠP FILE EXCEL TKB (CHẶN KHÓA CHƯA ĐĂNG KÝ & TỰ ĐỘNG KHỚP VỚI KHUNG CTĐT)
// =============================================================================
router.post('/admin/upload-excel', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel thời khóa biểu!' });
    }

    const { targetMajor, targetCohort, targetClass, isOverwrite } = req.body;

    // 1. Kiểm tra khóa tuyển sinh có thuộc ngành hay không
    const checkCohort = await validateMajorAndCohort(targetMajor, targetCohort);
    if (!checkCohort.valid) {
      return res.status(400).json({ success: false, message: checkCohort.message });
    }

    const cleanCohort = targetCohort.replace(/[^0-9]/g, '').slice(-2);
    const className = targetClass && targetClass !== 'all' ? targetClass.trim() : null;

    // 2. Kiểm tra dữ liệu cũ để xác nhận ghi đè
    let checkQuery = `
      SELECT COUNT(*) as count 
      FROM schedules 
      WHERE schedule_scope = 'academic' 
        AND faculty_major ILIKE $1 
        AND (cohort ILIKE $2 OR cohort ILIKE '%' || $3 || '%')
    `;
    let checkParams = [targetMajor.trim(), targetCohort.trim(), cleanCohort];

    if (className) {
      checkQuery += ` AND class_name = $4`;
      checkParams.push(className);
    }

    const checkRes = await pool.query(checkQuery, checkParams);
    const existingCount = parseInt(checkRes.rows[0]?.count || 0, 10);

    if (existingCount > 0 && String(isOverwrite) !== 'true') {
      return res.status(409).json({
        success: false,
        requireConfirmation: true,
        existingCount,
        message: `Hệ thống đã có ${existingCount} tiết học của ngành ${targetMajor} (${targetCohort}${className ? ` - ${className}` : ''}).\n\nBạn có muốn XÓA DỮ LIỆU CŨ và cập nhật lại thời khóa biểu mới không?`
      });
    }

    if (String(isOverwrite) === 'true' && existingCount > 0) {
      let delQuery = `
        DELETE FROM schedules 
        WHERE schedule_scope = 'academic' 
          AND faculty_major ILIKE $1 
          AND (cohort ILIKE $2 OR cohort ILIKE '%' || $3 || '%')
      `;
      let delParams = [targetMajor.trim(), targetCohort.trim(), cleanCohort];
      if (className) {
        delQuery += ` AND class_name = $4`;
        delParams.push(className);
      }
      await pool.query(delQuery, delParams);
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    if (!rawData || rawData.length < 2) {
      return res.status(400).json({ success: false, message: 'File Excel rỗng hoặc không có dữ liệu!' });
    }

    // 3. Đọc toàn bộ khung CTĐT của ngành và khóa tương ứng
    const curRes = await pool.query(
      `SELECT id, subject_code, subject_name, semester_index, credits 
       FROM curriculum_plans 
       WHERE major_name ILIKE $1 AND cohort ILIKE $2`,
      [`%${targetMajor.trim()}%`, `%${cleanCohort}%`]
    ).catch(() => ({ rows: [] }));

    const planMap = new Map();
    curRes.rows.forEach(p => {
      if (p.subject_code) planMap.set(p.subject_code.trim().toUpperCase(), p);
    });

    const majorCfg = await pool.query(
      `SELECT COALESCE(semesters_per_year, 3) as spy FROM faculty_majors WHERE major_name ILIKE $1 LIMIT 1`,
      [`%${targetMajor.trim()}%`]
    ).catch(() => ({ rows: [] }));
    const spy = majorCfg.rows[0]?.spy || 3;

    const baseYear = parseInt(targetCohort.replace(/\D/g, ''), 10) || 2025;

    // 4. Nhận diện tiêu đề cột
    let headerRowIdx = 0;
    let colMap = {
      sem: -1,
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

      if (rowStr.includes('mã hp') || rowStr.includes('tên hp') || rowStr.includes('học phần') || rowStr.includes('phòng')) {
        headerRowIdx = r;
        row.forEach((cell, idx) => {
          const c = String(cell || '').trim().toLowerCase();
          if (c.includes('học kỳ') || c.includes('hoc ky') || c === 'hk') colMap.sem = idx;
          else if (c.includes('mã hp') || c.includes('mã môn') || c === 'ma_hp' || c === 'code') colMap.subCode = idx;
          else if (c.includes('tên hp') || c.includes('ten hp') || c.includes('tên học phần') || c.includes('tên môn') || c.includes('học phần')) colMap.subName = idx;
          else if (c.includes('mã lớp') || c.includes('lớp') || c === 'lop') colMap.className = idx;
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

    const parsedSchedules = [];

    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || row.length === 0) continue;

      const rawSubCode = colMap.subCode !== -1 ? String(row[colMap.subCode] || '').trim() : '';
      const rawSubName = colMap.subName !== -1 ? String(row[colMap.subName] || '').trim() : '';
      if (!rawSubName && !rawSubCode) continue;

      let calculatedSemIdx = null;
      if (colMap.sem !== -1 && row[colMap.sem]) {
        calculatedSemIdx = parseSemesterFromText(row[colMap.sem], baseYear > 2000 ? baseYear : baseYear + 2000, spy);
      }

      // ĐỒNG BỘ: Kế thừa thông tin từ curriculum_plans để không bị lệch với Khung CTĐT
      const matchedPlan = planMap.get(rawSubCode.toUpperCase()) || 
                          curRes.rows.find(p => p.subject_name?.trim().toLowerCase() === rawSubName.toLowerCase());

      const curPlanId = matchedPlan ? matchedPlan.id : null;
      const finalTitle = matchedPlan ? matchedPlan.subject_name : rawSubName;
      const finalCode = matchedPlan ? matchedPlan.subject_code : (rawSubCode || null);
      let credits = matchedPlan ? matchedPlan.credits : 3;

      if (!matchedPlan && colMap.credits !== -1 && row[colMap.credits]) {
        const cNum = parseInt(row[colMap.credits], 10);
        if (!isNaN(cNum) && cNum > 0) credits = cNum;
      }

      let specificDate = colMap.date !== -1 ? parseExcelDate(row[colMap.date]) : null;
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
        const temp = startP; startP = endP; endP = temp;
      }

      let scheduleType = 'study';
      const rawType = colMap.type !== -1 ? String(row[colMap.type] || '').toLowerCase() : '';
      if (rawType.includes('thi') || rawType.includes('exam')) scheduleType = 'exam';
      else if (rawType.includes('thực hành') || rawType.includes('lab') || rawType.includes('practice')) scheduleType = 'practice';

      const room = colMap.room !== -1 ? String(row[colMap.room] || 'C201').trim() : 'C201';
      const teacher = colMap.teacher !== -1 ? String(row[colMap.teacher] || 'Giảng viên').trim() : 'Giảng viên';

      let note = colMap.note !== -1 ? String(row[colMap.note] || '').trim() : null;
      if (!curPlanId && calculatedSemIdx) {
        note = note ? `[HK${calculatedSemIdx}] ${note}` : `[HK${calculatedSemIdx}]`;
      }

      let rowClass = colMap.className !== -1 ? String(row[colMap.className] || '').trim() : '';
      if (className) rowClass = className;

      parsedSchedules.push({
        facultyMajor: targetMajor.trim(),
        cohort: targetCohort.trim(),
        className: rowClass || null,
        curriculumPlanId: curPlanId,
        credits,
        subjectCode: finalCode,
        title: finalTitle,
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
      message: `Đã nạp thành công ${parsedSchedules.length} tiết học đồng bộ chính xác với Khung CTĐT của ${targetMajor} (${targetCohort})!`
    });
  } catch (err) {
    console.error("Lỗi nạp Excel thời khóa biểu:", err);
    res.status(500).json({ success: false, message: 'Lỗi xử lý file: ' + err.message });
  }
});

// =============================================================================
// 5. DANH SÁCH THỜI KHÓA BIỂU ADMIN (KẾ THỪA THÔNG TIN TỪ CURRICULUM_PLANS)
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
    console.error("Lỗi GET /admin/list:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/admin/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const {
    room,
    teacherName,
    note,
    startPeriod,
    endPeriod,
    scheduleType,
    specificDate,
    dayOfWeek
  } = req.body;

  try {
    let computedDow = dayOfWeek ? Number(dayOfWeek) : null;
    if (specificDate && !computedDow) {
      const dObj = new Date(specificDate);
      const jsDay = dObj.getDay();
      computedDow = jsDay === 0 ? 8 : jsDay + 1;
    }

    await pool.query(
      `UPDATE schedules
       SET room = $1, 
           teacher_name = $2, 
           note = $3, 
           start_period = $4, 
           end_period = $5, 
           schedule_type = $6, 
           specific_date = $7,
           day_of_week = COALESCE($8, day_of_week)
       WHERE id = $9 AND schedule_scope = 'academic'`,
      [
        room?.trim(),
        teacherName?.trim() || 'Giảng viên',
        note?.trim() || null,
        Number(startPeriod),
        Number(endPeriod),
        scheduleType || 'study',
        specificDate || null,
        computedDow,
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
// 6. LẤY LỊCH HỌC CHO PHÍA SINH VIÊN (ZALO MINI APP / WEB APP)
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
        sch.id,
        COALESCE(cp.subject_name, sch.title) AS title,
        TO_CHAR(sch.specific_date, 'YYYY-MM-DD') AS date,
        'Tiết ' || sch.start_period || ' - ' || sch.end_period AS time,
        sch.room,
        sch.teacher_name AS teacher,
        CASE 
          WHEN sch.room ILIKE '%truc tuyen%' THEN 'Lịch trực tuyến'
          WHEN sch.schedule_type = 'exam' THEN 'Lịch thi'
          ELSE 'Lịch học'
        END AS category
      FROM schedules sch
      LEFT JOIN curriculum_plans cp ON sch.curriculum_plan_id = cp.id
      WHERE sch.schedule_scope = 'academic'
        AND sch.faculty_major ILIKE $1 
        AND (sch.cohort ILIKE $2 OR sch.cohort IS NULL OR sch.cohort = '' OR sch.cohort ILIKE '%' || $3 || '%')
        AND ($4::text IS NULL OR sch.class_name IS NULL OR sch.class_name = '' OR sch.class_name = $4)
        AND sch.specific_date IS NOT NULL
    `;
    const cleanCohort = cohort.replace(/\D/g, '');
    const scheduleParams = [facultyMajor, cohort, cleanCohort, className || null];

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
// 7. MÔN HỌC KHUNG CHƯƠNG TRÌNH ĐÀO TẠO
// =============================================================================
router.get(['/curriculum', '/curriculum-subjects', '/curriculum/subjects'], async (req, res) => {
  const { major } = req.query;
  try {
    let query = `
      SELECT subject_name AS "subjectName", credits, difficulty_base AS "difficultyBase"
      FROM curriculum_plans
      WHERE 1=1
    `;
    const params = [];

    if (major && major !== 'all') {
      params.push(`%${major}%`);
      query += ` AND major_name ILIKE $${params.length}`;
    }

    query += ` ORDER BY id ASC`;
    const { rows } = await pool.query(query, params).catch(() => ({ rows: [] }));
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 8. LỘ TRÌNH THÍCH ỨNG & THỜI KHÓA BIỂU CÁ NHÂN
// =============================================================================
router.get(['/timelines', '/api/timelines'], async (req, res) => {
  const userId = await resolveUserId(req);
  const { startDate, endDate } = req.query;
  if (!userId) return res.json({ success: true, data: [] });

  try {
    let query = `
      SELECT id, subject, goal_level AS "goalLevel", 
             TO_CHAR(timeline_date, 'YYYY-MM-DD') AS "timelineDate",
             time_slot AS "timeSlot", task_type AS "taskType",
             title, description, duration_minutes AS "durationMinutes",
             is_completed AS "isCompleted", action_target AS "actionTarget"
      FROM learning_timelines
      WHERE user_id = $1
    `;
    const params = [userId];

    if (startDate && endDate) {
      params.push(startDate, endDate);
      query += ` AND timeline_date BETWEEN $2 AND $3`;
    }

    query += ` ORDER BY timeline_date ASC, time_slot ASC`;
    const { rows } = await pool.query(query, params).catch(() => ({ rows: [] }));
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error("Lỗi lấy timeline:", err.message);
    res.json({ success: true, data: [] });
  }
});

router.post(['/timelines', '/api/timelines'], async (req, res) => {
  const userId = await resolveUserId(req);
  const { timelineDate, timeSlot, taskType, title, description, durationMinutes, subject, goalLevel, actionTarget } = req.body;
  if (!userId) return res.status(401).json({ success: false, message: 'Cần đăng nhập' });

  try {
    const finalDate = timelineDate || new Date().toISOString().slice(0, 10);
    const finalTarget = actionTarget || (taskType === 'doc_study' ? 'docs' : 'tasks');

    const insertRes = await pool.query(
      `INSERT INTO learning_timelines 
        (user_id, subject, goal_level, timeline_date, time_slot, task_type, title, description, duration_minutes, is_completed, action_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)
       RETURNING id, subject, goal_level AS "goalLevel", TO_CHAR(timeline_date, 'YYYY-MM-DD') AS "timelineDate",
                 time_slot AS "timeSlot", task_type AS "taskType", title, description,
                 duration_minutes AS "durationMinutes", is_completed AS "isCompleted", action_target AS "actionTarget"`,
      [
        userId, subject || 'Học phần chung', goalLevel || 'KhaGioi',
        finalDate, timeSlot || '19:30 - 20:15', taskType || 'quiz',
        title || 'Ca ôn tập mới', description || '', Number(durationMinutes) || 15,
        finalTarget
      ]
    );

    res.json({ success: true, data: insertRes.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put(['/timelines/:id', '/api/timelines/:id'], async (req, res) => {
  const { id } = req.params;
  const { title, timeSlot, taskType, description, durationMinutes, subject, isCompleted } = req.body;

  try {
    const updateRes = await pool.query(
      `UPDATE learning_timelines
       SET title = COALESCE($1, title),
           time_slot = COALESCE($2, time_slot),
           task_type = COALESCE($3, task_type),
           description = COALESCE($4, description),
           duration_minutes = COALESCE($5, duration_minutes),
           subject = COALESCE($6, subject),
           is_completed = COALESCE($7, is_completed),
           action_target = CASE WHEN $3 = 'doc_study' THEN 'docs' ELSE 'tasks' END
       WHERE id = $8
       RETURNING id, subject, goal_level AS "goalLevel", TO_CHAR(timeline_date, 'YYYY-MM-DD') AS "timelineDate",
                 time_slot AS "timeSlot", task_type AS "taskType", title, description,
                 duration_minutes AS "durationMinutes", is_completed AS "isCompleted", action_target AS "actionTarget"`,
      [title, timeSlot, taskType, description, durationMinutes, subject, isCompleted, id]
    );

    res.json({ success: true, data: updateRes.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete(['/timelines/:id', '/api/timelines/:id'], async (req, res) => {
  try {
    await pool.query(`DELETE FROM learning_timelines WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Đã xóa mục khỏi lịch trình!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post(['/generate-wrr-plan', '/timelines/generate-wrr-plan'], async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Cần đăng nhập' });

  const {
    facultyMajor = 'Hệ Thống Thông Tin',
    subjects = [],
    subjectLevels = {},
    goalLevel = 'KhaGioi',
    currentGpa = 3.0,
    dailyPace = 15,
    startDate,
  } = req.body;

  const pace = Number(dailyPace) || 15;

  try {
    let targetSubjects = Array.isArray(subjects) && subjects.length > 0 ? subjects : [];
    
    if (targetSubjects.length === 0) {
      const planRes = await pool.query(
        `SELECT DISTINCT subject_name FROM curriculum_plans 
         WHERE major_name ILIKE $1 LIMIT 4`,
        [`%${facultyMajor}%`]
      ).catch(() => ({ rows: [] }));

      if (planRes.rows.length > 0) {
        targetSubjects = planRes.rows.map((r) => r.subject_name);
      } else {
        targetSubjects = ['Cơ sở dữ liệu', 'Phân tích và thiết kế HTTT'];
      }
    }

    const payloadSubjects = [];

    for (const sub of targetSubjects) {
      const subInfo = await pool.query(
        `SELECT credits FROM curriculum_plans WHERE subject_name ILIKE $1 LIMIT 1`,
        [`%${sub}%`]
      ).catch(() => ({ rows: [] }));
      const credits = subInfo.rows[0]?.credits || 3;

      const quizRes = await pool.query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_correct = true) as correct
         FROM quiz_answer_attempts WHERE user_id = $1 AND subject ILIKE $2`,
        [userId, `%${sub}%`]
      ).catch(() => ({ rows: [{ total: 0, correct: 0 }] }));

      const examRes = await pool.query(
        `SELECT 1 FROM schedules 
         WHERE schedule_scope = 'academic' AND schedule_type = 'exam'
           AND title ILIKE $1
           AND specific_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
         LIMIT 1`,
        [`%${sub}%`]
      ).catch(() => ({ rows: [] }));

      payloadSubjects.push({
        subject_name: sub,
        credits: credits,
        quiz_total: Number(quizRes.rows[0]?.total || 0),
        quiz_correct: Number(quizRes.rows[0]?.correct || 0),
        is_near_exam: examRes.rows.length > 0,
        user_level: subjectLevels[sub] || 'medium',
      });
    }

    let pyData;
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
          current_gpa: Number(currentGpa) || 3.0,
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (pyResponse.ok) {
        pyData = await pyResponse.json();
      }
    } catch (e) {
      pyData = {
        success: true,
        weights: payloadSubjects.map((s) => ({ subject: s.subject_name, weight: 1.0 })),
        slots_per_day: 2,
        schedule_plan: Array(28).fill(null).map((_, dIdx) => [
          { subject: payloadSubjects[dIdx % payloadSubjects.length]?.subject_name, task_type: 'doc_study', title: `Nghiên cứu giáo trình: ${payloadSubjects[dIdx % payloadSubjects.length]?.subject_name}` },
          { subject: payloadSubjects[(dIdx + 1) % payloadSubjects.length]?.subject_name, task_type: 'quiz', title: `Luyện đề trắc nghiệm: ${payloadSubjects[(dIdx + 1) % payloadSubjects.length]?.subject_name}` },
        ]),
      };
    }

    for (const w of (pyData?.weights || [])) {
      await pool.query(
        `INSERT INTO subject_learning_weights 
         (user_id, subject_name, calculated_weight, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, subject_name)
         DO UPDATE SET calculated_weight = EXCLUDED.calculated_weight, updated_at = CURRENT_TIMESTAMP`,
        [userId, w.subject, w.weight]
      ).catch(() => {});
    }

    await pool.query(`DELETE FROM learning_timelines WHERE user_id = $1`, [userId]).catch(() => {});
    const insertedRows = [];

    let startYear, startMonth, startDay;
    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      const parts = startDate.split('-').map(Number);
      startYear = parts[0];
      startMonth = parts[1] - 1;
      startDay = parts[2];
    } else {
      const now = new Date();
      startYear = now.getFullYear();
      startMonth = now.getMonth();
      startDay = now.getDate();
    }

    for (let dayIdx = 0; dayIdx < (pyData?.schedule_plan?.length || 0); dayIdx++) {
      const curDate = new Date(startYear, startMonth, startDay + dayIdx);
      const yStr = curDate.getFullYear();
      const mStr = String(curDate.getMonth() + 1).padStart(2, '0');
      const dStr = String(curDate.getDate()).padStart(2, '0');
      const dateStr = `${yStr}-${mStr}-${dStr}`;

      const dayTasks = pyData.schedule_plan[dayIdx] || [];
      const availableTimeSlots = ['07:45 - 08:30', '12:00 - 12:45', '18:30 - 19:15', '20:00 - 20:45'];

      for (let taskIdx = 0; taskIdx < dayTasks.length; taskIdx++) {
        const task = dayTasks[taskIdx];
        const assignedTimeSlot = availableTimeSlots[taskIdx % availableTimeSlots.length];
        const matchedWeight = pyData.weights?.find((w) => w.subject === task.subject)?.weight || 1.0;

        const description =
          task.task_type === 'doc_study'
            ? `Đọc hiểu kiến thức nền tảng & slide lý thuyết (Ưu tiên: ${matchedWeight})`
            : task.task_type === 'quiz'
            ? `Thực hành làm đề trắc nghiệm vận dụng kiến thức (Ưu tiên: ${matchedWeight})`
            : `Ghi nhớ nhanh các định nghĩa & thuật ngữ cốt lõi (Ưu tiên: ${matchedWeight})`;

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
            pace,
            actionTarget,
          ]
        ).catch(() => ({ rows: [] }));

        if (insertRes.rows && insertRes.rows[0]) {
          insertedRows.push(insertRes.rows[0]);
        }
      }
    }

    res.json({
      success: true,
      algorithm: 'Smooth Weighted Round Robin (SWRR)',
      goalLevel,
      slotsPerDay: pyData.slots_per_day || 2,
      weights: pyData.weights || [],
      totalInserted: insertedRows.length,
      data: insertedRows,
    });
  } catch (err) {
    console.error('Lỗi tạo lịch WRR:', err.message);
    res.json({ success: true, data: [] });
  }
});

// =============================================================================
// 9. ĐIỂM DANH STREAK
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const lastDate = u.last_active_date ? new Date(u.last_active_date) : null;
    if (lastDate) {
      lastDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        return res.json({ success: true, streak: u, message: 'Đã điểm danh hôm nay' });
      }
    }

    let newStreak = (lastDate && Math.floor((today - lastDate) / (1000 * 60 * 60 * 24)) === 1) ? Number(u.current_streak) + 1 : 1;
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

// =============================================================================
// 10. THỜI KHÓA BIỂU CÁ NHÂN (SCHEDULE_SCOPE = 'PERSONAL')
// =============================================================================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, TO_CHAR(specific_date, 'YYYY-MM-DD') AS date, 
              time_slot AS time, room AS location, schedule_type AS category
       FROM schedules 
       WHERE schedule_scope = 'personal' AND user_id = $1 
       ORDER BY specific_date ASC, time_slot ASC`,
      [req.user.id]
    ).catch(() => ({ rows: [] }));
    res.json({ success: true, data: rows });
  } catch (error) {
    res.json({ success: true, data: [] });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  const { title, date, time, location, category } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO schedules (schedule_scope, user_id, title, specific_date, time_slot, room, schedule_type)
       VALUES ('personal', $1, $2, $3, $4, $5, 'custom') 
       RETURNING id, title, TO_CHAR(specific_date, 'YYYY-MM-DD') AS date, time_slot AS time, room AS location`,
      [req.user.id, title, date, time, location || 'Phòng học']
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM schedules WHERE id = $1 AND schedule_scope = 'personal' AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Đã xóa lịch học cá nhân' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;